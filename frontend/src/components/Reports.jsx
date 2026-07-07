import React, { useEffect, useState } from 'react';
import useStore from '../store';

const KINDS = [
  { key: 'headcount', label: 'Headcount by department' },
  { key: 'leave-utilization', label: 'Leave utilization' },
  { key: 'payroll-cycles', label: 'Payroll cycles' },
  { key: 'asset-allocation', label: 'Asset allocation' },
  { key: 'helpdesk-resolution', label: 'Helpdesk resolution' },
  { key: 'permission-changes', label: 'Permission changes' }
];

function Reports() {
  const { report, fetchReport } = useStore();
  const [kind, setKind] = useState('headcount');

  useEffect(() => { fetchReport(kind); }, [fetchReport, kind]);

  const rows = report?.kind === kind ? report.rows : [];
  const cols = rows.length ? Object.keys(rows[0]) : [];

  return (
    <div className="view-panel active-view">
      <div className="view-header">
        <div><h2>Reports</h2><p>Operational summaries with CSV export.</p></div>
        <a className="btn btn-primary" href={`/api/reports/${kind}?format=csv`} download>
          <i className="material-icons-round">download</i> Download CSV
        </a>
      </div>
      <div className="tab-navigation">
        {KINDS.map(k => (
          <button key={k.key} className={`tab-btn ${kind === k.key ? 'active' : ''}`} onClick={() => setKind(k.key)}>{k.label}</button>
        ))}
      </div>
      <div className="table-responsive" style={{ marginTop: '12px' }}>
        <table className="table">
          <thead><tr>{cols.map(c => <th key={c}>{c}</th>)}</tr></thead>
          <tbody>
            {rows.length === 0 ? <tr><td>No data.</td></tr> : rows.map((r, i) => (
              <tr key={i}>{cols.map(c => <td key={c}>{String(r[c] ?? '—')}</td>)}</tr>
            ))}
          </tbody>
        </table>
      </div>
    </div>
  );
}

export default Reports;
