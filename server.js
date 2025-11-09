import express from "express";
import bodyParser from "body-parser";
import cors from "cors";
import jwt from "jsonwebtoken";
import bcrypt from "bcryptjs";
import fs from "fs";
import path from "path";
import helmet from "helmet";
import compression from "compression";
import { initDb } from "./database.js";
import dotenv from 'dotenv';
import rateLimit from 'express-rate-limit';
import { RateLimiterMemory } from 'rate-limiter-flexible';
import { logger, requestLogger } from './logger.js';
dotenv.config();

const app = express();
// Respect X-Forwarded-For when behind a reverse proxy (Render)
if (process.env.TRUST_PROXY === 'true' || process.env.NODE_ENV === 'production') {
  app.set('trust proxy', 1);
}
// Base port (will auto-increment on conflict up to a few times)
const BASE_PORT = parseInt(process.env.PORT || '3000', 10);
const SECRET = process.env.JWT_SECRET || "dev-insecure-secret"; // use env in production
const LOCKOUT_MINUTES = parseInt(process.env.LOCKOUT_MINUTES || '15', 10);

const db = await initDb();

async function logActivity(username, action, entity, recordId = null, description = '') {
  try {
    await db.run(
      `INSERT INTO activity_logs (username, action, entity, record_id, description) VALUES (?,?,?,?,?)`,
      [username, action, entity, recordId, description]
    );
  } catch (err) {
    console.error('Gagal mencatat aktivitas:', err);
  }
}

app.use(cors({
  origin: process.env.CORS_ORIGIN ? process.env.CORS_ORIGIN.split(',') : undefined,
  credentials: true
}));
app.use(helmet({
  crossOriginResourcePolicy: { policy: "cross-origin" }
}));
app.use(compression());
app.use(requestLogger);
// Basic rate limiting (global)
const limiter = rateLimit({
  windowMs: parseInt(process.env.RATE_LIMIT_WINDOW_MS || '60000', 10),
  max: parseInt(process.env.RATE_LIMIT_MAX || '100', 10),
  standardHeaders: true,
  legacyHeaders: false
});
app.use(limiter);
app.use(bodyParser.json());
app.use(express.static("public"));

// Redirect root ke login
app.get("/", (req, res) => res.redirect("/login.html"));

/* === AUTH MIDDLEWARE === */
function authMiddleware(required = true) {
  return async (req, res, next) => {
    const authHeader = req.headers.authorization || "";
    const token = authHeader.replace("Bearer ", "");
    if (!token && required) return res.status(401).json({ error: "No token" });
    if (!token) return next();
    try {
      const decoded = jwt.verify(token, SECRET);
      req.user = decoded;
      next();
    } catch (err) {
      return res.status(403).json({ error: "Invalid or expired token" });
    }
  };
}

/* === LOGIN (FIXED + DEBUG) === */
logger.info({ path: path.resolve("data/travelops.db"), dialect: process.env.DATABASE_URL ? 'postgres' : 'sqlite' }, 'Database config');

