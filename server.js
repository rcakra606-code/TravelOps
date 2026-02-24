// Bootstrap: delegate to createApp.js (factory pattern)
import { createApp, startServer } from './createApp.js';
import { logger } from './logger.js';

// Global safety nets for unhandled errors
process.on('unhandledRejection', (reason, promise) => {
  logger.error({ err: reason, promise: String(promise) }, 'Unhandled promise rejection');
});
process.on('uncaughtException', (err) => {
  logger.error({ err }, 'Uncaught exception — shutting down');
  process.exit(1);
});

const { app, db } = await createApp();

if (process.env.NODE_ENV !== 'test') {
  startServer(app);
}

export { app, db };
