import express from 'express';
import bodyParser from 'body-parser';
import cors from 'cors';
import jwt from 'jsonwebtoken';
import bcrypt from 'bcryptjs';
import fs from 'fs';
import path from 'path';
import helmet from 'helmet';
import compression from 'compression';
import dotenv from 'dotenv';
import rateLimit from 'express-rate-limit';
import { RateLimiterMemory } from 'rate-limiter-flexible';
import { initDb } from './database.js';
import { logger, requestLogger } from './logger.js';

dotenv.config();

function isStrongPassword(pw='') {
  return pw.length >= 8 && /[A-Z]/.test(pw) && /[a-z]/.test(pw) && /\d/.test(pw);
}

export async function createApp() {
  const app = express();
  if (process.env.TRUST_PROXY === 'true' || process.env.NODE_ENV === 'production') {
    app.set('trust proxy', 1);
  }
  const SECRET = process.env.JWT_SECRET || 'dev-insecure-secret';
  const LOCKOUT_MINUTES = parseInt(process.env.LOCKOUT_MINUTES || '15', 10);
  const db = await initDb();
  logger.info({ path: path.resolve('data/travelops.db'), dialect: db.dialect }, 'Database config');

  async function logActivity(username, action, entity, recordId = null, description='') {
    try {
      await db.run('INSERT INTO activity_logs (username, action, entity, record_id, description) VALUES (?,?,?,?,?)', [username, action, entity, recordId, description]);
    } catch (err) {
      logger.error({ err }, 'Failed to log activity');
    }
  }

  app.use(cors({ origin: process.env.CORS_ORIGIN ? process.env.CORS_ORIGIN.split(',') : undefined, credentials: true }));
  app.use(helmet({
    crossOriginResourcePolicy: { policy: 'cross-origin' },
    contentSecurityPolicy: {
      useDefaults: true,
      directives: {
        defaultSrc: ["'self'"],
          scriptSrc: ["'self'", "https://cdn.jsdelivr.net"],
  styleSrc: ["'self'", "'unsafe-inline'", "https://fonts.googleapis.com", "https://cdnjs.cloudflare.com"],
        fontSrc: ["'self'", "https://fonts.gstatic.com"],
        imgSrc: ["'self'", 'data:'],
  connectSrc: ["'self'", "https://cdn.jsdelivr.net"],
        objectSrc: ["'none'"],
        frameAncestors: ["'none'"],
        baseUri: ["'self'"]
      }
    }
  }));
  app.use(compression());
  app.use(requestLogger);
  const limiter = rateLimit({
    windowMs: parseInt(process.env.RATE_LIMIT_WINDOW_MS || '60000', 10),
    max: parseInt(process.env.RATE_LIMIT_MAX || '100', 10),
    standardHeaders: true,
    legacyHeaders: false
  });
  app.use(limiter);
  app.use(bodyParser.json());
  app.use(express.static('public'));
  // Avoid favicon 404s in environments without an icon
  app.get('/favicon.ico', (req,res)=>res.status(204).end());

  app.get('/', (req,res) => res.redirect('/login.html'));

  function authMiddleware(required = true) {
    return async (req, res, next) => {
      const authHeader = req.headers.authorization || '';
      const token = authHeader.replace('Bearer ', '');
      if (!token && required) return res.status(401).json({ error: 'No token' });
      if (!token) return next();
      try {
        const decoded = jwt.verify(token, SECRET);
        req.user = decoded;
        next();
      } catch (err) {
        return res.status(403).json({ error: 'Invalid or expired token' });
      }
    };
  }

  app.post('/api/login', async (req,res) => {
    try {
      if (!app.locals.loginLimiter) {
        app.locals.loginLimiter = new RateLimiterMemory({
          points: parseInt(process.env.LOGIN_MAX_PER_WINDOW || '10', 10),
            duration: parseInt(process.env.LOGIN_WINDOW_SEC || '60', 10),
            keyPrefix: 'login'
        });
      }
      await app.locals.loginLimiter.consume(req.ip);
    } catch {
      return res.status(429).json({ error: 'Terlalu banyak percobaan login. Coba lagi nanti.' });
    }
    const { username, password } = req.body;
    const now = Date.now();
    let user = await db.get('SELECT * FROM users WHERE username=?', [username]);
    if (!user) {
      // If no admin exists yet (fresh DB or mis-seeded), auto-create default admin
      try {
        const ac = await db.get("SELECT COUNT(*) AS c FROM users WHERE type='admin'");
        const adminCount = Number((ac && (ac.c ?? ac.count)) ?? 0);
        if (adminCount === 0) {
          const seedUser = process.env.ADMIN_USERNAME || 'admin';
          const seedPass = process.env.ADMIN_PASSWORD || 'Admin1234!';
          const hashed = await bcrypt.hash(seedPass, 10);
          const r = await db.run('INSERT INTO users (username,password,name,email,type) VALUES (?,?,?,?,?)', [seedUser, hashed, 'Administrator', 'admin@example.com', 'admin']);
          await logActivity(seedUser, 'ADMIN_SEED_CREATE', 'users', r.lastID, 'Auto-seeded admin (no admins present)');
          return res.status(409).json({ error: 'Admin otomatis dibuat. Silakan login ulang dengan kredensial admin default.', username: seedUser });
        }
      } catch (e) {
        logger.error({ err: e }, 'Auto-seed admin check failed');
      }
      return res.status(401).json({ error: 'User tidak ditemukan', hint: 'Pastikan username benar. Default admin biasanya "admin" kecuali diubah via ADMIN_USERNAME.' });
    }
    if (user.type !== 'admin' && user.locked_until) {
      const lockedUntilMs = Date.parse(user.locked_until);
      if (!isNaN(lockedUntilMs) && lockedUntilMs > now) {
        const minutesLeft = Math.ceil((lockedUntilMs - now)/60000);
        return res.status(423).json({ error: `Akun terkunci. Coba lagi dalam ${minutesLeft} menit` });
      }
    }
    const valid = await bcrypt.compare(password, user.password);
    if (!valid) {
      if (user.type !== 'admin') {
        const attempts = (user.failed_attempts || 0) + 1;
        let lockedUntil = null;
        if (attempts >= 3) lockedUntil = new Date(Date.now() + LOCKOUT_MINUTES*60000).toISOString();
        await db.run('UPDATE users SET failed_attempts=?, locked_until=? WHERE id=?', [attempts, lockedUntil, user.id]);
        if (lockedUntil) {
          await logActivity(username, 'LOCKED', 'users', user.id, `Account locked after ${attempts} failed attempts`);
          return res.status(423).json({ error: `Akun terkunci selama ${LOCKOUT_MINUTES} menit` });
        }
      }
      await logActivity(username, 'LOGIN_FAIL', 'auth', user.id, 'Bad password');
      return res.status(401).json({ error: 'Password salah' });
    }
    if (user.type !== 'admin') await db.run('UPDATE users SET failed_attempts=0, locked_until=NULL WHERE id=?', [user.id]);
    const safeUser = { id: user.id, username: user.username, name: user.name, email: user.email, type: user.type };
  const TOKEN_EXPIRES = process.env.JWT_EXPIRES || '30m';
  const token = jwt.sign(safeUser, SECRET, { expiresIn: TOKEN_EXPIRES });
    await logActivity(username, 'LOGIN', 'auth', user.id);
    res.json({ ...safeUser, token });
  });

  app.post('/api/logout', (req,res)=>res.json({ ok:true }));
  // Refresh endpoint with configurable grace window to avoid race-based premature logout.
  // IMPORTANT: Do NOT use authMiddleware here because it enforces expiration strictly.
  // We manually verify with ignoreExpiration, then apply grace logic.
  // Allows refresh up to REFRESH_GRACE_SECONDS (default 120) AFTER nominal expiry so proactive refresh
  // tolerates clock skew / tab sleep. Returns 403 only when beyond grace or signature invalid.
  app.post('/api/refresh', async (req,res)=>{
    const token = (req.headers.authorization || '').replace('Bearer ', '');
    if (!token) return res.status(401).json({ error: 'No token' });
    try {
      const decoded = jwt.verify(token, SECRET, { ignoreExpiration: true });
      const nowSec = Math.floor(Date.now()/1000);
      const GRACE_SECONDS = parseInt(process.env.REFRESH_GRACE_SECONDS || '120', 10);
      // Clamp negative (not yet expired) to 0 for simpler logic
      const expSec = decoded.exp;
      if (!expSec) return res.status(403).json({ error: 'Token missing exp' });
      const secondsPastExpiry = Math.max(0, nowSec - expSec);
      if (secondsPastExpiry > GRACE_SECONDS) {
        return res.status(403).json({ error: 'Token expired' });
      }
      const { iat, exp, ...payload } = decoded; // strip timing claims
      const TOKEN_EXPIRES = process.env.JWT_EXPIRES || '30m';
      const newToken = jwt.sign(payload, SECRET, { expiresIn: TOKEN_EXPIRES });
      return res.json({ token: newToken });
    } catch (err) {
      return res.status(403).json({ error: 'Invalid token' });
    }
  });

  const tables = ['sales','tours','documents','targets','regions','users','telecom','hotel_bookings'];
  const staffOwnedTables = new Set(['sales','tours','documents','targets','telecom','hotel_bookings']);

  for (const t of tables) {
    app.get(`/api/${t}`, authMiddleware(), async (req,res)=>{
      if (t === 'users' && req.user.type === 'basic') return res.status(403).json({ error: 'Unauthorized' });
      // Provide region_name join enrichment for sales and tours when region_id exists
      try {
        let rows;
        const { month, year, staff, region, dateType } = req.query;
        const isPg = db.dialect === 'postgres';
        
        // Build WHERE clause for filtering
        let conditions = [];
        let params = [];
        
        if (month && (t === 'sales' || t === 'tours' || t === 'documents')) {
          let dateField = t === 'sales' ? 'transaction_date' : t === 'documents' ? 'receive_date' : 'departure_date';
          // For tours, allow filtering by registration_date or departure_date
          if (t === 'tours' && dateType === 'registration') {
            dateField = 'registration_date';
          }
          if (isPg) {
            conditions.push(`TO_CHAR(${dateField}, 'MM')=$${params.length+1}::TEXT`);
            params.push(month.padStart(2,'0'));
          } else {
            conditions.push(`strftime('%m', ${dateField})=?`);
            params.push(month.padStart(2,'0'));
          }
        }
        
        if (year && (t === 'sales' || t === 'tours' || t === 'documents')) {
          let dateField = t === 'sales' ? 'transaction_date' : t === 'documents' ? 'receive_date' : 'departure_date';
          // For tours, allow filtering by registration_date or departure_date
          if (t === 'tours' && dateType === 'registration') {
            dateField = 'registration_date';
          }
          if (isPg) {
            conditions.push(`TO_CHAR(${dateField}, 'YYYY')=$${params.length+1}::TEXT`);
            params.push(year);
          } else {
            conditions.push(`strftime('%Y', ${dateField})=?`);
            params.push(year);
          }
        }
        
        if (staff && staffOwnedTables.has(t)) {
          if (isPg) {
            conditions.push(`staff_name=$${params.length+1}::TEXT`);
            params.push(staff);
          } else {
            conditions.push(`staff_name=?`);
            params.push(staff);
          }
        }
        
        if (region && (t === 'sales' || t === 'tours')) {
          if (isPg) {
            conditions.push(`region_id=$${params.length+1}::INTEGER`);
            params.push(region);
          } else {
            conditions.push(`region_id=?`);
            params.push(region);
          }
        }
        
        const whereClause = conditions.length ? 'WHERE ' + conditions.join(' AND ') : '';
        
        if (t === 'sales') {
          rows = await db.all(`SELECT s.*, r.region_name FROM sales s LEFT JOIN regions r ON r.id = s.region_id ${whereClause}`, params);
        } else if (t === 'tours') {
          rows = await db.all(`SELECT t.*, r.region_name FROM tours t LEFT JOIN regions r ON r.id = t.region_id ${whereClause}`, params);
        } else if (t === 'documents') {
          rows = await db.all(`SELECT * FROM ${t} ${whereClause}`, params);
        } else {
          rows = await db.all(`SELECT * FROM ${t}`);
        }
        res.json(rows);
      } catch (err) {
        console.error('List fetch error:', t, err);
        res.status(500).json({ error: 'Failed to fetch '+t });
      }
    });
    app.post(`/api/${t}`, authMiddleware(), async (req,res)=>{
      if (t === 'users' && req.user.type !== 'admin') return res.status(403).json({ error:'Unauthorized' });
      if (t === 'users' && req.body.password) {
        if (!isStrongPassword(req.body.password)) return res.status(400).json({ error:'Password harus minimal 8 karakter, mengandung huruf besar, huruf kecil dan angka' });
        req.body.password = await bcrypt.hash(req.body.password, 10);
      }
      if (staffOwnedTables.has(t)) {
        if (req.user.type === 'basic') req.body.staff_name = req.user.name; else if (!req.body.staff_name) req.body.staff_name = req.user.name;
      }
      // Sales: allow optional region_id, but validate if provided
      if (t === 'sales' && req.body.region_id) {
        const r = await db.get('SELECT id FROM regions WHERE id=?',[req.body.region_id]);
        if (!r) return res.status(400).json({ error: 'Invalid region_id' });
      }
      const keys = Object.keys(req.body);
      const values = Object.values(req.body);
      const placeholders = keys.map(()=>'?').join(',');
      const sql = `INSERT INTO ${t} (${keys.join(',')}) VALUES (${placeholders})`;
      const result = await db.run(sql, values);
      await logActivity(req.user.username, 'CREATE', t, result.lastID, JSON.stringify(req.body));
      res.json({ id: result.lastID });
    });
    app.put(`/api/${t}/:id`, authMiddleware(), async (req,res)=>{
      if (t === 'users' && req.user.type !== 'admin') return res.status(403).json({ error:'Unauthorized' });
      if (req.user.type === 'basic') {
        const record = await db.get(`SELECT * FROM ${t} WHERE id=?`, [req.params.id]);
        if (!record) return res.status(404).json({ error:'Not found' });
        if ('staff_name' in record && record.staff_name !== req.user.name) return res.status(403).json({ error:'Unauthorized edit (ownership mismatch)' });
        if ('staff_name' in record && 'staff_name' in req.body) req.body.staff_name = record.staff_name;
      }
      if (t === 'sales' && 'region_id' in req.body && req.body.region_id) {
        const r = await db.get('SELECT id FROM regions WHERE id=?',[req.body.region_id]);
        if (!r) return res.status(400).json({ error: 'Invalid region_id' });
      }
      const keys = Object.keys(req.body);
      const values = Object.values(req.body);
      const set = keys.map(k=>`${k}=?`).join(',');
      await db.run(`UPDATE ${t} SET ${set} WHERE id=?`, [...values, req.params.id]);
      await logActivity(req.user.username, 'UPDATE', t, req.params.id, JSON.stringify(req.body));
      res.json({ updated:true });
    });
    app.delete(`/api/${t}/:id`, authMiddleware(), async (req,res)=>{
      if (req.user.type === 'basic') return res.status(403).json({ error:'Unauthorized' });
      const id = req.params.id;
      await db.run(`DELETE FROM ${t} WHERE id=?`, [id]);
      await logActivity(req.user.username, 'DELETE', t, id, 'Record deleted');
      res.json({ deleted:true });
    });
  }

  app.get('/api/metrics', authMiddleware(), async (req,res)=>{
    try {
      const { month, year, staff, region } = req.query; 
      const isPg = db.dialect === 'postgres';
      
      // Helper to build WHERE clause with fresh params each time
      const buildWhere = (field, opts = {}) => {
        const { allowRegion = true } = opts;
        const params = [];
        const conditions = [];
        
        if (month) {
          if (isPg) {
            conditions.push(`TO_CHAR(${field}, 'MM')=$${params.length+1}::TEXT`);
            params.push(month.padStart(2,'0'));
          } else {
            conditions.push(`strftime('%m', ${field})=?`);
            params.push(month.padStart(2,'0'));
          }
        }
        
        if (year) {
          if (isPg) {
            conditions.push(`TO_CHAR(${field}, 'YYYY')=$${params.length+1}::TEXT`);
            params.push(year);
          } else {
            conditions.push(`strftime('%Y', ${field})=?`);
            params.push(year);
          }
        }
        
        if (staff) {
          conditions.push(isPg ? `staff_name=$${params.length+1}::TEXT` : `staff_name=?`);
          params.push(staff);
        }
        
        if (region && allowRegion) {
          conditions.push(isPg ? `region_id=$${params.length+1}::INTEGER` : `region_id=?`);
          params.push(region);
        }
        
        return {
          where: conditions.length ? 'WHERE ' + conditions.join(' AND ') : '',
          params: params
        };
      };
      
      // Execute queries with independent parameter arrays
  const salesQuery = buildWhere('transaction_date', { allowRegion: false });
      const sales = await db.get(
        `SELECT SUM(sales_amount) AS total_sales, SUM(profit_amount) AS total_profit FROM sales ${salesQuery.where}`,
        salesQuery.params
      );
      
      const targets = await db.get('SELECT SUM(target_sales) AS target_sales, SUM(target_profit) AS target_profit FROM targets');
      
      const toursQuery = buildWhere('departure_date');
      const participants = await db.get(
        `SELECT SUM(jumlah_peserta) AS total_participants FROM tours ${toursQuery.where}`,
        toursQuery.params
      );
      
  const docsQuery = buildWhere('receive_date', { allowRegion: false });
      const documents = await db.get(
        `SELECT COUNT(*) AS total_docs, SUM(CASE WHEN process_type='Normal' THEN 1 ELSE 0 END) AS normal, SUM(CASE WHEN process_type='Kilat' THEN 1 ELSE 0 END) AS kilat FROM documents ${docsQuery.where}`,
        docsQuery.params
      );
      
      const monthlyQuery = buildWhere('departure_date');
      const participants_by_month = await db.all(
        isPg 
          ? `SELECT TO_CHAR(departure_date,'MM') AS month, SUM(jumlah_peserta) AS participants FROM tours ${monthlyQuery.where} GROUP BY month`
          : `SELECT strftime('%m', departure_date) AS month, SUM(jumlah_peserta) AS participants FROM tours ${monthlyQuery.where} GROUP BY month`,
        monthlyQuery.params
      );
      
      const regionQuery = buildWhere('t.departure_date');
      const participants_by_region = await db.all(
        `SELECT r.region_name, SUM(t.jumlah_peserta) AS participants
         FROM tours t
         JOIN regions r ON r.id = t.region_id
         ${regionQuery.where}
         GROUP BY r.region_name`,
        regionQuery.params
      );
      
      res.json({ sales, targets, participants, documents, participants_by_month, participants_by_region });
    } catch (err) {
      console.error('Metrics endpoint error:', err);
      res.status(500).json({ error: 'Failed to fetch metrics', details: err.message });
    }
  });

  app.post('/api/users/reset-password', authMiddleware(), async (req,res)=>{
    const { username, password } = req.body; if (req.user.username !== username && req.user.type !== 'admin') return res.status(403).json({ error:'Unauthorized' }); if (!isStrongPassword(password)) return res.status(400).json({ error:'Password lemah (min 8, huruf besar, huruf kecil, angka)' }); const hashed = await bcrypt.hash(password,10); await db.run('UPDATE users SET password=? WHERE username=?',[hashed, username]); res.json({ ok:true });
  });
  app.post('/api/users/:username/reset', authMiddleware(), async (req,res)=>{ if (req.user.type !== 'admin') return res.status(403).json({ error:'Unauthorized' }); const { password } = req.body; if (!isStrongPassword(password)) return res.status(400).json({ error:'Password lemah (min 8, huruf besar, huruf kecil, angka)' }); const hashed = await bcrypt.hash(password,10); await db.run('UPDATE users SET password=? WHERE username=?',[hashed, req.params.username]); res.json({ ok:true }); });

  app.get('/api/backup', authMiddleware(), async (req,res)=>{ if (req.user.type !== 'admin') return res.status(403).json({ error:'Unauthorized' }); if (db.dialect === 'postgres') return res.status(400).json({ error:'Backup endpoint hanya untuk mode SQLite' }); const src = path.resolve('data/travelops.db'); const backupDir = path.resolve('backup'); if (!fs.existsSync(backupDir)) fs.mkdirSync(backupDir); const dest = path.join(backupDir, `travelops_${new Date().toISOString().slice(0,10)}.db`); fs.copyFileSync(src,dest); res.json({ ok:true, file:dest }); });

  app.get('/api/activity_logs', authMiddleware(), async (req,res)=>{ if (req.user.type !== 'admin') return res.status(403).json({ error:'Unauthorized' }); const isPg = db.dialect === 'postgres'; const sql = isPg ? 'SELECT * FROM activity_logs ORDER BY created_at DESC LIMIT 500' : 'SELECT * FROM activity_logs ORDER BY datetime(created_at) DESC LIMIT 500'; const rows = await db.all(sql); res.json(rows); });

  app.post('/api/users/:username/unlock', authMiddleware(), async (req,res)=>{ if (req.user.type !== 'admin') return res.status(403).json({ error:'Unauthorized' }); const user = await db.get('SELECT * FROM users WHERE username=?',[req.params.username]); if (!user) return res.status(404).json({ error:'User not found' }); await db.run('UPDATE users SET failed_attempts=0, locked_until=NULL WHERE id=?',[user.id]); await logActivity(req.user.username,'UNLOCK','users',user.id,'Account unlocked by admin'); res.json({ ok:true }); });

  app.post('/api/admin/seed', authMiddleware(), async (req,res)=>{ if (req.user.type !== 'admin') return res.status(403).json({ error:'Unauthorized' }); const username = req.body.username || process.env.ADMIN_USERNAME || 'admin'; const name = req.body.name || 'Administrator'; const email = req.body.email || 'admin@example.com'; const password = req.body.password || process.env.ADMIN_PASSWORD || 'Admin1234!'; if (!isStrongPassword(password)) return res.status(400).json({ error:'Password lemah (min 8, huruf besar, huruf kecil, angka)' }); const hashed = await bcrypt.hash(password,10); const existing = await db.get('SELECT * FROM users WHERE username=?',[username]); if (existing){ await db.run('UPDATE users SET password=?, name=?, email=?, type=? WHERE id=?',[hashed, name, email,'admin', existing.id]); await logActivity(req.user.username,'ADMIN_SEED_UPDATE','users',existing.id,`Updated admin user ${username}`); return res.json({ ok:true, updated:true }); } else { const r = await db.run('INSERT INTO users (username,password,name,email,type) VALUES (?,?,?,?,?)',[username, hashed, name, email,'admin']); await logActivity(req.user.username,'ADMIN_SEED_CREATE','users',r.lastID,`Created admin user ${username}`); return res.json({ ok:true, created:true, id:r.lastID }); } });

  app.get('/healthz', (req,res)=>{ res.json({ status:'ok', uptime_s: process.uptime(), dialect: db.dialect, timestamp: new Date().toISOString() }); });

  // Optional debug: list admin usernames (only if explicitly enabled via env)
  if (process.env.EXPOSE_ADMIN_USERNAMES === 'true') {
    app.get('/api/debug/admin-usernames', async (req,res)=>{
      try {
        const rows = await db.all("SELECT username FROM users WHERE type='admin'");
        res.json({ admins: rows.map(r=>r.username) });
      } catch (err) {
        res.status(500).json({ error: 'Failed to fetch admin usernames' });
      }
    });
  }

  // Central error handler
  app.use((err, req, res, next)=>{ logger.error({ err: err.message, stack: err.stack }, 'Unhandled error'); if (res.headersSent) return next(err); res.status(err.status || 500).json({ error: err.message || 'Internal Server Error' }); });

  return { app, db };
}

export function startServer(app) {
  const BASE_PORT = parseInt(process.env.PORT || '3000', 10);
  let server;
  function listen(port, attempt=0) {
    server = app.listen(port, ()=>{ logger.info({ port, envPort: process.env.PORT, attempt }, 'Server started'); });
    server.on('error', (err)=>{ if (err.code === 'EADDRINUSE' && attempt < 5){ const nextPort = port + 1; logger.warn({ port, nextPort }, 'Port in use, trying next port'); setTimeout(()=>listen(nextPort, attempt+1),250); } else { logger.error({ err, port, attempt }, 'Failed to start server'); process.exit(1); } });
  }
  listen(BASE_PORT);
  const shutdown = async (signal)=>{ logger.info({ signal }, 'Shutdown initiated'); server.close(()=>{ logger.info('HTTP server closed'); process.exit(0); }); try { if (app.locals.db?.dialect === 'postgres' && app.locals.db?._pool){ await app.locals.db._pool.end(); logger.info('Postgres pool ended'); } } catch (err){ logger.error({ err }, 'Error during pool end'); } setTimeout(()=>process.exit(1),5000); };
  ['SIGINT','SIGTERM'].forEach(sig=>process.on(sig, ()=>shutdown(sig)));
}
