const express = require('express');
const bcrypt = require('bcryptjs');
const crypto = require('crypto');
const prisma = require('../prisma/client');
const { authenticate, authorize } = require('../middleware/auth');

const router = express.Router();
router.use(authenticate);

const text = (value, max = 500) => typeof value === 'string' ? value.trim().slice(0, max) : '';
const number = (value) => Number.isFinite(Number(value)) ? Number(value) : 0;
const json = (value) => value == null ? null : (typeof value === 'string' ? value : JSON.stringify(value));

async function audit(req, action, entity, entityId, detail) {
  const actor = await prisma.employee.findUnique({ where: { id: req.user.id }, select: { name: true } });
  await prisma.auditLog.create({ data: {
    actorId: req.user.id, actorName: actor?.name || req.user.id, action, entity, entityId,
    detail: detail ? JSON.stringify(detail).slice(0, 2000) : null
  } });
}

async function canReadEmployee(req, employeeId) {
  if (req.user.role === 'admin' || req.user.id === employeeId) return true;
  const employee = await prisma.employee.findUnique({ where: { id: employeeId }, select: { managerId: true } });
  return employee?.managerId === req.user.id;
}

router.get('/summary', async (req, res) => {
  const [employees, positions, activePlans, myEnrollments, myClaims] = await Promise.all([
    prisma.employee.count({ where: { status: { not: 'inactive' } } }),
    prisma.position.count({ where: { status: 'active' } }),
    prisma.insurancePlan.count({ where: { status: 'active' } }),
    prisma.insuranceEnrollment.count({ where: req.user.role === 'admin' ? {} : { employeeId: req.user.id } }),
    prisma.insuranceClaim.count({ where: req.user.role === 'admin' ? {} : { employeeId: req.user.id } })
  ]);
  const result = { employees, positions, activePlans, enrollments: myEnrollments, claims: myClaims };
  if (req.user.role === 'admin') {
    result.migrationBatches = await prisma.migrationBatch.count();
    result.openMigrationIssues = await prisma.migrationIssue.count({ where: { resolved: false } });
    result.pendingEnrollments = await prisma.insuranceEnrollment.count({ where: { status: 'pending' } });
    result.pendingClaims = await prisma.insuranceClaim.count({ where: { status: { in: ['submitted', 'review'] } } });
  }
  res.json(result);
});

router.get('/data-quality', authorize('admin'), async (_req, res) => {
  const employees = await prisma.employee.findMany({
    where: { status: { not: 'inactive' } },
    select: { id: true, name: true, email: true, department: true, managerId: true, documents: true }
  });
  const enrolled = new Set((await prisma.insuranceEnrollment.findMany({ select: { employeeId: true } })).map((e) => e.employeeId));
  const issues = [];
  for (const employee of employees) {
    if (!employee.department) issues.push({ employeeId: employee.id, name: employee.name, type: 'Missing department', severity: 'high' });
    if (!employee.managerId && employee.id !== 'EMP001') issues.push({ employeeId: employee.id, name: employee.name, type: 'Missing reporting manager', severity: 'high' });
    if (!employee.documents || employee.documents === '{}') issues.push({ employeeId: employee.id, name: employee.name, type: 'No verified documents', severity: 'medium' });
    if (!enrolled.has(employee.id)) issues.push({ employeeId: employee.id, name: employee.name, type: 'Not enrolled in insurance', severity: 'medium' });
  }
  res.json({ issues, count: issues.length });
});

router.get('/positions', async (_req, res) => {
  const positions = await prisma.position.findMany({ orderBy: [{ department: 'asc' }, { title: 'asc' }] });
  res.json({ positions });
});

