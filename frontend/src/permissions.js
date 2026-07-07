// Canonical permission vocabulary — mirrors backend/routes/api.js.

export const MODULES = [
  { key: 'dashboard', label: 'Dashboard' },
  { key: 'directory', label: 'Directory & Org' },
  { key: 'onboarding', label: 'Onboarding' },
  { key: 'leaves', label: 'Leave & Attendance' },
  { key: 'payroll', label: 'Payroll & Tax' },
  { key: 'assets', label: 'Asset Inventory' },
  { key: 'helpdesk', label: 'HR Helpdesk' },
  { key: 'permissions', label: 'Permissions' },
  { key: 'gsync', label: 'Google Sync' },
  { key: 'settings', label: 'Settings' },
  { key: 'audit', label: 'Audit Log' },
  { key: 'reports', label: 'Reports' }
];

export const CAPS = [
  { key: 'createUsers', label: 'Create / manage users' },
  { key: 'approveLeaves', label: 'Approve leaves' },
  { key: 'accessFinancials', label: 'Access financials' },
  { key: 'manageHierarchy', label: 'Manage hierarchy' },
  { key: 'moderateHelpdesk', label: 'Moderate helpdesk' }
];

export const BASE_MODULES = ['dashboard', 'leaves', 'helpdesk', 'settings'];

export function parsePerms(raw) {
  try { return typeof raw === 'string' ? JSON.parse(raw || '{}') : (raw || {}); }
  catch { return {}; }
}

// Effective permissions for a user (admin holds everything).
export function effective(user) {
  if (!user) return { modules: [], caps: {} };
  if (user.role === 'admin') {
    return { modules: MODULES.map(m => m.key), caps: Object.fromEntries(CAPS.map(c => [c.key, true])), admin: true };
  }
  const p = parsePerms(user.permissions);
  const stored = Array.isArray(p.modules) ? p.modules : [];
  const modules = Array.from(new Set([...BASE_MODULES, ...stored]));
  return { modules, caps: p.caps || {} };
}

export const hasModule = (user, key) => effective(user).modules.includes(key);
export const hasCap = (user, cap) => !!effective(user).caps[cap];
