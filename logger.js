import pino from 'pino';
import fs from 'fs';
import path from 'path';

// Ensure logs directory exists
const logsDir = path.resolve('data/logs');
if (!fs.existsSync(logsDir)) fs.mkdirSync(logsDir, { recursive: true });

// Log file rotation - create date-based log files
function getLogFilePath(type = 'app') {
  const date = new Date().toISOString().split('T')[0]; // YYYY-MM-DD
  return path.join(logsDir, `${type}-${date}.log`);
}

// Clean up old log files (keep last 30 days)
function cleanOldLogs() {
  try {
    const files = fs.readdirSync(logsDir);
    const cutoff = Date.now() - 30 * 24 * 60 * 60 * 1000;
    for (const file of files) {
      const filepath = path.join(logsDir, file);
      const stats = fs.statSync(filepath);
      if (stats.mtimeMs < cutoff) {
        fs.unlinkSync(filepath);
      }
    }
  } catch (err) {
    // Silently ignore cleanup errors
  }
}

// Run cleanup on startup
cleanOldLogs();

// ===================================================================
// LOG STREAM MANAGEMENT WITH MIDNIGHT ROTATION
// ===================================================================
let appLogStream = fs.createWriteStream(getLogFilePath('app'), { flags: 'a' });
let securityLogStream = fs.createWriteStream(getLogFilePath('security'), { flags: 'a' });
let currentLogDate = new Date().toISOString().split('T')[0];

// Check if date changed and rotate log streams
function rotateStreamsIfNeeded() {
  const today = new Date().toISOString().split('T')[0];
  if (today !== currentLogDate) {
    currentLogDate = today;
    // Close old streams
    try { appLogStream.end(); } catch {}
    try { securityLogStream.end(); } catch {}
    // Open new streams for today
    appLogStream = fs.createWriteStream(getLogFilePath('app'), { flags: 'a' });
    securityLogStream = fs.createWriteStream(getLogFilePath('security'), { flags: 'a' });
    // Recreate pino loggers pointing to new streams
    fileLoggerInstance = pino({ level: process.env.LOG_LEVEL || 'info', base: { pid: process.pid }, timestamp: pino.stdTimeFunctions.isoTime }, appLogStream);
    securityLoggerInstance = pino({ level: 'info', base: { pid: process.pid }, timestamp: pino.stdTimeFunctions.isoTime }, securityLogStream);
    cleanOldLogs();
  }
}

// Schedule rotation check every 60 seconds
setInterval(rotateStreamsIfNeeded, 60 * 1000);

// Base logger
export const logger = pino(
  {
    level: process.env.LOG_LEVEL || 'debug',
    base: { pid: process.pid, hostname: undefined },
    timestamp: pino.stdTimeFunctions.isoTime,
    transport: process.env.NODE_ENV !== 'production' ? {
      target: 'pino-pretty',
      options: { colorize: true, translateTime: 'SYS:standard' }
    } : undefined
  }
);

// File-only logger (always writes JSON to app log file)
let fileLoggerInstance = pino(
  {
    level: process.env.LOG_LEVEL || 'info',
    base: { pid: process.pid },
    timestamp: pino.stdTimeFunctions.isoTime
  },
  appLogStream
);

// Security file logger (writes to security log file)
let securityLoggerInstance = pino(
  {
    level: 'info',
    base: { pid: process.pid },
    timestamp: pino.stdTimeFunctions.isoTime
  },
  securityLogStream
);

// Re-export securityLogger as a getter so imports see the rotated instance
export const securityLogger = { get info() { return securityLoggerInstance.info.bind(securityLoggerInstance); } };

// ===================================================================
// SECURITY EVENT TYPES
// ===================================================================
export const SecurityEvent = {
  LOGIN_SUCCESS: 'LOGIN_SUCCESS',
  LOGIN_FAIL: 'LOGIN_FAIL',
  LOGOUT: 'LOGOUT',
  SESSION_INVALIDATED: 'SESSION_INVALIDATED',
  ACCOUNT_LOCKED: 'ACCOUNT_LOCKED',
  ACCOUNT_UNLOCKED: 'ACCOUNT_UNLOCKED',
  PASSWORD_RESET: 'PASSWORD_RESET',
  EMERGENCY_RESET: 'EMERGENCY_RESET',
  CSRF_FAIL: 'CSRF_FAIL',
  AUTH_FAIL: 'AUTH_FAIL',
  PERMISSION_DENIED: 'PERMISSION_DENIED',
  RATE_LIMITED: 'RATE_LIMITED',
  SUSPICIOUS_INPUT: 'SUSPICIOUS_INPUT',
  DATA_EXPORT: 'DATA_EXPORT',
  DATA_IMPORT: 'DATA_IMPORT',
  BACKUP_CREATED: 'BACKUP_CREATED',
  SETTINGS_CHANGED: 'SETTINGS_CHANGED',
  USER_CREATED: 'USER_CREATED',
  USER_DELETED: 'USER_DELETED',
  BLOCKED_COLUMN: 'BLOCKED_COLUMN',
  RECORD_CREATED: 'RECORD_CREATED',
  RECORD_UPDATED: 'RECORD_UPDATED',
  RECORD_DELETED: 'RECORD_DELETED'
};