router.post('/positions', authorize('admin'), async (req, res) => {
  const code = text(req.body.code, 40);
  const title = text(req.body.title, 120);
  const department = text(req.body.department, 120);
  if (!code || !title || !department) return res.status(400).json({ error: 'Code, title, and department are required.' });
  try {
    const position = await prisma.position.create({ data: {
      code, title, department, grade: text(req.body.grade, 50) || null,
      location: text(req.body.location, 100) || null, costCenter: text(req.body.costCenter, 60) || null,
      parentPositionId: text(req.body.parentPositionId, 80) || null,
      employeeId: text(req.body.employeeId, 80) || null,
      approvedHeadcount: Math.max(1, Math.floor(number(req.body.approvedHeadcount) || 1)),
      effectiveFrom: text(req.body.effectiveFrom, 20) || null
    } });
    await audit(req, 'CREATE', 'Position', position.id, { code, title });
    res.status(201).json({ position });
  } catch (error) {
    res.status(409).json({ error: 'Position code or employee assignment already exists.' });
  }
});

router.patch('/positions/:id', authorize('admin'), async (req, res) => {
  const allowed = ['title', 'department', 'grade', 'location', 'costCenter', 'parentPositionId', 'employeeId', 'status', 'effectiveFrom', 'effectiveTo'];
  const data = {};
  for (const key of allowed) if (Object.hasOwn(req.body, key)) data[key] = text(req.body[key], 120) || null;
  if (Object.hasOwn(req.body, 'approvedHeadcount')) data.approvedHeadcount = Math.max(1, Math.floor(number(req.body.approvedHeadcount)));
  try {
    const position = await prisma.position.update({ where: { id: req.params.id }, data });
    await audit(req, 'UPDATE', 'Position', position.id, data);
    res.json({ position });
  } catch {
    res.status(404).json({ error: 'Position not found or update conflicts with another assignment.' });
  }
});

router.get('/history/:employeeId', async (req, res) => {
  if (!(await canReadEmployee(req, req.params.employeeId))) return res.status(403).json({ error: 'Not authorized for this employee history.' });
  const events = await prisma.employeeHistoryEvent.findMany({
    where: { employeeId: req.params.employeeId }, orderBy: [{ effectiveDate: 'desc' }, { createdAt: 'desc' }]
  });
  res.json({ events });
});

router.post('/history', authorize('admin'), async (req, res) => {
  const employeeId = text(req.body.employeeId, 80);
  const eventType = text(req.body.eventType, 50);
  const title = text(req.body.title, 160);
  const effectiveDate = text(req.body.effectiveDate, 20);
  if (!employeeId || !eventType || !title || !effectiveDate) return res.status(400).json({ error: 'Employee, event type, title, and effective date are required.' });
  const employee = await prisma.employee.findUnique({ where: { id: employeeId }, select: { id: true } });
  if (!employee) return res.status(404).json({ error: 'Employee not found.' });
  const event = await prisma.employeeHistoryEvent.create({ data: {
    employeeId, eventType, title, effectiveDate, oldValue: json(req.body.oldValue),
    newValue: json(req.body.newValue), documentRef: text(req.body.documentRef, 300) || null,
    status: text(req.body.status, 30) || 'approved', createdBy: req.user.id
  } });
  await audit(req, 'CREATE', 'EmployeeHistoryEvent', event.id, { employeeId, eventType });
  res.status(201).json({ event });
});

router.get('/migration/batches', authorize('admin'), async (_req, res) => {
  const batches = await prisma.migrationBatch.findMany({ orderBy: { createdAt: 'desc' }, take: 50 });
  const issues = await prisma.migrationIssue.findMany({ where: { resolved: false }, orderBy: { createdAt: 'desc' }, take: 100 });
  res.json({ batches, issues });
});

