import pino from 'pino';

const level = process.env.LOG_LEVEL || 'info';
const pretty = process.env.NODE_ENV !== 'production';

export const logger = pino({
  level,
  transport: pretty ? {
    target: 'pino-pretty',
    options: { colorize: true, translateTime: 'SYS:standard' }
  } : undefined,
  base: { env: process.env.NODE_ENV || 'development' }
});

export function requestLogger(req, res, next) {
  const start = process.hrtime.bigint();
  res.on('finish', () => {
    const durationMs = Number(process.hrtime.bigint() - start) / 1e6;
    logger.info({
      method: req.method,
      url: req.originalUrl,
      status: res.statusCode,
      duration_ms: durationMs.toFixed(2),
      ip: req.ip
    }, 'request');
  });
  next();
}
