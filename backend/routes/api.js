const express = require('express');
const bcrypt = require('bcryptjs');
const multer = require('multer');
const path = require('path');
const fs = require('fs');
const { authenticate, authorize } = require('../middleware/auth');
const prisma = require('../prisma/client');
const router = express.Router();

const LEAVE_TYPE_KEY = { 'Annual Leave': 'annual', 'Sick Leave': 'sick', 'Casual Leave': 'casual' };

// Canonical permission vocabulary (kept in sync with frontend/src/permissions.js).
const ALL_MODULES = ['dashboard', 'directory', 'onboarding', 'leaves', 'payroll', 'assets', 'helpdesk', 'permissions', 'gsync', 'settings', 'audit', 'reports'];
const ALL_CAPS = ['createUsers', 'approveLeaves', 'accessFinancials', 'manageHierarchy', 'moderateHelpdesk'];
// Self-service modules every employee always retains.
const BASE_MODULES = ['dashboard', 'leaves', 'helpdesk', 'settings'];

const safeName = (name) => (name || '').replace(/\s+/g, '');
const parseJson = (s) => { try { return s ? JSON.parse(s) : {}; } catch { return {}; } };

// Resolve an employee's effective permissions. Admins implicitly hold everything.
function effectivePerms(emp) {
  if (!emp) return { modules: [], caps: {} };
  if (emp.role === 'admin') {
    return { modules: [...ALL_MODULES], caps: Object.fromEntries(ALL_CAPS.map(c => [c, true])) };
  }
  const p = parseJson(emp.permissions);
  const stored = Array.isArray(p.modules) ? p.modules.filter(m => ALL_MODULES.includes(m)) : [];
  const modules = Array.from(new Set([...BASE_MODULES, ...stored]));
  const caps = (p.caps && typeof p.caps === 'object') ? p.caps : {
    accessFinancials: !!p.accessFinancials, manageHierarchy: !!p.manageHierarchy, moderateHelpdesk: !!p.moderateHelpdesk
  };
  return { modules, caps };
}

// A grant is valid only if it is a SUBSET of what the granter holds.
function isSubset(granted, granter) {
  const gm = new Set(granter.modules);
  for (const m of (granted.modules || [])) if (!gm.has(m)) return false;
  for (const c of Object.keys(granted.caps || {})) if (granted.caps[c] && !granter.caps[c]) return false;
  return true;
}

// Normalize an incoming permissions object to the canonical shape.
function normalizePerms(input) {
  const modules = Array.isArray(input?.modules) ? input.modules.filter(m => ALL_MODULES.includes(m)) : [];
  const caps = {};
  for (const c of ALL_CAPS) caps[c] = !!(input?.caps && input.caps[c]);
  return { modules, caps };
}

async function loadActor(req) {
  return prisma.employee.findUnique({ where: { id: req.user.id } });
}

// Admin or a delegate with the createUsers capability may manage others.
const isSupervisor = (actor) => !!actor && (actor.role === 'admin' || effectivePerms(actor).caps.createUsers);

// ---- Real document storage (backend/uploads/<empId>/<docKey>.<ext>) ----
const UPLOAD_ROOT = path.join(__dirname, '..', 'uploads');
const DOC_KEY_RE = /^[a-zA-Z][a-zA-Z0-9_-]{1,40}$/;
const EMP_ID_RE = /^EMP\d{3,}$/;
const FILE_EXTS = new Set(['.pdf', '.png', '.jpg', '.jpeg', '.doc', '.docx']);

