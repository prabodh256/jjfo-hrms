# Project Requirements & User Inputs

This document compiles all user requests, inputs, and constraints provided throughout the development and migration of the Jamshed Jeejeebhoy Family Office (JJFO) Core Enterprise Suite.

---

## 1. Explicit User Requests & Timeline

| Date/Time (UTC) | Input ID | User Request / Constraint |
| :--- | :--- | :--- |
| **2026-06-30 05:44** | UR-001 | Go through the code and give me an outline of what all can be improved. |
| **2026-06-30 05:46** | UR-002 | Implement everything you recommend wherever it is free. On Authentication and Security, implement the most tightest security. |
| **2026-06-30 05:48** | UR-003 | Use dummy data for the database (no existing production data needs to be migrated). |
| **2026-06-30 05:48** | UR-004 | Explain the benefits of the proposed React + Express + SQLite architecture. |
| **2026-06-30 05:59** | UR-005 | Serve the application locally for review. |
| **2026-06-30 06:11** | UR-006 | Ensure the frontend renders in a typical webpage/HTML mode (resolve HMR / Tailwind compilation glitches). |
| **2026-06-30 06:12** | UR-007 | Confirm whether local environment requires additional software installations. |
| **2026-06-30 06:17** | UR-008 | Dark mode styling constraints: Use bold, italics, and underlines to differentiate elements. Stick strictly to black/navy blue background with white font. |
| **2026-06-30 06:38** | UR-009 | Revert UI styling and layout to match the legacy monolith layout exactly (keep the Org Tree structure, Google Sync, Helpdesk, and all 10 sidebar navigation items). |
| **2026-06-30 06:58** | UR-010 | Implement all features step-by-step to optimize token usage. |
| **2026-06-30 17:34** | UR-011 | Fix tab synchronization (resolve double highlighting in sidebar navigation). |
| **2026-06-30 17:34** | UR-012 | Add a "Forgot Password?" option to the login card. |
| **2026-06-30 17:34** | UR-013 | Resolve the blank tab pages issue (caused by undefined user profile lookups and unhydrated database context). |
| **2026-07-01** | UR-014 | Harden backend authentication/security (env-only JWT secret with fail-fast, rate limiting, input validation, CSRF header, Prisma singleton, lock down registration, no password-hash leakage). |
| **2026-07-01** | UR-015 | Complete the migration: make SQLite the single source of truth, rebuild the UI as real React consuming the API, and retire the legacy localStorage monolith. |
| **2026-07-01** | UR-016 | Build out all 10 modules as React components with full backend CRUD. |
| **2026-07-01** | UR-017 | Fix the broken/unstructured layout (CSS class-name reconciliation) and seed rich dummy data across every module. |
| **2026-07-01** | UR-018 | Restyle the search inputs (global + directory/assets) into a modern pill treatment. |
| **2026-07-01** | UR-019 | Admin must be able to add and remove users (Directory). |
| **2026-07-01** | UR-020 | Onboarding must allow adding and modifying users; a hire added here must propagate across every portal. |
| **2026-07-01** | UR-021 | Asset Inventory must support search by employee/owner plus additions and modifications. |
| **2026-07-01** | UR-022 | Settings must offer multiple font families AND font sizes. |
| **2026-07-01** | UR-023 | Add light/dark themes; on switch, dropdowns must use a contrasting (opposite) background with same-color legible text. |
| **2026-07-01** | UR-024 | In Leave & Attendance, the super admin (Rajesh) can add leaves for anyone; show leaves used and available with per-type breakup (sick/casual/annual) and allow the admin to adjust allotments. |
| **2026-07-01** | UR-025 | No single dropdown for dates — use a calendar (date picker) or two dropdowns (month + year). |
| **2026-07-01** | UR-026 | Directory profile editor must allow incremental work-experience entries (Experience 1, then 2, …) and document uploads (joining/relieving/payslip/ID), saved under the employee's Drive folder. Data may be entered by the super admin or the employee themselves. |
| **2026-07-01** | UR-027 | Delegated permissions: anyone lower in the org hierarchy can add a person and grant them a **subset** of their own permissions (module access + capabilities). E.g. 1 can create 1A but withhold the "create users" capability (so 1A cannot create 1A(a)) while still granting "approve leaves". A grant can never exceed what the granter holds. |
| **2026-07-01** | UR-028 | Hierarchical leave approval chain: approvals route up the reporting line, and leaves longer than 5 days require approval from **two levels up** (otherwise one). Each approver needs the "approve leaves" capability. |
| **2026-07-01** | UR-029 | Onboarding submission & document approval: core details editable only by admin/supervisor; onboarding details (work-ex, education, attachments) can be admin-entered OR pushed to the employee to fill and submit for approval. Admin reviews attachments in a pane. On submit the record locks; on approve it stays locked (no employee edits) until admin returns it for re-upload. Mandatory documents (education certificate, past payslip, offer letter, relieving letter, ID) cannot be skipped unless an admin disables the requirement. |
| **2026-07-02** | UR-030 | Audit fixes: restore the Forgot Password link (UR-012 regression); enforce leave balances on application (admin may override); enforce helpdesk moderation server-side (owners may reply, only moderators resolve); reject tokens of deleted employees and refresh roles from the DB per request; validate payroll month format ("June 2026"). |
| **2026-07-02** | UR-031 | Password management: employees change their own password (current password required, min 8 chars); admin resets any employee's password from the Directory. |
| **2026-07-02** | UR-032 | Real file storage for onboarding documents: uploads stored on disk per employee (5MB, pdf/doc/docx/png/jpg), recorded in the employee's documents and Drive vault; the admin review pane opens the actual attachment. Downloads restricted to the employee and supervisors. |
| **2026-07-02** | UR-033 | Client-side route guards: direct navigation to an unauthorized module redirects to the Dashboard instead of rendering an empty page. |
| **2026-07-03** | UR-034 | Extend to the full enterprise HRMS spec **on the existing stack** (no rebuild); external providers (email/SMS/WhatsApp gateways, SSO, biometric vendors) explicitly skipped this round; employee removal becomes deactivate-only. |
| **2026-07-03** | UR-035 | Audit logging for all sensitive actions (employee changes, permission grants, onboarding transitions, leave decisions, payroll, assets, tickets, password events) with an admin Audit Log viewer and entity filters. |
| **2026-07-03** | UR-036 | In-app notification center (topbar bell, unread count, mark read/all) with event triggers — leave routing/decisions, onboarding transitions, asset assignment, ticket updates, permission changes, payroll finalization — and per-user notification-kind preferences. |
| **2026-07-03** | UR-037 | Attendance: clock in/out with late detection, attendance log, regularization requests approved by the direct manager (upserts a "Regularized" log); company holiday calendar (admin-managed) excluded from leave durations; employees can cancel pending leaves (admin anytime). |
| **2026-07-03** | UR-038 | Payroll finalization: an admin can finalize a month, locking it against reprocessing; payslip-availability notification goes to all active employees. |
| **2026-07-03** | UR-039 | Deactivate-only lifecycle (login + sessions blocked, hidden from lists behind a toggle, history preserved) and a hierarchy editor (reassign reporting manager) with reporting-cycle prevention. |
| **2026-07-03** | UR-040 | Asset lifecycle incl. unassigned "In Stock" stock and assign/repair/retired states; helpdesk Open/In Progress/Resolved/Closed transitions; Reports module (headcount, leave utilization, payroll cycles, assets, helpdesk, permission changes) with CSV export. |

