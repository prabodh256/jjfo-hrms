import React, { useEffect, useState } from 'react';
import { BrowserRouter as Router, Routes, Route, Link, Navigate, useNavigate } from 'react-router-dom';
import useStore from './store';
import { applyPreferences, parsePrefs } from './theme';
import { hasModule, hasCap } from './permissions';
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

const NAV = [
  { to: '/', key: 'dashboard', icon: 'dashboard', label: 'Dashboard' },
  { to: '/directory', key: 'directory', icon: 'people', label: 'Directory & Org' },
  { to: '/onboarding', key: 'onboarding', icon: 'how_to_reg', label: 'Onboarding' },
  { to: '/leaves', key: 'leaves', icon: 'event_note', label: 'Leave & Attendance' },
  { to: '/payroll', key: 'payroll', icon: 'payments', label: 'Payroll & Tax' },
  { to: '/assets', key: 'assets', icon: 'devices', label: 'Asset Inventory' },
  { to: '/helpdesk', key: 'helpdesk', icon: 'support_agent', label: 'HR Helpdesk' },
  { to: '/permissions', key: 'permissions', icon: 'admin_panel_settings', label: 'Permissions', capAlt: 'createUsers' },
  { to: '/gsync', key: 'gsync', icon: 'cloud_sync', label: 'Google Sync' },
  { to: '/reports', key: 'reports', icon: 'insights', label: 'Reports' },
  { to: '/audit', key: 'audit', icon: 'fact_check', label: 'Audit Log' },
  { to: '/settings', key: 'settings', icon: 'settings', label: 'Settings' }
];

// A nav item shows if the user has the module, an alternate capability grants it,
// or (for Onboarding) the user has their own onboarding still to complete.
const canSee = (user, item) =>
  hasModule(user, item.key) ||
  (item.capAlt && hasCap(user, item.capAlt)) ||
  (item.key === 'onboarding' && user.onboardingState && user.onboardingState !== 'approved');

// Route guard: direct navigation to a module the user can't access redirects
// home instead of rendering an empty shell of silent 403s.
function Guard({ k, children }) {
  const { user } = useStore();
  const item = NAV.find(n => n.key === k);
  if (user && item && !canSee(user, item)) return <Navigate to="/" replace />;
  return children;
}

function NotificationBell() {
  const { user, notifications, fetchNotifications, markRead, markAllRead } = useStore();
  const [open, setOpen] = useState(false);
  // Respect the user's notification-kind preferences ('general' always shows).
  const kinds = parsePrefs(user?.preferences).notifyKinds;
  const visible = notifications.filter(n => !kinds || n.kind === 'general' || kinds.includes(n.kind));
  const unread = visible.filter(n => !n.read).length;

  useEffect(() => {
    fetchNotifications();
    const t = setInterval(fetchNotifications, 30000);
    return () => clearInterval(t);
  }, [fetchNotifications]);

  return (
    <div className="bell-wrap">
      <button className="bell-btn" aria-label="Notifications" onClick={() => setOpen(!open)}>
        <i className="material-icons-round">notifications</i>
        {unread > 0 && <span className="bell-count">{unread}</span>}
      </button>
      {open && (
        <div className="bell-panel glass">
          <div className="bell-head">
            <strong>Notifications</strong>
            {unread > 0 && <button className="btn btn-sm btn-secondary" onClick={markAllRead}>Mark all read</button>}
          </div>
          {visible.length === 0 ? <p className="bell-empty">Nothing yet.</p> : visible.slice(0, 12).map(n => (
            <div key={n.id} className={`bell-item ${n.read ? '' : 'unread'}`} onClick={() => !n.read && markRead(n.id)}>
              <strong>{n.title}</strong>
              <p>{n.body}</p>
              <small>{new Date(n.at).toLocaleString()}</small>
            </div>
          ))}
        </div>
      )}
    </div>
  );
}