const upload = multer({
  storage: multer.diskStorage({
    destination: (req, file, cb) => {
      const dir = path.join(UPLOAD_ROOT, req.params.empId);
      fs.mkdirSync(dir, { recursive: true });
      cb(null, dir);
    },
    // One file per docKey; re-uploads overwrite.
    filename: (req, file, cb) => cb(null, req.params.docKey + path.extname(file.originalname).toLowerCase())
  }),
  limits: { fileSize: 5 * 1024 * 1024 },
  fileFilter: (req, file, cb) => cb(null, FILE_EXTS.has(path.extname(file.originalname).toLowerCase()))
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

// ---- Audit trail + in-app notifications (best-effort; never block the action) ----
async function audit(actorRef, action, entity, entityId, detail) {
  try {
    let name = actorRef?.name;
    if (!name && actorRef?.id) {
      const a = await prisma.employee.findUnique({ where: { id: actorRef.id }, select: { name: true } });
      name = a?.name;
    }
    await prisma.auditLog.create({ data: {
      actorId: actorRef?.id || 'system', actorName: name || actorRef?.id || 'system',
      action, entity, entityId: entityId ? String(entityId) : null,
      detail: detail ? String(detail).slice(0, 500) : null
    } });
  } catch (e) { console.error('audit failed:', e.message); }
}

async function notify(userId, title, body, kind = 'general') {
  try {
    if (!userId) return;
    await prisma.notification.create({ data: { userId, title, body: String(body || '').slice(0, 500), kind } });
  } catch (e) { console.error('notify failed:', e.message); }
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

// Employees (Directory)
router.get('/employees', authenticate, async (req, res) => {
  try {
    // Never expose password hashes to the client. Deactivated employees are
    // hidden unless explicitly requested.
    const where = req.query.includeInactive === '1' ? {} : { status: { not: 'inactive' } };
    const employees = await prisma.employee.findMany({ where, omit: { password: true } });
    res.json(employees);
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
    // New hires get a default password; never persist or echo it in plaintext.
    data.password = await bcrypt.hash(data.password || 'password123', 12);
    const employee = await prisma.employee.create({ data, omit: { password: true } });
    // Provision the new hire everywhere: leave balance + their Drive vault folder.
    await prisma.leaveBalance.upsert({
      where: { employeeId: employee.id }, update: {},
      create: { employeeId: employee.id, annual: 15, sick: 7, casual: 7 }
    });
    await syncEmployeeDrive(employee);
    await audit(actor, 'create', 'employee', employee.id, `Created ${employee.name} (${employee.email})`);
    res.json(employee);
  } catch (error) {
    console.error(error);
    res.status(500).json({ error: 'Failed to create employee' });
  }
});

// Remove an employee and all dependent records (admin).
router.delete('/employees/:id', authenticate, authorize(['admin']), async (req, res) => {
  try {
    const id = req.params.id;
    if (id === req.user.id) return res.status(400).json({ error: 'You cannot remove your own account.' });
    // Atomic cascade: children first, then the employee — all-or-nothing.
    await prisma.$transaction([
      prisma.ticketReply.deleteMany({ where: { OR: [{ senderId: id }, { ticket: { employeeId: id } }] } }),
      prisma.helpdeskTicket.deleteMany({ where: { employeeId: id } }),
      prisma.leave.deleteMany({ where: { employeeId: id } }),
      prisma.attendance.deleteMany({ where: { employeeId: id } }),
      prisma.attendanceRegularization.deleteMany({ where: { employeeId: id } }),
      prisma.asset.deleteMany({ where: { employeeId: id } }),
      prisma.payroll.deleteMany({ where: { employeeId: id } }),
      prisma.taxDeclaration.deleteMany({ where: { employeeId: id } }),
      prisma.salaryAdvance.deleteMany({ where: { employeeId: id } }),
      prisma.goal.deleteMany({ where: { employeeId: id } }),
      prisma.leaveBalance.deleteMany({ where: { employeeId: id } }),
      prisma.employee.delete({ where: { id } })
    ]);
    await audit(req.user, 'delete', 'employee', id, 'Hard delete with cascade');
    res.json({ message: 'Employee removed' });
  } catch (error) {
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

// Leaves
router.get('/leaves', authenticate, async (req, res) => {
  try {
    const leaves = await prisma.leave.findMany({
      include: { employee: { select: { name: true } } },
      orderBy: { createdAt: 'desc' }
    });
    // Build the manager map once, then resolve approvers in-memory (no N+1).
    const mgrMap = new Map((await prisma.employee.findMany({ select: { id: true, managerId: true } })).map(e => [e.id, e.managerId]));
    const enriched = leaves.map((l) => ({
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

    // Enforce available balance for the leave type (admins may override).
    const typeKey = LEAVE_TYPE_KEY[leaveType];
    if (!isAdmin && typeKey) {
      const bal = await prisma.leaveBalance.findUnique({ where: { employeeId } });
      const approved = await prisma.leave.findMany({ where: { employeeId, leaveType, status: 'Approved' }, select: { durationDays: true } });
      const used = approved.reduce((s, l) => s + l.durationDays, 0);
      const available = Math.max(0, (bal?.[typeKey] || 0) - used);
      if (durationDays > available) {
        return res.status(400).json({ error: `Insufficient ${leaveType} balance — ${available} day(s) available.` });
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

// Leave balances with used/available breakup (admin sees all; others see own).
router.get('/leave-balances', authenticate, async (req, res) => {
  try {
    const isAdmin = req.user.role === 'admin';
    const employees = await prisma.employee.findMany({
      where: isAdmin ? {} : { id: req.user.id }, select: { id: true, name: true }
    });
    const balances = await prisma.leaveBalance.findMany();
    const approved = await prisma.leave.findMany({ where: { status: 'Approved' } });
    const result = employees.map(e => {
      const bal = balances.find(b => b.employeeId === e.id) || { annual: 0, sick: 0, casual: 0 };
      const used = { annual: 0, sick: 0, casual: 0 };
      approved.filter(l => l.employeeId === e.id).forEach(l => {
        const k = LEAVE_TYPE_KEY[l.leaveType]; if (k) used[k] += l.durationDays;
      });
      const mk = (t) => ({ total: bal[t], used: used[t], available: Math.max(0, bal[t] - used[t]) });
      return { employeeId: e.id, name: e.name, annual: mk('annual'), sick: mk('sick'), casual: mk('casual') };
    });
    res.json(result);
  } catch (error) {
    res.status(500).json({ error: 'Failed to fetch leave balances' });
  }
});

// Adjust an employee's leave allotment (admin only).
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
    const status = (now.getHours() < 9 || (now.getHours() === 9 && now.getMinutes() <= 15)) ? 'On Time' : 'Late';
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
    const rows = await prisma.notification.findMany({ where: { userId: req.user.id }, orderBy: { at: 'desc' }, take: 50 });
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
    res.json(await prisma.auditLog.findMany({ where, orderBy: { at: 'desc' }, take: 200 }));
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

// Payroll
router.get('/payroll', authenticate, async (req, res) => {
  try {
    const where = req.user.role === 'admin' ? {} : { employeeId: req.user.id };
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
  try { res.json(await prisma.payrollCycle.findMany()); }
  catch (error) { res.status(500).json({ error: 'Failed to fetch payroll cycles' }); }
});

// Tax declaration (own)
router.get('/tax', authenticate, async (req, res) => {
  try {
    const tax = await prisma.taxDeclaration.findFirst({ where: { employeeId: req.user.id } });
    res.json(tax || null);
  } catch (error) {
    res.status(500).json({ error: 'Failed to fetch tax declaration' });
  }
});

router.post('/tax', authenticate, async (req, res) => {
  try {
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

// Delegated permission management — grants must be a subset of the granter's.
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
      return res.status(403).json({ error: 'You can only grant permissions you hold yourself.' });
    }
    const target = await prisma.employee.findUnique({ where: { id: req.params.id }, select: { role: true } });
    if (!isAdmin && target?.role === 'admin') return res.status(403).json({ error: 'Cannot edit an admin\'s permissions.' });
    const emp = await prisma.employee.update({
      where: { id: req.params.id }, data: { permissions: JSON.stringify(requested) }, omit: { password: true }
    });
    await audit(actor, 'permissions-change', 'employee', emp.id, JSON.stringify(requested));
    await notify(emp.id, 'Your access changed', 'Your module access or capabilities were updated. Changes apply immediately.', 'permission');
    res.json(emp);
  } catch (error) {
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

// Change own password (requires the current one).
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
    await audit(req.user, 'password-change', 'employee', me.id);
    res.json({ message: 'Password changed' });
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
    await audit(req.user, 'password-reset', 'employee', req.params.id);
    res.json({ message: 'Password reset' });
  } catch (e) {
    res.status(500).json({ error: 'Failed to reset password' });
  }
});

// Upload a real document file; also records it in the employee's documents JSON
// and mirrors it into their Drive vault.
router.post('/files/:empId/:docKey', authenticate, fileAccess(true), upload.single('file'), async (req, res) => {
  try {
    if (!req.file) return res.status(400).json({ error: 'No file received (5MB max; pdf/doc/docx/png/jpg).' });
    const emp = await prisma.employee.findUnique({ where: { id: req.params.empId } });
    if (!emp) return res.status(404).json({ error: 'Employee not found' });
    const docs = parseJson(emp.documents);
    docs[req.params.docKey] = req.file.filename;
    const updated = await prisma.employee.update({
      where: { id: emp.id }, data: { documents: JSON.stringify(docs) }, omit: { password: true }
    });
    await syncEmployeeDrive(updated);
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

// Google Workspace sync (simulated, admin)
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

module.exports = router;
