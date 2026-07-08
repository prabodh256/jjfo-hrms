const prisma = require('../prisma/client');

async function audit(actorRef, action, entity, entityId, detail) {
  try {
    let name = actorRef?.name;
    if (!name && actorRef?.id) {
      const a = await prisma.employee.findUnique({
        where: { id: actorRef.id },
        select: { name: true }
      });
      name = a?.name;
    }
    await prisma.auditLog.create({
      data: {
        actorId: actorRef?.id || 'system',
        actorName: name || actorRef?.id || 'system',
        action,
        entity,
        entityId: entityId ? String(entityId) : null,
        detail: detail ? String(detail).slice(0, 500) : null
      }
    });
  } catch (e) {
    console.error('audit failed:', e.message);
  }
}

async function notify(userId, title, body, kind = 'general') {
  try {
    if (!userId) return;
    await prisma.notification.create({
      data: {
        userId,
        title,
        body: String(body || '').slice(0, 500),
        kind
      }
    });
  } catch (e) {
    console.error('notify failed:', e.message);
  }
}

module.exports = { audit, notify };
