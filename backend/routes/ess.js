const express = require('express');
const prisma = require('../prisma/client');
const { authenticate, authorize } = require('../middleware/auth');
const { isSupervisor, effectivePerms } = require('../lib/perms');
const { audit, notify } = require('../lib/audit');
const { payslipPdf, form16Pdf } = require('../lib/pdf');

const router = express.Router();
const loadActor = (req) => prisma.employee.findUnique({ where: { id: req.user.id } });

// ---- Celebrations (birthdays / work anniversaries) ----
router.get('/celebrations', authenticate, async (req, res) => {
  try {
    const emps = await prisma.employee.findMany({
      where: { status: 'active' },
      select: { id: true, name: true, department: true, designation: true, avatar: true, dob: true, doj: true }
    });
    const today = new Date();
    const md = (s) => {
      if (!s || !/^\d{4}-\d{2}-\d{2}/.test(s)) return null;
      return s.slice(5, 10); // MM-DD
    };
    const todayMd = `${String(today.getMonth() + 1).padStart(2, '0')}-${String(today.getDate()).padStart(2, '0')}`;
    // Next 14 days window (simple month wrap not perfect but fine for demo)
    const upcoming = [];
    for (let i = 0; i < 14; i++) {
      const d = new Date(today);
      d.setDate(d.getDate() + i);
      upcoming.push(`${String(d.getMonth() + 1).padStart(2, '0')}-${String(d.getDate()).padStart(2, '0')}`);
    }
    const birthdays = [];
    const anniversaries = [];
    for (const e of emps) {
      const b = md(e.dob);
      const j = md(e.doj);
      if (b && upcoming.includes(b)) {
        birthdays.push({ ...e, when: b, today: b === todayMd, years: e.dob ? today.getFullYear() - Number(e.dob.slice(0, 4)) : null });
      }
      if (j && upcoming.includes(j)) {
        const years = e.doj ? today.getFullYear() - Number(e.doj.slice(0, 4)) : 0;
        if (years > 0) anniversaries.push({ ...e, when: j, today: j === todayMd, years });
      }
    }
    res.json({ birthdays, anniversaries, today: todayMd });
  } catch (e) {
    res.status(500).json({ error: 'Failed to load celebrations' });
  }
});

// ---- Expenses ----
router.get('/expenses', authenticate, async (req, res) => {
  try {
    const actor = await loadActor(req);
    const isAdmin = actor.role === 'admin';
    const canMgr = isAdmin || effectivePerms(actor).caps.approveLeaves || isSupervisor(actor);
    let rows = await prisma.expenseClaim.findMany({ orderBy: { createdAt: 'desc' }, take: 200 });
    if (!isAdmin && !canMgr) rows = rows.filter((r) => r.employeeId === actor.id);
    else if (!isAdmin) {
      const reports = await prisma.employee.findMany({ where: { managerId: actor.id }, select: { id: true } });
      const ids = new Set([actor.id, ...reports.map((r) => r.id)]);
      rows = rows.filter((r) => ids.has(r.employeeId));
    }
    const emps = await prisma.employee.findMany({ select: { id: true, name: true } });
    const nameOf = Object.fromEntries(emps.map((e) => [e.id, e.name]));
    res.json(rows.map((r) => ({ ...r, employeeName: nameOf[r.employeeId] })));
  } catch (e) {
    res.status(500).json({ error: 'Failed to list expenses' });
  }
});

router.post('/expenses', authenticate, async (req, res) => {
  try {
    const { category, amount, description, expenseDate, receiptNote } = req.body;
    if (!category || !amount || !description || !expenseDate) {
      return res.status(400).json({ error: 'category, amount, description, expenseDate required' });
    }
    const row = await prisma.expenseClaim.create({
      data: {
        employeeId: req.user.id,
        category: String(category).slice(0, 80),
        amount: Number(amount),
        description: String(description).slice(0, 1000),
        expenseDate,
        receiptNote: receiptNote ? String(receiptNote).slice(0, 300) : null,
        status: 'Pending'
      }
    });
    await audit(req.user, 'submit', 'expense', row.id, `${category} ₹${amount}`);
    const me = await loadActor(req);
    if (me.managerId) await notify(me.managerId, 'Expense claim pending', `${me.name}: ${category} ₹${amount}`, 'payroll');
    res.json(row);
  } catch (e) {
    res.status(500).json({ error: 'Failed to submit expense' });
  }
});

