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
import { sendDepartureReminder, sendTestEmail } from './emailService.js';
import { initScheduler, manualTrigger, getReminderStats } from './notificationScheduler.js';

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
          scriptSrc: ["'self'", "https://cdn.jsdelivr.net", "https://cdnjs.cloudflare.com"],
  styleSrc: ["'self'", "'unsafe-inline'", "https://fonts.googleapis.com", "https://cdnjs.cloudflare.com"],
        fontSrc: ["'self'", "https://fonts.gstatic.com"],
        imgSrc: ["'self'", 'data:'],
  connectSrc: ["'self'", "https://cdn.jsdelivr.net", "https://cdnjs.cloudflare.com"],
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
    max: parseInt(process.env.RATE_LIMIT_MAX || '300', 10), // Increased from 100 to 300
    standardHeaders: true,
    legacyHeaders: false,
    // Skip rate limiting for static assets
    skip: (req) => {
      const staticPaths = ['/css/', '/js/', '/images/', '/fonts/', '/favicon.ico'];
      return staticPaths.some(path => req.path.startsWith(path));
    }
  });
  app.use(limiter);
  app.use(bodyParser.json());
  app.use(express.static('public', {
    setHeaders: (res, path) => {
      // Set proper MIME types for static files
      if (path.endsWith('.css')) {
        res.setHeader('Content-Type', 'text/css');
      } else if (path.endsWith('.js')) {
        res.setHeader('Content-Type', 'application/javascript');
      }
    }
  }));
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
  const TOKEN_EXPIRES = process.env.JWT_EXPIRES || '15m'; // Reduced from 30m for better security
  const token = jwt.sign(safeUser, SECRET, { expiresIn: TOKEN_EXPIRES });
    await logActivity(username, 'LOGIN', 'auth', user.id);
    res.json({ ...safeUser, token });
  });

  app.post('/api/logout', (req,res)=>res.json({ ok:true }));
  
  // Get current user info (requires valid token)
  app.get('/api/me', authMiddleware(), async (req, res) => {
    try {
      // req.user is set by authMiddleware after JWT verification
      const user = await db.get('SELECT id, username, name, email, type FROM users WHERE id=?', [req.user.id]);
      if (!user) {
        return res.status(404).json({ error: 'User not found' });
      }
      res.json(user);
    } catch (err) {
      console.error('Error fetching user:', err);
      res.status(500).json({ error: 'Failed to fetch user data' });
    }
  });
  
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
      const GRACE_SECONDS = parseInt(process.env.REFRESH_GRACE_SECONDS || '60', 10); // Reduced from 120 to 60
      // Clamp negative (not yet expired) to 0 for simpler logic
      const expSec = decoded.exp;
      if (!expSec) return res.status(403).json({ error: 'Token missing exp' });
      const secondsPastExpiry = Math.max(0, nowSec - expSec);
      if (secondsPastExpiry > GRACE_SECONDS) {
        return res.status(403).json({ error: 'Token expired' });
      }
      const { iat, exp, ...payload } = decoded; // strip timing claims
      const TOKEN_EXPIRES = process.env.JWT_EXPIRES || '15m'; // Reduced from 30m for better security
      const newToken = jwt.sign(payload, SECRET, { expiresIn: TOKEN_EXPIRES });
      return res.json({ token: newToken });
    } catch (err) {
      return res.status(403).json({ error: 'Invalid token' });
    }
  });

  const tables = ['sales','tours','documents','targets','regions','users','telecom','hotel_bookings','overtime','cruise'];
  const staffOwnedTables = new Set(['sales','tours','documents','targets','telecom','hotel_bookings','overtime','cruise']);

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
            // Cast to date if it's a text field (registration_date might be text)
            const castField = (t === 'tours' && dateType === 'registration') ? `${dateField}::date` : dateField;
            conditions.push(`TO_CHAR(${castField}, 'MM')=$${params.length+1}::TEXT`);
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
            // Cast to date if it's a text field (registration_date might be text)
            const castField = (t === 'tours' && dateType === 'registration') ? `${dateField}::date` : dateField;
            conditions.push(`TO_CHAR(${castField}, 'YYYY')=$${params.length+1}::TEXT`);
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
        } else if (t === 'overtime') {
          // For overtime: basic users see only their own, admin/semi-admin see all
          if (req.user.type === 'basic') {
            const overtimeWhere = whereClause ? `${whereClause} AND staff_name=${isPg ? `$${params.length+1}` : '?'}` : `WHERE staff_name=${isPg ? '$1' : '?'}`;
            params.push(req.user.name);
            rows = await db.all(`SELECT * FROM overtime ${overtimeWhere} ORDER BY event_date DESC`, params);
          } else {
            rows = await db.all(`SELECT * FROM overtime ${whereClause} ORDER BY event_date DESC`, params);
          }
        } else if (t === 'cruise') {
          rows = await db.all(`SELECT * FROM cruise ${whereClause} ORDER BY sailing_start DESC`, params);
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
      try {
        if (t === 'targets') console.log('📊 Targets POST request:', req.body);
        if (t === 'tours') console.log('🧳 Tours POST request:', req.body);
        if (t === 'users' && req.user.type !== 'admin') return res.status(403).json({ error:'Unauthorized' });
        if (t === 'users' && req.body.password) {
          if (!isStrongPassword(req.body.password)) return res.status(400).json({ error:'Password harus minimal 8 karakter, mengandung huruf besar, huruf kecil dan angka' });
          req.body.password = await bcrypt.hash(req.body.password, 10);
        }
        // Auto-set overtime status to 'pending' for new records
        if (t === 'overtime' && !req.body.status) {
          req.body.status = 'pending';
        }
        // Check for duplicate booking_code (only if provided)
        if (t === 'tours' && req.body.booking_code) {
          const existing = await db.get('SELECT id FROM tours WHERE booking_code=?', [req.body.booking_code]);
          if (existing) return res.status(400).json({ error: `Booking code "${req.body.booking_code}" already exists` });
        }
        if (staffOwnedTables.has(t)) {
          if (req.user.type === 'basic') req.body.staff_name = req.user.name; else if (!req.body.staff_name) req.body.staff_name = req.user.name;
        }
        // Sales: allow optional region_id, but validate if provided
        if (t === 'sales') {
          // Convert empty string to null for region_id
          if (req.body.region_id === '' || req.body.region_id === null) {
            req.body.region_id = null;
          } else if (req.body.region_id) {
            const r = await db.get('SELECT id FROM regions WHERE id=?',[req.body.region_id]);
            if (!r) return res.status(400).json({ error: 'Invalid region_id' });
          }
        }
        // Tours: validate required region_id
        if (t === 'tours' && req.body.region_id) {
          const r = await db.get('SELECT id FROM regions WHERE id=?',[req.body.region_id]);
          if (!r) return res.status(400).json({ error: 'Invalid region_id' });
        }
        const keys = Object.keys(req.body);
        const values = Object.values(req.body);
        const placeholders = keys.map(()=>'?').join(',');
        const sql = `INSERT INTO ${t} (${keys.join(',')}) VALUES (${placeholders})`;
        if (t === 'targets') console.log('📊 Targets SQL:', sql, values);
        if (t === 'tours') console.log('🧳 Tours SQL:', sql, values);
        const result = await db.run(sql, values);
        await logActivity(req.user.username, 'CREATE', t, result.lastID, JSON.stringify(req.body));
        if (t === 'targets') console.log('✅ Targets created:', result.lastID);
        if (t === 'tours') console.log('✅ Tours created:', result.lastID);
        res.json({ id: result.lastID });
      } catch (error) {
        console.error(`POST /api/${t} error:`, error);
        res.status(500).json({ error: error.message || 'Failed to create record' });
      }
    });
    app.put(`/api/${t}/:id`, authMiddleware(), async (req,res)=>{
      try {
        if (t === 'targets') console.log('📊 Targets PUT request:', req.params.id, req.body);
        if (t === 'users' && req.user.type !== 'admin') return res.status(403).json({ error:'Unauthorized' });
        // Overtime edit is admin-only
        if (t === 'overtime' && req.user.type !== 'admin') return res.status(403).json({ error:'Only admin can edit overtime records' });
        if (req.user.type === 'basic') {
          const record = await db.get(`SELECT * FROM ${t} WHERE id=?`, [req.params.id]);
          if (!record) return res.status(404).json({ error:'Not found' });
          if ('staff_name' in record && record.staff_name !== req.user.name) return res.status(403).json({ error:'Unauthorized edit (ownership mismatch)' });
          if ('staff_name' in record && 'staff_name' in req.body) req.body.staff_name = record.staff_name;
        }
        if (t === 'sales' && 'region_id' in req.body) {
          // Convert empty string to null for region_id
          if (req.body.region_id === '' || req.body.region_id === null) {
            req.body.region_id = null;
          } else if (req.body.region_id) {
            const r = await db.get('SELECT id FROM regions WHERE id=?',[req.body.region_id]);
            if (!r) return res.status(400).json({ error: 'Invalid region_id' });
          }
        }
        // Tours: validate required region_id
        if (t === 'tours' && 'region_id' in req.body && req.body.region_id) {
          const r = await db.get('SELECT id FROM regions WHERE id=?',[req.body.region_id]);
          if (!r) return res.status(400).json({ error: 'Invalid region_id' });
        }
        const keys = Object.keys(req.body);
        const values = Object.values(req.body);
        const set = keys.map(k=>`${k}=?`).join(',');
        const sql = `UPDATE ${t} SET ${set} WHERE id=?`;
        if (t === 'targets') console.log('📊 Targets UPDATE SQL:', sql, [...values, req.params.id]);
        await db.run(sql, [...values, req.params.id]);
        await logActivity(req.user.username, 'UPDATE', t, req.params.id, JSON.stringify(req.body));
        if (t === 'targets') console.log('✅ Targets updated:', req.params.id);
        res.json({ updated:true });
      } catch (error) {
        console.error(`PUT /api/${t}/:id error:`, error);
        res.status(500).json({ error: error.message || 'Failed to update record' });
      }
    });
    app.delete(`/api/${t}/:id`, authMiddleware(), async (req,res)=>{
      // Overtime delete is admin-only
      if (t === 'overtime' && req.user.type !== 'admin') return res.status(403).json({ error:'Only admin can delete overtime records' });
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
        `SELECT COALESCE(SUM(sales_amount), 0) AS total_sales, COALESCE(SUM(profit_amount), 0) AS total_profit FROM sales ${salesQuery.where}`,
        salesQuery.params
      );
      
      const targets = await db.get('SELECT COALESCE(SUM(target_sales), 0) AS target_sales, COALESCE(SUM(target_profit), 0) AS target_profit FROM targets');
      
      const toursQuery = buildWhere('departure_date');
      const participants = await db.get(
        `SELECT COALESCE(SUM(jumlah_peserta), 0) AS total_participants FROM tours ${toursQuery.where}`,
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

  // ============================================
  // REPORTS API - ADMIN & SEMI-ADMIN ONLY
  // ============================================
  app.get('/api/reports/:reportType', authMiddleware(), async (req, res) => {
    // Role-based access control
    if (req.user.type !== 'admin' && req.user.type !== 'semi-admin') {
      return res.status(403).json({ error: 'Access denied. Reports are only available for admin and semi-admin users.' });
    }

    const { reportType } = req.params;
    const { from, to, staff, region, groupBy } = req.query;
    const isPg = db.dialect === 'postgres';

    try {
      let reportData = {};

      switch (reportType) {
        case 'sales-summary':
          reportData = await generateSalesSummary(db, isPg, { from, to, staff, region });
          break;
        case 'sales-detailed':
          reportData = await generateSalesDetailed(db, isPg, { from, to, staff, region });
          break;
        case 'tours-profitability':
          reportData = await generateToursProfitability(db, isPg, { from, to, staff, region });
          break;
        case 'tours-participants':
          reportData = await generateToursParticipants(db, isPg, { from, to, staff, region });
          break;
        case 'documents-status':
          reportData = await generateDocumentsStatus(db, isPg, { from, to, staff, region });
          break;
        case 'staff-performance':
          reportData = await generateStaffPerformance(db, isPg, { from, to, region });
          break;
        case 'regional-comparison':
          reportData = await generateRegionalComparison(db, isPg, { from, to });
          break;
        case 'executive-summary':
          reportData = await generateExecutiveSummary(db, isPg, { from, to });
          break;
        default:
          return res.status(400).json({ error: 'Invalid report type' });
      }

      await logActivity(req.user.username, 'GENERATE_REPORT', 'reports', null, `Generated ${reportType} from ${from} to ${to}`);
      res.json(reportData);
    } catch (err) {
      logger.error({ err, reportType }, 'Report generation failed');
      res.status(500).json({ error: 'Failed to generate report', details: err.message });
    }
  });

  app.get('/healthz', (req,res)=>{ res.json({ status:'ok', uptime_s: process.uptime(), dialect: db.dialect, timestamp: new Date().toISOString() }); });

  // Email Notification Endpoints (Admin only)
  app.post('/api/email/test', authMiddleware(), async (req, res) => {
    if (req.user.type !== 'admin') {
      return res.status(403).json({ error: 'Admin access required' });
    }
    
    try {
      const { email } = req.body;
      if (!email) {
        return res.status(400).json({ error: 'Email address required' });
      }
      
      const result = await sendTestEmail(email);
      
      if (result.success) {
        await logActivity(req.user.username, 'SEND_TEST_EMAIL', 'email', null, `Test email sent to ${email}`);
        res.json({ success: true, message: 'Test email sent successfully' });
      } else {
        res.status(500).json({ error: 'Failed to send test email', details: result.error });
      }
    } catch (err) {
      logger.error({ err }, 'Test email failed');
      res.status(500).json({ error: 'Failed to send test email', details: err.message });
    }
  });

  app.post('/api/email/trigger-reminders', authMiddleware(), async (req, res) => {
    if (req.user.type !== 'admin') {
      return res.status(403).json({ error: 'Admin access required' });
    }
    
    try {
      const result = await manualTrigger();
      await logActivity(req.user.username, 'TRIGGER_REMINDERS', 'email', null, `Manual trigger: ${result.sent.length} sent, ${result.errors.length} errors`);
      
      res.json({
        success: true,
        remindersSent: result.sent.length,
        errors: result.errors.length,
        details: result
      });
    } catch (err) {
      logger.error({ err }, 'Manual reminder trigger failed');
      res.status(500).json({ error: 'Failed to trigger reminders', details: err.message });
    }
  });

  app.get('/api/email/reminder-stats', authMiddleware(), async (req, res) => {
    if (req.user.type !== 'admin') {
      return res.status(403).json({ error: 'Admin access required' });
    }
    
    try {
      const stats = await getReminderStats();
      res.json({ stats });
    } catch (err) {
      logger.error({ err }, 'Failed to get reminder stats');
      res.status(500).json({ error: 'Failed to get reminder statistics', details: err.message });
    }
  });

  // Initialize the notification scheduler
  try {
    initScheduler(db);
    logger.info('Email notification scheduler initialized successfully');
  } catch (err) {
    logger.error({ err: err.message }, 'Failed to initialize notification scheduler - email reminders disabled');
  }

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

// ============================================
// REPORT GENERATION FUNCTIONS
// ============================================
async function generateSalesSummary(db, isPg, { from, to, staff, region }) {
  let conditions = [];
  let params = [];
  
  if (from) {
    conditions.push(isPg ? `transaction_date >= $${params.length + 1}::date` : `date(transaction_date) >= ?`);
    params.push(from);
  }
  if (to) {
    conditions.push(isPg ? `transaction_date <= $${params.length + 1}::date` : `date(transaction_date) <= ?`);
    params.push(to);
  }
  if (staff) {
    conditions.push(isPg ? `staff_name = $${params.length + 1}` : `staff_name = ?`);
    params.push(staff);
  }
  if (region) {
    conditions.push(isPg ? `region_id = $${params.length + 1}::int` : `region_id = ?`);
    params.push(region);
  }
  
  const whereClause = conditions.length > 0 ? `WHERE ${conditions.join(' AND ')}` : '';
  
  // Summary metrics
  const summary = await db.get(
    `SELECT 
      COUNT(*) as salesCount,
      COALESCE(SUM(sales_amount), 0) as totalSales,
      COALESCE(AVG(sales_amount), 0) as averageSale
    FROM sales s ${whereClause}`,
    params
  );
  
  // Get target (simplified - would need date logic)
  const target = await db.get(`SELECT COALESCE(SUM(sales_target), 0) as target FROM targets`);
  summary.target = target?.target || 0;
  summary.targetAchievement = summary.target > 0 ? summary.totalSales / summary.target : 0;
  summary.growthRate = 0; // Would need previous period comparison
  
  // Chart data - sales trend by month
  const trendData = await db.all(
    isPg
      ? `SELECT TO_CHAR(transaction_date::date, 'YYYY-MM') as month, SUM(sales_amount) as total
         FROM sales s ${whereClause}
         GROUP BY TO_CHAR(transaction_date::date, 'YYYY-MM')
         ORDER BY month`
      : `SELECT strftime('%Y-%m', transaction_date) as month, SUM(sales_amount) as total
         FROM sales s ${whereClause}
         GROUP BY strftime('%Y-%m', transaction_date)
         ORDER BY month`,
    params
  );
  
  // Sales by region
  const regionData = await db.all(
    `SELECT COALESCE(r.region_name, 'Unknown') as region_name, SUM(s.sales_amount) as total
     FROM sales s
     LEFT JOIN regions r ON r.id = s.region_id
     ${whereClause}
     GROUP BY r.region_name`,
    params
  );
  
  // Table data
  const tableData = await db.all(
    `SELECT s.*, r.region_name
     FROM sales s
     LEFT JOIN regions r ON r.id = s.region_id
     ${whereClause}
     ORDER BY s.transaction_date DESC
     LIMIT 100`,
    params
  );
  
  return {
    summary,
    chartData: {
      trend: {
        labels: trendData.map(d => d.month),
        values: trendData.map(d => d.total)
      },
      byRegion: {
        labels: regionData.map(d => d.region_name),
        values: regionData.map(d => d.total)
      }
    },
    tableData
  };
}

async function generateSalesDetailed(db, isPg, { from, to, staff, region }) {
  let conditions = [];
  let params = [];
  
  if (from) {
    conditions.push(isPg ? `transaction_date >= $${params.length + 1}::date` : `date(transaction_date) >= ?`);
    params.push(from);
  }
  if (to) {
    conditions.push(isPg ? `transaction_date <= $${params.length + 1}::date` : `date(transaction_date) <= ?`);
    params.push(to);
  }
  if (staff) {
    conditions.push(isPg ? `staff_name = $${params.length + 1}` : `staff_name = ?`);
    params.push(staff);
  }
  if (region) {
    conditions.push(isPg ? `region_id = $${params.length + 1}::int` : `region_id = ?`);
    params.push(region);
  }
  
  const whereClause = conditions.length > 0 ? `WHERE ${conditions.join(' AND ')}` : '';
  
  const summary = {
    totalCount: 0,
    completedCount: 0,
    pendingCount: 0,
    totalRevenue: 0
  };
  
  const counts = await db.get(
    `SELECT 
      COUNT(*) as totalCount,
      SUM(CASE WHEN status = 'completed' THEN 1 ELSE 0 END) as completedCount,
      SUM(CASE WHEN status = 'pending' THEN 1 ELSE 0 END) as pendingCount,
      COALESCE(SUM(sales_amount), 0) as totalRevenue
    FROM sales s ${whereClause}`,
    params
  );
  
  Object.assign(summary, counts);
  
  const tableData = await db.all(
    `SELECT s.*, r.region_name
     FROM sales s
     LEFT JOIN regions r ON r.id = s.region_id
     ${whereClause}
     ORDER BY s.transaction_date DESC`,
    params
  );
  
  return { summary, tableData };
}

async function generateToursProfitability(db, isPg, { from, to, staff, region }) {
  let conditions = [];
  let params = [];
  
  if (from) {
    conditions.push(isPg ? `departure_date >= $${params.length + 1}::date` : `date(departure_date) >= ?`);
    params.push(from);
  }
  if (to) {
    conditions.push(isPg ? `departure_date <= $${params.length + 1}::date` : `date(departure_date) <= ?`);
    params.push(to);
  }
  if (staff) {
    conditions.push(isPg ? `staff_name = $${params.length + 1}` : `staff_name = ?`);
    params.push(staff);
  }
  if (region) {
    conditions.push(isPg ? `region_id = $${params.length + 1}::int` : `region_id = ?`);
    params.push(region);
  }
  
  const whereClause = conditions.length > 0 ? `WHERE ${conditions.join(' AND ')}` : '';
  
  const summary = await db.get(
    `SELECT 
      COUNT(*) as totalTours,
      COALESCE(SUM(sales_amount), 0) as totalRevenue,
      COALESCE(SUM(profit_amount), 0) as totalProfit,
      SUM(CASE WHEN invoice_number IS NOT NULL AND invoice_number != '' THEN 1 ELSE 0 END) as invoicedTours,
      SUM(CASE WHEN invoice_number IS NULL OR invoice_number = '' THEN 1 ELSE 0 END) as notInvoicedTours
    FROM tours t ${whereClause}`,
    params
  );
  
  summary.profitMargin = summary.totalRevenue > 0 ? summary.totalProfit / summary.totalRevenue : 0;
  
  const tableData = await db.all(
    `SELECT t.*, r.region_name,
      CASE WHEN sales_amount > 0 THEN profit_amount::float / sales_amount ELSE 0 END as profit_margin
     FROM tours t
     JOIN regions r ON r.id = t.region_id
     ${whereClause}
     ORDER BY profit_amount DESC`,
    params
  );
  
  const topTours = tableData.slice(0, 10);
  
  return {
    summary,
    chartData: {
      revenueProfit: {
        labels: topTours.map(t => t.tour_code),
        values: topTours.map(t => t.profit_amount)
      },
      topTours: {
        labels: topTours.map(t => t.tour_code),
        values: topTours.map(t => t.profit_amount)
      }
    },
    tableData
  };
}

async function generateToursParticipants(db, isPg, { from, to, staff, region }) {
  let conditions = [];
  let params = [];
  
  if (from) {
    conditions.push(isPg ? `departure_date >= $${params.length + 1}::date` : `date(departure_date) >= ?`);
    params.push(from);
  }
  if (to) {
    conditions.push(isPg ? `departure_date <= $${params.length + 1}::date` : `date(departure_date) <= ?`);
    params.push(to);
  }
  if (staff) {
    conditions.push(isPg ? `staff_name = $${params.length + 1}` : `staff_name = ?`);
    params.push(staff);
  }
  if (region) {
    conditions.push(isPg ? `region_id = $${params.length + 1}::int` : `region_id = ?`);
    params.push(region);
  }
  
  const whereClause = conditions.length > 0 ? `WHERE ${conditions.join(' AND ')}` : '';
  
  const summary = await db.get(
    `SELECT 
      COUNT(*) as totalTours,
      COALESCE(SUM(jumlah_peserta), 0) as totalParticipants,
      COALESCE(AVG(jumlah_peserta), 0) as averagePerTour
    FROM tours t ${whereClause}`,
    params
  );
  
  summary.occupancyRate = 0.75; // Placeholder - would need capacity data
  
  const tableData = await db.all(
    `SELECT t.*, r.region_name
     FROM tours t
     JOIN regions r ON r.id = t.region_id
     ${whereClause}
     ORDER BY t.departure_date DESC`,
    params
  );
  
  return { summary, tableData };
}

async function generateDocumentsStatus(db, isPg, { from, to, staff, region }) {
  let conditions = [];
  let params = [];
  
  if (from) {
    conditions.push(isPg ? `receive_date >= $${params.length + 1}::date` : `date(receive_date) >= ?`);
    params.push(from);
  }
  if (to) {
    conditions.push(isPg ? `receive_date <= $${params.length + 1}::date` : `date(receive_date) <= ?`);
    params.push(to);
  }
  if (staff) {
    conditions.push(isPg ? `staff_name = $${params.length + 1}` : `staff_name = ?`);
    params.push(staff);
  }
  
  const whereClause = conditions.length > 0 ? `WHERE ${conditions.join(' AND ')}` : '';
  
  const summary = {
    totalDocuments: 0,
    completedCount: 0,
    inProgressCount: 0,
    avgProcessingDays: 0
  };
  
  const counts = await db.get(
    `SELECT 
      COUNT(*) as totalDocuments,
      SUM(CASE WHEN send_date IS NOT NULL THEN 1 ELSE 0 END) as completedCount,
      SUM(CASE WHEN send_date IS NULL THEN 1 ELSE 0 END) as inProgressCount
    FROM documents d ${whereClause}`,
    params
  );
  
  Object.assign(summary, counts);
  
  const processTypeData = await db.all(
    `SELECT process_type, COUNT(*) as count
     FROM documents d ${whereClause}
     GROUP BY process_type`,
    params
  );
  
  const tableData = await db.all(
    `SELECT * FROM documents d ${whereClause}
     ORDER BY receive_date DESC`,
    params
  );
  
  return {
    summary,
    chartData: {
      byProcessType: {
        labels: processTypeData.map(d => d.process_type),
        values: processTypeData.map(d => d.count)
      }
    },
    tableData
  };
}

async function generateStaffPerformance(db, isPg, { from, to, region }) {
  let conditions = [];
  let params = [];
  
  if (from) {
    conditions.push(isPg ? `s.created_at >= $${params.length + 1}::date` : `date(s.created_at) >= ?`);
    params.push(from);
  }
  if (to) {
    conditions.push(isPg ? `s.created_at <= $${params.length + 1}::date` : `date(s.created_at) <= ?`);
    params.push(to);
  }
  if (region) {
    conditions.push(isPg ? `s.region_id = $${params.length + 1}::int` : `s.region_id = ?`);
    params.push(region);
  }
  
  const whereClause = conditions.length > 0 ? `WHERE ${conditions.join(' AND ')}` : '';
  
  const tableData = await db.all(
    `SELECT 
      s.staff_name,
      COALESCE(SUM(s.sales_amount), 0) as total_sales,
      COUNT(s.id) as transaction_count,
      COALESCE(AVG(s.sales_amount), 0) as average_sale,
      (SELECT COUNT(*) FROM tours t WHERE t.staff_name = s.staff_name) as tours_handled,
      (SELECT COUNT(*) FROM documents d WHERE d.staff_name = s.staff_name) as documents_processed
    FROM sales s
    ${whereClause}
    GROUP BY s.staff_name
    ORDER BY total_sales DESC`,
    params
  );
  
  return {
    chartData: {
      staffSales: {
        labels: tableData.map(d => d.staff_name),
        values: tableData.map(d => d.total_sales)
      }
    },
    tableData
  };
}

async function generateRegionalComparison(db, isPg, { from, to }) {
  let conditions = [];
  let params = [];
  
  if (from) {
    conditions.push(isPg ? `s.created_at >= $${params.length + 1}::date` : `date(s.created_at) >= ?`);
    params.push(from);
  }
  if (to) {
    conditions.push(isPg ? `s.created_at <= $${params.length + 1}::date` : `date(s.created_at) <= ?`);
    params.push(to);
  }
  
  const whereClause = conditions.length > 0 ? `WHERE ${conditions.join(' AND ')}` : '';
  
  const tableData = await db.all(
    `SELECT 
      r.region_name,
      COALESCE(SUM(s.sales_amount), 0) as total_sales,
      COUNT(DISTINCT t.id) as total_tours,
      COALESCE(SUM(t.jumlah_peserta), 0) as total_participants
    FROM regions r
    LEFT JOIN sales s ON s.region_id = r.id ${from || to ? `AND ${conditions.join(' AND ')}` : ''}
    LEFT JOIN tours t ON t.region_id = r.id
    GROUP BY r.region_name
    ORDER BY total_sales DESC`,
    from || to ? params : []
  );
  
  const totalSales = tableData.reduce((sum, r) => sum + parseFloat(r.total_sales || 0), 0);
  tableData.forEach(row => {
    row.market_share = totalSales > 0 ? parseFloat(row.total_sales) / totalSales : 0;
  });
  
  return {
    chartData: {
      regionRevenue: {
        labels: tableData.map(d => d.region_name),
        values: tableData.map(d => d.total_sales)
      }
    },
    tableData
  };
}

async function generateExecutiveSummary(db, isPg, { from, to }) {
  let conditions = [];
  let params = [];
  
  if (from) {
    conditions.push(isPg ? `created_at >= $${params.length + 1}::date` : `date(created_at) >= ?`);
    params.push(from);
  }
  if (to) {
    conditions.push(isPg ? `created_at <= $${params.length + 1}::date` : `date(created_at) <= ?`);
    params.push(to);
  }
  
  const whereClause = conditions.length > 0 ? `WHERE ${conditions.join(' AND ')}` : '';
  
  const salesSummary = await db.get(
    `SELECT COALESCE(SUM(sales_amount), 0) as totalRevenue FROM sales s ${whereClause}`,
    params
  );
  
  const toursSummary = await db.get(
    `SELECT 
      COUNT(*) as activeTours,
      COALESCE(SUM(profit_amount), 0) as totalProfit,
      COALESCE(SUM(jumlah_peserta), 0) as totalParticipants
    FROM tours t`,
    []
  );
  
  const docsSummary = await db.get(
    `SELECT 
      COUNT(*) as totalDocuments,
      SUM(CASE WHEN send_date IS NULL THEN 1 ELSE 0 END) as pendingDocuments
    FROM documents`,
    []
  );
  
  const summary = {
    totalRevenue: salesSummary.totalRevenue,
    totalProfit: toursSummary.totalProfit,
    activeTours: toursSummary.activeTours,
    totalParticipants: toursSummary.totalParticipants,
    totalDocuments: docsSummary.totalDocuments,
    pendingDocuments: docsSummary.pendingDocuments
  };
  
  return { summary, chartData: {}, tableData: [] };
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
