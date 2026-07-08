import React, { useEffect, useState } from 'react';
import useStore from '../store';

const MONTHS = ['January', 'February', 'March', 'April', 'May', 'June', 'July', 'August', 'September', 'October', 'November', 'December'];
const YEARS = ['2025', '2026', '2027'];
const TAX_FIELDS = [
  { key: 'section80C', label: 'Section 80C' },
  { key: 'section80D', label: 'Section 80D' },
  { key: 'hraRent', label: 'Monthly HRA Rent' },
  { key: 'otherDeductions', label: 'Other Deductions' }
];

function Payroll() {
  const {
    payroll, fetchPayroll, processPayroll, tax, fetchTax, saveTax, user, cycles, fetchCycles, finalizePayroll,
    form16List, fetchForm16, issueForm16, downloadPayslipPdf, downloadForm16Pdf
  } = useStore();
  const [month, setMonth] = useState('June');
  const [year, setYear] = useState('2026');
  const [taxForm, setTaxForm] = useState({ section80C: 0, section80D: 0, hraRent: 0, otherDeductions: 0 });
  const [msg, setMsg] = useState('');
  const isAdmin = user?.role === 'admin';
  const period = `${month} ${year}`;
  const isFinalized = cycles.some((c) => c.month === period && c.finalized);

  useEffect(() => {
    fetchPayroll(); fetchTax(); fetchCycles(); fetchForm16();
  }, [fetchPayroll, fetchTax, fetchCycles, fetchForm16]);
  useEffect(() => {
    if (tax) setTaxForm({ section80C: tax.section80C, section80D: tax.section80D, hraRent: tax.hraRent, otherDeductions: tax.otherDeductions });
  }, [tax]);

  const runPayroll = async () => {
    setMsg('');
    try { await processPayroll(period); setMsg(`Payroll processed for ${period}.`); }
    catch (e) { setMsg(e.message); }
  };

  const finalize = async () => {
    if (!window.confirm(`Finalize ${period}? It cannot be reprocessed afterwards.`)) return;
    setMsg('');
    try { await finalizePayroll(period); setMsg(`${period} finalized and locked.`); }
    catch (e) { setMsg(e.message); }
  };

  const submitTax = async (e) => {
    e.preventDefault(); setMsg('');
    try { await saveTax(taxForm); setMsg('Tax declaration saved.'); }
    catch (err) { setMsg(err.message); }
  };

  return (
    <div className="view-panel active-view">
      <div className="view-header"><div><h2>Payroll &amp; Tax</h2><p>Payslips (PDF), Form 16, and tax declarations.</p></div></div>
      {msg && <p className="form-ok">{msg}</p>}

      {isAdmin && (
        <div className="glass p-6" style={{ marginBottom: '1.5rem' }}>
          <h3>Run Monthly Payroll</h3>
          <div style={{ display: 'flex', gap: '1rem', marginTop: '1rem', flexWrap: 'wrap' }}>
            <select className="form-control" style={{ maxWidth: '160px' }} value={month} onChange={(e) => setMonth(e.target.value)}>
              {MONTHS.map((m) => <option key={m}>{m}</option>)}
            </select>
            <select className="form-control" style={{ maxWidth: '120px' }} value={year} onChange={(e) => setYear(e.target.value)}>
              {YEARS.map((y) => <option key={y}>{y}</option>)}
            </select>
            <button type="button" className="btn btn-primary" onClick={runPayroll} disabled={isFinalized}>Process Payroll</button>
            <button type="button" className="btn btn-secondary" onClick={finalize} disabled={isFinalized}>
              <i className="material-icons-round">lock</i> Finalize
            </button>
            {isFinalized && <span className="badge badge-danger" style={{ alignSelf: 'center' }}>Finalized — locked</span>}
          </div>
        </div>
      )}

      <div className="table-responsive" style={{ marginBottom: '1.5rem' }}>
        <table className="table">
          <thead><tr><th>Employee</th><th>Month</th><th>Gross</th><th>PF</th><th>TDS</th><th>Net Pay</th><th>Status</th><th>PDF</th></tr></thead>
          <tbody>
            {payroll.length === 0 ? <tr><td colSpan="8">No payslips yet.</td></tr> : payroll.map((p) => (
              <tr key={p.id}>
                <td>{p.employee?.name || p.employeeId}</td><td>{p.month}</td>
                <td>₹{p.grossPay.toLocaleString()}</td><td>₹{p.pf.toLocaleString()}</td>
                <td>₹{p.tds.toLocaleString()}</td><td><strong>₹{p.netPay.toLocaleString()}</strong></td>
                <td><span className="badge badge-success">{p.status}</span></td>
                <td>
                  <button type="button" className="btn btn-sm btn-secondary" onClick={() => downloadPayslipPdf(p.id)}>
                    <i className="material-icons-round" style={{ fontSize: 16, verticalAlign: 'middle' }}>picture_as_pdf</i> Download
                  </button>
                </td>
              </tr>
            ))}
          </tbody>
        </table>
      </div>

      <div className="glass p-6" style={{ marginBottom: '1.5rem' }}>
        <div style={{ display: 'flex', justifyContent: 'space-between', alignItems: 'center', flexWrap: 'wrap', gap: 8 }}>
          <h3>Form 16</h3>
          {isAdmin && (
            <button type="button" className="btn btn-sm btn-primary" onClick={async () => {
              try {
                await issueForm16('2025-26');
                setMsg('Form 16 issued for all active employees (FY 2025-26).');
              } catch (e) { setMsg(e.message); }
            }}>Issue Form 16 (FY 2025-26)</button>
          )}
        </div>
        <div className="table-responsive" style={{ marginTop: 12 }}>
          <table className="table">
            <thead><tr><th>FY</th><th>Gross</th><th>TDS</th><th>Taxable</th><th>Status</th><th></th></tr></thead>
            <tbody>
              {(form16List || []).length === 0 ? (
                <tr><td colSpan={5} className="text-muted">No Form 16 yet.{isAdmin ? ' Click Issue above.' : ''}</td></tr>
              ) : form16List.map((f) => (
                <tr key={f.id}>
                  <td>{f.financialYear}</td>
                  <td>₹{Number(f.gross).toLocaleString()}</td>
                  <td>₹{Number(f.tds).toLocaleString()}</td>
                  <td>₹{Number(f.netTaxable).toLocaleString()}</td>
                  <td><span className="badge badge-success">{f.status}</span></td>
                  <td>
                    <button type="button" className="btn btn-sm btn-secondary" onClick={() => downloadForm16Pdf(f.id)}>Download PDF</button>
                  </td>
                </tr>
              ))}
            </tbody>
          </table>
        </div>
      </div>

      <div className="glass p-6">
        <h3>My Tax Declaration</h3>
        <form onSubmit={submitTax} className="form-grid" style={{ marginTop: '1rem' }}>
          {TAX_FIELDS.map((f) => (
            <div className="form-group" key={f.key}>
              <label>{f.label}</label>
              <input className="form-control" type="number" min="0" value={taxForm[f.key]} onChange={(e) => setTaxForm({ ...taxForm, [f.key]: e.target.value })} />
            </div>
          ))}
          <button type="submit" className="btn btn-primary" style={{ alignSelf: 'end' }}>Save Declaration</button>
        </form>
      </div>
    </div>
  );
}

export default Payroll;