router.put('/expenses/:id/decide', authenticate, async (req, res) => {
  try {
    const actor = await loadActor(req);
    const row = await prisma.expenseClaim.findUnique({ where: { id: req.params.id } });
    if (!row || row.status !== 'Pending') return res.status(400).json({ error: 'Not pending' });
    const emp = await prisma.employee.findUnique({ where: { id: row.employeeId }, select: { managerId: true, name: true } });
    const isAdmin = actor.role === 'admin';
    if (!isAdmin && emp?.managerId !== actor.id) return res.status(403).json({ error: 'Manager or admin only' });
    const approve = !!req.body.approve;
    const updated = await prisma.expenseClaim.update({
      where: { id: row.id },
      data: {
        status: approve ? 'Approved' : 'Rejected',
        managerNote: req.body.note ? String(req.body.note).slice(0, 500) : null,
        decidedBy: actor.id,
        decidedAt: new Date()
      }
    });
    await audit(actor, approve ? 'approve' : 'reject', 'expense', row.id, req.body.note || '');
    await notify(row.employeeId, `Expense ${approve ? 'approved' : 'rejected'}`,
      `${row.category} ₹${row.amount}${req.body.note ? ' — ' + req.body.note : ''}`, 'payroll');
    res.json(updated);
  } catch (e) {
    res.status(500).json({ error: 'Failed to decide expense' });
  }
});

// ---- Payslip PDF + Form 16 ----
router.get('/payroll/:id/pdf', authenticate, async (req, res) => {
  try {
    const slip = await prisma.payroll.findUnique({ where: { id: req.params.id } });
    if (!slip) return res.status(404).json({ error: 'Payslip not found' });
    const actor = await loadActor(req);
    if (actor.role !== 'admin' && slip.employeeId !== actor.id) {
      return res.status(403).json({ error: 'Not your payslip' });
    }
    const employee = await prisma.employee.findUnique({ where: { id: slip.employeeId } });
    const buf = await payslipPdf({ employee, slip });
    res.setHeader('Content-Type', 'application/pdf');
    res.setHeader('Content-Disposition', `attachment; filename="payslip-${slip.month.replace(/\s+/g, '-')}-${employee.id}.pdf"`);
    res.send(buf);
  } catch (e) {
    console.error(e);
    res.status(500).json({ error: 'PDF generation failed' });
  }
});

router.get('/form16', authenticate, async (req, res) => {
  try {
    const actor = await loadActor(req);
    const where = actor.role === 'admin' && req.query.all === '1' ? {} : { employeeId: actor.id };
    res.json(await prisma.form16.findMany({ where, orderBy: { financialYear: 'desc' } }));
  } catch (e) {
    res.status(500).json({ error: 'Failed to list Form 16' });
  }
});

router.post('/form16/issue', authenticate, authorize(['admin']), async (req, res) => {
  try {
    const fy = req.body.financialYear || '2025-26';
    const emps = await prisma.employee.findMany({ where: { status: 'active' } });
    const slips = await prisma.payroll.findMany();
    const results = [];
    for (const emp of emps) {
      const mine = slips.filter((s) => s.employeeId === emp.id);
      const gross = mine.reduce((a, s) => a + s.grossPay, 0) || (emp.salaryBasic + emp.salaryAllow) * 12;
      const tds = mine.reduce((a, s) => a + s.tds, 0);
      const netTaxable = Math.max(0, gross - 50000);
      const row = await prisma.form16.upsert({
        where: { employeeId_financialYear: { employeeId: emp.id, financialYear: fy } },
        update: { gross, tds, netTaxable, status: 'Issued', issuedAt: new Date() },
        create: { employeeId: emp.id, financialYear: fy, gross, tds, netTaxable }
      });
      results.push(row);
      await notify(emp.id, 'Form 16 available', `Form 16 for FY ${fy} is ready to download.`, 'payroll');
    }
    await audit(req.user, 'issue', 'form16', fy, `${results.length} employees`);
    res.json({ issued: results.length, rows: results });
  } catch (e) {
    console.error(e);
    res.status(500).json({ error: 'Failed to issue Form 16' });
  }
});

router.get('/form16/:id/pdf', authenticate, async (req, res) => {
  try {
    const form16 = await prisma.form16.findUnique({ where: { id: req.params.id } });
    if (!form16) return res.status(404).json({ error: 'Not found' });
    const actor = await loadActor(req);
    if (actor.role !== 'admin' && form16.employeeId !== actor.id) return res.status(403).json({ error: 'Forbidden' });
    const employee = await prisma.employee.findUnique({ where: { id: form16.employeeId } });
    const buf = await form16Pdf({ employee, form16 });
    res.setHeader('Content-Type', 'application/pdf');
    res.setHeader('Content-Disposition', `attachment; filename="form16-${form16.financialYear}-${employee.id}.pdf"`);
    res.send(buf);
  } catch (e) {
    res.status(500).json({ error: 'PDF failed' });
  }
});

// ---- Surveys / engagement ----
router.get('/surveys', authenticate, async (req, res) => {
  try {
    const surveys = await prisma.survey.findMany({ orderBy: { createdAt: 'desc' } });
    const my = await prisma.surveyResponse.findMany({ where: { employeeId: req.user.id } });
    const answered = new Set(my.map((m) => m.surveyId));
    res.json(surveys.map((s) => ({
      ...s,
      questions: JSON.parse(s.questions || '[]'),
      answered: answered.has(s.id)
    })));
  } catch (e) {
    res.status(500).json({ error: 'Failed to list surveys' });
  }
});

