import React, { useEffect, useMemo, useState } from 'react';
import { apiGet, apiMutate } from '../api';
import useStore from '../store';

const money = (value) => new Intl.NumberFormat('en-IN', { style: 'currency', currency: 'INR', maximumFractionDigits: 0 }).format(value || 0);

export default function Insurance() {
  const { user, employees, fetchEmployees } = useStore();
  const admin = user?.role === 'admin';
  const [tab, setTab] = useState('coverage');
  const [plans, setPlans] = useState([]);
  const [enrollments, setEnrollments] = useState([]);
  const [claims, setClaims] = useState([]);
  const [summary, setSummary] = useState({});
  const [notice, setNotice] = useState('');
  const [busy, setBusy] = useState(false);
  const [plan, setPlan] = useState({ name: '', provider: '', tpa: '', policyNumber: '', planType: 'Group Medical', coverageAmount: '', premiumEmployer: '', premiumEmployee: '', effectiveFrom: '', effectiveTo: '', eligibility: '', coverageSummary: '' });
  const [dependent, setDependent] = useState({ enrollmentId: '', name: '', relationship: 'Spouse', dob: '', documentRef: '' });
  const [claim, setClaim] = useState({ enrollmentId: '', claimType: 'Hospitalization', treatmentDate: '', hospital: '', amountClaimed: '', notes: '' });

  const planById = useMemo(() => new Map(plans.map((item) => [item.id, item])), [plans]);
  const load = async () => {
    const [p, e, c, s] = await Promise.all([
      apiGet('/api/enterprise/insurance/plans'), apiGet('/api/enterprise/insurance/enrollments'),
      apiGet('/api/enterprise/insurance/claims'), apiGet('/api/enterprise/summary')
    ]);
    setPlans(p.plans || []); setEnrollments(e.enrollments || []); setClaims(c.claims || []); setSummary(s);
  };
  useEffect(() => { if (admin) fetchEmployees(true); load().catch((error) => setNotice(error.message)); }, [admin, fetchEmployees]);

  const createPlan = async (e) => {
    e.preventDefault(); setBusy(true); setNotice('');
    try {
      await apiMutate('/api/enterprise/insurance/plans', 'POST', plan);
      setPlan({ name: '', provider: '', tpa: '', policyNumber: '', planType: 'Group Medical', coverageAmount: '', premiumEmployer: '', premiumEmployee: '', effectiveFrom: '', effectiveTo: '', eligibility: '', coverageSummary: '' });
      setNotice('Insurance plan created.'); await load();
    } catch (error) { setNotice(error.message); } finally { setBusy(false); }
  };
  const enroll = async (planId, employeeId) => {
    setBusy(true); setNotice('');
    try { await apiMutate('/api/enterprise/insurance/enrollments', 'POST', { planId, employeeId }); setNotice(admin ? 'Employee enrolled.' : 'Enrollment request submitted.'); await load(); }
    catch (error) { setNotice(error.message); } finally { setBusy(false); }
  };
  const addDependent = async (e) => {
    e.preventDefault(); setBusy(true); setNotice('');
    try { await apiMutate('/api/enterprise/insurance/dependents', 'POST', dependent); setDependent({ enrollmentId: '', name: '', relationship: 'Spouse', dob: '', documentRef: '' }); setNotice('Dependent submitted for enrollment.'); await load(); }
    catch (error) { setNotice(error.message); } finally { setBusy(false); }
  };
  const submitClaim = async (e) => {
    e.preventDefault(); setBusy(true); setNotice('');
    try { await apiMutate('/api/enterprise/insurance/claims', 'POST', claim); setClaim({ enrollmentId: '', claimType: 'Hospitalization', treatmentDate: '', hospital: '', amountClaimed: '', notes: '' }); setNotice('Claim submitted for review.'); await load(); }
    catch (error) { setNotice(error.message); } finally { setBusy(false); }
  };

  return (
    <div className="view-panel active-view insurance-view">
      <div className="view-header">
        <div><h2>Insurance & Benefits</h2><p>{admin ? 'Configure plans, monitor enrollment, and manage claims.' : 'View coverage, manage dependents, and track claims.'}</p></div>
        <button className="btn btn-secondary" type="button" onClick={() => load().catch((error) => setNotice(error.message))}><i className="material-icons-round">refresh</i> Refresh</button>
      </div>
      {notice && <div className="settings-flash ok" role="status">{notice}</div>}
      <div className="ops-kpis">
        <div className="glass ops-kpi"><i className="material-icons-round">health_and_safety</i><strong>{summary.activePlans || 0}</strong><span>Active plans</span></div>
        <div className="glass ops-kpi"><i className="material-icons-round">verified_user</i><strong>{summary.enrollments || 0}</strong><span>{admin ? 'Enrollments' : 'My coverages'}</span></div>
        <div className="glass ops-kpi"><i className="material-icons-round">receipt_long</i><strong>{summary.claims || 0}</strong><span>{admin ? 'Claims' : 'My claims'}</span></div>
        {admin && <div className="glass ops-kpi"><i className="material-icons-round">pending_actions</i><strong>{summary.pendingEnrollments || 0}</strong><span>Pending enrollment</span></div>}
        {admin && <div className="glass ops-kpi"><i className="material-icons-round">medical_services</i><strong>{summary.pendingClaims || 0}</strong><span>Pending claims</span></div>}
      </div>
      <div className="tab-navigation ops-tabs">
        {['coverage', 'dependents', 'claims', ...(admin ? ['administration'] : [])].map((item) => <button type="button" className={`tab-btn ${tab === item ? 'active' : ''}`} onClick={() => setTab(item)} key={item}>{item[0].toUpperCase() + item.slice(1)}</button>)}
      </div>

      {tab === 'coverage' && (
        <>
          <div className="benefit-grid">{plans.map((item) => {
            const covered = enrollments.some((enrollment) => enrollment.planId === item.id && (!admin || enrollment.employeeId === user.id));
            return <article className="glass benefit-card" key={item.id}><div className="benefit-icon"><i className="material-icons-round">{item.planType.toLowerCase().includes('life') ? 'favorite' : 'health_and_safety'}</i></div><span className="status-badge badge-success">{item.status}</span><h3>{item.name}</h3><p>{item.provider}</p><strong className="coverage-value">{money(item.coverageAmount)}</strong><small>Coverage</small><div className="benefit-meta"><span>Policy {item.policyNumber}</span><span>{item.effectiveFrom} – {item.effectiveTo}</span><span>Employee premium: {money(item.premiumEmployee)}</span></div><p className="benefit-summary">{item.coverageSummary || item.eligibility || 'Plan details available from HR.'}</p>{!covered && !admin && <button className="btn btn-primary" disabled={busy} onClick={() => enroll(item.id)}>Request enrollment</button>}</article>;
          })}</div>
          {!plans.length && <div className="glass empty-state"><i className="material-icons-round">health_and_safety</i><p>No active insurance plans have been configured.</p></div>}
          {admin && plans.length > 0 && <div className="glass p-6 mt-4"><h3>Enroll an employee</h3><div className="insurance-enroll-row"><select className="form-control" id="insurance-employee"><option value="">Select employee</option>{employees.filter((employee) => employee.status === 'active').map((employee) => <option value={employee.id} key={employee.id}>{employee.name}</option>)}</select><select className="form-control" id="insurance-plan"><option value="">Select plan</option>{plans.map((item) => <option value={item.id} key={item.id}>{item.name}</option>)}</select><button className="btn btn-primary" onClick={() => { const employeeId = document.getElementById('insurance-employee').value; const planId = document.getElementById('insurance-plan').value; if (employeeId && planId) enroll(planId, employeeId); }}>Enroll</button></div></div>}
        </>
      )}

      {tab === 'dependents' && (
        <div className="grid-2">
          <form className="glass p-6" onSubmit={addDependent}><h3>Add eligible dependent</h3>
            <div className="form-group"><label>Insurance enrollment</label><select className="form-control" required value={dependent.enrollmentId} onChange={(e) => setDependent({ ...dependent, enrollmentId: e.target.value })}><option value="">Select coverage</option>{enrollments.map((item) => <option value={item.id} key={item.id}>{planById.get(item.planId)?.name || item.planId}{admin ? ` · ${item.employeeId}` : ''}</option>)}</select></div>
            <div className="form-grid"><div className="form-group"><label>Full name</label><input className="form-control" required value={dependent.name} onChange={(e) => setDependent({ ...dependent, name: e.target.value })} /></div><div className="form-group"><label>Relationship</label><select className="form-control" value={dependent.relationship} onChange={(e) => setDependent({ ...dependent, relationship: e.target.value })}>{['Spouse', 'Child', 'Parent', 'Other'].map((item) => <option key={item}>{item}</option>)}</select></div><div className="form-group"><label>Date of birth</label><input className="form-control" type="date" required value={dependent.dob} onChange={(e) => setDependent({ ...dependent, dob: e.target.value })} /></div><div className="form-group"><label>Document reference</label><input className="form-control" value={dependent.documentRef} onChange={(e) => setDependent({ ...dependent, documentRef: e.target.value })} /></div></div>
            <button className="btn btn-primary" disabled={busy}>Submit dependent</button>
          </form>
          <div className="glass p-6"><h3>Covered dependents</h3>{enrollments.flatMap((item) => item.dependents || []).length ? enrollments.flatMap((item) => item.dependents || []).map((item) => <div className="ops-row" key={item.id}><span><strong>{item.name}</strong><small>{item.relationship} · Born {item.dob}</small></span><span className={`status-badge ${item.status === 'active' ? 'badge-success' : 'badge-warning'}`}>{item.status}</span></div>) : <p className="empty-state">No dependents added.</p>}</div>
        </div>
      )}

      {tab === 'claims' && (
        <div className="grid-2">
          <form className="glass p-6" onSubmit={submitClaim}><h3>Submit insurance claim</h3>
            <div className="form-group"><label>Coverage</label><select className="form-control" required value={claim.enrollmentId} onChange={(e) => setClaim({ ...claim, enrollmentId: e.target.value })}><option value="">Select coverage</option>{enrollments.map((item) => <option value={item.id} key={item.id}>{planById.get(item.planId)?.name || item.planId}{admin ? ` · ${item.employeeId}` : ''}</option>)}</select></div>
            <div className="form-grid"><div className="form-group"><label>Claim type</label><select className="form-control" value={claim.claimType} onChange={(e) => setClaim({ ...claim, claimType: e.target.value })}>{['Hospitalization', 'Day care', 'Reimbursement', 'Pre-authorization', 'Life', 'Accident'].map((item) => <option key={item}>{item}</option>)}</select></div><div className="form-group"><label>Amount claimed</label><input className="form-control" type="number" min="1" required value={claim.amountClaimed} onChange={(e) => setClaim({ ...claim, amountClaimed: e.target.value })} /></div><div className="form-group"><label>Treatment date</label><input className="form-control" type="date" value={claim.treatmentDate} onChange={(e) => setClaim({ ...claim, treatmentDate: e.target.value })} /></div><div className="form-group"><label>Hospital</label><input className="form-control" value={claim.hospital} onChange={(e) => setClaim({ ...claim, hospital: e.target.value })} /></div></div>
            <div className="form-group"><label>Notes</label><textarea className="form-control" value={claim.notes} onChange={(e) => setClaim({ ...claim, notes: e.target.value })} /></div><button className="btn btn-primary" disabled={busy}>Submit claim</button>
          </form>
          <div className="glass p-6"><h3>Claim tracking</h3>{claims.length ? claims.map((item) => <div className="ops-row claim-row" key={item.id}><span><strong>{item.claimType} · {money(item.amountClaimed)}</strong><small>{item.claimNumber || 'Reference pending'} · {item.hospital || 'No hospital'} </small></span><span className={`status-badge ${item.status === 'settled' ? 'badge-success' : item.status === 'rejected' ? 'badge-danger' : 'badge-warning'}`}>{item.status}</span></div>) : <p className="empty-state">No claims submitted.</p>}</div>
        </div>
      )}

      {tab === 'administration' && admin && (
        <form className="glass p-6 ops-form" onSubmit={createPlan}><h3>Create insurance plan</h3><div className="form-grid">
          {[
            ['name', 'Plan name'], ['provider', 'Provider'], ['tpa', 'TPA'], ['policyNumber', 'Policy number'],
            ['coverageAmount', 'Coverage amount', 'number'], ['premiumEmployer', 'Employer premium', 'number'],
            ['premiumEmployee', 'Employee premium', 'number'], ['effectiveFrom', 'Effective from', 'date'], ['effectiveTo', 'Effective to', 'date']
          ].map(([key, label, type = 'text']) => <div className="form-group" key={key}><label>{label}</label><input className="form-control" type={type} required={['name', 'provider', 'policyNumber', 'effectiveFrom', 'effectiveTo'].includes(key)} value={plan[key]} onChange={(e) => setPlan({ ...plan, [key]: e.target.value })} /></div>)}
          <div className="form-group"><label>Plan type</label><select className="form-control" value={plan.planType} onChange={(e) => setPlan({ ...plan, planType: e.target.value })}>{['Group Medical', 'Group Term Life', 'Personal Accident', 'Critical Illness', 'Voluntary Top-up'].map((item) => <option key={item}>{item}</option>)}</select></div>
        </div><div className="form-group"><label>Eligibility</label><textarea className="form-control" value={plan.eligibility} onChange={(e) => setPlan({ ...plan, eligibility: e.target.value })} /></div><div className="form-group"><label>Coverage summary</label><textarea className="form-control" value={plan.coverageSummary} onChange={(e) => setPlan({ ...plan, coverageSummary: e.target.value })} /></div><button className="btn btn-primary" disabled={busy}>Create plan</button></form>
      )}
    </div>
  );
}