---

## 2. Core Functional Specifications

### A. Authentication & Security
- **Secure Password Hashing:** Use `bcryptjs` on the backend for hashing employee passwords.
- **Session Tokens:** Issue JSON Web Tokens (JWT) signed with a secure server key.
- **HTTP-Only Cookies:** Transport the JWT strictly via `httpOnly`, `Secure`, and `SameSite` cookies to neutralize client-side XSS and CSRF token theft.
- **Fallback Login Flow:** Include a "Forgot Password?" dialog indicating manual administrator overrides (Rajesh Kumar).

### B. Legacy UI Restoration
- **Left Sidebar Navigation:** Must include all 10 original links:
  1. Dashboard
  2. Directory & Org
  3. Onboarding
  4. Leave & Attendance
  5. Payroll & Tax
  6. Asset Inventory
  7. HR Helpdesk
  8. Permissions (Admin-only)
  9. Google Sync (Admin-only)
  10. Settings
- **Directory Page:** Must render both the search grid and the hierarchical Org Tree structure correctly.
- **Theme Accents:** Stick strictly to a black/navy background with white text, utilizing typography differentiations (bold, italics, underlines) to structure visual hierarchy.

### C. Data & Architecture (current state)
- **SQLite is the single source of truth** (Prisma ORM), replacing the original browser `localStorage` database. The legacy monolith has been retired.
- **Stack:** React 19 + Vite SPA (react-router + zustand) → Express 5 + Prisma + SQLite. Vite proxies `/api` and `/auth` to the backend.
- **Seeded dummy data** across every module (5 employees: Rajesh/Priya/Amit/Sneha/Vikram, plus leaves, balances, attendance, assets, payroll, tax, goals, shout-outs, helpdesk, and simulated Google Drive/Sheets/Gmail).
- **Employee IDs** are string tokens (`EMP001`…), auto-incremented for new hires.

