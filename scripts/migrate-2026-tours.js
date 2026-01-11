/**
 * Data Migration Script: Migrate 2026+ Tours to New Passenger Format
 * 
 * This script converts existing tours with departure_date >= 2026-01-01
 * from the old format (lead_passenger/all_passengers text fields)
 * to the new format (tour_passengers table with individual records).
 * 
 * Run with: node scripts/migrate-2026-tours.js
 * 
 * Options:
 *   --dry-run    Preview changes without actually modifying the database
 *   --force      Skip confirmation prompt
 */

import { initDb } from '../database.js';
import dotenv from 'dotenv';
import readline from 'readline';

dotenv.config();

const DRY_RUN = process.argv.includes('--dry-run');
const FORCE = process.argv.includes('--force');

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

async function migrate() {
  console.log('='.repeat(60));
  console.log('🔄 Tour Data Migration Script');
  console.log('   Migrating 2026+ tours to new passenger format');
  console.log('='.repeat(60));
  
  if (DRY_RUN) {
    console.log('\n⚠️  DRY RUN MODE - No changes will be made\n');
  }
  
  const db = await initDb();
  console.log(`✅ Database connected (${db.dialect})\n`);
  
  // Find all 2026+ tours that haven't been migrated yet
  const tours = await db.all(`
    SELECT * FROM tours 
    WHERE departure_date >= '2026-01-01'
    AND (data_version IS NULL OR data_version = 1)
    ORDER BY departure_date ASC
  `);
  
  console.log(`📋 Found ${tours.length} tours to migrate\n`);
  
  if (tours.length === 0) {
    console.log('✅ No tours need migration. All 2026+ tours are already in the new format.');
    process.exit(0);
  }
  
  // Show preview
  console.log('Tours to migrate:');
  console.log('-'.repeat(60));
  tours.slice(0, 10).forEach((tour, i) => {
    console.log(`  ${i + 1}. ${tour.tour_code || 'N/A'} | ${tour.departure_date} | ${tour.lead_passenger || 'No lead'} | ${tour.jumlah_peserta || 1} pax`);
  });
  if (tours.length > 10) {
    console.log(`  ... and ${tours.length - 10} more`);
  }
  console.log('-'.repeat(60));
  
  if (!DRY_RUN) {
    const confirmed = await promptConfirm('\nProceed with migration?');
    if (!confirmed) {
      console.log('\n❌ Migration cancelled');
      process.exit(0);
    }
  }
  
  console.log('\n🔄 Starting migration...\n');
  
  let migrated = 0;
  let failed = 0;
  const errors = [];
  
  for (const tour of tours) {
    try {
      console.log(`  Processing: ${tour.tour_code || 'Tour #' + tour.id} (${tour.departure_date})`);
      
      // Parse passengers from old format
      const passengers = parsePassengers(tour);
      console.log(`    → Found ${passengers.length} passenger(s)`);
      
      if (!DRY_RUN) {
        // Insert passenger records
        for (let i = 0; i < passengers.length; i++) {
          const p = passengers[i];
          await db.run(`
            INSERT INTO tour_passengers 
            (tour_id, passenger_number, name, phone_number, email, base_price, discount, profit, is_lead_passenger)
            VALUES (?, ?, ?, ?, ?, ?, ?, ?, ?)
          `, [
            tour.id,
            i + 1,
            p.name,
            p.phone_number,
            p.email,
            p.base_price,
            p.discount,
            p.profit,
            i === 0 ? 1 : 0
          ]);
        }
        
        // Update tour to data_version 2
        await db.run(`
          UPDATE tours SET data_version = 2 WHERE id = ?
        `, [tour.id]);
      }
      
      console.log(`    ✅ Migrated successfully`);
      migrated++;
      
    } catch (err) {
      console.log(`    ❌ Failed: ${err.message}`);
      failed++;
      errors.push({ tour: tour.tour_code || tour.id, error: err.message });
    }
  }
  
  // Summary
  console.log('\n' + '='.repeat(60));
  console.log('📊 Migration Summary');
  console.log('='.repeat(60));
  console.log(`  ✅ Successfully migrated: ${migrated}`);
  console.log(`  ❌ Failed: ${failed}`);
  console.log(`  📋 Total processed: ${tours.length}`);
  
  if (DRY_RUN) {
    console.log('\n⚠️  This was a DRY RUN. No changes were made.');
    console.log('    Run without --dry-run to apply changes.');
  }
  
  if (errors.length > 0) {
    console.log('\n❌ Errors:');
    errors.forEach(e => {
      console.log(`  - ${e.tour}: ${e.error}`);
    });
  }
  
  console.log('\n✅ Migration complete');
  process.exit(failed > 0 ? 1 : 0);
}

/**
 * Parse passengers from old tour format
 */
function parsePassengers(tour) {
  const passengers = [];
  const participantCount = tour.jumlah_peserta || 1;
  
  // Calculate per-person amounts
  const perPersonBasePrice = parseFloat(tour.tour_price) || 0;
  const perPersonDiscount = parseFloat(tour.discount_amount) || 0;
  const perPersonProfit = parseFloat(tour.profit_amount) || 0;
  
  // Lead passenger (first passenger)
  passengers.push({
    name: tour.lead_passenger || 'Lead Passenger',
    phone_number: tour.phone_number || null,
    email: tour.email || null,
    base_price: perPersonBasePrice,
    discount: perPersonDiscount,
    profit: perPersonProfit / participantCount // Distribute profit
  });
  
  // Parse additional passengers from all_passengers field
  let additionalNames = [];
  if (tour.all_passengers) {
    // Try to parse as comma-separated or newline-separated
    additionalNames = tour.all_passengers
      .split(/[,\n]/)
      .map(name => name.trim())
      .filter(name => name && name !== tour.lead_passenger);
  }
  
  // Add additional passengers
  for (let i = 1; i < participantCount; i++) {
    const name = additionalNames[i - 1] || `Passenger ${i + 1}`;
    passengers.push({
      name: name,
      phone_number: null,
      email: null,
      base_price: perPersonBasePrice,
      discount: perPersonDiscount,
      profit: perPersonProfit / participantCount
    });
  }
  
  return passengers;
}

// Run migration
migrate().catch(err => {
  console.error('❌ Migration failed:', err);
  process.exit(1);
});
