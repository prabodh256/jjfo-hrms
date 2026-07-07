import React, { useEffect, useState } from 'react';
import useStore from '../store';
import { hasCap } from '../permissions';
import Modal from './Modal';
import EmployeeForm from './EmployeeForm';

const parse = (raw, fb) => { try { return raw ? JSON.parse(raw) : fb; } catch { return fb; } };

const STATE = {
  draft: { cls: 'badge-warning', label: 'Draft (with employee)' },
  submitted: { cls: 'badge-info', label: 'Submitted — awaiting approval' },
  approved: { cls: 'badge-success', label: 'Approved (locked)' },
  returned: { cls: 'badge-danger', label: 'Returned for re-upload' }
};

/* ---------------- Employee self-onboarding ---------------- */
function MyOnboarding() {
  const { user, docConfig, fetchDocConfig, saveMyOnboarding, submitMyOnboarding, uploadDoc } = useStore();
  const state = user.onboardingState;
  const locked = state === 'submitted' || state === 'approved';
  const [experience, setExperience] = useState(() => parse(user.experience, []) || []);
  const [education, setEducation] = useState(() => parse(user.education, []) || []);
  const [documents, setDocuments] = useState(() => parse(user.documents, {}) || {});
  const [msg, setMsg] = useState(''); const [err, setErr] = useState('');

  useEffect(() => { fetchDocConfig(); }, [fetchDocConfig]);

  const save = async () => { setErr(''); setMsg(''); try { await saveMyOnboarding({ experience, education, documents }); setMsg('Saved.'); } catch (e) { setErr(e.message); } };
  const submit = async () => { setErr(''); setMsg(''); try { await saveMyOnboarding({ experience, education, documents }); await submitMyOnboarding(); setMsg('Submitted for approval.'); } catch (e) { setErr(e.message); } };

  const required = docConfig.filter(d => d.required);
  const missing = required.filter(d => !documents[d.key]);
  const rows = (list, set, fields) => (
    <>
      {list.map((x, i) => (
        <div key={i} className="exp-row">
          <strong>{fields.title} {i + 1}</strong>
          <div className="form-grid">
            {fields.keys.map(k => (
              <input key={k.key} className="form-control" placeholder={k.ph} value={x[k.key] || ''} disabled={locked}
                onChange={e => set(list.map((y, j) => j === i ? { ...y, [k.key]: e.target.value } : y))} />
            ))}
          </div>
          {!locked && <button className="btn btn-sm btn-secondary" onClick={() => set(list.filter((_, j) => j !== i))}>Remove</button>}
        </div>
      ))}
      {!locked && <button className="btn btn-sm btn-secondary" onClick={() => set([...list, {}])}>
        <i className="material-icons-round">add</i> Add {fields.title} {list.length + 1}</button>}
    </>
  );

  return (
    <div className="view-panel active-view">
      <div className="view-header">
        <div><h2>My Onboarding</h2><p>Complete your details and upload the required documents.</p></div>
        <span className={`badge ${STATE[state]?.cls}`}>{STATE[state]?.label}</span>
      </div>
      {user.onboardingNote && (state === 'draft' || state === 'returned') &&
        <div className="glass p-6" style={{ marginBottom: '1rem', borderLeft: '3px solid var(--accent)' }}><strong>HR note:</strong> {user.onboardingNote}</div>}
      {locked && <div className="glass p-6" style={{ marginBottom: '1rem' }}>Your onboarding is <strong>locked</strong>. {state === 'approved' ? 'Approved by HR.' : 'Awaiting HR approval.'} Editing is disabled until an admin reopens it.</div>}
      {msg && <p className="text-primary">{msg}</p>}
      {err && <div className="form-error">{err}</div>}

      <div className="glass p-6" style={{ marginBottom: '1rem' }}>
        <h3>Education History</h3>
        {rows(education, setEducation, { title: 'Education', keys: [{ key: 'degree', ph: 'Degree' }, { key: 'institution', ph: 'Institution' }, { key: 'year', ph: 'Year' }] })}
      </div>
      <div className="glass p-6" style={{ marginBottom: '1rem' }}>
        <h3>Work Experience</h3>
        {rows(experience, setExperience, { title: 'Experience', keys: [{ key: 'company', ph: 'Company' }, { key: 'designation', ph: 'Designation' }, { key: 'duration', ph: 'Duration' }] })}
      </div>
      <div className="glass p-6" style={{ marginBottom: '1rem' }}>
        <h3>Documents <small className="text-muted">— <span style={{ color: 'var(--accent)' }}>*</span> mandatory</small></h3>
        <div className="form-grid">
          {docConfig.map(d => (
            <div className="form-group" key={d.key}>
              <label>{d.label} {d.required ? <span style={{ color: 'var(--accent)' }}>*</span> : <small className="text-muted">(optional)</small>}</label>
              <input className="form-control" type="file" disabled={locked} accept=".pdf,.doc,.docx,.png,.jpg,.jpeg"
                onChange={async e => {
                  const f = e.target.files[0];
                  if (!f) return;
                  try {
                    const r = await uploadDoc(user.id, d.key, f);
                    setDocuments({ ...documents, [d.key]: r.filename });
                    setErr(''); setMsg(`${d.label} uploaded.`);
                  } catch (err2) { setErr(err2.message); }
                }} />
              {documents[d.key] && <small className="doc-name"><i className="material-icons-round">description</i> {documents[d.key]}</small>}
            </div>
          ))}
        </div>
      </div>

      {!locked && (
        <div className="action-btn-group">
          <button className="btn btn-secondary" onClick={save}>Save Draft</button>
          <button className="btn btn-primary" onClick={submit} disabled={missing.length > 0}>
            Submit for Approval{missing.length > 0 ? ` — ${missing.length} required doc(s) missing` : ''}
          </button>
        </div>
      )}
    </div>
  );
}