app.post("/api/login", async (req, res) => {
  // Per-IP rate limit for login endpoint
  try {
    if (!app.locals.loginLimiter) {
      app.locals.loginLimiter = new RateLimiterMemory({
        points: parseInt(process.env.LOGIN_MAX_PER_WINDOW || '10', 10), // attempts
        duration: parseInt(process.env.LOGIN_WINDOW_SEC || '60', 10), // per N seconds
        keyPrefix: 'login'
      });
    }
    await app.locals.loginLimiter.consume(req.ip);
  } catch (rlRejected) {
    return res.status(429).json({ error: 'Terlalu banyak percobaan login. Coba lagi nanti.' });
  }
  const { username, password } = req.body;
  const now = Date.now();
  const user = await db.get("SELECT * FROM users WHERE username=?", [username]);

  if (!user) return res.status(401).json({ error: "User tidak ditemukan" });

  // Check lockout (admins bypass lockout)
  if (user.type !== 'admin' && user.locked_until) {
    const lockedUntilMs = Date.parse(user.locked_until);
    if (!isNaN(lockedUntilMs) && lockedUntilMs > now) {
      const minutesLeft = Math.ceil((lockedUntilMs - now) / 60000);
      return res.status(423).json({ error: `Akun terkunci. Coba lagi dalam ${minutesLeft} menit` });
    }
  }

  const valid = await bcrypt.compare(password, user.password);

  if (!valid) {
    // Increment failed attempts for non-admin
    if (user.type !== 'admin') {
      const attempts = (user.failed_attempts || 0) + 1;
      let lockedUntil = null;
      if (attempts >= 3) {
        // Lock for configured minutes
        lockedUntil = new Date(Date.now() + LOCKOUT_MINUTES * 60000).toISOString();
      }
      await db.run("UPDATE users SET failed_attempts=?, locked_until=? WHERE id=?", [attempts, lockedUntil, user.id]);
      if (lockedUntil) {
        await logActivity(username, 'LOCKED', 'users', user.id, `Account locked after ${attempts} failed attempts`);
        return res.status(423).json({ error: `Akun terkunci selama ${LOCKOUT_MINUTES} menit` });
      }
    }
    await logActivity(username, 'LOGIN_FAIL', 'auth', user.id, 'Bad password');
    return res.status(401).json({ error: "Password salah" });
  }

  // Reset failed attempts on success (non-admin)
  if (user.type !== 'admin') {
    await db.run("UPDATE users SET failed_attempts=0, locked_until=NULL WHERE id=?", [user.id]);
  }

  const safeUser = {
    id: user.id,
    username: user.username,
    name: user.name,
    email: user.email,
    type: user.type,
  };
  const token = jwt.sign(safeUser, SECRET, { expiresIn: '8h' });
  await logActivity(username, 'LOGIN', 'auth', user.id);
  res.json({ ...safeUser, token });
});

/* === LOGOUT === */
app.post("/api/logout", (req, res) => res.json({ ok: true }));

/* === REFRESH TOKEN === */
app.post("/api/refresh", authMiddleware(false), async (req, res) => {
  const token = (req.headers.authorization || "").replace("Bearer ", "");
  if (!token) return res.status(401).json({ error: "No token" });
  try {
    const decoded = jwt.verify(token, SECRET);
    const newToken = jwt.sign(decoded, SECRET, { expiresIn: "8h" });
    res.json({ token: newToken });
  } catch {
    res.status(403).json({ error: "Token expired" });
  }
});

/* === GENERIC CRUD === */
const tables = ["sales", "tours", "documents", "targets", "regions", "users", "telecom"];
// Tables that include staff_name ownership column
const staffOwnedTables = new Set(["sales", "tours", "documents", "targets", "telecom"]);

for (const t of tables) {
  // GET ALL (basic can view all; restrict users table)
  app.get(`/api/${t}`, authMiddleware(), async (req, res) => {
    if (t === 'users' && req.user.type === 'basic') {
      return res.status(403).json({ error: 'Unauthorized' });
    }
    const rows = await db.all(`SELECT * FROM ${t}`);
    res.json(rows);
  });

  // CREATE
  app.post(`/api/${t}`, authMiddleware(), async (req, res) => {
    if (t === 'users' && req.user.type !== 'admin')
      return res.status(403).json({ error: 'Unauthorized' });
    if (t === 'users' && req.body.password)
      {
        if (!isStrongPassword(req.body.password)) {
          return res.status(400).json({ error: 'Password harus minimal 8 karakter, mengandung huruf besar, huruf kecil dan angka' });
        }
        req.body.password = await bcrypt.hash(req.body.password, 10);
      }

    // Enforce ownership for staff-owned tables
    if (staffOwnedTables.has(t)) {
      // Basic users cannot assign records to other staff; force to own name
      if (req.user.type === 'basic') {
        req.body.staff_name = req.user.name;
      } else if (!req.body.staff_name) {
        // Default to current user if not provided
        req.body.staff_name = req.user.name;
      }
    }

    const keys = Object.keys(req.body);
    const values = Object.values(req.body);
    const placeholders = keys.map(() => '?').join(',');
    const sql = `INSERT INTO ${t} (${keys.join(',')}) VALUES (${placeholders})`;
    const result = await db.run(sql, values);
    await logActivity(req.user.username, 'CREATE', t, result.lastID, JSON.stringify(req.body));
    res.json({ id: result.lastID });
  });

  // UPDATE
  app.put(`/api/${t}/:id`, authMiddleware(), async (req, res) => {
    if (t === 'users' && req.user.type !== 'admin') {
      return res.status(403).json({ error: 'Unauthorized' });
    }
    // Basic user can only edit own records (staff_name match when column exists)
    if (req.user.type === 'basic') {
      const record = await db.get(`SELECT * FROM ${t} WHERE id=?`, [req.params.id]);
      if (!record) return res.status(404).json({ error: 'Not found' });
      if ('staff_name' in record && record.staff_name !== req.user.name) {
        return res.status(403).json({ error: 'Unauthorized edit (ownership mismatch)' });
      }
      // Prevent basic users from changing ownership
      if ('staff_name' in record && 'staff_name' in req.body) {
        req.body.staff_name = record.staff_name;
      }
    }
    const keys = Object.keys(req.body);
    const values = Object.values(req.body);
    const set = keys.map(k => `${k}=?`).join(',');
    await db.run(`UPDATE ${t} SET ${set} WHERE id=?`, [...values, req.params.id]);
    await logActivity(req.user.username, 'UPDATE', t, req.params.id, JSON.stringify(req.body));
    res.json({ updated: true });
  });

  // DELETE
  app.delete(`/api/${t}/:id`, authMiddleware(), async (req, res) => {
    if (req.user.type === 'basic')
      return res.status(403).json({ error: 'Unauthorized' });
    const id = req.params.id;
    await db.run(`DELETE FROM ${t} WHERE id=?`, [id]);
    await logActivity(req.user.username, 'DELETE', t, id, 'Record deleted');
    res.json({ deleted: true });
  });
}

