import React, { useEffect, useState } from 'react';
import useStore from '../store';
import { hasCap } from '../permissions';

export default function Engagement() {
  const { surveys, fetchSurveys, createSurvey, respondSurvey, user } = useStore();
  const canCreate = user?.role === 'admin' || hasCap(user, 'createUsers');
  const [msg, setMsg] = useState('');
  const [answers, setAnswers] = useState({});
  const [newS, setNewS] = useState({
    title: '', description: '',
    q1: 'How supported do you feel by your manager?',
    q2: 'Would you recommend JJFO as a workplace?',
    q3: 'One thing we should improve'
  });

  useEffect(() => { fetchSurveys(); }, [fetchSurveys]);

  return (
    <div className="view-panel active-view">
      <div className="view-header">
        <div><h2>Employee engagement</h2><p>Pulse surveys — complete open surveys; HR can publish new ones.</p></div>
      </div>
      {msg && <p className="form-ok">{msg}</p>}

      {canCreate && (
        <form className="glass p-6" style={{ marginBottom: 16, display: 'grid', gap: 8, maxWidth: 560 }} onSubmit={async (e) => {
          e.preventDefault(); setMsg('');
          try {
            await createSurvey({
              title: newS.title,
              description: newS.description,
              questions: [
                { id: 'q1', text: newS.q1, type: 'scale' },
                { id: 'q2', text: newS.q2, type: 'scale' },
                { id: 'q3', text: newS.q3, type: 'text' }
              ]
            });
            setMsg('Survey published to all employees.');
            setNewS({ title: '', description: '', q1: newS.q1, q2: newS.q2, q3: newS.q3 });
          } catch (err) { setMsg(err.message); }
        }}>
          <h3>Publish survey</h3>
          <input className="form-control" placeholder="Title" required value={newS.title} onChange={(e) => setNewS({ ...newS, title: e.target.value })} />
          <input className="form-control" placeholder="Description" value={newS.description} onChange={(e) => setNewS({ ...newS, description: e.target.value })} />
          <button type="submit" className="btn btn-primary">Publish</button>
        </form>
      )}

      {(surveys || []).map((s) => (
        <div key={s.id} className="glass p-6" style={{ marginBottom: 12 }}>
          <div style={{ display: 'flex', justifyContent: 'space-between', gap: 8, flexWrap: 'wrap' }}>
            <div>
              <h3>{s.title}</h3>
              <p className="text-muted" style={{ fontSize: '0.85rem' }}>{s.description}</p>
            </div>
            {s.answered
              ? <span className="badge badge-success">Completed</span>
              : <span className="badge badge-warning">Open</span>}
          </div>
          {!s.answered && s.active && (
            <form style={{ marginTop: 12, display: 'grid', gap: 10 }} onSubmit={async (e) => {
              e.preventDefault();
              try {
                await respondSurvey(s.id, answers[s.id] || {});
                setMsg('Thanks — response saved.');
              } catch (err) { setMsg(err.message); }
            }}>
              {(s.questions || []).map((q) => (
                <div key={q.id} className="form-group">
                  <label>{q.text}</label>
                  {q.type === 'scale' ? (
                    <select className="form-control" required
                      value={(answers[s.id] || {})[q.id] || ''}
                      onChange={(e) => setAnswers({
                        ...answers,
                        [s.id]: { ...(answers[s.id] || {}), [q.id]: e.target.value }
                      })}>
                      <option value="">Select 1–5…</option>
                      {[1, 2, 3, 4, 5].map((n) => <option key={n} value={n}>{n}</option>)}
                    </select>
                  ) : (
                    <textarea className="form-control" rows={2}
                      value={(answers[s.id] || {})[q.id] || ''}
                      onChange={(e) => setAnswers({
                        ...answers,
                        [s.id]: { ...(answers[s.id] || {}), [q.id]: e.target.value }
                      })} />
                  )}
                </div>
              ))}
              <button type="submit" className="btn btn-primary">Submit responses</button>
            </form>
          )}
        </div>
      ))}
    </div>
  );
}
