import React from 'react';
import { MODULES, CAPS, BASE_MODULES } from '../permissions';

// value: { modules: { key: 'view'|'edit' }, caps: {} }
// grantable: { modules: [], moduleLevels: {}, caps: {} }
function PermissionPicker({ value, grantable, onChange }) {
  if (!grantable) return null;

  const levels = typeof value.modules === 'object' && !Array.isArray(value.modules)
    ? { ...(value.modules || {}) }
    : Object.fromEntries((value.modules || []).map((m) => [m, 'edit']));
  const caps = value.caps || {};

  const grantableModules = MODULES.filter(
    (m) => !BASE_MODULES.includes(m.key) && grantable.moduleLevels?.[m.key]
  );
  const grantableCaps = CAPS.filter((c) => grantable.caps?.[c.key]);

  const setLevel = (key, lvl) => {
    const next = { ...levels };
    if (!lvl) delete next[key];
    else next[key] = lvl;
    onChange({ ...value, modules: next });
  };

  const toggleCap = (key) => onChange({ ...value, caps: { ...caps, [key]: !caps[key] } });

  return (
    <div className="perm-picker">
      <div>
        <strong>Module access (View / Edit)</strong>
        <p className="text-muted" style={{ fontSize: '0.75rem', margin: '2px 0 8px' }}>
          Dashboard, Leave, Helpdesk, Settings &amp; own Payroll are always available. Extra modules (e.g. company-wide payroll tools) need grant.
        </p>
        <div className="perm-level-list">
          {grantableModules.length === 0 ? (
            <small className="text-muted">No extra modules you can grant.</small>
          ) : (
            grantableModules.map((m) => {
              const cur = levels[m.key] || '';
              const max = grantable.moduleLevels[m.key]; // view | edit
              return (
                <div key={m.key} className={`perm-level-row ${m.key === 'payroll' ? 'perm-payroll' : ''}`}>
                  <span className="perm-level-label">
                    {m.label}
                    {m.key === 'payroll' && <em className="perm-badge">restricted</em>}
                  </span>
                  <div className="perm-level-opts">
                    <label>
                      <input type="radio" name={`m-${m.key}`} checked={!cur} onChange={() => setLevel(m.key, null)} />
                      Off
                    </label>
                    <label>
                      <input
                        type="radio"
                        name={`m-${m.key}`}
                        checked={cur === 'view'}
                        disabled={!(max === 'view' || max === 'edit')}
                        onChange={() => setLevel(m.key, 'view')}
                      />
                      View
                    </label>
                    <label>
                      <input
                        type="radio"
                        name={`m-${m.key}`}
                        checked={cur === 'edit'}
                        disabled={max !== 'edit'}
                        onChange={() => setLevel(m.key, 'edit')}
                      />
                      Edit
                    </label>
                  </div>
                </div>
              );
            })
          )}
        </div>
      </div>
      <div style={{ marginTop: '14px' }}>
        <strong>Capabilities</strong>
        <div className="perm-grid">
          {grantableCaps.length === 0 ? (
            <small className="text-muted">No capabilities to grant.</small>
          ) : (
            grantableCaps.map((c) => (
              <label key={c.key} className="perm-item">
                <input type="checkbox" checked={!!caps[c.key]} onChange={() => toggleCap(c.key)} />
                <span>{c.label}</span>
              </label>
            ))
          )}
        </div>
      </div>
    </div>
  );
}

export default PermissionPicker;
