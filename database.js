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
        return { lastID: res?.rows?.[0]?.id || null };
      }
      return { changes: res?.rowCount || 0 };
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
    region_id INTEGER,
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
    return_date ${text()},
    booking_code TEXT,
    tour_price ${num()} DEFAULT 0,
    sales_amount ${num()} DEFAULT 0,
    total_nominal_sales ${num()} DEFAULT 0,
    profit_amount ${num()} DEFAULT 0,
    discount_amount ${num()} DEFAULT 0,
    discount_remarks TEXT,
    staff_name TEXT,
    jumlah_peserta INTEGER DEFAULT 1,
    phone_number TEXT,
    email TEXT,
    status TEXT DEFAULT 'Pending',
    link_pelunasan_tour TEXT,
    invoice_number TEXT,
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

  // Overtime
  await db.run(`CREATE TABLE IF NOT EXISTS overtime (
    id ${idCol},
    staff_name TEXT NOT NULL,
    event_name TEXT,
    event_date ${text()},
    hours ${num()} DEFAULT 0,
    status TEXT DEFAULT 'pending',
    remarks TEXT,
    created_at ${ts} ${createdDefault}
  )`);

  // Cruise
  await db.run(`CREATE TABLE IF NOT EXISTS cruise (
    id ${idCol},
    cruise_brand TEXT,
    ship_name TEXT,
    sailing_start ${text()},
    sailing_end ${text()},
    route TEXT,
    pic_name TEXT,
    participant_names TEXT,
    phone_number TEXT,
    email TEXT,
    reservation_code TEXT,
    staff_name TEXT,
    created_at ${ts} ${createdDefault}
  )`);

  // Outstanding Records
  await db.run(`CREATE TABLE IF NOT EXISTS outstanding (
    id ${idCol},
    nomor_invoice TEXT,
    nominal_invoice ${num()} DEFAULT 0,
    pembayaran_pertama ${num()} DEFAULT 0,
    pembayaran_kedua ${num()} DEFAULT 0,
    unique_code TEXT,
    staff_name TEXT,
    created_at ${ts} ${createdDefault}
  )`);

  // Tracking Deliveries (Pengiriman)
  await db.run(`CREATE TABLE IF NOT EXISTS tracking_deliveries (
    id ${idCol},
    send_date ${text()},
    passport_count INTEGER,
    invoice_no TEXT,
    booking_code TEXT,
    courier TEXT,
    tracking_no TEXT,
    recipient TEXT,
    address TEXT,
    details TEXT,
    status TEXT DEFAULT 'pending',
    tracking_data TEXT,
    created_by TEXT,
    created_at ${ts} ${createdDefault},
    updated_at ${ts}
  )`);

  // Tracking Receivings (Penerimaan)
  await db.run(`CREATE TABLE IF NOT EXISTS tracking_receivings (
    id ${idCol},
    receive_date ${text()},
    passport_count INTEGER,
    sender TEXT,
    tracking_no TEXT,
    details TEXT,
    created_by TEXT,
    created_at ${ts} ${createdDefault},
    updated_at ${ts}
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

  // Cash Out Reporting
  await db.run(`CREATE TABLE IF NOT EXISTS cashout (
    id ${idCol},
    request_date ${text()},
    staff_name TEXT,
    amount ${num()} DEFAULT 0,
    purpose TEXT,
    cust_code TEXT,
    jira_request TEXT,
    jira_settlement TEXT,
    settlement_date ${text()},
    status TEXT DEFAULT 'pending',
    notes TEXT,
    created_by TEXT,
    created_at ${ts} ${createdDefault},
    updated_at ${ts},
    updated_by TEXT
  )`);

  // Productivity - Sales tracking by product category
  await db.run(`CREATE TABLE IF NOT EXISTS productivity (
    id ${idCol},
    month INTEGER NOT NULL,
    year INTEGER NOT NULL,
    product_type TEXT NOT NULL,
    retail_sales ${num()} DEFAULT 0,
    retail_profit ${num()} DEFAULT 0,
    corporate_sales ${num()} DEFAULT 0,
    corporate_profit ${num()} DEFAULT 0,
    staff_name TEXT NOT NULL,
    retail_margin ${num()} DEFAULT 0,
    corporate_margin ${num()} DEFAULT 0,
    total_sales ${num()} DEFAULT 0,
    total_profit ${num()} DEFAULT 0,
    total_margin ${num()} DEFAULT 0,
    created_at ${ts} ${createdDefault},
    updated_at ${ts}
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
        if (process.env.NODE_ENV !== 'test') {
          console.log(`🔧 Adding missing column: ${table}.${column}`);
        }
        if (db.dialect === 'postgres') {
          await db.run(`ALTER TABLE ${table} ADD COLUMN IF NOT EXISTS ${column} ${definitionSql}`);
        } else {
          await db.run(`ALTER TABLE ${table} ADD COLUMN ${column} ${definitionSql}`);
        }
        if (process.env.NODE_ENV !== 'test') {
          console.log(`✅ Added missing column: ${table}.${column}`);
        }
      } else {
        if (process.env.NODE_ENV !== 'test') {
          console.log(`✓ Column already exists: ${table}.${column}`);
        }
      }
    } catch (err) {
      // For critical tables, throw error; otherwise log and continue
      console.error(`❌ Failed to ensure column ${table}.${column}:`, err.message);
      if (['sales', 'tours', 'documents', 'telecom', 'hotel_bookings'].includes(table)) {
        throw new Error(`Critical migration failed for ${table}.${column}: ${err.message}`);
      }
    }
  }

  // Sales columns expected by frontend
  await ensureColumn('sales', 'invoice_no', 'TEXT');
  await ensureColumn('sales', 'unique_code', 'TEXT');
  await ensureColumn('sales', 'status', "TEXT DEFAULT 'Pending'");
  await ensureColumn('sales', 'notes', 'TEXT');
  await ensureColumn('sales', 'region_id', 'INTEGER');
  await ensureColumn('sales', 'month', 'TEXT'); // Format: YYYY-MM for monthly reporting
  await ensureColumn('sales', 'created_at', isPg ? 'TIMESTAMPTZ DEFAULT NOW()' : 'TEXT DEFAULT (datetime(\'now\'))');

  // Documents: all columns used by frontend
  await ensureColumn('documents', 'receive_date', 'TEXT');
  await ensureColumn('documents', 'send_date', 'TEXT');
  await ensureColumn('documents', 'guest_name', 'TEXT');
  await ensureColumn('documents', 'passport_country', 'TEXT');
  await ensureColumn('documents', 'process_type', 'TEXT');
  await ensureColumn('documents', 'booking_code', 'TEXT');
  await ensureColumn('documents', 'invoice_number', 'TEXT');
  await ensureColumn('documents', 'phone_number', 'TEXT');
  await ensureColumn('documents', 'estimated_done', 'TEXT');
  await ensureColumn('documents', 'staff_name', 'TEXT');
  await ensureColumn('documents', 'tour_code', 'TEXT');
  await ensureColumn('documents', 'notes', 'TEXT');

  // Tours: all columns used by frontend
  await ensureColumn('tours', 'registration_date', 'TEXT');
  await ensureColumn('tours', 'lead_passenger', 'TEXT');
  await ensureColumn('tours', 'all_passengers', 'TEXT');
  await ensureColumn('tours', 'tour_code', 'TEXT');
  await ensureColumn('tours', 'region_id', 'INTEGER');
  await ensureColumn('tours', 'departure_date', 'TEXT');
  await ensureColumn('tours', 'booking_code', 'TEXT');
  await ensureColumn('tours', 'tour_price', isPg ? 'NUMERIC DEFAULT 0' : 'REAL DEFAULT 0');
  await ensureColumn('tours', 'sales_amount', isPg ? 'NUMERIC DEFAULT 0' : 'REAL DEFAULT 0');
  await ensureColumn('tours', 'profit_amount', isPg ? 'NUMERIC DEFAULT 0' : 'REAL DEFAULT 0');
  await ensureColumn('tours', 'discount_amount', isPg ? 'NUMERIC DEFAULT 0' : 'REAL DEFAULT 0');
  await ensureColumn('tours', 'discount_remarks', 'TEXT');
  await ensureColumn('tours', 'staff_name', 'TEXT');
  await ensureColumn('tours', 'jumlah_peserta', 'INTEGER DEFAULT 1');
  await ensureColumn('tours', 'phone_number', 'TEXT');
  await ensureColumn('tours', 'email', 'TEXT');
  await ensureColumn('tours', 'status', 'TEXT');
  await ensureColumn('tours', 'link_pelunasan_tour', 'TEXT');
  await ensureColumn('tours', 'remarks', 'TEXT');
  await ensureColumn('tours', 'total_nominal_sales', isPg ? 'NUMERIC DEFAULT 0' : 'REAL DEFAULT 0');
  await ensureColumn('tours', 'invoice_number', 'TEXT');
  await ensureColumn('tours', 'return_date', 'TEXT');

  // Telecom: all columns used by frontend
  await ensureColumn('telecom', 'nama', 'TEXT');
  await ensureColumn('telecom', 'no_telephone', 'TEXT');
  await ensureColumn('telecom', 'type_product', 'TEXT');
  await ensureColumn('telecom', 'region_id', 'INTEGER');
  await ensureColumn('telecom', 'tanggal_mulai', 'TEXT');
  await ensureColumn('telecom', 'tanggal_selesai', 'TEXT');
  await ensureColumn('telecom', 'no_rekening', 'TEXT');
  await ensureColumn('telecom', 'bank', 'TEXT');
  await ensureColumn('telecom', 'nama_rekening', 'TEXT');
  await ensureColumn('telecom', 'estimasi_pengambilan', 'TEXT');
  await ensureColumn('telecom', 'staff_name', 'TEXT');
  await ensureColumn('telecom', 'deposit', 'TEXT');
  await ensureColumn('telecom', 'jumlah_deposit', isPg ? 'NUMERIC DEFAULT 0' : 'REAL DEFAULT 0');
  await ensureColumn('telecom', 'tanggal_pengambilan', 'TEXT');
  await ensureColumn('telecom', 'tanggal_pengembalian', 'TEXT');

  // Hotel Bookings: all columns
  await ensureColumn('hotel_bookings', 'check_in', 'TEXT');
  await ensureColumn('hotel_bookings', 'check_out', 'TEXT');
  await ensureColumn('hotel_bookings', 'hotel_name', 'TEXT');
  await ensureColumn('hotel_bookings', 'region_id', 'INTEGER');
  await ensureColumn('hotel_bookings', 'confirmation_number', 'TEXT');
  await ensureColumn('hotel_bookings', 'guest_list', 'TEXT');
  await ensureColumn('hotel_bookings', 'supplier_code', 'TEXT');
  await ensureColumn('hotel_bookings', 'supplier_name', 'TEXT');
  await ensureColumn('hotel_bookings', 'staff_name', 'TEXT');

  // Targets: month/year
  await ensureColumn('targets', 'month', 'INTEGER');
  await ensureColumn('targets', 'year', 'INTEGER');

  // Users: lockout columns for security
  await ensureColumn('users', 'failed_attempts', 'INTEGER DEFAULT 0');
  await ensureColumn('users', 'locked_until', 'TEXT');

  // ===================================================================
  // PERFORMANCE INDEXES - Add indexes on frequently queried columns
  // ===================================================================
  async function ensureIndex(tableName, indexName, columns) {
    try {
      if (isPg) {
        // PostgreSQL: Create index if not exists
        await db.run(`CREATE INDEX IF NOT EXISTS ${indexName} ON ${tableName} (${columns})`);
      } else {
        // SQLite: Check if index exists first
        const existing = await db.get(`SELECT name FROM sqlite_master WHERE type='index' AND name=?`, [indexName]);
        if (!existing) {
          await db.run(`CREATE INDEX ${indexName} ON ${tableName} (${columns})`);
        }
      }
      if (process.env.NODE_ENV !== 'test') {
        console.log(`✓ Index ensured: ${indexName}`);
      }
    } catch (err) {
      // Index may already exist, ignore error
      if (!err.message.includes('already exists')) {
        console.error(`⚠ Index ${indexName} warning:`, err.message);
      }
    }
  }

  // Sales indexes for faster queries
  await ensureIndex('sales', 'idx_sales_month', 'month');
  await ensureIndex('sales', 'idx_sales_staff', 'staff_name');
  await ensureIndex('sales', 'idx_sales_region', 'region_id');
  await ensureIndex('sales', 'idx_sales_status', 'status');
  
  // Tours indexes
  await ensureIndex('tours', 'idx_tours_departure', 'departure_date');
  await ensureIndex('tours', 'idx_tours_staff', 'staff_name');
  await ensureIndex('tours', 'idx_tours_region', 'region_id');
  await ensureIndex('tours', 'idx_tours_status', 'status');
  
  // Documents indexes
  await ensureIndex('documents', 'idx_docs_receive', 'receive_date');
  await ensureIndex('documents', 'idx_docs_staff', 'staff_name');
  
  // Targets indexes
  await ensureIndex('targets', 'idx_targets_period', 'year, month');
  await ensureIndex('targets', 'idx_targets_staff', 'staff_name');
  
  // Activity logs for audit queries
  await ensureIndex('activity_logs', 'idx_activity_user', 'username');
  await ensureIndex('activity_logs', 'idx_activity_entity', 'entity');
  await ensureIndex('activity_logs', 'idx_activity_created', 'created_at');

  // Tracking indexes
  await ensureIndex('tracking_deliveries', 'idx_tracking_del_date', 'send_date');
  await ensureIndex('tracking_deliveries', 'idx_tracking_del_invoice', 'invoice_no');
  await ensureIndex('tracking_deliveries', 'idx_tracking_del_booking', 'booking_code');
  await ensureIndex('tracking_deliveries', 'idx_tracking_del_tracking', 'tracking_no');
  await ensureIndex('tracking_receivings', 'idx_tracking_rec_date', 'receive_date');

  // ===================================================================
  // AUDIT LOG COLUMNS - Add created_at, created_by, updated_at, updated_by
  // to all main entity tables for tracking who created/modified records
  // ===================================================================
  
  // Tours audit columns
  await ensureColumn('tours', 'created_by', 'TEXT');
  await ensureColumn('tours', 'updated_at', isPg ? 'TIMESTAMPTZ' : 'TEXT');
  await ensureColumn('tours', 'updated_by', 'TEXT');
  
  // Sales audit columns
  await ensureColumn('sales', 'created_by', 'TEXT');
  await ensureColumn('sales', 'updated_at', isPg ? 'TIMESTAMPTZ' : 'TEXT');
  await ensureColumn('sales', 'updated_by', 'TEXT');
  
  // Documents audit columns
  await ensureColumn('documents', 'created_by', 'TEXT');
  await ensureColumn('documents', 'updated_at', isPg ? 'TIMESTAMPTZ' : 'TEXT');
  await ensureColumn('documents', 'updated_by', 'TEXT');
  
  // Hotel Bookings audit columns
  await ensureColumn('hotel_bookings', 'created_by', 'TEXT');
  await ensureColumn('hotel_bookings', 'updated_at', isPg ? 'TIMESTAMPTZ' : 'TEXT');
  await ensureColumn('hotel_bookings', 'updated_by', 'TEXT');
  
  // Cruise audit columns
  await ensureColumn('cruise', 'created_by', 'TEXT');
  await ensureColumn('cruise', 'updated_at', isPg ? 'TIMESTAMPTZ' : 'TEXT');
  await ensureColumn('cruise', 'updated_by', 'TEXT');
  
  // Telecom audit columns
  await ensureColumn('telecom', 'created_by', 'TEXT');
  await ensureColumn('telecom', 'updated_at', isPg ? 'TIMESTAMPTZ' : 'TEXT');
  await ensureColumn('telecom', 'updated_by', 'TEXT');
  
  // Overtime audit columns
  await ensureColumn('overtime', 'created_by', 'TEXT');
  await ensureColumn('overtime', 'updated_at', isPg ? 'TIMESTAMPTZ' : 'TEXT');
  await ensureColumn('overtime', 'updated_by', 'TEXT');
  
  // Targets audit columns
  await ensureColumn('targets', 'created_by', 'TEXT');
  await ensureColumn('targets', 'updated_at', isPg ? 'TIMESTAMPTZ' : 'TEXT');
  await ensureColumn('targets', 'updated_by', 'TEXT');

  if (process.env.NODE_ENV !== 'test') {
    console.log('✅ All database migrations completed successfully');
  }
}

export async function initDb() {
  if (process.env.DATABASE_URL) {
    return initPostgres();
  }
  return initSqlite();
}
