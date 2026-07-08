// Canonical permission vocabulary — mirrors backend/lib/perms.js.

export const MODULES = [
  { key: 'dashboard', label: 'Dashboard' },
  { key: 'directory', label: 'Directory & Org' },
  { key: 'onboarding', label: 'Onboarding' },
  { key: 'leaves', label: 'Leave & Attendance' },
  { key: 'payroll', label: 'Payroll & Tax' },
  { key: 'assets', label: 'Asset Inventory' },
  { key: 'helpdesk', label: 'HR Helpdesk' },
  { key: 'permissions', label: 'Permissions' },
  { key: 'gsync', label: 'Document Vault' },
  { key: 'settings', label: 'Settings' },
  { key: 'audit', label: 'Audit Log' },
  { key: 'reports', label: 'Reports' },
  { key: 'expenses', label: 'Expenses' },
  { key: 'engagement', label: 'Engagement' },
  { key: 'policies', label: 'Policies' }
];

export const CAPS = [
  { key: 'createUsers', label: 'Create / manage users' },
  { key: 'approveLeaves', label: 'Approve leaves' },
  { key: 'accessFinancials', label: 'Access financials' },
  { key: 'manageHierarchy', label: 'Manage hierarchy' },
  { key: 'moderateHelpdesk', label: 'Moderate helpdesk' }
];

// Everyone can open Payroll for own payslips; company-wide processing remains admin.
export const BASE_MODULES = [
  'dashboard', 'leaves', 'helpdesk', 'settings', 'payroll',
  'expenses', 'engagement', 'policies'
];

export function parsePerms(raw) {
  try { return typeof raw === 'string' ? JSON.parse(raw || '{}') : (raw || {}); }
  catch { return {}; }
}

/** { directory: 'view'|'edit', ... } from stored permissions. */
export function moduleLevelsFrom(raw) {
  const p = parsePerms(raw);
  const levels = {};
  if (Array.isArray(p.modules)) {
    for (const m of p.modules) levels[m] = 'edit';
  } else if (p.modules && typeof p.modules === 'object') {
    for (const [k, v] of Object.entries(p.modules)) {
      if (v === true || v === 'edit') levels[k] = 'edit';
      else if (v === 'view') levels[k] = 'view';
    }
  }
  return levels;
}

export function effective(user) {
  if (!user) return { modules: [], moduleLevels: {}, caps: {}, admin: false };
  if (user.role === 'admin') {
    const moduleLevels = Object.fromEntries(MODULES.map((m) => [m.key, 'edit']));
    return {
      modules: MODULES.map((m) => m.key),
      moduleLevels,
      caps: Object.fromEntries(CAPS.map((c) => [c.key, true])),
      admin: true
    };
  }
  const stored = moduleLevelsFrom(user.permissions);
  const moduleLevels = {};
  for (const b of BASE_MODULES) moduleLevels[b] = 'edit';
  Object.assign(moduleLevels, stored);
  const p = parsePerms(user.permissions);
  return {
    modules: Object.keys(moduleLevels),
    moduleLevels,
    caps: p.caps || {},
    admin: false
  };
}

export const hasModule = (user, key) => !!effective(user).moduleLevels[key];
export const hasModuleEdit = (user, key) => effective(user).moduleLevels[key] === 'edit';
export const hasCap = (user, cap) => !!effective(user).caps[cap];
