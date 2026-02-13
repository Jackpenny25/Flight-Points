/**
 * Setup Verification Script
 * 
 * Run this before attempting migration to verify everything is configured correctly.
 * 
 * Usage: tsx server/verify-migration-setup.ts
 */

import { createClient } from '@supabase/supabase-js';
import { Pool } from 'pg';
import dotenv from 'dotenv';
import { readFileSync, existsSync } from 'fs';
import { resolve } from 'path';

console.log('🔍 Verifying Migration Setup');
console.log('='.repeat(50));

let hasErrors = false;

// Step 1: Check for .env.migration file
console.log('\n📁 Step 1: Checking for .env.migration file...');
const envPath = resolve(process.cwd(), '.env.migration');

if (!existsSync(envPath)) {
  console.error('   ❌ .env.migration file not found!');
  console.error('   Create it in the project root with:');
  console.error('   - SUPABASE_URL');
  console.error('   - SUPABASE_ANON_KEY');
  console.error('   - DATABASE_URL');
  hasErrors = true;
} else {
  console.log('   ✅ .env.migration file exists');
  
  try {
    const envConfig = dotenv.parse(readFileSync(envPath));
    Object.assign(process.env, envConfig);
  } catch (error) {
    console.error('   ❌ Could not read .env.migration file:', error);
    hasErrors = true;
  }
}

// Step 2: Check environment variables
console.log('\n🔐 Step 2: Checking environment variables...');
const SUPABASE_URL = process.env.SUPABASE_URL;
const SUPABASE_ANON_KEY = process.env.SUPABASE_ANON_KEY;
const DATABASE_URL = process.env.DATABASE_URL;

if (!SUPABASE_URL) {
  console.error('   ❌ SUPABASE_URL is not set');
  hasErrors = true;
} else {
  console.log(`   ✅ SUPABASE_URL: ${SUPABASE_URL.substring(0, 30)}...`);
}

if (!SUPABASE_ANON_KEY) {
  console.error('   ❌ SUPABASE_ANON_KEY is not set');
  hasErrors = true;
} else {
  console.log(`   ✅ SUPABASE_ANON_KEY: ${SUPABASE_ANON_KEY.substring(0, 30)}...`);
}

if (!DATABASE_URL) {
  console.error('   ❌ DATABASE_URL is not set');
  hasErrors = true;
} else {
  // Mask password in display
  const maskedUrl = DATABASE_URL.replace(/:([^@]+)@/, ':****@');
  console.log(`   ✅ DATABASE_URL: ${maskedUrl}`);
}

if (hasErrors) {
  console.error('\n❌ Setup verification failed. Please fix the issues above.');
  process.exit(1);
}

// Step 3: Test Supabase connection
console.log('\n☁️  Step 3: Testing Supabase connection...');
try {
  const supabase = createClient(SUPABASE_URL!, SUPABASE_ANON_KEY!);
  
  const { data, error } = await supabase
    .from('cadets')
    .select('count')
    .limit(1);
  
  if (error) {
    console.error('   ❌ Supabase connection failed:', error.message);
    hasErrors = true;
  } else {
    console.log('   ✅ Supabase connection successful');
    
    // Get counts for all tables
    const tables = ['cadets', 'points', 'attendance_bulks', 'attendance', 'rewards'];
    console.log('\n   📊 Supabase table record counts:');
    
    for (const table of tables) {
      try {
        const { count, error: countError } = await supabase
          .from(table)
          .select('*', { count: 'exact', head: true });
        
        if (countError) {
          console.log(`      ${table}: Error - ${countError.message}`);
        } else {
          console.log(`      ${table}: ${count || 0} records`);
        }
      } catch (err) {
        console.log(`      ${table}: Error fetching count`);
      }
    }
  }
} catch (error) {
  console.error('   ❌ Supabase connection error:', error);
  hasErrors = true;
}

// Step 4: Test PostgreSQL connection
console.log('\n🐘 Step 4: Testing PostgreSQL connection...');
try {
  const pool = new Pool({
    connectionString: DATABASE_URL,
    ssl: process.env.PGSSLMODE === 'require' ? { rejectUnauthorized: false } : undefined,
  });
  
  const result = await pool.query('SELECT NOW() as current_time, version() as pg_version');
  console.log('   ✅ PostgreSQL connection successful');
  console.log(`   ⏰ Server time: ${result.rows[0].current_time}`);
  
  // Check if tables exist
  const tablesResult = await pool.query(`
    SELECT table_name 
    FROM information_schema.tables 
    WHERE table_schema = 'public' 
    AND table_type = 'BASE TABLE'
    ORDER BY table_name
  `);
  
  const tables = tablesResult.rows.map(r => r.table_name);
  const expectedTables = ['cadets', 'points', 'attendance_bulks', 'attendance', 'rewards'];
  
  console.log('\n   📊 PostgreSQL schema check:');
  for (const table of expectedTables) {
    if (tables.includes(table)) {
      // Get count
      const countResult = await pool.query(`SELECT COUNT(*) FROM ${table}`);
      const count = countResult.rows[0].count;
      console.log(`      ✅ ${table}: exists (${count} records)`);
    } else {
      console.log(`      ⚠️  ${table}: not found (run schema.sql first)`);
    }
  }
  
  await pool.end();
} catch (error: any) {
  console.error('   ❌ PostgreSQL connection failed:', error.message);
  console.error('\n   Common fixes:');
  console.error('   - Check that PostgreSQL is running');
  console.error('   - Verify DATABASE_URL format: postgresql://user:pass@host:port/db');
  console.error('   - Check username and password');
  console.error('   - Ensure database exists');
  hasErrors = true;
}

// Final result
console.log('\n' + '='.repeat(50));
if (hasErrors) {
  console.error('❌ Verification failed. Please fix the issues above before migrating.');
  console.error('\nSee server/MIGRATION_GUIDE.md for detailed instructions.');
  process.exit(1);
} else {
  console.log('✅ All checks passed! You are ready to run the migration.');
  console.log('\nNext step:');
  console.log('   tsx server/migrate-from-supabase.ts');
}
console.log('='.repeat(50));
