import React, { useState, useEffect } from 'react';
import useStore from '../store';
import { applyPreferences, parsePrefs, DEFAULT_PREFS } from '../theme';
import { useNavigate } from 'react-router-dom';

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
  const {
    user, savePreferences, changePassword,
    companySettings, fetchCompanySettings, saveCompanySettings
  } = useStore();
  const navigate = useNavigate();
  const [prefs, setPrefs] = useState({ ...DEFAULT_PREFS, ...parsePrefs(user?.preferences) });
  const [msg, setMsg] = useState('');
  const [pw, setPw] = useState({ current: '', next: '' });
  const [pwMsg, setPwMsg] = useState('');
  const [company, setCompany] = useState({ lateThreshold: '09:15', companyName: 'JJFO', workWeek: 'Mon-Fri' });
  const [cMsg, setCMsg] = useState('');
  const isAdmin = user?.role === 'admin';

  useEffect(() => {
    if (isAdmin) fetchCompanySettings();
  }, [isAdmin, fetchCompanySettings]);

  useEffect(() => {
    if (companySettings) setCompany((c) => ({ ...c, ...companySettings }));
  }, [companySettings]);

  const submitPw = async (e) => {
    e.preventDefault();
    setPwMsg('');
    try {
      await changePassword(pw.current, pw.next);
      setPw({ current: '', next: '' });
      setPwMsg('Password updated. Redirecting to login…');
      setTimeout(() => navigate('/login'), 1200);
    } catch (err) {
      setPwMsg(err.message);
    }
  };

  const update = (patch) => {
    const next = { ...prefs, ...patch };
    setPrefs(next);
    applyPreferences(next);
  };

  const save = async (e) => {
    e.preventDefault();
    setMsg('');
    try {
      await savePreferences(prefs);
      applyPreferences(prefs);
      setMsg('✓ Preferences saved successfully.');
      setTimeout(() => setMsg(''), 4000);
    } catch (err) {
      setMsg(err.message || 'Save failed');
    }
  };

  const saveCompany = async (e) => {
    e.preventDefault();
    setCMsg('');
    try {
      await saveCompanySettings(company);
      setCMsg('Company settings saved.');
    } catch (err) {
      setCMsg(err.message);
    }
  };

  return (
    <div className="view-panel active-view">
      <div className="view-header">
        <div><h2>Settings</h2><p>Personalize your interface. Changes preview live.</p></div>
      </div>
      <div className="glass p-6" style={{ maxWidth: '520px' }}>
        {msg && <div className={`settings-flash ${msg.startsWith('✓') ? 'ok' : 'err'}`} role="status">{msg}</div>}
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
            <select className="form-control" value={prefs.font} onChange={(e) => update({ font: e.target.value })}>
              {FONTS.map((f) => <option key={f} value={f}>{f}</option>)}
            </select>
          </div>

          <div className="form-group">
            <label>Font Size</label>
            <select className="form-control" value={prefs.fontSize} onChange={(e) => update({ fontSize: e.target.value })}>
              {SIZES.map((s) => <option key={s.v} value={s.v}>{s.l}</option>)}
            </select>
          </div>

          <div className="form-group">
            <label>In-app Notifications</label>
            <div className="perm-grid" style={{ marginTop: '6px' }}>
              {NOTIFY_KINDS.map((k) => {
                const kinds = prefs.notifyKinds || NOTIFY_KINDS.map((x) => x.key);
                const on = kinds.includes(k.key);
                return (
                  <label key={k.key} className="perm-item">
                    <input
                      type="checkbox"
                      checked={on}
                      onChange={() => update({
                        notifyKinds: on ? kinds.filter((x) => x !== k.key) : [...kinds, k.key]
                      })}
                    />
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
            <input className="form-control" type="password" value={pw.current} onChange={(e) => setPw({ ...pw, current: e.target.value })} required />
          </div>
          <div className="form-group">
            <label>New Password (min 8 characters)</label>
            <input className="form-control" type="password" minLength={8} value={pw.next} onChange={(e) => setPw({ ...pw, next: e.target.value })} required />
          </div>
          <button type="submit" className="btn btn-primary">Update Password</button>
        </form>
      </div>

      {isAdmin && (
        <div className="glass p-6" style={{ maxWidth: '520px', marginTop: '1.5rem' }}>
          <h3>Company Settings</h3>
          <p style={{ fontSize: '0.85rem', opacity: 0.8 }}>Late threshold, display name, work week.</p>
          {cMsg && <p style={{ marginTop: '0.5rem' }}>{cMsg}</p>}
          <form onSubmit={saveCompany} style={{ display: 'grid', gap: '1rem', marginTop: '1rem' }}>
            <div className="form-group">
              <label>Company name</label>
              <input className="form-control" value={company.companyName || ''} onChange={(e) => setCompany({ ...company, companyName: e.target.value })} />
            </div>
            <div className="form-group">
              <label>Late threshold (HH:MM)</label>
              <input className="form-control" pattern="\d{2}:\d{2}" value={company.lateThreshold || '09:15'} onChange={(e) => setCompany({ ...company, lateThreshold: e.target.value })} />
            </div>
            <div className="form-group">
              <label>Work week</label>
              <input className="form-control" value={company.workWeek || ''} onChange={(e) => setCompany({ ...company, workWeek: e.target.value })} />
            </div>
            <button type="submit" className="btn btn-primary">Save Company Settings</button>
          </form>
        </div>
      )}
    </div>
  );
}

export default Settings;
