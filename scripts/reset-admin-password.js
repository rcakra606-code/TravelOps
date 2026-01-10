#!/usr/bin/env node
/**
 * Admin Password Reset Script
 * 
 * Use this script if you forgot the admin password.
 * Run from the project root: node scripts/reset-admin-password.js
 * 
 * This script requires direct server access - it's NOT a security risk
 * because anyone with server access could modify the database directly anyway.
 */

import { initDb } from '../database.js';
import bcrypt from 'bcryptjs';
import readline from 'readline';

const rl = readline.createInterface({
  input: process.stdin,
  output: process.stdout
});

function question(prompt) {
  return new Promise((resolve) => {
    rl.question(prompt, resolve);
  });
}

async function main() {
  console.log('\n🔐 TravelOps Admin Password Reset Tool\n');
  console.log('=' .repeat(50));
  
  try {
    const db = await initDb();
    
    // List all admin users
    const admins = await db.all("SELECT id, username, name, email FROM users WHERE type='admin'");
    
    if (admins.length === 0) {
      console.log('\n⚠️  No admin users found in database.');
      console.log('Creating default admin user...\n');
      
      const defaultPassword = 'Admin@1234!';
      const hash = await bcrypt.hash(defaultPassword, 10);
      await db.run(
        'INSERT INTO users (username, password, name, email, type) VALUES (?, ?, ?, ?, ?)',
        ['admin', hash, 'Administrator', 'admin@example.com', 'admin']
      );
      
      console.log('✅ Default admin created:');
      console.log(`   Username: admin`);
      console.log(`   Password: ${defaultPassword}`);
      console.log('\n⚠️  Please change this password after logging in!\n');
      
      rl.close();
      process.exit(0);
    }
    
    console.log('\n📋 Admin users found:\n');
    admins.forEach((admin, i) => {
      console.log(`   ${i + 1}. ${admin.username} (${admin.name || 'No name'}) - ${admin.email || 'No email'}`);
    });
    
    // Select user
    let selectedAdmin;
    if (admins.length === 1) {
      selectedAdmin = admins[0];
      console.log(`\n   Selected: ${selectedAdmin.username}`);
    } else {
      const choice = await question('\nEnter number to select user (or username): ');
      const num = parseInt(choice);
      if (num >= 1 && num <= admins.length) {
        selectedAdmin = admins[num - 1];
      } else {
        selectedAdmin = admins.find(a => a.username === choice);
      }
      
      if (!selectedAdmin) {
        console.log('\n❌ Invalid selection. Exiting.\n');
        rl.close();
        process.exit(1);
      }
    }
    
    console.log(`\n🔄 Resetting password for: ${selectedAdmin.username}\n`);
    
    // Get new password
    const newPassword = await question('Enter new password (min 8 chars, upper, lower, number, special): ');
    
    // Validate password
    if (newPassword.length < 8) {
      console.log('\n❌ Password too short (minimum 8 characters)\n');
      rl.close();
      process.exit(1);
    }
    if (!/[A-Z]/.test(newPassword)) {
      console.log('\n❌ Password must contain at least one uppercase letter\n');
      rl.close();
      process.exit(1);
    }
    if (!/[a-z]/.test(newPassword)) {
      console.log('\n❌ Password must contain at least one lowercase letter\n');
      rl.close();
      process.exit(1);
    }
    if (!/\d/.test(newPassword)) {
      console.log('\n❌ Password must contain at least one number\n');
      rl.close();
      process.exit(1);
    }
    if (!/[!@#$%^&*(),.?":{}|<>\-_=+\[\]\\;'`~]/.test(newPassword)) {
      console.log('\n❌ Password must contain at least one special character (!@#$%^&*...)\n');
      rl.close();
      process.exit(1);
    }
    
    // Confirm
    const confirm = await question(`\nConfirm reset password for "${selectedAdmin.username}"? (yes/no): `);
    
    if (confirm.toLowerCase() !== 'yes' && confirm.toLowerCase() !== 'y') {
      console.log('\n❌ Cancelled.\n');
      rl.close();
      process.exit(0);
    }
    
    // Hash and update
    const hash = await bcrypt.hash(newPassword, 10);
    await db.run(
      'UPDATE users SET password = ?, failed_attempts = 0, locked_until = NULL WHERE id = ?',
      [hash, selectedAdmin.id]
    );
    
    console.log('\n✅ Password reset successful!\n');
    console.log(`   Username: ${selectedAdmin.username}`);
    console.log(`   Password: ${newPassword}`);
    console.log('\n   Account has been unlocked (if it was locked).\n');
    
  } catch (err) {
    console.error('\n❌ Error:', err.message);
    console.error('\nMake sure you run this from the project root directory.\n');
  }
  
  rl.close();
  process.exit(0);
}

main();
