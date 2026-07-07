import React, { useEffect } from 'react';
import { Link } from 'react-router-dom';
import useStore from '../store';
import { hasCap } from '../permissions';

function Dashboard() {
  const { stats, fetchDashboardStats, user, leaves, fetchLeaves, employees, fetchEmployees,
    attendance, fetchAttendance, clockIn, clockOut, notifications, fetchNotifications } = useStore();
  const isAdmin = user?.role === 'admin';
  const canApprove = isAdmin || hasCap(user, 'approveLeaves');
  const isSupervisor = isAdmin || hasCap(user, 'createUsers');

  useEffect(() => {
    fetchDashboardStats(); fetchLeaves(); fetchAttendance(); fetchNotifications();
    if (isSupervisor) fetchEmployees();
  }, [fetchDashboardStats, fetchLeaves, fetchAttendance, fetchNotifications, fetchEmployees, isSupervisor]);

  if (!stats) return <div className="p-8">Loading stats...</div>;

  const kpis = [
    { label: 'Active Employees', value: stats.totalEmployees, icon: 'people', color: '#4f46e5' },
    { label: 'Pending Leaves', value: stats.pendingLeaves, icon: 'event_busy', color: '#fbbf24' },
    { label: 'Open Tickets', value: stats.openTickets, icon: 'support_agent', color: '#ef4444' },
    { label: 'Active Assets', value: stats.activeAssets, icon: 'devices', color: '#10b981' }
  ];

  const awaitingMe = leaves.filter(l => l.status === 'Pending' && (isAdmin || l.currentApproverId === user?.id));
  const submittedOnboarding = isSupervisor ? employees.filter(e => e.onboardingState === 'submitted') : [];
  const today = new Date().toISOString().split('T')[0];
  const todayLog = attendance.find(a => a.employeeId === user?.id && a.date === today);
  const recent = notifications.slice(0, 5);

  return (
    <div className="view-panel active-view">
      <div className="view-header">
        <div><h2>Executive Dashboard</h2><p>Key indicators and your pending actions.</p></div>
      </div>

      <div className="dashboard-grid">
        {kpis.map((kpi, i) => (
          <div key={i} className="kpi-card glass">
            <div className="kpi-icon-wrap" style={{ background: `${kpi.color}22`, color: kpi.color }}>
              <i className="material-icons-round">{kpi.icon}</i>
            </div>
            <div className="kpi-info"><h3>{kpi.value}</h3><p>{kpi.label}</p></div>
          </div>
        ))}
      </div>

      <div className="grid-2" style={{ marginTop: '8px' }}>
        <div className="glass p-6" style={{ textAlign: 'center' }}>
          <h3>Attendance — {today}</h3>
          <p style={{ margin: '10px 0' }}>
            {todayLog
              ? <>In <strong>{todayLog.checkIn || '—'}</strong> · Out <strong>{todayLog.checkOut || '—'}</strong> · <span className="badge badge-info">{todayLog.status}</span></>
              : 'You have not clocked in today.'}
          </p>
          {!todayLog && <button className="btn btn-primary" onClick={() => clockIn().catch(() => {})}>Clock In</button>}
          {todayLog && !todayLog.checkOut && <button className="btn btn-danger" onClick={() => clockOut().catch(() => {})}>Clock Out</button>}
        </div>

        <div className="glass p-6">
          <h3>Recent Notifications</h3>
          {recent.length === 0 ? <p className="text-muted" style={{ marginTop: '8px' }}>Nothing yet.</p> : recent.map(n => (
            <div key={n.id} style={{ padding: '8px 0', borderBottom: '1px solid var(--bg-card-border)' }}>
              <strong style={{ fontSize: '0.85rem' }}>{n.title}</strong>
              <p className="text-muted" style={{ fontSize: '0.8rem' }}>{n.body}</p>
            </div>
          ))}
        </div>
      </div>

      {(canApprove || isSupervisor) && (
        <div className="grid-2" style={{ marginTop: '20px' }}>
          {canApprove && (
            <div className="glass p-6">
              <h3>Leaves Awaiting Your Approval ({awaitingMe.length})</h3>
              {awaitingMe.length === 0 ? <p className="text-muted" style={{ marginTop: '8px' }}>All clear.</p> : awaitingMe.slice(0, 5).map(l => (
                <p key={l.id} style={{ padding: '6px 0', fontSize: '0.9rem' }}>
                  <strong>{l.employee?.name}</strong> — {l.leaveType}, {l.durationDays} day(s)
                </p>
              ))}
              <Link to="/leaves" className="btn btn-sm btn-secondary" style={{ marginTop: '8px', display: 'inline-flex' }}>Open approvals</Link>
            </div>
          )}
          {isSupervisor && (
            <div className="glass p-6">
              <h3>Onboarding Submitted ({submittedOnboarding.length})</h3>
              {submittedOnboarding.length === 0 ? <p className="text-muted" style={{ marginTop: '8px' }}>Nothing to review.</p> : submittedOnboarding.map(e => (
                <p key={e.id} style={{ padding: '6px 0', fontSize: '0.9rem' }}><strong>{e.name}</strong> — {e.department}</p>
              ))}
              <Link to="/onboarding" className="btn btn-sm btn-secondary" style={{ marginTop: '8px', display: 'inline-flex' }}>Open onboarding</Link>
            </div>
          )}
        </div>
      )}
    </div>
  );
}

export default Dashboard;
