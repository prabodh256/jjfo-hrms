import React, { useEffect, useState } from 'react';
import useStore from '../store';
import { moduleLevelsFrom, BASE_MODULES } from '../permissions';
import Modal from './Modal';
import PermissionPicker from './PermissionPicker';

function summarize(emp) {
  const levels = moduleLevelsFrom(emp.permissions);
  const mods = Object.entries(levels).map(([k, v]) => `${k}:${v}`);
  let caps = [];
  try {
    const p = typeof emp.permissions === 'string' ? JSON.parse(emp.permissions || '{}') : (emp.permissions || {});
    caps = p.caps ? Object.keys(p.caps).filter((k) => p.caps[k]) : [];
  } catch { /* ignore */ }
  return { mods, caps, levels };
}

function Permissions() {
  const {
    employees, fetchEmployees, updatePermissions, grantable, fetchGrantable, user,
    permRequests, fetchPermRequests, decidePermRequest
  } = useStore();
  const [editing, setEditing] = useState(null);
  const [err, setErr] = useState('');
  const [msg, setMsg] = useState('');
  const [tab, setTab] = useState('people');
  const isAdmin = user?.role === 'admin';

  useEffect(() => {
    fetchEmployees();
    fetchGrantable();
    fetchPermRequests();
  }, [fetchEmployees, fetchGrantable, fetchPermRequests]);

  const open = (emp) => {
    const levels = moduleLevelsFrom(emp.permissions);
    let caps = {};
    try {
      const p = typeof emp.permissions === 'string' ? JSON.parse(emp.permissions || '{}') : (emp.permissions || {});
      caps = p.caps || {};
    } catch { /* ignore */ }
    setErr('');
    setMsg('');
    setEditing({ emp, value: { modules: levels, caps } });
  };

  const save = async () => {
    try {
      const res = await updatePermissions(editing.emp.id, editing.value);
      if (res?.escalated) {
        setMsg('Escalated for manager/admin stamp — not applied yet.');
        setEditing(null);
        setTab('escalations');
        await fetchPermRequests();
      } else {
        setMsg(res?.stamp ? `Applied. Stamp: ${res.stamp}` : 'Permissions updated.');
        setEditing(null);
        await fetchEmployees();
      }
    } catch (e) {
      setErr(e.message);
    }
  };

  const pending = (permRequests || []).filter((r) => r.status === 'Pending');

  return (
    <div className="view-panel active-view">
      <div className="view-header">
        <div>
          <h2>Access Control &amp; Permissions</h2>
          <p>
            Grant <strong>View</strong> or <strong>Edit</strong> per module. Payroll is off unless granted.
            Non-admin changes escalate for a manager/super-admin stamp.
          </p>
        </div>
      </div>

      <div className="tab-navigation">
        <button type="button" className={`tab-btn ${tab === 'people' ? 'active' : ''}`} onClick={() => setTab('people')}>People</button>
        <button type="button" className={`tab-btn ${tab === 'escalations' ? 'active' : ''}`} onClick={() => setTab('escalations')}>
          Escalations {pending.length ? `(${pending.length})` : ''}
        </button>
      </div>
      {msg && <p className="form-ok" style={{ marginTop: 8 }}>{msg}</p>}

      {tab === 'people' && (
        <div className="table-responsive" style={{ marginTop: 12 }}>
          <table className="table">
            <thead>
              <tr><th>Employee</th><th>Role</th><th>Modules (level)</th><th>Capabilities</th><th>Action</th></tr>
            </thead>
            <tbody>
              {employees.map((emp) => {
                const s = summarize(emp);
                const isAdminRow = emp.role === 'admin';
                return (
                  <tr key={emp.id}>
                    <td><strong>{emp.name}</strong></td>
                    <td>{emp.role}</td>
                    <td style={{ fontSize: '0.8rem' }}>
                      {isAdminRow ? 'All (edit)' : (
                        <>
                          <span className="text-muted">base: {BASE_MODULES.join(', ')}</span>
                          {s.mods.length ? <div>{s.mods.join(' · ')}</div> : <div>—</div>}
                        </>
                      )}
                    </td>
                    <td>{isAdminRow ? 'All' : (s.caps.length ? s.caps.join(', ') : '—')}</td>
                    <td>
                      {!isAdminRow && emp.id !== user?.id && (
                        <button type="button" className="btn btn-sm btn-secondary" onClick={() => open(emp)}>
                          {isAdmin ? 'Edit & stamp' : 'Propose change'}
                        </button>
                      )}
                    </td>
                  </tr>
                );
              })}
            </tbody>
          </table>
        </div>
      )}

      {tab === 'escalations' && (
        <div className="table-responsive" style={{ marginTop: 12 }}>
          <table className="table">
            <thead>
              <tr><th>When</th><th>Target</th><th>By</th><th>Payload</th><th>Stamp</th><th>Status</th><th></th></tr>
            </thead>
            <tbody>
              {(permRequests || []).length === 0 && (
                <tr><td colSpan={7} className="text-muted">No permission requests.</td></tr>
              )}
              {(permRequests || []).map((r) => (
                <tr key={r.id}>
                  <td style={{ fontSize: '0.75rem' }}>{new Date(r.createdAt).toLocaleString()}</td>
                  <td>{r.targetName || r.targetId}</td>
                  <td>{r.requesterName || r.requestedBy}</td>
                  <td style={{ fontSize: '0.75rem', maxWidth: 220 }}>
                    {JSON.stringify(r.payload?.modules || r.payload || {})}
                  </td>
                  <td style={{ fontSize: '0.7rem', maxWidth: 160, wordBreak: 'break-all' }}>{r.stamp || '—'}</td>
                  <td><span className={`badge ${r.status === 'Approved' ? 'badge-success' : r.status === 'Rejected' ? 'badge-danger' : 'badge-warning'}`}>{r.status}</span></td>
                  <td>
                    {r.status === 'Pending' && (isAdmin || true) && (
                      <div className="action-btn-group">
                        <button type="button" className="btn btn-sm btn-primary" onClick={async () => {
                          await decidePermRequest(r.id, true); setMsg('Stamped & applied.'); await fetchEmployees();
                        }}>Stamp approve</button>
                        <button type="button" className="btn btn-sm btn-secondary" onClick={async () => {
                          await decidePermRequest(r.id, false, 'Rejected by reviewer'); setMsg('Rejected.');
                        }}>Reject</button>
                      </div>
                    )}
                  </td>
                </tr>
              ))}
            </tbody>
          </table>
        </div>
      )}

      {editing && (
        <Modal title={`${isAdmin ? 'Stamp access' : 'Propose access'} — ${editing.emp.name}`} onClose={() => setEditing(null)}>
          {err && <div className="form-error">{err}</div>}
          {!isAdmin && (
            <p className="text-muted" style={{ fontSize: '0.85rem' }}>
              Your change will be escalated for manager/super-admin stamp before it applies.
            </p>
          )}
          <PermissionPicker
            value={editing.value}
            grantable={grantable}
            onChange={(v) => setEditing({ ...editing, value: v })}
          />
          <div className="action-btn-group" style={{ marginTop: '16px' }}>
            <button type="button" className="btn btn-secondary" onClick={() => setEditing(null)}>Cancel</button>
            <button type="button" className="btn btn-primary" onClick={save}>
              {isAdmin ? 'Apply with stamp' : 'Escalate for stamp'}
            </button>
          </div>
        </Modal>
      )}
    </div>
  );
}

export default Permissions;
