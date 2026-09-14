# JJFO HRMS production deployment

## Required production shape

- One Render web service built from the repository Dockerfile.
- `hrms.jjfo.in` as the only employee-facing hostname.
- One paid managed PostgreSQL database in the same Render region.
- Private object storage for employee documents (recommended), or a paid Render persistent disk for the first controlled pilot.
- One bootstrap administrator. All later accounts are created from Admin Controls.

## Environment variables

Set these in the Render web service; never commit their values:

```text
NODE_ENV=production
CLIENT_ORIGIN=https://hrms.jjfo.in
TRUST_PROXY_HOPS=1
JWT_SECRET=<at least 32 random characters>
INITIAL_ADMIN_EMAIL=<first admin email>
INITIAL_ADMIN_NAME=<first admin name>
INITIAL_ADMIN_PASSWORD=<unique minimum 16-character password>
SEED_DEMO=0
ALLOW_HARD_DELETE=0
```

The three `INITIAL_ADMIN_*` values are used only if the database has no admin. After the first admin exists, they are ignored. Rotate/remove the password value after first login.

## Database

The preview currently uses SQLite. Before real employee data is loaded, switch Prisma's datasource provider to `postgresql`, generate a fresh PostgreSQL baseline migration, and set `DATABASE_URL` to Render's **internal** database URL. Do not run the demo seed in production.

Use a paid database with point-in-time recovery, restrict public database access, schedule logical exports, and test a restore before go-live.

## Documents

For a small single-instance pilot, attach a Render disk at `/app/storage` and set:

```text
UPLOAD_ROOT=/app/storage/uploads
DATABASE_URL=file:/app/storage/prod.db
```

For production, replace filesystem uploads with private S3-compatible object storage, server-side encryption, short-lived signed downloads, retention rules, malware scanning, and a separate backup policy.

## Custom domain

1. Render service → **Settings** → **Custom Domains** → **Add Custom Domain**.
2. Enter `hrms.jjfo.in`.
3. At the DNS provider for `jjfo.in`, add a CNAME named `hrms` pointing to the exact `onrender.com` target Render displays.
4. Remove any conflicting `A`, `AAAA`, or CNAME record for `hrms`.
5. Return to Render and click **Verify**. Render provisions and renews TLS automatically.
6. Set `CLIENT_ORIGIN=https://hrms.jjfo.in`, redeploy, then validate login, cookies, uploads, email links, health checks, and logout.

## Go-live gates

- Enforce administrator MFA using the selected identity provider.
- Replace every demo password and disable demo portal shortcuts.
- Import employees into a staging database first and resolve every hierarchy/data-quality issue.
- Verify payroll/privacy access with employee, manager, HR, payroll, admin, and auditor test accounts.
- Test database restore and document recovery.
- Complete legal/privacy review, retention periods, and incident-response ownership.
