import React, { useState } from 'react';
import useStore from '../store';
import { applyPreferences, parsePrefs, DEFAULT_PREFS } from '../theme';

const FONTS = ['Outfit', 'Plus Jakarta Sans', 'Inter', 'Roboto'];
const SIZES = [{ v: 'small', l: 'Small' }, { v: 'medium', l: 'Medium' }, { v: 'large', l: 'Large' }];
const NOTIFY_KINDS = [
  { key: 'leave', label: 'Leave & attendance' },
  { key: 'onboarding', label: 'Onboarding' },
  { key: 'asset', label: 'Assets' },
  { key: 'helpdesk', label: 'Helpdesk' },
  { key: 'payroll', label: 'Payroll' },
  { key: 'permission', label: 'Access changes' }
];

function Settings() {
  const { user, savePreferences, changePassword } = useStore();
  const [prefs, setPrefs] = useState({ ...DEFAULT_PREFS, ...parsePrefs(user?.preferences) });
  const [msg, setMsg] = useState('');
  const [pw, setPw] = useState({ current: '', next: '' });
  const [pwMsg, setPwMsg] = useState('');

  const submitPw = async (e) => {
    e.preventDefault(); setPwMsg('');
    try {
      await changePassword(pw.current, pw.next);
      setPw({ current: '', next: '' });
      setPwMsg('Password updated.');
    } catch (err) { setPwMsg(err.message); }
  };

  // Apply immediately so changes are visible while editing.
  const update = (patch) => {
    const next = { ...prefs, ...patch };
    setPrefs(next);
    applyPreferences(next);
  };

  const save = async (e) => {
    e.preventDefault(); setMsg('');
    try { await savePreferences(prefs); applyPreferences(prefs); setMsg('Preferences saved.'); }
    catch (err) { setMsg(err.message); }
  };

  return (
    <div className="view-panel active-view">
      <div className="view-header"><div><h2>Settings</h2><p>Personalize your interface. Changes preview live.</p></div></div>
      <div className="glass p-6" style={{ maxWidth: '520px' }}>
        {msg && <p>{msg}</p>}
        <form onSubmit={save} style={{ display: 'grid', gap: '1.2rem' }}>
          <div className="form-group">
            <label>Theme</label>
            <div className="theme-switch">
              <button type="button" className={`btn ${prefs.theme === 'dark' ? 'btn-primary' : 'btn-secondary'}`} onClick={() => update({ theme: 'dark' })}>
                <i className="material-icons-round">dark_mode</i> Dark
              </button>
              <button type="button" className={`btn ${prefs.theme === 'light' ? 'btn-primary' : 'btn-secondary'}`} onClick={() => update({ theme: 'light' })}>
                <i className="material-icons-round">light_mode</i> Light
              </button>
            </div>
          </div>

          <div className="form-group">
            <label>Font Family</label>
            <select className="form-control" value={prefs.font} onChange={e => update({ font: e.target.value })}>
              {FONTS.map(f => <option key={f} value={f}>{f}</option>)}
            </select>
          </div>

          <div className="form-group">
            <label>Font Size</label>
            <select className="form-control" value={prefs.fontSize} onChange={e => update({ fontSize: e.target.value })}>
              {SIZES.map(s => <option key={s.v} value={s.v}>{s.l}</option>)}
            </select>
          </div>

          <div className="form-group">
            <label>In-app Notifications</label>
            <div className="perm-grid" style={{ marginTop: '6px' }}>
              {NOTIFY_KINDS.map(k => {
                const kinds = prefs.notifyKinds || NOTIFY_KINDS.map(x => x.key);
                const on = kinds.includes(k.key);
                return (
                  <label key={k.key} className="perm-item">
                    <input type="checkbox" checked={on}
                      onChange={() => update({ notifyKinds: on ? kinds.filter(x => x !== k.key) : [...kinds, k.key] })} />
                    <span>{k.label}</span>
                  </label>
                );
              })}
            </div>
          </div>

          <button type="submit" className="btn btn-primary">Save Preferences</button>
        </form>
      </div>

      <div className="glass p-6" style={{ maxWidth: '520px', marginTop: '1.5rem' }}>
        <h3>Change Password</h3>
        {pwMsg && <p style={{ marginTop: '0.5rem' }}>{pwMsg}</p>}
        <form onSubmit={submitPw} style={{ display: 'grid', gap: '1rem', marginTop: '1rem' }}>
          <div className="form-group">
            <label>Current Password</label>
            <input className="form-control" type="password" value={pw.current} onChange={e => setPw({ ...pw, current: e.target.value })} required />
          </div>
          <div className="form-group">
            <label>New Password (min 8 characters)</label>
            <input className="form-control" type="password" minLength={8} value={pw.next} onChange={e => setPw({ ...pw, next: e.target.value })} required />
          </div>
          <button type="submit" className="btn btn-primary">Update Password</button>
        </form>
      </div>
    </div>
  );
}

export default Settings;
