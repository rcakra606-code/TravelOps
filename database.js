import sqlite3 from "sqlite3";
import { open } from "sqlite";
import bcrypt from "bcryptjs";
import pkg from 'pg';

const { Pool } = pkg;

export async function initDb() {
  const usePg = !!process.env.DATABASE_URL;
  if (usePg) {
    return await initPostgres();
  }

  const db = await open({
    filename: "./data/travelops.db",
    driver: sqlite3.Database,
  });

  // === USERS ===
  await db.exec(`
    CREATE TABLE IF NOT EXISTS users (
      id INTEGER PRIMARY KEY AUTOINCREMENT,
      username TEXT UNIQUE,
      name TEXT,
      email TEXT,
      password TEXT,
      type TEXT CHECK(type IN ('basic','semiadmin','admin')) DEFAULT 'basic',
      failed_attempts INTEGER DEFAULT 0,
      locked_until TEXT
    )
  `);

  // Attempt to add security columns if missing (for existing databases)
  try { await db.exec(`ALTER TABLE users ADD COLUMN failed_attempts INTEGER DEFAULT 0`); } catch {}
  try { await db.exec(`ALTER TABLE users ADD COLUMN locked_until TEXT`); } catch {}

  // === REGIONS ===
  await db.exec(`
    CREATE TABLE IF NOT EXISTS regions (
      id INTEGER PRIMARY KEY AUTOINCREMENT,
      region_name TEXT UNIQUE
    )
  `);

  // === SALES ===
  await db.exec(`
    CREATE TABLE IF NOT EXISTS sales (
      id INTEGER PRIMARY KEY AUTOINCREMENT,
      transaction_date TEXT,
      invoice_no TEXT UNIQUE,
      staff_name TEXT,
      status TEXT,
      sales_amount REAL,
      profit_amount REAL,
      notes TEXT
    )
  `);

  // === TOURS ===
  await db.exec(`
    CREATE TABLE IF NOT EXISTS tours (
      id INTEGER PRIMARY KEY AUTOINCREMENT,
      registration_date TEXT,
      lead_passenger TEXT,
      all_passengers TEXT,
      tour_code TEXT,
      region_id INTEGER,
      departure_date TEXT,
      booking_code TEXT,
      tour_price REAL,
      sales_amount REAL,
      profit_amount REAL,
      staff_name TEXT,
      jumlah_peserta INTEGER,
      phone_number TEXT,
      email TEXT,
      status TEXT,
      link_pelunasan_tour TEXT
    )
  `);

  // === DOCUMENTS ===
  await db.exec(`
    CREATE TABLE IF NOT EXISTS documents (
      id INTEGER PRIMARY KEY AUTOINCREMENT,
      receive_date TEXT,
      send_date TEXT,
      guest_name TEXT,
      passport_country TEXT,
      process_type TEXT,
      booking_code TEXT,
      invoice_number TEXT,
      phone_number TEXT,
      estimated_done TEXT,
      staff_name TEXT,
      tour_code TEXT,
      notes TEXT
    )
  `);

  // === TARGETS ===
  await db.exec(`
    CREATE TABLE IF NOT EXISTS targets (
      id INTEGER PRIMARY KEY AUTOINCREMENT,
      month INTEGER,
      year INTEGER,
      staff_name TEXT,
      target_sales REAL,
      target_profit REAL
    )
  `);

  // === TELECOM ===
  await db.exec(`
    CREATE TABLE IF NOT EXISTS telecom (
      id INTEGER PRIMARY KEY AUTOINCREMENT,
      nama TEXT,
      no_telephone TEXT,
      type_product TEXT,
      region_id INTEGER,
      tanggal_mulai TEXT,
      tanggal_selesai TEXT,
      no_rekening TEXT,
      bank TEXT,
      nama_rekening TEXT,
      estimasi_pengambilan TEXT,
      staff_name TEXT,
      deposit TEXT CHECK(deposit IN ('sudah','belum')),
      jumlah_deposit REAL,
      tanggal_pengambilan TEXT,
      tanggal_pengembalian TEXT
    )
  `);

// === ACTIVITY LOGS ===
await db.exec(`
  CREATE TABLE IF NOT EXISTS activity_logs (
    id INTEGER PRIMARY KEY AUTOINCREMENT,
    username TEXT,
    action TEXT,
    entity TEXT,
    record_id INTEGER,
    description TEXT,
    created_at TEXT DEFAULT (datetime('now'))
  );
`);


  // Buat akun admin default jika belum ada
  const admin = await db.get("SELECT * FROM users WHERE username='admin'");
  if (!admin) {
    const hashed = await bcrypt.hash("admin", 10);
    await db.run(
      `INSERT INTO users (username, name, password, type) VALUES (?,?,?,?)`,
      ["admin", "Administrator", hashed, "admin"]
    );
  }

  // Attach dialect and wrappers to match Postgres interface
  db.dialect = 'sqlite';
  return db;
}

