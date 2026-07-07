import { create } from 'zustand';

// Authenticated mutating request: sends the CSRF header the backend requires
// on state-changing /api routes (see middleware/auth.js requireCsrfHeader).
async function apiMutate(url, method, body) {
  const res = await fetch(url, {
    method,
    credentials: 'include',
    headers: { 'Content-Type': 'application/json', 'X-Requested-With': 'XMLHttpRequest' },
    body: body ? JSON.stringify(body) : undefined
  });
  if (!res.ok) throw new Error((await res.json().catch(() => ({}))).error || 'Request failed');
  return res.status === 204 ? null : res.json();
}

async function apiGet(url) {
  const res = await fetch(url, { credentials: 'include' });
  if (!res.ok) throw new Error('Request failed');
  return res.json();
}

const useStore = create((set, get) => ({
  user: null,
  activeView: 'dashboard',
  stats: null,
  employees: [],
  leaves: [],
  leaveBalances: [],
  assets: [],
  tickets: [],
  payroll: [],
  tax: null,
  gsync: { drive: [], sheets: [], gmail: [] },
  grantable: null,
  docConfig: [],
  notifications: [],
  attendance: [],
  regularizations: [],
  holidays: [],
  cycles: [],
  auditRows: [],
  report: null,

  setUser: (user) => set({ user }),
  setActiveView: (view) => set({ activeView: view }),
  apiMutate,

  // ---- Fetchers ----
  fetchDashboardStats: async () => { try { set({ stats: await apiGet('/api/dashboard/stats') }); } catch (e) { console.error(e); } },
  fetchEmployees: async (includeInactive) => { try { set({ employees: await apiGet(`/api/employees${includeInactive ? '?includeInactive=1' : ''}`) }); } catch (e) { console.error(e); } },
  fetchLeaves: async () => { try { set({ leaves: await apiGet('/api/leaves') }); } catch (e) { console.error(e); } },
  fetchLeaveBalances: async () => { try { set({ leaveBalances: await apiGet('/api/leave-balances') }); } catch (e) { console.error(e); } },
  fetchAssets: async () => { try { set({ assets: await apiGet('/api/assets') }); } catch (e) { console.error(e); } },
  fetchTickets: async () => { try { set({ tickets: await apiGet('/api/helpdesk') }); } catch (e) { console.error(e); } },
  fetchPayroll: async () => { try { set({ payroll: await apiGet('/api/payroll') }); } catch (e) { console.error(e); } },
  fetchTax: async () => { try { set({ tax: await apiGet('/api/tax') }); } catch (e) { console.error(e); } },
  fetchGsync: async (kind) => {
    try {
      const rows = await apiGet(`/api/gsync/${kind}`);
      set({ gsync: { ...get().gsync, [kind]: rows } });
    } catch (e) { console.error(e); }
  },

  // ---- Employee management ----
  addEmployee: async (emp) => { const e = await apiMutate('/api/employees', 'POST', emp); await get().fetchEmployees(); return e; },
  updateEmployee: async (id, fields) => { await apiMutate(`/api/employees/${id}`, 'PUT', fields); await get().fetchEmployees(); },
  deleteEmployee: async (id) => { await apiMutate(`/api/employees/${id}`, 'DELETE'); await get().fetchEmployees(); },
  updateSelf: async (fields) => {
    await apiMutate('/api/me', 'PUT', fields);
    await get().fetchEmployees();
    const me = await apiGet('/auth/me');
    if (me.user) set({ user: me.user });
  },
  updatePermissions: async (id, permissions) => { await apiMutate(`/api/employees/${id}/permissions`, 'PUT', { permissions }); await get().fetchEmployees(); },
  fetchGrantable: async () => { try { set({ grantable: await apiGet('/api/permissions/grantable') }); } catch (e) { console.error(e); } },

  // ---- Leave management ----
  createLeave: async (leave) => { await apiMutate('/api/leaves', 'POST', leave); await get().fetchLeaves(); await get().fetchLeaveBalances(); },
  setLeaveStatus: async (id, status) => { await apiMutate(`/api/leaves/${id}/status`, 'PUT', { status }); await get().fetchLeaves(); await get().fetchLeaveBalances(); },
  approveLeave: async (id) => { await apiMutate(`/api/leaves/${id}/approve`, 'PUT'); await get().fetchLeaves(); await get().fetchLeaveBalances(); },
  rejectLeave: async (id) => { await apiMutate(`/api/leaves/${id}/reject`, 'PUT'); await get().fetchLeaves(); await get().fetchLeaveBalances(); },
  updateLeaveBalance: async (id, balance) => { await apiMutate(`/api/leave-balances/${id}`, 'PUT', balance); await get().fetchLeaveBalances(); },

  // ---- Assets ----
  assignAsset: async (asset) => { await apiMutate('/api/assets', 'POST', asset); await get().fetchAssets(); },
  confirmAsset: async (id) => { await apiMutate(`/api/assets/${id}/confirm`, 'PUT'); await get().fetchAssets(); },
  updateAsset: async (id, fields) => { await apiMutate(`/api/assets/${id}`, 'PUT', fields); await get().fetchAssets(); },
  deleteAsset: async (id) => { await apiMutate(`/api/assets/${id}`, 'DELETE'); await get().fetchAssets(); },

  // ---- Helpdesk / Payroll / Tax ----
  createTicket: async (ticket) => { await apiMutate('/api/helpdesk', 'POST', ticket); await get().fetchTickets(); },
  replyTicket: async (id, text, resolve) => { await apiMutate(`/api/helpdesk/${id}/replies`, 'POST', { text, resolve }); await get().fetchTickets(); },
  processPayroll: async (month) => { await apiMutate('/api/payroll/process', 'POST', { month }); await get().fetchPayroll(); },
  saveTax: async (decl) => { const t = await apiMutate('/api/tax', 'POST', decl); set({ tax: t }); },

  // ---- Onboarding workflow ----
  refreshMe: async () => { const me = await apiGet('/auth/me'); if (me.user) set({ user: me.user }); return me.user; },
  fetchDocConfig: async () => { try { set({ docConfig: await apiGet('/api/onboarding/doc-config') }); } catch (e) { console.error(e); } },
  saveMyOnboarding: async (fields) => { await apiMutate('/api/me/onboarding', 'PUT', fields); await get().refreshMe(); },
  submitMyOnboarding: async () => { await apiMutate('/api/me/onboarding/submit', 'POST'); await get().refreshMe(); },
  updateEmployeeOnboarding: async (id, fields) => { await apiMutate(`/api/employees/${id}/onboarding`, 'PUT', fields); await get().fetchEmployees(); },
  onboardingAction: async (id, action, note) => { await apiMutate(`/api/employees/${id}/onboarding/${action}`, 'POST', note ? { note } : undefined); await get().fetchEmployees(); },
  toggleDocRequirement: async (key, required) => { await apiMutate(`/api/onboarding/doc-config/${key}`, 'PUT', { required }); await get().fetchDocConfig(); },

  // ---- Notifications (in-app) ----
  fetchNotifications: async () => { try { set({ notifications: await apiGet('/api/notifications') }); } catch (e) { console.error(e); } },
  markRead: async (id) => { await apiMutate(`/api/notifications/${id}/read`, 'PUT'); await get().fetchNotifications(); },
  markAllRead: async () => { await apiMutate('/api/notifications/read-all', 'PUT'); await get().fetchNotifications(); },

  // ---- Attendance ----
  fetchAttendance: async (q = '') => { try { set({ attendance: await apiGet(`/api/attendance${q}`) }); } catch (e) { console.error(e); } },
  clockIn: async () => { await apiMutate('/api/attendance/clock-in', 'POST'); await get().fetchAttendance(); },
  clockOut: async () => { await apiMutate('/api/attendance/clock-out', 'POST'); await get().fetchAttendance(); },
  regularize: async (body) => { await apiMutate('/api/attendance/regularize', 'POST', body); await get().fetchRegularizations(); },
  fetchRegularizations: async () => { try { set({ regularizations: await apiGet('/api/regularizations') }); } catch (e) { console.error(e); } },
  decideRegularization: async (id, approve) => {
    await apiMutate(`/api/regularizations/${id}/${approve ? 'approve' : 'reject'}`, 'PUT');
    await get().fetchRegularizations(); await get().fetchAttendance();
  },

  // ---- Holidays / payroll cycles / leave cancel ----
  fetchHolidays: async () => { try { set({ holidays: await apiGet('/api/holidays') }); } catch (e) { console.error(e); } },
  addHoliday: async (h) => { await apiMutate('/api/holidays', 'POST', h); await get().fetchHolidays(); },
  removeHoliday: async (id) => { await apiMutate(`/api/holidays/${id}`, 'DELETE'); await get().fetchHolidays(); },
  cancelLeave: async (id) => { await apiMutate(`/api/leaves/${id}/cancel`, 'PUT'); await get().fetchLeaves(); await get().fetchLeaveBalances(); },
  fetchCycles: async () => { try { set({ cycles: await apiGet('/api/payroll/cycles') }); } catch (e) { console.error(e); } },
  finalizePayroll: async (month) => { await apiMutate('/api/payroll/finalize', 'POST', { month }); await get().fetchCycles(); },

  // ---- Lifecycle / hierarchy ----
  deactivateEmployee: async (id) => { await apiMutate(`/api/employees/${id}/deactivate`, 'PUT'); await get().fetchEmployees(); },
  setManager: async (id, managerId) => { await apiMutate(`/api/employees/${id}/manager`, 'PUT', { managerId }); await get().fetchEmployees(); },
  assignAssetTo: async (id, employeeId) => { await apiMutate(`/api/assets/${id}/assign`, 'PUT', { employeeId }); await get().fetchAssets(); },
  setTicketStatus: async (id, status) => { await apiMutate(`/api/helpdesk/${id}/status`, 'PUT', { status }); await get().fetchTickets(); },

  // ---- Audit & reports ----
  fetchAudit: async (q = '') => { try { set({ auditRows: await apiGet(`/api/audit${q}`) }); } catch (e) { console.error(e); } },
  fetchReport: async (kind) => { try { set({ report: await apiGet(`/api/reports/${kind}`) }); } catch (e) { console.error(e); } },

  // ---- Passwords ----
  changePassword: async (currentPassword, newPassword) => { await apiMutate('/api/me/password', 'PUT', { currentPassword, newPassword }); },
  resetPassword: async (id, newPassword) => { await apiMutate(`/api/employees/${id}/password`, 'PUT', { newPassword }); },

  // ---- Real document upload (multipart; CSRF header still required) ----
  uploadDoc: async (empId, docKey, file) => {
    const fd = new FormData();
    fd.append('file', file);
    const res = await fetch(`/api/files/${empId}/${docKey}`, {
      method: 'POST',
      credentials: 'include',
      headers: { 'X-Requested-With': 'XMLHttpRequest' },
      body: fd
    });
    if (!res.ok) throw new Error((await res.json().catch(() => ({}))).error || 'Upload failed');
    return res.json();
  },

  // ---- Settings ----
  savePreferences: async (preferences) => { await apiMutate('/api/me/preferences', 'PUT', { preferences }); }
}));

export default useStore;
