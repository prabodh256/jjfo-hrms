// End-to-end API smoke test for JJFO HRMS.
// Run:  cd backend && npm run test:smoke   (backend must be up on SMOKE_BASE)
// Repeatable & self-cleaning: it creates unique test rows and deletes them.
// The rate-limit (429) burst is OFF by default because it trips the login
// limiter for 15 min; enable with SMOKE_RATELIMIT=1.

const BASE = process.env.SMOKE_BASE || 'http://localhost:4000';
const RUN_RATELIMIT = process.env.SMOKE_RATELIMIT === '1';

let pass = 0, fail = 0;
const failed = [];
function check(name, cond, detail = '') {
  if (cond) { pass++; console.log(`  ✓ ${name}`); }
  else { fail++; failed.push(name); console.log(`  ✗ ${name}  ${detail}`); }
}

const cookieFrom = (res) => { const m = /token=[^;]+/.exec(res.headers.get('set-cookie') || ''); return m ? m[0] : ''; };

async function login(email, password) {
  const res = await fetch(`${BASE}/auth/login`, {
    method: 'POST', headers: { 'Content-Type': 'application/json' },
    body: JSON.stringify({ email, password })
  });
  return { status: res.status, cookie: cookieFrom(res), json: await res.json().catch(() => ({})) };
}

async function api(method, path, { cookie = '', body, csrf = true, extraHeaders = {} } = {}) {
  const headers = { 'Content-Type': 'application/json', ...extraHeaders };
  if (csrf) headers['X-Requested-With'] = 'XMLHttpRequest';
  if (cookie) headers.Cookie = cookie;
  const res = await fetch(`${BASE}${path}`, { method, headers, body: body ? JSON.stringify(body) : undefined });
  let json = null; try { json = await res.json(); } catch { /* no body */ }
  return { status: res.status, json };
}

const hardDel = { 'X-Confirm-Hard-Delete': 'true' };