### D. Authentication & Security (hardened)
- Env-only `JWT_SECRET` with startup fail-fast (min 32 chars); JWT in `httpOnly` + `Secure` + `SameSite=strict` cookies.
- `express-rate-limit` on login + a global limiter; `zod` validation; registration route removed (manual admin provisioning).
- CSRF defense via required `X-Requested-With` header on mutating `/api` routes; Helmet; shared Prisma client; password hashes never returned to the client.

### E. Employee Lifecycle & Self-Service
- **Admin** can add, edit, and remove employees from **Directory**; removal cascades to all dependent records.
- **Onboarding** supports adding new hires and modifying candidates; approval flips status to `active`. A hire added here immediately appears across all modules (Directory, Leave, Payroll, Assets, etc.).
- **Self-service:** an employee can edit their own profile (contact, age, blood group, designation, work experience, documents) via Directory → "My Profile".
- **Work experience** is captured as incremental entries (Experience 1, then 2, …). **Documents** (joining letter, relieving letter, previous payslip, ID proof) are recorded and mirrored into the employee's simulated **Google Drive vault folder** (`EMPxxx_Name_Vault`).

### F. Leave & Attendance
- Per-type balance breakup — Annual / Sick / Casual — each showing **total, used, available** (used is computed from approved leaves).
- Super admin can **file leave for any employee** (and pre-approve it) and **adjust each employee's allotment**.
- Employees apply for their own leave; admins approve/reject pending requests.

### G. Asset Inventory
- Search by employee/owner (and asset name/serial); admin can assign, edit (reassign / change condition / status), and remove assets; employees confirm receipt of assets assigned to them.

### H. Settings & Theming
- **Light/Dark themes** applied via `data-theme`, persisted in user preferences and re-applied on load.
- On theme switch, native dropdown option lists use a contrasting background with theme-appropriate (legible) text.
- **Multiple font families** (Outfit, Plus Jakarta Sans, Inter, Roboto) and **font sizes** (Small/Medium/Large), previewed live and saved.

### I. Date Inputs
- No single dropdown for dates: actual dates use a calendar (`<input type="date">`); period selection (payroll) uses separate **month + year** dropdowns.

### J. Delegated Permissions (org-hierarchy)
- **Permission model:** each user holds `modules` (which of the 10 modules they can access) and `caps` (capabilities: `createUsers`, `approveLeaves`, `accessFinancials`, `manageHierarchy`, `moderateHelpdesk`). Admins implicitly hold everything. Everyone keeps a baseline of self-service modules (Dashboard, Leave, Helpdesk, Settings).
- **Delegated creation:** a user with the `createUsers` capability can add a person, who is placed **under them** in the hierarchy (managerId = creator). Non-admins cannot mint admins.
- **Subset rule (enforced server-side):** the modules and capabilities granted to the new/edited user must be a subset of the granter's own effective permissions. Over-granting is rejected (403). The grant UI (`PermissionPicker`, fed by `GET /api/permissions/grantable`) only offers what the granter holds.
- **Sidebar & actions** are gated by the user's effective module access; the "Add Employee" / "Add New Hire" actions appear only for users with `createUsers`.

