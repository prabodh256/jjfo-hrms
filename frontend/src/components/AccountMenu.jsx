import React, { useEffect, useRef, useState } from 'react';
import { Link } from 'react-router-dom';
import useStore from '../store';
import { applyPreferences, DEFAULT_PREFS, parsePrefs } from '../theme';
import Avatar from './Avatar';

export default function AccountMenu({ user, onLogout }) {
  const { savePreferences, refreshMe } = useStore();
  const [open, setOpen] = useState(false);
  const wrapRef = useRef(null);
  const prefs = { ...DEFAULT_PREFS, ...parsePrefs(user?.preferences) };
  const isDark = prefs.theme !== 'light';

  useEffect(() => {
    if (!open) return undefined;
    const close = (event) => {
      if (event.key === 'Escape') setOpen(false);
      if (event.type === 'mousedown' && wrapRef.current && !wrapRef.current.contains(event.target)) setOpen(false);
    };
    document.addEventListener('mousedown', close);
    document.addEventListener('keydown', close);
    return () => {
      document.removeEventListener('mousedown', close);
      document.removeEventListener('keydown', close);
    };
  }, [open]);

  const toggleTheme = async () => {
    const next = { ...prefs, theme: isDark ? 'light' : 'dark' };
    applyPreferences(next);
    try {
      await savePreferences(next);
      if (refreshMe) await refreshMe();
    } catch { /* local theme remains available */ }
  };

  return (
    <div className="account-menu-wrap" ref={wrapRef}>
      <button
        type="button"
        className={`account-trigger${open ? ' open' : ''}`}
        aria-label="Open account menu"
        aria-expanded={open}
        onClick={() => setOpen((value) => !value)}
      >
        <Avatar id="current-user-avatar" name={user.name} width={40} height={40} />
        <span className="account-summary">
          <strong id="current-user-name">{user.name}</strong>
          <small id="current-user-role">{user.role}</small>
        </span>
        <i className="material-icons-round account-chevron">expand_more</i>
      </button>

      {open && (
        <div className="account-dropdown glass" role="menu">
          <div className="account-dropdown-head">
            <Avatar name={user.name} width={46} height={46} />
            <div><strong>{user.name}</strong><small>{user.email}</small></div>
          </div>
          <Link to="/directory" role="menuitem" onClick={() => setOpen(false)}>
            <i className="material-icons-round">person</i><span>My profile & directory</span>
          </Link>
          <Link to="/settings" role="menuitem" onClick={() => setOpen(false)}>
            <i className="material-icons-round">settings</i><span>Settings & password</span>
          </Link>
          <button type="button" role="menuitem" onClick={toggleTheme}>
            <i className="material-icons-round">{isDark ? 'light_mode' : 'dark_mode'}</i>
            <span>{isDark ? 'Switch to light mode' : 'Switch to dark mode'}</span>
          </button>
          <div className="account-menu-separator" />
          <button type="button" className="account-signout" role="menuitem" onClick={onLogout}>
            <i className="material-icons-round">logout</i><span>Sign out</span>
          </button>
        </div>
      )}
    </div>
  );
}
