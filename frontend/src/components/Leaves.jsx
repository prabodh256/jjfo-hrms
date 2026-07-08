import React, { useEffect, useState } from 'react';
import useStore from '../store';
import { hasCap } from '../permissions';
import MiniBars from './MiniBars';

const TYPES = ['Annual Leave', 'Sick Leave', 'Casual Leave'];
const EMPTY = { employeeId: '', leaveType: 'Annual Leave', startDate: '', endDate: '', reason: '', comment: '', status: 'Pending' };

function days(a, b) { if (!a || !b) return 0; const d = (new Date(b) - new Date(a)) / 86400000; return d >= 0 ? d + 1 : 0; }

function StatusBadge({ l }) {
  const cls = l.status === 'Approved' ? 'badge-success' : l.status === 'Rejected' ? 'badge-danger' : 'badge-warning';
  return <span className={`badge ${cls}`}>{l.status}</span>;
}
function Progress({ l }) {
  if (l.requiredLevels <= 1) return <small className="text-muted">1-step</small>;
  return <small className="text-muted">{l.approvedLevels}/{l.requiredLevels} approvals{l.durationDays > 5 ? ' (>5 days)' : ''}</small>;
}

function BalanceCards({ bal }) {
  if (!bal) return null;
  const items = [
    { label: 'Annual', d: bal.annual, color: '#4f46e5' },
    { label: 'Sick', d: bal.sick, color: '#14b8a6' },
    { label: 'Casual', d: bal.casual, color: '#f43f5e' }
  ];
  return (
    <div className="dashboard-grid" style={{ marginBottom: '24px' }}>
      {items.map(it => (
        <div key={it.label} className="kpi-card glass">
          <div className="kpi-icon-wrap" style={{ background: `${it.color}22`, color: it.color }}>
            <i className="material-icons-round">event_available</i>
          </div>
          <div className="kpi-info">
            <h3>{it.d.available}<small style={{ fontSize: '0.8rem', opacity: 0.6 }}> / {it.d.total}</small></h3>
            <p>{it.label} — {it.d.used} used</p>
          </div>
        </div>
      ))}
    </div>
  );
}

const REG_EMPTY = { date: '', actualCheckIn: '', actualCheckOut: '', reason: '' };

