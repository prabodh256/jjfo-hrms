import { create } from 'zustand';
import { apiGet, apiMutate, apiUpload } from './api';
import { toastError, toastSuccess } from './toast';

async function safe(fn, errMsg) {
  try {
    return await fn();
  } catch (e) {
    console.error(e);
    toastError(e.message || errMsg || 'Request failed');
    throw e;
  }
}

const useStore = create((set, get) => ({
  user: null,
  activeView: 'dashboard',
  loading: false,
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
  searchResults: null,
  companySettings: null,

  setUser: (user) => set({ user }),
  setActiveView: (view) => set({ activeView: view }),
  apiMutate,

  // ---- Fetchers ----
  fetchDashboardStats: async () => {
    try { set({ stats: await apiGet('/api/dashboard/stats') }); }
    catch (e) { console.error(e); }
  },
  fetchEmployees: async (includeInactive) => {
    try {
      const data = await apiGet(`/api/employees${includeInactive ? '?includeInactive=1' : ''}`);
      set({ employees: Array.isArray(data) ? data : (data?.data || []) });
    } catch (e) { console.error(e); }
  },
  fetchLeaves: async () => {
    try { set({ leaves: await apiGet('/api/leaves') }); }
    catch (e) { console.error(e); }
  },
  fetchLeaveBalances: async () => {
    try { set({ leaveBalances: await apiGet('/api/leave-balances') }); }
    catch (e) { console.error(e); }
  },
  fetchAssets: async () => {
    try { set({ assets: await apiGet('/api/assets') }); }
    catch (e) { console.error(e); }
  },
  fetchTickets: async () => {
    try { set({ tickets: await apiGet('/api/helpdesk') }); }
    catch (e) { console.error(e); }
  },
  fetchPayroll: async () => {
    try { set({ payroll: await apiGet('/api/payroll') }); }
    catch (e) { console.error(e); }
  },
  fetchTax: async () => {
    try { set({ tax: await apiGet('/api/tax') }); }
    catch (e) { console.error(e); }
  },
  fetchGsync: async (kind) => {
    try {
      const rows = await apiGet(`/api/gsync/${kind}`);
      set({ gsync: { ...get().gsync, [kind]: rows } });
    } catch (e) { console.error(e); }
  },

  // ---- Employee management ----
  addEmployee: async (emp) => {
    const e = await safe(() => apiMutate('/api/employees', 'POST', emp), 'Failed to add employee');
    toastSuccess('Employee created');
    await get().fetchEmployees();
    return e;
  },
  updateEmployee: async (id, fields) => {
    await safe(() => apiMutate(`/api/employees/${id}`, 'PUT', fields));
    toastSuccess('Employee updated');
    await get().fetchEmployees();
  },
  deleteEmployee: async (id) => {
    // Prefer deactivate; hard delete only if UI sends confirm (smoke/tests).
    await safe(() => apiMutate(`/api/employees/${id}/deactivate`, 'PUT'));
    toastSuccess('Employee deactivated');
    await get().fetchEmployees();
  },
  updateSelf: async (fields) => {
    await safe(() => apiMutate('/api/me', 'PUT', fields));
    toastSuccess('Profile saved');
    await get().fetchEmployees();
    const me = await apiGet('/auth/me');
    if (me.user) set({ user: me.user });
  },
  updatePermissions: async (id, permissions) => {
    const res = await safe(() => apiMutate(`/api/employees/${id}/permissions`, 'PUT', { permissions }));
    if (res?.escalated) toastSuccess('Escalated for stamp');
    else toastSuccess('Permissions stamped & applied');
    await get().fetchEmployees();
    return res;
  },
  fetchGrantable: async () => {
    try { set({ grantable: await apiGet('/api/permissions/grantable') }); }
    catch (e) { console.error(e); }
  },
  permRequests: [],
  fetchPermRequests: async () => {
    try { set({ permRequests: await apiGet('/api/permissions/requests') }); }
    catch (e) { console.error(e); set({ permRequests: [] }); }
  },
  decidePermRequest: async (id, approve, note) => {
    await safe(() => apiMutate(`/api/permissions/requests/${id}/decide`, 'PUT', { approve, note }));
    toastSuccess(approve ? 'Stamped approved' : 'Rejected');
    await get().fetchPermRequests();
    await get().fetchEmployees();
  },

  // ---- Leave management ----
  createLeave: async (leave) => {
    await safe(() => apiMutate('/api/leaves', 'POST', leave), 'Leave request failed');
    toastSuccess('Leave submitted');
    await get().fetchLeaves();
    await get().fetchLeaveBalances();
  },
  setLeaveStatus: async (id, status) => {
    await apiMutate(`/api/leaves/${id}/status`, 'PUT', { status });
    await get().fetchLeaves();
    await get().fetchLeaveBalances();
  },
  approveLeave: async (id, note) => {
    await safe(() => apiMutate(`/api/leaves/${id}/approve`, 'PUT', note ? { note } : {}));
    toastSuccess('Leave approved');
    await get().fetchLeaves();
    await get().fetchLeaveBalances();
  },
  rejectLeave: async (id, note) => {
    await safe(() => apiMutate(`/api/leaves/${id}/reject`, 'PUT', note ? { note } : {}));
    toastSuccess('Leave rejected');
    await get().fetchLeaves();
    await get().fetchLeaveBalances();
  },
  updateLeaveBalance: async (id, balance) => {
    await apiMutate(`/api/leave-balances/${id}`, 'PUT', balance);
    await get().fetchLeaveBalances();
  },
  bulkLeaveAllotment: async (payload) => {
    const res = await safe(() => apiMutate('/api/leave-balances/bulk', 'POST', payload));
    toastSuccess(`Updated ${res?.updated || 0} employee(s)`);
    await get().fetchLeaveBalances();
    return res;
  },

  // ---- Assets ----
  assignAsset: async (asset) => {
    await safe(() => apiMutate('/api/assets', 'POST', asset));
    toastSuccess('Asset saved');
    await get().fetchAssets();
  },
  confirmAsset: async (id) => {
    await apiMutate(`/api/assets/${id}/confirm`, 'PUT');
    await get().fetchAssets();
  },
  updateAsset: async (id, fields) => {
    await apiMutate(`/api/assets/${id}`, 'PUT', fields);
    await get().fetchAssets();
  },
  deleteAsset: async (id) => {
    await apiMutate(`/api/assets/${id}`, 'DELETE');
    await get().fetchAssets();
  },

  // ---- Helpdesk / Payroll / Tax ----
  createTicket: async (ticket) => {
    await safe(() => apiMutate('/api/helpdesk', 'POST', ticket));
    toastSuccess('Ticket created');
    await get().fetchTickets();
  },
  replyTicket: async (id, text, resolve) => {
    await apiMutate(`/api/helpdesk/${id}/replies`, 'POST', { text, resolve });
    await get().fetchTickets();
  },
  processPayroll: async (month) => {
    await safe(() => apiMutate('/api/payroll/process', 'POST', { month }));
    toastSuccess('Payroll processed');
    await get().fetchPayroll();
  },
  saveTax: async (decl) => {
    const t = await apiMutate('/api/tax', 'POST', decl);
    set({ tax: t });
    toastSuccess('Tax declaration saved');
  },

  // ---- Onboarding workflow ----
  refreshMe: async () => {
    const me = await apiGet('/auth/me');
    if (me.user) set({ user: me.user });
    return me.user;
  },
  fetchDocConfig: async () => {
    try { set({ docConfig: await apiGet('/api/onboarding/doc-config') }); }
    catch (e) { console.error(e); }
  },
  saveMyOnboarding: async (fields) => {
    await apiMutate('/api/me/onboarding', 'PUT', fields);
    await get().refreshMe();
  },
  submitMyOnboarding: async () => {
    await safe(() => apiMutate('/api/me/onboarding/submit', 'POST'));
    toastSuccess('Onboarding submitted');
    await get().refreshMe();
  },
  updateEmployeeOnboarding: async (id, fields) => {
    await apiMutate(`/api/employees/${id}/onboarding`, 'PUT', fields);
    await get().fetchEmployees();
  },
  onboardingAction: async (id, action, note) => {
    await apiMutate(`/api/employees/${id}/onboarding/${action}`, 'POST', note ? { note } : undefined);
    await get().fetchEmployees();
  },
  toggleDocRequirement: async (key, required) => {
    await apiMutate(`/api/onboarding/doc-config/${key}`, 'PUT', { required });
    await get().fetchDocConfig();
  },

  // ---- Notifications (in-app) ----
  fetchNotifications: async () => {
    try {
      const data = await apiGet('/api/notifications');
      set({ notifications: Array.isArray(data) ? data : (data?.data || []) });
    } catch (e) { console.error(e); }
  },
  markRead: async (id) => {
    await apiMutate(`/api/notifications/${id}/read`, 'PUT');
    await get().fetchNotifications();
  },
  markAllRead: async () => {
    await apiMutate('/api/notifications/read-all', 'PUT');
    await get().fetchNotifications();
  },

  // ---- Attendance ----
  fetchAttendance: async (q = '') => {
    try { set({ attendance: await apiGet(`/api/attendance${q}`) }); }
    catch (e) { console.error(e); }
  },
  clockIn: async () => {
    await safe(() => apiMutate('/api/attendance/clock-in', 'POST'));
    toastSuccess('Clocked in');
    await get().fetchAttendance();
  },
  clockOut: async () => {
    await safe(() => apiMutate('/api/attendance/clock-out', 'POST'));
    toastSuccess('Clocked out');
    await get().fetchAttendance();
  },
  regularize: async (body) => {
    await apiMutate('/api/attendance/regularize', 'POST', body);
    await get().fetchRegularizations();
  },
  fetchRegularizations: async () => {
    try { set({ regularizations: await apiGet('/api/regularizations') }); }
    catch (e) { console.error(e); }
  },
  decideRegularization: async (id, approve) => {
    await apiMutate(`/api/regularizations/${id}/${approve ? 'approve' : 'reject'}`, 'PUT');
    await get().fetchRegularizations();
    await get().fetchAttendance();
  },

  // ---- Holidays / payroll cycles / leave cancel ----
  fetchHolidays: async () => {
    try { set({ holidays: await apiGet('/api/holidays') }); }
    catch (e) { console.error(e); }
  },
  addHoliday: async (h) => {
    await apiMutate('/api/holidays', 'POST', h);
    await get().fetchHolidays();
  },
  removeHoliday: async (id) => {
    await apiMutate(`/api/holidays/${id}`, 'DELETE');
    await get().fetchHolidays();
  },
  cancelLeave: async (id, note) => {
    await apiMutate(`/api/leaves/${id}/cancel`, 'PUT', note ? { note } : undefined);
    await get().fetchLeaves();
    await get().fetchLeaveBalances();
  },
  fetchCycles: async () => {
    try { set({ cycles: await apiGet('/api/payroll/cycles') }); }
    catch (e) { console.error(e); }
  },
  finalizePayroll: async (month) => {
    await safe(() => apiMutate('/api/payroll/finalize', 'POST', { month }));
    toastSuccess('Payroll finalized');
    await get().fetchCycles();
  },

  // ---- Lifecycle / hierarchy ----
  deactivateEmployee: async (id) => {
    await safe(() => apiMutate(`/api/employees/${id}/deactivate`, 'PUT'));
    toastSuccess('Employee deactivated');
    await get().fetchEmployees();
  },
  setManager: async (id, managerId) => {
    await apiMutate(`/api/employees/${id}/manager`, 'PUT', { managerId });
    await get().fetchEmployees();
  },
  assignAssetTo: async (id, employeeId) => {
    await apiMutate(`/api/assets/${id}/assign`, 'PUT', { employeeId });
    await get().fetchAssets();
  },
  setTicketStatus: async (id, status) => {
    await apiMutate(`/api/helpdesk/${id}/status`, 'PUT', { status });
    await get().fetchTickets();
  },

  // ---- Audit & reports ----
  fetchAudit: async (q = '') => {
    try {
      const data = await apiGet(`/api/audit${q}`);
      set({ auditRows: Array.isArray(data) ? data : (data?.data || []) });
    } catch (e) { console.error(e); }
  },
  fetchReport: async (kind) => {
    try { set({ report: await apiGet(`/api/reports/${kind}`) }); }
    catch (e) { console.error(e); }
  },

  // ---- Passwords ----
  changePassword: async (currentPassword, newPassword) => {
    await safe(() => apiMutate('/api/me/password', 'PUT', { currentPassword, newPassword }));
    toastSuccess('Password changed — please sign in again');
  },
  resetPassword: async (id, newPassword) => {
    await safe(() => apiMutate(`/api/employees/${id}/password`, 'PUT', { newPassword }));
    toastSuccess('Password reset');
  },

  // ---- Real document upload ----
  uploadDoc: async (empId, docKey, file) => {
    const fd = new FormData();
    fd.append('file', file);
    const res = await apiUpload(`/api/files/${empId}/${docKey}`, fd);
    toastSuccess('Document uploaded');
    return res;
  },

  // ---- Settings ----
  savePreferences: async (preferences) => {
    await apiMutate('/api/me/preferences', 'PUT', { preferences });
    toastSuccess('Preferences saved');
  },
  fetchCompanySettings: async () => {
    try { set({ companySettings: await apiGet('/api/settings/company') }); }
    catch (e) { console.error(e); }
  },
  saveCompanySettings: async (fields) => {
    const s = await apiMutate('/api/settings/company', 'PUT', fields);
    set({ companySettings: s });
    toastSuccess('Company settings saved');
  },

  // ---- Global search ----
  globalSearch: async (q) => {
    if (!q || q.trim().length < 2) {
      set({ searchResults: null });
      return null;
    }
    try {
      const results = await apiGet(`/api/search?q=${encodeURIComponent(q.trim())}`);
      set({ searchResults: results });
      return results;
    } catch (e) {
      console.error(e);
      return null;
    }
  },
  clearSearch: () => set({ searchResults: null }),

  // HR docs + resignation workflows
  hrDocs: [],
  resignations: [],
  orgMe: null,
  fetchHrDocs: async (all) => {
    try { set({ hrDocs: await apiGet(`/api/hr-documents${all ? '?all=1' : ''}`) }); }
    catch (e) { console.error(e); }
  },
  issueHrDoc: async (body) => {
    const d = await safe(() => apiMutate('/api/hr-documents', 'POST', body));
    await get().fetchHrDocs(true);
    return d;
  },
  signHrDoc: async (id) => {
    await safe(() => apiMutate(`/api/hr-documents/${id}/sign`, 'POST'));
    await get().fetchHrDocs(true);
  },
  fetchResignations: async () => {
    try { set({ resignations: await apiGet('/api/resignations') }); }
    catch (e) { console.error(e); }
  },
  submitResignation: async (body) => {
    await safe(() => apiMutate('/api/resignations', 'POST', body));
    await get().fetchResignations();
  },
  decideResignation: async (id, action, note) => {
    await safe(() => apiMutate(`/api/resignations/${id}/decide`, 'PUT', { action, note }));
    await get().fetchResignations();
  },
  fetchOrgMe: async () => {
    try { set({ orgMe: await apiGet('/api/org/me') }); }
    catch (e) { console.error(e); }
  },

  // ESS: expenses, surveys, policies, form16, celebrations
  expenses: [],
  surveys: [],
  policies: [],
  form16List: [],
  celebrations: null,

  fetchExpenses: async () => {
    try { set({ expenses: await apiGet('/api/expenses') }); } catch (e) { console.error(e); }
  },
  submitExpense: async (body) => {
    await safe(() => apiMutate('/api/expenses', 'POST', body));
    toastSuccess('Expense submitted');
    await get().fetchExpenses();
  },
  decideExpense: async (id, approve, note) => {
    await safe(() => apiMutate(`/api/expenses/${id}/decide`, 'PUT', { approve, note }));
    toastSuccess(approve ? 'Expense approved' : 'Expense rejected');
    await get().fetchExpenses();
  },
  fetchSurveys: async () => {
    try { set({ surveys: await apiGet('/api/surveys') }); } catch (e) { console.error(e); }
  },
  createSurvey: async (body) => {
    await safe(() => apiMutate('/api/surveys', 'POST', body));
    await get().fetchSurveys();
  },
  respondSurvey: async (id, answers) => {
    await safe(() => apiMutate(`/api/surveys/${id}/respond`, 'POST', { answers }));
    toastSuccess('Survey submitted');
    await get().fetchSurveys();
  },
  fetchPolicies: async () => {
    try { set({ policies: await apiGet('/api/policies') }); } catch (e) { console.error(e); }
  },
  publishPolicy: async (body) => {
    await safe(() => apiMutate('/api/policies', 'POST', body));
    await get().fetchPolicies();
  },
  ackPolicy: async (id) => {
    await safe(() => apiMutate(`/api/policies/${id}/ack`, 'POST'));
    toastSuccess('Acknowledged');
    await get().fetchPolicies();
  },
  fetchForm16: async () => {
    try { set({ form16List: await apiGet('/api/form16') }); } catch (e) { console.error(e); }
  },
  issueForm16: async (financialYear) => {
    await safe(() => apiMutate('/api/form16/issue', 'POST', { financialYear }));
    toastSuccess('Form 16 issued');
    await get().fetchForm16();
  },
  downloadPayslipPdf: (id) => {
    window.open(`/api/payroll/${id}/pdf`, '_blank');
  },
  downloadForm16Pdf: (id) => {
    window.open(`/api/form16/${id}/pdf`, '_blank');
  },
  fetchCelebrations: async () => {
    try { set({ celebrations: await apiGet('/api/celebrations') }); } catch (e) { console.error(e); }
  }
}));

export default useStore;
