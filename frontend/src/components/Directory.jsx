import React, { useEffect, useState } from 'react';
import useStore from '../store';
import { hasCap } from '../permissions';
import Modal from './Modal';
import EmployeeForm from './EmployeeForm';

function Directory() {
  const { employees, fetchEmployees, user, addEmployee, updateEmployee, updateSelf, deactivateEmployee, setManager, grantable, fetchGrantable, resetPassword, orgMe, fetchOrgMe } = useStore();
  const [tab, setTab] = useState('grid');
  const [query, setQuery] = useState('');
  const [showInactive, setShowInactive] = useState(false);
  const [modal, setModal] = useState(null); // { mode, employee }

  useEffect(() => { fetchEmployees(showInactive); fetchGrantable(); fetchOrgMe(); }, [fetchEmployees, fetchGrantable, fetchOrgMe, showInactive]);

  const isAdmin = user?.role === 'admin';
  const canCreate = hasCap(user, 'createUsers');
  const canHierarchy = isAdmin || hasCap(user, 'manageHierarchy');
  const q = query.trim().toLowerCase();
  const filtered = employees.filter(e =>
    !q || [e.name, e.email, e.department, e.designation].some(v => (v || '').toLowerCase().includes(q))
  );
  const activeEmployees = employees.filter(e => e.status === 'active');

  const submit = async (payload) => {
    if (modal.mode === 'create') await addEmployee(payload);
    else if (modal.mode === 'self') await updateSelf(payload);
    else await updateEmployee(modal.employee.id, payload);
    setModal(null);
  };

  const deactivate = async (emp) => {
    if (window.confirm(`Deactivate ${emp.name}? They will no longer be able to sign in; all history is preserved.`)) {
      try { await deactivateEmployee(emp.id); } catch (e) { window.alert(e.message); }
    }
  };

  const buildTree = (empId) => {
    const node = employees.find(e => e.id === empId);
    if (!node) return null;
    const reports = activeEmployees.filter(e => e.managerId === empId);
    return (
      <li key={node.id} className="org-node-wrap">
        <div className="org-node glass">
          <img src={node.avatar || 'https://via.placeholder.com/150'} alt={node.name} />
          <div className="org-node-info">
            <h5>{node.name}</h5>
            <p>{node.designation}</p>
            <span className="org-dept">{node.department}</span>
          </div>
        </div>
        {reports.length > 0 && <ul className="org-children">{reports.map(r => buildTree(r.id))}</ul>}
      </li>
    );
  };
  const roots = activeEmployees.filter(e => !e.managerId || !activeEmployees.some(m => m.id === e.managerId));

  return (
    <div className="view-panel active-view">
      <div className="view-header">
        <div>
          <h2>Corporate Directory &amp; Org Structure</h2>
          <p>Browse JJFO employees and reporting lines.</p>
        </div>
        <div className="search-wrap">
          <i className="material-icons-round">search</i>
          <input className="form-control" placeholder="Search by name, dept, role…" value={query} onChange={e => setQuery(e.target.value)} />
        </div>
      </div>

      <div className="view-toolbar">
        <div className="tab-navigation" style={{ border: 'none', margin: 0, padding: 0 }}>
          <button type="button" className={`tab-btn ${tab === 'grid' ? 'active' : ''}`} onClick={() => setTab('grid')}>Directory Grid</button>
          <button type="button" className={`tab-btn ${tab === 'org' ? 'active' : ''}`} onClick={() => setTab('org')}>Full Org</button>
          <button type="button" className={`tab-btn ${tab === 'myorg' ? 'active' : ''}`} onClick={() => setTab('myorg')}>My hierarchy</button>
        </div>
        <div className="action-btn-group">
          {isAdmin && (
            <button className={`btn ${showInactive ? 'btn-primary' : 'btn-secondary'}`} onClick={() => setShowInactive(!showInactive)}>
              <i className="material-icons-round">visibility</i> {showInactive ? 'Hiding nothing' : 'Show inactive'}
            </button>
          )}
          {canCreate && (
            <button className="btn btn-primary" onClick={() => setModal({ mode: 'create' })}>
              <i className="material-icons-round">person_add</i> Add Employee
            </button>
          )}
        </div>
      </div>

      <div className="tab-content-area" style={{ marginTop: '16px' }}>
        {tab === 'grid' && (
          <div className="employee-grid">
            {filtered.length === 0 ? <p>No employees match your search.</p> : filtered.map(emp => (
              <div key={emp.id} className="employee-card glass">
                <span className={`status-badge ${emp.status === 'active' ? 'badge-success' : emp.status === 'inactive' ? 'badge-danger' : 'badge-warning'}`}>
                  {emp.status === 'active' ? 'Active' : emp.status === 'inactive' ? 'Inactive' : 'Draft'}
                </span>
                <div className="emp-card-header">
                  <img src={emp.avatar || 'https://via.placeholder.com/150'} alt={emp.name} />
                  <h4>{emp.name}</h4>
                  <p>{emp.designation}</p>
                  <span className="dept-tag">{emp.department}</span>
                </div>
                <div className="emp-card-body">
                  <div className="info-row"><i className="material-icons-round">email</i><span>{emp.email}</span></div>
                  <div className="info-row"><i className="material-icons-round">call</i><span>{emp.contact || 'N/A'}</span></div>
                </div>
                <div className="action-btn-group">
                  {(canCreate || emp.id === user?.id) && (
                    <button className="btn btn-sm btn-secondary" onClick={() =>
                      setModal({ mode: canCreate ? 'edit' : 'self', employee: emp })}>
                      <i className="material-icons-round">edit</i> {emp.id === user?.id && !canCreate ? 'My Profile' : 'Edit'}
                    </button>
                  )}
                  {isAdmin && (
                    <button className="btn btn-sm btn-secondary" title="Reset password" onClick={async () => {
                      const p = window.prompt(`New password for ${emp.name} (min 8 characters):`);
                      if (!p) return;
                      try { await resetPassword(emp.id, p); window.alert('Password reset.'); }
                      catch (e2) { window.alert(e2.message); }
                    }}>
                      <i className="material-icons-round">key</i>
                    </button>
                  )}
                  {isAdmin && emp.id !== user?.id && emp.status !== 'inactive' && (
                    <button className="btn btn-sm btn-danger" title="Deactivate" onClick={() => deactivate(emp)}>
                      <i className="material-icons-round">person_off</i>
                    </button>
                  )}
                </div>
              </div>
            ))}
          </div>
        )}
        {tab === 'org' && (
          <div className="org-tree-container"><ul className="org-tree">{roots.map(r => buildTree(r.id))}</ul></div>
        )}
        {tab === 'myorg' && (
          <div className="my-org glass p-6">
            <h3>My escalation chain (you → CEO)</h3>
            <p className="text-muted" style={{ fontSize: '0.85rem', marginBottom: 12 }}>
              Use this path for escalations. Bottom is the top of the org.
            </p>
            {!orgMe ? <p>Loading…</p> : (
              <>
                <ol className="chain-up">
                  <li className="chain-me">
                    <strong>{orgMe.me?.name}</strong> <span className="text-muted">(you)</span>
                    <div className="text-muted">{orgMe.me?.designation} · {orgMe.me?.department}</div>
                  </li>
                  {(orgMe.chainUp || []).map((m, i) => (
                    <li key={m.id}>
                      <strong>{m.name}</strong>
                      {i === (orgMe.chainUp.length - 1) && <em className="perm-badge"> top / CEO</em>}
                      <div className="text-muted">{m.designation} · {m.department} · {m.email}</div>
                    </li>
                  ))}
                </ol>
                <h3 style={{ marginTop: 20 }}>Direct reports</h3>
                {(orgMe.subordinates || []).length === 0 ? (
                  <p className="text-muted">No direct subordinates.</p>
                ) : (
                  <ul className="sub-list">
                    {orgMe.subordinates.map((s) => (
                      <li key={s.id}><strong>{s.name}</strong> — {s.designation} ({s.department})</li>
                    ))}
                  </ul>
                )}
              </>
            )}
          </div>
        )}
      </div>

      {modal && (
        <Modal wide title={modal.mode === 'create' ? 'Add New Employee' : modal.mode === 'self' ? 'Edit My Profile' : `Edit ${modal.employee.name}`} onClose={() => setModal(null)}>
          {modal.mode === 'edit' && canHierarchy && (
            <div className="form-group" style={{ borderBottom: '1px solid var(--bg-card-border)', paddingBottom: '14px', marginBottom: '14px' }}>
              <label>Reporting Manager (saves immediately)</label>
              <select className="form-control" defaultValue={modal.employee.managerId || ''}
                onChange={async e => { try { await setManager(modal.employee.id, e.target.value || null); } catch (e2) { window.alert(e2.message); } }}>
                <option value="">— No manager —</option>
                {employees.filter(m => m.id !== modal.employee.id && m.status === 'active').map(m => (
                  <option key={m.id} value={m.id}>{m.name}</option>
                ))}
              </select>
            </div>
          )}
          <EmployeeForm employee={modal.employee} mode={modal.mode} grantable={modal.mode !== 'self' ? grantable : null} onSubmit={submit} onCancel={() => setModal(null)} />
        </Modal>
      )}
    </div>
  );
}

export default Directory;