/**
 * Log a security event to console, app log file, and security log file.
 * @param {string} event - SecurityEvent type
 * @param {object} details - Event details (ip, username, etc.)
 */
export function logSecurityEvent(event, details = {}) {
  const entry = {
    securityEvent: event,
    ...details
  };

  // Write to security log file always
  securityLoggerInstance.info(entry, `SECURITY: ${event}`);
  // Write to app log file always
  fileLoggerInstance.info(entry, `SECURITY: ${event}`);

  // Console at appropriate level
  const criticalEvents = ['EMERGENCY_RESET', 'ACCOUNT_LOCKED', 'SUSPICIOUS_INPUT', 'BLOCKED_COLUMN'];
  const warnEvents = ['LOGIN_FAIL', 'AUTH_FAIL', 'CSRF_FAIL', 'PERMISSION_DENIED', 'RATE_LIMITED'];

  if (criticalEvents.includes(event)) {
    logger.warn(entry, `SECURITY: ${event}`);
  } else if (warnEvents.includes(event)) {
    logger.info(entry, `SECURITY: ${event}`);
  } else {
    logger.debug(entry, `SECURITY: ${event}`);
  }
}

// ===================================================================
// AUDIT TRAIL HELPER - For data change tracking
// ===================================================================
/**
 * Log a data change for audit purposes.
 * @param {string} username - Who made the change
 * @param {string} action - CREATE, UPDATE, DELETE
 * @param {string} entity - Table/entity name
 * @param {number|string} recordId - Record identifier
 * @param {object} details - Change details
 */
export function logAuditTrail(username, action, entity, recordId, details = {}) {
  const entry = {
    audit: true,
    username,
    action,
    entity,
    recordId,
    ...details
  };

  fileLoggerInstance.info(entry, `AUDIT: ${action} ${entity}`);
  securityLoggerInstance.info(entry, `AUDIT: ${action} ${entity}`);
  logger.info(entry, `AUDIT: ${action} ${entity}`);
}

// ===================================================================
// ENHANCED REQUEST LOGGER MIDDLEWARE
// ===================================================================
export function requestLogger(req, res, next) {
  const start = Date.now();
  const { method, url } = req;
  const requestId = Math.random().toString(36).substring(2, 10);

  // Attach requestId to request for correlation
  req.requestId = requestId;

  // Skip logging for static assets unless there's an error
  const isStatic = ['/css/', '/js/', '/images/', '/fonts/', '/favicon.ico'].some(p => url.startsWith(p));

  res.on('finish', () => {
    const duration = Date.now() - start;
    const statusCode = res.statusCode;

    if (isStatic && statusCode < 400) return;

    const logData = {
      requestId,
      method,
      url: url.split('?')[0], // Strip query params from logs
      statusCode,
      duration_ms: duration,
      ip: req.ip || req.headers?.['x-forwarded-for'] || 'unknown',
      userId: req.user?.id || null,
      username: req.user?.username || null,
      userType: req.user?.type || null
    };

    // Add query params for API routes only
    if (url.startsWith('/api/') && Object.keys(req.query || {}).length > 0) {
      logData.query = req.query;
    }

    // Always write to file
    fileLoggerInstance.info(logData, 'http');

    // Log to console at appropriate level
    if (statusCode >= 500) {
      logger.error(logData, 'HTTP request error');
    } else if (statusCode >= 400) {
      logger.warn(logData, 'HTTP request warning');
    } else if (duration > 1000) {
      logger.warn({ ...logData, slow: true }, 'Slow HTTP request');
    } else {
      logger.info(logData, 'http');
    }
  });

  next();
}

// ===================================================================
// LOG RETRIEVAL API HELPERS
// ===================================================================
/**
 * Get recent log entries from log files.
 * @param {string} type - 'app' or 'security'
 * @param {number} lines - Number of lines to return
 * @param {string} date - Date string (YYYY-MM-DD), defaults to today
 * @returns {Array<object>} Parsed log entries
 */
export function getRecentLogs(type = 'app', lines = 100, date = null) {
  try {
    const targetDate = date || new Date().toISOString().split('T')[0];
    const logFile = path.join(logsDir, `${type}-${targetDate}.log`);

    if (!fs.existsSync(logFile)) return [];

    const content = fs.readFileSync(logFile, 'utf-8');
    const logLines = content.trim().split('\n').filter(l => l.trim());

    const recentLines = logLines.slice(-lines);
    return recentLines.map(line => {
      try { return JSON.parse(line); }
      catch { return { raw: line }; }
    });
  } catch (err) {
    return [{ error: 'Failed to read logs', details: err.message }];
  }
}

/**
 * Get available log dates for a given type.
 * @param {string} type - 'app' or 'security'
 * @returns {Array<string>} Available dates (newest first)
 */
export function getAvailableLogDates(type = 'app') {
  try {
    const files = fs.readdirSync(logsDir);
    return files
      .filter(f => f.startsWith(`${type}-`) && f.endsWith('.log'))
      .map(f => f.replace(`${type}-`, '').replace('.log', ''))
      .sort()
      .reverse();
  } catch {
    return [];
  }
}