### K. Leave Approval Chain
- On submission, required approval levels are computed: **> 5 days → 2 levels** up the manager chain, otherwise **1** (clamped to how many managers actually exist; the top of the org self-approves).
- Approvals are **step-wise**: level 1 = direct manager, level 2 = manager's manager. Each step requires the approver to be the correct person in the chain **and** hold the `approveLeaves` capability (admins can finalize any step).
- The **Approvals** tab surfaces leaves awaiting the current user, showing progress (e.g. "0/2 approvals (>5 days)"). Endpoints: `PUT /api/leaves/:id/approve` and `/reject`.

### L. Onboarding Submission & Document Approval
- **Core details** (name, email, department, role, salary) are editable only by an admin/supervisor (holder of `createUsers`); employees' self "My Profile" edits are limited to personal contact fields (`PUT /api/me` → contact/age/blood group only).
- **Onboarding details** (work experience, education history, document attachments) can be entered by the admin/supervisor **or pushed to the employee** to complete. The employee fills them in their **My Onboarding** view and **submits for approval**.
- **State machine** (`Employee.onboardingState`): `draft` / `returned` → editable by the employee; `submitted` / `approved` → **locked** (all cells/uploads disabled). Transitions: employee `submit`; admin `approve` (locks permanently), `return` (reopens with a note), `push` (send/remind).
- **Attachment review pane:** admin clicks **Review** to see every document (filename + Uploaded/Missing), plus education & experience, then Approve / Return / Send-back.
- **Mandatory documents** (`DocRequirement`): education certificate, previous payslip, previous offer letter, relieving letter, ID proof — submission is blocked until all *required* ones are present. Admin can toggle any off (`PUT /api/onboarding/doc-config/:key`). Employees cannot change requirements (403).
- Endpoints: `GET/PUT /api/onboarding/doc-config[/:key]`, `PUT /api/me/onboarding`, `POST /api/me/onboarding/submit`, `PUT /api/employees/:id/onboarding`, `POST /api/employees/:id/onboarding/{push,approve,return}`.

### M. Accounts, Enforcement & File Storage (audit fixes)
- **Live token checks:** every authenticated request re-verifies the account exists and refreshes the role from the DB — deleted employees are rejected (401, cookie cleared) and stale-role tokens are corrected.
- **Passwords:** `PUT /api/me/password` (current password required, new min 8 chars); admin reset via `PUT /api/employees/:id/password`. The login card's "Forgot Password?" directs users to the admin manual reset.
- **Leave balances enforced:** `POST /api/leaves` rejects applications exceeding the available balance for that leave type (400); admins may override when filing for others.
- **Helpdesk moderation enforced:** ticket owners may reply to their own tickets; replying to others' tickets or resolving requires admin or the `moderateHelpdesk` capability.
- **Payroll month validated:** must match `"<MonthName> <YYYY>"`.
- **Real file storage:** `POST /api/files/:empId/:docKey` stores the actual file under `backend/uploads/<empId>/` (5MB limit; pdf/doc/docx/png/jpg; strict param validation against path traversal), updates the employee's documents JSON and Drive vault. `GET /api/files/:empId/:docKey` serves it to the employee themselves or a supervisor only; the admin review pane links each attachment.
- **Route guards:** unauthorized module URLs redirect to the Dashboard.

### N. Audit Trail & In-app Notifications
- Every sensitive action writes an `AuditLog` row (actor, action, entity, ref, detail, timestamp); passwords are never logged. Viewer at **Audit Log** (admin or granted `audit` module) with entity filtering. `GET /api/audit`.
- **Notification center:** topbar bell with unread badge; events create `Notification` rows (kinds: leave, onboarding, asset, helpdesk, payroll, permission). Mark one/all read. Users can mute kinds via Settings preferences. External channels (email/SMS/WhatsApp) intentionally out of scope until a gateway is chosen.

### O. Attendance, Holidays & Leave Lifecycle
- **Clock in/out** (one log per day; ≤09:15 = On Time, else Late); personal log view; admins see everyone.
- **Regularization:** employee requests corrected timings; the **direct manager** (with `approveLeaves`) or an admin approves — approval upserts the day's log as "Regularized".
- **Holiday calendar:** admin-managed; leave duration = date span minus holidays in range (server-authoritative).
- **Cancellation:** owner may cancel a Pending leave; admin may cancel Pending/Approved (availability restores automatically).

