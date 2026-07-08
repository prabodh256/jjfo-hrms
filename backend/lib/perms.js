// Canonical permission vocabulary (kept in sync with frontend/src/permissions.js).

const ALL_MODULES = [
  'dashboard', 'directory', 'onboarding', 'leaves', 'payroll', 'assets',
  'helpdesk', 'permissions', 'gsync', 'settings', 'audit', 'reports',
  'expenses', 'engagement', 'policies'
];
const ALL_CAPS = [
  'createUsers', 'approveLeaves', 'accessFinancials', 'manageHierarchy', 'moderateHelpdesk'
];
// Self-service: everyone sees own payslips; payroll *management* still needs grant/admin.
const BASE_MODULES = [
  'dashboard', 'leaves', 'helpdesk', 'settings', 'payroll',
  'expenses', 'engagement', 'policies'
];
const LEVEL_RANK = { view: 1, edit: 2 };

const parseJson = (s) => {
  try { return s ? (typeof s === 'string' ? JSON.parse(s) : s) : {}; }
  catch { return {}; }
};

/** Normalize stored/incoming modules into { [moduleKey]: 'view'|'edit' }. */
function normalizeModuleMap(input) {
  const levels = {};
  if (!input) return levels;
  if (Array.isArray(input)) {
    for (const m of input) {
      if (ALL_MODULES.includes(m)) levels[m] = 'edit';
    }
    return levels;
  }
  if (typeof input === 'object') {
    for (const [k, v] of Object.entries(input)) {
      if (!ALL_MODULES.includes(k)) continue;
      if (v === true || v === 'edit') levels[k] = 'edit';
      else if (v === 'view') levels[k] = 'view';
    }
  }
  return levels;
}

function normalizePerms(input) {
  const modules = normalizeModuleMap(input?.modules);
  // Strip base modules from stored grants (they're always implied); keep payroll etc.
  for (const b of BASE_MODULES) delete modules[b];
  const caps = {};
  for (const c of ALL_CAPS) caps[c] = !!(input?.caps && input.caps[c]);
  return { modules, caps };
}

function effectivePerms(emp) {
  if (!emp) return { modules: [], moduleLevels: {}, caps: {} };
  if (emp.role === 'admin') {
    const moduleLevels = Object.fromEntries(ALL_MODULES.map((m) => [m, 'edit']));
    return {
      modules: [...ALL_MODULES],
      moduleLevels,
      caps: Object.fromEntries(ALL_CAPS.map((c) => [c, true]))
    };
  }
  const p = parseJson(emp.permissions);
  const stored = normalizeModuleMap(p.modules);
  const moduleLevels = {};
  for (const b of BASE_MODULES) moduleLevels[b] = 'edit'; // self-service
  for (const [k, lvl] of Object.entries(stored)) moduleLevels[k] = lvl;
  const caps = (p.caps && typeof p.caps === 'object') ? { ...p.caps } : {
    accessFinancials: !!p.accessFinancials,
    manageHierarchy: !!p.manageHierarchy,
    moderateHelpdesk: !!p.moderateHelpdesk
  };
  for (const c of ALL_CAPS) caps[c] = !!caps[c];
  return {
    modules: Object.keys(moduleLevels),
    moduleLevels,
    caps
  };
}

function hasModule(emp, key) {
  return !!effectivePerms(emp).moduleLevels[key];
}

function hasModuleEdit(emp, key) {
  return effectivePerms(emp).moduleLevels[key] === 'edit';
}

function levelOk(grantedLevel, granterLevel) {
  return (LEVEL_RANK[granterLevel] || 0) >= (LEVEL_RANK[grantedLevel] || 0);
}

/** Grant is valid only if subset of granter (modules + levels + caps). */
function isSubset(granted, granter) {
  const gLevels = granter.moduleLevels || Object.fromEntries((granter.modules || []).map((m) => [m, 'edit']));
  const grantedMap = normalizeModuleMap(granted.modules);
  // If granted.modules is array form from normalizePerms result object:
  const map = typeof granted.modules === 'object' && !Array.isArray(granted.modules)
    ? granted.modules
    : grantedMap;
  for (const [m, lvl] of Object.entries(map)) {
    if (BASE_MODULES.includes(m)) continue;
    if (!levelOk(lvl, gLevels[m])) return false;
  }
  for (const c of Object.keys(granted.caps || {})) {
    if (granted.caps[c] && !granter.caps[c]) return false;
  }
  return true;
}

const isSupervisor = (actor) =>
  !!actor && (actor.role === 'admin' || effectivePerms(actor).caps.createUsers);

function redactEmployee(emp, viewer) {
  if (!emp) return emp;
  const out = { ...emp };
  delete out.password;
  const canSeePay =
    viewer?.role === 'admin' ||
    viewer?.id === emp.id ||
    effectivePerms(viewer).caps.accessFinancials ||
    hasModule(viewer, 'payroll');
  if (!canSeePay) {
    delete out.salaryBasic;
    delete out.salaryAllow;
    delete out.salaryDeduct;
  }
  return out;
}

function redactEmployees(list, viewer) {
  return (list || []).map((e) => redactEmployee(e, viewer));
}

function makeStamp(actor, action = 'APPROVED') {
  const ts = new Date().toISOString();
  return `${action}|${actor?.id || 'system'}|${actor?.name || ''}|${ts}`;
}

module.exports = {
  ALL_MODULES,
  ALL_CAPS,
  BASE_MODULES,
  LEVEL_RANK,
  parseJson,
  normalizeModuleMap,
  normalizePerms,
  effectivePerms,
  hasModule,
  hasModuleEdit,
  isSubset,
  isSupervisor,
  redactEmployee,
  redactEmployees,
  makeStamp
};
