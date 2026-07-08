const express = require('express');
const bcrypt = require('bcryptjs');
const multer = require('multer');
const path = require('path');
const fs = require('fs');
const crypto = require('crypto');
const { authenticate, authorize } = require('../middleware/auth');
const prisma = require('../prisma/client');
const {
  parseJson, effectivePerms, isSubset, normalizePerms, isSupervisor,
  redactEmployee, redactEmployees, hasModule, makeStamp
} = require('../lib/perms');
const { audit, notify } = require('../lib/audit');
const { parsePagination, paginated } = require('../lib/pagination');
const { z, monthSchema, dateSchema } = require('../lib/validate');
const { revokeAllUserSessions } = require('../lib/sessions');
const { getSetting, setSetting, getAllSettings, isOnTime } = require('../lib/settings');
const router = express.Router();

const LEAVE_TYPE_KEY = { 'Annual Leave': 'annual', 'Sick Leave': 'sick', 'Casual Leave': 'casual' };
const safeName = (name) => (name || '').replace(/\s+/g, '');

async function loadActor(req) {
  return prisma.employee.findUnique({ where: { id: req.user.id } });
}

// ---- Real document storage (backend/uploads/<empId>/<docKey>.<ext>) ----
const UPLOAD_ROOT = path.join(__dirname, '..', 'uploads');
const DOC_KEY_RE = /^[a-zA-Z][a-zA-Z0-9_-]{1,40}$/;
const EMP_ID_RE = /^EMP\d{3,}$/;
const FILE_EXTS = new Set(['.pdf', '.png', '.jpg', '.jpeg', '.doc', '.docx']);
const FILE_MIMES = new Set([
  'application/pdf',
  'image/png',
  'image/jpeg',
  'application/msword',
  'application/vnd.openxmlformats-officedocument.wordprocessingml.document',
  'application/octet-stream' // some browsers send this for doc/pdf
]);

const upload = multer({
  storage: multer.diskStorage({
    destination: (req, file, cb) => {
      const dir = path.join(UPLOAD_ROOT, req.params.empId);
      fs.mkdirSync(dir, { recursive: true });
      cb(null, dir);
    },
    // Randomize filename to avoid collisions / path tricks; keep docKey prefix for lookup.
    filename: (req, file, cb) => {
      const ext = path.extname(file.originalname).toLowerCase();
      const rand = crypto.randomBytes(6).toString('hex');
      cb(null, `${req.params.docKey}.${rand}${ext}`);
    }
  }),
  limits: { fileSize: 5 * 1024 * 1024 },
  fileFilter: (req, file, cb) => {
    const ext = path.extname(file.originalname).toLowerCase();
    const ok = FILE_EXTS.has(ext) && FILE_MIMES.has((file.mimetype || '').toLowerCase());
    cb(ok ? null : new Error('Invalid file type'), ok);
  }
});

// Files are private: the employee themselves (uploads only while onboarding is
// editable) or an admin/supervisor. Params are strictly validated — they become
// filesystem paths.
function fileAccess(forUpload) {
  return async (req, res, next) => {
    try {
      const { empId, docKey } = req.params;
      if (!EMP_ID_RE.test(empId) || !DOC_KEY_RE.test(docKey)) return res.status(400).json({ error: 'Invalid file reference.' });
      const actor = await loadActor(req);
      if (!actor) return res.status(401).json({ error: 'Account no longer exists.' });
      if (isSupervisor(actor)) return next();
      if (actor.id !== empId) return res.status(403).json({ error: 'Not allowed.' });
      if (forUpload && !ONBOARDING_EDITABLE.has(actor.onboardingState)) {
        return res.status(403).json({ error: 'Your onboarding is locked.' });
      }
      next();
    } catch (e) { res.status(500).json({ error: 'File access check failed' }); }
  };
}

async function notifySupervisors(title, body, kind) {
  const emps = await prisma.employee.findMany({ where: { status: 'active' } });
  for (const e of emps) if (isSupervisor(e)) await notify(e.id, title, body, kind);
}

// Onboarding is only editable by the employee in these states.
const ONBOARDING_EDITABLE = new Set(['draft', 'returned']);
async function requiredDocKeys() {
  const reqs = await prisma.docRequirement.findMany({ where: { required: true } });
  return reqs.map(r => r.key);
}

// Walk `level` steps up the manager chain (level 1 = direct manager).
async function approverAtLevel(employeeId, level) {
  let cur = await prisma.employee.findUnique({ where: { id: employeeId }, select: { id: true, managerId: true } });
  for (let i = 0; i < level; i++) {
    if (!cur || !cur.managerId) return null;
    cur = await prisma.employee.findUnique({ where: { id: cur.managerId }, select: { id: true, managerId: true } });
  }
  return cur ? cur.id : null;
}

// Resolve the approver `level` steps up, using a prebuilt id→managerId map
// (no DB round-trips — used to avoid N+1 queries when enriching many leaves).
function approverFromMap(mgrMap, employeeId, level) {
  let cur = employeeId;
  for (let i = 0; i < level; i++) {
    cur = mgrMap.get(cur);
    if (!cur) return null;
  }
  return cur;
}

// How many managers exist above an employee, up to `max`.
async function chainDepth(employeeId, max) {
  let cur = await prisma.employee.findUnique({ where: { id: employeeId }, select: { managerId: true } });
  let d = 0;
  while (cur && cur.managerId && d < max) {
    d++;
    cur = await prisma.employee.findUnique({ where: { id: cur.managerId }, select: { managerId: true } });
  }
  return d;
}

// Allocate the next sequential EMPxxx id.
async function nextEmployeeId() {
  const emps = await prisma.employee.findMany({ select: { id: true } });
  let max = 0;
  for (const e of emps) {
    const m = /^EMP(\d+)$/.exec(e.id);
    if (m) max = Math.max(max, parseInt(m[1], 10));
  }
  return `EMP${String(max + 1).padStart(3, '0')}`;
}

// Mirror an employee's documents into the simulated Google Drive "Employee Folder".
async function syncEmployeeDrive(emp) {
  const vault = `${emp.id}_${safeName(emp.name)}_Vault`;
  const folder = await prisma.simulatedGDrive.findFirst({ where: { name: vault } });
  if (!folder) {
    await prisma.simulatedGDrive.create({ data: { name: vault, type: 'folder', parent: 'JJFO_HRMS_Vault', content: null } });
  }
  const docs = parseJson(emp.documents);
  for (const [key, filename] of Object.entries(docs)) {
    if (!filename) continue;
    const existing = await prisma.simulatedGDrive.findFirst({ where: { name: String(filename), parent: vault } });
    if (!existing) {
      await prisma.simulatedGDrive.create({ data: { name: String(filename), type: 'file', parent: vault, content: `${key} (uploaded)` } });
    }
  }
}

// Coerce numeric employee fields for ONLY the keys provided (so partial
// updates don't accidentally null out untouched columns).
function coerceEmployeeNumbers(data) {
  for (const k of ['salaryBasic', 'salaryAllow', 'salaryDeduct']) {
    if (k in data) {
      if (data[k] === '' || data[k] === null || data[k] === undefined) delete data[k];
      else data[k] = Number(data[k]);
    }
  }
  if ('age' in data) data.age = (data.age === '' || data.age === null || data.age === undefined) ? null : Number(data.age);
  for (const k of ['experience', 'documents', 'preferences', 'permissions']) {
    if (data[k] && typeof data[k] !== 'string') data[k] = JSON.stringify(data[k]);
  }
  return data;
}

// Dashboard KPI Stats
router.get('/dashboard/stats', authenticate, async (req, res) => {
  try {
    // Run the independent counts concurrently.
    const [totalEmployees, pendingLeaves, openTickets, activeAssets] = await Promise.all([
      prisma.employee.count({ where: { status: 'active' } }),
      prisma.leave.count({ where: { status: 'Pending' } }),
      prisma.helpdeskTicket.count({ where: { status: 'Open' } }),
      prisma.asset.count({ where: { status: 'Confirmed' } })
    ]);
    res.json({ totalEmployees, pendingLeaves, openTickets, activeAssets });
  } catch (error) {
    res.status(500).json({ error: 'Failed to fetch stats' });
  }
});

// Employees (Directory) — password omitted; salary redacted; optional pagination.
router.get('/employees', authenticate, async (req, res) => {
  try {
    const actor = await loadActor(req);
    const where = req.query.includeInactive === '1' ? {} : { status: { not: 'inactive' } };
    if (req.query.q) {
      const q = String(req.query.q);
      where.OR = [
        { name: { contains: q } },
        { email: { contains: q } },
        { department: { contains: q } },
        { designation: { contains: q } },
        { id: { contains: q } }
      ];
    }
    const wantPage = req.query.page != null || req.query.limit != null;
    if (wantPage) {
      const { page, limit, skip } = parsePagination(req.query);
      const [total, employees] = await Promise.all([
        prisma.employee.count({ where }),
        prisma.employee.findMany({
          where, omit: { password: true }, skip, take: limit, orderBy: { name: 'asc' }
        })
      ]);
      return res.json(paginated(redactEmployees(employees, actor), total, page, limit));
    }
    const employees = await prisma.employee.findMany({
      where, omit: { password: true }, orderBy: { name: 'asc' }
    });
    res.json(redactEmployees(employees, actor));
  } catch (error) {
    res.status(500).json({ error: 'Failed to fetch employees' });
  }
});

