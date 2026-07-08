import React, { useEffect, useState } from 'react';
import useStore from '../store';
import { hasCap } from '../permissions';

const DOC_TYPES = [
  { v: 'offer_letter', l: 'Offer letter' },
  { v: 'appointment', l: 'Appointment letter' },
  { v: 'relieving_letter', l: 'Relieving letter' },
  { v: 'onboarding_signoff', l: 'Onboarding sign-off' },
  { v: 'resignation_ack', l: 'Resignation acknowledgement' },
  { v: 'other', l: 'Other' }
];

function Workflows() {
  const {
    user, employees, fetchEmployees, hrDocs, fetchHrDocs, issueHrDoc, signHrDoc,
    resignations, fetchResignations, submitResignation, decideResignation
  } = useStore();
  const isAdmin = user?.role === 'admin';
  const canIssue = isAdmin || hasCap(user, 'createUsers');
  const isHr = isAdmin || (user?.department || '').toLowerCase().includes('hr');
  const [tab, setTab] = useState('docs');
  const [msg, setMsg] = useState('');
  const [docForm, setDocForm] = useState({ employeeId: '', type: 'offer_letter', title: '', body: '' });
  const [resForm, setResForm] = useState({ reason: '', lastWorkingDay: '' });

  useEffect(() => {
    fetchHrDocs(canIssue);
    fetchResignations();
    if (canIssue) fetchEmployees();
  }, [fetchHrDocs, fetchResignations, fetchEmployees, canIssue]);

  return (
    <div className="view-panel active-view">
      <div className="view-header">
        <div>
          <h2>HR Workflows</h2>
          <p>Letters, onboarding sign-off, and resignation (Manager → HR/Admin).</p>
        </div>
      </div>
      {msg && <p className="form-ok">{msg}</p>}
      <div className="tab-navigation">
        <button type="button" className={`tab-btn ${tab === 'docs' ? 'active' : ''}`} onClick={() => setTab('docs')}>Documents &amp; sign-off</button>
        <button type="button" className={`tab-btn ${tab === 'exit' ? 'active' : ''}`} onClick={() => setTab('exit')}>Resignation</button>
      </div>

      {tab === 'docs' && (
        <div className="grid-2" style={{ marginTop: 12, gap: 16 }}>
          {canIssue && (
            <form className="glass p-6" style={{ display: 'grid', gap: 12 }} onSubmit={async (e) => {
              e.preventDefault(); setMsg('');
              try {
                await issueHrDoc(docForm);
                setDocForm({ employeeId: '', type: 'offer_letter', title: '', body: '' });
                setMsg('Document issued — employee notified.');
              } catch (err) { setMsg(err.message); }
            }}>
              <h3>Issue document</h3>
              <select className="form-control" required value={docForm.employeeId} onChange={(e) => setDocForm({ ...docForm, employeeId: e.target.value })}>
                <option value="">Employee…</option>
                {employees.map((emp) => <option key={emp.id} value={emp.id}>{emp.name}</option>)}
              </select>
              <select className="form-control" value={docForm.type} onChange={(e) => setDocForm({ ...docForm, type: e.target.value })}>
                {DOC_TYPES.map((t) => <option key={t.v} value={t.v}>{t.l}</option>)}
              </select>
              <input className="form-control" placeholder="Title" required value={docForm.title} onChange={(e) => setDocForm({ ...docForm, title: e.target.value })} />
              <textarea className="form-control" rows={4} placeholder="Body / terms" value={docForm.body} onChange={(e) => setDocForm({ ...docForm, body: e.target.value })} />
              <button type="submit" className="btn btn-primary">Issue</button>
            </form>
          )}
          <div className="glass p-6">
            <h3>{canIssue ? 'All issued documents' : 'My documents'}</h3>
            <div className="table-responsive">
              <table className="table">
                <thead><tr><th>Title</th><th>Type</th><th>Status</th><th></th></tr></thead>
                <tbody>
                  {(hrDocs || []).length === 0 && <tr><td colSpan={4} className="text-muted">None yet.</td></tr>}
                  {(hrDocs || []).map((d) => (
                    <tr key={d.id}>
                      <td><strong>{d.title}</strong><div className="text-muted" style={{ fontSize: '0.75rem' }}>{(d.body || '').slice(0, 80)}</div></td>
                      <td>{d.type}</td>
                      <td><span className={`badge ${d.status === 'Signed' ? 'badge-success' : 'badge-warning'}`}>{d.status}</span></td>
                      <td>
                        {d.status !== 'Signed' && (d.employeeId === user?.id || isAdmin) && (
                          <button type="button" className="btn btn-sm btn-primary" onClick={async () => {
                            try { await signHrDoc(d.id); setMsg('Signed.'); } catch (e) { setMsg(e.message); }
                          }}>Sign</button>
                        )}
                      </td>
                    </tr>
                  ))}
                </tbody>
              </table>
            </div>
          </div>
        </div>
      )}

      {tab === 'exit' && (
        <div className="grid-2" style={{ marginTop: 12, gap: 16 }}>
          <form className="glass p-6" style={{ display: 'grid', gap: 12 }} onSubmit={async (e) => {
            e.preventDefault(); setMsg('');
            try {
              await submitResignation(resForm);
              setResForm({ reason: '', lastWorkingDay: '' });
              setMsg('Resignation filed → goes to your manager first, then HR/Admin.');
            } catch (err) { setMsg(err.message); }
          }}>
            <h3>Submit resignation</h3>
            <p className="text-muted" style={{ fontSize: '0.8rem' }}>Flow: You → Manager decide → HR/Admin final + relieving letter.</p>
            <label>Last working day</label>
            <input className="form-control" type="date" required value={resForm.lastWorkingDay} onChange={(e) => setResForm({ ...resForm, lastWorkingDay: e.target.value })} />
            <label>Reason</label>
            <textarea className="form-control" rows={3} required value={resForm.reason} onChange={(e) => setResForm({ ...resForm, reason: e.target.value })} />
            <button type="submit" className="btn btn-danger">Submit resignation</button>
          </form>
          <div className="glass p-6">
            <h3>Cases</h3>
            <div className="table-responsive">
              <table className="table">
                <thead><tr><th>Employee</th><th>LWD</th><th>Status</th><th>Actions</th></tr></thead>
                <tbody>
                  {(resignations || []).map((r) => (
                    <tr key={r.id}>
                      <td>{r.employeeName || r.employeeId}<div className="text-muted" style={{ fontSize: '0.75rem' }}>{r.reason}</div></td>
                      <td>{r.lastWorkingDay}</td>
                      <td><span className="badge badge-warning">{r.status}</span></td>
                      <td className="action-btn-group">
                        {r.employeeId === user?.id && ['PendingManager', 'PendingHR'].includes(r.status) && (
                          <button type="button" className="btn btn-sm btn-secondary" onClick={() => decideResignation(r.id, 'withdraw')}>Withdraw</button>
                        )}
                        {r.status === 'PendingManager' && (isAdmin || r.managerId === user?.id) && (
                          <>
                            <button type="button" className="btn btn-sm btn-primary" onClick={() => {
                              const note = window.prompt('Manager note (optional)') || '';
                              decideResignation(r.id, 'manager_approve', note);
                            }}>Mgr approve → HR</button>
                            <button type="button" className="btn btn-sm btn-secondary" onClick={() => {
                              const note = window.prompt('Rejection reason') || '';
                              decideResignation(r.id, 'manager_reject', note);
                            }}>Mgr reject</button>
                          </>
                        )}
                        {r.status === 'PendingHR' && isHr && (
                          <>
                            <button type="button" className="btn btn-sm btn-primary" onClick={() => {
                              const note = window.prompt('HR note') || '';
                              decideResignation(r.id, 'hr_approve', note);
                            }}>HR approve</button>
                            <button type="button" className="btn btn-sm btn-secondary" onClick={() => {
                              const note = window.prompt('HR reject reason') || '';
                              decideResignation(r.id, 'hr_reject', note);
                            }}>HR reject</button>
                          </>
                        )}
                      </td>
                    </tr>
                  ))}
                </tbody>
              </table>
            </div>
          </div>
        </div>
      )}
    </div>
  );
}

export default Workflows;