async function initPostgres() {
  const pool = new Pool({ connectionString: process.env.DATABASE_URL, ssl: { rejectUnauthorized: false } });

  const toParam = (sql) => {
    let index = 0;
    return sql.replace(/\?/g, () => `$${++index}`);
  };
  const q = (text, params=[]) => pool.query(text, params);

  // Helpers to emulate sqlite API
  const db = {
    dialect: 'postgres',
    _pool: pool,
    async run(sql, params = []) {
      let text = sql.trim();
      text = toParam(text);
      const isInsert = /^insert\s+/i.test(text) && !/returning\s+/i.test(text);
      if (isInsert) text += ' RETURNING id';
      const res = await q(text, params);
      return {
        lastID: res.rows?.[0]?.id ?? null,
        rowCount: res.rowCount,
      };
    },
    async get(sql, params = []) {
      const res = await q(toParam(sql), params);
      return res.rows[0] || null;
    },
    async all(sql, params = []) {
      const res = await q(toParam(sql), params);
      return res.rows;
    },
    async exec(sql) {
      // Split on semicolons carefully (simple cases)
      const statements = sql.split(/;\s*(?=\n|$)/).map(s => s.trim()).filter(Boolean);
      for (const s of statements) { await q(s); }
    }
  };

  // Create schema (idempotent)
  await db.exec(`
    CREATE TABLE IF NOT EXISTS users (
      id SERIAL PRIMARY KEY,
      username TEXT UNIQUE,
      name TEXT,
      email TEXT,
      password TEXT,
      type TEXT CHECK (type IN ('basic','semiadmin','admin')) DEFAULT 'basic',
      failed_attempts INTEGER DEFAULT 0,
      locked_until TIMESTAMPTZ
    );
    ALTER TABLE users ADD COLUMN IF NOT EXISTS failed_attempts INTEGER DEFAULT 0;
    ALTER TABLE users ADD COLUMN IF NOT EXISTS locked_until TIMESTAMPTZ;

    CREATE TABLE IF NOT EXISTS regions (
      id SERIAL PRIMARY KEY,
      region_name TEXT UNIQUE
    );

    CREATE TABLE IF NOT EXISTS sales (
      id SERIAL PRIMARY KEY,
      transaction_date DATE,
      invoice_no TEXT UNIQUE,
      staff_name TEXT,
      status TEXT,
      sales_amount DOUBLE PRECISION,
      profit_amount DOUBLE PRECISION,
      notes TEXT
    );

    CREATE TABLE IF NOT EXISTS tours (
      id SERIAL PRIMARY KEY,
      registration_date DATE,
      lead_passenger TEXT,
      all_passengers TEXT,
      tour_code TEXT,
      region_id INTEGER,
      departure_date DATE,
      booking_code TEXT,
      tour_price DOUBLE PRECISION,
      sales_amount DOUBLE PRECISION,
      profit_amount DOUBLE PRECISION,
      staff_name TEXT,
      jumlah_peserta INTEGER,
      phone_number TEXT,
      email TEXT,
      status TEXT,
      link_pelunasan_tour TEXT
    );

    CREATE TABLE IF NOT EXISTS documents (
      id SERIAL PRIMARY KEY,
      receive_date DATE,
      send_date DATE,
      guest_name TEXT,
      passport_country TEXT,
      process_type TEXT,
      booking_code TEXT,
      invoice_number TEXT,
      phone_number TEXT,
      estimated_done DATE,
      staff_name TEXT,
      tour_code TEXT,
      notes TEXT
    );

    CREATE TABLE IF NOT EXISTS targets (
      id SERIAL PRIMARY KEY,
      month INTEGER,
      year INTEGER,
      staff_name TEXT,
      target_sales DOUBLE PRECISION,
      target_profit DOUBLE PRECISION
    );

    CREATE TABLE IF NOT EXISTS telecom (
      id SERIAL PRIMARY KEY,
      nama TEXT,
      no_telephone TEXT,
      type_product TEXT,
      region_id INTEGER,
      tanggal_mulai DATE,
      tanggal_selesai DATE,
      no_rekening TEXT,
      bank TEXT,
      nama_rekening TEXT,
      estimasi_pengambilan DATE,
      staff_name TEXT,
      deposit TEXT CHECK (deposit IN ('sudah','belum')),
      jumlah_deposit DOUBLE PRECISION,
      tanggal_pengambilan DATE,
      tanggal_pengembalian DATE
    );

    CREATE TABLE IF NOT EXISTS activity_logs (
      id SERIAL PRIMARY KEY,
      username TEXT,
      action TEXT,
      entity TEXT,
      record_id INTEGER,
      description TEXT,
      created_at TIMESTAMPTZ DEFAULT now()
    );
  `);

  // Seed admin user if missing
  const admin = await db.get("SELECT * FROM users WHERE username=$1", ['admin']);
  if (!admin) {
    const cost = parseInt(process.env.BCRYPT_COST || '10', 10);
    const hashed = await bcrypt.hash("admin", cost);
    await db.run(
      `INSERT INTO users (username, name, password, type) VALUES ($1,$2,$3,$4)`,
      ["admin", "Administrator", hashed, "admin"]
    );
  }

  return db;
}