/* === METRICS with Global Filter === */
app.get("/api/metrics", authMiddleware(), async (req, res) => {
  const { month, year, staff } = req.query;
  const isPg = db.dialect === 'postgres';

  const params = [];
  const wh = (field) => {
    const c = [];
    if (month) {
      if (isPg) { c.push(`TO_CHAR(${field}, 'MM')=$${params.length+1}`); params.push(month.padStart(2,'0')); }
      else { c.push(`strftime('%m', ${field})=?`); params.push(month.padStart(2,'0')); }
    }
    if (year) {
      if (isPg) { c.push(`TO_CHAR(${field}, 'YYYY')=$${params.length+1}`); params.push(year); }
      else { c.push(`strftime('%Y', ${field})=?`); params.push(year); }
    }
    if (staff) { c.push(isPg ? `staff_name=$${params.length+1}` : `staff_name=?`); params.push(staff); }
    return c.length ? 'WHERE ' + c.join(' AND ') : '';
  };

  const sales = await db.get(
    `SELECT SUM(sales_amount) AS total_sales, SUM(profit_amount) AS total_profit FROM sales ${wh("transaction_date")}`,
    params
  );
  const targets = await db.get(
    `SELECT SUM(target_sales) AS target_sales, SUM(target_profit) AS target_profit FROM targets`
  );
  const participants = await db.get(
    `SELECT SUM(jumlah_peserta) AS total_participants FROM tours ${wh("departure_date")}`,
    params
  );
  const documents = await db.get(
    `SELECT COUNT(*) AS total_docs,
            SUM(CASE WHEN process_type='Normal' THEN 1 ELSE 0 END) AS normal,
            SUM(CASE WHEN process_type='Kilat' THEN 1 ELSE 0 END) AS kilat
     FROM documents ${wh("receive_date")}`,
    params
  );
  const participants_by_month = await db.all(
    (isPg
      ? `SELECT TO_CHAR(departure_date,'MM') AS month, SUM(jumlah_peserta) AS participants FROM tours ${wh('departure_date')} GROUP BY month`
      : `SELECT strftime('%m', departure_date) AS month, SUM(jumlah_peserta) AS participants FROM tours ${wh('departure_date')} GROUP BY month`
    ),
    params
  );
  const regionWhere = wh('departure_date');
  const participants_by_region = await db.all(
    `SELECT r.region_name, SUM(t.jumlah_peserta) AS participants
     FROM tours t JOIN regions r ON r.id = t.region_id
     ${regionWhere ? regionWhere.replace('WHERE','WHERE ') : ''}
     GROUP BY t.region_id`,
    params
  );

  res.json({
    sales,
    targets,
    participants,
    documents,
    participants_by_month,
    participants_by_region,
  });
});

/* === RESET PASSWORD === */
app.post("/api/users/reset-password", authMiddleware(), async (req, res) => {
  const { username, password } = req.body;
  if (req.user.username !== username && req.user.type !== "admin")
    return res.status(403).json({ error: "Unauthorized" });
  if (!isStrongPassword(password)) return res.status(400).json({ error: 'Password lemah (min 8, huruf besar, huruf kecil, angka)' });
  const hashed = await bcrypt.hash(password, 10);
  await db.run("UPDATE users SET password=? WHERE username=?", [hashed, username]);
  res.json({ ok: true });
});