// Deactivate (soft delete): blocks login, hides from lists, preserves history.
router.put('/employees/:id/deactivate', authenticate, async (req, res) => {
  try {
    const actor = await loadActor(req);
    if (!isSupervisor(actor)) return res.status(403).json({ error: 'Not allowed.' });
    if (req.params.id === req.user.id) return res.status(400).json({ error: 'You cannot deactivate your own account.' });
    const target = await prisma.employee.findUnique({ where: { id: req.params.id }, select: { role: true, name: true } });
    if (!target) return res.status(404).json({ error: 'Employee not found' });
    if (target.role === 'admin' && actor.role !== 'admin') return res.status(403).json({ error: 'Cannot deactivate an admin.' });
    const emp = await prisma.employee.update({ where: { id: req.params.id }, data: { status: 'inactive' }, omit: { password: true } });
    await revokeAllUserSessions(emp.id);
    await audit(actor, 'deactivate', 'employee', emp.id, `Deactivated ${target.name}`);
    res.json(emp);
  } catch (error) {
    res.status(500).json({ error: 'Failed to deactivate employee' });
  }
});

// Reassign reporting manager (admin or manageHierarchy cap) with cycle prevention.
router.put('/employees/:id/manager', authenticate, async (req, res) => {
  try {
    const actor = await loadActor(req);
    const allowed = actor?.role === 'admin' || effectivePerms(actor).caps.manageHierarchy;
    if (!allowed) return res.status(403).json({ error: 'Not allowed.' });
    const id = req.params.id;
    const managerId = req.body.managerId || null;
    if (managerId === id) return res.status(400).json({ error: 'An employee cannot report to themselves.' });
    if (managerId) {
      // Walk up from the proposed manager; reaching the employee means a cycle.
      let cur = managerId, hops = 0;
      while (cur && hops < 50) {
        if (cur === id) return res.status(400).json({ error: 'This change would create a reporting cycle.' });
        const up = await prisma.employee.findUnique({ where: { id: cur }, select: { managerId: true } });
        cur = up?.managerId; hops++;
      }
    }
    const emp = await prisma.employee.update({ where: { id }, data: { managerId }, omit: { password: true } });
    await audit(actor, 'manager-change', 'employee', id, `Manager set to ${managerId || 'none'}`);
    res.json(emp);
  } catch (error) {
    res.status(500).json({ error: 'Failed to reassign manager' });
  }
});

router.post('/employees', authenticate, async (req, res) => {
  try {
    const actor = await loadActor(req);
    const actorPerms = effectivePerms(actor);
    const isAdmin = actor.role === 'admin';
    // Anyone with the createUsers capability may add a person below them.
    if (!isAdmin && !actorPerms.caps.createUsers) {
      return res.status(403).json({ error: 'You do not have permission to add users.' });
    }
    const data = coerceEmployeeNumbers({ ...req.body });
    // Delegated grants must be a SUBSET of what the creator holds.
    const requested = normalizePerms(req.body.permissions);
    if (!isAdmin && !isSubset(requested, actorPerms)) {
      return res.status(403).json({ error: 'You can only grant permissions you hold yourself.' });
    }
    data.permissions = JSON.stringify(requested);
    // Non-admins create reports under themselves and cannot mint admins.
    if (!isAdmin) {
      data.role = data.role === 'admin' ? 'employee' : (data.role || 'employee');
      data.managerId = data.managerId || actor.id;
    }
    data.id = data.id || await nextEmployeeId();
    // New hires get a default password (password123) until they change it.
    data.password = await bcrypt.hash(data.password || 'password123', 12);
    const employee = await prisma.$transaction(async (tx) => {
      const emp = await tx.employee.create({ data, omit: { password: true } });
      await tx.leaveBalance.upsert({
        where: { employeeId: emp.id }, update: {},
        create: { employeeId: emp.id, annual: 15, sick: 7, casual: 7 }
      });
      return emp;
    });
    await syncEmployeeDrive(employee);
    await audit(actor, 'create', 'employee', employee.id, `Created ${employee.name} (${employee.email})`);
    res.json(redactEmployee(employee, actor));
  } catch (error) {
    console.error(error);
    res.status(500).json({ error: 'Failed to create employee' });
  }
});

// Hard-delete is test/admin only — prefer deactivate. Requires ALLOW_HARD_DELETE=1
// or header X-Confirm-Hard-Delete: true.
router.delete('/employees/:id', authenticate, authorize(['admin']), async (req, res) => {
  try {
    const allowed = process.env.ALLOW_HARD_DELETE === '1' ||
      req.get('X-Confirm-Hard-Delete') === 'true';
    if (!allowed) {
      return res.status(400).json({
        error: 'Hard delete disabled. Use deactivate, or send X-Confirm-Hard-Delete: true (test only).'
      });
    }
    const id = req.params.id;
    if (id === req.user.id) return res.status(400).json({ error: 'You cannot remove your own account.' });
    await revokeAllUserSessions(id);
    // Cascades via Prisma schema relations where defined; explicit cleanup for orphans.
    await prisma.$transaction([
      prisma.session.deleteMany({ where: { userId: id } }),
      prisma.ticketReply.deleteMany({ where: { OR: [{ senderId: id }, { ticket: { employeeId: id } }] } }),
      prisma.helpdeskTicket.deleteMany({ where: { employeeId: id } }),
      prisma.leave.deleteMany({ where: { employeeId: id } }),
      prisma.attendance.deleteMany({ where: { employeeId: id } }),
      prisma.attendanceRegularization.deleteMany({ where: { employeeId: id } }),
      prisma.asset.updateMany({ where: { employeeId: id }, data: { employeeId: null, status: 'In Stock' } }),
      prisma.payroll.deleteMany({ where: { employeeId: id } }),
      prisma.taxDeclaration.deleteMany({ where: { employeeId: id } }),
      prisma.salaryAdvance.deleteMany({ where: { employeeId: id } }),
      prisma.goal.deleteMany({ where: { employeeId: id } }),
      prisma.leaveBalance.deleteMany({ where: { employeeId: id } }),
      prisma.notification.deleteMany({ where: { userId: id } }),
      prisma.employee.delete({ where: { id } })
    ]);
    await audit(req.user, 'delete', 'employee', id, 'Hard delete with cascade');
    res.json({ message: 'Employee removed' });
  } catch (error) {
    console.error(error);
    res.status(500).json({ error: 'Failed to remove employee' });
  }
});

// Self-service personal details (contact info only — core & onboarding data are managed elsewhere).
router.put('/me', authenticate, async (req, res) => {
  try {
    const data = {};
    for (const k of ['contact', 'age', 'bloodGroup']) if (req.body[k] !== undefined) data[k] = req.body[k];
    if (data.age !== undefined) data.age = data.age === '' ? null : Number(data.age);
    const emp = await prisma.employee.update({ where: { id: req.user.id }, data, omit: { password: true } });
    res.json(emp);
  } catch (error) {
    res.status(500).json({ error: 'Failed to update profile' });
  }
});

// ===================== Onboarding submission & approval workflow =====================

// Mandatory-document checklist (admin-configurable).
router.get('/onboarding/doc-config', authenticate, async (req, res) => {
  try { res.json(await prisma.docRequirement.findMany({ orderBy: { order: 'asc' } })); }
  catch (e) { res.status(500).json({ error: 'Failed to load doc config' }); }
});
router.put('/onboarding/doc-config/:key', authenticate, authorize(['admin']), async (req, res) => {
  try {
    const r = await prisma.docRequirement.update({ where: { key: req.params.key }, data: { required: !!req.body.required } });
    res.json(r);
  } catch (e) { res.status(500).json({ error: 'Failed to update doc config' }); }
});

// Employee edits OWN onboarding data (education/experience/documents) — only while unlocked.
router.put('/me/onboarding', authenticate, async (req, res) => {
  try {
    const me = await prisma.employee.findUnique({ where: { id: req.user.id } });
    if (!ONBOARDING_EDITABLE.has(me.onboardingState)) {
      return res.status(403).json({ error: 'Your onboarding is locked. An admin must reopen it before you can edit.' });
    }
    const data = {};
    for (const k of ['experience', 'education', 'documents']) {
      if (req.body[k] !== undefined) data[k] = typeof req.body[k] === 'string' ? req.body[k] : JSON.stringify(req.body[k]);
    }
    const emp = await prisma.employee.update({ where: { id: req.user.id }, data, omit: { password: true } });
    await syncEmployeeDrive(emp);
    res.json(emp);
  } catch (e) { res.status(500).json({ error: 'Failed to save onboarding' }); }
});

// Employee submits for approval — all required docs must be present; then it locks.
router.post('/me/onboarding/submit', authenticate, async (req, res) => {
  try {
    const me = await prisma.employee.findUnique({ where: { id: req.user.id } });
    if (!ONBOARDING_EDITABLE.has(me.onboardingState)) return res.status(403).json({ error: 'Already submitted or approved.' });
    const docs = parseJson(me.documents);
    const missing = (await requiredDocKeys()).filter(k => !docs[k]);
    if (missing.length) return res.status(400).json({ error: 'Missing required documents', missing });
    const emp = await prisma.employee.update({ where: { id: req.user.id }, data: { onboardingState: 'submitted', onboardingNote: null }, omit: { password: true } });
    await audit(req.user, 'submit', 'onboarding', emp.id);
    await notifySupervisors('Onboarding submitted', `${emp.name} submitted their onboarding package for review.`, 'onboarding');
    res.json(emp);
  } catch (e) { res.status(500).json({ error: 'Failed to submit onboarding' }); }
});

