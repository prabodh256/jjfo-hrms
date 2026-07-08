import React, { useEffect } from 'react';
import { Link } from 'react-router-dom';
import useStore from '../store';
import { hasCap } from '../permissions';

function Dashboard() {
  const {
    stats, fetchDashboardStats, user, leaves, fetchLeaves, employees, fetchEmployees,
    attendance, fetchAttendance, clockIn, clockOut, notifications, fetchNotifications
  } = useStore();
  const isAdmin = user?.role === 'admin';
  const canApprove = isAdmin || hasCap(user, 'approveLeaves');
  const isSupervisor = isAdmin || hasCap(user, 'createUsers');

  useEffect(() => {
    fetchDashboardStats();
    fetchLeaves();
    fetchAttendance();
    fetchNotifications();
    if (isSupervisor) fetchEmployees();
  }, [fetchDashboardStats, fetchLeaves, fetchAttendance, fetchNotifications, fetchEmployees, isSupervisor]);

  if (!stats) return <div className="p-8">Loading stats...</div>;

  const kpis = [
    { label: 'Active Employees', value: stats.totalEmployees, icon: 'people', color: '#4f46e5', to: '/directory' },
    { label: 'Pending Leaves', value: stats.pendingLeaves, icon: 'event_busy', color: '#fbbf24', to: '/leaves' },
    { label: 'Open Tickets', value: stats.openTickets, icon: 'support_agent', color: '#ef4444', to: '/helpdesk' },
    { label: 'Active Assets', value: stats.activeAssets, icon: 'devices', color: '#10b981', to: '/assets' }
  ];

  const awaitingMe = leaves.filter((l) => l.status === 'Pending' && (isAdmin || l.currentApproverId === user?.id));
  const submittedOnboarding = isSupervisor ? employees.filter((e) => e.onboardingState === 'submitted') : [];
  const today = new Date().toISOString().split('T')[0];
  const todayLog = attendance.find((a) => a.employeeId === user?.id && a.date === today);
  const recent = notifications.slice(0, 5);

  return (
    <div className="view-panel active-view">
      <div className="view-header">
        <div><h2>Executive Dashboard</h2><p>Click a KPI to open the module. Pending work is linked below.</p></div>
      </div>

      <div className="dashboard-grid">
        {kpis.map((kpi) => (
          <Link key={kpi.to} to={kpi.to} className="kpi-card glass kpi-link">
            <div className="kpi-icon-wrap" style={{ background: `${kpi.color}22`, color: kpi.color }}>
              <i className="material-icons-round">{kpi.icon}</i>
            </div>
            <div className="kpi-info"><h3>{kpi.value}</h3><p>{kpi.label}</p></div>
          </Link>
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
          {!todayLog && <button type="button" className="btn btn-primary" onClick={() => clockIn().catch(() => {})}>Clock In</button>}
          {todayLog && !todayLog.checkOut && <button type="button" className="btn btn-danger" onClick={() => clockOut().catch(() => {})}>Clock Out</button>}
          <div style={{ marginTop: 12 }}><Link to="/leaves" className="btn btn-sm btn-secondary">Leave &amp; attendance</Link></div>
        </div>

        <div className="glass p-6">
          <div style={{ display: 'flex', justifyContent: 'space-between' }}>
            <h3>Recent Notifications</h3>
            <Link to="/settings" className="text-muted" style={{ fontSize: '0.8rem' }}>Prefs</Link>
          </div>
          {recent.length === 0 ? <p className="text-muted" style={{ marginTop: '8px' }}>Nothing yet.</p> : recent.map((n) => (
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
              <h3>Leaves Awaiting You ({awaitingMe.length})</h3>
              {awaitingMe.length === 0 ? <p className="text-muted" style={{ marginTop: '8px' }}>All clear.</p> : awaitingMe.slice(0, 5).map((l) => (
                <p key={l.id} style={{ padding: '6px 0', fontSize: '0.9rem' }}>
                  <strong>{l.employee?.name}</strong> — {l.leaveType}, {l.durationDays} day(s)
                  {l.lateApplied && <span className="badge badge-danger" style={{ marginLeft: 6 }}>Late apply</span>}
                </p>
              ))}
              <Link to="/leaves" className="btn btn-sm btn-primary">Open approvals</Link>
            </div>
          )}
          {isSupervisor && (
            <div className="glass p-6">
              <h3>Onboarding queue ({submittedOnboarding.length})</h3>
              {submittedOnboarding.length === 0 ? <p className="text-muted" style={{ marginTop: 8 }}>None submitted.</p> : submittedOnboarding.slice(0, 5).map((e) => (
                <p key={e.id}>{e.name}</p>
              ))}
              <Link to="/onboarding" className="btn btn-sm btn-primary">Review onboarding</Link>
            </div>
          )}
        </div>
      )}

      <div className="dash-quick" style={{ marginTop: 20 }}>
        <Link to="/directory" className="btn btn-secondary btn-sm">Org &amp; directory</Link>
        <Link to="/payroll" className="btn btn-secondary btn-sm">My payslips</Link>
        <Link to="/workflows" className="btn btn-secondary btn-sm">HR workflows</Link>
        <Link to="/helpdesk" className="btn btn-secondary btn-sm">Helpdesk</Link>
      </div>
    </div>
  );
}

export default Dashboard;
