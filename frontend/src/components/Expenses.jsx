import React, { useEffect, useState } from 'react';
import useStore from '../store';
import { hasCap } from '../permissions';

const EMPTY = { category: 'Travel', amount: '', description: '', expenseDate: '', receiptNote: '' };
const CATS = ['Travel', 'Meals', 'Internet', 'Office supplies', 'Client entertainment', 'Training', 'Other'];

export default function Expenses() {
  const { expenses, fetchExpenses, submitExpense, decideExpense, user } = useStore();
  const [form, setForm] = useState(EMPTY);
  const [msg, setMsg] = useState('');
  const isAdmin = user?.role === 'admin';
  const canDecide = isAdmin || hasCap(user, 'approveLeaves') || hasCap(user, 'createUsers');

  useEffect(() => { fetchExpenses(); }, [fetchExpenses]);

  const submit = async (e) => {
    e.preventDefault(); setMsg('');
    try {
      await submitExpense({ ...form, amount: Number(form.amount) });
      setForm(EMPTY);
      setMsg('Claim submitted — pending manager approval.');
    } catch (err) { setMsg(err.message); }
  };

  return (
    <div className="view-panel active-view">
      <div className="view-header">
        <div><h2>Expense claims</h2><p>Submit reimbursements; managers approve for their team.</p></div>
      </div>
      {msg && <p className="form-ok">{msg}</p>}
      <div className="grid-2" style={{ gap: 16 }}>
        <form className="glass p-6" style={{ display: 'grid', gap: 10 }} onSubmit={submit}>
          <h3>New claim</h3>
          <select className="form-control" value={form.category} onChange={(e) => setForm({ ...form, category: e.target.value })}>
            {CATS.map((c) => <option key={c}>{c}</option>)}
          </select>
          <input className="form-control" type="number" min="1" step="0.01" placeholder="Amount (₹)" required
            value={form.amount} onChange={(e) => setForm({ ...form, amount: e.target.value })} />
          <input className="form-control" type="date" required value={form.expenseDate}
            onChange={(e) => setForm({ ...form, expenseDate: e.target.value })} />
          <textarea className="form-control" rows={3} placeholder="Description" required value={form.description}
            onChange={(e) => setForm({ ...form, description: e.target.value })} />
          <input className="form-control" placeholder="Receipt ref (optional)" value={form.receiptNote}
            onChange={(e) => setForm({ ...form, receiptNote: e.target.value })} />
          <button type="submit" className="btn btn-primary">Submit claim</button>
        </form>
        <div className="glass p-6 table-responsive">
          <table className="table">
            <thead><tr><th>Who</th><th>Category</th><th>Amount</th><th>Date</th><th>Status</th><th></th></tr></thead>
            <tbody>
              {(expenses || []).map((r) => (
                <tr key={r.id}>
                  <td>{r.employeeName || r.employeeId}<div className="text-muted" style={{ fontSize: '0.75rem' }}>{r.description}</div></td>
                  <td>{r.category}</td>
                  <td>₹{Number(r.amount).toLocaleString()}</td>
                  <td>{r.expenseDate}</td>
                  <td><span className={`badge ${r.status === 'Approved' ? 'badge-success' : r.status === 'Rejected' ? 'badge-danger' : 'badge-warning'}`}>{r.status}</span></td>
                  <td>
                    {canDecide && r.status === 'Pending' && r.employeeId !== user?.id && (
                      <div className="action-btn-group">
                        <button type="button" className="btn btn-sm btn-primary" onClick={() => decideExpense(r.id, true)}>Approve</button>
                        <button type="button" className="btn btn-sm btn-secondary" onClick={() => {
                          const note = window.prompt('Reject reason') || '';
                          decideExpense(r.id, false, note);
                        }}>Reject</button>
                      </div>
                    )}
                  </td>
                </tr>
              ))}
            </tbody>
          </table>
        </div>
      </div>
    </div>
  );
}