// Admin/supervisor: edit any employee's onboarding data directly.
router.put('/employees/:id/onboarding', authenticate, async (req, res) => {
  try {
    const actor = await loadActor(req);
    if (!isSupervisor(actor)) return res.status(403).json({ error: 'Not allowed.' });
    const data = {};
    for (const k of ['experience', 'education', 'documents']) {
      if (req.body[k] !== undefined) data[k] = typeof req.body[k] === 'string' ? req.body[k] : JSON.stringify(req.body[k]);
    }
    const emp = await prisma.employee.update({ where: { id: req.params.id }, data, omit: { password: true } });
    await syncEmployeeDrive(emp);
    res.json(emp);
  } catch (e) { res.status(500).json({ error: 'Failed to update onboarding' }); }
});

// Admin/supervisor onboarding transitions: push (to employee), approve (lock), return (reopen).
async function onboardingTransition(req, res, state, defaultNote) {
  try {
    const actor = await loadActor(req);
    if (!isSupervisor(actor)) return res.status(403).json({ error: 'Not allowed.' });
    const note = state === 'approved' ? null : (req.body.note || defaultNote);
    const emp = await prisma.employee.update({ where: { id: req.params.id }, data: { onboardingState: state, onboardingNote: note }, omit: { password: true } });
    await audit(actor, state === 'approved' ? 'approve' : state === 'returned' ? 'return' : 'push', 'onboarding', emp.id, note || undefined);
    const msg = state === 'approved' ? 'Your onboarding has been approved and locked.'
      : state === 'returned' ? `Your onboarding was returned: ${note}`
      : 'Please complete your onboarding details and upload the required documents.';
    await notify(emp.id, `Onboarding ${state}`, msg, 'onboarding');
    res.json(emp);
  } catch (e) { res.status(500).json({ error: 'Failed to update onboarding state' }); }
}
router.post('/employees/:id/onboarding/push', authenticate, (req, res) => onboardingTransition(req, res, 'draft', 'Please complete your onboarding details and upload the required documents.'));
router.post('/employees/:id/onboarding/approve', authenticate, (req, res) => onboardingTransition(req, res, 'approved', null));
router.post('/employees/:id/onboarding/return', authenticate, (req, res) => onboardingTransition(req, res, 'returned', 'Please re-check and re-upload your documents.'));

// Leaves — own + team trail for managers / all for admin
router.get('/leaves', authenticate, async (req, res) => {
  try {
    const actor = await loadActor(req);
    const isAdmin = actor?.role === 'admin';
    const canMgr = isAdmin || effectivePerms(actor).caps.approveLeaves;
    const all = await prisma.employee.findMany({ select: { id: true, managerId: true, name: true } });
    const mgrMap = new Map(all.map((e) => [e.id, e.managerId]));
    // Direct + nested reports of this manager
    const reportIds = new Set();
    if (canMgr && !isAdmin) {
      let frontier = all.filter((e) => e.managerId === actor.id).map((e) => e.id);
      while (frontier.length) {
        for (const id of frontier) reportIds.add(id);
        frontier = all.filter((e) => e.managerId && frontier.includes(e.managerId)).map((e) => e.id);
      }
    }
    const leaves = await prisma.leave.findMany({
      include: { employee: { select: { name: true, managerId: true } } },
      orderBy: { createdAt: 'desc' }
    });
    const filtered = leaves.filter((l) => {
      if (isAdmin) return true;
      if (l.employeeId === actor.id) return true;
      if (canMgr && reportIds.has(l.employeeId)) return true;
      if (canMgr && l.status === 'Pending' && approverFromMap(mgrMap, l.employeeId, l.approvedLevels + 1) === actor.id) return true;
      return false;
    });
    const enriched = filtered.map((l) => ({
      ...l,
      currentApproverId: l.status === 'Pending' ? approverFromMap(mgrMap, l.employeeId, l.approvedLevels + 1) : null
    }));
    res.json(enriched);
  } catch (error) {
    res.status(500).json({ error: 'Failed to fetch leaves' });
  }
});

router.post('/leaves', authenticate, async (req, res) => {
  try {
    const { leaveType, startDate, endDate, reason } = req.body;
    let durationDays = Number(req.body.durationDays) || 0;
    if (startDate && endDate) {
      // Server-authoritative duration: span minus declared holidays in range.
      const span = Math.max(0, Math.round((new Date(endDate) - new Date(startDate)) / 86400000) + 1);
      const holidays = await prisma.holiday.count({ where: { date: { gte: startDate, lte: endDate } } });
      durationDays = Math.max(0, span - holidays);
    }
    const isAdmin = req.user.role === 'admin';
    const employeeId = (isAdmin && req.body.employeeId) ? req.body.employeeId : req.user.id;

    // Deduct immediately on apply: Pending + Approved consume balance (reject/cancel releases).
    const typeKey = LEAVE_TYPE_KEY[leaveType];
    if (!isAdmin && typeKey) {
      const bal = await prisma.leaveBalance.findUnique({ where: { employeeId } });
      const reserved = await prisma.leave.findMany({
        where: { employeeId, leaveType, status: { in: ['Pending', 'Approved'] } },
        select: { durationDays: true }
      });
      const used = reserved.reduce((s, l) => s + l.durationDays, 0);
      const available = Math.max(0, (bal?.[typeKey] || 0) - used);
      if (durationDays > available) {
        return res.status(400).json({ error: `Insufficient ${leaveType} balance — ${available} day(s) available (pending applications already reserved).` });
      }
    }

    // Approval policy: >5 days needs 2 levels up the chain, otherwise 1.
    // Clamp to how many managers actually exist (can't need more approvals than approvers).
    const wanted = durationDays > 5 ? 2 : 1;
    const requiredLevels = Math.min(wanted, await chainDepth(employeeId, wanted));
    let approvedLevels = 0;
    let status = 'Pending';
    if (requiredLevels === 0) { status = 'Approved'; }                       // top of org self-approves
    if (isAdmin && req.body.status === 'Approved') { approvedLevels = requiredLevels; status = 'Approved'; }

    const leave = await prisma.leave.create({
      data: { employeeId, leaveType, startDate, endDate, reason, durationDays, status, requiredLevels, approvedLevels }
    });
    await audit(req.user, 'create', 'leave', leave.id, `${leaveType} ${startDate}→${endDate} (${durationDays}d) for ${employeeId}`);
    if (leave.status === 'Pending') {
      const approver = await approverAtLevel(employeeId, 1);
      await notify(approver, 'Leave awaiting your approval', `${leaveType} ${startDate} → ${endDate} (${durationDays} day(s)) needs your review.`, 'leave');
    }
    res.json(leave);
  } catch (error) {
    res.status(500).json({ error: 'Failed to create leave request' });
  }
});

// Cancel a leave: the owner while it is Pending; an admin anytime.
router.put('/leaves/:id/cancel', authenticate, async (req, res) => {
  try {
    const leave = await prisma.leave.findUnique({ where: { id: req.params.id } });
    if (!leave) return res.status(404).json({ error: 'Leave not found' });
    const isAdmin = req.user.role === 'admin';
    if (!isAdmin && !(leave.employeeId === req.user.id && leave.status === 'Pending')) {
      return res.status(403).json({ error: 'You can only cancel your own pending leaves.' });
    }
    if (leave.status === 'Cancelled') return res.status(400).json({ error: 'Already cancelled.' });
    const updated = await prisma.leave.update({ where: { id: leave.id }, data: { status: 'Cancelled' } });
    await audit(req.user, 'cancel', 'leave', leave.id, `Cancelled (${leave.leaveType}, ${leave.durationDays}d)`);
    if (isAdmin && leave.employeeId !== req.user.id) {
      await notify(leave.employeeId, 'Leave cancelled by HR', `Your ${leave.leaveType} (${leave.startDate} → ${leave.endDate}) was cancelled.`, 'leave');
    }
    res.json(updated);
  } catch (error) {
    res.status(500).json({ error: 'Failed to cancel leave' });
  }
});

// Step-wise approval up the manager chain (each approver needs the approveLeaves cap).
router.put('/leaves/:id/approve', authenticate, async (req, res) => {
  try {
    const actor = await loadActor(req);
    const isAdmin = actor.role === 'admin';
    const perms = effectivePerms(actor);
    const leave = await prisma.leave.findUnique({ where: { id: req.params.id } });
    if (!leave) return res.status(404).json({ error: 'Leave not found' });
    if (leave.status !== 'Pending') return res.status(400).json({ error: 'Leave is not pending' });
    const nextApprover = await approverAtLevel(leave.employeeId, leave.approvedLevels + 1);
    if (!isAdmin && !(actor.id === nextApprover && perms.caps.approveLeaves)) {
      return res.status(403).json({ error: 'You are not the required approver for this step.' });
    }
    const approvedLevels = isAdmin ? leave.requiredLevels : leave.approvedLevels + 1;
    const status = approvedLevels >= leave.requiredLevels ? 'Approved' : 'Pending';
    const updated = await prisma.leave.update({ where: { id: leave.id }, data: { approvedLevels, status } });
    await audit(actor, 'approve', 'leave', leave.id, `Level ${approvedLevels}/${leave.requiredLevels} → ${status}`);
    if (status === 'Approved') {
      await notify(leave.employeeId, 'Leave approved', `Your ${leave.leaveType} (${leave.startDate} → ${leave.endDate}) is fully approved.`, 'leave');
    } else {
      const nxt = await approverAtLevel(leave.employeeId, approvedLevels + 1);
      await notify(nxt, 'Leave awaiting your approval', `A ${leave.leaveType} request (${leave.durationDays} day(s)) needs your level-${approvedLevels + 1} sign-off.`, 'leave');
    }
    res.json(updated);
  } catch (error) {
    res.status(500).json({ error: 'Failed to approve leave' });
  }
});

