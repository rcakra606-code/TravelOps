import request from 'supertest';
import fs from 'fs';
import { createApp } from '../createApp.js';

process.env.SQLITE_FILE = 'test_crud.db';
process.env.NODE_ENV = 'test';

let db;
let app;
let adminToken;

beforeAll(async () => {
  if (fs.existsSync('test_crud.db')) fs.rmSync('test_crud.db');
  const created = await createApp();
  app = created.app;
  db = created.db;
  const login = await request(app).post('/api/login').send({ username: 'admin', password: 'Admin1234!' });
  adminToken = login.body.token;
});

describe('CRUD basics', () => {
  test('Admin can create region and list it', async () => {
    const create = await request(app)
      .post('/api/regions')
      .set('Authorization', `Bearer ${adminToken}`)
      .send({ region_name: 'Asia' });
    expect(create.statusCode).toBe(200);
    const list = await request(app)
      .get('/api/regions')
      .set('Authorization', `Bearer ${adminToken}`);
    expect(list.statusCode).toBe(200);
    expect(Array.isArray(list.body)).toBe(true);
    expect(list.body.find(r => r.region_name === 'Asia')).toBeTruthy();
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
    if (fs.existsSync('test_crud.db')) fs.rmSync('test_crud.db');
  }
});
