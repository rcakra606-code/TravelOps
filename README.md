# TravelOps (Secure Edition)

Modernized Express + SQLite/Postgres (Neon) travel operations dashboard with:
- JWT auth, role-based access, ownership controls
- Account lockout + per-IP login rate limiting
- Unified filtering, pagination, sorting, CSV import/export
- Postgres (Neon) or local SQLite auto-dialect
- Structured logging (pino), Helmet, compression, health check, graceful shutdown

## 1) Tech Stack
- Backend: Node.js (Express), SQLite (dev) or Postgres (Neon)
- Frontend: Vanilla HTML/CSS/JS (single dashboard) + Chart.js
- Security: JWT, bcrypt, rate limiting, lockout, Helmet, strong password policy

## 2) Local Development (SQLite)
```powershell
# From project root
npm install
# Copy env template and customize if needed
Copy-Item .env.example .env
# Ensure DATABASE_URL is empty to use SQLite locally
npm run dev
```
Open http://localhost:3000 (auto-fallback to 3001+ if 3000 is busy).

Default admin login:
- Username: admin
- Password: Admin1234!

Tip: You can change the initial admin via env vars `ADMIN_USERNAME` and `ADMIN_PASSWORD` before first run. If you forget the password, see Troubleshooting below.

## 3) Using Neon (Postgres) Locally
1. Create a Neon project and a database, copy the connection string.
2. Ensure it ends with `?sslmode=require`.
3. Start the app with Postgres:
```powershell
$env:DATABASE_URL="postgres://user:pass@host/db?sslmode=require"
$env:JWT_SECRET="localdev-secret-1234567890"
npm start
```
Tables and the default admin user auto-create on first start.

## 4) Environment Variables (see .env.example)
- PORT=3000
- NODE_ENV=production
- JWT_SECRET=long-random-string (48+ chars)
- DATABASE_URL=postgres://user:pass@host/db?sslmode=require
- LOCKOUT_MINUTES=15
- RATE_LIMIT_WINDOW_MS=60000
- RATE_LIMIT_MAX=100
- LOGIN_MAX_PER_WINDOW=10
- LOGIN_WINDOW_SEC=60
- BCRYPT_COST=10
- LOG_LEVEL=info
- CORS_ORIGIN=comma-separated list of allowed origins (optional; omit for same-origin)
- TRUST_PROXY=true (required on Render)

## 5) Deploy on Render (Web Service)
1. Push this repo to GitHub.
2. In Render: New → Web Service → connect the repo.
3. Environment: Node
4. Build Command: (leave blank; Render runs `npm install` automatically)
5. Start Command: `npm start`
6. Health Check Path: `/healthz`
7. Add environment variables from section (4) in the Render dashboard. Use your Neon connection string with `?sslmode=require`.
8. Deploy. When up, go to the URL → login as `admin` / `Admin1234!` → change password immediately.

## 6) Roles & Ownership
- basic: can view all tables (except users); can edit only own rows (staff_name) in staff-owned tables; cannot delete.
- semiadmin: broader access; can view Users (adjust server rules as needed).
- admin: full access; can unlock users; access activity logs and user management.

## 7) Security & Policies
- Strong password required: >= 8 chars, includes uppercase, lowercase, number.
- Lockout: non-admin accounts lock for `LOCKOUT_MINUTES` after 3 failed logins.
- Rate limits: global + per-IP login attempt limiter.
- Helmet + compression enabled.
- Structured logs via pino; health at `/healthz`; graceful shutdown and Postgres pool close.

## 8) CSV Import/Export
- Sales, Tours, Documents, Targets, Telecom support CSV export and import (UI buttons).
- Add Regions first (IDs referenced by other tables).

## 9) Backups
- SQLite mode: `/api/backup` (admin only) copies DB file.
- Postgres mode (Neon): use Neon PITR/branching; `backup` endpoint returns 400.

## 10) Troubleshooting
- Port 3000 in use → server auto-falls back to 3001+.
- 429 Too Many Requests → relax RATE_LIMIT_* env vars.
- CORS errors → set precise origins in `CORS_ORIGIN` (scheme + host + port).
- Lockout → inspect `users.failed_attempts` and `locked_until`.
- Health check: `GET /healthz` returns JSON `{ status: 'ok', dialect: 'sqlite'|'postgres', ... }`.

Login issues:
- 401 Unauthorized: wrong username/password. Default is admin / Admin1234! (unless overridden by env).
- 423 Locked: account is temporarily locked after 3 failed attempts (non-admin). Ask an admin to use the Unlock button on Users, or wait `LOCKOUT_MINUTES`.
- Forgot admin password (SQLite): stop the server and delete `data/travelops.db` (this resets the DB and re-seeds admin). Or, start the app, login as an admin, and call POST `/api/admin/seed` with a new password.
- Forgot admin password (Postgres): call POST `/api/admin/seed` as an existing admin; if locked out entirely, update the `users` table directly in the DB.

## 11) API (partial)
- POST /api/login  { username, password } → token
- POST /api/logout
- GET /api/<table> (auth) — `users` blocked for basic
- POST /api/<table>
- PUT /api/<table>/:id
- DELETE /api/<table>/:id (not for basic)
- GET /api/metrics
- POST /api/users/reset-password (self or admin)
- POST /api/users/:username/reset (admin)
- POST /api/users/:username/unlock (admin)
- GET /healthz

## 12) Testing
Integration tests use Jest + supertest with isolated SQLite DB files per suite.

Run tests:
```powershell
npm test
```

How it works:
- Each test file sets `process.env.SQLITE_FILE` before creating the app via `createApp()`.
- The database schema & default admin are auto-created in that temp file.
- Tests close the DB (sqlite close or pg pool end) before deleting the file (prevents file locks on Windows).

Add a new test:
```js
// tests/example.test.mjs
process.env.SQLITE_FILE = 'test_example.db';
process.env.NODE_ENV = 'test';
import { createApp } from '../createApp.js';
import request from 'supertest';
import fs from 'fs';
let app, db;
beforeAll(async () => {
	if (fs.existsSync('test_example.db')) fs.rmSync('test_example.db');
	({ app, db } = await createApp());
});
afterAll(async () => { if (db?.close) await db.close(); if (fs.existsSync('test_example.db')) fs.rmSync('test_example.db'); });
test('health', async () => { const r = await request(app).get('/healthz'); expect(r.statusCode).toBe(200); });
```

## 13) Completed Enhancements (from roadmap)
- Admin UI button to unlock users
- Centralized error handler & standardized error JSON
- CSP tightened (Helmet directives)
- Integration tests (Jest + supertest) for auth & CRUD (green)

## 14) Future Ideas
- Add unit tests for metrics calculations
- Add pagination & server-side filtering endpoints (UI currently handles client-side)
- Implement refresh token rotation + revoke list
- Add audit export (CSV/JSON) for activity logs
