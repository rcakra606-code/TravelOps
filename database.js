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
  // Allow overriding sqlite file for tests via SQLITE_FILE
  const dbPath = process.env.SQLITE_FILE
    ? path.resolve(process.cwd(), process.env.SQLITE_FILE)
    : path.join(dataDir, 'travelops.db');

  // Dynamically import sqlite3 only in SQLite mode to avoid native module on Render
  const sqlite3 = (await import('sqlite3')).default;
  const db = await open({ filename: dbPath, driver: sqlite3.Database });
  db.dialect = 'sqlite';

  await createSchema(db);
  return db;
}

async function initPostgres() {
  // Default to SSL enabled for hosted Postgres providers like Neon.
  // If PGSSL is explicitly set, honor it; otherwise enable SSL by default.
  const sslEnabled = process.env.PGSSL ? process.env.PGSSL === 'true' : true;
  const pool = new Pool({
    connectionString: process.env.DATABASE_URL,
    ssl: sslEnabled ? { rejectUnauthorized: false } : false
  });

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
    transaction_date ${text()},
    invoice_no TEXT,
    staff_name TEXT,
    status TEXT DEFAULT 'Pending',
    sales_amount ${num()} DEFAULT 0,
    profit_amount ${num()} DEFAULT 0,
    notes TEXT,
    unique_code TEXT,
    created_at ${ts} ${createdDefault}
  )`);

  // Tours
  await db.run(`CREATE TABLE IF NOT EXISTS tours (
    id ${idCol},
    registration_date ${text()},
    lead_passenger TEXT,
    all_passengers TEXT,
    tour_code TEXT,
    region_id INTEGER,
    departure_date ${text()},
    booking_code TEXT,
    tour_price ${num()} DEFAULT 0,
    sales_amount ${num()} DEFAULT 0,
    profit_amount ${num()} DEFAULT 0,
    discount_amount ${num()} DEFAULT 0,
    discount_remarks TEXT,
    staff_name TEXT,
    jumlah_peserta INTEGER DEFAULT 1,
    phone_number TEXT,
    email TEXT,
    status TEXT DEFAULT 'Pending',
    link_pelunasan_tour TEXT,
    created_at ${ts} ${createdDefault}
  )`);

  // Documents
  await db.run(`CREATE TABLE IF NOT EXISTS documents (
    id ${idCol},
    receive_date ${text()},
    send_date ${text()},
    guest_name TEXT,
    passport_country TEXT,
    process_type TEXT,
    booking_code TEXT,
    invoice_number TEXT,
    phone_number TEXT,
    estimated_done ${text()},
    staff_name TEXT,
    tour_code TEXT,
    notes TEXT,
    created_at ${ts} ${createdDefault}
  )`);

  // Targets
  await db.run(`CREATE TABLE IF NOT EXISTS targets (
    id ${idCol},
    month INTEGER,
    year INTEGER,
    staff_name TEXT,
    target_sales ${num()} DEFAULT 0,
    target_profit ${num()} DEFAULT 0,
    created_at ${ts} ${createdDefault}
  )`);

  // Regions
  await db.run(`CREATE TABLE IF NOT EXISTS regions (
    id ${idCol},
    region_name TEXT
  )`);

  // Telecom
  await db.run(`CREATE TABLE IF NOT EXISTS telecom (
    id ${idCol},
    nama TEXT,
    no_telephone TEXT,
    type_product TEXT,
    region_id INTEGER,
    tanggal_mulai ${text()},
    tanggal_selesai ${text()},
    no_rekening TEXT,
    bank TEXT,
    nama_rekening TEXT,
    estimasi_pengambilan ${text()},
    staff_name TEXT,
    deposit TEXT,
    jumlah_deposit ${num()} DEFAULT 0,
    tanggal_pengambilan ${text()},
    tanggal_pengembalian ${text()},
    created_at ${ts} ${createdDefault}
  )`);

  // Hotel Bookings
  await db.run(`CREATE TABLE IF NOT EXISTS hotel_bookings (
    id ${idCol},
    check_in ${text()},
    check_out ${text()},
    hotel_name TEXT,
    region_id INTEGER,
    confirmation_number TEXT,
    guest_list TEXT,
    supplier_code TEXT,
    supplier_name TEXT,
    staff_name TEXT,
    created_at ${ts} ${createdDefault}
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

  // Run lightweight migrations: add missing columns to existing tables (important for Postgres where CREATE TABLE IF NOT EXISTS won't alter existing tables)
  async function columnExists(table, column) {
    if (db.dialect === 'postgres') {
      const row = await db.get("SELECT column_name FROM information_schema.columns WHERE table_name=$1 AND column_name=$2", [table, column]);
      return !!row;
    } else {
      const rows = await db.all(`PRAGMA table_info(${table})`);
      return rows.some(r => r.name === column);
    }
  }

  async function ensureColumn(table, column, definitionSql) {
    try {
      const exists = await columnExists(table, column);
      if (!exists) {
        if (db.dialect === 'postgres') {
          await db.run(`ALTER TABLE ${table} ADD COLUMN IF NOT EXISTS ${column} ${definitionSql}`);
        } else {
          await db.run(`ALTER TABLE ${table} ADD COLUMN ${column} ${definitionSql}`);
        }
        console.log(`✅ Added missing column: ${table}.${column}`);
      }
    } catch (err) {
      // Non-fatal: log and continue
      console.warn(`⚠️ Failed to ensure column ${table}.${column}:`, err.message);
    }
  }

  // Sales columns expected by frontend
  await ensureColumn('sales', 'invoice_no', 'TEXT');
  await ensureColumn('sales', 'unique_code', 'TEXT');
  await ensureColumn('sales', 'status', "TEXT DEFAULT 'Pending'");
  await ensureColumn('sales', 'notes', 'TEXT');
  await ensureColumn('sales', 'created_at', ts + ' ' + createdDefault);

  // Documents: passport_country
  await ensureColumn('documents', 'passport_country', 'TEXT');

  // Tours: lead_passenger, all_passengers, registration_date, tour_code, jumlah_peserta, booking_code, discount_amount, discount_remarks
  await ensureColumn('tours', 'registration_date', text());
  await ensureColumn('tours', 'lead_passenger', 'TEXT');
  await ensureColumn('tours', 'all_passengers', 'TEXT');
  await ensureColumn('tours', 'tour_code', 'TEXT');
  await ensureColumn('tours', 'jumlah_peserta', 'INTEGER');
  await ensureColumn('tours', 'booking_code', 'TEXT');
  await ensureColumn('tours', 'discount_amount', num());
  await ensureColumn('tours', 'discount_remarks', 'TEXT');

  // Telecom: region_id and fields used by frontend
  await ensureColumn('telecom', 'nama', 'TEXT');
  await ensureColumn('telecom', 'no_telephone', 'TEXT');
  await ensureColumn('telecom', 'region_id', 'INTEGER');

  // Targets: month/year
  await ensureColumn('targets', 'month', 'INTEGER');
  await ensureColumn('targets', 'year', 'INTEGER');
}

export async function initDb() {
  if (process.env.DATABASE_URL) {
    return initPostgres();
  }
  return initSqlite();
}
