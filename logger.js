import pino from 'pino';

// Base logger
export const logger = pino({
  level: process.env.LOG_LEVEL || 'info',
  transport: process.env.NODE_ENV !== 'production' ? {
    target: 'pino-pretty',
    options: { colorize: true }
  } : undefined
});

// Minimal request logger middleware without extra deps
export function requestLogger(req, res, next) {
  const start = Date.now();
  const { method, url } = req;
  res.on('finish', () => {
    const duration = Date.now() - start;
    logger.info({ method, url, statusCode: res.statusCode, duration_ms: duration, ip: req.ip }, 'http');
  });
  next();
}