/* === ADMIN RESET === */
app.post("/api/users/:username/reset", authMiddleware(), async (req, res) => {
  if (req.user.type !== "admin") return res.status(403).json({ error: "Unauthorized" });
  const { password } = req.body;
  if (!isStrongPassword(password)) return res.status(400).json({ error: 'Password lemah (min 8, huruf besar, huruf kecil, angka)' });
  const hashed = await bcrypt.hash(password, 10);
  await db.run("UPDATE users SET password=? WHERE username=?", [hashed, req.params.username]);
  res.json({ ok: true });
});

/* === BACKUP === */
app.get("/api/backup", authMiddleware(), async (req, res) => {
  if (req.user.type !== "admin") return res.status(403).json({ error: "Unauthorized" });
  if (db.dialect === 'postgres') {
    return res.status(400).json({ error: 'Backup endpoint hanya untuk mode SQLite' });
  }
  const src = path.resolve("data/travelops.db");
  const backupDir = path.resolve("backup");
  if (!fs.existsSync(backupDir)) fs.mkdirSync(backupDir);
  const dest = path.join(backupDir, `travelops_${new Date().toISOString().slice(0, 10)}.db`);
  fs.copyFileSync(src, dest);
  res.json({ ok: true, file: dest });
});

app.get('/api/activity_logs', authMiddleware(), async (req, res) => {
  if (req.user.type !== 'admin')
    return res.status(403).json({ error: 'Unauthorized' });
  const isPg = db.dialect === 'postgres';
  const sql = isPg
    ? `SELECT * FROM activity_logs ORDER BY created_at DESC LIMIT 500`
    : `SELECT * FROM activity_logs ORDER BY datetime(created_at) DESC LIMIT 500`;
  const rows = await db.all(sql);
  res.json(rows);
});

// Admin unlock user account (reset failed attempts and lock)
app.post('/api/users/:username/unlock', authMiddleware(), async (req, res) => {
  if (req.user.type !== 'admin') return res.status(403).json({ error: 'Unauthorized' });
  const user = await db.get('SELECT * FROM users WHERE username=?', [req.params.username]);
  if (!user) return res.status(404).json({ error: 'User not found' });
  await db.run('UPDATE users SET failed_attempts=0, locked_until=NULL WHERE id=?', [user.id]);
  await logActivity(req.user.username, 'UNLOCK', 'users', user.id, 'Account unlocked by admin');
  res.json({ ok: true });
});

/* === START SERVER === */
app.get('/healthz', (req, res) => {
  res.json({
    status: 'ok',
    uptime_s: process.uptime(),
    dialect: db.dialect,
    timestamp: new Date().toISOString()
  });
});

let server;
function startServer(port, attempt = 0) {
  server = app.listen(port, () => {
    logger.info({ port, envPort: process.env.PORT, attempt }, 'Server started');
  });
  server.on('error', (err) => {
    if (err.code === 'EADDRINUSE' && attempt < 5) {
      const nextPort = port + 1;
      logger.warn({ port, nextPort }, 'Port in use, trying next port');
      setTimeout(() => startServer(nextPort, attempt + 1), 250);
    } else {
      logger.error({ err, port, attempt }, 'Failed to start server');
      process.exit(1);
    }
  });
}

startServer(BASE_PORT);

async function shutdown(signal) {
  logger.info({ signal }, 'Shutdown initiated');
  server.close(() => {
    logger.info('HTTP server closed');
    process.exit(0);
  });
  // Add pool end for Postgres if dialect is postgres
  try {
    if (db.dialect === 'postgres' && db._pool) {
      await db._pool.end();
      logger.info('Postgres pool ended');
    }
  } catch (err) {
    logger.error({ err }, 'Error during pool end');
  }
  setTimeout(() => process.exit(1), 5000); // force exit if hanging
}

['SIGINT','SIGTERM'].forEach(sig => process.on(sig, () => shutdown(sig)));

/* === PASSWORD POLICY === */
function isStrongPassword(pw='') {
  return pw.length >= 8 && /[A-Z]/.test(pw) && /[a-z]/.test(pw) && /\d/.test(pw);
}
