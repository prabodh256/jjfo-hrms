import React, { useEffect, useState } from 'react';
import useStore from '../store';
import { hasCap } from '../permissions';

const EMPTY = { subject: '', category: 'IT Support', description: '', priority: 'Medium' };
const STATES = ['Open', 'In Progress', 'Resolved', 'Closed'];
const priClass = { High: 'badge-danger', Medium: 'badge-warning', Low: 'badge-info' };

function Helpdesk() {
  const { tickets, fetchTickets, createTicket, replyTicket, setTicketStatus, user } = useStore();
  const [form, setForm] = useState(EMPTY);
  const [reply, setReply] = useState({});
  const [msg, setMsg] = useState('');
  const [openId, setOpenId] = useState(null);
  const isAdmin = user?.role === 'admin';
  const canMod = isAdmin || hasCap(user, 'moderateHelpdesk');

  useEffect(() => { fetchTickets(); }, [fetchTickets]);

  const submit = async (e) => {
    e.preventDefault();
    setMsg('');
    try {
      await createTicket(form);
      setForm(EMPTY);
      setMsg('Ticket raised.');
    } catch (err) {
      setMsg(err.message);
    }
  };

  const visible = canMod ? tickets : tickets.filter((t) => t.employeeId === user?.id);
  const counts = STATES.reduce((a, s) => ({ ...a, [s]: visible.filter((t) => t.status === s).length }), {});

  return (
    <div className="view-panel active-view">
      <div className="view-header">
        <div><h2>HR Helpdesk</h2><p>Track tickets in a clear pipeline — not a wall of cards.</p></div>
      </div>

      <div className="hd-stats">
        {STATES.map((s) => (
          <div key={s} className="hd-stat glass">
            <strong>{counts[s] || 0}</strong>
            <span>{s}</span>
          </div>
        ))}
      </div>

      <div className="hd-layout">
        <form className="hd-form glass p-6" onSubmit={submit}>
          <h3>Raise a ticket</h3>
          {msg && <p className="form-ok">{msg}</p>}
          <div className="form-group">
            <label>Subject</label>
            <input className="form-control" value={form.subject} onChange={(e) => setForm({ ...form, subject: e.target.value })} required />
          </div>
          <div className="form-grid">
            <div className="form-group">
              <label>Category</label>
              <select className="form-control" value={form.category} onChange={(e) => setForm({ ...form, category: e.target.value })}>
                <option>IT Support</option><option>HR</option><option>Facilities</option><option>Software Access</option>
              </select>
            </div>
            <div className="form-group">
              <label>Priority</label>
              <select className="form-control" value={form.priority} onChange={(e) => setForm({ ...form, priority: e.target.value })}>
                <option>Low</option><option>Medium</option><option>High</option>
              </select>
            </div>
          </div>
          <div className="form-group">
            <label>Description</label>
            <textarea className="form-control" rows={3} value={form.description} onChange={(e) => setForm({ ...form, description: e.target.value })} required />
          </div>
          <button type="submit" className="btn btn-primary">Submit</button>
        </form>

        <div className="hd-table-wrap glass">
          <table className="table hd-table">
            <thead>
              <tr>
                <th>Subject</th><th>Category</th><th>Priority</th><th>Owner</th><th>Status</th><th></th>
              </tr>
            </thead>
            <tbody>
              {visible.length === 0 && (
                <tr><td colSpan={6} className="text-muted">No tickets yet.</td></tr>
              )}
              {visible.map((t) => (
                <React.Fragment key={t.id}>
                  <tr className={openId === t.id ? 'hd-row-open' : ''}>
                    <td><strong>{t.subject}</strong></td>
                    <td>{t.category}</td>
                    <td><span className={`badge ${priClass[t.priority] || 'badge-info'}`}>{t.priority}</span></td>
                    <td>{t.employee?.name || t.employeeId}</td>
                    <td>
                      {canMod ? (
                        <select
                          className="form-control"
                          style={{ maxWidth: 140 }}
                          value={t.status}
                          onChange={(e) => setTicketStatus(t.id, e.target.value).catch((err) => setMsg(err.message))}
                        >
                          {STATES.map((s) => <option key={s}>{s}</option>)}
                        </select>
                      ) : (
                        <span className={`badge ${['Resolved', 'Closed'].includes(t.status) ? 'badge-success' : 'badge-warning'}`}>{t.status}</span>
                      )}
                    </td>
                    <td>
                      <button type="button" className="btn btn-sm btn-secondary" onClick={() => setOpenId(openId === t.id ? null : t.id)}>
                        {openId === t.id ? 'Hide' : 'Thread'}
                      </button>
                    </td>
                  </tr>
                  {openId === t.id && (
                    <tr className="hd-thread">
                      <td colSpan={6}>
                        <p className="hd-desc">{t.description}</p>
                        <div className="hd-replies">
                          {(t.replies || []).map((r) => (
                            <div key={r.id} className="hd-reply">
                              <strong>{r.sender?.name || 'Staff'}</strong>
                              <span>{r.text}</span>
                              <small>{r.date}</small>
                            </div>
                          ))}
                          {!t.replies?.length && <p className="text-muted">No replies yet.</p>}
                        </div>
                        {(canMod || t.employeeId === user?.id) && !['Resolved', 'Closed'].includes(t.status) && (
                          <div className="hd-reply-bar">
                            <input
                              className="form-control"
                              placeholder="Write a reply…"
                              value={reply[t.id] || ''}
                              onChange={(e) => setReply({ ...reply, [t.id]: e.target.value })}
                            />
                            <button type="button" className="btn btn-sm btn-secondary" onClick={() => replyTicket(t.id, reply[t.id], false).catch((err) => setMsg(err.message))}>Reply</button>
                            {canMod && (
                              <button type="button" className="btn btn-sm btn-primary" onClick={() => replyTicket(t.id, reply[t.id] || 'Resolved', true).catch((err) => setMsg(err.message))}>Resolve</button>
                            )}
                          </div>
                        )}
                      </td>
                    </tr>
                  )}
                </React.Fragment>
              ))}
            </tbody>
          </table>
        </div>
      </div>
    </div>
  );
}

export default Helpdesk;