router.put('/leaves/:id/reject', authenticate, async (req, res) => {
  try {
    const actor = await loadActor(req);
    const isAdmin = actor.role === 'admin';
    const perms = effectivePerms(actor);
    const leave = await prisma.leave.findUnique({ where: { id: req.params.id } });
    if (!leave) return res.status(404).json({ error: 'Leave not found' });
    if (leave.status !== 'Pending') return res.status(400).json({ error: 'Leave is not pending' });
    const nextApprover = await approverAtLevel(leave.employeeId, leave.approvedLevels + 1);
    if (!isAdmin && !(actor.id === nextApprover && perms.caps.approveLeaves)) {
      return res.status(403).json({ error: 'You are not the required approver for this step.' });
    }
    const updated = await prisma.leave.update({ where: { id: leave.id }, data: { status: 'Rejected' } });
    await audit(actor, 'reject', 'leave', leave.id, `${leave.leaveType} ${leave.durationDays}d rejected`);
    await notify(leave.employeeId, 'Leave rejected', `Your ${leave.leaveType} (${leave.startDate} → ${leave.endDate}) was rejected.`, 'leave');
    res.json(updated);
  } catch (error) {
    res.status(500).json({ error: 'Failed to reject leave' });
  }
});

router.delete('/leaves/:id', authenticate, authorize(['admin']), async (req, res) => {
  try {
    await prisma.leave.delete({ where: { id: req.params.id } });
    res.json({ message: 'Leave removed' });
  } catch (error) {
    res.status(500).json({ error: 'Failed to remove leave' });
  }
});

// Leave balances — used = Pending + Approved (immediate reservation on apply).
router.get('/leave-balances', authenticate, async (req, res) => {
  try {
    const actor = await loadActor(req);
    const isAdmin = actor?.role === 'admin';
    const canMgr = isAdmin || effectivePerms(actor).caps.approveLeaves;
    let employees;
    if (isAdmin) {
      employees = await prisma.employee.findMany({ where: { status: 'active' }, select: { id: true, name: true } });
    } else if (canMgr) {
      const all = await prisma.employee.findMany({ where: { status: 'active' }, select: { id: true, name: true, managerId: true } });
      employees = all.filter((e) => e.id === actor.id || e.managerId === actor.id);
    } else {
      employees = await prisma.employee.findMany({ where: { id: actor.id }, select: { id: true, name: true } });
    }
    const balances = await prisma.leaveBalance.findMany();
    const activeLeaves = await prisma.leave.findMany({
      where: { status: { in: ['Pending', 'Approved'] } },
      select: { employeeId: true, leaveType: true, durationDays: true, status: true }
    });
    const result = employees.map((e) => {
      const bal = balances.find((b) => b.employeeId === e.id) || { annual: 0, sick: 0, casual: 0 };
      const used = { annual: 0, sick: 0, casual: 0 };
      const pending = { annual: 0, sick: 0, casual: 0 };
      activeLeaves.filter((l) => l.employeeId === e.id).forEach((l) => {
        const k = LEAVE_TYPE_KEY[l.leaveType];
        if (!k) return;
        used[k] += l.durationDays;
        if (l.status === 'Pending') pending[k] += l.durationDays;
      });
      const mk = (t) => ({
        total: bal[t],
        used: used[t],
        pending: pending[t],
        available: Math.max(0, bal[t] - used[t])
      });
      return { employeeId: e.id, name: e.name, annual: mk('annual'), sick: mk('sick'), casual: mk('casual') };
    });
    res.json(result);
  } catch (error) {
    res.status(500).json({ error: 'Failed to fetch leave balances' });
  }
});

// Adjust one employee's leave allotment (admin only).
router.put('/leave-balances/:id', authenticate, authorize(['admin']), async (req, res) => {
  try {
    const data = {};
    for (const k of ['annual', 'sick', 'casual']) if (req.body[k] !== undefined) data[k] = Number(req.body[k]);
    const bal = await prisma.leaveBalance.upsert({
      where: { employeeId: req.params.id },
      update: data,
      create: { employeeId: req.params.id, annual: data.annual || 0, sick: data.sick || 0, casual: data.casual || 0 }
    });
    await audit(req.user, 'balance-adjust', 'leave', req.params.id, JSON.stringify(data));
    res.json(bal);
  } catch (error) {
    res.status(500).json({ error: 'Failed to update balance' });
  }
});

// Year-start / bulk allotment: all active users, or a selected set (admin only).
router.post('/leave-balances/bulk', authenticate, authorize(['admin']), async (req, res) => {
  try {
    const annual = Number(req.body.annual);
    const sick = Number(req.body.sick);
    const casual = Number(req.body.casual);
    if ([annual, sick, casual].some((n) => Number.isNaN(n) || n < 0)) {
      return res.status(400).json({ error: 'annual, sick, casual must be non-negative numbers.' });
    }
    let ids = Array.isArray(req.body.employeeIds) ? req.body.employeeIds.filter(Boolean) : [];
    if (!ids.length || req.body.all === true) {
      const active = await prisma.employee.findMany({ where: { status: 'active' }, select: { id: true } });
      ids = active.map((e) => e.id);
    }
    const results = [];
    for (const employeeId of ids) {
      const bal = await prisma.leaveBalance.upsert({
        where: { employeeId },
        update: { annual, sick, casual },
        create: { employeeId, annual, sick, casual }
      });
      results.push(bal);
      await notify(employeeId, 'Leave allotment updated',
        `Your leave balances were set: Annual ${annual}, Sick ${sick}, Casual ${casual}.`, 'leave');
    }
    await audit(req.user, 'bulk-allotment', 'leave', null, `${ids.length} employees → A${annual}/S${sick}/C${casual}`);
    res.json({ updated: results.length, balances: results });
  } catch (error) {
    console.error(error);
    res.status(500).json({ error: 'Failed bulk leave allotment' });
  }
});

router.put('/leaves/:id/status', authenticate, authorize(['admin']), async (req, res) => {
  try {
    const { status } = req.body;
    const leave = await prisma.leave.update({
      where: { id: req.params.id },
      data: { status }
    });
    res.json(leave);
  } catch (error) {
    res.status(500).json({ error: 'Failed to update leave' });
  }
});

// ===================== Attendance =====================
router.post('/attendance/clock-in', authenticate, async (req, res) => {
  try {
    const today = new Date().toISOString().split('T')[0];
    const existing = await prisma.attendance.findFirst({ where: { employeeId: req.user.id, date: today } });
    if (existing) return res.status(400).json({ error: 'Already clocked in today.' });
    const now = new Date();
    const hhmm = now.toTimeString().slice(0, 5);
    const threshold = await getSetting('lateThreshold');
    const status = isOnTime(hhmm, threshold || '09:15') ? 'On Time' : 'Late';
    const log = await prisma.attendance.create({ data: { employeeId: req.user.id, date: today, checkIn: hhmm, status } });
    res.json(log);
  } catch (e) { res.status(500).json({ error: 'Failed to clock in' }); }
});

router.post('/attendance/clock-out', authenticate, async (req, res) => {
  try {
    const today = new Date().toISOString().split('T')[0];
    const open = await prisma.attendance.findFirst({ where: { employeeId: req.user.id, date: today, checkOut: null } });
    if (!open) return res.status(400).json({ error: 'No open clock-in for today.' });
    const log = await prisma.attendance.update({ where: { id: open.id }, data: { checkOut: new Date().toTimeString().slice(0, 5) } });
    res.json(log);
  } catch (e) { res.status(500).json({ error: 'Failed to clock out' }); }
});

router.get('/attendance', authenticate, async (req, res) => {
  try {
    const isAdmin = req.user.role === 'admin';
    const where = {};
    if (!isAdmin) where.employeeId = req.user.id;
    else if (req.query.employeeId) where.employeeId = req.query.employeeId;
    if (req.query.from || req.query.to) {
      where.date = {};
      if (req.query.from) where.date.gte = String(req.query.from);
      if (req.query.to) where.date.lte = String(req.query.to);
    }
    const logs = await prisma.attendance.findMany({ where, include: { employee: { select: { name: true } } }, orderBy: { date: 'desc' }, take: 200 });
    res.json(logs);
  } catch (e) { res.status(500).json({ error: 'Failed to fetch attendance' }); }
});

router.post('/attendance/regularize', authenticate, async (req, res) => {
  try {
    const { date, actualCheckIn, actualCheckOut, reason } = req.body;
    if (!date || !actualCheckIn || !actualCheckOut || !reason) return res.status(400).json({ error: 'date, timings and reason are required.' });
    const reg = await prisma.attendanceRegularization.create({
      data: { employeeId: req.user.id, date, actualCheckIn, actualCheckOut, reason }
    });
    const mgr = await approverAtLevel(req.user.id, 1);
    await notify(mgr, 'Attendance regularization requested', `A correction for ${date} awaits your review.`, 'leave');
    res.json(reg);
  } catch (e) { res.status(500).json({ error: 'Failed to request regularization' }); }
});

