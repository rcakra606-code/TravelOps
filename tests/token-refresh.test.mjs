import request from 'supertest';
import fs from 'fs';
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

    // Wait until token nominally expires (>1s) but still within 2s grace
    await new Promise(r => setTimeout(r, 1100));

    const refresh = await request(app).post('/api/refresh').set('Authorization', 'Bearer ' + token);
    expect(refresh.statusCode).toBe(200);
    expect(refresh.body.token).toBeDefined();
  });

  test('Refresh fails beyond grace window', async () => {
    const login = await request(app).post('/api/login').send({ username: 'admin', password: 'Admin1234!' });
    expect(login.statusCode).toBe(200);
    const token = login.body.token;

    // Wait beyond expiry + grace (1s + 2s = 3s) → wait ~3.3s
    await new Promise(r => setTimeout(r, 3300));

    const refresh = await request(app).post('/api/refresh').set('Authorization', 'Bearer ' + token);
    expect([401,403]).toContain(refresh.statusCode); // 403 expected, 401 if header handling differs
  });
});
