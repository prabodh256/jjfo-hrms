import React, { useEffect, useState } from 'react';
import useStore from '../store';
import Modal from './Modal';

const EMPTY = { employeeId: '', name: '', type: 'Laptop', serialNumber: '', condition: 'New' };
const TYPES = ['Laptop', 'Monitor', 'Phone', 'Accessory'];
const CONDITIONS = ['New', 'Excellent', 'Good', 'Fair'];
const STATUSES = ['In Stock', 'Pending Employee Confirmation', 'Confirmed', 'Under Repair', 'Returned', 'Retired'];

function Assets() {
  const { assets, fetchAssets, employees, fetchEmployees, assignAsset, confirmAsset, updateAsset, deleteAsset, user } = useStore();
  const [form, setForm] = useState(EMPTY);
  const [query, setQuery] = useState('');
  const [msg, setMsg] = useState('');
  const [edit, setEdit] = useState(null);
  const isAdmin = user?.role === 'admin';

  useEffect(() => { fetchAssets(); fetchEmployees(); }, [fetchAssets, fetchEmployees]);

  const submit = async (e) => {
    e.preventDefault(); setMsg('');
    try { await assignAsset(form); setForm(EMPTY); setMsg('Asset assigned.'); }
    catch (err) { setMsg(err.message); }
  };

  const q = query.trim().toLowerCase();
  const visible = assets.filter(a =>
    !q || [a.employee?.name, a.name, a.serialNumber, a.type].some(v => (v || '').toLowerCase().includes(q))
  );

  const saveEdit = async (e) => {
    e.preventDefault();
    await updateAsset(edit.id, { employeeId: edit.employeeId, condition: edit.condition, status: edit.status });
    setEdit(null);
  };

  return (
    <div className="view-panel active-view">
      <div className="view-header">
        <div><h2>Asset Inventory</h2><p>Track who owns what across JJFO.</p></div>
        <div className="search-wrap">
          <i className="material-icons-round">search</i>
          <input className="form-control" placeholder="Search by employee or asset…" value={query} onChange={e => setQuery(e.target.value)} />
        </div>
      </div>

      {isAdmin && (
        <div className="glass p-6" style={{ marginBottom: '1.5rem' }}>
          <h3>Assign Asset</h3>
          {msg && <p>{msg}</p>}
          <form onSubmit={submit} className="form-grid" style={{ marginTop: '1rem' }}>
            <select className="form-control" value={form.employeeId} onChange={e => setForm({ ...form, employeeId: e.target.value })}>
              <option value="">(In stock — no owner yet)</option>
              {employees.map(e => <option key={e.id} value={e.id}>{e.name}</option>)}
            </select>
            <input className="form-control" placeholder="Asset name" value={form.name} onChange={e => setForm({ ...form, name: e.target.value })} required />
            <select className="form-control" value={form.type} onChange={e => setForm({ ...form, type: e.target.value })}>{TYPES.map(t => <option key={t}>{t}</option>)}</select>
            <input className="form-control" placeholder="Serial number" value={form.serialNumber} onChange={e => setForm({ ...form, serialNumber: e.target.value })} required />
            <select className="form-control" value={form.condition} onChange={e => setForm({ ...form, condition: e.target.value })}>{CONDITIONS.map(c => <option key={c}>{c}</option>)}</select>
            <button type="submit" className="btn btn-primary">Assign</button>
          </form>
        </div>
      )}

      <div className="table-responsive">
        <table className="table">
          <thead><tr><th>Owner</th><th>Asset</th><th>Type</th><th>Serial</th><th>Condition</th><th>Status</th><th>Actions</th></tr></thead>
          <tbody>
            {visible.length === 0 ? <tr><td colSpan="7">No matching assets.</td></tr> : visible.map(a => (
              <tr key={a.id}>
                <td><strong>{a.employee?.name || (a.employeeId ? a.employeeId : 'In stock')}</strong></td>
                <td>{a.name}</td><td>{a.type}</td><td>{a.serialNumber}</td><td>{a.condition}</td>
                <td><span className={`badge ${a.status === 'Confirmed' ? 'badge-success' : ['Retired', 'Under Repair'].includes(a.status) ? 'badge-danger' : 'badge-warning'}`}>{a.status}</span></td>
                <td>
                  <div className="action-btn-group">
                    {a.status !== 'Confirmed' && a.employeeId === user?.id &&
                      <button className="btn btn-sm btn-primary" onClick={() => confirmAsset(a.id)}>Confirm</button>}
                    {isAdmin && <button className="btn btn-sm btn-secondary" onClick={() => setEdit({ ...a, employeeId: a.employeeId })}><i className="material-icons-round">edit</i></button>}
                    {isAdmin && <button className="btn btn-sm btn-danger" onClick={() => deleteAsset(a.id)}><i className="material-icons-round">delete</i></button>}
                  </div>
                </td>
              </tr>
            ))}
          </tbody>
        </table>
      </div>

      {edit && (
        <Modal title={`Edit ${edit.name}`} onClose={() => setEdit(null)}>
          <form onSubmit={saveEdit} style={{ display: 'grid', gap: '1rem' }}>
            <div className="form-group"><label>Owner</label>
              <select className="form-control" value={edit.employeeId || ''} onChange={e => setEdit({ ...edit, employeeId: e.target.value || null })}>
                <option value="">(In stock — no owner)</option>
                {employees.map(e => <option key={e.id} value={e.id}>{e.name}</option>)}</select></div>
            <div className="form-group"><label>Condition</label>
              <select className="form-control" value={edit.condition} onChange={e => setEdit({ ...edit, condition: e.target.value })}>{CONDITIONS.map(c => <option key={c}>{c}</option>)}</select></div>
            <div className="form-group"><label>Status</label>
              <select className="form-control" value={edit.status} onChange={e => setEdit({ ...edit, status: e.target.value })}>{STATUSES.map(s => <option key={s}>{s}</option>)}</select></div>
            <div className="action-btn-group">
              <button type="button" className="btn btn-secondary" onClick={() => setEdit(null)}>Cancel</button>
              <button type="submit" className="btn btn-primary">Save</button>
            </div>
          </form>
        </Modal>
      )}
    </div>
  );
}

export default Assets;