router.get('/regularizations', authenticate, async (req, res) => {
  try {
    const actor = await loadActor(req);
    const regs = await prisma.attendanceRegularization.findMany({ include: { employee: { select: { name: true, managerId: true } } } });
    const isAdmin = actor?.role === 'admin';
    const canApprove = effectivePerms(actor).caps.approveLeaves;
    const visible = regs.filter(r =>
      isAdmin || r.employeeId === actor.id || (canApprove && r.employee?.managerId === actor.id)
    );
    res.json(visible);
  } catch (e) { res.status(500).json({ error: 'Failed to fetch regularizations' }); }
});

async function regDecision(req, res, approve) {
  try {
    const actor = await loadActor(req);
    const reg = await prisma.attendanceRegularization.findUnique({ where: { id: req.params.id }, include: { employee: { select: { managerId: true } } } });
    if (!reg) return res.status(404).json({ error: 'Not found' });
    if (reg.status !== 'Pending') return res.status(400).json({ error: 'Already decided.' });
    const isAdmin = actor?.role === 'admin';
    const isDirectMgr = reg.employee?.managerId === actor?.id && effectivePerms(actor).caps.approveLeaves;
    if (!isAdmin && !isDirectMgr) return res.status(403).json({ error: 'Not the required approver.' });
    const updated = await prisma.attendanceRegularization.update({ where: { id: reg.id }, data: { status: approve ? 'Approved' : 'Rejected' } });
    if (approve) {
      const existing = await prisma.attendance.findFirst({ where: { employeeId: reg.employeeId, date: reg.date } });
      const data = { checkIn: reg.actualCheckIn, checkOut: reg.actualCheckOut, status: 'Regularized' };
      if (existing) await prisma.attendance.update({ where: { id: existing.id }, data });
      else await prisma.attendance.create({ data: { employeeId: reg.employeeId, date: reg.date, ...data } });
    }
    await audit(actor, approve ? 'approve' : 'reject', 'regularization', reg.id, `${reg.date} for ${reg.employeeId}`);
    await notify(reg.employeeId, `Regularization ${approve ? 'approved' : 'rejected'}`, `Your attendance correction for ${reg.date} was ${approve ? 'approved' : 'rejected'}.`, 'leave');
    res.json(updated);
  } catch (e) { res.status(500).json({ error: 'Failed to decide regularization' }); }
}
router.put('/regularizations/:id/approve', authenticate, (req, res) => regDecision(req, res, true));
router.put('/regularizations/:id/reject', authenticate, (req, res) => regDecision(req, res, false));

// ===================== Holidays =====================
router.get('/holidays', authenticate, async (req, res) => {
  try { res.json(await prisma.holiday.findMany({ orderBy: { date: 'asc' } })); }
  catch (e) { res.status(500).json({ error: 'Failed to fetch holidays' }); }
});
router.post('/holidays', authenticate, authorize(['admin']), async (req, res) => {
  try {
    const { date, name } = req.body;
    if (!/^\d{4}-\d{2}-\d{2}$/.test(date || '') || !name) return res.status(400).json({ error: 'date (YYYY-MM-DD) and name required.' });
    const h = await prisma.holiday.upsert({ where: { date }, update: { name }, create: { date, name } });
    await audit(req.user, 'create', 'holiday', h.id, `${date} ${name}`);
    res.json(h);
  } catch (e) { res.status(500).json({ error: 'Failed to add holiday' }); }
});
router.delete('/holidays/:id', authenticate, authorize(['admin']), async (req, res) => {
  try {
    await prisma.holiday.delete({ where: { id: req.params.id } });
    await audit(req.user, 'delete', 'holiday', req.params.id);
    res.json({ message: 'Holiday removed' });
  } catch (e) { res.status(500).json({ error: 'Failed to remove holiday' }); }
});

// ===================== Notifications (in-app) =====================
router.get('/notifications', authenticate, async (req, res) => {
  try {
    const { page, limit, skip } = parsePagination(req.query, { defaultLimit: 50, maxLimit: 100 });
    const where = { userId: req.user.id };
    const [total, rows] = await Promise.all([
      prisma.notification.count({ where }),
      prisma.notification.findMany({ where, orderBy: { at: 'desc' }, skip, take: limit })
    ]);
    if (req.query.page != null) return res.json(paginated(rows, total, page, limit));
    res.json(rows);
  } catch (e) { res.status(500).json({ error: 'Failed to fetch notifications' }); }
});
router.put('/notifications/read-all', authenticate, async (req, res) => {
  try {
    await prisma.notification.updateMany({ where: { userId: req.user.id, read: false }, data: { read: true } });
    res.json({ message: 'All read' });
  } catch (e) { res.status(500).json({ error: 'Failed to update notifications' }); }
});
router.put('/notifications/:id/read', authenticate, async (req, res) => {
  try {
    await prisma.notification.updateMany({ where: { id: req.params.id, userId: req.user.id }, data: { read: true } });
    res.json({ message: 'Read' });
  } catch (e) { res.status(500).json({ error: 'Failed to update notification' }); }
});

// ===================== Audit log (admin, or granted 'audit' module) =====================
router.get('/audit', authenticate, async (req, res) => {
  try {
    const actor = await loadActor(req);
    const allowed = actor?.role === 'admin' || effectivePerms(actor).modules.includes('audit');
    if (!allowed) return res.status(403).json({ error: 'Not allowed.' });
    const where = {};
    if (req.query.entity) where.entity = String(req.query.entity);
    if (req.query.actorId) where.actorId = String(req.query.actorId);
    const { page, limit, skip } = parsePagination(req.query, { defaultLimit: 100, maxLimit: 500 });
    const [total, rows] = await Promise.all([
      prisma.auditLog.count({ where }),
      prisma.auditLog.findMany({ where, orderBy: { at: 'desc' }, skip, take: limit })
    ]);
    if (req.query.page != null) return res.json(paginated(rows, total, page, limit));
    res.json(rows);
  } catch (e) { res.status(500).json({ error: 'Failed to fetch audit log' }); }
});

// ===================== Reports =====================
function toCsv(rows) {
  if (!rows.length) return '';
  const keys = Object.keys(rows[0]);
  const esc = v => `"${String(v ?? '').replace(/"/g, '""')}"`;
  return [keys.join(','), ...rows.map(r => keys.map(k => esc(r[k])).join(','))].join('\n');
}

router.get('/reports/:kind', authenticate, async (req, res) => {
  try {
    const actor = await loadActor(req);
    const allowed = isSupervisor(actor) || effectivePerms(actor).modules.includes('reports');
    if (!allowed) return res.status(403).json({ error: 'Not allowed.' });
    let rows = [];
    const kind = req.params.kind;
    if (kind === 'headcount') {
      const emps = await prisma.employee.findMany({ select: { department: true, status: true } });
      const byDept = {};
      for (const e of emps) {
        const d = byDept[e.department || 'Unassigned'] ||= { department: e.department || 'Unassigned', active: 0, inactive: 0, onboarding: 0, total: 0 };
        d.total++;
        if (e.status === 'active') d.active++;
        else if (e.status === 'inactive') d.inactive++;
        else d.onboarding++;
      }
      rows = Object.values(byDept);
    } else if (kind === 'leave-utilization') {
      const emps = await prisma.employee.findMany({ where: { status: 'active' }, select: { id: true, name: true } });
      const bals = await prisma.leaveBalance.findMany();
      const approved = await prisma.leave.findMany({ where: { status: 'Approved' }, select: { employeeId: true, leaveType: true, durationDays: true } });
      rows = emps.map(e => {
        const b = bals.find(x => x.employeeId === e.id) || { annual: 0, sick: 0, casual: 0 };
        const used = { annual: 0, sick: 0, casual: 0 };
        approved.filter(l => l.employeeId === e.id).forEach(l => { const k = LEAVE_TYPE_KEY[l.leaveType]; if (k) used[k] += l.durationDays; });
        return { employee: e.name, annualUsed: used.annual, annualTotal: b.annual, sickUsed: used.sick, sickTotal: b.sick, casualUsed: used.casual, casualTotal: b.casual };
      });
    } else if (kind === 'payroll-cycles') {
      const cycles = await prisma.payrollCycle.findMany();
      const slips = await prisma.payroll.groupBy({ by: ['month'], _count: { _all: true } });
      const months = new Set([...cycles.map(c => c.month), ...slips.map(s => s.month)]);
      rows = [...months].map(m => ({
        month: m,
        payslips: slips.find(s => s.month === m)?._count._all || 0,
        finalized: cycles.find(c => c.month === m)?.finalized ? 'Yes' : 'No'
      }));
    } else if (kind === 'asset-allocation') {
      const assets = await prisma.asset.findMany({ include: { employee: { select: { name: true } } } });
      rows = assets.map(a => ({ asset: a.name, serial: a.serialNumber, type: a.type, owner: a.employee?.name || 'In stock', condition: a.condition, status: a.status }));
    } else if (kind === 'helpdesk-resolution') {
      const tickets = await prisma.helpdeskTicket.findMany({ include: { employee: { select: { name: true } }, replies: true } });
      rows = tickets.map(t => ({ subject: t.subject, owner: t.employee?.name || t.employeeId, priority: t.priority, status: t.status, created: t.createdDate, replies: t.replies.length }));
    } else if (kind === 'permission-changes') {
      const logs = await prisma.auditLog.findMany({ where: { action: 'permissions-change' }, orderBy: { at: 'desc' }, take: 100 });
      rows = logs.map(l => ({ at: l.at.toISOString(), by: l.actorName, employee: l.entityId, detail: l.detail }));
    } else {
      return res.status(404).json({ error: 'Unknown report' });
    }
    if (req.query.format === 'csv') {
      res.setHeader('Content-Type', 'text/csv');
      res.setHeader('Content-Disposition', `attachment; filename="${kind}.csv"`);
      return res.send(toCsv(rows));
    }
    res.json({ kind, rows });
  } catch (e) { res.status(500).json({ error: 'Failed to build report' }); }
});