router.post('/migration/employees', authorize('admin'), async (req, res) => {
  const rows = Array.isArray(req.body.rows) ? req.body.rows.slice(0, 1000) : [];
  if (!rows.length) return res.status(400).json({ error: 'Provide at least one employee row.' });
  const batch = await prisma.migrationBatch.create({ data: {
    name: text(req.body.name, 140) || `Employee migration ${new Date().toISOString().slice(0, 10)}`,
    source: text(req.body.source, 140) || 'CSV upload', cutoffDate: text(req.body.cutoffDate, 20) || null,
    status: 'processing', receivedCount: rows.length, importedBy: req.user.id
  } });
  const seenIds = new Set();
  const seenEmails = new Set();
  const valid = [];
  const issues = [];
  rows.forEach((row, index) => {
    const id = text(row.id || row.employeeId, 80);
    const email = text(row.email, 180).toLowerCase();
    const name = text(row.name, 160);
    if (!id) issues.push({ rowNumber: index + 2, employeeRef: email || name, field: 'id', message: 'Employee ID is required.' });
    if (!name) issues.push({ rowNumber: index + 2, employeeRef: id || email, field: 'name', message: 'Employee name is required.' });
    if (!email || !email.includes('@')) issues.push({ rowNumber: index + 2, employeeRef: id || name, field: 'email', message: 'A valid work email is required.' });
    if (seenIds.has(id)) issues.push({ rowNumber: index + 2, employeeRef: id, field: 'id', message: 'Duplicate employee ID in upload.' });
    if (seenEmails.has(email)) issues.push({ rowNumber: index + 2, employeeRef: id, field: 'email', message: 'Duplicate email in upload.' });
    seenIds.add(id); seenEmails.add(email);
    if (id && name && email.includes('@')) valid.push({ row, id, email, name, rowNumber: index + 2 });
  });
  const temporaryPassword = await bcrypt.hash(crypto.randomBytes(32).toString('hex'), 12);
  let successCount = 0;
  for (const item of valid) {
    const row = item.row;
    try {
      await prisma.employee.upsert({
        where: { id: item.id },
        create: {
          id: item.id, name: item.name, email: item.email, password: temporaryPassword,
          role: text(row.role, 30) || 'employee', status: text(row.status, 30) || 'active',
          department: text(row.department, 120) || null, designation: text(row.designation, 120) || null,
          doj: text(row.doj, 20) || null, dob: text(row.dob, 20) || null, contact: text(row.contact, 40) || null,
          salaryBasic: number(row.salaryBasic), salaryAllow: number(row.salaryAllow), salaryDeduct: number(row.salaryDeduct),
          experience: json(row.experience), education: json(row.education), documents: json(row.documents),
          onboardingState: 'approved'
        },
        update: {
          name: item.name, email: item.email, status: text(row.status, 30) || 'active',
          department: text(row.department, 120) || null, designation: text(row.designation, 120) || null,
          doj: text(row.doj, 20) || null, contact: text(row.contact, 40) || null,
          salaryBasic: number(row.salaryBasic), salaryAllow: number(row.salaryAllow), salaryDeduct: number(row.salaryDeduct),
          experience: json(row.experience), education: json(row.education), documents: json(row.documents)
        }
      });
      if (row.leaveAnnual != null || row.leaveSick != null || row.leaveCasual != null) {
        await prisma.leaveBalance.upsert({
          where: { employeeId: item.id },
          create: { employeeId: item.id, annual: number(row.leaveAnnual), sick: number(row.leaveSick), casual: number(row.leaveCasual) },
          update: { annual: number(row.leaveAnnual), sick: number(row.leaveSick), casual: number(row.leaveCasual) }
        });
      }
      await prisma.employeeHistoryEvent.create({ data: {
        employeeId: item.id, eventType: 'MIGRATION', title: 'Employee record imported',
        effectiveDate: text(req.body.cutoffDate, 20) || new Date().toISOString().slice(0, 10),
        newValue: JSON.stringify({ batchId: batch.id, source: req.body.source || 'CSV upload' }), createdBy: req.user.id
      } });
      successCount += 1;
    } catch (error) {
      issues.push({ rowNumber: item.rowNumber, employeeRef: item.id, field: null, message: 'Record conflicts with an existing employee or could not be imported.' });
    }
  }
  for (const item of valid) {
    const managerId = text(item.row.managerId, 80);
    if (!managerId) continue;
    const manager = await prisma.employee.findUnique({ where: { id: managerId }, select: { id: true } });
    if (!manager || managerId === item.id) {
      issues.push({ rowNumber: item.rowNumber, employeeRef: item.id, field: 'managerId', message: 'Reporting manager is invalid or missing.' });
    } else {
      await prisma.employee.update({ where: { id: item.id }, data: { managerId } });
    }
  }
  if (issues.length) await prisma.migrationIssue.createMany({ data: issues.map((issue) => ({ ...issue, batchId: batch.id })) });
  const updated = await prisma.migrationBatch.update({ where: { id: batch.id }, data: {
    successCount, errorCount: issues.length, status: issues.length ? 'review' : 'completed', completedAt: new Date()
  } });
  await audit(req, 'IMPORT', 'MigrationBatch', batch.id, { received: rows.length, successCount, errors: issues.length });
  res.status(201).json({ batch: updated, issues });
});