router.post('/surveys', authenticate, async (req, res) => {
  try {
    const actor = await loadActor(req);
    if (actor.role !== 'admin' && !isSupervisor(actor)) return res.status(403).json({ error: 'Admin/HR only' });
    const { title, description, questions, closesAt } = req.body;
    if (!title || !Array.isArray(questions) || !questions.length) {
      return res.status(400).json({ error: 'title and questions[] required' });
    }
    const s = await prisma.survey.create({
      data: {
        title, description: description || null,
        questions: JSON.stringify(questions),
        createdBy: actor.id,
        closesAt: closesAt || null,
        active: true
      }
    });
    const active = await prisma.employee.findMany({ where: { status: 'active' }, select: { id: true } });
    for (const e of active) await notify(e.id, 'New engagement survey', title, 'general');
    await audit(actor, 'create', 'survey', s.id, title);
    res.json({ ...s, questions });
  } catch (e) {
    res.status(500).json({ error: 'Failed to create survey' });
  }
});

router.post('/surveys/:id/respond', authenticate, async (req, res) => {
  try {
    const survey = await prisma.survey.findUnique({ where: { id: req.params.id } });
    if (!survey || !survey.active) return res.status(400).json({ error: 'Survey not available' });
    const answers = req.body.answers;
    if (!answers || typeof answers !== 'object') return res.status(400).json({ error: 'answers object required' });
    const row = await prisma.surveyResponse.upsert({
      where: { surveyId_employeeId: { surveyId: survey.id, employeeId: req.user.id } },
      update: { answers: JSON.stringify(answers) },
      create: { surveyId: survey.id, employeeId: req.user.id, answers: JSON.stringify(answers) }
    });
    res.json(row);
  } catch (e) {
    res.status(500).json({ error: 'Failed to save response' });
  }
});

router.get('/surveys/:id/results', authenticate, async (req, res) => {
  try {
    const actor = await loadActor(req);
    if (actor.role !== 'admin' && !isSupervisor(actor)) return res.status(403).json({ error: 'Forbidden' });
    const responses = await prisma.surveyResponse.findMany({ where: { surveyId: req.params.id } });
    res.json({ count: responses.length, responses: responses.map((r) => ({ ...r, answers: JSON.parse(r.answers || '{}') })) });
  } catch (e) {
    res.status(500).json({ error: 'Failed to load results' });
  }
});

// ---- Policy docs ----
router.get('/policies', authenticate, async (req, res) => {
  try {
    const policies = await prisma.policyDoc.findMany({ where: { active: true }, orderBy: { createdAt: 'desc' } });
    const acks = await prisma.policyAck.findMany({ where: { employeeId: req.user.id } });
    const ackSet = new Set(acks.map((a) => a.policyId));
    res.json(policies.map((p) => ({ ...p, acknowledged: ackSet.has(p.id) })));
  } catch (e) {
    res.status(500).json({ error: 'Failed to list policies' });
  }
});

router.post('/policies', authenticate, async (req, res) => {
  try {
    const actor = await loadActor(req);
    if (actor.role !== 'admin' && !isSupervisor(actor)) return res.status(403).json({ error: 'Admin/HR only' });
    const { title, category, version, body, mandatory } = req.body;
    if (!title || !body) return res.status(400).json({ error: 'title and body required' });
    const p = await prisma.policyDoc.create({
      data: {
        title, body, category: category || 'General', version: version || '1.0',
        mandatory: mandatory !== false, publishedBy: actor.id, active: true
      }
    });
    const active = await prisma.employee.findMany({ where: { status: 'active' }, select: { id: true } });
    for (const e of active) await notify(e.id, 'New policy published', `${title} — please read & acknowledge`, 'onboarding');
    await audit(actor, 'publish', 'policy', p.id, title);
    res.json(p);
  } catch (e) {
    res.status(500).json({ error: 'Failed to publish policy' });
  }
});

router.post('/policies/:id/ack', authenticate, async (req, res) => {
  try {
    const policy = await prisma.policyDoc.findUnique({ where: { id: req.params.id } });
    if (!policy || !policy.active) return res.status(404).json({ error: 'Policy not found' });
    const row = await prisma.policyAck.upsert({
      where: { policyId_employeeId: { policyId: policy.id, employeeId: req.user.id } },
      update: { at: new Date() },
      create: { policyId: policy.id, employeeId: req.user.id }
    });
    await audit(req.user, 'acknowledge', 'policy', policy.id, policy.title);
    res.json(row);
  } catch (e) {
    res.status(500).json({ error: 'Failed to acknowledge' });
  }
});

module.exports = router;
