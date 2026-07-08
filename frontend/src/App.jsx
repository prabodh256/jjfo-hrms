import React, { useEffect, useState, useRef } from 'react';
import {
  BrowserRouter as Router, Routes, Route, NavLink, Navigate, useNavigate, Link
} from 'react-router-dom';
import useStore from './store';
import { applyPreferences, parsePrefs, DEFAULT_PREFS } from './theme';
import { hasModule, hasCap } from './permissions';
import { onToast } from './toast';
import ErrorBoundary from './ErrorBoundary';
import Dashboard from './components/Dashboard';
import Directory from './components/Directory';
import Onboarding from './components/Onboarding';
import Leaves from './components/Leaves';
import Payroll from './components/Payroll';
import Assets from './components/Assets';
import Helpdesk from './components/Helpdesk';
import Permissions from './components/Permissions';
import GoogleSync from './components/GoogleSync';
import Settings from './components/Settings';
import AuditLog from './components/AuditLog';
import Reports from './components/Reports';
import Workflows from './components/Workflows';
import Expenses from './components/Expenses';
import Engagement from './components/Engagement';
import Policies from './components/Policies';

const NAV = [
  { to: '/', key: 'dashboard', icon: 'dashboard', label: 'Dashboard', end: true },
  { to: '/directory', key: 'directory', icon: 'people', label: 'Directory & Org' },
  { to: '/onboarding', key: 'onboarding', icon: 'how_to_reg', label: 'Onboarding' },
  { to: '/leaves', key: 'leaves', icon: 'event_note', label: 'Leave & Attendance' },
  { to: '/payroll', key: 'payroll', icon: 'payments', label: 'Payroll & Tax' },
  { to: '/expenses', key: 'expenses', icon: 'receipt_long', label: 'Expenses' },
  { to: '/engagement', key: 'engagement', icon: 'volunteer_activism', label: 'Engagement' },
  { to: '/policies', key: 'policies', icon: 'policy', label: 'Policies' },
  { to: '/assets', key: 'assets', icon: 'devices', label: 'Asset Inventory' },
  { to: '/helpdesk', key: 'helpdesk', icon: 'support_agent', label: 'HR Helpdesk' },
  { to: '/workflows', key: 'onboarding', icon: 'assignment', label: 'HR Workflows' },
  { to: '/permissions', key: 'permissions', icon: 'admin_panel_settings', label: 'Permissions', capAlt: 'createUsers' },
  { to: '/gsync', key: 'gsync', icon: 'cloud_sync', label: 'Document Vault' },
  { to: '/reports', key: 'reports', icon: 'insights', label: 'Reports' },
  { to: '/audit', key: 'audit', icon: 'fact_check', label: 'Audit Log' },
  { to: '/settings', key: 'settings', icon: 'settings', label: 'Settings' }
];

const canSee = (user, item) =>
  hasModule(user, item.key) ||
  (item.capAlt && hasCap(user, item.capAlt)) ||
  (item.key === 'onboarding' && user.onboardingState && user.onboardingState !== 'approved');

function Guard({ k, children }) {
  const { user } = useStore();
  const item = NAV.find((n) => n.key === k);
  if (user && item && !canSee(user, item)) return <Navigate to="/" replace />;
  return children;
}

function ToastHost() {
  const [items, setItems] = useState([]);
  useEffect(() => onToast((item) => {
    setItems((prev) => [...prev, item]);
    setTimeout(() => setItems((prev) => prev.filter((x) => x.id !== item.id)), item.ms || 3500);
  }), []);
  if (!items.length) return null;
  return (
    <div className="toast-host" aria-live="polite">
      {items.map((t) => (
        <div key={t.id} className={`toast toast-${t.type}`}>{t.message}</div>
      ))}
    </div>
  );
}