function MainApp() {
  const { user, setUser } = useStore();
  const navigate = useNavigate();

  useEffect(() => {
    // Fetch me
    fetch('/auth/me')
      .then(res => res.json())
      .then(data => {
        if (data.user) { setUser(data.user); applyPreferences(parsePrefs(data.user.preferences)); }
        else navigate('/login');
      })
      .catch(() => navigate('/login'));
  }, [setUser, navigate]);

  if (!user) return null; // loading

  return (
    <div className="layout">
      {/* Sidebar Navigation */}
      <aside className="sidebar">
        <div className="sidebar-logo">
          <i className="material-icons-round">account_balance</i>
          <span>JJFO HRMS</span>
        </div>
        <ul className="sidebar-menu">
          {NAV.filter(n => canSee(user, n)).map(n => (
            <li className="menu-item" key={n.to}>
              <Link to={n.to} className="menu-link"><i className="material-icons-round">{n.icon}</i><span>{n.label}</span></Link>
            </li>
          ))}
        </ul>
      </aside>

      <main className="main-content">
        {/* Top Header */}
        <header className="topbar glass">
          <div className="topbar-search">
            <i className="material-icons-round">search</i>
            <input type="text" placeholder="Global search (Ctrl+K)..." />
          </div>
          <div className="topbar-actions">
            <NotificationBell />
            <div className="user-profile-menu">
              <img id="current-user-avatar" src="https://via.placeholder.com/150" alt="Profile" />
              <div className="user-info">
                <h4 id="current-user-name">{user.name}</h4>
                <small id="current-user-role">{user.role}</small>
              </div>
            </div>
            <button className="btn btn-secondary btn-sm" onClick={() => {
              fetch('/auth/logout', { method: 'POST' }).then(() => {
                setUser(null);
                navigate('/login');
              });
            }}>Logout</button>
          </div>
        </header>

        <div className="views-container">
          <Routes>
            <Route path="/" element={<Dashboard />} />
            <Route path="/directory" element={<Guard k="directory"><Directory /></Guard>} />
            <Route path="/onboarding" element={<Guard k="onboarding"><Onboarding /></Guard>} />
            <Route path="/leaves" element={<Guard k="leaves"><Leaves /></Guard>} />
            <Route path="/payroll" element={<Guard k="payroll"><Payroll /></Guard>} />
            <Route path="/assets" element={<Guard k="assets"><Assets /></Guard>} />
            <Route path="/helpdesk" element={<Guard k="helpdesk"><Helpdesk /></Guard>} />
            <Route path="/permissions" element={<Guard k="permissions"><Permissions /></Guard>} />
            <Route path="/gsync" element={<Guard k="gsync"><GoogleSync /></Guard>} />
            <Route path="/reports" element={<Guard k="reports"><Reports /></Guard>} />
            <Route path="/audit" element={<Guard k="audit"><AuditLog /></Guard>} />
            <Route path="/settings" element={<Guard k="settings"><Settings /></Guard>} />
            <Route path="*" element={<div className="p-8"><h2>Not Found</h2></div>} />
          </Routes>
        </div>
      </main>
    </div>
  );
}

function Login() {
  const navigate = useNavigate();
  const { setUser } = useStore();
  const [email, setEmail] = useState('');
  const [password, setPassword] = useState('');
  const [error, setError] = useState('');

  const handleLogin = async (e) => {
    e.preventDefault();
    try {
      const res = await fetch('/auth/login', {
        method: 'POST',
        headers: { 'Content-Type': 'application/json' },
        body: JSON.stringify({ email, password })
      });
      const data = await res.json();
      if (res.ok) {
        setUser(data.user);
        navigate('/');
      } else {
        setError(data.error);
      }
    } catch (err) {
      setError('Login failed');
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
        {error && <div style={{ color: 'red', textAlign: 'center', marginBottom: '1rem' }}>{error}</div>}
        <form onSubmit={handleLogin}>
          <div className="form-group">
            <label>Employee Email</label>
            <div className="input-with-icon">
              <i className="material-icons-round">email</i>
              <input type="email" value={email} onChange={e => setEmail(e.target.value)} required />
            </div>
          </div>
          <div className="form-group">
            <div style={{ display: 'flex', justifyContent: 'space-between', alignItems: 'center' }}>
              <label>Password</label>
              <a href="#" onClick={(e) => { e.preventDefault(); alert('For security compliance, password resets are processed manually. Please contact Rajesh Kumar (Superadmin), who can reset it from the Directory.'); }}
                 style={{ fontSize: '0.75rem', fontWeight: 600, textDecoration: 'none' }}>Forgot Password?</a>
            </div>
            <div className="input-with-icon">
              <i className="material-icons-round">lock</i>
              <input type="password" value={password} onChange={e => setPassword(e.target.value)} required />
            </div>
          </div>
          <button type="submit" className="btn btn-primary w-100" style={{ marginTop: '1.5rem', padding: '0.8rem' }}>Authenticate</button>
        </form>
      </div>
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
