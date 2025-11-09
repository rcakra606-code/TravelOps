// Bootstrap: delegate to createApp.js (factory pattern)
import { createApp, startServer } from './createApp.js';

const { app, db } = await createApp();

if (process.env.NODE_ENV !== 'test') {
  startServer(app);
}

export { app, db };