### P. Lifecycle, Payroll Lock & Reports
- **Deactivate-only:** `PUT /api/employees/:id/deactivate` → login rejected (403), live sessions invalidated (401), hidden from lists unless `includeInactive=1`; hard delete remains an admin-only API for test data.
- **Hierarchy editor:** admin or `manageHierarchy` reassigns reporting managers; self-reporting and cycles rejected (400).
- **Payroll cycles:** `POST /api/payroll/finalize` locks a month (reprocess → 400); `GET /api/payroll/cycles` feeds the UI lock chip.
- **Assets:** may be created unassigned ("In Stock"), then assigned (`PUT /api/assets/:id/assign`); statuses In Stock / Pending Employee Confirmation / Confirmed / Under Repair / Returned / Retired.
- **Helpdesk:** moderators move tickets Open → In Progress → Resolved/Closed.
- **Reports:** headcount, leave-utilization, payroll-cycles, asset-allocation, helpdesk-resolution, permission-changes — JSON or `?format=csv` download; supervisors or granted `reports` module.

---

## 3. Test Plan

### 3.1 Test setup
- **Servers:** backend on `http://localhost:4000`, Vite dev UI on `http://localhost:5174` (proxies `/api` + `/auth` → 4000).
- **Reset to clean demo data:** `cd backend && npm run seed`.
- **Credentials** (all password `password123`):
  - `rajesh@jjfo.com` — **admin** (all modules/caps).
  - `priya@jjfo.com` — **delegated team-lead** (caps: `createUsers`, `approveLeaves`, `accessFinancials`; modules: directory, onboarding, payroll). Manager of Sneha.
  - `amit@jjfo.com`, `sneha@jjfo.com` — employees. Chain: Sneha → Priya → Rajesh.

### 3.2 Manual test checklist
Each row: do the **Steps** and confirm the **Expected** result in the browser at `:5174`.

**T-SEC — Auth & security**
| ID | Steps | Expected |
| :-- | :-- | :-- |
| SEC-1 | Start backend with no/short `JWT_SECRET` | Server refuses to boot (FATAL, exit 1) |
| SEC-2 | Submit 6 rapid wrong-password logins | 6th returns HTTP 429 |
| SEC-3 | Login with a malformed email | HTTP 400 |
| SEC-4 | Inspect `/api/employees` response | No `password` field present |

**T-DIR — Directory / employee CRUD & self-service**
| ID | Steps | Expected |
| :-- | :-- | :-- |
| DIR-1 | Type in the Directory search pill | Grid filters by name/dept/role |
| DIR-2 | (admin) Add Employee → add Experience 1 then 2, attach a document → Save | New card appears; doc under their Drive vault (see GS-2) |
| DIR-3 | (admin) Edit an employee; Delete another | Edit persists; delete removes card + all their records |
| DIR-4 | (employee) open **My Profile**, change contact + add experience/doc → Save | Persists after reload |

**T-ONB — Onboarding submission & document approval**
| ID | Steps | Expected |
| :-- | :-- | :-- |
| ONB-1 | (admin) Add New Hire | Appears in Onboarding queue as "Draft (with employee)" and across modules |
| ONB-2 | Log in as `vikram.candidate@jjfo.com` → **My Onboarding** | Shows HR note; Submit disabled: "N required doc(s) missing" |
| ONB-3 | Upload all mandatory docs → Submit | State → "Submitted"; all cells/uploads become locked (disabled) |
| ONB-4 | (admin) Onboarding → **Review** the candidate | Pane lists each doc filename + Uploaded/Missing, plus education & experience |
| ONB-5 | (admin) **Approve & Lock** | State → Approved; employee still cannot edit |
| ONB-6 | (admin) **Return for re-upload** with a note | State → Returned; employee can edit again and sees the note |
| ONB-7 | (admin) Mandatory Documents: toggle one off | It becomes optional; employee can submit without it. Employee toggling → 403 |

**T-LEAVE — Leave balances & application**
| ID | Steps | Expected |
| :-- | :-- | :-- |
| LEA-1 | Open Balances tab | Annual/Sick/Casual show available / total (used) |
| LEA-2 | (employee) Apply Leave | Appears Pending in History |
| LEA-3 | (admin) Add Leave for an employee; adjust an allotment | Leave created; totals update |
| LEA-4 | Enter a >5-day range in the form | Shows "needs 2-level approval" |

