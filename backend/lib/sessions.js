const crypto = require('crypto');
const prisma = require('../prisma/client');

const DAY_MS = 24 * 60 * 60 * 1000;

function newJti() {
  return crypto.randomBytes(24).toString('hex');
}

async function createSession(userId, expiresInMs = DAY_MS) {
  const jti = newJti();
  const expiresAt = new Date(Date.now() + expiresInMs);
  await prisma.session.create({
    data: { jti, userId, expiresAt }
  });
  return { jti, expiresAt };
}

async function isSessionValid(jti) {
  if (!jti) return false;
  const row = await prisma.session.findUnique({ where: { jti } });
  if (!row || row.revokedAt) return false;
  if (row.expiresAt.getTime() < Date.now()) return false;
  return true;
}

async function revokeSession(jti) {
  if (!jti) return;
  try {
    await prisma.session.updateMany({
      where: { jti, revokedAt: null },
      data: { revokedAt: new Date() }
    });
  } catch {
    /* ignore */
  }
}

async function revokeAllUserSessions(userId) {
  await prisma.session.updateMany({
    where: { userId, revokedAt: null },
    data: { revokedAt: new Date() }
  });
}

/** Best-effort cleanup of expired rows (call occasionally). */
async function purgeExpiredSessions() {
  try {
    await prisma.session.deleteMany({
      where: { expiresAt: { lt: new Date() } }
    });
  } catch {
    /* ignore */
  }
}

module.exports = {
  newJti,
  createSession,
  isSessionValid,
  revokeSession,
  revokeAllUserSessions,
  purgeExpiredSessions,
  DAY_MS
};
