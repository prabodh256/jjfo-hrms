import React, { useEffect, useState } from 'react';
import useStore from '../store';
import { parsePerms } from '../permissions';
import Modal from './Modal';
import PermissionPicker from './PermissionPicker';

function summarize(emp) {
  const p = parsePerms(emp.permissions);
  const mods = Array.isArray(p.modules) ? p.modules : [];
  const caps = p.caps ? Object.keys(p.caps).filter(k => p.caps[k]) : [];
  return { mods, caps };
}

function Permissions() {
  const { employees, fetchEmployees, updatePermissions, grantable, fetchGrantable, user } = useStore();
  const [editing, setEditing] = useState(null); // { emp, value }
  const [err, setErr] = useState('');

  useEffect(() => { fetchEmployees(); fetchGrantable(); }, [fetchEmployees, fetchGrantable]);

  const open = (emp) => {
    const p = parsePerms(emp.permissions);
    setErr('');
    setEditing({ emp, value: { modules: Array.isArray(p.modules) ? p.modules : [], caps: p.caps || {} } });
  };

  const save = async () => {
    try { await updatePermissions(editing.emp.id, editing.value); setEditing(null); }
    catch (e) { setErr(e.message); }
  };

  return (
    <div className="view-panel active-view">
      <div className="view-header">
        <div>
          <h2>Access Control &amp; Permissions</h2>
          <p>Grant module access and capabilities. You can only grant what you hold — admins hold everything.</p>
        </div>
      </div>
      <div className="table-responsive">
        <table className="table">
          <thead><tr><th>Employee</th><th>Role</th><th>Modules</th><th>Capabilities</th><th>Action</th></tr></thead>
          <tbody>
            {employees.map(emp => {
              const s = summarize(emp);
              const isAdminRow = emp.role === 'admin';
              return (
                <tr key={emp.id}>
                  <td><strong>{emp.name}</strong></td>
                  <td>{emp.role}</td>
                  <td>{isAdminRow ? 'All modules' : (s.mods.length ? s.mods.join(', ') : '—')}</td>
                  <td>{isAdminRow ? 'All capabilities' : (s.caps.length ? s.caps.join(', ') : '—')}</td>
                  <td>{!isAdminRow && emp.id !== user?.id &&
                    <button className="btn btn-sm btn-secondary" onClick={() => open(emp)}>Edit access</button>}</td>
                </tr>
              );
            })}
          </tbody>
        </table>
      </div>

      {editing && (
        <Modal title={`Access — ${editing.emp.name}`} onClose={() => setEditing(null)}>
          {err && <div className="form-error">{err}</div>}
          <PermissionPicker value={editing.value} grantable={grantable} onChange={(v) => setEditing({ ...editing, value: v })} />
          <div className="action-btn-group" style={{ marginTop: '16px' }}>
            <button className="btn btn-secondary" onClick={() => setEditing(null)}>Cancel</button>
            <button className="btn btn-primary" onClick={save}>Save</button>
          </div>
        </Modal>
      )}
    </div>
  );
}

export default Permissions;
