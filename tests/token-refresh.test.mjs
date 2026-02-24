import request from 'supertest';
import fs from 'fs';
import jwt from 'jsonwebtoken';
import { createApp } from '../createApp.js';

// Configure very short expiry & tiny grace for fast test
process.env.SQLITE_FILE = 'test_token_refresh.db';
process.env.NODE_ENV = 'test';
process.env.JWT_EXPIRES = '1s';
process.env.REFRESH_GRACE_SECONDS = '2';

let app, db;

beforeAll(async () => {
  if (fs.existsSync('test_token_refresh.db')) fs.rmSync('test_token_refresh.db');
  ({ app, db } = await createApp());
});

afterAll(async () => {
  try {
    if (db?.dialect === 'sqlite' && db?.close) await db.close();
    if (fs.existsSync('test_token_refresh.db')) fs.rmSync('test_token_refresh.db');
  } catch (e) { /* ignore */ }
});

describe('Token refresh with grace window', () => {
  test('Can refresh shortly after expiry (within grace)', async () => {
    const login = await request(app).post('/api/login').send({ username: 'admin', password: 'Admin1234!' });
    expect(login.statusCode).toBe(200);
    const token = login.body.token;
    expect(token).toBeDefined();

    // Wait until token nominally expires (>1s) but well within 2s grace
    // Add slight jitter to avoid race with clock granularity
    await new Promise(r => setTimeout(r, 1050));

    const refresh = await request(app).post('/api/refresh').set('Authorization', 'Bearer ' + token);
    expect(refresh.statusCode).toBe(200);
    expect(refresh.body.token).toBeDefined();
  });

  test('Refresh fails beyond grace window', async () => {
    const login = await request(app).post('/api/login').send({ username: 'admin', password: 'Admin1234!', forceLogin: true });
    expect(login.statusCode).toBe(200);
    const token = login.body.token;
    const decoded = jwt.decode(token);
    expect(decoded.exp).toBeDefined();
    const grace = parseInt(process.env.REFRESH_GRACE_SECONDS || '2', 10);
    // Compute dynamic wait: (exp + grace + 1) - nowSec
    const nowSec = Math.floor(Date.now()/1000);
    const targetSec = decoded.exp + grace + 1; // one second past grace
    const waitMs = Math.max(0, (targetSec - nowSec) * 1000);
    await new Promise(r => setTimeout(r, waitMs));

    const refresh = await request(app).post('/api/refresh').set('Authorization', 'Bearer ' + token);
    expect(refresh.statusCode).toBe(403); // Beyond grace should be 403 (expired)
  });
});
