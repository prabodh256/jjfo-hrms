import React, { useState } from 'react';
import PermissionPicker from './PermissionPicker';

const DEPARTMENTS = ['HR & Operations', 'Finance & Investments', 'IT & Security', 'Legal & Compliance', 'Real Estate Management', 'Corporate Relations'];
const BLOOD_GROUPS = ['O+', 'O-', 'A+', 'A-', 'B+', 'B-', 'AB+', 'AB-'];
const ROLES = ['employee', 'admin', 'candidate'];
const STATUSES = ['active', 'onboarding_draft', 'onboarding_pending', 'inactive'];
const DOC_TYPES = [
  { key: 'joiningLetter', label: 'Joining Letter' },
  { key: 'relievingLetter', label: 'Relieving Letter (previous org)' },
  { key: 'payslip', label: 'Previous Payslip' },
  { key: 'idProof', label: 'Government ID Proof' }
];

function parse(raw, fallback) { try { return raw ? JSON.parse(raw) : fallback; } catch { return fallback; } }

// mode: 'create' | 'edit' (admin/delegated) | 'self'
function EmployeeForm({ employee, mode, grantable, onSubmit, onCancel }) {
  const isSelf = mode === 'self';
  const isCreate = mode === 'create';
  const e = employee || {};

  const [f, setF] = useState({
    name: e.name || '', email: e.email || '',
    department: e.department || DEPARTMENTS[0], designation: e.designation || '',
    role: e.role || 'employee', status: e.status || (isCreate ? 'onboarding_draft' : 'active'),
    contact: e.contact || '', age: e.age ?? '', bloodGroup: e.bloodGroup || 'O+', doj: e.doj || '',
    salaryBasic: e.salaryBasic ?? '', salaryAllow: e.salaryAllow ?? '', salaryDeduct: e.salaryDeduct ?? ''
  });
  const [experiences, setExperiences] = useState(() => parse(e.experience, []) || []);
  const [documents, setDocuments] = useState(() => parse(e.documents, {}) || {});
  const [perm, setPerm] = useState(() => {
    const p = parse(e.permissions, {}) || {};
    return { modules: Array.isArray(p.modules) ? p.modules : [], caps: p.caps || {} };
  });
  const [err, setErr] = useState('');
  const [busy, setBusy] = useState(false);

  const set = (k, v) => setF({ ...f, [k]: v });
  const addExperience = () => setExperiences([...experiences, { company: '', designation: '', duration: '' }]);
  const setExp = (i, k, v) => setExperiences(experiences.map((x, idx) => idx === i ? { ...x, [k]: v } : x));
  const removeExp = (i) => setExperiences(experiences.filter((_, idx) => idx !== i));
  const setDoc = (key, name) => setDocuments({ ...documents, [key]: name });

  const submit = async (ev) => {
    ev.preventDefault();
    setErr(''); setBusy(true);
    try {
      const cleanExp = experiences.filter(x => x.company || x.designation || x.duration);
      let payload;
      if (isSelf) {
        payload = { contact: f.contact, age: f.age, bloodGroup: f.bloodGroup, designation: f.designation, experience: cleanExp, documents };
      } else {
        payload = { ...f, experience: cleanExp, documents };
        if (grantable) payload.permissions = perm; // delegated grant (subset enforced server-side)
        if (!isCreate) delete payload.email; // email is the immutable key
      }
      await onSubmit(payload);
    } catch (e2) { setErr(e2.message); setBusy(false); }
  };

  return (
    <form onSubmit={submit} className="employee-form">
      {err && <div className="form-error">{err}</div>}

      {!isSelf && (
        <div className="form-grid">
          <div className="form-group"><label>Full Name</label>
            <input className="form-control" value={f.name} onChange={ev => set('name', ev.target.value)} required /></div>
          <div className="form-group"><label>Email</label>
            <input className="form-control" type="email" value={f.email} disabled={!isCreate}
              onChange={ev => set('email', ev.target.value)} required /></div>
          <div className="form-group"><label>Department</label>
            <select className="form-control" value={f.department} onChange={ev => set('department', ev.target.value)}>
              {DEPARTMENTS.map(d => <option key={d}>{d}</option>)}</select></div>
          <div className="form-group"><label>Role</label>
            <select className="form-control" value={f.role} onChange={ev => set('role', ev.target.value)}>
              {ROLES.map(r => <option key={r}>{r}</option>)}</select></div>
          <div className="form-group"><label>Status</label>
            <select className="form-control" value={f.status} onChange={ev => set('status', ev.target.value)}>
              {STATUSES.map(s => <option key={s}>{s}</option>)}</select></div>
          <div className="form-group"><label>Date of Joining</label>
            <input className="form-control" type="date" value={f.doj} onChange={ev => set('doj', ev.target.value)} /></div>
          <div className="form-group"><label>Basic Salary</label>
            <input className="form-control" type="number" min="0" value={f.salaryBasic} onChange={ev => set('salaryBasic', ev.target.value)} /></div>
          <div className="form-group"><label>Allowances</label>
            <input className="form-control" type="number" min="0" value={f.salaryAllow} onChange={ev => set('salaryAllow', ev.target.value)} /></div>
          <div className="form-group"><label>Deductions</label>
            <input className="form-control" type="number" min="0" value={f.salaryDeduct} onChange={ev => set('salaryDeduct', ev.target.value)} /></div>
        </div>
      )}

      <div className="form-grid">
        <div className="form-group"><label>Designation</label>
          <input className="form-control" value={f.designation} onChange={ev => set('designation', ev.target.value)} /></div>
        <div className="form-group"><label>Contact Number</label>
          <input className="form-control" value={f.contact} onChange={ev => set('contact', ev.target.value)} /></div>
        <div className="form-group"><label>Age</label>
          <input className="form-control" type="number" min="18" value={f.age} onChange={ev => set('age', ev.target.value)} /></div>
        <div className="form-group"><label>Blood Group</label>
          <select className="form-control" value={f.bloodGroup} onChange={ev => set('bloodGroup', ev.target.value)}>
            {BLOOD_GROUPS.map(b => <option key={b}>{b}</option>)}</select></div>
      </div>

      {/* Incremental work experience (admin/supervisor; employees use My Onboarding) */}
      {!isSelf && <div className="form-section">
        <h4>Work Experience</h4>
        {experiences.map((x, i) => (
          <div key={i} className="exp-row">
            <strong>Experience {i + 1}</strong>
            <div className="form-grid">
              <input className="form-control" placeholder="Company" value={x.company} onChange={ev => setExp(i, 'company', ev.target.value)} />
              <input className="form-control" placeholder="Designation" value={x.designation} onChange={ev => setExp(i, 'designation', ev.target.value)} />
              <input className="form-control" placeholder="Duration (e.g. 3 Years)" value={x.duration} onChange={ev => setExp(i, 'duration', ev.target.value)} />
            </div>
            <button type="button" className="btn btn-sm btn-secondary" onClick={() => removeExp(i)}>Remove</button>
          </div>
        ))}
        <button type="button" className="btn btn-sm btn-secondary" onClick={addExperience}>
          <i className="material-icons-round">add</i> Add Experience {experiences.length + 1}
        </button>
      </div>}

      {/* Document uploads -> stored under the employee's Drive folder */}
      {!isSelf && <div className="form-section">
        <h4>Documents</h4>
        <div className="form-grid">
          {DOC_TYPES.map(d => (
            <div className="form-group" key={d.key}>
              <label>{d.label}</label>
              <input className="form-control" type="file" onChange={ev => setDoc(d.key, ev.target.files[0]?.name || '')} />
              {documents[d.key] && <small className="doc-name"><i className="material-icons-round">description</i> {documents[d.key]}</small>}
            </div>
          ))}
        </div>
      </div>}

      {/* Delegated permissions — you can only grant what you hold */}
      {!isSelf && grantable && (
        <div className="form-section">
          <h4>Access &amp; Permissions</h4>
          <PermissionPicker value={perm} grantable={grantable} onChange={setPerm} />
        </div>
      )}

      <div className="action-btn-group" style={{ marginTop: '8px' }}>
        <button type="button" className="btn btn-secondary" onClick={onCancel}>Cancel</button>
        <button type="submit" className="btn btn-primary" disabled={busy}>{busy ? 'Saving…' : 'Save'}</button>
      </div>
    </form>
  );
}

export default EmployeeForm;
