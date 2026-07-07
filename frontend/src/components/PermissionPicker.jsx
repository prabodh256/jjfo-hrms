import React from 'react';
import { MODULES, CAPS, BASE_MODULES } from '../permissions';

// value: { modules: [], caps: {} }  — the grant being edited
// grantable: { modules: [], caps: {} } — what the current user is allowed to give
function PermissionPicker({ value, grantable, onChange }) {
  if (!grantable) return null;
  const modules = value.modules || [];
  const caps = value.caps || {};

  // Only modules the granter holds and that aren't universal base modules are grantable.
  const grantableModules = MODULES.filter(m => grantable.modules.includes(m.key) && !BASE_MODULES.includes(m.key));
  const grantableCaps = CAPS.filter(c => grantable.caps[c.key]);

  const toggleModule = (key) => {
    const next = modules.includes(key) ? modules.filter(m => m !== key) : [...modules, key];
    onChange({ ...value, modules: next });
  };
  const toggleCap = (key) => onChange({ ...value, caps: { ...caps, [key]: !caps[key] } });

  return (
    <div className="perm-picker">
      <div>
        <strong>Module access</strong>
        <p className="text-muted" style={{ fontSize: '0.75rem', margin: '2px 0 8px' }}>
          Dashboard, Leave, Helpdesk &amp; Settings are always available.
        </p>
        <div className="perm-grid">
          {grantableModules.length === 0 ? <small className="text-muted">No extra modules to grant.</small> :
            grantableModules.map(m => (
              <label key={m.key} className="perm-item">
                <input type="checkbox" checked={modules.includes(m.key)} onChange={() => toggleModule(m.key)} />
                <span>{m.label}</span>
              </label>
            ))}
        </div>
      </div>
      <div style={{ marginTop: '12px' }}>
        <strong>Capabilities</strong>
        <div className="perm-grid">
          {grantableCaps.length === 0 ? <small className="text-muted">No capabilities to grant.</small> :
            grantableCaps.map(c => (
              <label key={c.key} className="perm-item">
                <input type="checkbox" checked={!!caps[c.key]} onChange={() => toggleCap(c.key)} />
                <span>{c.label}</span>
              </label>
            ))}
        </div>
      </div>
    </div>
  );
}

export default PermissionPicker;
