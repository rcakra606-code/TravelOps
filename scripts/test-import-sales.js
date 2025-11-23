#!/usr/bin/env node
import fs from 'fs';
import path from 'path';

const PORT = process.env.TEST_PORT || '3300';
const BASE = `http://localhost:${PORT}`;

async function api(pathname, { method='GET', token, body }={}) {
  const headers = { 'Content-Type': 'application/json' };
  if (token) headers['Authorization'] = 'Bearer ' + token;
  const res = await fetch(BASE + pathname, { method, headers, body: body?JSON.stringify(body):undefined });
  if (!res.ok) throw new Error(`${method} ${pathname} -> ${res.status} ${await res.text()}`);
  return await res.json().catch(()=>null);
}

async function loginAdmin() {
  return api('/api/login', { method:'POST', body:{ username:'admin', password:'Admin1234!' } });
}

async function ensureRegion(token, name) {
  const regions = await api('/api/regions', { token });
  const existing = regions.find(r => r.region_name === name);
  if (existing) return existing.id;
  const created = await api('/api/regions', { method:'POST', token, body:{ region_name: name } });
  return created.id;
}

function buildCsvValid(regionName) {
  return [
    'transaction_date,invoice_no,unique_code,staff_name,status,sales_amount,profit_amount,notes,region_name',
    `2025-11-01,INV-1001,UC-1,Administrator,Paid,100000,50000,First import row,${regionName}`,
    `2025-11-02,INV-1002,UC-2,Administrator,Paid,150000,60000,Second import row,${regionName}`
  ].join('\n');
}

function buildCsvInvalidHeader(regionName) {
  return [
    'transaction_date,invoice_no,BAD_COL,staff_name,status,sales_amount,profit_amount,notes,region_name',
    `2025-11-03,INV-1003,Oops,Administrator,Paid,120000,55000,Invalid header row,${regionName}`
  ].join('\n');
}

async function run() {
  console.log('Starting import test simulation...');
  // Pre-flight: login
  const admin = await loginAdmin();
  const token = admin.token;
  if (!token) throw new Error('Failed to obtain admin token');
  const regionName = 'TestRegionImport';
  const regionId = await ensureRegion(token, regionName);
  console.log('Using region', regionName, 'id', regionId);

  // Prepare CSV strings
  const validCsv = buildCsvValid(regionName);
  const invalidCsv = buildCsvInvalidHeader(regionName);

  // Simulate browser parsing logic (subset) for valid CSV
  const validLines = validCsv.split(/\r?\n/).filter(l=>l.trim());
  const headersValid = validLines[0].split(',').map(h=>h.trim());
  const rowsValid = validLines.slice(1);
  let success = 0;
  let fail = 0;
  for (const line of rowsValid) {
    const values = line.split(',').map(v=>v.trim());
    const data = {};
    headersValid.forEach((h,i)=>{ if(values[i]) data[h]=values[i]; });
    try {
      await api('/api/sales', { method:'POST', token, body:data });
      success++;
    } catch (e) {
      console.error('Row error (valid set):', e.message);
      fail++;
    }
  }
  console.log(`Valid CSV import simulated: success=${success} fail=${fail}`);

  // Check invalid header detection (expected to fail before row loop in UI; here we just assert unknown column presence)
  const invalidHeaders = invalidCsv.split(/\r?\n/)[0].split(',').map(h=>h.trim());
  const allowedSales = ['transaction_date','invoice_no','unique_code','staff_name','status','sales_amount','profit_amount','notes','region_id','region_name'];
  const unknown = invalidHeaders.filter(h=>!allowedSales.includes(h));
  if (unknown.length) {
    console.log('Detected unknown headers in invalid CSV as expected:', unknown.join(', '));
  } else {
    console.warn('Unexpected: invalid CSV had no unknown headers');
  }

  console.log('Import test simulation complete.');
}

run().catch(err=>{ console.error('Simulation failed:', err); process.exit(1); });