function NotificationBell() {
  const { user, notifications, fetchNotifications, markRead, markAllRead } = useStore();
  const [open, setOpen] = useState(false);
  const wrapRef = useRef(null);
  const kinds = parsePrefs(user?.preferences).notifyKinds;
  const visible = notifications.filter((n) => !kinds || n.kind === 'general' || kinds.includes(n.kind));
  const unread = visible.filter((n) => !n.read).length;

  useEffect(() => {
    fetchNotifications();
    const t = setInterval(fetchNotifications, 30000);
    return () => clearInterval(t);
  }, [fetchNotifications]);

  useEffect(() => {
    if (!open) return undefined;
    const onDoc = (e) => {
      if (wrapRef.current && !wrapRef.current.contains(e.target)) setOpen(false);
    };
    document.addEventListener('mousedown', onDoc);
    return () => document.removeEventListener('mousedown', onDoc);
  }, [open]);

  return (
    <div className="bell-wrap" ref={wrapRef}>
      <button type="button" className="bell-btn" aria-label="Notifications" aria-expanded={open} onClick={() => setOpen((v) => !v)}>
        <i className="material-icons-round">notifications</i>
        {unread > 0 && <span className="bell-count">{unread}</span>}
      </button>
      {open && (
        <div className="bell-panel glass bell-panel-fixed" role="dialog" aria-label="Notification list">
          <div className="bell-head">
            <strong>Notifications</strong>
            <div style={{ display: 'flex', gap: 8 }}>
              {unread > 0 && (
                <button type="button" className="btn btn-sm btn-secondary" onClick={markAllRead}>Mark all read</button>
              )}
              <button type="button" className="btn btn-sm btn-secondary" aria-label="Close" onClick={() => setOpen(false)}>✕</button>
            </div>
          </div>
          <div className="bell-list">
            {visible.length === 0 ? (
              <p className="bell-empty">Nothing yet.</p>
            ) : (
              visible.slice(0, 20).map((n) => (
                <div
                  key={n.id}
                  className={`bell-item ${n.read ? '' : 'unread'}`}
                  role="button"
                  tabIndex={0}
                  onClick={() => !n.read && markRead(n.id)}
                  onKeyDown={(e) => e.key === 'Enter' && !n.read && markRead(n.id)}
                >
                  <strong>{n.title}</strong>
                  <p>{n.body}</p>
                  <small>{new Date(n.at).toLocaleString()}</small>
                </div>
              ))
            )}
          </div>
        </div>
      )}
    </div>
  );
}

function ThemeToggle() {
  const { user, savePreferences, refreshMe } = useStore();
  const prefs = { ...DEFAULT_PREFS, ...parsePrefs(user?.preferences) };
  const isDark = prefs.theme !== 'light';
  const toggle = async () => {
    const next = { ...prefs, theme: isDark ? 'light' : 'dark' };
    applyPreferences(next);
    try {
      await savePreferences(next);
      if (refreshMe) await refreshMe();
    } catch { /* local theme still applied */ }
  };
  return (
    <button
      type="button"
      className="theme-toggle-btn"
      aria-label={isDark ? 'Switch to light mode' : 'Switch to dark mode'}
      title={isDark ? 'Light mode' : 'Dark mode'}
      onClick={toggle}
    >
      <i className="material-icons-round">{isDark ? 'light_mode' : 'dark_mode'}</i>
    </button>
  );
}

function GlobalSearch() {
  const { globalSearch, searchResults, clearSearch } = useStore();
  const [q, setQ] = useState('');
  const [open, setOpen] = useState(false);
  const inputRef = useRef(null);
  const timer = useRef(null);
  const navigate = useNavigate();

  useEffect(() => {
    const onKey = (e) => {
      if ((e.ctrlKey || e.metaKey) && e.key.toLowerCase() === 'k') {
        e.preventDefault();
        inputRef.current?.focus();
        setOpen(true);
      }
      if (e.key === 'Escape') {
        setOpen(false);
        clearSearch();
      }
    };
    window.addEventListener('keydown', onKey);
    return () => window.removeEventListener('keydown', onKey);
  }, [clearSearch]);

  const onChange = (val) => {
    setQ(val);
    setOpen(true);
    clearTimeout(timer.current);
    timer.current = setTimeout(() => globalSearch(val), 250);
  };

  const go = (path) => {
    setOpen(false);
    clearSearch();
    setQ('');
    navigate(path);
  };

  const hasResults = searchResults && (
    searchResults.employees?.length ||
    searchResults.tickets?.length ||
    searchResults.assets?.length
  );

  return (
    <div className="topbar-search search-wrap">
      <i className="material-icons-round">search</i>
      <input
        ref={inputRef}
        type="search"
        value={q}
        onChange={(e) => onChange(e.target.value)}
        onFocus={() => setOpen(true)}
        placeholder="Global search (Ctrl+K)..."
        aria-label="Global search"
        autoComplete="off"
      />
      {open && q.length >= 2 && (
        <div className="search-panel glass" role="listbox">
          {!hasResults && <p className="bell-empty">No matches</p>}
          {searchResults?.employees?.length > 0 && (
            <div className="search-group">
              <strong>People</strong>
              {searchResults.employees.map((e) => (
                <button type="button" key={e.id} className="search-item" onClick={() => go('/directory')}>
                  {e.name} <small>{e.department || e.id}</small>
                </button>
              ))}
            </div>
          )}
          {searchResults?.tickets?.length > 0 && (
            <div className="search-group">
              <strong>Tickets</strong>
              {searchResults.tickets.map((t) => (
                <button type="button" key={t.id} className="search-item" onClick={() => go('/helpdesk')}>
                  {t.subject} <small>{t.status}</small>
                </button>
              ))}
            </div>
          )}
          {searchResults?.assets?.length > 0 && (
            <div className="search-group">
              <strong>Assets</strong>
              {searchResults.assets.map((a) => (
                <button type="button" key={a.id} className="search-item" onClick={() => go('/assets')}>
                  {a.name} <small>{a.serialNumber}</small>
                </button>
              ))}
            </div>
          )}
        </div>
      )}
    </div>
  );
}