/* ---------------- Admin / supervisor review & approval ---------------- */
function AdminOnboarding() {
  const { employees, fetchEmployees, docConfig, fetchDocConfig, onboardingAction, toggleDocRequirement, grantable, fetchGrantable, addEmployee } = useStore();
  const [review, setReview] = useState(null);
  const [note, setNote] = useState('');
  const [addOpen, setAddOpen] = useState(false);

  useEffect(() => { fetchEmployees(); fetchDocConfig(); fetchGrantable(); }, [fetchEmployees, fetchDocConfig, fetchGrantable]);

  const inProgress = employees.filter(e => e.onboardingState && e.onboardingState !== 'approved');
  const required = docConfig.filter(d => d.required);
  const act = async (id, action, n) => { await onboardingAction(id, action, n); setReview(null); setNote(''); };

  return (
    <div className="view-panel active-view">
      <div className="view-header">
        <div><h2>Onboarding</h2><p>New-hire intake, document review &amp; approval.</p></div>
        <button className="btn btn-primary" onClick={() => setAddOpen(true)}><i className="material-icons-round">how_to_reg</i> Add New Hire</button>
      </div>

      <div className="glass p-6" style={{ marginBottom: '1.5rem' }}>
        <h3>Mandatory Documents</h3>
        <p className="text-muted" style={{ fontSize: '0.8rem' }}>Toggle off to make a document optional for submission.</p>
        <div className="perm-grid" style={{ marginTop: '8px' }}>
          {docConfig.map(d => (
            <label key={d.key} className="perm-item">
              <input type="checkbox" checked={d.required} onChange={() => toggleDocRequirement(d.key, !d.required)} />
              <span>{d.label}</span>
            </label>
          ))}
        </div>
      </div>

      <div className="table-responsive">
        <table className="table">
          <thead><tr><th>Candidate</th><th>Department</th><th>Onboarding</th><th>Docs</th><th>Actions</th></tr></thead>
          <tbody>
            {inProgress.length === 0 ? <tr><td colSpan="5">No onboarding in progress.</td></tr> : inProgress.map(e => {
              const docs = parse(e.documents, {});
              const have = required.filter(d => docs[d.key]).length;
              const st = STATE[e.onboardingState] || {};
              return (
                <tr key={e.id}>
                  <td><strong>{e.name}</strong><br /><small>{e.email}</small></td>
                  <td>{e.department}</td>
                  <td><span className={`badge ${st.cls}`}>{st.label}</span></td>
                  <td>{have}/{required.length}</td>
                  <td>
                    <div className="action-btn-group">
                      <button className="btn btn-sm btn-secondary" onClick={() => setReview(e)}><i className="material-icons-round">visibility</i> Review</button>
                      {(e.onboardingState === 'draft' || e.onboardingState === 'returned') &&
                        <button className="btn btn-sm btn-secondary" onClick={() => act(e.id, 'push')}>Remind</button>}
                    </div>
                  </td>
                </tr>
              );
            })}
          </tbody>
        </table>
      </div>

      {review && (() => {
        const docs = parse(review.documents, {});
        const exp = parse(review.experience, []) || [];
        const edu = parse(review.education, []) || [];
        return (
          <Modal wide title={`Review — ${review.name}`} onClose={() => { setReview(null); setNote(''); }}>
            <div style={{ maxHeight: '62vh', overflowY: 'auto' }}>
              <h4>Attachments</h4>
              <div className="table-responsive">
                <table className="table"><thead><tr><th>Document</th><th>File</th><th>Status</th></tr></thead>
                  <tbody>
                    {docConfig.map(d => (
                      <tr key={d.key}>
                        <td>{d.label}{d.required && <span style={{ color: 'var(--accent)' }}> *</span>}</td>
                        <td>{docs[d.key] ? (
                          <a className="doc-name" href={`/api/files/${review.id}/${d.key}`} target="_blank" rel="noreferrer" title="Open attachment">
                            <i className="material-icons-round">description</i> {docs[d.key]}
                          </a>
                        ) : '—'}</td>
                        <td>{docs[d.key] ? <span className="badge badge-success">Uploaded</span> : <span className="badge badge-danger">Missing</span>}</td>
                      </tr>
                    ))}
                  </tbody>
                </table>
              </div>
              <h4 style={{ marginTop: '1rem' }}>Education</h4>
              {edu.length ? edu.map((x, i) => <p key={i}>{x.degree} — {x.institution} {x.year && `(${x.year})`}</p>) : <p className="text-muted">None provided</p>}
              <h4 style={{ marginTop: '1rem' }}>Work Experience</h4>
              {exp.length ? exp.map((x, i) => <p key={i}>{x.company} — {x.designation} {x.duration && `(${x.duration})`}</p>) : <p className="text-muted">None provided</p>}
            </div>
            <div className="form-group" style={{ marginTop: '1rem' }}>
              <label>Note (shown to employee on return)</label>
              <input className="form-control" value={note} onChange={e => setNote(e.target.value)} placeholder="Reason to send back…" />
            </div>
            <div className="action-btn-group">
              <button className="btn btn-danger" onClick={() => act(review.id, 'return', note)}>Return for re-upload</button>
              <button className="btn btn-secondary" onClick={() => act(review.id, 'push')}>Send to employee</button>
              <button className="btn btn-primary" disabled={review.onboardingState !== 'submitted'} onClick={() => act(review.id, 'approve')}>Approve &amp; Lock</button>
            </div>
          </Modal>
        );
      })()}

      {addOpen && (
        <Modal wide title="Add New Hire" onClose={() => setAddOpen(false)}>
          <EmployeeForm mode="create" grantable={grantable}
            onSubmit={async (p) => { await addEmployee({ ...p, status: 'onboarding_draft', onboardingState: 'draft', onboardingNote: 'Please complete your onboarding details and upload the required documents.' }); setAddOpen(false); }}
            onCancel={() => setAddOpen(false)} />
        </Modal>
      )}
    </div>
  );
}

function Onboarding() {
  const { user } = useStore();
  return hasCap(user, 'createUsers') ? <AdminOnboarding /> : <MyOnboarding />;
}

export default Onboarding;
