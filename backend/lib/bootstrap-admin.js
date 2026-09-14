const bcrypt = require('bcryptjs');
const prisma = require('../prisma/client');

const required = (name) => String(process.env[name] || '').trim();

/**
 * One-time production bootstrap. Once any admin exists, the environment
 * credentials are ignored; every later account is created from the portal.
 */
async function ensureBootstrapAdmin() {
  const adminCount = await prisma.employee.count({ where: { role: 'admin' } });
  if (adminCount > 0) return { created: false };

  const email = required('INITIAL_ADMIN_EMAIL').toLowerCase();
  const password = required('INITIAL_ADMIN_PASSWORD');
  const name = required('INITIAL_ADMIN_NAME') || 'JJFO Super Admin';
  if (!email || !email.includes('@') || password.length < 16) {
    throw new Error(
      'No admin exists. Set INITIAL_ADMIN_EMAIL and INITIAL_ADMIN_PASSWORD (minimum 16 characters) for the one-time bootstrap.'
    );
  }

  const ids = await prisma.employee.findMany({ select: { id: true } });
  const used = new Set(ids.map((row) => row.id));
  let sequence = 1;
  while (used.has(`EMP${String(sequence).padStart(3, '0')}`)) sequence += 1;
  const bootstrapId = `EMP${String(sequence).padStart(3, '0')}`;

  const employee = await prisma.$transaction(async (tx) => {
    const created = await tx.employee.create({
      data: {
        id: bootstrapId, email, name, password: await bcrypt.hash(password, 12),
        role: 'admin', status: 'active', department: 'Administration',
        designation: 'Super Admin', onboardingState: 'approved', managerId: null,
        permissions: JSON.stringify({ modules: {}, caps: {} })
      }
    });
    await tx.leaveBalance.create({ data: { employeeId: created.id, annual: 0, sick: 0, casual: 0 } });
    await tx.auditLog.create({ data: {
      actorId: 'system', actorName: 'System', action: 'bootstrap-admin',
      entity: 'employee', entityId: created.id,
      detail: 'Created the first and only bootstrap administrator.'
    } });
    return created;
  });
  return { created: true, id: employee.id };
}

module.exports = { ensureBootstrapAdmin };