function MainApp() {
  const { user, setUser } = useStore();
  const navigate = useNavigate();
  const [booting, setBooting] = useState(true);
  const [sidebarOpen, setSidebarOpen] = useState(false);

  useEffect(() => {
    fetch('/auth/me', { credentials: 'include' })
      .then((res) => res.json())
      .then((data) => {
        if (data.user) {
          setUser(data.user);
          applyPreferences(parsePrefs(data.user.preferences));
        } else {
          navigate('/login');
        }
      })
      .catch(() => navigate('/login'))
      .finally(() => setBooting(false));
  }, [setUser, navigate]);

  if (booting) {
    return (
      <div className="login-wrapper" role="status" aria-live="polite">
        <div className="login-card glass" style={{ textAlign: 'center' }}>
          <i className="material-icons-round" style={{ fontSize: 40, opacity: 0.7 }}>hourglass_top</i>
          <p>Loading JJFO HRMS…</p>
        </div>
      </div>
    );
  }

  if (!user) return null;

  const avatar = user.avatar || `https://ui-avatars.com/api/?name=${encodeURIComponent(user.name)}&background=1e3a5f&color=fff`;

  return (
    <div className={`layout ${sidebarOpen ? 'sidebar-open' : ''}`}>
      <button
        type="button"
        className="sidebar-toggle btn btn-sm btn-secondary"
        aria-label="Toggle menu"
        onClick={() => setSidebarOpen((v) => !v)}
      >
        <i className="material-icons-round">menu</i>
      </button>

      <aside className="sidebar" aria-label="Main navigation">
        <div className="sidebar-logo">
          <i className="material-icons-round">account_balance</i>
          <span>JJFO HRMS</span>
        </div>
        <ul className="sidebar-menu">
          {NAV.filter((n) => canSee(user, n)).map((n) => (
            <li className="menu-item" key={n.to}>
              <NavLink
                to={n.to}
                end={n.end}
                className={({ isActive }) => `menu-link${isActive ? ' active' : ''}`}
                onClick={() => setSidebarOpen(false)}
              >
                <i className="material-icons-round">{n.icon}</i>
                <span>{n.label}</span>
              </NavLink>
            </li>
          ))}
        </ul>
      </aside>

      <main className="main-content">
        <header className="topbar glass">
          <GlobalSearch />
          <div className="topbar-actions">
            <ThemeToggle />
            <NotificationBell />
            <div className="user-profile-menu">
              <img id="current-user-avatar" src={avatar} alt="" width={36} height={36} />
              <div className="user-info">
                <h4 id="current-user-name">{user.name}</h4>
                <small id="current-user-role">{user.role}</small>
              </div>
            </div>
            <button
              type="button"
              className="btn btn-secondary btn-sm"
              onClick={() => {
                fetch('/auth/logout', {
                  method: 'POST',
                  credentials: 'include',
                  headers: { 'X-Requested-With': 'XMLHttpRequest' }
                }).finally(() => {
                  setUser(null);
                  navigate('/login');
                });
              }}
            >
              Logout
            </button>
          </div>
        </header>

        <div className="views-container">
          <ErrorBoundary>
            <Routes>
              <Route path="/" element={<Dashboard />} />
              <Route path="/directory" element={<Guard k="directory"><Directory /></Guard>} />
              <Route path="/onboarding" element={<Guard k="onboarding"><Onboarding /></Guard>} />
              <Route path="/leaves" element={<Guard k="leaves"><Leaves /></Guard>} />
              <Route path="/payroll" element={<Guard k="payroll"><Payroll /></Guard>} />
              <Route path="/expenses" element={<Guard k="expenses"><Expenses /></Guard>} />
              <Route path="/engagement" element={<Guard k="engagement"><Engagement /></Guard>} />
              <Route path="/policies" element={<Guard k="policies"><Policies /></Guard>} />
              <Route path="/assets" element={<Guard k="assets"><Assets /></Guard>} />
              <Route path="/helpdesk" element={<Guard k="helpdesk"><Helpdesk /></Guard>} />
              <Route path="/workflows" element={<Workflows />} />
              <Route path="/permissions" element={<Guard k="permissions"><Permissions /></Guard>} />
              <Route path="/gsync" element={<Guard k="gsync"><GoogleSync /></Guard>} />
              <Route path="/reports" element={<Guard k="reports"><Reports /></Guard>} />
              <Route path="/audit" element={<Guard k="audit"><AuditLog /></Guard>} />
              <Route path="/settings" element={<Guard k="settings"><Settings /></Guard>} />
              <Route path="*" element={<div className="p-8"><h2>Not Found</h2><Link to="/">Go home</Link></div>} />
            </Routes>
          </ErrorBoundary>
        </div>
      </main>
      <ToastHost />
    </div>
  );
}