function Leaves() {
  const { leaves, fetchLeaves, createLeave, approveLeave, rejectLeave, cancelLeave, leaveBalances, fetchLeaveBalances, updateLeaveBalance, bulkLeaveAllotment, employees, fetchEmployees, user,
    attendance, fetchAttendance, clockIn, clockOut, regularize, regularizations, fetchRegularizations, decideRegularization, holidays, fetchHolidays } = useStore();
  const isAdmin = user?.role === 'admin';
  const canApprove = isAdmin || hasCap(user, 'approveLeaves');
  const canAdjust = isAdmin;

  const [tab, setTab] = useState('balances');
  const [form, setForm] = useState(EMPTY);
  const [msg, setMsg] = useState('');
  const [balEdit, setBalEdit] = useState({});
  const [reg, setReg] = useState(REG_EMPTY);
  const [bulk, setBulk] = useState({ annual: 15, sick: 7, casual: 7, all: true, selected: [] });

  useEffect(() => {
    fetchLeaves(); fetchLeaveBalances(); fetchEmployees(); fetchHolidays();
    fetchAttendance(); fetchRegularizations();
  }, [fetchLeaves, fetchLeaveBalances, fetchEmployees, fetchHolidays, fetchAttendance, fetchRegularizations]);

  const today = new Date().toISOString().split('T')[0];
  const todayLog = attendance.find(a => a.employeeId === user?.id && a.date === today);
  const pendingRegs = regularizations.filter(r => r.status === 'Pending' && r.employeeId !== user?.id);
  const myRegs = regularizations.filter(r => r.employeeId === user?.id);

  const submitReg = async (e) => {
    e.preventDefault(); setMsg('');
    try { await regularize(reg); setReg(REG_EMPTY); setMsg('Regularization requested.'); }
    catch (err) { setMsg(err.message); }
  };

  const myBal = leaveBalances.find(b => b.employeeId === user?.id);
  // Server already scopes trail (own + team for managers + all for admin)
  const visibleLeaves = leaves;
  const teamTrail = leaves.filter(l => l.employeeId !== user?.id);
  const pendingForMe = leaves.filter(l => l.status === 'Pending' && (isAdmin || l.currentApproverId === user?.id));

  const submit = async (e) => {
    e.preventDefault(); setMsg('');
    try {
      const payload = { ...form, durationDays: days(form.startDate, form.endDate) };
      if (!isAdmin) { delete payload.employeeId; delete payload.status; }
      await createLeave(payload);
      setForm(EMPTY);
      setMsg('Leave submitted — days reserved from balance immediately (released if rejected/cancelled).');
      setTab('history');
      await fetchLeaveBalances();
    } catch (err) { setMsg(err.message); }
  };

  const runBulk = async (e) => {
    e.preventDefault(); setMsg('');
    try {
      const body = {
        annual: Number(bulk.annual), sick: Number(bulk.sick), casual: Number(bulk.casual),
        all: bulk.all,
        employeeIds: bulk.all ? [] : bulk.selected
      };
      const r = await bulkLeaveAllotment(body);
      setMsg(`Year allotment applied to ${r?.updated || 0} employee(s).`);
    } catch (err) { setMsg(err.message); }
  };

  const saveBalance = async (b) => {
    const e = balEdit[b.employeeId] || {};
    await updateLeaveBalance(b.employeeId, {
      annual: e.annual ?? b.annual.total, sick: e.sick ?? b.sick.total, casual: e.casual ?? b.casual.total
    });
    setBalEdit({ ...balEdit, [b.employeeId]: undefined });
  };

  const act = async (fn, id, needNote) => {
    setMsg('');
    try {
      let note;
      if (needNote) note = window.prompt('Comment (optional)') || '';
      await fn(id, note);
    } catch (e) { setMsg(e.message); }
  };

  return (
    <div className="view-panel active-view">
      <div className="view-header"><div><h2>Leave &amp; Attendance</h2><p>Balances reserve on apply; managers see team trail. Admin sets yearly allotments.</p></div></div>
      {msg && <p>{msg}</p>}

      <div className="tab-navigation">
        <button type="button" className={`tab-btn ${tab === 'balances' ? 'active' : ''}`} onClick={() => setTab('balances')}>Balances</button>
        {isAdmin && <button type="button" className={`tab-btn ${tab === 'allot' ? 'active' : ''}`} onClick={() => setTab('allot')}>Year allotment</button>}
        <button type="button" className={`tab-btn ${tab === 'apply' ? 'active' : ''}`} onClick={() => setTab('apply')}>{isAdmin ? 'Add Leave' : 'Apply Leave'}</button>
        <button type="button" className={`tab-btn ${tab === 'attendance' ? 'active' : ''}`} onClick={() => setTab('attendance')}>Attendance {pendingRegs.length && canApprove ? `(${pendingRegs.length})` : ''}</button>
        {canApprove && <button type="button" className={`tab-btn ${tab === 'approvals' ? 'active' : ''}`} onClick={() => setTab('approvals')}>Approvals {pendingForMe.length ? `(${pendingForMe.length})` : ''}</button>}
        <button type="button" className={`tab-btn ${tab === 'history' ? 'active' : ''}`} onClick={() => setTab('history')}>Leave trail</button>
        <button type="button" className={`tab-btn ${tab === 'charts' ? 'active' : ''}`} onClick={() => setTab('charts')}>Charts</button>
      </div>

      {tab === 'charts' && (
        <div className="grid-2" style={{ gap: 16, marginTop: 8 }}>
          <MiniBars
            title="My leave balance (available)"
            items={myBal ? [
              { label: 'Annual', value: myBal.annual.available, color: '#4f46e5' },
              { label: 'Sick', value: myBal.sick.available, color: '#14b8a6' },
              { label: 'Casual', value: myBal.casual.available, color: '#f43f5e' }
            ] : []}
          />
          <MiniBars
            title="Leave status (visible trail)"
            items={[
              { label: 'Pending', value: leaves.filter(l => l.status === 'Pending').length, color: '#fbbf24' },
              { label: 'Approved', value: leaves.filter(l => l.status === 'Approved').length, color: '#10b981' },
              { label: 'Rejected', value: leaves.filter(l => l.status === 'Rejected').length, color: '#ef4444' },
              { label: 'Late flag', value: leaves.filter(l => l.lateApplied).length, color: '#dc2626' }
            ]}
          />
          <MiniBars
            title="Attendance status (recent)"
            color="#6366f1"
            items={[
              { label: 'On Time', value: attendance.filter(a => a.status === 'On Time').length },
              { label: 'Late', value: attendance.filter(a => a.status === 'Late').length },
              { label: 'Regularized', value: attendance.filter(a => a.status === 'Regularized').length }
            ]}
          />
        </div>
      )}

      {tab === 'balances' && (
        <div>
          <BalanceCards bal={myBal} />
          {myBal && (
            <p className="text-muted" style={{ fontSize: '0.8rem', marginBottom: 12 }}>
              Used includes pending reservations. Pending: A{myBal.annual.pending || 0} / S{myBal.sick.pending || 0} / C{myBal.casual.pending || 0}.
            </p>
          )}
          {(isAdmin || canApprove) && (
            <div className="table-responsive">
              <table className="table">
                <thead><tr><th>Employee</th><th>Annual</th><th>Sick</th><th>Casual</th>{canAdjust && <th>Adjust totals</th>}</tr></thead>
                <tbody>
                  {leaveBalances.map(b => {
                    const e = balEdit[b.employeeId] || {};
                    return (
                      <tr key={b.employeeId}>
                        <td><strong>{b.name}</strong></td>
                        <td>{b.annual.available} / {b.annual.total} <small>({b.annual.used} used{b.annual.pending ? `, ${b.annual.pending} pend` : ''})</small></td>
                        <td>{b.sick.available} / {b.sick.total} <small>({b.sick.used} used)</small></td>
                        <td>{b.casual.available} / {b.casual.total} <small>({b.casual.used} used)</small></td>
                        {canAdjust && (
                          <td>
                            <div className="action-btn-group">
                              <input className="form-control" style={{ width: '64px' }} type="number" title="Annual"
                                value={e.annual ?? b.annual.total} onChange={ev => setBalEdit({ ...balEdit, [b.employeeId]: { ...e, annual: Number(ev.target.value) } })} />
                              <input className="form-control" style={{ width: '64px' }} type="number" title="Sick"
                                value={e.sick ?? b.sick.total} onChange={ev => setBalEdit({ ...balEdit, [b.employeeId]: { ...e, sick: Number(ev.target.value) } })} />
                              <input className="form-control" style={{ width: '64px' }} type="number" title="Casual"
                                value={e.casual ?? b.casual.total} onChange={ev => setBalEdit({ ...balEdit, [b.employeeId]: { ...e, casual: Number(ev.target.value) } })} />
                              <button type="button" className="btn btn-sm btn-primary" onClick={() => saveBalance(b)}>Save</button>
                            </div>
                          </td>
                        )}
                      </tr>
                    );
                  })}
                </tbody>
              </table>
            </div>
          )}
        </div>
      )}

      {tab === 'allot' && isAdmin && (
        <div className="glass p-6" style={{ maxWidth: 560 }}>
          <h3>Year-start leave allotment</h3>
          <p className="text-muted" style={{ fontSize: '0.85rem' }}>
            Set Annual / Sick / Casual totals for <strong>all active employees</strong> or a selected subset.
          </p>
          <form onSubmit={runBulk} style={{ display: 'grid', gap: '1rem', marginTop: '1rem' }}>
            <div className="form-grid">
              <div className="form-group"><label>Annual</label>
                <input className="form-control" type="number" min={0} value={bulk.annual} onChange={e => setBulk({ ...bulk, annual: e.target.value })} /></div>
              <div className="form-group"><label>Sick</label>
                <input className="form-control" type="number" min={0} value={bulk.sick} onChange={e => setBulk({ ...bulk, sick: e.target.value })} /></div>
              <div className="form-group"><label>Casual</label>
                <input className="form-control" type="number" min={0} value={bulk.casual} onChange={e => setBulk({ ...bulk, casual: e.target.value })} /></div>
            </div>
            <label className="perm-item">
              <input type="checkbox" checked={bulk.all} onChange={e => setBulk({ ...bulk, all: e.target.checked })} />
              <span>Apply to all active employees</span>
            </label>
            {!bulk.all && (
              <div className="perm-grid">
                {employees.filter(e => e.status !== 'inactive').map(emp => (
                  <label key={emp.id} className="perm-item">
                    <input
                      type="checkbox"
                      checked={bulk.selected.includes(emp.id)}
                      onChange={() => setBulk({
                        ...bulk,
                        selected: bulk.selected.includes(emp.id)
                          ? bulk.selected.filter(id => id !== emp.id)
                          : [...bulk.selected, emp.id]
                      })}
                    />
                    <span>{emp.name}</span>
                  </label>
                ))}
              </div>
            )}
            <button type="submit" className="btn btn-primary">Apply allotment</button>
          </form>
        </div>
      )}

      {tab === 'apply' && (
        <div className="glass p-6">
          <h3>{isAdmin ? 'Add Leave for an Employee' : 'Apply for Leave'}</h3>
          <p className="text-muted" style={{ fontSize: '0.8rem' }}>
            Requests over 5 days require approval from two levels up the reporting chain. Company holidays are excluded from the duration
            {holidays.length > 0 && <> ({holidays.map(h => `${h.date} ${h.name}`).join(' · ')})</>}.
          </p>
          <form onSubmit={submit} style={{ display: 'grid', gap: '1rem', maxWidth: '520px', marginTop: '1rem' }}>
            {isAdmin && (
              <div className="form-group"><label>Employee</label>
                <select className="form-control" value={form.employeeId} onChange={e => setForm({ ...form, employeeId: e.target.value })} required>
                  <option value="">Select employee…</option>
                  {employees.map(e => <option key={e.id} value={e.id}>{e.name}</option>)}
                </select></div>
            )}
            <div className="form-group"><label>Leave Type</label>
              <select className="form-control" value={form.leaveType} onChange={e => setForm({ ...form, leaveType: e.target.value })}>
                {TYPES.map(t => <option key={t}>{t}</option>)}</select></div>
            <div className="form-grid">
              <div className="form-group"><label>Start Date</label>
                <input className="form-control" type="date" value={form.startDate} onChange={e => setForm({ ...form, startDate: e.target.value })} required /></div>
              <div className="form-group"><label>End Date</label>
                <input className="form-control" type="date" value={form.endDate} onChange={e => setForm({ ...form, endDate: e.target.value })} required /></div>
            </div>
            <div className="form-group"><label>Reason</label>
              <textarea className="form-control" value={form.reason} onChange={e => setForm({ ...form, reason: e.target.value })} required /></div>
            <div className="form-group"><label>Comment (optional)</label>
              <textarea className="form-control" placeholder="Context for approvers…" value={form.comment} onChange={e => setForm({ ...form, comment: e.target.value })} /></div>
            <p className="text-muted" style={{ fontSize: '0.75rem' }}>
              Applying for past dates is allowed but permanently flagged <strong style={{ color: '#f87171' }}>Late apply</strong>.
            </p>
            {isAdmin && (
              <div className="form-group"><label>Status</label>
                <select className="form-control" value={form.status} onChange={e => setForm({ ...form, status: e.target.value })}>
                  <option>Pending</option><option>Approved</option></select></div>
            )}
            <div>Duration: <strong>{days(form.startDate, form.endDate)} day(s)</strong>{days(form.startDate, form.endDate) > 5 && <em> — needs 2-level approval</em>}</div>
            <button type="submit" className="btn btn-primary">Submit</button>
          </form>
        </div>
      )}

      {tab === 'attendance' && (
        <div>
          <div className="grid-2" style={{ marginBottom: '20px' }}>
            <div className="glass p-6" style={{ textAlign: 'center' }}>
              <h3>Today — {today}</h3>
              <p style={{ margin: '8px 0' }}>
                {todayLog ? <>In: <strong>{todayLog.checkIn || '—'}</strong> · Out: <strong>{todayLog.checkOut || '—'}</strong> · <span className="badge badge-info">{todayLog.status}</span></> : 'Not clocked in yet.'}
              </p>
              {!todayLog && <button className="btn btn-primary" onClick={async () => { try { await clockIn(); setMsg(''); } catch (e) { setMsg(e.message); } }}>Clock In</button>}
              {todayLog && !todayLog.checkOut && <button className="btn btn-danger" onClick={async () => { try { await clockOut(); } catch (e) { setMsg(e.message); } }}>Clock Out</button>}
            </div>
            <div className="glass p-6">
              <h3>Request Regularization</h3>
              <form onSubmit={submitReg} className="form-grid" style={{ marginTop: '10px' }}>
                <div className="form-group"><label>Date</label>
                  <input className="form-control" type="date" value={reg.date} onChange={e => setReg({ ...reg, date: e.target.value })} required /></div>
                <div className="form-group"><label>Reason</label>
                  <input className="form-control" value={reg.reason} onChange={e => setReg({ ...reg, reason: e.target.value })} required /></div>
                <div className="form-group"><label>Actual In</label>
                  <input className="form-control" type="time" value={reg.actualCheckIn} onChange={e => setReg({ ...reg, actualCheckIn: e.target.value })} required /></div>
                <div className="form-group"><label>Actual Out</label>
                  <input className="form-control" type="time" value={reg.actualCheckOut} onChange={e => setReg({ ...reg, actualCheckOut: e.target.value })} required /></div>
                <button type="submit" className="btn btn-primary" style={{ alignSelf: 'end' }}>Submit</button>
              </form>
            </div>
          </div>

          {canApprove && pendingRegs.length > 0 && (
            <div className="glass p-6" style={{ marginBottom: '20px' }}>
              <h3>Regularizations Awaiting Review</h3>
              <div className="table-responsive" style={{ marginTop: '10px' }}>
                <table className="table">
                  <thead><tr><th>Employee</th><th>Date</th><th>Requested Timings</th><th>Reason</th><th>Action</th></tr></thead>
                  <tbody>
                    {pendingRegs.map(r => (
                      <tr key={r.id}>
                        <td><strong>{r.employee?.name || r.employeeId}</strong></td>
                        <td>{r.date}</td><td>{r.actualCheckIn} → {r.actualCheckOut}</td><td>{r.reason}</td>
                        <td><div className="action-btn-group">
                          <button className="btn btn-sm btn-primary" onClick={() => decideRegularization(r.id, true)}>Approve</button>
                          <button className="btn btn-sm btn-danger" onClick={() => decideRegularization(r.id, false)}>Reject</button>
                        </div></td>
                      </tr>
                    ))}
                  </tbody>
                </table>
              </div>
            </div>
          )}

          <div className="table-responsive">
            <table className="table">
              <thead><tr>{isAdmin && <th>Employee</th>}<th>Date</th><th>In</th><th>Out</th><th>Status</th></tr></thead>
              <tbody>
                {attendance.length === 0 ? <tr><td colSpan={isAdmin ? 5 : 4}>No attendance records.</td></tr> : attendance.map(a => (
                  <tr key={a.id}>
                    {isAdmin && <td><strong>{a.employee?.name || a.employeeId}</strong></td>}
                    <td>{a.date}</td><td>{a.checkIn || '—'}</td><td>{a.checkOut || '—'}</td>
                    <td><span className={`badge ${a.status === 'Late' ? 'badge-warning' : 'badge-success'}`}>{a.status}</span></td>
                  </tr>
                ))}
              </tbody>
            </table>
          </div>

          {myRegs.length > 0 && (
            <p className="text-muted" style={{ marginTop: '10px', fontSize: '0.85rem' }}>
              My regularizations: {myRegs.map(r => `${r.date} (${r.status})`).join(' · ')}
            </p>
          )}
        </div>
      )}

      {tab === 'approvals' && canApprove && (
        <div className="table-responsive">
          <table className="table">
            <thead><tr><th>Employee</th><th>Type</th><th>Dates</th><th>Days</th><th>Reason</th><th>Approval</th><th>Action</th></tr></thead>
            <tbody>
              {pendingForMe.length === 0 ? <tr><td colSpan="7">Nothing awaiting your approval.</td></tr> : pendingForMe.map(l => (
                <tr key={l.id}>
                  <td><strong>{l.employee?.name || l.employeeId}</strong></td>
                  <td>{l.leaveType}</td><td>{l.startDate} → {l.endDate}</td><td>{l.durationDays}</td><td>{l.reason}</td>
                  <td><Progress l={l} /></td>
                  <td>
                    <div className="action-btn-group">
                      <button type="button" className="btn btn-sm btn-primary" onClick={() => act(approveLeave, l.id, true)}>Approve</button>
                      <button type="button" className="btn btn-sm btn-danger" onClick={() => act(rejectLeave, l.id, true)}>Reject</button>
                    </div>
                  </td>
                </tr>
              ))}
            </tbody>
          </table>
        </div>
      )}

      {tab === 'history' && (
        <div className="table-responsive">
          {(isAdmin || canApprove) && teamTrail.length > 0 && (
            <p className="text-muted" style={{ fontSize: '0.8rem', marginBottom: 8 }}>
              Showing your leaves and team trail ({teamTrail.length} team row(s)). Days are reserved when applied.
            </p>
          )}
          <table className="table">
            <thead><tr><th>Employee</th><th>Type</th><th>Dates</th><th>Days</th><th>Reason</th><th>Status</th><th>Approval</th><th></th></tr></thead>
            <tbody>
              {visibleLeaves.length === 0 ? <tr><td colSpan="8">No leave records.</td></tr> : visibleLeaves.map(l => (
                <tr key={l.id} className={`${l.employeeId !== user?.id ? 'trail-team-row' : ''} ${l.lateApplied ? 'leave-late-row' : ''}`}>
                  <td>
                    <strong>{l.employee?.name || l.employeeId}</strong>
                    {l.lateApplied && <div><span className="badge badge-danger">Late apply</span></div>}
                    {l.comment && <div className="text-muted" style={{ fontSize: '0.75rem' }}>Note: {l.comment}</div>}
                    {l.decisionNote && <div className="text-muted" style={{ fontSize: '0.75rem' }}>Decision: {l.decisionNote}</div>}
                  </td>
                  <td>{l.leaveType}</td><td>{l.startDate} → {l.endDate}</td><td>{l.durationDays}</td><td>{l.reason}</td>
                  <td><StatusBadge l={l} /></td>
                  <td><Progress l={l} /></td>
                  <td className="action-btn-group">
                    {l.employeeId === user?.id && l.status === 'Pending' && (
                      <button type="button" className="btn btn-sm btn-secondary" onClick={async () => {
                        try { await cancelLeave(l.id); await fetchLeaveBalances(); setMsg('Withdrawn — balance released.'); }
                        catch (e) { setMsg(e.message); }
                      }}>Withdraw</button>
                    )}
                    {isAdmin && ['Pending', 'Approved'].includes(l.status) && l.employeeId !== user?.id && (
                      <button type="button" className="btn btn-sm btn-secondary" onClick={async () => {
                        const note = window.prompt('Cancel note (optional)') || '';
                        try { await cancelLeave(l.id, note); await fetchLeaveBalances(); } catch (e) { setMsg(e.message); }
                      }}>Cancel</button>
                    )}
                  </td>
                </tr>
              ))}
            </tbody>
          </table>
        </div>
      )}
    </div>
  );
}

export default Leaves;
