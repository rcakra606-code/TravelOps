#!/usr/bin/env node
import { initDb } from '../database.js';

function parseArgs(argv) {
  const args = {};
  for (const a of argv.slice(2)) {
    const m = a.match(/^--([^=]+)=(.*)$/);
    if (m) args[m[1]] = m[2];
    else if (a.startsWith('--')) args[a.slice(2)] = true;
  }
  return args;
}

async function main() {
  const args = parseArgs(process.argv);
  const db = await initDb();
  const isPg = db.dialect === 'postgres';

  if (args.count) {
    const row = await db.get('SELECT COUNT(*) AS c FROM sales WHERE region_id IS NULL');
    const count = row?.c ?? row?.count ?? 0;
    console.log(`NULL region_id rows in sales: ${count}`);
    process.exit(0);
  }

  let regionId = args['region-id'] ? Number(args['region-id']) : null;
  const regionName = args['region-name'];

  if (!regionId && !regionName) {
    console.error('Usage: node scripts/backfill-sales-region.js --region-id=NUMBER | --region-name="NAME" [--dry-run]');
    process.exit(1);
  }

  if (!regionId && regionName) {
    const row = await db.get(
      isPg ? 'SELECT id FROM regions WHERE region_name=$1' : 'SELECT id FROM regions WHERE region_name=?',
      [regionName]
    );
    if (!row) {
      console.error(`Region with name "${regionName}" not found.`);
      process.exit(1);
    }
    regionId = row.id;
  }

  if (args['dry-run']) {
    const row = await db.get('SELECT COUNT(*) AS c FROM sales WHERE region_id IS NULL');
    const count = row?.c ?? row?.count ?? 0;
    console.log(`[DRY RUN] Would update ${count} sales rows to region_id=${regionId}`);
    process.exit(0);
  }

  const res = await db.run(
    isPg ? 'UPDATE sales SET region_id=$1 WHERE region_id IS NULL' : 'UPDATE sales SET region_id=? WHERE region_id IS NULL',
    [regionId]
  );
  const updated = res?.changes ?? 0;
  console.log(`Updated sales rows: ${updated} (region_id=${regionId})`);
  process.exit(0);
}

main().catch(err => {
  console.error('Backfill error:', err);
  process.exit(1);
});