**T-APPR — Approval chain**
| ID | Steps | Expected |
| :-- | :-- | :-- |
| APP-1 | As Priya, Approvals tab, approve Sneha's 9-day leave | Becomes 1/2, still Pending |
| APP-2 | As Rajesh, approve the same leave | Becomes Approved (2/2) |
| APP-3 | As a non-approver, try to approve | Blocked (403) |

**T-PERM — Delegated permissions**
| ID | Steps | Expected |
| :-- | :-- | :-- |
| PER-1 | As Priya, Add Employee → Access & Permissions | Picker shows only her subset (no gsync/manageHierarchy) |
| PER-2 | Grant a subset to the new hire, save; log in as them | Their sidebar shows only granted modules |
| PER-3 | Attempt to over-grant (via API) | 403 |

**T-PAY / T-ASSET / T-HELP / T-GS / T-SET / T-DATE**
| ID | Steps | Expected |
| :-- | :-- | :-- |
| PAY-1 | Payroll: pick month + year dropdowns → Process | Payslip rows appear |
| PAY-2 | Save a tax declaration | Persists |
| AST-1 | Assets: search by owner; assign; edit/reassign; confirm; remove | Each reflects immediately |
| HLP-1 | Raise a ticket; (admin) reply + resolve | Status → Resolved |
| GS-1 | Google Sync: Drive/Sheets/Gmail tabs | Seeded rows shown |
| GS-2 | After DIR-2, open Drive tab | New hire's vault folder + document listed |
| SET-1 | Settings: toggle Light/Dark; change font family + size | Applies live; dropdown text legible in both themes; persists on reload |
| DATE-1 | Inspect every date input | Calendar or month+year — never a single date dropdown |

**T-PWD / T-FILE / guards — audit fixes**
| ID | Steps | Expected |
| :-- | :-- | :-- |
| PWD-1 | Login page | "Forgot Password?" link present; explains admin manual reset |
| PWD-2 | Settings → Change Password with wrong current | Rejected (401) |
| PWD-3 | Change with correct current (min 8 chars) → re-login with new | Works |
| PWD-4 | (admin) Directory → key icon → set new password → user logs in with it | Works |
| SEC-5 | Delete an employee, then use their still-valid cookie | 401, session dead |
| LEA-5 | (employee) apply for more days than available balance | 400 "Insufficient … balance" |
| HLP-2 | (non-moderator) reply to someone else's ticket / resolve own | 403 both; owner reply on own ticket works |
| PAY-3 | Process payroll with a garbage month string | 400 |
| FILE-1 | (candidate, editable state) choose a file in My Onboarding | Uploads immediately; filename shown |
| FILE-2 | (admin) Review pane → click the attachment | Opens the real file in a new tab |
| FILE-3 | (unrelated employee) request another's file URL | 403 |
| GRD-1 | (employee) type /gsync in the URL bar | Redirected to Dashboard |

**T-AUD / T-NOTIF / T-ATT / T-LIFE / T-REP — gap build**
| ID | Steps | Expected |
| :-- | :-- | :-- |
| AUD-1 | (admin) open Audit Log after any change | Rows with actor, action, entity; filter works. Non-admin API access → 403 |
| NOT-1 | Submit a leave, log in as the approver | Bell badge increments; item marks read on click; muted kinds hidden |
| ATT-1 | Attendance tab → Clock In / Clock Out | One log per day; Late after 09:15; second clock-in blocked |
| ATT-2 | Request regularization; approve as direct manager | Log for that date becomes "Regularized" |
| HOL-1 | Apply leave spanning a seeded holiday | Duration excludes the holiday |
| LEA-6 | Cancel own pending leave | Status Cancelled; availability restored |
| PAY-4 | Finalize a month, then reprocess it | Reprocess rejected (400); lock chip shown |
| LIF-1 | (admin) Deactivate an employee | Login 403, old session 401, hidden until "Show inactive" |
| HIER-1 | Edit modal → change Reporting Manager; try a cycle | Reassign saves; cycle rejected |
| AST-2 | Create asset with no owner → Assign | "In Stock" → "Pending Employee Confirmation" |
| HLP-3 | (moderator) change ticket status dropdown | Open → In Progress → Closed; owner notified |
| REP-1 | Reports → any kind → Download CSV | Table renders; CSV file downloads; plain employee → 403 |

