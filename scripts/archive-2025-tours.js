/**
 * Archive Script: Archive 2025 Tours Data
 * 
 * This script flags all tours with departure_date in 2025 or earlier
 * as archived (is_archived = 1), making them read-only in the UI
 * and blocking edits/deletes via the API.
 * 
 * Run with: node scripts/archive-2025-tours.js
 * 
 * Options:
 *   --dry-run    Preview changes without actually modifying the database
 *   --force      Skip confirmation prompt
 *   --undo       Unarchive all tours (remove archive flag)
 */

import { initDb } from '../database.js';
import dotenv from 'dotenv';
import readline from 'readline';

dotenv.config();

const DRY_RUN = process.argv.includes('--dry-run');
const FORCE = process.argv.includes('--force');
const UNDO = process.argv.includes('--undo');

async function promptConfirm(question) {
  if (FORCE) return true;
  
  const rl = readline.createInterface({
    input: process.stdin,
    output: process.stdout
  });
  
  return new Promise(resolve => {
    rl.question(question + ' (y/n): ', answer => {
      rl.close();
      resolve(answer.toLowerCase() === 'y' || answer.toLowerCase() === 'yes');
    });
  });
}

async function archive() {
  console.log('='.repeat(60));
  console.log(UNDO ? '🔓 Tours Unarchive Script' : '📦 Tours Archive Script');
  console.log(UNDO ? '   Removing archive flag from all tours' : '   Archiving 2025 tour data (flagging as read-only)');
  console.log('='.repeat(60));
  
  if (DRY_RUN) {
    console.log('\n⚠️  DRY RUN MODE - No changes will be made\n');
  }
  
  const db = await initDb();
  console.log(`✅ Database connected (${db.dialect})\n`);
  
  const isPg = db.dialect === 'postgres';
  
  if (UNDO) {
    // Unarchive mode
    const archivedCount = await db.get('SELECT COUNT(*) as count FROM tours WHERE is_archived = 1');
    console.log(`📋 Found ${archivedCount?.count || 0} archived tours\n`);
    
    if ((archivedCount?.count || 0) === 0) {
      console.log('✅ No archived tours found. Nothing to undo.');
      process.exit(0);
    }
    
    if (!DRY_RUN) {
      const confirmed = await promptConfirm('\nRemove archive flag from all tours?');
      if (!confirmed) {
        console.log('\n❌ Cancelled');
        process.exit(0);
      }
      
      await db.run('UPDATE tours SET is_archived = 0');
      console.log(`\n✅ Unarchived ${archivedCount.count} tours`);
    }
    
    process.exit(0);
  }
  
  // Archive mode: find tours with departure in 2025 or earlier
  const tours2025 = isPg
    ? await db.all(`
        SELECT id, tour_code, departure_date, lead_passenger, staff_name, status
        FROM tours 
        WHERE departure_date < '2026-01-01'
        AND (is_archived IS NULL OR is_archived = 0)
        ORDER BY departure_date DESC
      `)
    : await db.all(`
        SELECT id, tour_code, departure_date, lead_passenger, staff_name, status
        FROM tours 
        WHERE departure_date < '2026-01-01'
        AND (is_archived IS NULL OR is_archived = 0)
        ORDER BY departure_date DESC
      `);
  
  console.log(`📋 Found ${tours2025.length} tours from 2025 or earlier to archive\n`);
  
  if (tours2025.length === 0) {
    console.log('✅ No unarchived 2025 tours found. Nothing to archive.');
    process.exit(0);
  }
  
  // Show preview
  console.log('Tours to archive:');
  console.log('-'.repeat(80));
  console.log('  # | Tour Code    | Departure    | Lead Passenger       | Staff            | Status');
  console.log('-'.repeat(80));
  tours2025.slice(0, 15).forEach((tour, i) => {
    console.log(`  ${(i + 1).toString().padStart(2)} | ${(tour.tour_code || 'N/A').padEnd(12)} | ${(tour.departure_date || 'N/A').padEnd(12)} | ${(tour.lead_passenger || 'N/A').substring(0, 20).padEnd(20)} | ${(tour.staff_name || 'N/A').substring(0, 16).padEnd(16)} | ${tour.status || 'N/A'}`);
  });
  if (tours2025.length > 15) {
    console.log(`  ... and ${tours2025.length - 15} more`);
  }
  console.log('-'.repeat(80));
  
  // Summary by status
  const byStatus = {};
  tours2025.forEach(t => {
    const s = t.status || 'belum jalan';
    byStatus[s] = (byStatus[s] || 0) + 1;
  });
  console.log('\nSummary by status:');
  Object.entries(byStatus).forEach(([status, count]) => {
    console.log(`  ${status}: ${count}`);
  });
  console.log(`  Total: ${tours2025.length}`);
  
  if (!DRY_RUN) {
    const confirmed = await promptConfirm('\nProceed with archiving? These tours will become read-only');
    if (!confirmed) {
      console.log('\n❌ Archive cancelled');
      process.exit(0);
    }
    
    console.log('\n🔄 Archiving tours...\n');
    
    const now = new Date().toISOString();
    const result = await db.run(
      `UPDATE tours SET is_archived = 1, updated_at = ? WHERE departure_date < '2026-01-01' AND (is_archived IS NULL OR is_archived = 0)`,
      [now]
    );
    
    console.log('='.repeat(60));
    console.log('📦 Archive Complete!');
    console.log('='.repeat(60));
    console.log(`  ✅ Successfully archived: ${tours2025.length} tours`);
    console.log('  📝 Tours are now flagged as read-only');
    console.log('  ℹ️  Use --undo flag to reverse this operation');
  } else {
    console.log('\n⚠️  DRY RUN - No changes made. Run without --dry-run to archive.');
  }
  
  process.exit(0);
}

archive().catch(err => {
  console.error('❌ Archive failed:', err);
  process.exit(1);
});
