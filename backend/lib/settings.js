const prisma = require('../prisma/client');

const DEFAULTS = {
  lateThreshold: '09:15',
  companyName: 'JJFO',
  workWeek: 'Mon-Fri'
};

async function getSetting(key) {
  const row = await prisma.appSetting.findUnique({ where: { key } });
  return row?.value ?? DEFAULTS[key] ?? null;
}

async function setSetting(key, value) {
  return prisma.appSetting.upsert({
    where: { key },
    update: { value: String(value) },
    create: { key, value: String(value) }
  });
}

async function getAllSettings() {
  const rows = await prisma.appSetting.findMany();
  const map = { ...DEFAULTS };
  for (const r of rows) map[r.key] = r.value;
  return map;
}

/** Returns true if hh:mm is on-time given threshold HH:MM. */
function isOnTime(hhmm, threshold = '09:15') {
  const [th, tm] = String(threshold).split(':').map(Number);
  const [h, m] = String(hhmm).split(':').map(Number);
  if (h < th) return true;
  if (h === th && m <= tm) return true;
  return false;
}

module.exports = { getSetting, setSetting, getAllSettings, isOnTime, DEFAULTS };