### 3.3 UR → Test traceability
| Requirement | Covered by |
| :-- | :-- |
| UR-014 (security hardening) | SEC-1..4, smoke T-SEC |
| UR-015/016 (migration, all modules) | all module tests |
| UR-017 (layout, seed data) | GS-1, visual checks |
| UR-018 (search styling) | DIR-1, AST-1 |
| UR-019 (add/remove users) | DIR-2, DIR-3 |
| UR-020 (onboarding add/modify, propagation) | ONB-1, ONB-2 |
| UR-021 (asset search + CRUD) | AST-1 |
| UR-022 (font size + families) | SET-1 |
| UR-023 (light/dark, dropdown contrast) | SET-1 |
| UR-024 (admin add leave, breakup, adjust) | LEA-1, LEA-3 |
| UR-025 (no single date dropdown) | DATE-1, PAY-1 |
| UR-026 (work-ex incremental + docs → Drive) | DIR-2, DIR-4, GS-2 |
| UR-027 (delegated subset permissions) | PER-1..3, smoke T-PERM |
| UR-028 (approval chain, >5 days = 2 levels) | APP-1..3, smoke T-APPR |
| UR-029 (onboarding submit/lock/approve, mandatory docs) | ONB-1..7, smoke T-ONB |
| UR-030 (audit fixes: forgot link, balance, moderation, tokens, month) | PWD-1, LEA-5, HLP-2, SEC-5, PAY-3, smoke |
| UR-031 (password change + admin reset) | PWD-2..4, smoke T-PWD |
| UR-032 (real file upload/download + review-pane open) | FILE-1..3, smoke T-FILE |
| UR-033 (route guards) | GRD-1 |
| UR-035 (audit logging + viewer) | AUD-1, smoke T-AUD |
| UR-036 (notification center + prefs) | NOT-1, smoke T-NOTIF |
| UR-037 (attendance, holidays, cancellation) | ATT-1..2, HOL-1, LEA-6, smoke T-ATT/T-HOL |
| UR-038 (payroll finalization lock) | PAY-4, smoke T-PAY |
| UR-039 (deactivate-only + hierarchy editor) | LIF-1, HIER-1, smoke T-LIFE/T-HIER |
| UR-040 (asset lifecycle, helpdesk states, reports) | AST-2, HLP-3, REP-1, smoke T-ASSET/T-HELP/T-REP |

### 3.4 Automated smoke test
- **Run:** `cd backend && npm run test:smoke` (backend must be up on `:4000`; override with `SMOKE_BASE`). Prints per-check ✓/✗ and exits non-zero on any failure. **85 checks.**
- **Covers (asserts, not just calls):** security denials (400/401/403, no password leak, deleted-user token rejection); delegated create + subset enforcement (403 on over-grant; managerId = creator; role coerced); Drive-folder sync; the full 2-level leave approval chain incl. non-approver rejection; balance breakup, admin allotment and over-balance rejection; helpdesk moderation (owner reply OK, foreign reply/resolve 403); payroll process + month-format validation; tax save; Google Sync non-empty; preferences save; the onboarding state machine (missing-docs block, submit-locks, approve-locks, return-reopens, employee cannot change doc config); password change/reset round-trips; real file upload → admin download → unrelated-employee 403; audit rows + non-admin 403; notification create/mark-read; clock in/out + regularization approval upsert; holiday-aware durations; leave cancellation; payroll finalize lock; deactivate lifecycle (login 403, session 401, list hiding); in-stock asset → assign; hierarchy reassign + cycle rejection; helpdesk status transitions; reports JSON/CSV + access control.
- **Repeatable & self-cleaning:** uses unique emails, walks a freshly-created leave (not seed rows), and deletes everything it created (`test/smoke.mjs`).
- **Rate-limit caveat:** the 429 burst is **off by default** (it would trip the login limiter for ~15 min). Enable with `SMOKE_RATELIMIT=1 npm run test:smoke` on a freshly restarted backend.
