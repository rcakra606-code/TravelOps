import express from 'express';
import bodyParser from 'body-parser';
import cors from 'cors';
import jwt from 'jsonwebtoken';
import bcrypt from 'bcryptjs';
import crypto from 'crypto';
import fs from 'fs';
import path from 'path';
import helmet from 'helmet';
import compression from 'compression';
import dotenv from 'dotenv';
import rateLimit from 'express-rate-limit';
import { RateLimiterMemory } from 'rate-limiter-flexible';
import { initDb } from './database.js';
import { logger, requestLogger } from './logger.js';
import { sendDepartureReminder, sendTestEmail, checkEmailConfigured } from './emailService.js';
import { initScheduler, manualTrigger, getReminderStats } from './notificationScheduler.js';

dotenv.config();

// Common passwords to reject
const COMMON_PASSWORDS = [
  'password', 'password1', 'password123', '12345678', '123456789', 'qwerty123',
  'admin123', 'letmein', 'welcome1', 'monkey123', 'dragon123', 'master123',
  'login123', 'abc12345', 'passw0rd', 'admin1234', 'root1234', 'user1234'
];

function isStrongPassword(pw='') {
  // Minimum 8 chars, uppercase, lowercase, digit, and special character
  if (pw.length < 8) return false;
  if (!/[A-Z]/.test(pw)) return false;
  if (!/[a-z]/.test(pw)) return false;
  if (!/\d/.test(pw)) return false;
  if (!/[!@#$%^&*(),.?":{}|<>\-_=+\[\]\\;'`~]/.test(pw)) return false;
  // Check against common passwords
  if (COMMON_PASSWORDS.includes(pw.toLowerCase())) return false;
  return true;
}

// Input sanitization helper to prevent XSS
function sanitizeInput(str) {
  if (typeof str !== 'string') return str;
  return str
    .replace(/</g, '&lt;')
    .replace(/>/g, '&gt;')
    .replace(/"/g, '&quot;')
    .replace(/'/g, '&#x27;')
    .replace(/\//g, '&#x2F;');
}

// Sanitize object recursively
function sanitizeObject(obj) {
  if (typeof obj === 'string') return sanitizeInput(obj);
  if (Array.isArray(obj)) return obj.map(sanitizeObject);
  if (obj && typeof obj === 'object') {
    const result = {};
    for (const key of Object.keys(obj)) {
      result[key] = sanitizeObject(obj[key]);
    }
    return result;
  }
  return obj;
}

// ===================================================================
// SERVER-SIDE VALIDATION HELPERS
// ===================================================================
const validators = {
  // Validate required fields
  required: (value, fieldName) => {
    if (value === undefined || value === null || value === '') {
      return `${fieldName} is required`;
    }
    return null;
  },
  
  // Validate email format
  email: (value) => {
    if (!value) return null;
    const emailRegex = /^[^\s@]+@[^\s@]+\.[^\s@]+$/;
    if (!emailRegex.test(value)) {
      return 'Invalid email format';
    }
    return null;
  },
  
  // Validate phone number
  phone: (value) => {
    if (!value) return null;
    const phoneRegex = /^[\d\s\-+()]{7,20}$/;
    if (!phoneRegex.test(value)) {
      return 'Invalid phone number format';
    }
    return null;
  },
  
  // Validate positive number
  positiveNumber: (value, fieldName) => {
    if (value === undefined || value === null || value === '') return null;
    const num = parseFloat(value);
    if (isNaN(num) || num < 0) {
      return `${fieldName} must be a positive number`;
    }
    return null;
  },
  
  // Validate date format (YYYY-MM-DD)
  date: (value, fieldName) => {
    if (!value) return null;
    const dateRegex = /^\d{4}-\d{2}-\d{2}$/;
    if (!dateRegex.test(value)) {
      return `${fieldName} must be in YYYY-MM-DD format`;
    }
    return null;
  },
  
  // Validate month format (YYYY-MM)
  month: (value, fieldName) => {
    if (!value) return null;
    const monthRegex = /^\d{4}-\d{2}$/;
    if (!monthRegex.test(value)) {
      return `${fieldName} must be in YYYY-MM format`;
    }
    return null;
  },
  
  // Validate string length
  maxLength: (value, maxLen, fieldName) => {
    if (!value) return null;
    if (value.length > maxLen) {
      return `${fieldName} must be at most ${maxLen} characters`;
    }
    return null;
  }
};

// Validate entity data
function validateEntity(entity, data) {
  const errors = [];
  
  switch (entity) {
    case 'sales':
      if (validators.required(data.staff_name, 'Staff Name')) errors.push(validators.required(data.staff_name, 'Staff Name'));
      if (validators.required(data.month, 'Month')) errors.push(validators.required(data.month, 'Month'));
      if (validators.month(data.month, 'Month')) errors.push(validators.month(data.month, 'Month'));
      if (validators.positiveNumber(data.sales_amount, 'Sales Amount')) errors.push(validators.positiveNumber(data.sales_amount, 'Sales Amount'));
      if (validators.positiveNumber(data.profit_amount, 'Profit Amount')) errors.push(validators.positiveNumber(data.profit_amount, 'Profit Amount'));
      break;
      
    case 'tours':
      // data_version 2 (new format): lead_passenger comes from passengers array, so don't require it here
      if (data.data_version !== 2) {
        if (validators.required(data.lead_passenger, 'Lead Passenger')) errors.push(validators.required(data.lead_passenger, 'Lead Passenger'));
      }
      if (validators.date(data.departure_date, 'Departure Date')) errors.push(validators.date(data.departure_date, 'Departure Date'));
      if (validators.date(data.return_date, 'Return Date')) errors.push(validators.date(data.return_date, 'Return Date'));
      // For data_version 2, email and phone are on passengers, not required at tour level
      if (data.data_version !== 2) {
        if (validators.email(data.email)) errors.push(validators.email(data.email));
        if (validators.phone(data.phone_number)) errors.push(validators.phone(data.phone_number));
      }
      if (validators.positiveNumber(data.jumlah_peserta, 'Participants')) errors.push(validators.positiveNumber(data.jumlah_peserta, 'Participants'));
      break;
      
    case 'documents':
      if (validators.required(data.guest_name, 'Guest Name')) errors.push(validators.required(data.guest_name, 'Guest Name'));
      if (validators.date(data.receive_date, 'Receive Date')) errors.push(validators.date(data.receive_date, 'Receive Date'));
      if (validators.phone(data.phone_number)) errors.push(validators.phone(data.phone_number));
      break;
      
    case 'targets':
      if (validators.required(data.staff_name, 'Staff Name')) errors.push(validators.required(data.staff_name, 'Staff Name'));
      if (validators.required(data.month, 'Month')) errors.push(validators.required(data.month, 'Month'));
      if (validators.required(data.year, 'Year')) errors.push(validators.required(data.year, 'Year'));
      if (validators.positiveNumber(data.target_sales, 'Target Sales')) errors.push(validators.positiveNumber(data.target_sales, 'Target Sales'));
      break;
      
    case 'hotel_bookings':
      if (validators.required(data.hotel_name, 'Hotel Name')) errors.push(validators.required(data.hotel_name, 'Hotel Name'));
      if (validators.date(data.check_in, 'Check-in Date')) errors.push(validators.date(data.check_in, 'Check-in Date'));
      if (validators.date(data.check_out, 'Check-out Date')) errors.push(validators.date(data.check_out, 'Check-out Date'));
      break;
      
    case 'cruise':
      if (validators.required(data.cruise_brand, 'Cruise Brand')) errors.push(validators.required(data.cruise_brand, 'Cruise Brand'));
      if (validators.email(data.email)) errors.push(validators.email(data.email));
      if (validators.phone(data.phone_number)) errors.push(validators.phone(data.phone_number));
      break;
      
    case 'telecom':
      if (validators.required(data.nama, 'Nama')) errors.push(validators.required(data.nama, 'Nama'));
      if (validators.phone(data.no_telephone)) errors.push(validators.phone(data.no_telephone));
      break;
      
    case 'overtime':
      if (validators.required(data.staff_name, 'Staff Name')) errors.push(validators.required(data.staff_name, 'Staff Name'));
      if (validators.date(data.event_date, 'Event Date')) errors.push(validators.date(data.event_date, 'Event Date'));
      if (validators.positiveNumber(data.hours, 'Hours')) errors.push(validators.positiveNumber(data.hours, 'Hours'));
      break;
      
    case 'productivity':
      if (validators.required(data.month, 'Month')) errors.push(validators.required(data.month, 'Month'));
      if (validators.required(data.year, 'Year')) errors.push(validators.required(data.year, 'Year'));
      if (validators.required(data.staff_name, 'Staff Name')) errors.push(validators.required(data.staff_name, 'Staff Name'));
      if (validators.required(data.product_type, 'Product Type')) errors.push(validators.required(data.product_type, 'Product Type'));
      if (validators.positiveNumber(data.retail_sales, 'Retail Sales')) errors.push(validators.positiveNumber(data.retail_sales, 'Retail Sales'));
      if (validators.positiveNumber(data.retail_profit, 'Retail Profit')) errors.push(validators.positiveNumber(data.retail_profit, 'Retail Profit'));
      if (validators.positiveNumber(data.corporate_sales, 'Corporate Sales')) errors.push(validators.positiveNumber(data.corporate_sales, 'Corporate Sales'));
      if (validators.positiveNumber(data.corporate_profit, 'Corporate Profit')) errors.push(validators.positiveNumber(data.corporate_profit, 'Corporate Profit'));
      break;
  }
  
  return errors.filter(e => e !== null);
}

export async function createApp() {
  const app = express();
  if (process.env.TRUST_PROXY === 'true' || process.env.NODE_ENV === 'production') {
    app.set('trust proxy', 1);
  }
  
  // SECURITY: Enforce strong JWT_SECRET in production
  const SECRET = process.env.JWT_SECRET;
  if (!SECRET || SECRET.length < 32) {
    if (process.env.NODE_ENV === 'production') {
      throw new Error('SECURITY ERROR: JWT_SECRET environment variable must be set with at least 32 characters in production');
    }
    // Allow weak secret only in development/test with warning
    console.warn('⚠️  WARNING: Using weak JWT_SECRET. Set JWT_SECRET env var (min 32 chars) for production!');
  }
  const JWT_SECRET = SECRET || 'dev-insecure-secret-for-development-only';
  
  const LOCKOUT_MINUTES = parseInt(process.env.LOCKOUT_MINUTES || '15', 10);
  const db = await initDb();
  logger.info({ path: path.resolve('data/travelops.db'), dialect: db.dialect }, 'Database config');
  
  // ===================================================================
  // SINGLE DEVICE SESSION TRACKING
  // ===================================================================
  // Store active sessions: Map<userId, { sessionId, deviceInfo, loginTime }>
  const activeSessions = new Map();
  
  function generateSessionId() {
    return crypto.randomBytes(32).toString('hex');
  }
  
  function getDeviceInfo(req) {
    const ua = req.headers['user-agent'] || 'Unknown';
    const ip = req.ip || req.connection?.remoteAddress || 'Unknown';
    return { userAgent: ua.substring(0, 100), ip };
  }
  
  function checkActiveSession(userId) {
    return activeSessions.get(userId) || null;
  }
  
  function setActiveSession(userId, sessionId, deviceInfo) {
    activeSessions.set(userId, { 
      sessionId, 
      deviceInfo, 
      loginTime: new Date().toISOString() 
    });
  }
  
  function clearSession(userId) {
    const hadSession = activeSessions.has(userId);
    activeSessions.delete(userId);
    return hadSession;
  }
  
  function validateSession(userId, sessionId) {
    const session = activeSessions.get(userId);
    return session && session.sessionId === sessionId;
  }

  async function logActivity(username, action, entity, recordId = null, description='') {
    try {
      await db.run('INSERT INTO activity_logs (username, action, entity, record_id, description) VALUES (?,?,?,?,?)', [username, action, entity, recordId, description]);
    } catch (err) {
      logger.error({ err }, 'Failed to log activity');
    }
  }

  // CORS - restrict to specific origins in production
  app.use(cors({ 
    origin: process.env.CORS_ORIGIN ? process.env.CORS_ORIGIN.split(',') : undefined, 
    credentials: true,
    methods: ['GET', 'POST', 'PUT', 'DELETE', 'OPTIONS'],
    allowedHeaders: ['Content-Type', 'Authorization']
  }));
  
  // Security headers with Helmet
  app.use(helmet({
    crossOriginResourcePolicy: { policy: 'cross-origin' },
    crossOriginOpenerPolicy: { policy: 'same-origin' },
    referrerPolicy: { policy: 'strict-origin-when-cross-origin' },
    contentSecurityPolicy: {
      useDefaults: true,
      directives: {
        defaultSrc: ["'self'"],
        scriptSrc: ["'self'", "'unsafe-inline'", "'unsafe-eval'", "https://cdn.jsdelivr.net", "https://cdnjs.cloudflare.com"],
        scriptSrcAttr: ["'unsafe-inline'"],
        styleSrc: ["'self'", "'unsafe-inline'", "https://fonts.googleapis.com", "https://cdnjs.cloudflare.com"],
        fontSrc: ["'self'", "https://fonts.gstatic.com", "https://fonts.googleapis.com"],
        imgSrc: ["'self'", 'data:', 'blob:'],
        connectSrc: ["'self'", "https://cdn.jsdelivr.net", "https://cdnjs.cloudflare.com", "https://fonts.googleapis.com", "https://fonts.gstatic.com"],
        objectSrc: ["'none'"],
        frameAncestors: ["'none'"],
        baseUri: ["'self'"],
        formAction: ["'self'"],
        upgradeInsecureRequests: []
      }
    },
    hsts: {
      maxAge: 31536000, // 1 year
      includeSubDomains: true,
      preload: true
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
  // Limit request body size to prevent DoS attacks
  app.use(bodyParser.json({ limit: '1mb' }));
  app.use(bodyParser.urlencoded({ extended: true, limit: '1mb' }));
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

  // ===================================================================
  // CSRF TOKEN MANAGEMENT
  // ===================================================================
  const csrfTokens = new Map(); // userId -> { token, expires }
  
  function generateCsrfToken(userId) {
    const token = crypto.randomBytes(32).toString('hex');
    const expires = Date.now() + (60 * 60 * 1000); // 1 hour
    csrfTokens.set(userId, { token, expires });
    // Clean up expired tokens periodically
    if (csrfTokens.size > 1000) {
      const now = Date.now();
      for (const [key, val] of csrfTokens.entries()) {
        if (val.expires < now) csrfTokens.delete(key);
      }
    }
    return token;
  }
  
  function validateCsrfToken(userId, token) {
    const stored = csrfTokens.get(userId);
    if (!stored) return false;
    if (stored.expires < Date.now()) {
      csrfTokens.delete(userId);
      return false;
    }
    return stored.token === token;
  }
  
  // ===================================================================
  // PAGINATION HELPER
  // ===================================================================
  function getPaginationParams(req) {
    const page = Math.max(1, parseInt(req.query.page) || 1);
    const limit = Math.min(100, Math.max(1, parseInt(req.query.limit) || 50));
    const offset = (page - 1) * limit;
    return { page, limit, offset };
  }
  
  function paginatedResponse(data, total, page, limit) {
    return {
      data,
      pagination: {
        page,
        limit,
        total,
        totalPages: Math.ceil(total / limit),
        hasNext: page * limit < total,
        hasPrev: page > 1
      }
    };
  }

  function authMiddleware(required = true) {
    return async (req, res, next) => {
      const authHeader = req.headers.authorization || '';
      const token = authHeader.replace('Bearer ', '');
      if (!token && required) return res.status(401).json({ error: 'No token' });
      if (!token) return next();
      try {
        const decoded = jwt.verify(token, JWT_SECRET);
        
        // Validate session is still active (single device enforcement)
        if (decoded.sessionId && !validateSession(decoded.id, decoded.sessionId)) {
          return res.status(401).json({ 
            error: 'Session expired', 
            code: 'SESSION_INVALIDATED',
            message: 'Your session has been terminated. You may have logged in from another device.'
          });
        }
        
        req.user = decoded;
        next();
      } catch (err) {
        return res.status(403).json({ error: 'Invalid or expired token' });
      }
    };
  }
  
  // ===================================================================
  // CSRF MIDDLEWARE - Validate on state-changing requests
  // ===================================================================
  function csrfMiddleware(req, res, next) {
    // Skip CSRF for GET, HEAD, OPTIONS requests
    if (['GET', 'HEAD', 'OPTIONS'].includes(req.method)) {
      return next();
    }
    // Skip CSRF for login/logout (no user context yet)
    if (req.path === '/api/login' || req.path === '/api/logout' || req.path === '/api/refresh') {
      return next();
    }
    // If user is authenticated, validate CSRF token
    if (req.user) {
      const csrfToken = req.headers['x-csrf-token'];
      if (!csrfToken || !validateCsrfToken(req.user.id, csrfToken)) {
        // Log but don't block for now - gradual rollout
        logger.warn({ userId: req.user.id, path: req.path }, 'Missing or invalid CSRF token');
        // Uncomment below to enforce:
        // return res.status(403).json({ error: 'Invalid CSRF token' });
      }
    }
    next();
  }

  // ===================================================================
  // EMERGENCY ADMIN PASSWORD RESET (No auth required, uses secret key)
  // Set EMERGENCY_RESET_KEY env var on your server to enable this
  // Usage: POST /api/emergency-reset { key: "your-secret-key" }
  // ===================================================================
  app.post('/api/emergency-reset', async (req, res) => {
    const emergencyKey = process.env.EMERGENCY_RESET_KEY;
    if (!emergencyKey) {
      return res.status(404).json({ error: 'Not found' });
    }
    
    const { key } = req.body;
    if (!key || key !== emergencyKey) {
      logger.warn({ ip: req.ip }, 'Invalid emergency reset attempt');
      return res.status(401).json({ error: 'Invalid key' });
    }
    
    try {
      const defaultPassword = process.env.ADMIN_PASSWORD || 'Admin1234!';
      const hashed = await bcrypt.hash(defaultPassword, 10);
      
      // Reset all admin passwords to default
      const result = await db.run(
        "UPDATE users SET password=?, failed_attempts=0, locked_until=NULL WHERE type='admin'",
        [hashed]
      );
      
      // If no admins exist, create one
      if (result.changes === 0) {
        const username = process.env.ADMIN_USERNAME || 'admin';
        await db.run(
          'INSERT INTO users (username, password, name, email, type) VALUES (?, ?, ?, ?, ?)',
          [username, hashed, 'Administrator', 'admin@example.com', 'admin']
        );
        logger.info({ username }, 'Emergency reset: Created admin user');
        return res.json({ ok: true, message: `Created admin user: ${username}`, password: defaultPassword });
      }
      
      logger.info({ changes: result.changes }, 'Emergency reset: Reset admin passwords');
      res.json({ ok: true, message: `Reset ${result.changes} admin account(s)`, password: defaultPassword });
    } catch (err) {
      logger.error({ err }, 'Emergency reset failed');
      res.status(500).json({ error: 'Reset failed' });
    }
  });

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
      return res.status(429).json({ error: 'Too many login attempts. Please try again later.' });
    }
    const { username, password, forceLogin } = req.body;
    const now = Date.now();
    let user = await db.get('SELECT * FROM users WHERE username=?', [username]);
    
    // SECURITY FIX: Generic error message to prevent user enumeration
    const GENERIC_LOGIN_ERROR = 'Invalid username or password';
    
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
          return res.status(409).json({ error: 'System initialized. Please login with default admin credentials.', username: seedUser });
        }
      } catch (e) {
        logger.error({ err: e }, 'Auto-seed admin check failed');
      }
      // Use same generic error as wrong password
      return res.status(401).json({ error: GENERIC_LOGIN_ERROR });
    }
    if (user.type !== 'admin' && user.locked_until) {
      const lockedUntilMs = Date.parse(user.locked_until);
      if (!isNaN(lockedUntilMs) && lockedUntilMs > now) {
        return res.status(423).json({ error: 'Account locked. Contact administrator to unlock your account.' });
      }
    }
    const valid = await bcrypt.compare(password, user.password);
    if (!valid) {
      if (user.type !== 'admin') {
        const attempts = (user.failed_attempts || 0) + 1;
        let lockedUntil = null;
        // Lock indefinitely after 3 failed attempts - only admin can unlock
        if (attempts >= 3) lockedUntil = '9999-12-31T23:59:59.000Z';
        await db.run('UPDATE users SET failed_attempts=?, locked_until=? WHERE id=?', [attempts, lockedUntil, user.id]);
        if (lockedUntil) {
          await logActivity(username, 'LOCKED', 'users', user.id, `Account locked after ${attempts} failed attempts`);
          return res.status(423).json({ error: 'Account locked due to multiple failed attempts. Contact administrator to unlock.' });
        }
      }
      await logActivity(username, 'LOGIN_FAIL', 'auth', user.id, 'Bad password');
      // Use generic error message
      return res.status(401).json({ error: GENERIC_LOGIN_ERROR });
    }
    
    // ===================================================================
    // SINGLE DEVICE SESSION ENFORCEMENT
    // ===================================================================
    const existingSession = checkActiveSession(user.id);
    if (existingSession && !forceLogin) {
      // User is already logged in on another device
      const loginTime = new Date(existingSession.loginTime).toLocaleString();
      return res.status(409).json({ 
        error: 'Already logged in on another device',
        code: 'ALREADY_LOGGED_IN',
        message: `This account is currently active on another device (logged in at ${loginTime}). Do you want to terminate that session and login here?`,
        deviceInfo: {
          ip: existingSession.deviceInfo.ip,
          loginTime: existingSession.loginTime
        }
      });
    }
    
    // Generate new session
    const sessionId = generateSessionId();
    const deviceInfo = getDeviceInfo(req);
    
    // Clear any existing session and set new one
    setActiveSession(user.id, sessionId, deviceInfo);
    
    if (user.type !== 'admin') await db.run('UPDATE users SET failed_attempts=0, locked_until=NULL WHERE id=?', [user.id]);
    
    const safeUser = { 
      id: user.id, 
      username: user.username, 
      name: user.name, 
      email: user.email, 
      type: user.type,
      sessionId: sessionId  // Include sessionId in token for validation
    };
    const TOKEN_EXPIRES = process.env.JWT_EXPIRES || '15m';
    const token = jwt.sign(safeUser, JWT_SECRET, { expiresIn: TOKEN_EXPIRES });
    await logActivity(username, 'LOGIN', 'auth', user.id, `Device: ${deviceInfo.ip}`);
    res.json({ ...safeUser, token, sessionId });
  });

  app.post('/api/logout', authMiddleware(false), async (req, res) => {
    // Clear the user's active session
    if (req.user && req.user.id) {
      clearSession(req.user.id);
      await logActivity(req.user.username, 'LOGOUT', 'auth', req.user.id);
    }
    res.json({ ok: true });
  });
  
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
  
  // ===================================================================
  // CSRF TOKEN ENDPOINT
  // ===================================================================
  app.get('/api/csrf-token', authMiddleware(), (req, res) => {
    const token = generateCsrfToken(req.user.id);
    res.json({ csrfToken: token });
  });
  
  // ===================================================================
  // NOTIFICATIONS ENDPOINT - Get upcoming deadlines & alerts
  // ===================================================================
  app.get('/api/notifications', authMiddleware(), async (req, res) => {
    try {
      const notifications = [];
      const today = new Date();
      const nextWeek = new Date(today);
      nextWeek.setDate(today.getDate() + 7);
      const todayStr = today.toISOString().split('T')[0];
      const nextWeekStr = nextWeek.toISOString().split('T')[0];
      
      // Get upcoming tour departures (next 7 days)
      const upcomingTours = await db.all(
        `SELECT id, lead_passenger, tour_code, departure_date, staff_name 
         FROM tours 
         WHERE departure_date >= ? AND departure_date <= ?
         ORDER BY departure_date ASC
         LIMIT 10`,
        [todayStr, nextWeekStr]
      );
      
      upcomingTours.forEach(tour => {
        const daysUntil = Math.ceil((new Date(tour.departure_date) - today) / (1000 * 60 * 60 * 24));
        notifications.push({
          type: 'tour_departure',
          priority: daysUntil <= 2 ? 'high' : 'medium',
          title: `Tour Departure: ${tour.tour_code || 'Unknown'}`,
          message: `${tour.lead_passenger} departing in ${daysUntil} day(s)`,
          date: tour.departure_date,
          entityId: tour.id,
          entity: 'tours'
        });
      });
      
      // Get pending documents (no send_date)
      const pendingDocs = await db.all(
        `SELECT id, guest_name, process_type, estimated_done, staff_name 
         FROM documents 
         WHERE send_date IS NULL AND estimated_done <= ?
         ORDER BY estimated_done ASC
         LIMIT 10`,
        [nextWeekStr]
      );
      
      pendingDocs.forEach(doc => {
        const isOverdue = doc.estimated_done < todayStr;
        notifications.push({
          type: 'document_pending',
          priority: isOverdue ? 'high' : 'medium',
          title: `Document: ${doc.process_type || 'Processing'}`,
          message: `${doc.guest_name} - ${isOverdue ? 'OVERDUE' : 'Due soon'}`,
          date: doc.estimated_done,
          entityId: doc.id,
          entity: 'documents'
        });
      });
      
      // Get current month targets status
      const currentMonth = today.getMonth() + 1;
      const currentYear = today.getFullYear();
      
      const targetStatus = await db.all(
        `SELECT t.staff_name, t.target_sales, t.target_profit,
                COALESCE(SUM(s.sales_amount), 0) as actual_sales,
                COALESCE(SUM(s.profit_amount), 0) as actual_profit
         FROM targets t
         LEFT JOIN sales s ON s.staff_name = t.staff_name AND s.month = ?
         WHERE t.month = ? AND t.year = ?
         GROUP BY t.id, t.staff_name, t.target_sales, t.target_profit`,
        [`${currentYear}-${String(currentMonth).padStart(2, '0')}`, currentMonth, currentYear]
      );
      
      targetStatus.forEach(target => {
        const salesPct = target.target_sales > 0 ? (target.actual_sales / target.target_sales) * 100 : 0;
        if (salesPct < 50 && today.getDate() > 15) {
          notifications.push({
            type: 'target_warning',
            priority: 'high',
            title: `Target Alert: ${target.staff_name}`,
            message: `Sales at ${salesPct.toFixed(0)}% of target`,
            entity: 'targets'
          });
        }
      });
      
      // Sort by priority
      const priorityOrder = { high: 0, medium: 1, low: 2 };
      notifications.sort((a, b) => priorityOrder[a.priority] - priorityOrder[b.priority]);
      
      res.json({ notifications, count: notifications.length });
    } catch (err) {
      logger.error({ err }, 'Failed to fetch notifications');
      res.status(500).json({ error: 'Failed to fetch notifications' });
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
      const decoded = jwt.verify(token, JWT_SECRET, { ignoreExpiration: true });
      const nowSec = Math.floor(Date.now()/1000);
      const GRACE_SECONDS = parseInt(process.env.REFRESH_GRACE_SECONDS || '60', 10);
      const expSec = decoded.exp;
      if (!expSec) return res.status(403).json({ error: 'Token missing exp' });
      const secondsPastExpiry = Math.max(0, nowSec - expSec);
      if (secondsPastExpiry > GRACE_SECONDS) {
        // Clear session if token fully expired
        if (decoded.id) clearSession(decoded.id);
        return res.status(403).json({ error: 'Token expired' });
      }
      
      // Validate session is still active (single device enforcement)
      if (decoded.sessionId && !validateSession(decoded.id, decoded.sessionId)) {
        return res.status(401).json({ 
          error: 'Session expired', 
          code: 'SESSION_INVALIDATED',
          message: 'Your session has been terminated. You may have logged in from another device.'
        });
      }
      
      const { iat, exp, ...payload } = decoded; // strip timing claims but keep sessionId
      const TOKEN_EXPIRES = process.env.JWT_EXPIRES || '15m';
      const newToken = jwt.sign(payload, JWT_SECRET, { expiresIn: TOKEN_EXPIRES });
      return res.json({ token: newToken });
    } catch (err) {
      return res.status(403).json({ error: 'Invalid token' });
    }
  });

  const tables = ['sales','tours','documents','targets','regions','users','telecom','hotel_bookings','overtime','cruise','outstanding','cashout','productivity','ticket_recaps'];
  const staffOwnedTables = new Set(['sales','tours','documents','targets','telecom','hotel_bookings','overtime','cruise','outstanding','cashout','productivity','ticket_recaps']);

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
          // For sales, use 'month' column (YYYY-MM format) which is more reliable
          if (t === 'sales') {
            // Build YYYY-MM string to match month column
            if (year) {
              const monthYearStr = `${year}-${month.padStart(2, '0')}`;
              if (isPg) {
                conditions.push(`month=$${params.length+1}`);
                params.push(monthYearStr);
              } else {
                conditions.push(`month=?`);
                params.push(monthYearStr);
              }
            } else {
              // No year specified, just match month part using LIKE
              if (isPg) {
                conditions.push(`month LIKE $${params.length+1}`);
                params.push(`%-${month.padStart(2, '0')}`);
              } else {
                conditions.push(`month LIKE ?`);
                params.push(`%-${month.padStart(2, '0')}`);
              }
            }
          } else {
            // For tours and documents, use date fields
            let dateField = t === 'documents' ? 'receive_date' : 'departure_date';
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
        } else if (year && t === 'sales') {
          // Year-only filter for sales using month column
          if (isPg) {
            conditions.push(`month LIKE $${params.length+1}`);
            params.push(`${year}-%`);
          } else {
            conditions.push(`month LIKE ?`);
            params.push(`${year}-%`);
          }
        }
        
        if (year && (t === 'tours' || t === 'documents')) {
          let dateField = t === 'documents' ? 'receive_date' : 'departure_date';
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
        } else if (t === 'cashout') {
          // For cashout: basic users see only their own, admin/semi-admin see all
          if (req.user.type === 'basic') {
            const cashoutWhere = whereClause ? `${whereClause} AND staff_name=${isPg ? `$${params.length+1}` : '?'}` : `WHERE staff_name=${isPg ? '$1' : '?'}`;
            params.push(req.user.name);
            rows = await db.all(`SELECT * FROM cashout ${cashoutWhere} ORDER BY request_date DESC`, params);
          } else {
            rows = await db.all(`SELECT * FROM cashout ${whereClause} ORDER BY request_date DESC`, params);
          }
        } else if (t === 'productivity') {
          // Productivity: basic users see only their own, admin/semi-admin see all
          if (req.user.type === 'basic') {
            const prodWhere = whereClause ? `${whereClause} AND staff_name=${isPg ? `$${params.length+1}` : '?'}` : `WHERE staff_name=${isPg ? '$1' : '?'}`;
            params.push(req.user.name);
            rows = await db.all(`SELECT * FROM productivity ${prodWhere} ORDER BY year DESC, month DESC`, params);
          } else {
            rows = await db.all(`SELECT * FROM productivity ${whereClause} ORDER BY year DESC, month DESC`, params);
          }
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
          if (!isStrongPassword(req.body.password)) return res.status(400).json({ error:'Password must be at least 8 characters and contain uppercase, lowercase, number, and special character (!@#$%^&*...)' });
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
        // Tours: convert empty strings to null for numeric fields
        if (t === 'tours') {
          const numericFields = ['tour_price', 'sales_amount', 'total_nominal_sales', 'discount_amount', 'profit_amount'];
          numericFields.forEach(field => {
            if (req.body[field] === '' || req.body[field] === null || req.body[field] === undefined) {
              req.body[field] = null;
            }
          });
          
          // Validate mandatory fields for tours
          const mandatoryFields = [
            { field: 'registration_date', label: 'Registration Date' },
            { field: 'tour_code', label: 'Tour Code' },
            { field: 'departure_date', label: 'Departure Date' },
            { field: 'region_id', label: 'Region' },
            { field: 'lead_passenger', label: 'Nama Penumpang Utama' },
            { field: 'jumlah_peserta', label: 'Jumlah Peserta' },
            { field: 'staff_name', label: 'Staff' }
          ];
          
          const missingFields = mandatoryFields.filter(f => {
            const value = req.body[f.field];
            return value === undefined || value === null || value === '' || (typeof value === 'string' && value.trim() === '');
          });
          
          if (missingFields.length > 0) {
            const fieldNames = missingFields.map(f => f.label).join(', ');
            return res.status(400).json({ error: `Missing mandatory fields: ${fieldNames}` });
          }
          
          // Validate jumlah_peserta is at least 1
          if (parseInt(req.body.jumlah_peserta) < 1) {
            return res.status(400).json({ error: 'Jumlah Peserta must be at least 1' });
          }
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
        
        // Audit logging: Add created_by for tracked entities
        const auditTables = ['tours', 'sales', 'documents', 'hotel_bookings', 'cruise', 'telecom', 'overtime', 'targets'];
        if (auditTables.includes(t)) {
          req.body.created_by = req.user.username || req.user.name;
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
        
        // Hash password if updating users table with a password field
        if (t === 'users' && req.body.password) {
          const password = req.body.password;
          // Validate password strength
          const passwordRegex = /^(?=.*[a-z])(?=.*[A-Z])(?=.*\d)(?=.*[\W_]).{8,}$/;
          if (!passwordRegex.test(password)) {
            return res.status(400).json({ 
              error: 'Password must be at least 8 characters with uppercase, lowercase, number, and special character' 
            });
          }
          req.body.password = await bcrypt.hash(password, 10);
          console.log('🔐 Password hashed for user update via generic PUT endpoint');
        }
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
        // Tours: convert empty strings to null for numeric fields
        if (t === 'tours') {
          const numericFields = ['tour_price', 'sales_amount', 'total_nominal_sales', 'discount_amount', 'profit_amount'];
          numericFields.forEach(field => {
            if (field in req.body && (req.body[field] === '' || req.body[field] === null || req.body[field] === undefined)) {
              req.body[field] = null;
            }
          });
          
          // Validate mandatory fields for tours on update
          const mandatoryFields = [
            { field: 'registration_date', label: 'Registration Date' },
            { field: 'tour_code', label: 'Tour Code' },
            { field: 'departure_date', label: 'Departure Date' },
            { field: 'region_id', label: 'Region' },
            { field: 'lead_passenger', label: 'Nama Penumpang Utama' },
            { field: 'jumlah_peserta', label: 'Jumlah Peserta' },
            { field: 'staff_name', label: 'Staff' }
          ];
          
          // Only validate fields that are being updated
          const missingFields = mandatoryFields.filter(f => {
            if (!(f.field in req.body)) return false; // Field not being updated, skip
            const value = req.body[f.field];
            return value === undefined || value === null || value === '' || (typeof value === 'string' && value.trim() === '');
          });
          
          if (missingFields.length > 0) {
            const fieldNames = missingFields.map(f => f.label).join(', ');
            return res.status(400).json({ error: `Cannot set mandatory fields to empty: ${fieldNames}` });
          }
          
          // Validate jumlah_peserta is at least 1 if being updated
          if ('jumlah_peserta' in req.body && parseInt(req.body.jumlah_peserta) < 1) {
            return res.status(400).json({ error: 'Jumlah Peserta must be at least 1' });
          }
        }
        
        // Audit logging: Add updated_at and updated_by for tracked entities
        const auditTables = ['tours', 'sales', 'documents', 'hotel_bookings', 'cruise', 'telecom', 'overtime', 'targets'];
        if (auditTables.includes(t)) {
          req.body.updated_by = req.user.username || req.user.name;
          req.body.updated_at = db.dialect === 'postgres' ? new Date().toISOString() : new Date().toISOString();
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

  // ===============================================
  // Tour Passengers API (for data_version 2 tours)
  // ===============================================
  
  // Get passengers for a specific tour
  app.get('/api/tours/:tourId/passengers', authMiddleware(), async (req, res) => {
    try {
      const { tourId } = req.params;
      const passengers = await db.all(
        'SELECT * FROM tour_passengers WHERE tour_id=? ORDER BY passenger_number ASC',
        [tourId]
      );
      res.json(passengers);
    } catch (error) {
      console.error('GET /api/tours/:tourId/passengers error:', error);
      res.status(500).json({ error: 'Failed to fetch passengers' });
    }
  });

  // Create/update passengers for a tour (replaces all passengers)
  app.post('/api/tours/:tourId/passengers', authMiddleware(), async (req, res) => {
    try {
      const { tourId } = req.params;
      const { passengers } = req.body;
      
      if (!Array.isArray(passengers)) {
        return res.status(400).json({ error: 'passengers must be an array' });
      }
      
      // Verify tour exists and is data_version 2
      const tour = await db.get('SELECT id, data_version FROM tours WHERE id=?', [tourId]);
      if (!tour) return res.status(404).json({ error: 'Tour not found' });
      if (tour.data_version !== 2) return res.status(400).json({ error: 'Tour is not data_version 2' });
      
      // Delete existing passengers for this tour
      await db.run('DELETE FROM tour_passengers WHERE tour_id=?', [tourId]);
      
      // Insert new passengers
      const insertedIds = [];
      for (let i = 0; i < passengers.length; i++) {
        const p = passengers[i];
        const result = await db.run(
          `INSERT INTO tour_passengers (tour_id, passenger_number, name, phone_number, email, base_price, discount, profit, is_lead_passenger)
           VALUES (?, ?, ?, ?, ?, ?, ?, ?, ?)`,
          [
            tourId,
            i + 1,
            p.name || '',
            p.phone_number || null,
            p.email || null,
            parseFloat(p.base_price) || 0,
            parseFloat(p.discount) || 0,
            parseFloat(p.profit) || 0,
            i === 0 ? 1 : 0 // First passenger is lead
          ]
        );
        insertedIds.push(result.lastID);
      }
      
      // Update tour with lead passenger info from first passenger
      if (passengers.length > 0) {
        const lead = passengers[0];
        await db.run(
          'UPDATE tours SET lead_passenger=?, phone_number=?, email=? WHERE id=?',
          [lead.name, lead.phone_number || null, lead.email || null, tourId]
        );
      }
      
      await logActivity(req.user.username, 'UPDATE', 'tour_passengers', tourId, JSON.stringify({ count: passengers.length }));
      res.json({ success: true, passengerIds: insertedIds });
    } catch (error) {
      console.error('POST /api/tours/:tourId/passengers error:', error);
      res.status(500).json({ error: 'Failed to save passengers' });
    }
  });

  // Create a new tour with passengers (data_version 2)
  app.post('/api/tours/v2', authMiddleware(), async (req, res) => {
    try {
      const { tour, passengers } = req.body;
      
      if (!tour || !Array.isArray(passengers) || passengers.length === 0) {
        return res.status(400).json({ error: 'Tour and passengers array required' });
      }
      
      // Set data_version to 2
      tour.data_version = 2;
      tour.jumlah_peserta = passengers.length;
      
      // Set lead passenger info from first passenger
      const lead = passengers[0];
      tour.lead_passenger = lead.name;
      tour.phone_number = lead.phone_number || null;
      tour.email = lead.email || null;
      
      // Calculate totals from passengers
      let totalBasePrice = 0;
      let totalDiscount = 0;
      let totalProfit = 0;
      passengers.forEach(p => {
        totalBasePrice += parseFloat(p.base_price) || 0;
        totalDiscount += parseFloat(p.discount) || 0;
        totalProfit += parseFloat(p.profit) || 0;
      });
      
      tour.tour_price = totalBasePrice;
      tour.discount_amount = totalDiscount;
      tour.profit_amount = totalProfit;
      tour.sales_amount = totalBasePrice - totalDiscount;
      tour.total_nominal_sales = totalBasePrice - totalDiscount;
      
      // Staff assignment
      if (req.user.type === 'basic') {
        tour.staff_name = req.user.name;
      } else if (!tour.staff_name) {
        tour.staff_name = req.user.name;
      }
      
      // Audit
      tour.created_by = req.user.username || req.user.name;
      
      // Check for duplicate booking_code
      if (tour.booking_code) {
        const existing = await db.get('SELECT id FROM tours WHERE booking_code=?', [tour.booking_code]);
        if (existing) return res.status(400).json({ error: `Booking code "${tour.booking_code}" already exists` });
      }
      
      // Validate region
      if (tour.region_id) {
        const r = await db.get('SELECT id FROM regions WHERE id=?', [tour.region_id]);
        if (!r) return res.status(400).json({ error: 'Invalid region_id' });
      }
      
      // Sanitize empty date strings to null for PostgreSQL compatibility
      const dateFields = ['registration_date', 'departure_date', 'return_date'];
      dateFields.forEach(field => {
        if (tour[field] === '') tour[field] = null;
      });
      
      // Insert tour
      const tourKeys = Object.keys(tour);
      const tourValues = Object.values(tour);
      const tourPlaceholders = tourKeys.map(() => '?').join(',');
      const tourSql = `INSERT INTO tours (${tourKeys.join(',')}) VALUES (${tourPlaceholders})`;
      const tourResult = await db.run(tourSql, tourValues);
      const tourId = tourResult.lastID;
      
      // Insert passengers
      for (let i = 0; i < passengers.length; i++) {
        const p = passengers[i];
        await db.run(
          `INSERT INTO tour_passengers (tour_id, passenger_number, name, phone_number, email, base_price, discount, profit, is_lead_passenger)
           VALUES (?, ?, ?, ?, ?, ?, ?, ?, ?)`,
          [
            tourId,
            i + 1,
            p.name || '',
            p.phone_number || null,
            p.email || null,
            parseFloat(p.base_price) || 0,
            parseFloat(p.discount) || 0,
            parseFloat(p.profit) || 0,
            i === 0 ? 1 : 0
          ]
        );
      }
      
      await logActivity(req.user.username, 'CREATE', 'tours', tourId, JSON.stringify({ data_version: 2, passengers: passengers.length }));
      console.log('✅ Tour v2 created:', tourId, 'with', passengers.length, 'passengers');
      res.json({ id: tourId });
    } catch (error) {
      console.error('POST /api/tours/v2 error:', error);
      res.status(500).json({ error: error.message || 'Failed to create tour' });
    }
  });

  // Update a tour with passengers (data_version 2)
  app.put('/api/tours/v2/:id', authMiddleware(), async (req, res) => {
    try {
      const tourId = req.params.id;
      const { tour, passengers } = req.body;
      
      console.log('🔄 PUT /api/tours/v2/:id received:', { tourId, hasTour: !!tour, passengersCount: passengers?.length });
      
      if (!tour || !Array.isArray(passengers) || passengers.length === 0) {
        return res.status(400).json({ error: 'Tour and passengers array required' });
      }
      
      // Verify tour exists
      const existing = await db.get('SELECT * FROM tours WHERE id=?', [tourId]);
      if (!existing) return res.status(404).json({ error: 'Tour not found' });
      
      console.log('📋 Existing tour found:', existing.tour_code, 'staff:', existing.staff_name);
      
      // Check ownership for basic users
      if (req.user.type === 'basic' && existing.staff_name !== req.user.name) {
        return res.status(403).json({ error: 'Unauthorized edit (ownership mismatch)' });
      }
      
      // Define allowed fields for tours table (whitelist approach)
      const allowedFields = [
        'registration_date', 'tour_code', 'booking_code', 'departure_date', 'return_date',
        'region_id', 'status', 'jumlah_peserta', 'staff_name', 'lead_passenger',
        'phone_number', 'email', 'all_passengers', 'tour_price', 'sales_amount',
        'discount_amount', 'discount_remarks', 'total_nominal_sales', 'profit_amount',
        'remarks_request', 'invoice_number', 'link_pelunasan_tour', 'data_version',
        'updated_by', 'updated_at'
      ];
      
      // Build clean tour object with only allowed fields
      const cleanTour = {};
      const dateFields = ['registration_date', 'departure_date', 'return_date', 'updated_at'];
      allowedFields.forEach(field => {
        if (field in tour) {
          // Convert empty strings to null for date/timestamp fields (PostgreSQL compatibility)
          if (dateFields.includes(field) && tour[field] === '') {
            cleanTour[field] = null;
          } else {
            cleanTour[field] = tour[field];
          }
        }
      });
      
      // Set system fields
      cleanTour.data_version = 2;
      cleanTour.jumlah_peserta = passengers.length;
      
      // Set lead passenger info from first passenger
      const lead = passengers[0];
      cleanTour.lead_passenger = lead.name;
      cleanTour.phone_number = lead.phone_number || null;
      cleanTour.email = lead.email || null;
      
      // Calculate totals from passengers
      let totalBasePrice = 0;
      let totalDiscount = 0;
      let totalProfit = 0;
      passengers.forEach(p => {
        totalBasePrice += parseFloat(p.base_price) || 0;
        totalDiscount += parseFloat(p.discount) || 0;
        totalProfit += parseFloat(p.profit) || 0;
      });
      
      cleanTour.tour_price = totalBasePrice;
      cleanTour.discount_amount = totalDiscount;
      cleanTour.profit_amount = totalProfit;
      cleanTour.sales_amount = totalBasePrice - totalDiscount;
      cleanTour.total_nominal_sales = totalBasePrice - totalDiscount;
      
      // Audit
      cleanTour.updated_by = req.user.username || req.user.name;
      cleanTour.updated_at = new Date().toISOString();
      
      // Validate region
      if (cleanTour.region_id) {
        const r = await db.get('SELECT id FROM regions WHERE id=?', [cleanTour.region_id]);
        if (!r) return res.status(400).json({ error: 'Invalid region_id' });
      }
      
      // Update tour
      const tourKeys = Object.keys(cleanTour);
      const tourValues = Object.values(cleanTour);
      const tourSet = tourKeys.map(k => `${k}=?`).join(',');
      
      console.log('💾 Updating tour with keys:', tourKeys.join(', '));
      await db.run(`UPDATE tours SET ${tourSet} WHERE id=?`, [...tourValues, tourId]);
      console.log('✅ Tour table updated');
      
      // Replace passengers
      await db.run('DELETE FROM tour_passengers WHERE tour_id=?', [tourId]);
      console.log('🗑️ Old passengers deleted');
      
      for (let i = 0; i < passengers.length; i++) {
        const p = passengers[i];
        await db.run(
          `INSERT INTO tour_passengers (tour_id, passenger_number, name, phone_number, email, base_price, discount, profit, is_lead_passenger)
           VALUES (?, ?, ?, ?, ?, ?, ?, ?, ?)`,
          [
            tourId,
            i + 1,
            p.name || '',
            p.phone_number || null,
            p.email || null,
            parseFloat(p.base_price) || 0,
            parseFloat(p.discount) || 0,
            parseFloat(p.profit) || 0,
            i === 0 ? 1 : 0
          ]
        );
      }
      console.log('✅ New passengers inserted:', passengers.length);
      
      await logActivity(req.user.username, 'UPDATE', 'tours', tourId, JSON.stringify({ data_version: 2, passengers: passengers.length }));
      console.log('✅ Tour v2 updated:', tourId, 'with', passengers.length, 'passengers');
      res.json({ updated: true });
    } catch (error) {
      console.error('PUT /api/tours/v2/:id error:', error);
      res.status(500).json({ error: error.message || 'Failed to update tour' });
    }
  });

  // Get a single tour with passengers
  app.get('/api/tours/v2/:id', authMiddleware(), async (req, res) => {
    try {
      const tourId = req.params.id;
      const tour = await db.get('SELECT t.*, r.region_name FROM tours t LEFT JOIN regions r ON r.id = t.region_id WHERE t.id=?', [tourId]);
      if (!tour) return res.status(404).json({ error: 'Tour not found' });
      
      // If data_version 2, also get passengers
      if (tour.data_version === 2) {
        const passengers = await db.all(
          'SELECT * FROM tour_passengers WHERE tour_id=? ORDER BY passenger_number ASC',
          [tourId]
        );
        tour.passengers = passengers;
      }
      
      res.json(tour);
    } catch (error) {
      console.error('GET /api/tours/v2/:id error:', error);
      res.status(500).json({ error: 'Failed to fetch tour' });
    }
  });

  // ===================================================================
  // TICKET RECAPS - Flight booking management with segments
  // ===================================================================
  
  // Get all ticket recaps with segments
  app.get('/api/ticket_recaps/full', authMiddleware(), async (req, res) => {
    try {
      const isPg = db.dialect === 'postgres';
      let query = 'SELECT * FROM ticket_recaps';
      let params = [];
      
      // Basic users only see their own
      if (req.user.type === 'basic') {
        query += isPg ? ' WHERE staff_name=$1' : ' WHERE staff_name=?';
        params.push(req.user.name || req.user.username);
      }
      
      query += ' ORDER BY created_at DESC';
      const tickets = await db.all(query, params);
      
      // Get segments for each ticket
      for (const ticket of tickets) {
        const segments = await db.all(
          'SELECT * FROM ticket_segments WHERE ticket_id=? ORDER BY segment_order ASC',
          [ticket.id]
        );
        ticket.segments = segments;
      }
      
      res.json(tickets);
    } catch (error) {
      console.error('GET /api/ticket_recaps/full error:', error);
      res.status(500).json({ error: 'Failed to fetch ticket recaps' });
    }
  });
  
  // Get single ticket recap with segments
  app.get('/api/ticket_recaps/:id/full', authMiddleware(), async (req, res) => {
    try {
      const ticketId = req.params.id;
      const ticket = await db.get('SELECT * FROM ticket_recaps WHERE id=?', [ticketId]);
      
      if (!ticket) {
        return res.status(404).json({ error: 'Ticket not found' });
      }
      
      // Check permission for basic users
      if (req.user.type === 'basic') {
        const staffName = req.user.name || req.user.username;
        if (ticket.staff_name !== staffName) {
          return res.status(403).json({ error: 'Unauthorized' });
        }
      }
      
      const segments = await db.all(
        'SELECT * FROM ticket_segments WHERE ticket_id=? ORDER BY segment_order ASC',
        [ticketId]
      );
      ticket.segments = segments;
      
      res.json(ticket);
    } catch (error) {
      console.error('GET /api/ticket_recaps/:id/full error:', error);
      res.status(500).json({ error: 'Failed to fetch ticket recap' });
    }
  });
  
  // Create ticket recap with segments
  app.post('/api/ticket_recaps/full', authMiddleware(), async (req, res) => {
    try {
      const { ticket, segments } = req.body;
      
      if (!ticket || !ticket.booking_code) {
        return res.status(400).json({ error: 'Booking code is required' });
      }
      
      if (!segments || segments.length === 0) {
        return res.status(400).json({ error: 'At least one flight segment is required' });
      }
      
      const isPg = db.dialect === 'postgres';
      const now = new Date().toISOString();
      
      // Insert ticket recap
      const result = await db.run(
        `INSERT INTO ticket_recaps (
          booking_code, airline_code, gds_system, airline_name, passenger_names,
          staff_name, status, notes, created_by, created_at, updated_at
        ) VALUES (?, ?, ?, ?, ?, ?, ?, ?, ?, ?, ?)`,
        [
          ticket.booking_code,
          ticket.airline_code || null,
          ticket.gds_system || null,
          ticket.airline_name || null,
          ticket.passenger_names || null,
          ticket.staff_name || req.user.name || req.user.username,
          ticket.status || 'Active',
          ticket.notes || null,
          req.user.username,
          now,
          now
        ]
      );
      
      const ticketId = result.lastID;
      
      // Insert segments
      for (let i = 0; i < segments.length; i++) {
        const s = segments[i];
        await db.run(
          `INSERT INTO ticket_segments (
            ticket_id, segment_order, origin, destination, flight_number,
            departure_date, departure_time, arrival_date, arrival_time,
            transit_duration, flight_status, created_at
          ) VALUES (?, ?, ?, ?, ?, ?, ?, ?, ?, ?, ?, ?)`,
          [
            ticketId,
            i + 1,
            s.origin || '',
            s.destination || '',
            s.flight_number || null,
            s.departure_date || null,
            s.departure_time || null,
            s.arrival_date || null,
            s.arrival_time || null,
            s.transit_duration || null,
            s.flight_status || 'Scheduled',
            now
          ]
        );
      }
      
      await logActivity(req.user.username, 'CREATE', 'ticket_recaps', ticketId, JSON.stringify({ booking_code: ticket.booking_code, segments: segments.length }));
      
      res.json({ id: ticketId, created: true });
    } catch (error) {
      console.error('POST /api/ticket_recaps/full error:', error);
      res.status(500).json({ error: error.message || 'Failed to create ticket recap' });
    }
  });
  
  // Update ticket recap with segments
  app.put('/api/ticket_recaps/:id/full', authMiddleware(), async (req, res) => {
    try {
      const ticketId = req.params.id;
      const { ticket, segments } = req.body;
      
      // Check if ticket exists
      const existing = await db.get('SELECT * FROM ticket_recaps WHERE id=?', [ticketId]);
      if (!existing) {
        return res.status(404).json({ error: 'Ticket not found' });
      }
      
      // Check permission for basic users
      if (req.user.type === 'basic') {
        const staffName = req.user.name || req.user.username;
        if (existing.staff_name !== staffName) {
          return res.status(403).json({ error: 'Unauthorized' });
        }
      }
      
      const now = new Date().toISOString();
      
      // Update ticket recap
      await db.run(
        `UPDATE ticket_recaps SET
          booking_code=?, airline_code=?, gds_system=?, airline_name=?,
          passenger_names=?, staff_name=?, status=?, notes=?,
          updated_at=?, updated_by=?
        WHERE id=?`,
        [
          ticket.booking_code || existing.booking_code,
          ticket.airline_code ?? existing.airline_code,
          ticket.gds_system ?? existing.gds_system,
          ticket.airline_name ?? existing.airline_name,
          ticket.passenger_names ?? existing.passenger_names,
          ticket.staff_name ?? existing.staff_name,
          ticket.status ?? existing.status,
          ticket.notes ?? existing.notes,
          now,
          req.user.username,
          ticketId
        ]
      );
      
      // Delete old segments and insert new ones
      await db.run('DELETE FROM ticket_segments WHERE ticket_id=?', [ticketId]);
      
      if (segments && segments.length > 0) {
        for (let i = 0; i < segments.length; i++) {
          const s = segments[i];
          await db.run(
            `INSERT INTO ticket_segments (
              ticket_id, segment_order, origin, destination, flight_number,
              departure_date, departure_time, arrival_date, arrival_time,
              transit_duration, flight_status, created_at
            ) VALUES (?, ?, ?, ?, ?, ?, ?, ?, ?, ?, ?, ?)`,
            [
              ticketId,
              i + 1,
              s.origin || '',
              s.destination || '',
              s.flight_number || null,
              s.departure_date || null,
              s.departure_time || null,
              s.arrival_date || null,
              s.arrival_time || null,
              s.transit_duration || null,
              s.flight_status || 'Scheduled',
              now
            ]
          );
        }
      }
      
      await logActivity(req.user.username, 'UPDATE', 'ticket_recaps', ticketId, JSON.stringify({ segments: segments?.length || 0 }));
      
      res.json({ updated: true });
    } catch (error) {
      console.error('PUT /api/ticket_recaps/:id/full error:', error);
      res.status(500).json({ error: error.message || 'Failed to update ticket recap' });
    }
  });
  
  // Get upcoming departures for reminders (internal use)
  app.get('/api/ticket_recaps/upcoming', authMiddleware(['admin', 'semi-admin']), async (req, res) => {
    try {
      const today = new Date().toISOString().split('T')[0];
      const sevenDaysFromNow = new Date(Date.now() + 7 * 24 * 60 * 60 * 1000).toISOString().split('T')[0];
      
      // Get tickets with first segment departure in next 7 days
      const tickets = await db.all(`
        SELECT DISTINCT tr.*, ts.departure_date as first_departure
        FROM ticket_recaps tr
        INNER JOIN ticket_segments ts ON ts.ticket_id = tr.id AND ts.segment_order = 1
        WHERE tr.status = 'Active'
          AND ts.departure_date >= ?
          AND ts.departure_date <= ?
        ORDER BY ts.departure_date ASC
      `, [today, sevenDaysFromNow]);
      
      // Get all segments for these tickets
      for (const ticket of tickets) {
        const segments = await db.all(
          'SELECT * FROM ticket_segments WHERE ticket_id=? ORDER BY segment_order ASC',
          [ticket.id]
        );
        ticket.segments = segments;
      }
      
      res.json(tickets);
    } catch (error) {
      console.error('GET /api/ticket_recaps/upcoming error:', error);
      res.status(500).json({ error: 'Failed to fetch upcoming tickets' });
    }
  });

  app.get('/api/metrics', authMiddleware(), async (req,res)=>{
    try {
      let { month, year, staff, region } = req.query;
      
      // Default to current month if no filters provided
      if (!month && !year && !staff && !region) {
        const now = new Date();
        month = String(now.getMonth() + 1).padStart(2, '0');
        year = String(now.getFullYear());
      }
      
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
      // Use 'month' column (YYYY-MM format) for sales filtering - more reliable than transaction_date
      const salesParams = [];
      const salesConditions = [];
      
      if (month && year) {
        const monthYearStr = `${year}-${month.padStart(2, '0')}`;
        if (isPg) {
          salesConditions.push(`month=$${salesParams.length+1}`);
          salesParams.push(monthYearStr);
        } else {
          salesConditions.push(`month=?`);
          salesParams.push(monthYearStr);
        }
      } else if (year) {
        // Year only - use LIKE for YYYY-MM format
        if (isPg) {
          salesConditions.push(`month LIKE $${salesParams.length+1}`);
          salesParams.push(`${year}-%`);
        } else {
          salesConditions.push(`month LIKE ?`);
          salesParams.push(`${year}-%`);
        }
      }
      
      if (staff) {
        if (isPg) {
          salesConditions.push(`staff_name=$${salesParams.length+1}`);
          salesParams.push(staff);
        } else {
          salesConditions.push(`staff_name=?`);
          salesParams.push(staff);
        }
      }
      
      const salesWhere = salesConditions.length ? 'WHERE ' + salesConditions.join(' AND ') : '';
      const sales = await db.get(
        `SELECT COALESCE(SUM(sales_amount), 0) AS total_sales, COALESCE(SUM(profit_amount), 0) AS total_profit FROM sales ${salesWhere}`,
        salesParams
      );
      
      // Filter targets by month/year and staff (targets don't have a date field, use month/year integers)
      const targetsParams = [];
      const targetsConditions = [];
      
      if (month) {
        if (isPg) {
          targetsConditions.push(`month=$${targetsParams.length+1}::INTEGER`);
          targetsParams.push(parseInt(month));
        } else {
          targetsConditions.push(`month=?`);
          targetsParams.push(parseInt(month));
        }
      }
      
      if (year) {
        if (isPg) {
          targetsConditions.push(`year=$${targetsParams.length+1}::INTEGER`);
          targetsParams.push(parseInt(year));
        } else {
          targetsConditions.push(`year=?`);
          targetsParams.push(parseInt(year));
        }
      }
      
      if (staff) {
        if (isPg) {
          targetsConditions.push(`staff_name=$${targetsParams.length+1}::TEXT`);
          targetsParams.push(staff);
        } else {
          targetsConditions.push(`staff_name=?`);
          targetsParams.push(staff);
        }
      }
      
      const targetsWhere = targetsConditions.length ? 'WHERE ' + targetsConditions.join(' AND ') : '';
      const targets = await db.get(
        `SELECT COALESCE(SUM(target_sales), 0) AS target_sales, COALESCE(SUM(target_profit), 0) AS target_profit FROM targets ${targetsWhere}`,
        targetsParams
      );
      
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
    const { username, password } = req.body; 
    if (req.user.username !== username && req.user.type !== 'admin') return res.status(403).json({ error:'Unauthorized' }); 
    if (!isStrongPassword(password)) return res.status(400).json({ error:'Password must be at least 8 characters with uppercase, lowercase, number, and special character' }); 
    
    // Check if user exists
    const user = await db.get('SELECT id FROM users WHERE username=?', [username]);
    if (!user) return res.status(404).json({ error: 'User not found' });
    
    const hashed = await bcrypt.hash(password,10); 
    const result = await db.run('UPDATE users SET password=? WHERE username=?',[hashed, username]); 
    logger.info({ username, changes: result.changes }, 'Password reset via reset-password endpoint');
    res.json({ ok:true, updated: result.changes });
  });
  
  app.post('/api/users/:username/reset', authMiddleware(), async (req,res)=>{ 
    if (req.user.type !== 'admin') return res.status(403).json({ error:'Unauthorized' }); 
    const { password } = req.body; 
    if (!isStrongPassword(password)) return res.status(400).json({ error:'Password must be at least 8 characters with uppercase, lowercase, number, and special character' }); 
    
    // Check if user exists
    const targetUser = await db.get('SELECT id FROM users WHERE username=?', [req.params.username]);
    if (!targetUser) return res.status(404).json({ error: 'User not found' });
    
    const hashed = await bcrypt.hash(password,10); 
    const result = await db.run('UPDATE users SET password=? WHERE username=?',[hashed, req.params.username]); 
    logger.info({ username: req.params.username, changes: result.changes, adminUser: req.user.username }, 'Password reset via admin endpoint');
    res.json({ ok:true, updated: result.changes }); 
  });

  // ===================================================================
  // ACTIVE SESSIONS MANAGEMENT (Admin only)
  // ===================================================================
  app.get('/api/sessions/active', authMiddleware(), async (req, res) => {
    if (req.user.type !== 'admin') return res.status(403).json({ error: 'Unauthorized' });
    
    try {
      // Get all active sessions with user info
      const sessions = [];
      for (const [userId, session] of activeSessions.entries()) {
        const user = await db.get('SELECT id, username, name, type FROM users WHERE id=?', [userId]);
        if (user) {
          sessions.push({
            userId,
            username: user.username,
            name: user.name,
            type: user.type,
            loginTime: session.loginTime,
            deviceInfo: session.deviceInfo
          });
        }
      }
      res.json({ sessions, count: sessions.length });
    } catch (err) {
      logger.error({ err }, 'Failed to get active sessions');
      res.status(500).json({ error: 'Failed to get active sessions' });
    }
  });

  app.post('/api/sessions/:userId/terminate', authMiddleware(), async (req, res) => {
    if (req.user.type !== 'admin') return res.status(403).json({ error: 'Unauthorized' });
    
    const targetUserId = parseInt(req.params.userId);
    if (clearSession(targetUserId)) {
      await logActivity(req.user.username, 'TERMINATE_SESSION', 'sessions', targetUserId, 'Admin terminated user session');
      res.json({ ok: true, message: 'Session terminated successfully' });
    } else {
      res.status(404).json({ error: 'No active session found for this user' });
    }
  });

  app.get('/api/backup', authMiddleware(), async (req,res)=>{ if (req.user.type !== 'admin') return res.status(403).json({ error:'Unauthorized' }); if (db.dialect === 'postgres') return res.status(400).json({ error:'Backup endpoint hanya untuk mode SQLite' }); const src = path.resolve('data/travelops.db'); const backupDir = path.resolve('backup'); if (!fs.existsSync(backupDir)) fs.mkdirSync(backupDir); const dest = path.join(backupDir, `travelops_${new Date().toISOString().slice(0,10)}.db`); fs.copyFileSync(src,dest); res.json({ ok:true, file:dest }); });

  app.get('/api/activity_logs', authMiddleware(), async (req,res)=>{ if (req.user.type !== 'admin') return res.status(403).json({ error:'Unauthorized' }); const isPg = db.dialect === 'postgres'; const sql = isPg ? 'SELECT * FROM activity_logs ORDER BY created_at DESC LIMIT 500' : 'SELECT * FROM activity_logs ORDER BY datetime(created_at) DESC LIMIT 500'; const rows = await db.all(sql); res.json(rows); });

  // System Health Stats (Admin only)
  app.get('/api/system/stats', authMiddleware(), async (req, res) => {
    if (req.user.type !== 'admin') return res.status(403).json({ error: 'Unauthorized' });
    try {
      const isPg = db.dialect === 'postgres';
      
      // Get table counts with individual error handling
      const counts = {};
      const tables = ['users', 'sales', 'tours', 'documents', 'targets', 'telecom', 'hotel_bookings', 'regions', 'productivity', 'overtime', 'outstanding', 'cruise', 'cashout', 'activity_logs'];
      for (const table of tables) {
        try {
          const result = await db.get(`SELECT COUNT(*) as count FROM ${table}`);
          counts[table] = parseInt(result?.count, 10) || 0;
        } catch (tableErr) {
          logger.warn({ table, err: tableErr.message }, 'Could not count table');
          counts[table] = 0;
        }
      }
      
      // Get active users (logged in last 24 hours from activity logs)
      let activeUsers24h = 0;
      try {
        const activeUsersResult = await db.get(
          isPg
            ? `SELECT COUNT(DISTINCT username) as count FROM activity_logs WHERE created_at > NOW() - INTERVAL '24 hours'`
            : `SELECT COUNT(DISTINCT username) as count FROM activity_logs WHERE datetime(created_at) > datetime('now', '-24 hours')`
        );
        activeUsers24h = parseInt(activeUsersResult?.count, 10) || 0;
      } catch (err) {
        logger.warn({ err: err.message }, 'Could not get active users');
      }
      
      // Get locked users count
      let lockedUsers = 0;
      try {
        const lockedUsersResult = await db.get(
          isPg
            ? `SELECT COUNT(*) as count FROM users WHERE locked_until IS NOT NULL AND locked_until > NOW()`
            : `SELECT COUNT(*) as count FROM users WHERE locked_until IS NOT NULL AND datetime(locked_until) > datetime('now')`
        );
        lockedUsers = parseInt(lockedUsersResult?.count, 10) || 0;
      } catch (err) {
        logger.warn({ err: err.message }, 'Could not get locked users');
      }
      
      // Get recent activity count (last 7 days)
      let recentActivity7d = 0;
      try {
        const recentActivityResult = await db.get(
          isPg
            ? `SELECT COUNT(*) as count FROM activity_logs WHERE created_at > NOW() - INTERVAL '7 days'`
            : `SELECT COUNT(*) as count FROM activity_logs WHERE datetime(created_at) > datetime('now', '-7 days')`
        );
        recentActivity7d = parseInt(recentActivityResult?.count, 10) || 0;
      } catch (err) {
        logger.warn({ err: err.message }, 'Could not get recent activity');
      }
      
      // Get database info
      let dbInfo = { dialect: db.dialect || 'unknown' };
      if (!isPg) {
        try {
          const dbPath = path.resolve(process.cwd(), 'data/travelops.db');
          if (fs.existsSync(dbPath)) {
            const stats = fs.statSync(dbPath);
            dbInfo.sizeBytes = stats.size;
            dbInfo.sizeMB = (stats.size / (1024 * 1024)).toFixed(2);
          }
        } catch (dbErr) {
          logger.warn({ err: dbErr }, 'Could not get database file info');
        }
      }
      
      res.json({
        counts,
        activeUsers24h,
        lockedUsers,
        recentActivity7d,
        database: dbInfo,
        serverTime: new Date().toISOString(),
        uptime: process.uptime(),
        nodeVersion: process.version
      });
    } catch (err) {
      logger.error({ err, stack: err.stack }, 'System stats error');
      res.status(500).json({ error: 'Failed to get system stats', details: err.message });
    }
  });

  // Admin Stats for Settings Page (simplified format)
  app.get('/api/stats', authMiddleware(), async (req, res) => {
    try {
      const isPg = db.dialect === 'postgres';
      
      // Get counts for all entities
      const entities = {};
      const entityList = ['sales', 'tours', 'documents', 'targets', 'hotel_bookings', 'cruise', 'telecom', 'overtime', 'outstanding'];
      
      let totalRecords = 0;
      for (const entity of entityList) {
        try {
          const result = await db.get(`SELECT COUNT(*) as count FROM ${entity}`);
          const count = parseInt(result?.count, 10) || 0;
          entities[entity] = {
            count,
            lastUpdated: 'Recently'
          };
          totalRecords += count;
        } catch (err) {
          entities[entity] = { count: 0, lastUpdated: '-' };
        }
      }
      
      // Database size
      let dbSize = '-';
      if (!isPg) {
        try {
          const dbPath = path.resolve(process.cwd(), 'data/travelops.db');
          if (fs.existsSync(dbPath)) {
            const stats = fs.statSync(dbPath);
            const sizeMB = (stats.size / (1024 * 1024)).toFixed(2);
            dbSize = `${sizeMB} MB`;
          }
        } catch (err) {
          // Ignore
        }
      } else {
        dbSize = 'PostgreSQL';
      }
      
      // Uptime
      const uptimeSec = process.uptime();
      const hours = Math.floor(uptimeSec / 3600);
      const mins = Math.floor((uptimeSec % 3600) / 60);
      const uptime = hours > 0 ? `${hours}h ${mins}m` : `${mins}m`;
      
      res.json({
        totalRecords,
        dbSize,
        lastSync: 'Just now',
        uptime,
        dbType: isPg ? 'PostgreSQL' : 'SQLite',
        nodeVersion: process.version,
        entities
      });
    } catch (err) {
      logger.error({ err }, 'Stats error');
      res.status(500).json({ error: 'Failed to get stats' });
    }
  });

  // Database Optimization endpoint
  app.post('/api/optimize', authMiddleware(), async (req, res) => {
    if (req.user.type !== 'admin') return res.status(403).json({ error: 'Unauthorized' });
    try {
      const isPg = db.dialect === 'postgres';
      if (!isPg) {
        await db.run('VACUUM');
        await db.run('ANALYZE');
      } else {
        await db.run('VACUUM ANALYZE');
      }
      await logActivity(req.user.username, 'OPTIMIZE', 'system', null, 'Database optimized');
      res.json({ ok: true, message: 'Database optimized successfully' });
    } catch (err) {
      logger.error({ err }, 'Optimize error');
      res.status(500).json({ error: 'Optimization failed' });
    }
  });

  // Create Backup endpoint (enhanced)
  app.post('/api/backup', authMiddleware(), async (req, res) => {
    if (req.user.type !== 'admin') return res.status(403).json({ error: 'Unauthorized' });
    try {
      if (db.dialect === 'postgres') {
        return res.status(400).json({ error: 'Backup endpoint only for SQLite mode' });
      }
      const src = path.resolve('data/travelops.db');
      const backupDir = path.resolve('backup');
      if (!fs.existsSync(backupDir)) fs.mkdirSync(backupDir, { recursive: true });
      const timestamp = new Date().toISOString().replace(/[:.]/g, '-');
      const dest = path.join(backupDir, `backup_${timestamp}.db`);
      fs.copyFileSync(src, dest);
      await logActivity(req.user.username, 'BACKUP', 'system', null, `Created backup: ${dest}`);
      res.json({ ok: true, file: dest, timestamp });
    } catch (err) {
      logger.error({ err }, 'Backup error');
      res.status(500).json({ error: 'Backup failed' });
    }
  });

  // ==================== APP SETTINGS API ====================
  // Get all settings
  app.get('/api/settings', authMiddleware(), async (req, res) => {
    try {
      const rows = await db.all('SELECT setting_key, setting_value FROM app_settings');
      const settings = {};
      rows.forEach(row => {
        try {
          settings[row.setting_key] = JSON.parse(row.setting_value);
        } catch {
          settings[row.setting_key] = row.setting_value;
        }
      });
      res.json(settings);
    } catch (err) {
      logger.error({ err }, 'Get settings error');
      res.status(500).json({ error: 'Failed to load settings' });
    }
  });

  // Update settings (admin only)
  app.put('/api/settings', authMiddleware(), async (req, res) => {
    if (req.user.type !== 'admin' && req.user.type !== 'semi-admin') {
      return res.status(403).json({ error: 'Unauthorized' });
    }
    try {
      const settings = req.body;
      const isPg = db.dialect === 'postgres';
      
      for (const [key, value] of Object.entries(settings)) {
        const valueStr = typeof value === 'object' ? JSON.stringify(value) : String(value);
        
        if (isPg) {
          // Postgres UPSERT
          await db.run(`
            INSERT INTO app_settings (setting_key, setting_value, updated_at, updated_by)
            VALUES (?, ?, NOW(), ?)
            ON CONFLICT (setting_key) DO UPDATE SET 
              setting_value = EXCLUDED.setting_value,
              updated_at = NOW(),
              updated_by = EXCLUDED.updated_by
          `, [key, valueStr, req.user.username]);
        } else {
          // SQLite UPSERT
          await db.run(`
            INSERT INTO app_settings (setting_key, setting_value, updated_at, updated_by)
            VALUES (?, ?, datetime('now'), ?)
            ON CONFLICT(setting_key) DO UPDATE SET 
              setting_value = excluded.setting_value,
              updated_at = datetime('now'),
              updated_by = excluded.updated_by
          `, [key, valueStr, req.user.username]);
        }
      }
      
      await logActivity(req.user.username, 'UPDATE', 'settings', null, `Updated app settings: ${Object.keys(settings).join(', ')}`);
      res.json({ ok: true, message: 'Settings saved' });
    } catch (err) {
      logger.error({ err }, 'Update settings error');
      res.status(500).json({ error: 'Failed to save settings' });
    }
  });

  // Get specific setting
  app.get('/api/settings/:key', authMiddleware(), async (req, res) => {
    try {
      const row = await db.get('SELECT setting_value FROM app_settings WHERE setting_key = ?', [req.params.key]);
      if (!row) {
        return res.json({ value: null });
      }
      try {
        res.json({ value: JSON.parse(row.setting_value) });
      } catch {
        res.json({ value: row.setting_value });
      }
    } catch (err) {
      logger.error({ err }, 'Get setting error');
      res.status(500).json({ error: 'Failed to load setting' });
    }
  });

  // Bulk Export endpoint
  app.get('/api/export/:entity', authMiddleware(), async (req, res) => {
    try {
      const { entity } = req.params;
      const { format = 'json' } = req.query;
      const validEntities = ['sales', 'tours', 'documents', 'targets', 'hotel_bookings', 'cruise', 'telecom', 'overtime', 'outstanding'];
      
      if (!validEntities.includes(entity)) {
        return res.status(400).json({ error: 'Invalid entity' });
      }
      
      const data = await db.all(`SELECT * FROM ${entity}`);
      
      if (format === 'csv') {
        if (data.length === 0) {
          return res.status(200).send('');
        }
        const headers = Object.keys(data[0]);
        const csvRows = [headers.join(',')];
        data.forEach(row => {
          const values = headers.map(h => {
            let val = row[h];
            if (val === null || val === undefined) val = '';
            val = String(val);
            if (val.includes(',') || val.includes('"') || val.includes('\n')) {
              val = `"${val.replace(/"/g, '""')}"`;
            }
            return val;
          });
          csvRows.push(values.join(','));
        });
        res.setHeader('Content-Type', 'text/csv');
        res.setHeader('Content-Disposition', `attachment; filename=${entity}_export.csv`);
        return res.send(csvRows.join('\n'));
      }
      
      res.json(data);
    } catch (err) {
      logger.error({ err }, 'Export error');
      res.status(500).json({ error: 'Export failed' });
    }
  });

  // Bulk Import endpoint
  app.post('/api/import/:entity', authMiddleware(), async (req, res) => {
    if (req.user.type !== 'admin') return res.status(403).json({ error: 'Unauthorized' });
    try {
      const { entity } = req.params;
      const { data } = req.body;
      const validEntities = ['sales', 'tours', 'documents', 'targets', 'hotel_bookings', 'cruise', 'telecom'];
      
      if (!validEntities.includes(entity)) {
        return res.status(400).json({ error: 'Invalid entity' });
      }
      
      if (!Array.isArray(data) || data.length === 0) {
        return res.status(400).json({ error: 'No data provided' });
      }
      
      let imported = 0;
      let failed = 0;
      
      for (const row of data) {
        try {
          const columns = Object.keys(row).filter(k => k !== 'id');
          const values = columns.map(c => row[c]);
          const placeholders = columns.map((_, i) => db.dialect === 'postgres' ? `$${i+1}` : '?').join(', ');
          await db.run(`INSERT INTO ${entity} (${columns.join(', ')}) VALUES (${placeholders})`, values);
          imported++;
        } catch (err) {
          failed++;
        }
      }
      
      await logActivity(req.user.username, 'IMPORT', entity, null, `Imported ${imported} records, ${failed} failed`);
      res.json({ ok: true, imported, failed });
    } catch (err) {
      logger.error({ err }, 'Import error');
      res.status(500).json({ error: 'Import failed' });
    }
  });

  app.post('/api/users/:username/unlock', authMiddleware(), async (req,res)=>{ if (req.user.type !== 'admin') return res.status(403).json({ error:'Unauthorized' }); const user = await db.get('SELECT * FROM users WHERE username=?',[req.params.username]); if (!user) return res.status(404).json({ error:'User not found' }); await db.run('UPDATE users SET failed_attempts=0, locked_until=NULL WHERE id=?',[user.id]); await logActivity(req.user.username,'UNLOCK','users',user.id,'Account unlocked by admin'); res.json({ ok:true }); });

  // Lock user account (Admin only)
  app.post('/api/users/:username/lock', authMiddleware(), async (req,res)=>{
    if (req.user.type !== 'admin') return res.status(403).json({ error:'Unauthorized' });
    const user = await db.get('SELECT * FROM users WHERE username=?',[req.params.username]);
    if (!user) return res.status(404).json({ error:'User not found' });
    if (user.type === 'admin') return res.status(400).json({ error:'Cannot lock admin accounts' });
    if (user.username === req.user.username) return res.status(400).json({ error:'Cannot lock your own account' });
    // Lock indefinitely (set to year 9999)
    const lockedUntil = '9999-12-31T23:59:59.000Z';
    await db.run('UPDATE users SET locked_until=? WHERE id=?',[lockedUntil, user.id]);
    await logActivity(req.user.username,'LOCK','users',user.id,'Account locked by admin');
    res.json({ ok:true });
  });

  app.post('/api/admin/seed', authMiddleware(), async (req,res)=>{ if (req.user.type !== 'admin') return res.status(403).json({ error:'Unauthorized' }); const username = req.body.username || process.env.ADMIN_USERNAME || 'admin'; const name = req.body.name || 'Administrator'; const email = req.body.email || 'admin@example.com'; const password = req.body.password || process.env.ADMIN_PASSWORD || 'Admin1234!'; if (!isStrongPassword(password)) return res.status(400).json({ error:'Password lemah (min 8, huruf besar, huruf kecil, angka)' }); const hashed = await bcrypt.hash(password,10); const existing = await db.get('SELECT * FROM users WHERE username=?',[username]); if (existing){ await db.run('UPDATE users SET password=?, name=?, email=?, type=? WHERE id=?',[hashed, name, email,'admin', existing.id]); await logActivity(req.user.username,'ADMIN_SEED_UPDATE','users',existing.id,`Updated admin user ${username}`); return res.json({ ok:true, updated:true }); } else { const r = await db.run('INSERT INTO users (username,password,name,email,type) VALUES (?,?,?,?,?)',[username, hashed, name, email,'admin']); await logActivity(req.user.username,'ADMIN_SEED_CREATE','users',r.lastID,`Created admin user ${username}`); return res.json({ ok:true, created:true, id:r.lastID }); } });

  // ============================================
  // DASHBOARD SUMMARY API - Consolidated metrics from all modules
  // ============================================
  app.get('/api/dashboard-summary', authMiddleware(), async (req, res) => {
    try {
      const { compare } = req.query; // 'month' or 'year'
      const isPg = db.dialect === 'postgres';
      const now = new Date();
      const currentMonth = now.getMonth() + 1;
      const currentYear = now.getFullYear();
      
      // Helper to format month/year
      const formatMonth = (m) => String(m).padStart(2, '0');
      const monthParam = formatMonth(currentMonth);
      const yearParam = String(currentYear);
      const monthYearStr = `${currentYear}-${monthParam}`; // Format: YYYY-MM
      
      // Sales current month - use 'month' column (YYYY-MM format) which is more reliable
      const salesCurrent = await db.get(
        isPg 
          ? `SELECT COALESCE(SUM(sales_amount), 0) AS total_sales, COALESCE(SUM(profit_amount), 0) AS total_profit, COUNT(*) AS count FROM sales WHERE month = $1`
          : `SELECT COALESCE(SUM(sales_amount), 0) AS total_sales, COALESCE(SUM(profit_amount), 0) AS total_profit, COUNT(*) AS count FROM sales WHERE month = ?`,
        [monthYearStr]
      );
      
      // Targets current month
      const targetsCurrent = await db.get(
        isPg
          ? `SELECT COALESCE(SUM(target_sales), 0) AS target_sales, COALESCE(SUM(target_profit), 0) AS target_profit FROM targets WHERE month=$1 AND year=$2`
          : `SELECT COALESCE(SUM(target_sales), 0) AS target_sales, COALESCE(SUM(target_profit), 0) AS target_profit FROM targets WHERE month=? AND year=?`,
        [currentMonth, currentYear]
      );
      
      // Documents - pending (not completed)
      const pendingDocs = await db.get(
        `SELECT COUNT(*) AS count FROM documents WHERE (process_type IS NULL OR process_type != 'Completed')`
      );
      
      // Outstanding invoices (total and sum)
      const outstanding = await db.get(
        `SELECT COUNT(*) AS count, COALESCE(SUM(nominal_invoice - COALESCE(pembayaran_pertama, 0) - COALESCE(pembayaran_kedua, 0)), 0) AS total_outstanding FROM outstanding`
      );
      
      // Upcoming tours (next 30 days)
      const thirtyDaysLater = new Date(now.getTime() + 30 * 24 * 60 * 60 * 1000).toISOString().split('T')[0];
      const todayStr = now.toISOString().split('T')[0];
      const upcomingTours = await db.get(
        isPg
          ? `SELECT COUNT(*) AS count FROM tours WHERE departure_date >= $1 AND departure_date <= $2`
          : `SELECT COUNT(*) AS count FROM tours WHERE departure_date >= ? AND departure_date <= ?`,
        [todayStr, thirtyDaysLater]
      );
      
      // Upcoming cruise (next 30 days)
      const upcomingCruise = await db.get(
        isPg
          ? `SELECT COUNT(*) AS count FROM cruise WHERE sailing_start >= $1 AND sailing_start <= $2`
          : `SELECT COUNT(*) AS count FROM cruise WHERE sailing_start >= ? AND sailing_start <= ?`,
        [todayStr, thirtyDaysLater]
      );
      
      // Hotel bookings this month
      const hotelBookings = await db.get(
        isPg
          ? `SELECT COUNT(*) AS count FROM hotel_bookings WHERE TO_CHAR(check_in::date, 'YYYY-MM')=$1`
          : `SELECT COUNT(*) AS count FROM hotel_bookings WHERE strftime('%Y-%m', check_in)=?`,
        [monthYearStr]
      );
      
      // Telecom rentals this month
      const telecomRentals = await db.get(
        isPg
          ? `SELECT COUNT(*) AS count FROM telecom WHERE TO_CHAR(tanggal_mulai::date, 'YYYY-MM')=$1`
          : `SELECT COUNT(*) AS count FROM telecom WHERE strftime('%Y-%m', tanggal_mulai)=?`,
        [monthYearStr]
      );
      
      // YTD Summary - use month column LIKE 'YYYY-%'
      const ytdSales = await db.get(
        isPg
          ? `SELECT COALESCE(SUM(sales_amount), 0) AS total_sales, COALESCE(SUM(profit_amount), 0) AS total_profit, COUNT(*) AS count FROM sales WHERE month LIKE $1`
          : `SELECT COALESCE(SUM(sales_amount), 0) AS total_sales, COALESCE(SUM(profit_amount), 0) AS total_profit, COUNT(*) AS count FROM sales WHERE month LIKE ?`,
        [`${currentYear}-%`]
      );
      
      const ytdTargets = await db.get(
        isPg
          ? `SELECT COALESCE(SUM(target_sales), 0) AS target_sales, COALESCE(SUM(target_profit), 0) AS target_profit FROM targets WHERE year=$1`
          : `SELECT COALESCE(SUM(target_sales), 0) AS target_sales, COALESCE(SUM(target_profit), 0) AS target_profit FROM targets WHERE year=?`,
        [currentYear]
      );
      
      // Comparison data
      let comparison = null;
      if (compare === 'month') {
        // Previous month
        const prevMonth = currentMonth === 1 ? 12 : currentMonth - 1;
        const prevYear = currentMonth === 1 ? currentYear - 1 : currentYear;
        const prevMonthYearStr = `${prevYear}-${formatMonth(prevMonth)}`;
        
        const salesPrev = await db.get(
          isPg 
            ? `SELECT COALESCE(SUM(sales_amount), 0) AS total_sales, COALESCE(SUM(profit_amount), 0) AS total_profit FROM sales WHERE month = $1`
            : `SELECT COALESCE(SUM(sales_amount), 0) AS total_sales, COALESCE(SUM(profit_amount), 0) AS total_profit FROM sales WHERE month = ?`,
          [prevMonthYearStr]
        );
        
        comparison = {
          period: `${prevMonth}/${prevYear}`,
          salesChange: salesPrev.total_sales ? ((salesCurrent.total_sales - salesPrev.total_sales) / salesPrev.total_sales * 100).toFixed(1) : null,
          profitChange: salesPrev.total_profit ? ((salesCurrent.total_profit - salesPrev.total_profit) / salesPrev.total_profit * 100).toFixed(1) : null,
          prevSales: salesPrev.total_sales,
          prevProfit: salesPrev.total_profit
        };
      } else if (compare === 'year') {
        // Same month last year
        const prevMonthYearStr = `${currentYear - 1}-${monthParam}`;
        
        const salesPrev = await db.get(
          isPg 
            ? `SELECT COALESCE(SUM(sales_amount), 0) AS total_sales, COALESCE(SUM(profit_amount), 0) AS total_profit FROM sales WHERE month = $1`
            : `SELECT COALESCE(SUM(sales_amount), 0) AS total_sales, COALESCE(SUM(profit_amount), 0) AS total_profit FROM sales WHERE month = ?`,
          [prevMonthYearStr]
        );
        
        comparison = {
          period: `${currentMonth}/${currentYear - 1}`,
          salesChange: salesPrev.total_sales ? ((salesCurrent.total_sales - salesPrev.total_sales) / salesPrev.total_sales * 100).toFixed(1) : null,
          profitChange: salesPrev.total_profit ? ((salesCurrent.total_profit - salesPrev.total_profit) / salesPrev.total_profit * 100).toFixed(1) : null,
          prevSales: salesPrev.total_sales,
          prevProfit: salesPrev.total_profit
        };
      }
      
      // Staff leaderboard (top 10 by sales this month)
      const staffLeaderboard = await db.all(
        isPg
          ? `SELECT staff_name, COALESCE(SUM(sales_amount), 0) AS total_sales, COALESCE(SUM(profit_amount), 0) AS total_profit, COUNT(*) AS transaction_count FROM sales WHERE month = $1 AND staff_name IS NOT NULL AND staff_name != '' GROUP BY staff_name ORDER BY total_sales DESC LIMIT 10`
          : `SELECT staff_name, COALESCE(SUM(sales_amount), 0) AS total_sales, COALESCE(SUM(profit_amount), 0) AS total_profit, COUNT(*) AS transaction_count FROM sales WHERE month = ? AND staff_name IS NOT NULL AND staff_name != '' GROUP BY staff_name ORDER BY total_sales DESC LIMIT 10`,
        [monthYearStr]
      );
      
      res.json({
        currentPeriod: {
          month: currentMonth,
          year: currentYear,
          label: `${['Jan','Feb','Mar','Apr','May','Jun','Jul','Aug','Sep','Oct','Nov','Dec'][currentMonth-1]} ${currentYear}`
        },
        sales: {
          current: salesCurrent.total_sales,
          target: targetsCurrent.target_sales,
          achievement: targetsCurrent.target_sales ? (salesCurrent.total_sales / targetsCurrent.target_sales * 100).toFixed(1) : 0,
          count: salesCurrent.count
        },
        profit: {
          current: salesCurrent.total_profit,
          target: targetsCurrent.target_profit,
          achievement: targetsCurrent.target_profit ? (salesCurrent.total_profit / targetsCurrent.target_profit * 100).toFixed(1) : 0
        },
        ytd: {
          sales: ytdSales.total_sales,
          profit: ytdSales.total_profit,
          targetSales: ytdTargets.target_sales,
          targetProfit: ytdTargets.target_profit,
          salesAchievement: ytdTargets.target_sales ? (ytdSales.total_sales / ytdTargets.target_sales * 100).toFixed(1) : 0,
          profitAchievement: ytdTargets.target_profit ? (ytdSales.total_profit / ytdTargets.target_profit * 100).toFixed(1) : 0,
          transactionCount: ytdSales.count
        },
        modules: {
          pendingDocuments: pendingDocs.count,
          upcomingTours: upcomingTours.count,
          upcomingCruise: upcomingCruise.count,
          outstandingInvoices: outstanding.count,
          outstandingAmount: outstanding.total_outstanding,
          hotelBookings: hotelBookings.count,
          telecomRentals: telecomRentals.count
        },
        comparison,
        staffLeaderboard
      });
    } catch (err) {
      logger.error({ err, stack: err.stack }, 'Dashboard summary error');
      res.status(500).json({ error: 'Failed to fetch dashboard summary', details: err.message });
    }
  });

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

    logger.info({ reportType, from, to, staff, region, user: req.user.username }, 'Generating report');

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

      logger.info({ reportType, dataPoints: reportData.tableData?.length || 0 }, 'Report generated successfully');
      await logActivity(req.user.username, 'GENERATE_REPORT', 'reports', null, `Generated ${reportType} from ${from} to ${to}`);
      res.json(reportData);
    } catch (err) {
      logger.error({ err, reportType, stack: err.stack }, 'Report generation failed');
      res.status(500).json({ error: 'Failed to generate report', details: err.message, stack: process.env.NODE_ENV === 'development' ? err.stack : undefined });
    }
  });

  app.get('/healthz', (req,res)=>{ res.json({ status:'ok', uptime_s: process.uptime(), dialect: db.dialect, timestamp: new Date().toISOString() }); });

  // Debug endpoint to check data counts - RESTRICTED to admin only in production
  app.get('/api/debug/data-counts', authMiddleware(), async (req, res) => {
    // Security: Only allow in development mode OR for admin users
    if (process.env.NODE_ENV === 'production' && req.user.type !== 'admin') {
      return res.status(403).json({ error: 'Debug endpoints are restricted to admin users' });
    }
    
    try {
      const salesCount = await db.get('SELECT COUNT(*) as count FROM sales');
      const toursCount = await db.get('SELECT COUNT(*) as count FROM tours');
      const cruiseCount = await db.get('SELECT COUNT(*) as count FROM cruise');
      const hotelCount = await db.get('SELECT COUNT(*) as count FROM hotel_bookings');
      const documentsCount = await db.get('SELECT COUNT(*) as count FROM documents');
      
      // Only return sample data for admin users
      let samples = {};
      if (req.user.type === 'admin') {
        const sampleSales = await db.all('SELECT id, transaction_date, staff_name, sales_amount, profit_amount FROM sales LIMIT 5');
        const sampleTours = await db.all('SELECT id, tour_code, departure_date, lead_passenger FROM tours LIMIT 5');
        samples = { sales: sampleSales, tours: sampleTours };
      }
      
      res.json({
        counts: {
          sales: salesCount?.count || 0,
          tours: toursCount?.count || 0,
          cruise: cruiseCount?.count || 0,
          hotels: hotelCount?.count || 0,
          documents: documentsCount?.count || 0
        },
        samples
      });
    } catch (err) {
      logger.error({ err }, 'Failed to get data counts');
      res.status(500).json({ error: 'Failed to get data counts', details: err.message });
    }
  });

  // Email Notification Endpoints (Admin only)
  
  // Get email configuration status
  app.get('/api/email/status', authMiddleware(), async (req, res) => {
    if (req.user.type !== 'admin') {
      return res.status(403).json({ error: 'Admin access required' });
    }
    
    res.json({ 
      configured: checkEmailConfigured(),
      message: checkEmailConfigured() 
        ? 'Email service is configured and ready' 
        : 'Email service not configured - set SMTP_USER and SMTP_PASSWORD'
    });
  });
  
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

  // ===================================================================
  // TRACKING & EXPEDITION API ENDPOINTS
  // ===================================================================
  
  // Get all deliveries
  app.get('/api/tracking/deliveries', authMiddleware(), async (req, res) => {
    try {
      const rows = await db.all('SELECT * FROM tracking_deliveries ORDER BY send_date DESC');
      res.json(rows);
    } catch (err) {
      logger.error({ err }, 'Failed to fetch deliveries');
      res.status(500).json({ error: 'Failed to fetch deliveries' });
    }
  });

  // Create delivery
  app.post('/api/tracking/deliveries', authMiddleware(), async (req, res) => {
    try {
      const { send_date, passport_count, invoice_no, booking_code, courier, tracking_no, recipient, address, details, status } = req.body;
      const isPg = db.dialect === 'postgres';
      
      const result = await db.run(
        `INSERT INTO tracking_deliveries (send_date, passport_count, invoice_no, booking_code, courier, tracking_no, recipient, address, details, status, created_by) VALUES (${isPg ? '$1,$2,$3,$4,$5,$6,$7,$8,$9,$10,$11' : '?,?,?,?,?,?,?,?,?,?,?'})`,
        [send_date, passport_count || null, invoice_no || null, booking_code || null, courier || null, tracking_no, recipient || null, address || null, details || null, status || 'pending', req.user.username]
      );
      
      // Sync send_date to documents if invoice_no or booking_code is provided
      if (invoice_no || booking_code) {
        let syncConditions = [];
        let syncParams = [];
        
        if (invoice_no) {
          if (isPg) {
            syncConditions.push(`invoice_no=$${syncParams.length + 1}`);
          } else {
            syncConditions.push('invoice_no=?');
          }
          syncParams.push(invoice_no);
        }
        
        if (booking_code) {
          if (isPg) {
            syncConditions.push(`booking_code=$${syncParams.length + 1}`);
          } else {
            syncConditions.push('booking_code=?');
          }
          syncParams.push(booking_code);
        }
        
        if (syncConditions.length > 0) {
          const whereClause = syncConditions.join(' OR ');
          if (isPg) {
            syncParams.push(send_date);
            await db.run(`UPDATE documents SET send_date=$${syncParams.length} WHERE ${whereClause}`, syncParams);
          } else {
            syncParams.push(send_date);
            await db.run(`UPDATE documents SET send_date=? WHERE ${whereClause}`, [...syncParams.slice(0, -1), send_date]);
          }
          logger.info({ invoice_no, booking_code, send_date }, 'Synced send_date to documents');
        }
      }
      
      await logActivity(req.user.username, 'CREATE', 'tracking_deliveries', result.lastID, JSON.stringify(req.body));
      res.json({ id: result.lastID, message: 'Delivery created successfully' });
    } catch (err) {
      logger.error({ err }, 'Failed to create delivery');
      res.status(500).json({ error: 'Failed to create delivery' });
    }
  });

  // Update delivery
  app.put('/api/tracking/deliveries/:id', authMiddleware(), async (req, res) => {
    try {
      const { id } = req.params;
      const updates = req.body;
      const keys = Object.keys(updates);
      const values = Object.values(updates);
      const isPg = db.dialect === 'postgres';
      
      if (keys.length === 0) {
        return res.status(400).json({ error: 'No update data provided' });
      }
      
      const setClause = keys.map((k, i) => isPg ? `${k}=$${i + 1}` : `${k}=?`).join(', ');
      values.push(id);
      
      await db.run(
        `UPDATE tracking_deliveries SET ${setClause} WHERE id=${isPg ? `$${values.length}` : '?'}`,
        values
      );
      
      // Sync send_date to documents if invoice_no or booking_code is in the record
      if (updates.send_date || updates.invoice_no || updates.booking_code) {
        const record = await db.get('SELECT * FROM tracking_deliveries WHERE id=?', [id]);
        if (record && (record.invoice_no || record.booking_code)) {
          const sendDate = updates.send_date || record.send_date;
          let syncConditions = [];
          let syncParams = [];
          
          if (record.invoice_no) {
            if (isPg) {
              syncConditions.push(`invoice_no=$${syncParams.length + 1}`);
            } else {
              syncConditions.push('invoice_no=?');
            }
            syncParams.push(record.invoice_no);
          }
          
          if (record.booking_code) {
            if (isPg) {
              syncConditions.push(`booking_code=$${syncParams.length + 1}`);
            } else {
              syncConditions.push('booking_code=?');
            }
            syncParams.push(record.booking_code);
          }
          
          if (syncConditions.length > 0 && sendDate) {
            const whereClause = syncConditions.join(' OR ');
            syncParams.push(sendDate);
            if (isPg) {
              await db.run(`UPDATE documents SET send_date=$${syncParams.length} WHERE ${whereClause}`, syncParams);
            } else {
              await db.run(`UPDATE documents SET send_date=? WHERE ${whereClause}`, [...syncParams.slice(0, -1), sendDate]);
            }
          }
        }
      }
      
      await logActivity(req.user.username, 'UPDATE', 'tracking_deliveries', id, JSON.stringify(updates));
      res.json({ message: 'Delivery updated successfully' });
    } catch (err) {
      logger.error({ err }, 'Failed to update delivery');
      res.status(500).json({ error: 'Failed to update delivery' });
    }
  });

  // Delete delivery
  app.delete('/api/tracking/deliveries/:id', authMiddleware(), async (req, res) => {
    try {
      const { id } = req.params;
      await db.run('DELETE FROM tracking_deliveries WHERE id=?', [id]);
      await logActivity(req.user.username, 'DELETE', 'tracking_deliveries', id, '');
      res.json({ message: 'Delivery deleted successfully' });
    } catch (err) {
      logger.error({ err }, 'Failed to delete delivery');
      res.status(500).json({ error: 'Failed to delete delivery' });
    }
  });

  // Get all receivings
  app.get('/api/tracking/receivings', authMiddleware(), async (req, res) => {
    try {
      const rows = await db.all('SELECT * FROM tracking_receivings ORDER BY receive_date DESC');
      res.json(rows);
    } catch (err) {
      logger.error({ err }, 'Failed to fetch receivings');
      res.status(500).json({ error: 'Failed to fetch receivings' });
    }
  });

  // Create receiving
  app.post('/api/tracking/receivings', authMiddleware(), async (req, res) => {
    try {
      const { receive_date, passport_count, sender, tracking_no, details } = req.body;
      const isPg = db.dialect === 'postgres';
      
      const result = await db.run(
        `INSERT INTO tracking_receivings (receive_date, passport_count, sender, tracking_no, details, created_by) VALUES (${isPg ? '$1,$2,$3,$4,$5,$6' : '?,?,?,?,?,?'})`,
        [receive_date, passport_count || null, sender || null, tracking_no || null, details || null, req.user.username]
      );
      
      await logActivity(req.user.username, 'CREATE', 'tracking_receivings', result.lastID, JSON.stringify(req.body));
      res.json({ id: result.lastID, message: 'Receiving created successfully' });
    } catch (err) {
      logger.error({ err }, 'Failed to create receiving');
      res.status(500).json({ error: 'Failed to create receiving' });
    }
  });

  // Update receiving
  app.put('/api/tracking/receivings/:id', authMiddleware(), async (req, res) => {
    try {
      const { id } = req.params;
      const updates = req.body;
      const keys = Object.keys(updates);
      const values = Object.values(updates);
      const isPg = db.dialect === 'postgres';
      
      if (keys.length === 0) {
        return res.status(400).json({ error: 'No update data provided' });
      }
      
      const setClause = keys.map((k, i) => isPg ? `${k}=$${i + 1}` : `${k}=?`).join(', ');
      values.push(id);
      
      await db.run(
        `UPDATE tracking_receivings SET ${setClause} WHERE id=${isPg ? `$${values.length}` : '?'}`,
        values
      );
      
      await logActivity(req.user.username, 'UPDATE', 'tracking_receivings', id, JSON.stringify(updates));
      res.json({ message: 'Receiving updated successfully' });
    } catch (err) {
      logger.error({ err }, 'Failed to update receiving');
      res.status(500).json({ error: 'Failed to update receiving' });
    }
  });

  // Delete receiving
  app.delete('/api/tracking/receivings/:id', authMiddleware(), async (req, res) => {
    try {
      const { id } = req.params;
      await db.run('DELETE FROM tracking_receivings WHERE id=?', [id]);
      await logActivity(req.user.username, 'DELETE', 'tracking_receivings', id, '');
      res.json({ message: 'Receiving deleted successfully' });
    } catch (err) {
      logger.error({ err }, 'Failed to delete receiving');
      res.status(500).json({ error: 'Failed to delete receiving' });
    }
  });

  // Check tracking status from external courier (simulated/fallback)
  // Note: Real tracking requires integration with courier APIs which need API keys
  app.get('/api/tracking/check/:courier/:trackingNo', authMiddleware(), async (req, res) => {
    try {
      const { courier, trackingNo } = req.params;
      
      // For now, return a simulated response
      // In production, you would integrate with actual courier APIs:
      // - JNE: https://api.jne.co.id
      // - J&T: https://api.jet.co.id
      // - SiCepat: https://api.sicepat.com
      // - AnterAja: https://api.anteraja.id
      // - POS Indonesia: https://api.posindonesia.co.id
      
      // Check if we have any cached/stored tracking info
      const delivery = await db.get(
        'SELECT * FROM tracking_deliveries WHERE tracking_no=? ORDER BY id DESC LIMIT 1',
        [trackingNo]
      );
      
      if (delivery) {
        // Return stored status with simulated timeline
        const timeline = [
          { date: delivery.send_date, time: '10:00', description: 'Paket dikirim dari origin', location: 'Jakarta' }
        ];
        
        if (delivery.status === 'in-transit') {
          timeline.unshift({ date: delivery.send_date, time: '14:00', description: 'Paket dalam perjalanan', location: 'Sorting Center' });
        } else if (delivery.status === 'delivered') {
          timeline.unshift({ date: delivery.send_date, time: '14:00', description: 'Paket dalam perjalanan', location: 'Sorting Center' });
          timeline.unshift({ date: delivery.send_date, time: '16:00', description: 'Paket telah diterima', location: delivery.address || 'Tujuan' });
        }
        
        res.json({
          tracking_no: trackingNo,
          courier: delivery.courier || courier,
          status: delivery.status || 'pending',
          origin: 'Jakarta',
          destination: delivery.address || '-',
          timeline
        });
      } else {
        // No local data, return response with suggestion to check courier website
        res.json({
          tracking_no: trackingNo,
          courier: courier,
          status: 'unknown',
          not_found: true,
          message: 'Data tracking tidak ditemukan. Silakan cek langsung di website kurir.',
          courier_urls: {
            jne: 'https://www.jne.co.id/tracking-package',
            jnt: 'https://www.jet.co.id/track',
            sicepat: 'https://www.sicepat.com/checkAwb',
            anteraja: 'https://anteraja.id/tracking',
            pos: 'https://www.posindonesia.co.id/id/tracking',
            tiki: 'https://www.tiki.id/id/track'
          },
          timeline: []
        });
      }
    } catch (err) {
      logger.error({ err }, 'Failed to check tracking');
      res.status(500).json({ error: 'Failed to check tracking status' });
    }
  });

  return { app, db };
}

// ============================================
// REPORT GENERATION FUNCTIONS
// ============================================
async function generateSalesSummary(db, isPg, { from, to, staff, region }) {
  let conditions = [];
  let params = [];
  
  // Use month field for filtering (YYYY-MM format)
  // Convert date range to month range
  if (from) {
    const fromMonth = from.substring(0, 7); // Extract YYYY-MM
    conditions.push(isPg ? `s.month >= $${params.length + 1}` : `s.month >= ?`);
    params.push(fromMonth);
  }
  if (to) {
    const toMonth = to.substring(0, 7); // Extract YYYY-MM
    conditions.push(isPg ? `s.month <= $${params.length + 1}` : `s.month <= ?`);
    params.push(toMonth);
  }
  if (staff) {
    conditions.push(isPg ? `s.staff_name = $${params.length + 1}` : `s.staff_name = ?`);
    params.push(staff);
  }
  if (region) {
    conditions.push(isPg ? `s.region_id = $${params.length + 1}::int` : `s.region_id = ?`);
    params.push(region);
  }
  
  const whereClause = conditions.length > 0 ? `WHERE ${conditions.join(' AND ')}` : '';
  
  // Summary metrics from sales table
  const summary = await db.get(
    `SELECT 
      COUNT(*) as salesCount,
      COALESCE(SUM(sales_amount), 0) as totalSales,
      COALESCE(SUM(profit_amount), 0) as totalProfit,
      COALESCE(AVG(sales_amount), 0) as averageSale
    FROM sales s ${whereClause}`,
    params
  );
  
  // Ensure summary exists with default values
  const safeSummary = summary || { salesCount: 0, totalSales: 0, totalProfit: 0, averageSale: 0 };
  
  // Calculate profit margin
  safeSummary.profitMargin = safeSummary.totalSales > 0 ? (safeSummary.totalProfit / safeSummary.totalSales) * 100 : 0;
  
  // Chart data - sales & profit by month
  const trendData = await db.all(
    `SELECT s.month, 
      SUM(s.sales_amount) as totalSales,
      SUM(s.profit_amount) as totalProfit
     FROM sales s ${whereClause}
     GROUP BY s.month
     ORDER BY s.month`,
    params
  );
  
  // Sales & profit by staff (for comparison)
  const staffData = await db.all(
    `SELECT s.staff_name, 
      SUM(s.sales_amount) as totalSales,
      SUM(s.profit_amount) as totalProfit,
      COUNT(*) as transactionCount
     FROM sales s ${whereClause}
     GROUP BY s.staff_name
     ORDER BY totalSales DESC`,
    params
  );
  
  // Table data - all sales records
  const tableData = await db.all(
    `SELECT s.id, s.month, s.staff_name, s.sales_amount, s.profit_amount, 
      r.region_name, s.status, s.invoice_no, s.unique_code
     FROM sales s
     LEFT JOIN regions r ON r.id = s.region_id
     ${whereClause}
     ORDER BY s.month DESC, s.id DESC
     LIMIT 100`,
    params
  );
  
  return {
    summary: safeSummary,
    chartData: {
      trend: {
        labels: (trendData || []).map(d => d.month || 'Unknown'),
        sales: (trendData || []).map(d => parseFloat(d.totalsales || d.totalSales || 0)),
        profit: (trendData || []).map(d => parseFloat(d.totalprofit || d.totalProfit || 0))
      },
      byStaff: {
        labels: (staffData || []).map(d => d.staff_name || 'Unknown'),
        sales: (staffData || []).map(d => parseFloat(d.totalsales || d.totalSales || 0)),
        profit: (staffData || []).map(d => parseFloat(d.totalprofit || d.totalProfit || 0)),
        transactions: (staffData || []).map(d => parseInt(d.transactioncount || d.transactionCount || 0))
      }
    },
    tableData: tableData || [],
    staffData: staffData || []
  };
}

async function generateSalesDetailed(db, isPg, { from, to, staff, region }) {
  let conditions = [];
  let params = [];
  
  // Use month field for filtering
  if (from) {
    const fromMonth = from.substring(0, 7);
    conditions.push(isPg ? `month >= $${params.length + 1}` : `month >= ?`);
    params.push(fromMonth);
  }
  if (to) {
    const toMonth = to.substring(0, 7);
    conditions.push(isPg ? `month <= $${params.length + 1}` : `month <= ?`);
    params.push(toMonth);
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
      SUM(CASE WHEN status = 'Completed' OR status = 'completed' THEN 1 ELSE 0 END) as completedCount,
      SUM(CASE WHEN status = 'Pending' OR status = 'pending' OR status IS NULL THEN 1 ELSE 0 END) as pendingCount,
      COALESCE(SUM(sales_amount), 0) as totalRevenue
    FROM sales s ${whereClause}`,
    params
  );
  
  if (counts) {
    summary.totalCount = parseInt(counts.totalcount || counts.totalCount || 0);
    summary.completedCount = parseInt(counts.completedcount || counts.completedCount || 0);
    summary.pendingCount = parseInt(counts.pendingcount || counts.pendingCount || 0);
    summary.totalRevenue = parseFloat(counts.totalrevenue || counts.totalRevenue || 0);
  }
  
  const tableData = await db.all(
    `SELECT s.*, r.region_name
     FROM sales s
     LEFT JOIN regions r ON r.id = s.region_id
     ${whereClause}
     ORDER BY s.month DESC, s.id DESC`,
    params
  );
  
  return { summary, tableData: tableData || [] };
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
  
  // Simple summary from tours table
  const rawSummary = await db.get(
    `SELECT 
      COUNT(*) as totalTours,
      COALESCE(SUM(jumlah_peserta), 0) as totalParticipants,
      COALESCE(SUM(total_nominal_sales), 0) as totalRevenue,
      COALESCE(SUM(profit_amount), 0) as totalProfit,
      COALESCE(AVG(jumlah_peserta), 0) as avgParticipants
    FROM tours t ${whereClause}`,
    params
  );
  
  // Normalize for PostgreSQL lowercase columns
  const summary = {
    totalTours: parseInt(rawSummary?.totaltours || rawSummary?.totalTours || 0),
    totalParticipants: parseInt(rawSummary?.totalparticipants || rawSummary?.totalParticipants || 0),
    totalRevenue: parseFloat(rawSummary?.totalrevenue || rawSummary?.totalRevenue || 0),
    totalProfit: parseFloat(rawSummary?.totalprofit || rawSummary?.totalProfit || 0),
    avgParticipants: parseFloat(rawSummary?.avgparticipants || rawSummary?.avgParticipants || 0)
  };
  
  // Get all tour records with region info
  const tableData = await db.all(
    `SELECT t.*, r.region_name
     FROM tours t
     LEFT JOIN regions r ON r.id = t.region_id
     ${whereClause}
     ORDER BY t.departure_date DESC`,
    params
  );
  
  // Group tours by tour_code for chart (top 10 most popular tours)
  const tourCodeData = await db.all(
    `SELECT t.tour_code, 
      COUNT(*) as tourCount,
      SUM(t.jumlah_peserta) as totalParticipants
     FROM tours t ${whereClause}
     GROUP BY t.tour_code
     ORDER BY tourCount DESC
     LIMIT 10`,
    params
  );
  
  // Normalize chart data
  const normalizedTourData = (tourCodeData || []).map(d => ({
    tour_code: d.tour_code || 'Unknown',
    tourCount: parseInt(d.tourcount || d.tourCount || 0),
    totalParticipants: parseInt(d.totalparticipants || d.totalParticipants || 0)
  }));
  
  return {
    summary,
    chartData: {
      byDestination: {
        labels: normalizedTourData.map(d => d.tour_code),
        tourCount: normalizedTourData.map(d => d.tourCount),
        participants: normalizedTourData.map(d => d.totalParticipants)
      }
    },
    tableData: tableData || []
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
  
  const rawSummary = await db.get(
    `SELECT 
      COUNT(*) as totalTours,
      COALESCE(SUM(jumlah_peserta), 0) as totalParticipants,
      COALESCE(AVG(jumlah_peserta), 0) as averagePerTour
    FROM tours t ${whereClause}`,
    params
  );
  
  // Normalize for PostgreSQL lowercase columns
  const summary = {
    totalTours: parseInt(rawSummary?.totaltours || rawSummary?.totalTours || 0),
    totalParticipants: parseInt(rawSummary?.totalparticipants || rawSummary?.totalParticipants || 0),
    averagePerTour: parseFloat(rawSummary?.averagepertour || rawSummary?.averagePerTour || 0),
    occupancyRate: 0.75 // Placeholder - would need capacity data
  };
  
  const tableData = await db.all(
    `SELECT t.*, r.region_name
     FROM tours t
     LEFT JOIN regions r ON r.id = t.region_id
     ${whereClause}
     ORDER BY t.departure_date DESC`,
    params
  );
  
  return { summary, tableData: tableData || [] };
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
  
  const rawCounts = await db.get(
    `SELECT 
      COUNT(*) as totalDocuments,
      SUM(CASE WHEN send_date IS NOT NULL THEN 1 ELSE 0 END) as completedCount,
      SUM(CASE WHEN send_date IS NULL THEN 1 ELSE 0 END) as inProgressCount
    FROM documents d ${whereClause}`,
    params
  );
  
  // Normalize for PostgreSQL lowercase columns
  const summary = {
    totalDocuments: parseInt(rawCounts?.totaldocuments || rawCounts?.totalDocuments || 0),
    completedCount: parseInt(rawCounts?.completedcount || rawCounts?.completedCount || 0),
    inProgressCount: parseInt(rawCounts?.inprogresscount || rawCounts?.inProgressCount || 0),
    avgProcessingDays: 0
  };
  
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
  
  // Normalize process type data
  const normalizedProcessType = (processTypeData || []).map(d => ({
    process_type: d.process_type || 'Unknown',
    count: parseInt(d.count || 0)
  }));
  
  return {
    summary,
    chartData: {
      byProcessType: {
        labels: normalizedProcessType.map(d => d.process_type),
        values: normalizedProcessType.map(d => d.count)
      }
    },
    tableData: tableData || []
  };
}

async function generateStaffPerformance(db, isPg, { from, to, region }) {
  let conditions = [];
  let params = [];
  
  // Use month field for filtering
  if (from) {
    const fromMonth = from.substring(0, 7);
    conditions.push(isPg ? `s.month >= $${params.length + 1}` : `s.month >= ?`);
    params.push(fromMonth);
  }
  if (to) {
    const toMonth = to.substring(0, 7);
    conditions.push(isPg ? `s.month <= $${params.length + 1}` : `s.month <= ?`);
    params.push(toMonth);
  }
  if (region) {
    conditions.push(isPg ? `s.region_id = $${params.length + 1}::int` : `s.region_id = ?`);
    params.push(region);
  }
  
  const whereClause = conditions.length > 0 ? `WHERE ${conditions.join(' AND ')}` : '';
  
  // Staff performance summary
  const summary = await db.get(
    `SELECT 
      COUNT(DISTINCT s.staff_name) as totalStaff,
      COALESCE(SUM(s.sales_amount), 0) as totalSales,
      COALESCE(SUM(s.profit_amount), 0) as totalProfit
    FROM sales s ${whereClause}`,
    params
  );
  
  const safeSummary = {
    totalStaff: parseInt(summary?.totalstaff || summary?.totalStaff || 0),
    totalSales: parseFloat(summary?.totalsales || summary?.totalSales || 0),
    totalProfit: parseFloat(summary?.totalprofit || summary?.totalProfit || 0)
  };
  
  // Performance by staff
  const tableData = await db.all(
    `SELECT 
      s.staff_name,
      r.region_name,
      COALESCE(SUM(s.sales_amount), 0) as total_sales,
      COALESCE(SUM(s.profit_amount), 0) as total_profit,
      COUNT(s.id) as transaction_count,
      COALESCE(AVG(s.sales_amount), 0) as average_sale,
      CASE 
        WHEN SUM(s.sales_amount) > 0 THEN (SUM(s.profit_amount) / SUM(s.sales_amount)) * 100
        ELSE 0
      END as profit_margin
    FROM sales s
    LEFT JOIN regions r ON r.id = s.region_id
    ${whereClause}
    GROUP BY s.staff_name, r.region_name
    ORDER BY total_sales DESC`,
    params
  );
  
  // Normalize postgres lowercase column names
  const normalizedData = (tableData || []).map(d => ({
    staff_name: d.staff_name,
    region_name: d.region_name,
    total_sales: parseFloat(d.total_sales || 0),
    total_profit: parseFloat(d.total_profit || 0),
    transaction_count: parseInt(d.transaction_count || 0),
    average_sale: parseFloat(d.average_sale || 0),
    profit_margin: parseFloat(d.profit_margin || 0)
  }));
  
  return {
    summary: safeSummary,
    chartData: {
      staffSales: {
        labels: normalizedData.map(d => d.staff_name || 'Unknown'),
        sales: normalizedData.map(d => d.total_sales),
        profit: normalizedData.map(d => d.total_profit)
      },
      staffTransactions: {
        labels: normalizedData.map(d => d.staff_name || 'Unknown'),
        values: normalizedData.map(d => d.transaction_count)
      }
    },
    tableData: normalizedData
  };
}

async function generateRegionalComparison(db, isPg, { from, to }) {
  let conditions = [];
  let params = [];
  
  // Use month field for filtering
  if (from) {
    const fromMonth = from.substring(0, 7);
    conditions.push(isPg ? `s.month >= $${params.length + 1}` : `s.month >= ?`);
    params.push(fromMonth);
  }
  if (to) {
    const toMonth = to.substring(0, 7);
    conditions.push(isPg ? `s.month <= $${params.length + 1}` : `s.month <= ?`);
    params.push(toMonth);
  }
  
  const salesCondition = conditions.length > 0 ? `AND ${conditions.join(' AND ')}` : '';
  
  const tableData = await db.all(
    `SELECT 
      r.region_name,
      COALESCE(SUM(s.sales_amount), 0) as total_sales,
      COUNT(DISTINCT t.id) as total_tours,
      COALESCE(SUM(t.jumlah_peserta), 0) as total_participants
    FROM regions r
    LEFT JOIN sales s ON s.region_id = r.id ${salesCondition}
    LEFT JOIN tours t ON t.region_id = r.id
    GROUP BY r.id, r.region_name
    ORDER BY total_sales DESC`,
    params
  );
  
  // Normalize data
  const normalizedData = (tableData || []).map(row => ({
    region_name: row.region_name || 'Unknown',
    total_sales: parseFloat(row.total_sales || 0),
    total_tours: parseInt(row.total_tours || 0),
    total_participants: parseInt(row.total_participants || 0),
    market_share: 0
  }));
  
  const totalSales = normalizedData.reduce((sum, r) => sum + r.total_sales, 0);
  normalizedData.forEach(row => {
    row.market_share = totalSales > 0 ? row.total_sales / totalSales : 0;
  });
  
  return {
    chartData: {
      regionRevenue: {
        labels: normalizedData.map(d => d.region_name),
        values: normalizedData.map(d => d.total_sales)
      }
    },
    tableData: normalizedData
  };
}

async function generateExecutiveSummary(db, isPg, { from, to }) {
  let salesConditions = [];
  let salesParams = [];
  
  // Use month field for filtering
  if (from) {
    const fromMonth = from.substring(0, 7);
    salesConditions.push(isPg ? `month >= $${salesParams.length + 1}` : `month >= ?`);
    salesParams.push(fromMonth);
  }
  if (to) {
    const toMonth = to.substring(0, 7);
    salesConditions.push(isPg ? `month <= $${salesParams.length + 1}` : `month <= ?`);
    salesParams.push(toMonth);
  }
  
  const salesWhere = salesConditions.length > 0 ? `WHERE ${salesConditions.join(' AND ')}` : '';
  
  // Sales metrics
  const salesSummary = await db.get(
    `SELECT 
      COALESCE(SUM(sales_amount), 0) as totalSales,
      COALESCE(SUM(profit_amount), 0) as totalProfit,
      COUNT(*) as transactionCount
    FROM sales ${salesWhere}`,
    salesParams
  );
  
  // Tours metrics (no date filter - show all active tours)
  const toursSummary = await db.get(
    `SELECT 
      COUNT(*) as totalTours,
      COALESCE(SUM(jumlah_peserta), 0) as totalParticipants
    FROM tours`,
    []
  );
  
  // Documents metrics
  const docsSummary = await db.get(
    `SELECT 
      COUNT(*) as totalDocuments,
      SUM(CASE WHEN send_date IS NULL THEN 1 ELSE 0 END) as pendingDocuments,
      SUM(CASE WHEN send_date IS NOT NULL THEN 1 ELSE 0 END) as completedDocuments
    FROM documents`,
    []
  );
  
  // Top performing staff
  const topStaff = await db.all(
    `SELECT 
      staff_name,
      SUM(sales_amount) as total_sales
    FROM sales ${salesWhere}
    GROUP BY staff_name
    ORDER BY total_sales DESC
    LIMIT 5`,
    salesParams
  );
  
  // Normalize values (postgres returns lowercase)
  const summary = {
    totalSales: parseFloat(salesSummary?.totalsales || salesSummary?.totalSales || 0),
    totalProfit: parseFloat(salesSummary?.totalprofit || salesSummary?.totalProfit || 0),
    transactionCount: parseInt(salesSummary?.transactioncount || salesSummary?.transactionCount || 0),
    profitMargin: 0,
    totalTours: parseInt(toursSummary?.totaltours || toursSummary?.totalTours || 0),
    totalParticipants: parseInt(toursSummary?.totalparticipants || toursSummary?.totalParticipants || 0),
    totalDocuments: parseInt(docsSummary?.totaldocuments || docsSummary?.totalDocuments || 0),
    pendingDocuments: parseInt(docsSummary?.pendingdocuments || docsSummary?.pendingDocuments || 0),
    completedDocuments: parseInt(docsSummary?.completeddocuments || docsSummary?.completedDocuments || 0)
  };
  
  summary.profitMargin = summary.totalSales > 0 ? (summary.totalProfit / summary.totalSales) * 100 : 0;
  
  // Normalize top staff data
  const normalizedTopStaff = (topStaff || []).map(s => ({
    staff_name: s.staff_name,
    total_sales: parseFloat(s.total_sales || 0)
  }));
  
  return {
    summary,
    chartData: {
      topStaff: {
        labels: normalizedTopStaff.map(s => s.staff_name || 'Unknown'),
        values: normalizedTopStaff.map(s => s.total_sales)
      }
    },
    topStaff: normalizedTopStaff,
    tableData: []
  };
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
