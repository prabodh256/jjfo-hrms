import React, { useEffect, useState } from 'react';
import useStore from '../store';
import { hasCap } from '../permissions';

export default function Policies() {
  const { policies, fetchPolicies, publishPolicy, ackPolicy, user } = useStore();
  const canPublish = user?.role === 'admin' || hasCap(user, 'createUsers');
  const [msg, setMsg] = useState('');
  const [form, setForm] = useState({ title: '', category: 'HR', body: '', version: '1.0', mandatory: true });
  const [openId, setOpenId] = useState(null);

  useEffect(() => { fetchPolicies(); }, [fetchPolicies]);

  return (
    <div className="view-panel active-view">
      <div className="view-header">
        <div><h2>Policy library</h2><p>Read company policies and acknowledge mandatory ones.</p></div>
      </div>
      {msg && <p className="form-ok">{msg}</p>}

      {canPublish && (
        <form className="glass p-6" style={{ marginBottom: 16, display: 'grid', gap: 8, maxWidth: 640 }} onSubmit={async (e) => {
          e.preventDefault(); setMsg('');
          try {
            await publishPolicy(form);
            setForm({ title: '', category: 'HR', body: '', version: '1.0', mandatory: true });
            setMsg('Policy published — employees notified.');
          } catch (err) { setMsg(err.message); }
        }}>
          <h3>Publish policy</h3>
          <input className="form-control" placeholder="Title" required value={form.title} onChange={(e) => setForm({ ...form, title: e.target.value })} />
          <div className="form-grid">
            <input className="form-control" placeholder="Category" value={form.category} onChange={(e) => setForm({ ...form, category: e.target.value })} />
            <input className="form-control" placeholder="Version" value={form.version} onChange={(e) => setForm({ ...form, version: e.target.value })} />
          </div>
          <textarea className="form-control" rows={4} placeholder="Policy body" required value={form.body} onChange={(e) => setForm({ ...form, body: e.target.value })} />
          <label className="perm-item">
            <input type="checkbox" checked={form.mandatory} onChange={(e) => setForm({ ...form, mandatory: e.target.checked })} />
            <span>Mandatory acknowledgement</span>
          </label>
          <button type="submit" className="btn btn-primary">Publish</button>
        </form>
      )}

      <div className="table-responsive glass">
        <table className="table">
          <thead><tr><th>Policy</th><th>Category</th><th>Ver</th><th>Status</th><th></th></tr></thead>
          <tbody>
            {(policies || []).map((p) => (
              <React.Fragment key={p.id}>
                <tr>
                  <td>
                    <strong>{p.title}</strong>
                    {p.mandatory && <em className="perm-badge" style={{ marginLeft: 8 }}>mandatory</em>}
                  </td>
                  <td>{p.category}</td>
                  <td>{p.version}</td>
                  <td>{p.acknowledged ? <span className="badge badge-success">Acknowledged</span> : <span className="badge badge-warning">Pending</span>}</td>
                  <td className="action-btn-group">
                    <button type="button" className="btn btn-sm btn-secondary" onClick={() => setOpenId(openId === p.id ? null : p.id)}>
                      {openId === p.id ? 'Hide' : 'Read'}
                    </button>
                    {!p.acknowledged && (
                      <button type="button" className="btn btn-sm btn-primary" onClick={async () => {
                        try { await ackPolicy(p.id); setMsg(`Acknowledged: ${p.title}`); }
                        catch (e) { setMsg(e.message); }
                      }}>I acknowledge</button>
                    )}
                  </td>
                </tr>
                {openId === p.id && (
                  <tr><td colSpan={5}><div className="policy-body">{p.body}</div></td></tr>
                )}
              </React.Fragment>
            ))}
          </tbody>
        </table>
      </div>
    </div>
  );
}