// Assets
router.get('/assets', authenticate, async (req, res) => {
  try {
    const assets = await prisma.asset.findMany({
      include: { employee: { select: { name: true } } }
    });
    res.json(assets);
  } catch (error) {
    res.status(500).json({ error: 'Failed to fetch assets' });
  }
});

router.post('/assets', authenticate, authorize(['admin']), async (req, res) => {
  try {
    const { employeeId, name, type, serialNumber, condition } = req.body;
    // Owner optional: without one the asset sits "In Stock" until assigned.
    const asset = await prisma.asset.create({
      data: {
        employeeId: employeeId || null, name, type, serialNumber,
        condition: condition || 'New',
        status: employeeId ? 'Pending Employee Confirmation' : 'In Stock',
        assignedBy: employeeId ? req.user.id : null,
        assignedDate: employeeId ? new Date().toISOString().split('T')[0] : null
      }
    });
    await audit(req.user, 'create', 'asset', asset.id, `${name} (${serialNumber})${employeeId ? ' → ' + employeeId : ' [in stock]'}`);
    if (employeeId) await notify(employeeId, 'Asset assigned to you', `${name} (S/N ${serialNumber}) — please confirm receipt.`, 'asset');
    res.json(asset);
  } catch (error) {
    res.status(500).json({ error: 'Failed to create asset' });
  }
});

// Assign an in-stock (or returned) asset to an employee.
router.put('/assets/:id/assign', authenticate, authorize(['admin']), async (req, res) => {
  try {
    const { employeeId } = req.body;
    if (!employeeId) return res.status(400).json({ error: 'employeeId is required.' });
    const asset = await prisma.asset.update({
      where: { id: req.params.id },
      data: { employeeId, status: 'Pending Employee Confirmation', assignedBy: req.user.id, assignedDate: new Date().toISOString().split('T')[0] }
    });
    await audit(req.user, 'assign', 'asset', asset.id, `→ ${employeeId}`);
    await notify(employeeId, 'Asset assigned to you', `${asset.name} (S/N ${asset.serialNumber}) — please confirm receipt.`, 'asset');
    res.json(asset);
  } catch (error) {
    res.status(500).json({ error: 'Failed to assign asset' });
  }
});

router.put('/assets/:id/confirm', authenticate, async (req, res) => {
  try {
    const asset = await prisma.asset.update({ where: { id: req.params.id }, data: { status: 'Confirmed' } });
    res.json(asset);
  } catch (error) {
    res.status(500).json({ error: 'Failed to confirm asset' });
  }
});

// Modify an asset (reassign / change condition or status) — admin.
router.put('/assets/:id', authenticate, authorize(['admin']), async (req, res) => {
  try {
    const fields = ['employeeId', 'name', 'type', 'serialNumber', 'condition', 'status'];
    const data = {};
    for (const k of fields) if (req.body[k] !== undefined) data[k] = req.body[k];
    const asset = await prisma.asset.update({ where: { id: req.params.id }, data });
    await audit(req.user, 'update', 'asset', asset.id, JSON.stringify(data));
    res.json(asset);
  } catch (error) {
    res.status(500).json({ error: 'Failed to update asset' });
  }
});

router.delete('/assets/:id', authenticate, authorize(['admin']), async (req, res) => {
  try {
    await prisma.asset.delete({ where: { id: req.params.id } });
    await audit(req.user, 'delete', 'asset', req.params.id);
    res.json({ message: 'Asset removed' });
  } catch (error) {
    res.status(500).json({ error: 'Failed to remove asset' });
  }
});

// Helpdesk
router.get('/helpdesk', authenticate, async (req, res) => {
  try {
    const tickets = await prisma.helpdeskTicket.findMany({
      include: {
        employee: { select: { name: true } },
        replies: { include: { sender: { select: { name: true } } } }
      },
      orderBy: { createdDate: 'desc' }
    });
    res.json(tickets);
  } catch (error) {
    res.status(500).json({ error: 'Failed to fetch tickets' });
  }
});

router.post('/helpdesk', authenticate, async (req, res) => {
  try {
    const { subject, category, description, priority } = req.body;
    const ticket = await prisma.helpdeskTicket.create({
      data: {
        employeeId: req.user.id, subject, category, description,
        priority: priority || 'Medium', status: 'Open',
        createdDate: new Date().toISOString().split('T')[0]
      }
    });
    res.json(ticket);
  } catch (error) {
    res.status(500).json({ error: 'Failed to create ticket' });
  }
});

router.post('/helpdesk/:id/replies', authenticate, async (req, res) => {
  try {
    const ticket = await prisma.helpdeskTicket.findUnique({ where: { id: req.params.id } });
    if (!ticket) return res.status(404).json({ error: 'Ticket not found' });
    // Moderators (admin or moderateHelpdesk cap) may reply anywhere; others
    // only on their own tickets, and only moderators may resolve.
    const actor = await loadActor(req);
    const isMod = actor?.role === 'admin' || effectivePerms(actor).caps.moderateHelpdesk;
    if (!isMod && ticket.employeeId !== req.user.id) {
      return res.status(403).json({ error: 'You can only reply to your own tickets.' });
    }
    if (req.body.resolve && !isMod) {
      return res.status(403).json({ error: 'Only helpdesk moderators can resolve tickets.' });
    }
    const reply = await prisma.ticketReply.create({
      data: {
        ticketId: req.params.id, senderId: req.user.id,
        text: req.body.text, date: new Date().toISOString().split('T')[0]
      }
    });
    if (req.body.resolve) {
      await prisma.helpdeskTicket.update({ where: { id: req.params.id }, data: { status: 'Resolved' } });
      await audit(actor, 'resolve', 'ticket', ticket.id, ticket.subject);
    }
    if (ticket.employeeId !== req.user.id) {
      await notify(ticket.employeeId, req.body.resolve ? 'Ticket resolved' : 'New reply on your ticket', `"${ticket.subject}": ${String(req.body.text || '').slice(0, 120)}`, 'helpdesk');
    }
    res.json(reply);
  } catch (error) {
    res.status(500).json({ error: 'Failed to add reply' });
  }
});

// Moderators can move a ticket through its lifecycle.
router.put('/helpdesk/:id/status', authenticate, async (req, res) => {
  try {
    const STATES = ['Open', 'In Progress', 'Resolved', 'Closed'];
    const { status } = req.body;
    if (!STATES.includes(status)) return res.status(400).json({ error: `status must be one of: ${STATES.join(', ')}` });
    const actor = await loadActor(req);
    const isMod = actor?.role === 'admin' || effectivePerms(actor).caps.moderateHelpdesk;
    if (!isMod) return res.status(403).json({ error: 'Only helpdesk moderators can change status.' });
    const ticket = await prisma.helpdeskTicket.update({ where: { id: req.params.id }, data: { status } });
    await audit(actor, 'status', 'ticket', ticket.id, status);
    await notify(ticket.employeeId, 'Ticket status updated', `"${ticket.subject}" is now ${status}.`, 'helpdesk');
    res.json(ticket);
  } catch (error) {
    res.status(500).json({ error: 'Failed to update ticket status' });
  }
});

router.delete('/helpdesk/:id', authenticate, authorize(['admin']), async (req, res) => {
  try {
    await prisma.ticketReply.deleteMany({ where: { ticketId: req.params.id } });
    await prisma.helpdeskTicket.delete({ where: { id: req.params.id } });
    res.json({ message: 'Ticket removed' });
  } catch (error) {
    res.status(500).json({ error: 'Failed to remove ticket' });
  }
});

// Payroll — disabled by default; requires payroll module (admin always has it).
async function requirePayrollAccess(req, res) {
  const actor = await loadActor(req);
  if (!actor) { res.status(401).json({ error: 'Unauthorized' }); return null; }
  if (actor.role === 'admin' || hasModule(actor, 'payroll')) return actor;
  res.status(403).json({ error: 'Payroll is disabled for your account. Ask an administrator to grant access.' });
  return null;
}

router.get('/payroll', authenticate, async (req, res) => {
  try {
    const actor = await requirePayrollAccess(req, res);
    if (!actor) return;
    const where = actor.role === 'admin' ? {} : { employeeId: actor.id };
    const payroll = await prisma.payroll.findMany({ where, include: { employee: { select: { name: true } } } });
    res.json(payroll);
  } catch (error) {
    res.status(500).json({ error: 'Failed to fetch payroll' });
  }
});

