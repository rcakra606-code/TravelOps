import { open } from 'sqlite';
import dotenv from 'dotenv';
import bcrypt from 'bcryptjs';
import { fileURLToPath } from 'url';
import path from 'path';
import fs from 'fs';
import { Pool } from 'pg';

dotenv.config();

const __filename = fileURLToPath(import.meta.url);
const __dirname = path.dirname(__filename);

function qmarkToDollar(sql) {
  // Convert '?' placeholders to $1, $2, ... for Postgres
  let index = 0;
  let out = '';
  for (let i = 0; i < sql.length; i++) {
    if (sql[i] === '?' && (i === 0 || sql[i - 1] !== '\\')) {
      index += 1;
      out += `$${index}`;
    } else {
      out += sql[i];
    }
  }
  return out;
}

async function initSqlite() {
  // Ensure data directory exists
  const dataDir = path.resolve(__dirname, 'data');
  if (!fs.existsSync(dataDir)) fs.mkdirSync(dataDir, { recursive: true });
  const dbPath = path.join(dataDir, 'travelops.db');

  // Dynamically import sqlite3 only in SQLite mode to avoid native module on Render
  const sqlite3 = (await import('sqlite3')).default;
  const db = await open({ filename: dbPath, driver: sqlite3.Database });
  db.dialect = 'sqlite';

  await createSchema(db);
  return db;
}

async function initPostgres() {
  const pool = new Pool({ connectionString: process.env.DATABASE_URL, ssl: process.env.PGSSL === 'true' ? { rejectUnauthorized: false } : false });

  // Wrapper providing run/get/all similar to sqlite
  const db = {
    dialect: 'postgres',
    _pool: pool,
    async run(sql, params = []) {
      const isInsert = /^\s*insert/i.test(sql);
      const text = isInsert && !/returning\s+id/i.test(sql)
        ? qmarkToDollar(sql) + ' RETURNING id'
        : qmarkToDollar(sql);
      const res = await pool.query(text, params);
      if (isInsert) {
        return { lastID: res.rows[0]?.id };
      }
      return { changes: res.rowCount };
    },
    async get(sql, params = []) {
      const res = await pool.query(qmarkToDollar(sql), params);
      return res.rows[0] || null;
    },
    async all(sql, params = []) {
      const res = await pool.query(qmarkToDollar(sql), params);
      return res.rows;
    }
  };

  await createSchema(db);
  return db;
}

async function createSchema(db) {
  const isPg = db.dialect === 'postgres';
  // In Postgres, a data type is required before IDENTITY; use INT for IDs
  const idCol = isPg ? 'INT GENERATED ALWAYS AS IDENTITY PRIMARY KEY' : 'INTEGER PRIMARY KEY AUTOINCREMENT';
  const text = (t) => isPg ? 'TEXT' : 'TEXT';
  const num = (n) => isPg ? 'NUMERIC' : 'REAL';
  const ts = isPg ? 'TIMESTAMPTZ' : 'TEXT';
  const createdDefault = isPg ? "DEFAULT NOW()" : "DEFAULT (datetime('now'))";

  // Users
  await db.run(`CREATE TABLE IF NOT EXISTS users (
    id ${idCol},
    username TEXT UNIQUE,
    password TEXT,
    name TEXT,
    email TEXT,
    type TEXT,
    failed_attempts INTEGER DEFAULT 0,
    locked_until ${text()} NULL,
    created_at ${ts} ${createdDefault}
  )`);

  // Sales
  await db.run(`CREATE TABLE IF NOT EXISTS sales (
    id ${idCol},
    invoice_number TEXT,
    customer TEXT,
    sales_amount ${num()},
    profit_amount ${num()},
    transaction_date ${ts},
    staff_name TEXT
  )`);

  // Tours
  await db.run(`CREATE TABLE IF NOT EXISTS tours (
    id ${idCol},
    tour_name TEXT,
    region_id INTEGER,
    jumlah_peserta INTEGER,
    departure_date ${ts},
    staff_name TEXT
  )`);

  // Documents
  await db.run(`CREATE TABLE IF NOT EXISTS documents (
    id ${idCol},
    doc_name TEXT,
    process_type TEXT,
    receive_date ${ts},
    staff_name TEXT
  )`);

  // Targets
  await db.run(`CREATE TABLE IF NOT EXISTS targets (
    id ${idCol},
    target_sales ${num()},
    target_profit ${num()},
    staff_name TEXT
  )`);

  // Regions
  await db.run(`CREATE TABLE IF NOT EXISTS regions (
    id ${idCol},
    region_name TEXT
  )`);

  // Telecom
  await db.run(`CREATE TABLE IF NOT EXISTS telecom (
    id ${idCol},
    customer_name TEXT,
    product_name TEXT,
    type_product TEXT,
    amount ${num()},
    transaction_date ${ts},
    staff_name TEXT
  )`);

  // Activity logs
  await db.run(`CREATE TABLE IF NOT EXISTS activity_logs (
    id ${idCol},
    username TEXT,
    action TEXT,
    entity TEXT,
    record_id INTEGER,
    description TEXT,
    created_at ${ts} ${createdDefault}
  )`);

  // Seed admin if no users
  const count = await db.get('SELECT COUNT(*) AS c FROM users');
  if (!count || count.c === 0 || count.count === 0) {
    const adminUser = process.env.ADMIN_USERNAME || 'admin';
    const adminPass = process.env.ADMIN_PASSWORD || 'Admin1234!';
    const hash = await bcrypt.hash(adminPass, 10);
    await db.run('INSERT INTO users (username, password, name, email, type) VALUES (?,?,?,?,?)', [adminUser, hash, 'Administrator', 'admin@example.com', 'admin']);
  }
}

export async function initDb() {
  if (process.env.DATABASE_URL) {
    return initPostgres();
  }
  return initSqlite();
}
