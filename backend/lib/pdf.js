const PDFDocument = require('pdfkit');

function streamToBuffer(doc) {
  return new Promise((resolve, reject) => {
    const chunks = [];
    doc.on('data', (c) => chunks.push(c));
    doc.on('end', () => resolve(Buffer.concat(chunks)));
    doc.on('error', reject);
    doc.end();
  });
}

async function payslipPdf({ employee, slip, company = 'JJFO' }) {
  const doc = new PDFDocument({ margin: 50, size: 'A4' });
  doc.fontSize(18).text(`${company} — Payslip`, { align: 'center' });
  doc.moveDown(0.5);
  doc.fontSize(10).fillColor('#666').text(`Confidential · Generated ${new Date().toLocaleDateString('en-IN')}`, { align: 'center' });
  doc.fillColor('#000').moveDown();
  doc.fontSize(12).text(`Employee: ${employee.name} (${employee.id})`);
  doc.text(`Department: ${employee.department || '—'} · ${employee.designation || '—'}`);
  doc.text(`Email: ${employee.email || '—'}`);
  doc.text(`Pay period: ${slip.month}`);
  doc.moveDown();
  doc.fontSize(11).text('Earnings', { underline: true });
  doc.text(`Basic:          ₹ ${Number(slip.basic).toLocaleString('en-IN')}`);
  doc.text(`Allowances:     ₹ ${Number(slip.allowances).toLocaleString('en-IN')}`);
  doc.text(`Gross:          ₹ ${Number(slip.grossPay).toLocaleString('en-IN')}`);
  doc.moveDown(0.5);
  doc.text('Deductions', { underline: true });
  doc.text(`PF:             ₹ ${Number(slip.pf).toLocaleString('en-IN')}`);
  doc.text(`PT:             ₹ ${Number(slip.pt).toLocaleString('en-IN')}`);
  doc.text(`TDS:            ₹ ${Number(slip.tds).toLocaleString('en-IN')}`);
  doc.text(`Other:          ₹ ${Number(slip.deductions).toLocaleString('en-IN')}`);
  doc.moveDown();
  doc.fontSize(14).text(`Net Pay: ₹ ${Number(slip.netPay).toLocaleString('en-IN')}`, { underline: true });
  doc.moveDown(2);
  doc.fontSize(9).fillColor('#666').text('This is a system-generated payslip from JJFO HRMS. For queries contact HR.', { align: 'center' });
  return streamToBuffer(doc);
}

async function form16Pdf({ employee, form16, company = 'JJFO' }) {
  const doc = new PDFDocument({ margin: 50, size: 'A4' });
  doc.fontSize(16).text(`${company} — Form 16 (Part B summary)`, { align: 'center' });
  doc.moveDown();
  doc.fontSize(11).text(`Financial Year: ${form16.financialYear}`);
  doc.text(`Employee: ${employee.name} (${employee.id})`);
  doc.text(`PAN / Email: ${employee.email || '—'}`);
  doc.moveDown();
  doc.text(`Gross salary:           ₹ ${Number(form16.gross).toLocaleString('en-IN')}`);
  doc.text(`Taxable income (approx): ₹ ${Number(form16.netTaxable).toLocaleString('en-IN')}`);
  doc.text(`TDS deducted:           ₹ ${Number(form16.tds).toLocaleString('en-IN')}`);
  doc.moveDown();
  doc.fontSize(10).fillColor('#666').text(
    'This is a simplified Form 16 summary for internal ESS use. Official Form 16 Part A/B should be issued from TRACES/employer portal for ITR filing.',
    { align: 'left' }
  );
  doc.moveDown(2);
  doc.fillColor('#000').text(`Issued: ${new Date(form16.issuedAt).toLocaleDateString('en-IN')}`);
  doc.text(`Status: ${form16.status}`);
  return streamToBuffer(doc);
}

module.exports = { payslipPdf, form16Pdf };