router.post('/payroll/process', authenticate, authorize(['admin']), async (req, res) => {
  try {
    const { month } = req.body;
    const MONTH_RE = /^(January|February|March|April|May|June|July|August|September|October|November|December) \d{4}$/;
    if (!month || !MONTH_RE.test(month)) {
      return res.status(400).json({ error: 'month must be in the form "June 2026"' });
    }
    const cycle = await prisma.payrollCycle.findUnique({ where: { month } });
    if (cycle?.finalized) return res.status(400).json({ error: `${month} payroll is finalized and locked.` });
    const employees = await prisma.employee.findMany({ where: { status: 'active' } });
    // Preload declarations + existing slips once (avoids 2 queries per employee).
    const [decls, existingSlips] = await Promise.all([
      prisma.taxDeclaration.findMany(),
      prisma.payroll.findMany({ where: { month } })
    ]);
    const declMap = new Map(decls.map(d => [d.employeeId, d]));
    const existingMap = new Map(existingSlips.map(p => [p.employeeId, p]));
    const results = [];
    for (const emp of employees) {
      const decl = declMap.get(emp.id);
      const gross = emp.salaryBasic + emp.salaryAllow;
      const pf = Math.round(emp.salaryBasic * 0.12);
      const pt = 200;
      const declTotal = decl ? decl.section80C + decl.section80D + decl.hraRent * 12 + decl.otherDeductions : 0;
      const taxable = Math.max(0, gross * 12 - declTotal - 50000);
      const tds = Math.round((taxable > 500000 ? (taxable - 500000) * 0.05 : 0) / 12);
      const net = Math.max(0, gross - pf - pt - tds - emp.salaryDeduct);
      const data = {
        employeeId: emp.id, month, basic: emp.salaryBasic, allowances: emp.salaryAllow,
        deductions: emp.salaryDeduct, pf, esi: 0, pt, tds, advanceDeduction: 0,
        grossPay: gross, netPay: net, status: 'Paid',
        paymentDate: new Date().toISOString().split('T')[0]
      };
      const existing = existingMap.get(emp.id);
      const slip = existing
        ? await prisma.payroll.update({ where: { id: existing.id }, data })
        : await prisma.payroll.create({ data });
      results.push(slip);
    }
    await audit(req.user, 'process', 'payroll', month, `${results.length} payslip(s)`);
    res.json(results);
  } catch (error) {
    res.status(500).json({ error: 'Failed to process payroll' });
  }
});

// Finalize a payroll month — locks it against reprocessing.
router.post('/payroll/finalize', authenticate, authorize(['admin']), async (req, res) => {
  try {
    const { month } = req.body;
    const MONTH_RE = /^(January|February|March|April|May|June|July|August|September|October|November|December) \d{4}$/;
    if (!month || !MONTH_RE.test(month)) return res.status(400).json({ error: 'month must be in the form "June 2026"' });
    const cycle = await prisma.payrollCycle.upsert({
      where: { month }, update: { finalized: true, finalizedAt: new Date() },
      create: { month, finalized: true, finalizedAt: new Date() }
    });
    await audit(req.user, 'finalize', 'payroll', month);
    const active = await prisma.employee.findMany({ where: { status: 'active' }, select: { id: true } });
    for (const e of active) await notify(e.id, 'Payslip available', `Payroll for ${month} has been finalized. Your payslip is in Payroll & Tax.`, 'payroll');
    res.json(cycle);
  } catch (error) {
    res.status(500).json({ error: 'Failed to finalize payroll' });
  }
});

router.get('/payroll/cycles', authenticate, async (req, res) => {
  try {
    if (!(await requirePayrollAccess(req, res))) return;
    res.json(await prisma.payrollCycle.findMany());
  } catch (error) { res.status(500).json({ error: 'Failed to fetch payroll cycles' }); }
});

// Tax declaration (own) — also gated by payroll module
router.get('/tax', authenticate, async (req, res) => {
  try {
    if (!(await requirePayrollAccess(req, res))) return;
    const tax = await prisma.taxDeclaration.findFirst({ where: { employeeId: req.user.id } });
    res.json(tax || null);
  } catch (error) {
    res.status(500).json({ error: 'Failed to fetch tax declaration' });
  }
});

router.post('/tax', authenticate, async (req, res) => {
  try {
    if (!(await requirePayrollAccess(req, res))) return;
    const data = {
      employeeId: req.user.id,
      section80C: Number(req.body.section80C) || 0,
      section80D: Number(req.body.section80D) || 0,
      hraRent: Number(req.body.hraRent) || 0,
      otherDeductions: Number(req.body.otherDeductions) || 0
    };
    const existing = await prisma.taxDeclaration.findFirst({ where: { employeeId: req.user.id } });
    const tax = existing
      ? await prisma.taxDeclaration.update({ where: { id: existing.id }, data })
      : await prisma.taxDeclaration.create({ data });
    res.json(tax);
  } catch (error) {
    res.status(500).json({ error: 'Failed to save tax declaration' });
  }
});

// What the current user is allowed to grant (their own effective permissions).
router.get('/permissions/grantable', authenticate, async (req, res) => {
  try {
    res.json(effectivePerms(await loadActor(req)));
  } catch (error) {
    res.status(500).json({ error: 'Failed to load grantable permissions' });
  }
});

// Pending permission escalations (manager / admin).
router.get('/permissions/requests', authenticate, async (req, res) => {
  try {
    const actor = await loadActor(req);
    const isAdmin = actor?.role === 'admin';
    const canReview = isAdmin || effectivePerms(actor).caps.createUsers || effectivePerms(actor).caps.manageHierarchy;
    if (!canReview) return res.status(403).json({ error: 'Not allowed.' });
    const rows = await prisma.permissionRequest.findMany({
      where: isAdmin ? {} : { status: 'Pending' },
      orderBy: { createdAt: 'desc' },
      take: 100
    });
    // Non-admins only see requests for their direct reports or self-requested needing their stamp
    const emps = await prisma.employee.findMany({ select: { id: true, name: true, managerId: true } });
    const nameOf = Object.fromEntries(emps.map((e) => [e.id, e.name]));
    const filtered = rows.filter((r) => {
      if (isAdmin) return true;
      const target = emps.find((e) => e.id === r.targetId);
      return target?.managerId === actor.id || r.requestedBy === actor.id;
    });
    res.json(filtered.map((r) => ({
      ...r,
      targetName: nameOf[r.targetId],
      requesterName: nameOf[r.requestedBy],
      payload: parseJson(r.payload)
    })));
  } catch (e) {
    res.status(500).json({ error: 'Failed to list permission requests' });
  }
});

router.put('/permissions/requests/:id/decide', authenticate, async (req, res) => {
  try {
    const actor = await loadActor(req);
    const isAdmin = actor?.role === 'admin';
    const canReview = isAdmin || effectivePerms(actor).caps.createUsers || effectivePerms(actor).caps.manageHierarchy;
    if (!canReview) return res.status(403).json({ error: 'Not allowed.' });
    const approve = !!req.body.approve;
    const row = await prisma.permissionRequest.findUnique({ where: { id: req.params.id } });
    if (!row || row.status !== 'Pending') return res.status(400).json({ error: 'Request not pending.' });
    const target = await prisma.employee.findUnique({ where: { id: row.targetId } });
    if (!isAdmin && target?.managerId !== actor.id) {
      return res.status(403).json({ error: 'Only the manager or admin can stamp this request.' });
    }
    const stamp = makeStamp(actor, approve ? 'APPROVED' : 'REJECTED');
    if (approve) {
      const payload = parseJson(row.payload);
      await prisma.employee.update({
        where: { id: row.targetId },
        data: { permissions: JSON.stringify(normalizePerms(payload)) }
      });
      await notify(row.targetId, 'Access approved', `Your permission change was stamped: ${stamp}`, 'permission');
    } else {
      await notify(row.targetId, 'Access change rejected', req.body.note || 'Your permission request was rejected.', 'permission');
    }
    await notify(row.requestedBy, `Permission request ${approve ? 'approved' : 'rejected'}`,
      `Target ${row.targetId}: ${stamp}`, 'permission');
    const updated = await prisma.permissionRequest.update({
      where: { id: row.id },
      data: {
        status: approve ? 'Approved' : 'Rejected',
        stamp,
        note: req.body.note || null,
        decidedBy: actor.id,
        decidedAt: new Date()
      }
    });
    await audit(actor, approve ? 'permissions-approve' : 'permissions-reject', 'permission-request', row.id, stamp);
    res.json(updated);
  } catch (e) {
    console.error(e);
    res.status(500).json({ error: 'Failed to decide permission request' });
  }
});