router.patch('/migration/issues/:id', authorize('admin'), async (req, res) => {
  try {
    const issue = await prisma.migrationIssue.update({ where: { id: req.params.id }, data: { resolved: Boolean(req.body.resolved) } });
    res.json({ issue });
  } catch {
    res.status(404).json({ error: 'Migration issue not found.' });
  }
});

router.get('/insurance/plans', async (_req, res) => {
  const plans = await prisma.insurancePlan.findMany({ where: { status: 'active' }, orderBy: { effectiveFrom: 'desc' } });
  res.json({ plans });
});

router.post('/insurance/plans', authorize('admin'), async (req, res) => {
  const required = ['name', 'provider', 'policyNumber', 'planType', 'effectiveFrom', 'effectiveTo'];
  if (required.some((key) => !text(req.body[key], 160))) return res.status(400).json({ error: 'Name, provider, policy number, plan type, and coverage dates are required.' });
  try {
    const plan = await prisma.insurancePlan.create({ data: {
      name: text(req.body.name, 160), provider: text(req.body.provider, 160), tpa: text(req.body.tpa, 160) || null,
      broker: text(req.body.broker, 160) || null, policyNumber: text(req.body.policyNumber, 100),
      planType: text(req.body.planType, 60), coverageAmount: number(req.body.coverageAmount),
      premiumEmployer: number(req.body.premiumEmployer), premiumEmployee: number(req.body.premiumEmployee),
      effectiveFrom: text(req.body.effectiveFrom, 20), effectiveTo: text(req.body.effectiveTo, 20),
      eligibility: text(req.body.eligibility, 1000) || null, coverageSummary: text(req.body.coverageSummary, 2000) || null,
      networkUrl: text(req.body.networkUrl, 500) || null
    } });
    await audit(req, 'CREATE', 'InsurancePlan', plan.id, { name: plan.name, provider: plan.provider });
    res.status(201).json({ plan });
  } catch {
    res.status(409).json({ error: 'Policy number already exists.' });
  }
});

router.get('/insurance/enrollments', async (req, res) => {
  const enrollments = await prisma.insuranceEnrollment.findMany({
    where: req.user.role === 'admin' ? {} : { employeeId: req.user.id }, orderBy: { createdAt: 'desc' }
  });
  const dependents = await prisma.insuranceDependent.findMany({
    where: { enrollmentId: { in: enrollments.map((e) => e.id) } }, orderBy: { createdAt: 'asc' }
  });
  res.json({ enrollments: enrollments.map((e) => ({ ...e, dependents: dependents.filter((d) => d.enrollmentId === e.id) })) });
});

router.post('/insurance/enrollments', async (req, res) => {
  const employeeId = req.user.role === 'admin' && req.body.employeeId ? text(req.body.employeeId, 80) : req.user.id;
  const planId = text(req.body.planId, 100);
  const plan = await prisma.insurancePlan.findUnique({ where: { id: planId } });
  if (!plan || plan.status !== 'active') return res.status(404).json({ error: 'Active insurance plan not found.' });
  try {
    const enrollment = await prisma.insuranceEnrollment.create({ data: {
      employeeId, planId, status: req.user.role === 'admin' ? 'active' : 'pending',
      effectiveFrom: text(req.body.effectiveFrom, 20) || plan.effectiveFrom,
      effectiveTo: plan.effectiveTo, premiumEmployer: plan.premiumEmployer, premiumEmployee: plan.premiumEmployee,
      nominee: json(req.body.nominee), consentAt: new Date()
    } });
    await audit(req, 'ENROLL', 'InsuranceEnrollment', enrollment.id, { employeeId, planId });
    res.status(201).json({ enrollment });
  } catch {
    res.status(409).json({ error: 'Employee is already enrolled in this plan.' });
  }
});

