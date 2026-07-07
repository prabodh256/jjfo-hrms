import React, { useEffect, useState } from 'react';
import useStore from '../store';

const ENTITIES = ['', 'employee', 'leave', 'onboarding', 'payroll', 'asset', 'ticket', 'holiday', 'regularization'];

function AuditLog() {
  const { auditRows, fetchAudit } = useStore();
  const [entity, setEntity] = useState('');

  useEffect(() => { fetchAudit(entity ? `?entity=${entity}` : ''); }, [fetchAudit, entity]);

  return (
    <div className="view-panel active-view">
      <div className="view-header">
        <div><h2>Audit Log</h2><p>Who did what, and when — across all sensitive actions.</p></div>
        <select className="form-control" style={{ maxWidth: '220px' }} value={entity} onChange={e => setEntity(e.target.value)}>
          {ENTITIES.map(e => <option key={e} value={e}>{e ? `Entity: ${e}` : 'All entities'}</option>)}
        </select>
      </div>
      <div className="table-responsive">
        <table className="table">
          <thead><tr><th>When</th><th>Actor</th><th>Action</th><th>Entity</th><th>Ref</th><th>Detail</th></tr></thead>
          <tbody>
            {auditRows.length === 0 ? <tr><td colSpan="6">No audit entries yet.</td></tr> : auditRows.map(r => (
              <tr key={r.id}>
                <td style={{ whiteSpace: 'nowrap' }}>{new Date(r.at).toLocaleString()}</td>
                <td><strong>{r.actorName}</strong></td>
                <td><span className="badge badge-info">{r.action}</span></td>
                <td>{r.entity}</td>
                <td>{r.entityId || '—'}</td>
                <td style={{ maxWidth: '340px', overflow: 'hidden', textOverflow: 'ellipsis' }}>{r.detail || '—'}</td>
              </tr>
            ))}
          </tbody>
        </table>
      </div>
    </div>
  );
}

export default AuditLog;
