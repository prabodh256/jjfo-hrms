// Canonical permission vocabulary (kept in sync with frontend/src/permissions.js).

const ALL_MODULES = [
  'dashboard', 'directory', 'onboarding', 'leaves', 'payroll', 'assets',
  'helpdesk', 'permissions', 'gsync', 'settings', 'audit', 'reports'
];
const ALL_CAPS = [
  'createUsers', 'approveLeaves', 'accessFinancials', 'manageHierarchy', 'moderateHelpdesk'
];
const BASE_MODULES = ['dashboard', 'leaves', 'helpdesk', 'settings'];

const parseJson = (s) => {
  try { return s ? (typeof s === 'string' ? JSON.parse(s) : s) : {}; }
  catch { return {}; }
};

function effectivePerms(emp) {
  if (!emp) return { modules: [], caps: {} };
  if (emp.role === 'admin') {
    return {
      modules: [...ALL_MODULES],
      caps: Object.fromEntries(ALL_CAPS.map((c) => [c, true]))
    };
  }
  const p = parseJson(emp.permissions);
  const stored = Array.isArray(p.modules) ? p.modules.filter((m) => ALL_MODULES.includes(m)) : [];
  const modules = Array.from(new Set([...BASE_MODULES, ...stored]));
  const caps = (p.caps && typeof p.caps === 'object') ? p.caps : {
    accessFinancials: !!p.accessFinancials,
    manageHierarchy: !!p.manageHierarchy,
    moderateHelpdesk: !!p.moderateHelpdesk
  };
  return { modules, caps };
}

function isSubset(granted, granter) {
  const gm = new Set(granter.modules);
  for (const m of (granted.modules || [])) if (!gm.has(m)) return false;
  for (const c of Object.keys(granted.caps || {})) {
    if (granted.caps[c] && !granter.caps[c]) return false;
  }
  return true;
}

function normalizePerms(input) {
  const modules = Array.isArray(input?.modules)
    ? input.modules.filter((m) => ALL_MODULES.includes(m))
    : [];
  const caps = {};
  for (const c of ALL_CAPS) caps[c] = !!(input?.caps && input.caps[c]);
  return { modules, caps };
}

const isSupervisor = (actor) =>
  !!actor && (actor.role === 'admin' || effectivePerms(actor).caps.createUsers);

/** Strip salary fields unless the viewer is self, admin, or has accessFinancials. */
function redactEmployee(emp, viewer) {
  if (!emp) return emp;
  const out = { ...emp };
  delete out.password;
  const canSeePay =
    viewer?.role === 'admin' ||
    viewer?.id === emp.id ||
    effectivePerms(viewer).caps.accessFinancials;
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

module.exports = {
  ALL_MODULES,
  ALL_CAPS,
  BASE_MODULES,
  parseJson,
  effectivePerms,
  isSubset,
  normalizePerms,
  isSupervisor,
  redactEmployee,
  redactEmployees
};