router.patch('/insurance/enrollments/:id', authorize('admin'), async (req, res) => {
  const data = {};
  for (const key of ['status', 'memberNumber', 'effectiveFrom', 'effectiveTo', 'cardUrl']) {
    if (Object.hasOwn(req.body, key)) data[key] = text(req.body[key], 500) || null;
  }
  try {
    const enrollment = await prisma.insuranceEnrollment.update({ where: { id: req.params.id }, data });
    await audit(req, 'UPDATE', 'InsuranceEnrollment', enrollment.id, data);
    res.json({ enrollment });
  } catch {
    res.status(404).json({ error: 'Enrollment not found.' });
  }
});

router.post('/insurance/dependents', async (req, res) => {
  const enrollmentId = text(req.body.enrollmentId, 100);
  const enrollment = await prisma.insuranceEnrollment.findUnique({ where: { id: enrollmentId } });
  if (!enrollment || (req.user.role !== 'admin' && enrollment.employeeId !== req.user.id)) return res.status(403).json({ error: 'Enrollment not available.' });
  const name = text(req.body.name, 160);
  const relationship = text(req.body.relationship, 60);
  const dob = text(req.body.dob, 20);
  if (!name || !relationship || !dob) return res.status(400).json({ error: 'Name, relationship, and date of birth are required.' });
  const dependent = await prisma.insuranceDependent.create({ data: {
    enrollmentId, name, relationship, dob, documentRef: text(req.body.documentRef, 300) || null,
    status: req.user.role === 'admin' ? 'active' : 'pending'
  } });
  await audit(req, 'CREATE', 'InsuranceDependent', dependent.id, { enrollmentId, relationship });
  res.status(201).json({ dependent });
});

router.get('/insurance/claims', async (req, res) => {
  const claims = await prisma.insuranceClaim.findMany({
    where: req.user.role === 'admin' ? {} : { employeeId: req.user.id }, orderBy: { submittedAt: 'desc' }
  });
  res.json({ claims });
});

router.post('/insurance/claims', async (req, res) => {
  const enrollmentId = text(req.body.enrollmentId, 100);
  const enrollment = await prisma.insuranceEnrollment.findUnique({ where: { id: enrollmentId } });
  if (!enrollment || (req.user.role !== 'admin' && enrollment.employeeId !== req.user.id)) return res.status(403).json({ error: 'Enrollment not available.' });
  const claimType = text(req.body.claimType, 80);
  if (!claimType || number(req.body.amountClaimed) <= 0) return res.status(400).json({ error: 'Claim type and positive claimed amount are required.' });
  const claim = await prisma.insuranceClaim.create({ data: {
    enrollmentId, employeeId: enrollment.employeeId, claimType,
    treatmentDate: text(req.body.treatmentDate, 20) || null, hospital: text(req.body.hospital, 160) || null,
    amountClaimed: number(req.body.amountClaimed), notes: text(req.body.notes, 1000) || null
  } });
  await audit(req, 'CREATE', 'InsuranceClaim', claim.id, { amountClaimed: claim.amountClaimed });
  res.status(201).json({ claim });
});

router.patch('/insurance/claims/:id', authorize('admin'), async (req, res) => {
  const data = {};
  for (const key of ['status', 'claimNumber', 'providerRef', 'notes']) if (Object.hasOwn(req.body, key)) data[key] = text(req.body[key], 1000) || null;
  if (Object.hasOwn(req.body, 'amountApproved')) data.amountApproved = number(req.body.amountApproved);
  try {
    const claim = await prisma.insuranceClaim.update({ where: { id: req.params.id }, data });
    await audit(req, 'UPDATE', 'InsuranceClaim', claim.id, data);
    res.json({ claim });
  } catch {
    res.status(404).json({ error: 'Claim not found.' });
  }
});

module.exports = router;