// Delegated permission management — view/edit levels; non-admin escalates for stamp.
router.put('/employees/:id/permissions', authenticate, async (req, res) => {
  try {
    const actor = await loadActor(req);
    const actorPerms = effectivePerms(actor);
    const isAdmin = actor.role === 'admin';
    if (!isAdmin && !actorPerms.caps.createUsers) {
      return res.status(403).json({ error: 'You cannot manage permissions.' });
    }
    const requested = normalizePerms(req.body.permissions);
    if (!isAdmin && !isSubset(requested, actorPerms)) {
      return res.status(403).json({ error: 'You can only grant permissions you hold yourself (including view/edit level).' });
    }
    const target = await prisma.employee.findUnique({ where: { id: req.params.id }, select: { role: true, name: true, managerId: true } });
    if (!target) return res.status(404).json({ error: 'Employee not found' });
    if (!isAdmin && target.role === 'admin') return res.status(403).json({ error: 'Cannot edit an admin\'s permissions.' });

    // Super admin: apply immediately with stamp.
    if (isAdmin) {
      const stamp = makeStamp(actor, 'ADMIN-STAMP');
      const emp = await prisma.employee.update({
        where: { id: req.params.id },
        data: { permissions: JSON.stringify(requested) },
        omit: { password: true }
      });
      await audit(actor, 'permissions-change', 'employee', emp.id, `${stamp} ${JSON.stringify(requested)}`);
      await notify(emp.id, 'Your access changed', `Updated by admin. Stamp: ${stamp}`, 'permission');
      return res.json({ ...emp, stamp, applied: true });
    }

    // Others: escalate for manager / admin stamp (capture trail).
    const stampPending = makeStamp(actor, 'ESCALATED');
    const pr = await prisma.permissionRequest.create({
      data: {
        targetId: req.params.id,
        requestedBy: actor.id,
        payload: JSON.stringify(requested),
        status: 'Pending',
        stamp: stampPending,
        note: req.body.note || null
      }
    });
    await audit(actor, 'permissions-escalate', 'permission-request', pr.id, stampPending);
    // Notify target's manager and all admins
    const admins = await prisma.employee.findMany({ where: { role: 'admin', status: 'active' }, select: { id: true } });
    for (const a of admins) {
      await notify(a.id, 'Permission change needs stamp',
        `${actor.name} requested access change for ${target.name}. Review Permissions → Escalations.`, 'permission');
    }
    if (target.managerId && target.managerId !== actor.id) {
      await notify(target.managerId, 'Permission change needs stamp',
        `${actor.name} requested access change for ${target.name}.`, 'permission');
    }
    res.json({ applied: false, escalated: true, request: pr, message: 'Submitted for manager/admin stamp. Not applied yet.' });
  } catch (error) {
    console.error(error);
    res.status(500).json({ error: 'Failed to update permissions' });
  }
});

// Onboarding / generic employee update (admin)
router.put('/employees/:id', authenticate, authorize(['admin']), async (req, res) => {
  try {
    const data = coerceEmployeeNumbers({ ...req.body });
    delete data.id; delete data.email; delete data.password;
    const emp = await prisma.employee.update({ where: { id: req.params.id }, data, omit: { password: true } });
    await syncEmployeeDrive(emp);
    await audit(req.user, 'update', 'employee', emp.id, Object.keys(data).join(', '));
    res.json(emp);
  } catch (error) {
    res.status(500).json({ error: 'Failed to update employee' });
  }
});

// Change own password (requires the current one). Revokes all sessions.
router.put('/me/password', authenticate, async (req, res) => {
  try {
    const { currentPassword, newPassword } = req.body;
    if (!newPassword || String(newPassword).length < 8) {
      return res.status(400).json({ error: 'New password must be at least 8 characters.' });
    }
    const me = await prisma.employee.findUnique({ where: { id: req.user.id } });
    const ok = await bcrypt.compare(String(currentPassword || ''), me.password);
    if (!ok) return res.status(401).json({ error: 'Current password is incorrect.' });
    await prisma.employee.update({ where: { id: me.id }, data: { password: await bcrypt.hash(String(newPassword), 12) } });
    await revokeAllUserSessions(me.id);
    await audit(req.user, 'password-change', 'employee', me.id);
    res.json({ message: 'Password changed. Please sign in again.' });
  } catch (e) {
    res.status(500).json({ error: 'Failed to change password' });
  }
});

// Admin resets any employee's password (the "manual override" behind Forgot Password).
router.put('/employees/:id/password', authenticate, authorize(['admin']), async (req, res) => {
  try {
    const { newPassword } = req.body;
    if (!newPassword || String(newPassword).length < 8) {
      return res.status(400).json({ error: 'New password must be at least 8 characters.' });
    }
    await prisma.employee.update({ where: { id: req.params.id }, data: { password: await bcrypt.hash(String(newPassword), 12) } });
    await revokeAllUserSessions(req.params.id);
    await audit(req.user, 'password-reset', 'employee', req.params.id);
    res.json({ message: 'Password reset' });
  } catch (e) {
    res.status(500).json({ error: 'Failed to reset password' });
  }
});

// Upload a real document file; also records it in the employee's documents JSON
// and mirrors it into their Drive vault.
router.post('/files/:empId/:docKey', authenticate, fileAccess(true), (req, res, next) => {
  upload.single('file')(req, res, (err) => {
    if (err) return res.status(400).json({ error: err.message || 'Upload rejected.' });
    next();
  });
}, async (req, res) => {
  try {
    if (!req.file) return res.status(400).json({ error: 'No file received (5MB max; pdf/doc/docx/png/jpg).' });
    const emp = await prisma.employee.findUnique({ where: { id: req.params.empId } });
    if (!emp) return res.status(404).json({ error: 'Employee not found' });
    // Remove previous files for this docKey
    const dir = path.join(UPLOAD_ROOT, req.params.empId);
    if (fs.existsSync(dir)) {
      for (const f of fs.readdirSync(dir)) {
        if (f.startsWith(req.params.docKey + '.') && f !== req.file.filename) {
          try { fs.unlinkSync(path.join(dir, f)); } catch { /* ignore */ }
        }
      }
    }
    const docs = parseJson(emp.documents);
    docs[req.params.docKey] = req.file.filename;
    const updated = await prisma.employee.update({
      where: { id: emp.id }, data: { documents: JSON.stringify(docs) }, omit: { password: true }
    });
    await syncEmployeeDrive(updated);
    await audit(req.user, 'upload', 'file', emp.id, `${req.params.docKey} → ${req.file.filename}`);
    res.json({ docKey: req.params.docKey, filename: req.file.filename });
  } catch (e) {
    res.status(500).json({ error: 'Failed to store file' });
  }
});

// Download/view a stored document (self or supervisor only).
router.get('/files/:empId/:docKey', authenticate, fileAccess(false), (req, res) => {
  try {
    const dir = path.join(UPLOAD_ROOT, req.params.empId);
    const match = fs.existsSync(dir) && fs.readdirSync(dir).find(f => f.startsWith(req.params.docKey + '.'));
    if (!match) return res.status(404).json({ error: 'File not found.' });
    res.setHeader('X-Content-Type-Options', 'nosniff');
    res.setHeader('Content-Disposition', `inline; filename="${match}"`);
    res.sendFile(path.join(dir, match));
  } catch (e) {
    res.status(500).json({ error: 'Failed to read file' });
  }
});

// Settings: own preferences
router.put('/me/preferences', authenticate, async (req, res) => {
  try {
    const emp = await prisma.employee.update({
      where: { id: req.user.id },
      data: { preferences: JSON.stringify(req.body.preferences || {}) },
      omit: { password: true }
    });
    res.json({ preferences: emp.preferences });
  } catch (error) {
    res.status(500).json({ error: 'Failed to save preferences' });
  }
});

// Document vault / simulated Google Workspace (legacy UI label: Google Sync)
router.get('/gsync/:kind', authenticate, authorize(['admin']), async (req, res) => {
  try {
    const models = { drive: 'simulatedGDrive', sheets: 'simulatedGSheets', gmail: 'simulatedGmail' };
    const model = models[req.params.kind];
    if (!model) return res.status(404).json({ error: 'Unknown sync source' });
    const rows = await prisma[model].findMany();
    res.json(rows);
  } catch (error) {
    res.status(500).json({ error: 'Failed to fetch sync data' });
  }
});

// ---- Global search (people, tickets, assets) ----
router.get('/search', authenticate, async (req, res) => {
  try {
    const q = String(req.query.q || '').trim();
    if (q.length < 2) return res.json({ employees: [], tickets: [], assets: [] });
    const actor = await loadActor(req);
    const [employees, tickets, assets] = await Promise.all([
      prisma.employee.findMany({
        where: {
          status: { not: 'inactive' },
          OR: [
            { name: { contains: q } },
            { email: { contains: q } },
            { department: { contains: q } },
            { id: { contains: q } }
          ]
        },
        take: 10,
        select: { id: true, name: true, email: true, department: true, designation: true, role: true }
      }),
      prisma.helpdeskTicket.findMany({
        where: {
          OR: [
            { subject: { contains: q } },
            { description: { contains: q } }
          ]
        },
        take: 8,
        select: { id: true, subject: true, status: true, priority: true, employeeId: true }
      }),
      prisma.asset.findMany({
        where: {
          OR: [
            { name: { contains: q } },
            { serialNumber: { contains: q } },
            { type: { contains: q } }
          ]
        },
        take: 8,
        include: { employee: { select: { name: true } } }
      })
    ]);
    res.json({
      employees: redactEmployees(employees, actor),
      tickets,
      assets
    });
  } catch (e) {
    console.error(e);
    res.status(500).json({ error: 'Search failed' });
  }
});

// ---- Company settings (admin) ----
router.get('/settings/company', authenticate, async (req, res) => {
  try {
    res.json(await getAllSettings());
  } catch (e) {
    res.status(500).json({ error: 'Failed to load settings' });
  }
});

router.put('/settings/company', authenticate, authorize(['admin']), async (req, res) => {
  try {
    const allowed = ['lateThreshold', 'companyName', 'workWeek'];
    for (const k of allowed) {
      if (req.body[k] !== undefined) await setSetting(k, req.body[k]);
    }
    await audit(req.user, 'update', 'settings', 'company', JSON.stringify(req.body));
    res.json(await getAllSettings());
  } catch (e) {
    res.status(500).json({ error: 'Failed to save settings' });
  }
});

module.exports = router;
