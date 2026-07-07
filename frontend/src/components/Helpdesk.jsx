import React, { useEffect, useState } from 'react';
import useStore from '../store';
import { hasCap } from '../permissions';

const EMPTY = { subject: '', category: 'IT Support', description: '', priority: 'Medium' };
const STATES = ['Open', 'In Progress', 'Resolved', 'Closed'];

function Helpdesk() {
  const { tickets, fetchTickets, createTicket, replyTicket, setTicketStatus, user } = useStore();
  const [form, setForm] = useState(EMPTY);
  const [reply, setReply] = useState({});
  const [msg, setMsg] = useState('');
  const isAdmin = user?.role === 'admin';
  const canMod = isAdmin || hasCap(user, 'moderateHelpdesk');

  useEffect(() => { fetchTickets(); }, [fetchTickets]);

  const submit = async (e) => {
    e.preventDefault(); setMsg('');
    try { await createTicket(form); setForm(EMPTY); setMsg('Ticket raised.'); }
    catch (err) { setMsg(err.message); }
  };

  const visible = canMod ? tickets : tickets.filter(t => t.employeeId === user?.id);

  return (
    <div className="view-panel active-view">
      <div className="view-header"><div><h2>HR Helpdesk</h2><p>Raise and track support tickets.</p></div></div>

      <div className="glass p-6" style={{ marginBottom: '1.5rem' }}>
        <h3>Raise a Ticket</h3>
        {msg && <p>{msg}</p>}
        <form onSubmit={submit} style={{ display: 'grid', gap: '1rem', maxWidth: '560px', marginTop: '1rem' }}>
          <input placeholder="Subject" value={form.subject} onChange={e => setForm({ ...form, subject: e.target.value })} required />
          <div style={{ display: 'flex', gap: '1rem' }}>
            <select value={form.category} onChange={e => setForm({ ...form, category: e.target.value })}>
              <option>IT Support</option><option>HR</option><option>Facilities</option><option>Software Access</option>
            </select>
            <select value={form.priority} onChange={e => setForm({ ...form, priority: e.target.value })}>
              <option>Low</option><option>Medium</option><option>High</option>
            </select>
          </div>
          <textarea placeholder="Describe the issue" value={form.description} onChange={e => setForm({ ...form, description: e.target.value })} required />
          <button type="submit" className="btn btn-primary">Submit Ticket</button>
        </form>
      </div>

      <div className="tickets-grid" style={{ display: 'grid', gap: '1rem' }}>
        {visible.map(t => (
          <div key={t.id} className="glass p-6">
            <div style={{ display: 'flex', justifyContent: 'space-between', alignItems: 'center', gap: '10px' }}>
              <h4>{t.subject}</h4>
              {canMod ? (
                <select className="form-control" style={{ maxWidth: '150px' }} value={t.status}
                  onChange={e => setTicketStatus(t.id, e.target.value).catch(err => setMsg(err.message))}>
                  {STATES.map(s => <option key={s}>{s}</option>)}
                </select>
              ) : (
                <span className={`badge ${['Resolved', 'Closed'].includes(t.status) ? 'badge-success' : 'badge-warning'}`}>{t.status}</span>
              )}
            </div>
            <p style={{ opacity: 0.7 }}>{t.category} · {t.priority} · {t.employee?.name || t.employeeId}</p>
            <p>{t.description}</p>
            {t.replies?.map(r => (
              <div key={r.id} style={{ borderLeft: '2px solid #4f46e5', paddingLeft: '0.75rem', margin: '0.5rem 0' }}>
                <strong>{r.sender?.name || 'Staff'}:</strong> {r.text}
              </div>
            ))}
            {(canMod || t.employeeId === user?.id) && !['Resolved', 'Closed'].includes(t.status) && (
              <div style={{ display: 'flex', gap: '0.5rem', marginTop: '0.5rem' }}>
                <input className="form-control" placeholder="Reply..." value={reply[t.id] || ''} onChange={e => setReply({ ...reply, [t.id]: e.target.value })} style={{ flex: 1 }} />
                <button className="btn btn-sm btn-secondary" onClick={() => replyTicket(t.id, reply[t.id], false).catch(err => setMsg(err.message))}>Reply</button>
                {canMod && <button className="btn btn-sm btn-primary" onClick={() => replyTicket(t.id, reply[t.id] || 'Resolved', true).catch(err => setMsg(err.message))}>Resolve</button>}
              </div>
            )}
          </div>
        ))}
      </div>
    </div>
  );
}

export default Helpdesk;
