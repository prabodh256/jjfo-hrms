import React, { useEffect, useState } from 'react';
import { apiGet, apiMutate } from '../api';
import useStore from '../store';

const CSV_COLUMNS = ['id', 'name', 'email', 'department', 'designation', 'managerId', 'doj', 'salaryBasic', 'salaryAllow', 'salaryDeduct', 'leaveAnnual', 'leaveSick', 'leaveCasual'];

function parseCsv(source) {
  const lines = source.replace(/\r/g, '').split('\n').filter((line) => line.trim());
  if (lines.length < 2) return [];
  const parseLine = (line) => {
    const values = []; let value = ''; let quoted = false;
    for (let i = 0; i < line.length; i += 1) {
      const char = line[i];
      if (char === '"' && line[i + 1] === '"') { value += '"'; i += 1; }
      else if (char === '"') quoted = !quoted;
      else if (char === ',' && !quoted) { values.push(value.trim()); value = ''; }
      else value += char;
    }
    values.push(value.trim());
    return values;
  };
  const headers = parseLine(lines[0]);
  return lines.slice(1).map((line) => Object.fromEntries(headers.map((header, index) => [header, parseLine(line)[index] || ''])));
}

export default function EnterpriseHub() {
  const { employees, fetchEmployees } = useStore();
  const [tab, setTab] = useState('overview');
  const [summary, setSummary] = useState({});
  const [positions, setPositions] = useState([]);
  const [batches, setBatches] = useState([]);
  const [issues, setIssues] = useState([]);
  const [quality, setQuality] = useState([]);
  const [rows, setRows] = useState([]);
  const [fileName, setFileName] = useState('');
  const [notice, setNotice] = useState('');
  const [busy, setBusy] = useState(false);
  const [position, setPosition] = useState({ code: '', title: '', department: '', grade: '', location: '', costCenter: '', employeeId: '', approvedHeadcount: 1 });
  const [event, setEvent] = useState({ employeeId: '', eventType: 'SALARY_REVISION', title: '', effectiveDate: '', documentRef: '' });

  const load = async () => {
    const [s, p, m, q] = await Promise.all([
      apiGet('/api/enterprise/summary'),
      apiGet('/api/enterprise/positions'),
      apiGet('/api/enterprise/migration/batches'),
      apiGet('/api/enterprise/data-quality')
    ]);
    setSummary(s); setPositions(p.positions || []); setBatches(m.batches || []); setIssues(m.issues || []); setQuality(q.issues || []);
  };

  useEffect(() => { fetchEmployees(true); load().catch((error) => setNotice(error.message)); }, [fetchEmployees]);

  const downloadTemplate = () => {
    const example = ['EMP100', 'Employee Name', 'employee@company.com', 'Department', 'Designation', 'EMP001', '2026-09-01', '50000', '10000', '2500', '15', '7', '7'];
    const blob = new Blob([`${CSV_COLUMNS.join(',')}\n${example.join(',')}\n`], { type: 'text/csv' });
    const url = URL.createObjectURL(blob);
    const anchor = document.createElement('a'); anchor.href = url; anchor.download = 'employee-migration-template.csv'; anchor.click();
    URL.revokeObjectURL(url);
  };

  const importRows = async () => {
    if (!rows.length) return setNotice('Choose a completed CSV template first.');
    setBusy(true); setNotice('');
    try {
      const result = await apiMutate('/api/enterprise/migration/employees', 'POST', {
        name: fileName || 'Employee migration', source: fileName || 'CSV upload',
        cutoffDate: new Date().toISOString().slice(0, 10), rows
      });
      setNotice(`Imported ${result.batch.successCount} of ${result.batch.receivedCount} employees. ${result.batch.errorCount} issue(s) require review.`);
      setRows([]); setFileName(''); await load(); await fetchEmployees(true);
    } catch (error) { setNotice(error.message); } finally { setBusy(false); }
  };

  const createPosition = async (e) => {
    e.preventDefault(); setBusy(true); setNotice('');
    try {
      await apiMutate('/api/enterprise/positions', 'POST', position);
      setPosition({ code: '', title: '', department: '', grade: '', location: '', costCenter: '', employeeId: '', approvedHeadcount: 1 });
      setNotice('Position created.'); await load();
    } catch (error) { setNotice(error.message); } finally { setBusy(false); }
  };

  const createEvent = async (e) => {
    e.preventDefault(); setBusy(true); setNotice('');
    try {
      await apiMutate('/api/enterprise/history', 'POST', event);
      setEvent({ employeeId: '', eventType: 'SALARY_REVISION', title: '', effectiveDate: '', documentRef: '' });
      setNotice('Employee history event recorded.');
    } catch (error) { setNotice(error.message); } finally { setBusy(false); }
  };

  return (
    <div className="view-panel active-view enterprise-hub">
      <div className="view-header">
        <div><h2>People Operations Centre</h2><p>Migrate, validate, structure, and maintain the employee system of record.</p></div>
        <button className="btn btn-secondary" type="button" onClick={() => load().catch((error) => setNotice(error.message))}><i className="material-icons-round">refresh</i> Refresh</button>
      </div>
      {notice && <div className="settings-flash ok" role="status">{notice}</div>}
      <div className="ops-kpis">
        {[
          ['people', summary.employees || 0, 'Employees'],
          ['account_tree', summary.positions || 0, 'Active positions'],
          ['upload_file', summary.migrationBatches || 0, 'Migration batches'],
          ['report_problem', summary.openMigrationIssues || 0, 'Open import issues'],
          ['fact_check', quality.length, 'Data-quality actions']
        ].map(([icon, value, label]) => <div className="glass ops-kpi" key={label}><i className="material-icons-round">{icon}</i><strong>{value}</strong><span>{label}</span></div>)}
      </div>
      <div className="tab-navigation ops-tabs">
        {['overview', 'migration', 'positions', 'history', 'quality'].map((item) => (
          <button type="button" className={`tab-btn ${tab === item ? 'active' : ''}`} onClick={() => setTab(item)} key={item}>{item === 'quality' ? 'Data quality' : item[0].toUpperCase() + item.slice(1)}</button>
        ))}
      </div>

      {tab === 'overview' && (
        <div className="grid-2">
          <div className="glass p-6"><h3>Recommended setup order</h3><ol className="setup-steps">
            <li><strong>Import employees</strong><span>Validate identity, department, salary, leave, and manager references.</span></li>
            <li><strong>Create positions</strong><span>Separate approved organization design from current occupants.</span></li>
            <li><strong>Review data quality</strong><span>Resolve missing managers, documents, and benefit enrollment.</span></li>
            <li><strong>Record history</strong><span>Capture joining, transfer, promotion, and compensation events.</span></li>
            <li><strong>Configure insurance</strong><span>Create plans, enroll employees, and track dependents and claims.</span></li>
          </ol></div>
          <div className="glass p-6"><h3>Latest migrations</h3>{batches.length ? batches.slice(0, 6).map((batch) => <div className="ops-row" key={batch.id}><span><strong>{batch.name}</strong><small>{new Date(batch.createdAt).toLocaleString()}</small></span><span className={`status-badge ${batch.status === 'completed' ? 'badge-success' : 'badge-warning'}`}>{batch.status}</span></div>) : <p className="empty-state">No migration batches yet.</p>}</div>
        </div>
      )}

      {tab === 'migration' && (
        <div className="glass p-6">
          <div className="section-header"><div><h3>Controlled employee import</h3><p className="text-muted">Imports create locked accounts; users require an approved password activation.</p></div><button className="btn btn-secondary" type="button" onClick={downloadTemplate}><i className="material-icons-round">download</i> Template</button></div>
          <label className="migration-drop">
            <i className="material-icons-round">upload_file</i>
            <strong>{fileName || 'Choose employee CSV'}</strong>
            <span>{rows.length ? `${rows.length} employee row(s) ready for validation` : 'Use the downloadable template for reliable mapping.'}</span>
            <input type="file" accept=".csv,text/csv" onChange={async (e) => { const file = e.target.files?.[0]; if (!file) return; setFileName(file.name); setRows(parseCsv(await file.text())); }} />
          </label>
          <button className="btn btn-primary" type="button" disabled={busy || !rows.length} onClick={importRows}>{busy ? 'Importing…' : 'Validate and import'}</button>
          {issues.length > 0 && <div className="table-container mt-4"><table className="table"><thead><tr><th>Employee</th><th>Field</th><th>Issue</th><th>Status</th></tr></thead><tbody>{issues.map((issue) => <tr key={issue.id}><td>{issue.employeeRef || 'Row ' + issue.rowNumber}</td><td>{issue.field || 'Record'}</td><td>{issue.message}</td><td><button className="btn btn-sm btn-secondary" onClick={async () => { await apiMutate(`/api/enterprise/migration/issues/${issue.id}`, 'PATCH', { resolved: true }); await load(); }}>Resolve</button></td></tr>)}</tbody></table></div>}
        </div>
      )}

      {tab === 'positions' && (
        <div className="grid-2">
          <form className="glass p-6" onSubmit={createPosition}><h3>Create approved position</h3><div className="form-grid">
            {[
              ['code', 'Position code'], ['title', 'Position title'], ['department', 'Department'], ['grade', 'Grade'],
              ['location', 'Location'], ['costCenter', 'Cost centre']
            ].map(([key, label]) => <div className="form-group" key={key}><label>{label}</label><input className="form-control" value={position[key]} required={['code', 'title', 'department'].includes(key)} onChange={(e) => setPosition({ ...position, [key]: e.target.value })} /></div>)}
            <div className="form-group"><label>Occupant</label><select className="form-control" value={position.employeeId} onChange={(e) => setPosition({ ...position, employeeId: e.target.value })}><option value="">Vacant</option>{employees.map((employee) => <option value={employee.id} key={employee.id}>{employee.name}</option>)}</select></div>
            <div className="form-group"><label>Approved headcount</label><input className="form-control" type="number" min="1" value={position.approvedHeadcount} onChange={(e) => setPosition({ ...position, approvedHeadcount: e.target.value })} /></div>
          </div><button className="btn btn-primary" disabled={busy}>Create position</button></form>
          <div className="glass p-6"><h3>Position catalogue</h3>{positions.length ? positions.map((item) => <div className="ops-row" key={item.id}><span><strong>{item.code} · {item.title}</strong><small>{item.department} · {item.grade || 'No grade'} · {item.employeeId || 'Vacant'}</small></span><span className="status-badge badge-success">{item.status}</span></div>) : <p className="empty-state">No positions configured.</p>}</div>
        </div>
      )}

      {tab === 'history' && (
        <form className="glass p-6 ops-form" onSubmit={createEvent}><h3>Record effective-dated employee event</h3><div className="form-grid">
          <div className="form-group"><label>Employee</label><select className="form-control" required value={event.employeeId} onChange={(e) => setEvent({ ...event, employeeId: e.target.value })}><option value="">Select employee</option>{employees.map((employee) => <option value={employee.id} key={employee.id}>{employee.name} ({employee.id})</option>)}</select></div>
          <div className="form-group"><label>Event type</label><select className="form-control" value={event.eventType} onChange={(e) => setEvent({ ...event, eventType: e.target.value })}>{['JOINING', 'PROMOTION', 'TRANSFER', 'MANAGER_CHANGE', 'SALARY_REVISION', 'CONTRACT_RENEWAL', 'CONFIRMATION', 'SEPARATION'].map((type) => <option key={type}>{type}</option>)}</select></div>
          <div className="form-group"><label>Title</label><input className="form-control" required value={event.title} onChange={(e) => setEvent({ ...event, title: e.target.value })} /></div>
          <div className="form-group"><label>Effective date</label><input className="form-control" type="date" required value={event.effectiveDate} onChange={(e) => setEvent({ ...event, effectiveDate: e.target.value })} /></div>
          <div className="form-group"><label>Supporting document reference</label><input className="form-control" value={event.documentRef} onChange={(e) => setEvent({ ...event, documentRef: e.target.value })} /></div>
        </div><button className="btn btn-primary" disabled={busy}>Add to employee timeline</button></form>
      )}

      {tab === 'quality' && (
        <div className="glass p-6"><div className="section-header"><div><h3>Data-quality work queue</h3><p className="text-muted">Resolve high-risk gaps before payroll and benefits go live.</p></div><span className="status-badge badge-warning">{quality.length} open</span></div>
          {quality.length ? <div className="table-container"><table className="table"><thead><tr><th>Employee</th><th>Issue</th><th>Priority</th><th>Action</th></tr></thead><tbody>{quality.map((issue, index) => <tr key={`${issue.employeeId}-${issue.type}-${index}`}><td><strong>{issue.name}</strong><small className="cell-sub">{issue.employeeId}</small></td><td>{issue.type}</td><td><span className={`status-badge ${issue.severity === 'high' ? 'badge-danger' : 'badge-warning'}`}>{issue.severity}</span></td><td><button className="btn btn-sm btn-secondary" onClick={() => setTab(issue.type.includes('insurance') ? 'overview' : 'history')}>Review</button></td></tr>)}</tbody></table></div> : <p className="empty-state">All core employee records pass the current checks.</p>}
        </div>
      )}
    </div>
  );
}
