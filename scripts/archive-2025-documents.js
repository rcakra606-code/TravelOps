/**
 * Archive Script: Archive 2025 Documents Data
 * 
 * This script moves documents from 2025 to the documents_archive table
 * to keep the main documents table focused on current year data.
 * 
 * Run with: node scripts/archive-2025-documents.js
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

async function archive() {
  console.log('='.repeat(60));
  console.log('📦 Documents Archive Script');
  console.log('   Archiving 2025 documents data');
  console.log('='.repeat(60));
  
  if (DRY_RUN) {
    console.log('\n⚠️  DRY RUN MODE - No changes will be made\n');
  }
  
  const db = await initDb();
  console.log(`✅ Database connected (${db.dialect})\n`);
  
  const isPg = db.dialect === 'postgres';
  const idCol = isPg ? 'INT GENERATED ALWAYS AS IDENTITY PRIMARY KEY' : 'INTEGER PRIMARY KEY AUTOINCREMENT';
  const ts = isPg ? 'TIMESTAMPTZ' : 'TEXT';
  const createdDefault = isPg ? "DEFAULT NOW()" : "DEFAULT (datetime('now'))";
  
  // Create archive table if not exists
  if (!DRY_RUN) {
    await db.run(`CREATE TABLE IF NOT EXISTS documents_archive (
      id ${idCol},
      original_id INTEGER,
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
      notes TEXT,
      original_created_at TEXT,
      archived_at ${ts} ${createdDefault}
    )`);
    console.log('✅ Archive table ready\n');
  }
  
  // Find all 2025 documents based on receive_date
  const docs2025 = await db.all(`
    SELECT * FROM documents 
    WHERE receive_date LIKE '2025-%'
    ORDER BY receive_date ASC
  `);
  
  console.log(`📋 Found ${docs2025.length} documents from 2025 to archive\n`);
  
  if (docs2025.length === 0) {
    console.log('✅ No 2025 documents found. Nothing to archive.');
    process.exit(0);
  }
  
  // Show preview
  console.log('Documents to archive:');
  console.log('-'.repeat(60));
  docs2025.slice(0, 10).forEach((doc, i) => {
    console.log(`  ${i + 1}. ${doc.receive_date || 'N/A'} | ${doc.guest_name || 'N/A'} | ${doc.process_type || 'N/A'} | ${doc.send_date ? 'Sent' : 'In Process'}`);
  });
  if (docs2025.length > 10) {
    console.log(`  ... and ${docs2025.length - 10} more`);
  }
  console.log('-'.repeat(60));
  
  // Summary
  const inProcess = docs2025.filter(d => !d.send_date || d.send_date.trim() === '').length;
  const sent = docs2025.filter(d => d.send_date && d.send_date.trim() !== '').length;
  console.log(`\nSummary:`);
  console.log(`  📄 Total: ${docs2025.length}`);
  console.log(`  ⏳ In Process: ${inProcess}`);
  console.log(`  ✅ Sent: ${sent}`);
  
  if (!DRY_RUN) {
    const confirmed = await promptConfirm('\nProceed with archiving?');
    if (!confirmed) {
      console.log('\n❌ Archive cancelled');
      process.exit(0);
    }
    
    console.log('\n🔄 Archiving documents...\n');
    
    let archived = 0;
    let errors = 0;
    
    for (const doc of docs2025) {
      try {
        // Insert into archive
        await db.run(`
          INSERT INTO documents_archive 
          (original_id, receive_date, send_date, guest_name, passport_country, 
           process_type, booking_code, invoice_number, phone_number, 
           estimated_done, staff_name, tour_code, notes, original_created_at)
          VALUES (?, ?, ?, ?, ?, ?, ?, ?, ?, ?, ?, ?, ?, ?)
        `, [
          doc.id,
          doc.receive_date,
          doc.send_date,
          doc.guest_name,
          doc.passport_country,
          doc.process_type,
          doc.booking_code,
          doc.invoice_number,
          doc.phone_number,
          doc.estimated_done,
          doc.staff_name,
          doc.tour_code,
          doc.notes,
          doc.receive_date // Use receive_date as reference since no created_at
        ]);
        
        // Delete from main table
        await db.run('DELETE FROM documents WHERE id = ?', [doc.id]);
        archived++;
        
        if (archived % 50 === 0) {
          console.log(`  ✅ Archived ${archived}/${docs2025.length} documents...`);
        }
      } catch (err) {
        console.error(`  ❌ Error archiving document ${doc.id}:`, err.message);
        errors++;
      }
    }
    
    console.log('\n' + '='.repeat(60));
    console.log('📦 Archive Complete!');
    console.log('='.repeat(60));
    console.log(`  ✅ Successfully archived: ${archived}`);
    if (errors > 0) {
      console.log(`  ❌ Errors: ${errors}`);
    }
  } else {
    console.log('\n⚠️  DRY RUN - No changes made. Run without --dry-run to archive.');
  }
  
  process.exit(0);
}

archive().catch(err => {
  console.error('❌ Archive failed:', err);
  process.exit(1);
});