function Login() {
  const navigate = useNavigate();
  const { setUser } = useStore();
  const [email, setEmail] = useState('');
  const [password, setPassword] = useState('');
  const [error, setError] = useState('');
  const [busy, setBusy] = useState(false);
  const [forgot, setForgot] = useState(false);
  const [forgotMsg, setForgotMsg] = useState('');

  const handleLogin = async (e) => {
    e.preventDefault();
    setBusy(true);
    setError('');
    try {
      const res = await fetch('/auth/login', {
        method: 'POST',
        credentials: 'include',
        headers: { 'Content-Type': 'application/json' },
        body: JSON.stringify({ email, password })
      });
      const data = await res.json();
      if (res.ok) {
        setUser(data.user);
        navigate('/');
      } else {
        setError(data.error || 'Login failed');
      }
    } catch {
      setError('Login failed');
    } finally {
      setBusy(false);
    }
  };

  const handleForgot = async (e) => {
    e.preventDefault();
    setBusy(true);
    setForgotMsg('');
    try {
      const res = await fetch('/auth/forgot-password', {
        method: 'POST',
        headers: { 'Content-Type': 'application/json' },
        body: JSON.stringify({ email })
      });
      const data = await res.json();
      setForgotMsg(data.message || data.error || 'Request submitted');
    } catch {
      setForgotMsg('Could not submit request');
    } finally {
      setBusy(false);
    }
  };

  return (
    <div className="login-wrapper">
      <div className="login-card glass">
        <div className="login-header">
          <i className="material-icons-round text-primary" style={{ fontSize: '48px' }}>account_balance</i>
          <h2>JJFO Core</h2>
          <p>Sign in to Enterprise Suite</p>
        </div>
        {error && <div className="login-error" role="alert">{error}</div>}
        {forgotMsg && <div className="login-info" role="status">{forgotMsg}</div>}

        {forgot ? (
          <form onSubmit={handleForgot}>
            <p style={{ fontSize: '0.85rem', opacity: 0.85, marginBottom: '1rem' }}>
              Enter your work email. An administrator will be notified to reset your password (default demo password remains <code>password123</code> for new accounts).
            </p>
            <div className="form-group">
              <label htmlFor="forgot-email">Employee Email</label>
              <div className="input-with-icon">
                <i className="material-icons-round">email</i>
                <input id="forgot-email" type="email" value={email} onChange={(e) => setEmail(e.target.value)} required />
              </div>
            </div>
            <button type="submit" className="btn btn-primary w-100" disabled={busy} style={{ marginTop: '1rem', padding: '0.8rem' }}>
              {busy ? 'Sending…' : 'Request reset'}
            </button>
            <button type="button" className="btn btn-secondary w-100" style={{ marginTop: '0.5rem' }} onClick={() => setForgot(false)}>
              Back to login
            </button>
          </form>
        ) : (
          <form onSubmit={handleLogin}>
            <div className="form-group">
              <label htmlFor="login-email">Employee Email</label>
              <div className="input-with-icon">
                <i className="material-icons-round">email</i>
                <input id="login-email" type="email" value={email} onChange={(e) => setEmail(e.target.value)} required autoComplete="username" />
              </div>
            </div>
            <div className="form-group">
              <div style={{ display: 'flex', justifyContent: 'space-between', alignItems: 'center' }}>
                <label htmlFor="login-password">Password</label>
                <button
                  type="button"
                  className="linkish"
                  onClick={() => { setForgot(true); setError(''); setForgotMsg(''); }}
                  style={{ fontSize: '0.75rem', fontWeight: 600, background: 'none', border: 0, cursor: 'pointer', textDecoration: 'underline', color: 'inherit' }}
                >
                  Forgot Password?
                </button>
              </div>
              <div className="input-with-icon">
                <i className="material-icons-round">lock</i>
                <input id="login-password" type="password" value={password} onChange={(e) => setPassword(e.target.value)} required autoComplete="current-password" />
              </div>
            </div>
            <button type="submit" className="btn btn-primary w-100" disabled={busy} style={{ marginTop: '1.5rem', padding: '0.8rem' }}>
              {busy ? 'Signing in…' : 'Authenticate'}
            </button>
          </form>
        )}
      </div>
      <ToastHost />
    </div>
  );
}

export default function App() {
  return (
    <Router>
      <Routes>
        <Route path="/login" element={<Login />} />
        <Route path="/*" element={<MainApp />} />
      </Routes>
    </Router>
  );
}