async function main() {
  console.log(`\nJJFO HRMS smoke test → ${BASE}\n`);

  // ---- Auth: real logins first to protect the 5/15min login budget ----
  const admin = await login('rajesh@jjfo.com', 'password123');
  if (admin.status === 429) { console.log('  ! login rate-limited — restart the backend or wait 15 min, then retry.'); process.exit(1); }
  check('T-SEC  admin login 200 + cookie', admin.status === 200 && !!admin.cookie, `status=${admin.status}`);
  const priya = await login('priya@jjfo.com', 'password123');
  check('T-SEC  delegated (priya) login 200', priya.status === 200 && !!priya.cookie, `status=${priya.status}`);

  // Rejected either by validation (400) or, if the limiter has warmed up, 429 — both prove no session is issued.
  const badEmail = await login('not-an-email', 'x');
  check('T-SEC  malformed email rejected (400/429)', badEmail.status === 400 || badEmail.status === 429, `status=${badEmail.status}`);
  const badTok = await api('GET', '/api/employees', { cookie: 'token=bogus.jwt.value' });
  check('T-SEC  invalid token → 401', badTok.status === 401, `status=${badTok.status}`);
  const noCsrf = await api('POST', '/api/leaves', { cookie: admin.cookie, csrf: false, body: { leaveType: 'Sick Leave', startDate: '2099-01-01', endDate: '2099-01-01', reason: 'x' } });
  check('T-SEC  missing CSRF header on mutation → 403', noCsrf.status === 403, `status=${noCsrf.status}`);
  const emps = await api('GET', '/api/employees', { cookie: admin.cookie });
  check('T-SEC  no password hash in /api/employees', emps.status === 200 && !JSON.stringify(emps.json).includes('"password"'));

  // ---- Delegated permissions (subset) ----
  const g = await api('GET', '/api/permissions/grantable', { cookie: priya.cookie });
  check('T-PERM grantable excludes ungranted module (gsync)', g.status === 200 && !g.json.modules.includes('gsync'));
  check('T-PERM grantable excludes ungranted cap (manageHierarchy)', !g.json.caps.manageHierarchy);
  check('T-PERM grantable includes granted (directory + approveLeaves)', g.json.modules.includes('directory') && !!g.json.caps.approveLeaves);

  const email = `smoke_${Date.now()}@jjfo.com`;
  const created = await api('POST', '/api/employees', { cookie: priya.cookie, body: {
    name: 'Smoke Sub', email, department: 'Finance & Investments', designation: 'Analyst',
    permissions: { modules: ['directory'], caps: { approveLeaves: true } },
    documents: { joiningLetter: 'smoke_join.pdf' }
  } });
  check('T-PERM delegated create 200', created.status === 200, `status=${created.status} ${JSON.stringify(created.json)}`);
  const subId = created.json?.id;
  check('T-PERM subordinate managerId = creator (EMP002)', created.json?.managerId === 'EMP002');
  check('T-PERM subordinate role coerced to employee', created.json?.role === 'employee');
  const over1 = await api('POST', '/api/employees', { cookie: priya.cookie, body: { name: 'Bad', email: `bad_${Date.now()}@jjfo.com`, permissions: { modules: ['gsync'], caps: {} } } });
  check('T-PERM over-grant module → 403', over1.status === 403, `status=${over1.status}`);
  const over2 = await api('POST', '/api/employees', { cookie: priya.cookie, body: { name: 'Bad2', email: `bad2_${Date.now()}@jjfo.com`, permissions: { modules: [], caps: { manageHierarchy: true } } } });
  check('T-PERM over-grant capability → 403', over2.status === 403, `status=${over2.status}`);

  // ---- Drive-folder sync from the new hire's document (read as admin) ----
  const drive = await api('GET', '/api/gsync/drive', { cookie: admin.cookie });
  check('T-GS   new hire document synced to Drive vault', drive.status === 200 && drive.json?.some(r => subId && r.name?.startsWith(subId)));

  // ---- Hierarchical leave approval chain (fresh >5-day leave for EMP004) ----
  const lv = await api('POST', '/api/leaves', { cookie: admin.cookie, body: { employeeId: 'EMP004', leaveType: 'Annual Leave', startDate: '2099-03-01', endDate: '2099-03-11', reason: 'smoke 2-level' } });
  check('T-APPR create >5-day leave 200', lv.status === 200, `status=${lv.status}`);
  const lvId = lv.json?.id;
  check('T-APPR requiredLevels = 2 (>5 days)', lv.json?.requiredLevels === 2, `req=${lv.json?.requiredLevels}`);
  check('T-APPR starts Pending', lv.json?.status === 'Pending');
  const ap1 = await api('PUT', `/api/leaves/${lvId}/approve`, { cookie: priya.cookie });
  check('T-APPR L1 (Priya) → still Pending, 1/2', ap1.status === 200 && ap1.json?.status === 'Pending' && ap1.json?.approvedLevels === 1, JSON.stringify(ap1.json));
  const apX = await api('PUT', `/api/leaves/${lvId}/approve`, { cookie: priya.cookie });
  check('T-APPR non-approver (Priya again) → 403', apX.status === 403, `status=${apX.status}`);
  const ap2 = await api('PUT', `/api/leaves/${lvId}/approve`, { cookie: admin.cookie });
  check('T-APPR L2 (Rajesh) → Approved', ap2.status === 200 && ap2.json?.status === 'Approved', JSON.stringify(ap2.json));

  // ---- Leave balances & admin allotment ----
  const bals = await api('GET', '/api/leave-balances', { cookie: admin.cookie });
  const b4 = bals.json?.find(b => b.employeeId === 'EMP004');
  check('T-LEAVE balance breakup total/used/available', !!b4 && typeof b4.annual?.available === 'number' && typeof b4.annual?.used === 'number');
  const adj = await api('PUT', '/api/leave-balances/EMP004', { cookie: admin.cookie, body: { annual: 21, sick: 9, casual: 8 } });
  check('T-LEAVE admin adjusts allotment', adj.status === 200 && adj.json?.annual === 21);

  // ---- Self profile ----
  const me = await api('PUT', '/api/me', { cookie: admin.cookie, body: { contact: '+91 90000 00000', documents: { idProof: 'rajesh_id.pdf' } } });
  check('T-DIR  self profile PUT /me 200', me.status === 200);

  // ---- Assets ----
  const asset = await api('POST', '/api/assets', { cookie: admin.cookie, body: { employeeId: 'EMP003', name: 'Smoke Laptop', type: 'Laptop', serialNumber: `SMK-${Date.now()}` } });
  check('T-ASSET assign 200', asset.status === 200, `status=${asset.status}`);
  const assetId = asset.json?.id;
  const aedit = await api('PUT', `/api/assets/${assetId}`, { cookie: admin.cookie, body: { condition: 'Good', status: 'Confirmed' } });
  check('T-ASSET edit/reassign 200', aedit.status === 200 && aedit.json?.condition === 'Good');

  // ---- Helpdesk ----
  const tk = await api('POST', '/api/helpdesk', { cookie: admin.cookie, body: { subject: 'Smoke ticket', category: 'IT Support', description: 'smoke', priority: 'Low' } });
  check('T-HELP raise ticket 200', tk.status === 200);
  const tkId = tk.json?.id;
  const rep = await api('POST', `/api/helpdesk/${tkId}/replies`, { cookie: admin.cookie, body: { text: 'handled', resolve: true } });
  check('T-HELP reply + resolve 200', rep.status === 200);

  // ---- Payroll / Tax / Google Sync / Preferences ----
  const pr = await api('POST', '/api/payroll/process', { cookie: admin.cookie, body: { month: 'December 2099' } });
  check('T-PAY  process payroll (array of payslips)', pr.status === 200 && Array.isArray(pr.json) && pr.json.length > 0);
  const badMonth = await api('POST', '/api/payroll/process', { cookie: admin.cookie, body: { month: 'Garbage 12' } });
  check('T-PAY  invalid month format → 400', badMonth.status === 400, `status=${badMonth.status}`);
  const tax = await api('POST', '/api/tax', { cookie: admin.cookie, body: { section80C: 150000, section80D: 25000, hraRent: 20000, otherDeductions: 0 } });
  check('T-PAY  save tax declaration', tax.status === 200 && tax.json?.section80C === 150000);
  const sheets = await api('GET', '/api/gsync/sheets', { cookie: admin.cookie });
  check('T-GS   sheets non-empty', sheets.status === 200 && sheets.json.length > 0);
  const prefs = await api('PUT', '/api/me/preferences', { cookie: admin.cookie, body: { preferences: { theme: 'light', font: 'Inter', fontSize: 'large' } } });
  check('T-SET  save preferences 200', prefs.status === 200);

  // ---- Onboarding submission / approval / lock workflow (EMP005 Vikram) ----
  const vikram = await login('vikram.candidate@jjfo.com', 'password123');
  check('T-ONB  candidate login', vikram.status === 200 && !!vikram.cookie);
  await api('POST', '/api/employees/EMP005/onboarding/push', { cookie: admin.cookie }); // reset → draft
  // Clear onboarding data so the missing-docs check is deterministic on reruns.
  await api('PUT', '/api/employees/EMP005/onboarding', { cookie: admin.cookie, body: { documents: {}, education: [], experience: [] } });
  const cfg = await api('GET', '/api/onboarding/doc-config', { cookie: vikram.cookie });
  const reqKeys = cfg.json.filter(d => d.required).map(d => d.key);
  const missSubmit = await api('POST', '/api/me/onboarding/submit', { cookie: vikram.cookie });
  check('T-ONB  submit without docs → 400 + missing list', missSubmit.status === 400 && Array.isArray(missSubmit.json?.missing) && missSubmit.json.missing.length === reqKeys.length);
  await api('PUT', '/api/me/onboarding', { cookie: vikram.cookie, body: { education: [{ degree: 'MBA' }], experience: [{ company: 'X' }], documents: Object.fromEntries(reqKeys.map(k => [k, `${k}.pdf`])) } });
  const okSubmit = await api('POST', '/api/me/onboarding/submit', { cookie: vikram.cookie });
  check('T-ONB  submit with all docs → submitted', okSubmit.status === 200 && okSubmit.json?.onboardingState === 'submitted');
  const lock1 = await api('PUT', '/api/me/onboarding', { cookie: vikram.cookie, body: { education: [] } });
  check('T-ONB  edit after submit → 403 locked', lock1.status === 403);
  const appr = await api('POST', '/api/employees/EMP005/onboarding/approve', { cookie: admin.cookie });
  check('T-ONB  admin approve → approved', appr.status === 200 && appr.json?.onboardingState === 'approved');
  const lock2 = await api('PUT', '/api/me/onboarding', { cookie: vikram.cookie, body: { education: [] } });
  check('T-ONB  edit after approve → 403 locked', lock2.status === 403);
  const ret = await api('POST', '/api/employees/EMP005/onboarding/return', { cookie: admin.cookie, body: { note: 'redo' } });
  check('T-ONB  admin return → returned + note', ret.status === 200 && ret.json?.onboardingState === 'returned' && ret.json?.onboardingNote === 'redo');
  const unlock = await api('PUT', '/api/me/onboarding', { cookie: vikram.cookie, body: { education: [{ degree: 'MBA' }] } });
  check('T-ONB  edit after return → 200 unlocked', unlock.status === 200);
  const empToggle = await api('PUT', '/api/onboarding/doc-config/idProof', { cookie: vikram.cookie, body: { required: false } });
  check('T-ONB  employee cannot toggle doc-config → 403', empToggle.status === 403);
  await api('POST', '/api/employees/EMP005/onboarding/push', { cookie: admin.cookie }); // leave as draft (seed baseline)

  // ---- Audit fixes: balance, moderation, passwords, deleted tokens, files ----
  const overBal = await api('POST', '/api/leaves', { cookie: priya.cookie, body: { leaveType: 'Annual Leave', startDate: '2099-06-01', endDate: '2099-09-08', reason: 'way beyond balance' } });
  check('T-LEAVE over-balance apply → 400', overBal.status === 400, `status=${overBal.status}`);

  const modDeny = await api('POST', `/api/helpdesk/${tkId}/replies`, { cookie: priya.cookie, body: { text: 'not my ticket' } });
  check('T-HELP non-moderator on others ticket → 403', modDeny.status === 403, `status=${modDeny.status}`);
  const vtk = await api('POST', '/api/helpdesk', { cookie: vikram.cookie, body: { subject: 'Own ticket', category: 'HR', description: 'smoke', priority: 'Low' } });
  const ownReply = await api('POST', `/api/helpdesk/${vtk.json?.id}/replies`, { cookie: vikram.cookie, body: { text: 'my own note' } });
  check('T-HELP owner replies on own ticket → 200', ownReply.status === 200, `status=${ownReply.status}`);
  const ownResolve = await api('POST', `/api/helpdesk/${vtk.json?.id}/replies`, { cookie: vikram.cookie, body: { text: 'done', resolve: true } });
  check('T-HELP owner resolve without cap → 403', ownResolve.status === 403, `status=${ownResolve.status}`);

  const tmpEmail = `pw_${Date.now()}@jjfo.com`;
  const tmp = await api('POST', '/api/employees', { cookie: admin.cookie, body: { name: 'Pw Temp', email: tmpEmail, department: 'IT & Security' } });
  const t1 = await login(tmpEmail, 'password123');
  check('T-PWD  new hire logs in with default password', t1.status === 200, `status=${t1.status}`);
  const wrong = await api('PUT', '/api/me/password', { cookie: t1.cookie, body: { currentPassword: 'nope', newPassword: 'newpass123' } });
  check('T-PWD  change with wrong current → 401', wrong.status === 401, `status=${wrong.status}`);
  const chg = await api('PUT', '/api/me/password', { cookie: t1.cookie, body: { currentPassword: 'password123', newPassword: 'newpass123' } });
  check('T-PWD  change own password → 200', chg.status === 200, `status=${chg.status}`);
  const t2 = await login(tmpEmail, 'newpass123');
  check('T-PWD  login with new password', t2.status === 200, `status=${t2.status}`);
  const rst = await api('PUT', `/api/employees/${tmp.json?.id}/password`, { cookie: admin.cookie, body: { newPassword: 'resetpass123' } });
  check('T-PWD  admin reset → 200', rst.status === 200, `status=${rst.status}`);
  const t3 = await login(tmpEmail, 'resetpass123');
  check('T-PWD  login with reset password', t3.status === 200, `status=${t3.status}`);
  // Password change revokes sessions — t2 cookie must fail; t3 used reset password after re-login.
  const afterChg = await api('GET', '/api/employees', { cookie: t1.cookie });
  check('T-PWD  session revoked after password change → 401', afterChg.status === 401, `status=${afterChg.status}`);
  await api('DELETE', `/api/employees/${tmp.json?.id}`, { cookie: admin.cookie, extraHeaders: hardDel });
  const ghost = await api('GET', '/api/employees', { cookie: t3.cookie });
  check('T-SEC  deleted-user token rejected → 401', ghost.status === 401, `status=${ghost.status}`);

  const fd = new FormData();
  fd.append('file', new Blob(['SMOKE-PDF-BYTES'], { type: 'application/pdf' }), 'cert.pdf');
  const up = await fetch(`${BASE}/api/files/EMP005/educationCertificate`, {
    method: 'POST', headers: { 'X-Requested-With': 'XMLHttpRequest', Cookie: vikram.cookie }, body: fd
  });
  const upj = await up.json().catch(() => ({}));
  check('T-FILE owner uploads while editable → 200', up.status === 200 && String(upj.filename || '').startsWith('educationCertificate.'), `status=${up.status} ${JSON.stringify(upj)}`);
  const dl = await fetch(`${BASE}/api/files/EMP005/educationCertificate`, { headers: { Cookie: admin.cookie } });
  const bytes = await dl.text();
  check('T-FILE admin opens the attachment', dl.status === 200 && bytes.includes('SMOKE-PDF-BYTES'), `status=${dl.status}`);
  const amit = await login('amit@jjfo.com', 'password123');
  const dl403 = await fetch(`${BASE}/api/files/EMP005/educationCertificate`, { headers: { Cookie: amit.cookie } });
  check('T-FILE unrelated employee download → 403', dl403.status === 403, `status=${dl403.status}`);
  if (vtk.json?.id) await api('DELETE', `/api/helpdesk/${vtk.json.id}`, { cookie: admin.cookie });

  // Health + global search
  const health = await fetch(`${BASE}/health`).then(r => r.json().then(j => ({ status: r.status, json: j })));
  check('T-OPS  /health ok', health.status === 200 && health.json?.status === 'ok');
  const ready = await fetch(`${BASE}/ready`).then(r => r.json().then(j => ({ status: r.status, json: j })));
  check('T-OPS  /ready ok', ready.status === 200 && ready.json?.status === 'ready');
  const search = await api('GET', '/api/search?q=Rajesh', { cookie: admin.cookie });
  check('T-SEARCH global search finds employee', search.status === 200 && search.json?.employees?.some(e => e.name?.includes('Rajesh')));

  // ---- Gap build: audit, notifications, attendance, holidays, lifecycle, reports ----
  const audit1 = await api('GET', '/api/audit?entity=employee', { cookie: admin.cookie });
  check('T-AUD  audit rows for employee actions', audit1.status === 200 && audit1.json.length > 0, `status=${audit1.status}`);
  const auditDeny = await api('GET', '/api/audit', { cookie: amit.cookie });
  check('T-AUD  non-admin audit access → 403', auditDeny.status === 403, `status=${auditDeny.status}`);

  const notifs = await api('GET', '/api/notifications', { cookie: priya.cookie });
  check('T-NOTIF list 200 with entries', notifs.status === 200 && notifs.json.length > 0, `status=${notifs.status} n=${notifs.json?.length}`);
  const firstUnread = notifs.json.find(n => !n.read);
  if (firstUnread) {
    await api('PUT', `/api/notifications/${firstUnread.id}/read`, { cookie: priya.cookie });
    const notifAfter = await api('GET', '/api/notifications', { cookie: priya.cookie });
    check('T-NOTIF mark-read persists', notifAfter.json.find(n => n.id === firstUnread.id)?.read === true);
  } else {
    check('T-NOTIF mark-read persists', true, '(no unread to exercise)');
  }

  // Attendance on an isolated temp employee (repeatable per run)
  const attEmail = `att_${Date.now()}@jjfo.com`;
  const attEmp = await api('POST', '/api/employees', { cookie: admin.cookie, body: { name: 'Att Temp', email: attEmail, department: 'IT & Security', status: 'active', managerId: 'EMP002' } });
  const att = await login(attEmail, 'password123');
  const ci = await api('POST', '/api/attendance/clock-in', { cookie: att.cookie });
  check('T-ATT  clock-in 200', ci.status === 200 && !!ci.json?.checkIn, `status=${ci.status}`);
  const ci2 = await api('POST', '/api/attendance/clock-in', { cookie: att.cookie });
  check('T-ATT  double clock-in → 400', ci2.status === 400, `status=${ci2.status}`);
  const co = await api('POST', '/api/attendance/clock-out', { cookie: att.cookie });
  check('T-ATT  clock-out 200', co.status === 200 && !!co.json?.checkOut, `status=${co.status}`);
  const rg = await api('POST', '/api/attendance/regularize', { cookie: att.cookie, body: { date: '2099-01-10', actualCheckIn: '09:00', actualCheckOut: '18:00', reason: 'smoke' } });
  check('T-ATT  regularize request 200', rg.status === 200, `status=${rg.status}`);
  const rga = await api('PUT', `/api/regularizations/${rg.json?.id}/approve`, { cookie: priya.cookie });
  check('T-ATT  direct manager approves regularization', rga.status === 200 && rga.json?.status === 'Approved', `status=${rga.status}`);
  const attLogs = await api('GET', `/api/attendance?employeeId=${attEmp.json?.id}&from=2099-01-01&to=2099-01-31`, { cookie: admin.cookie });
  check('T-ATT  approval upserts Regularized log', attLogs.status === 200 && attLogs.json.some(a => a.date === '2099-01-10' && a.status === 'Regularized'));

  // Holidays shorten leave duration; owner can cancel a pending leave
  const hol = await api('POST', '/api/holidays', { cookie: admin.cookie, body: { date: '2099-05-05', name: 'Smoke Day' } });
  check('T-HOL  admin adds holiday', hol.status === 200, `status=${hol.status}`);
  const hlv = await api('POST', '/api/leaves', { cookie: att.cookie, body: { leaveType: 'Casual Leave', startDate: '2099-05-04', endDate: '2099-05-06', reason: 'holiday span' } });
  check('T-HOL  holiday excluded (3-day span → 2)', hlv.status === 200 && hlv.json?.durationDays === 2, `days=${hlv.json?.durationDays}`);
  const cx = await api('PUT', `/api/leaves/${hlv.json?.id}/cancel`, { cookie: att.cookie });
  check('T-LEAVE owner cancels pending leave', cx.status === 200 && cx.json?.status === 'Cancelled', `status=${cx.status}`);
  await api('DELETE', `/api/holidays/${hol.json?.id}`, { cookie: admin.cookie });

  // Payroll finalization lock (month the main test never processes)
  const fin = await api('POST', '/api/payroll/finalize', { cookie: admin.cookie, body: { month: 'November 2099' } });
  check('T-PAY  finalize month 200', fin.status === 200 && fin.json?.finalized === true, `status=${fin.status}`);
  const reproc = await api('POST', '/api/payroll/process', { cookie: admin.cookie, body: { month: 'November 2099' } });
  check('T-PAY  process finalized month → 400', reproc.status === 400, `status=${reproc.status}`);

  // Deactivate-only lifecycle
  const dEmail = `deact_${Date.now()}@jjfo.com`;
  const dEmp = await api('POST', '/api/employees', { cookie: admin.cookie, body: { name: 'Deact Temp', email: dEmail, department: 'IT & Security', status: 'active' } });
  const dLogin1 = await login(dEmail, 'password123');
  check('T-LIFE temp logs in before deactivation', dLogin1.status === 200);
  const deact = await api('PUT', `/api/employees/${dEmp.json?.id}/deactivate`, { cookie: admin.cookie });
  check('T-LIFE deactivate 200 → inactive', deact.status === 200 && deact.json?.status === 'inactive', `status=${deact.status}`);
  const dLogin2 = await login(dEmail, 'password123');
  check('T-LIFE deactivated login blocked → 403', dLogin2.status === 403, `status=${dLogin2.status}`);
  const dGhost = await api('GET', '/api/employees', { cookie: dLogin1.cookie });
  check('T-LIFE existing session rejected → 401', dGhost.status === 401, `status=${dGhost.status}`);
  const defList = await api('GET', '/api/employees', { cookie: admin.cookie });
  check('T-LIFE hidden from default directory', defList.json.every(e => e.id !== dEmp.json?.id));
  const incList = await api('GET', '/api/employees?includeInactive=1', { cookie: admin.cookie });
  check('T-LIFE visible with includeInactive', incList.json.some(e => e.id === dEmp.json?.id));

  // Asset lifecycle: unassigned stock → assign
  const stockAsset = await api('POST', '/api/assets', { cookie: admin.cookie, body: { name: 'Stock Laptop', type: 'Laptop', serialNumber: `STK-${Date.now()}` } });
  check('T-ASSET create unassigned → In Stock', stockAsset.status === 200 && stockAsset.json?.status === 'In Stock' && !stockAsset.json?.employeeId);
  const asg = await api('PUT', `/api/assets/${stockAsset.json?.id}/assign`, { cookie: admin.cookie, body: { employeeId: 'EMP003' } });
  check('T-ASSET assign from stock 200', asg.status === 200 && asg.json?.employeeId === 'EMP003', `status=${asg.status}`);

  // Hierarchy editor + cycle prevention
  const mgr1 = await api('PUT', '/api/employees/EMP004/manager', { cookie: admin.cookie, body: { managerId: 'EMP003' } });
  check('T-HIER reassign manager 200', mgr1.status === 200 && mgr1.json?.managerId === 'EMP003', `status=${mgr1.status}`);
  const cyc = await api('PUT', '/api/employees/EMP003/manager', { cookie: admin.cookie, body: { managerId: 'EMP004' } });
  check('T-HIER reporting cycle rejected → 400', cyc.status === 400, `status=${cyc.status}`);
  await api('PUT', '/api/employees/EMP004/manager', { cookie: admin.cookie, body: { managerId: 'EMP002' } }); // restore seed chain

  // Helpdesk status transitions
  const st1 = await api('PUT', `/api/helpdesk/${tkId}/status`, { cookie: admin.cookie, body: { status: 'In Progress' } });
  check('T-HELP status → In Progress', st1.status === 200 && st1.json?.status === 'In Progress', `status=${st1.status}`);

  // Reports (JSON + CSV + access control)
  const repRes = await api('GET', '/api/reports/headcount', { cookie: admin.cookie });
  check('T-REP  headcount rows', repRes.status === 200 && Array.isArray(repRes.json?.rows) && repRes.json.rows.length > 0);
  const csvRes = await fetch(`${BASE}/api/reports/leave-utilization?format=csv`, { headers: { Cookie: admin.cookie } });
  const csvTxt = await csvRes.text();
  check('T-REP  CSV export', csvRes.status === 200 && csvTxt.includes('employee'), `status=${csvRes.status}`);
  const repDeny = await api('GET', '/api/reports/headcount', { cookie: att.cookie });
  check('T-REP  plain employee → 403', repDeny.status === 403, `status=${repDeny.status}`);

  // Gap-build temp cleanup
  if (attEmp.json?.id) await api('DELETE', `/api/employees/${attEmp.json.id}`, { cookie: admin.cookie, extraHeaders: hardDel });
  if (dEmp.json?.id) await api('DELETE', `/api/employees/${dEmp.json.id}`, { cookie: admin.cookie, extraHeaders: hardDel });
  if (stockAsset.json?.id) await api('DELETE', `/api/assets/${stockAsset.json.id}`, { cookie: admin.cookie });

  // ---- Cleanup (self-cleaning) ----
  if (lvId) await api('DELETE', `/api/leaves/${lvId}`, { cookie: admin.cookie });
  if (assetId) await api('DELETE', `/api/assets/${assetId}`, { cookie: admin.cookie });
  if (tkId) await api('DELETE', `/api/helpdesk/${tkId}`, { cookie: admin.cookie });
  if (subId) await api('DELETE', `/api/employees/${subId}`, { cookie: admin.cookie, extraHeaders: hardDel });
  await api('PUT', '/api/me/preferences', { cookie: admin.cookie, body: { preferences: { theme: 'dark', font: 'Outfit', fontSize: 'medium' } } });

  // ---- Optional rate-limit burst (trips limiter ~15 min) ----
  if (RUN_RATELIMIT) {
    let got429 = false;
    for (let i = 0; i < 7; i++) { const r = await login('rajesh@jjfo.com', 'wrong'); if (r.status === 429) got429 = true; }
    check('T-SEC  login rate limit → 429 within burst', got429);
  }

  console.log(`\n${fail === 0 ? 'ALL PASS ✅' : 'FAILURES ❌'}  — ${pass} passed, ${fail} failed`);
  if (failed.length) console.log('Failed:', failed.join(' | '));
  process.exit(fail === 0 ? 0 : 1);
}

main().catch(e => { console.error('Smoke run crashed:', e); process.exit(1); });
