# JJFO HRMS

Jamshed Jeejeebhoy Family Office — Core Enterprise Suite (HRMS).

**Stack:** React 19 + Vite · Express 5 · Prisma · SQLite  
**Local demo password:** `password123` for seeded dummy accounts only. Production employee creation requires a unique temporary password of at least 12 characters.

## Quick start

```bash
# Backend
cd backend
cp .env.example .env   # edit JWT_SECRET (min 32 chars)
npm install
npx prisma db push
npm run seed
npm run dev            # http://localhost:4000

# Frontend (second terminal)
cd frontend
npm install
npm run dev            # http://localhost:5173
```

Or from the repo root after both installs:

```bash
npm run seed
npm run dev:api   # terminal 1
npm run dev:web   # terminal 2
```

### Demo logins

| Email | Role |
|-------|------|
| `rajesh@jjfo.com` | Admin |
| `priya@jjfo.com` | Team lead (delegated caps) |
| `amit@jjfo.com` / `sneha@jjfo.com` | Employees |
| `vikram.candidate@jjfo.com` | Onboarding candidate |

Password for all: **`password123`**

## Architecture

```
Browser (Vite :5173)
   │  cookie JWT + X-Requested-With CSRF header
   ▼
Express API (:4000)
   │  /auth  /api  /health  /ready
   ▼
Prisma → SQLite (dev.db) + uploads/
```

### Security (current)

- Env-only `JWT_SECRET` (fail-fast if weak)
- httpOnly cookies; sessions table with `jti` (logout / password change revokes)
- Login rate limit; Helmet; CORS origin lock
- CSRF custom header on mutating `/api` routes
- Salary fields redacted unless self / admin / explicit `accessFinancials`
- Payroll records restricted to self unless explicitly authorized
- Helpdesk tickets restricted to owner or moderator
- Hard employee delete requires `X-Confirm-Hard-Delete: true` (prefer deactivate)
- File uploads: size + extension + MIME checks; randomized filenames

### Modules

Dashboard · Directory & Org · Onboarding · Leave & Attendance · Payroll & Tax · Assets · Helpdesk · Permissions · Document Vault (simulated Google Sync) · Reports · Audit · Settings

## API notes

| Endpoint | Purpose |
|----------|---------|
| `GET /health` | Liveness |
| `GET /ready` | DB readiness |
| `POST /auth/login` | Session cookie |
| `POST /auth/logout` | Revoke session |
| `POST /auth/forgot-password` | Notify admins |
| `GET /api/search?q=` | Global search |
| `GET/PUT /api/settings/company` | Late threshold etc. |

Full module routes live under `/api/*` (see `backend/routes/api.js`).

## Tests

```bash
# API must be running on :4000 with seeded data
cd backend && npm run test:smoke
```

## Docker

```bash
JWT_SECRET="$(openssl rand -hex 32)" docker compose up --build
```

Open http://localhost:4000. The production image serves both the built frontend and API.

## Production checklist

1. Strong `JWT_SECRET` (≥32 chars), `NODE_ENV=production`, HTTPS
2. `CLIENT_ORIGIN` = real frontend origin
3. Do **not** commit `*.db` or `.env`
4. Prefer **deactivate** over hard delete
5. Back up SQLite (or migrate to Postgres) + `uploads/`
6. Never run the demo seed against a production database
7. Use unique temporary passwords and require employees to change them securely

## Project layout

```
backend/          Express API, Prisma, seed, smoke tests
frontend/         React SPA
requirements.md   Product history / acceptance criteria
.github/workflows CI (build + smoke)
```
