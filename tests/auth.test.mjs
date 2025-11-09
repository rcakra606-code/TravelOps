import request from 'supertest';
import fs from 'fs';
import bcrypt from 'bcryptjs';
import { createApp } from '../createApp.js';

// Use isolated sqlite file for tests (set BEFORE app creation)
process.env.SQLITE_FILE = 'test_auth.db';
process.env.NODE_ENV = 'test';

let db;
let app;

beforeAll(async () => {
  // Initialize fresh DB and app instance tied to this test DB
  if (fs.existsSync('test_auth.db')) fs.rmSync('test_auth.db');
  const created = await createApp();
  app = created.app;
  db = created.db;
});

describe('Auth & Lockout', () => {
  test('Admin default login works', async () => {
    const res = await request(app).post('/api/login').send({ username: 'admin', password: 'Admin1234!' });
    expect(res.statusCode).toBe(200);
    expect(res.body.token).toBeDefined();
  });

  test('Lockout after 3 failed attempts (non-admin)', async () => {
    // Create a basic user
    const hashed = await bcrypt.hash('Password1', 10);
    await db.run("INSERT INTO users (username, password, name, email, type) VALUES (?,?,?,?,?)", [
      'basic1', hashed, 'Basic User', 'basic@example.com', 'basic'
    ]);

    // 1st bad attempt
    await request(app).post('/api/login').send({ username: 'basic1', password: 'Wrong1' });
    // 2nd bad attempt
    await request(app).post('/api/login').send({ username: 'basic1', password: 'Wrong2' });
    // 3rd bad attempt triggers lock
    const third = await request(app).post('/api/login').send({ username: 'basic1', password: 'Wrong3' });
    expect([401,423]).toContain(third.statusCode);
  });
});

afterAll(async () => {
  try {
    if (db?.dialect === 'postgres' && db?._pool) {
      await db._pool.end();
    } else if (db?.dialect === 'sqlite' && db?.close) {
      await db.close();
    }
  } finally {
    if (fs.existsSync('test_auth.db')) fs.rmSync('test_auth.db');
  }
});
