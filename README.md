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
## 15) Authentication & Token Strategy

| Aspect | Details |
|--------|---------|
| Access Token | Signed JWT containing user id, username, name, email, type |
| Default Lifetime | 30 minutes (configurable via `JWT_EXPIRES`, e.g. `45m`, `2h`, `1d`) |
| Refresh Mechanism | Client proactively calls `/api/refresh` (every ~12m or on activity) before expiry |
| Grace Window | Server allows refresh for `REFRESH_GRACE_SECONDS` (default 120s) after nominal expiry to tolerate clock skew & sleeping tabs |
| Storage | `localStorage` (`token`, `user`) cleared only on 401 or explicit logout |
| Activity Tracking | Client records last activity; pauses refresh when idle >10m (can be tuned) |
| Security | No long-lived opaque refresh token yet; simple sliding session. Future improvement: rotate refresh tokens & maintain revocation list |

### Configurable Lifetime for Tests
Set a short expiry during automated tests:

```powershell
$env:JWT_EXPIRES="5s"
$env:REFRESH_GRACE_SECONDS="2"
npm test
```

### Failure Modes
- 401: Missing / invalid token → client logs out.
- 403: Token structurally valid but beyond grace or action forbidden → stay on page (except refresh flow).

### Debug Diagnostics
Client logs `[auth] Token remaining ~Xm` every 5 minutes and after each refresh for observability.

## 16) Financial Input Normalization & Live Formatting
All monetary / numeric target fields (`sales_amount`, `profit_amount`, `tour_price`, `discount_amount`, `target_sales`, `target_profit`, `jumlah_deposit`, etc.) now support very flexible user typing and are auto-formatted as you type.

Accepted raw inputs (examples):
```
1000
1,000
1.000
Rp 1.234.567
1.234.567,50
1,234,567.50
Rp1.234,5
```

Live formatting rules:
- While typing, value is rendered using Indonesian locale thousands separators (`.`) and decimal comma (`,`).
- Mixed separators are tolerated; the last separator followed by 1–4 digits is treated as the decimal separator, others become thousands separators.
- Currency symbols / letters are ignored visually on reformat.

Submission normalization (before sending to API):
- Strips currency codes/symbols and spaces.
- Collapses all thousands separators.
- Determines decimal portion (if any) via heuristic (last `,` or `.` with 1–4 trailing digits).
- Converts to a JS Number (decimal point `.` internally) or falls back to `0` if parsing fails.

CSV import applies similar logic; per-row errors are summarized after import.

## 17) Manual Date Entry (Auto Formatting)
Modal date fields are converted to text inputs permitting manual typing. As the user types digits, the input auto-formats to `YYYY-MM-DD` (inserting dashes after year and month). Invalid final patterns highlight the field (`error` class) on blur.

Behavior details:
- Non-digit characters are stripped.
- Maximum 8 digits accepted (YYYYMMDD) then rendered as `YYYY-MM-DD`.
- Partial input allowed; validation only enforced on blur/submit.
- Server receives already formatted `YYYY-MM-DD` strings.

## 18) Unsaved Form Change Protection
All create/edit modals track field modifications. If the user attempts to close the modal (overlay click, close button, ESC key) with unsaved changes:

- A confirmation prompt appears: *"Perubahan belum disimpan. Keluar tanpa menyimpan?"*
- Choosing Cancel keeps the modal open; choosing OK discards changes.
- View and Filter modals are excluded (no prompt).

Implementation summary:
- `openModal()` sets `modal.dataset.dirty = 'false'` and attaches listeners to inputs to mark dirty.
- `closeModal()` checks `modal.dataset.dirty` and `context.action` before prompting.
- ESC key handling integrated with the same guard.

- Add unit tests for metrics calculations
- Add pagination & server-side filtering endpoints (UI currently handles client-side)
- Implement refresh token rotation + revoke list
- Add audit export (CSV/JSON) for activity logs
- Inline form validation messaging for date field (current: CSS highlight only)
