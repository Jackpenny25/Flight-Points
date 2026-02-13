/**
 * Export Script: Supabase Data to SQL File
 * 
 * This script fetches all data from Supabase and exports it to a SQL file
 * that can be directly imported into PostgreSQL using psql or pgAdmin.
 * 
 * SETUP INSTRUCTIONS:
 * 1. Create a .env.migration file in the project root with:
 *    SUPABASE_URL=https://diutyuulfulleqfmjlxp.supabase.co
 *    SUPABASE_ANON_KEY=eyJhbGciOiJIUzI1NiIsInR5cCI6IkpXVCJ9.eyJpc3MiOiJzdXBhYmFzZSIsInJlZiI6ImRpdXR5dXVsZnVsbGVxZm1qbHhwIiwicm9sZSI6ImFub24iLCJpYXQiOjE3NjU5MTIwODgsImV4cCI6MjA4MTQ4ODA4OH0.y-JROlzATycLHcEyqOppWe1HNi-nQaV6kBg7FAa1F6Y
 * 
 * 2. Run: tsx server/export-supabase-to-sql.ts
 * 
 * 3. Import the generated SQL file:
 *    psql -U username -d database_name -f supabase_export.sql
 * 
 * OUTPUT:
 * - Creates supabase_export.sql with all INSERT statements
 */

import { createClient } from '@supabase/supabase-js';
import dotenv from 'dotenv';
import { readFileSync, writeFileSync } from 'fs';
import { resolve } from 'path';

// Load environment variables from .env.migration
const envPath = resolve(process.cwd(), '.env.migration');
try {
  const envConfig = dotenv.parse(readFileSync(envPath));
  Object.assign(process.env, envConfig);
} catch (error) {
  console.error('⚠️  Could not load .env.migration file. Trying regular .env...');
  dotenv.config();
}

// Validate required environment variables
const SUPABASE_URL = process.env.SUPABASE_URL;
const SUPABASE_ANON_KEY = process.env.SUPABASE_ANON_KEY;

if (!SUPABASE_URL || !SUPABASE_ANON_KEY) {
  console.error('❌ Missing required environment variables:');
  if (!SUPABASE_URL) console.error('   - SUPABASE_URL');
  if (!SUPABASE_ANON_KEY) console.error('   - SUPABASE_ANON_KEY');
  console.error('\nPlease create a .env.migration file with these variables.');
  process.exit(1);
}

// Initialize Supabase client
const supabase = createClient(SUPABASE_URL, SUPABASE_ANON_KEY);

/**
 * Escape SQL string values
 */
function escapeSqlString(value: any): string {
  if (value === null || value === undefined) {
    return 'NULL';
  }
  if (typeof value === 'boolean') {
    return value ? 'TRUE' : 'FALSE';
  }
  if (typeof value === 'number') {
    return String(value);
  }
  if (typeof value === 'string') {
    return `'${value.replace(/'/g, "''")}'`;
  }
  if (value instanceof Date) {
    return `'${value.toISOString()}'`;
  }
  return `'${String(value).replace(/'/g, "''")}'`;
}

/**
 * Generate SQL INSERT statements for a table
 */
function generateInsertStatements(tableName: string, rows: any[]): string[] {
  if (!rows || rows.length === 0) {
    return [`-- No data found for table: ${tableName}\n`];
  }

  const statements: string[] = [];
  statements.push(`-- Inserting ${rows.length} records into ${tableName}`);
  statements.push(`-- Using ON CONFLICT DO NOTHING to skip duplicates\n`);

  for (const row of rows) {
    const columns = Object.keys(row);
    const values = columns.map(col => escapeSqlString(row[col]));
    
    const insertStmt = `INSERT INTO ${tableName} (${columns.join(', ')}) VALUES (${values.join(', ')}) ON CONFLICT (id) DO NOTHING;`;
    statements.push(insertStmt);
  }

  statements.push(''); // Empty line between tables
  return statements;
}

/**
 * Main export function
 */
async function exportToSql() {
  console.log('🚀 Starting Supabase Data Export to SQL');
  console.log('='.repeat(50));

  const sqlStatements: string[] = [];

  // Add header
  sqlStatements.push('-- Supabase Data Export');
  sqlStatements.push(`-- Generated: ${new Date().toISOString()}`);
  sqlStatements.push('-- This file contains INSERT statements with ON CONFLICT DO NOTHING');
  sqlStatements.push('-- Run this with: psql -U username -d database_name -f supabase_export.sql');
  sqlStatements.push('');
  sqlStatements.push('BEGIN;');
  sqlStatements.push('');

  try {
    // Export cadets
    console.log('\n📦 Exporting cadets...');
    const { data: cadets, error: cadetsError } = await supabase
      .from('cadets')
      .select('*')
      .order('created_at', { ascending: true });
    
    if (cadetsError) throw cadetsError;
    console.log(`   Found ${cadets?.length || 0} cadets`);
    sqlStatements.push(...generateInsertStatements('cadets', cadets || []));

    // Export points
    console.log('\n📦 Exporting points...');
    const { data: points, error: pointsError } = await supabase
      .from('points')
      .select('*')
      .order('created_at', { ascending: true });
    
    if (pointsError) throw pointsError;
    console.log(`   Found ${points?.length || 0} points records`);
    sqlStatements.push(...generateInsertStatements('points', points || []));

    // Export attendance_bulks
    console.log('\n📦 Exporting attendance_bulks...');
    const { data: bulks, error: bulksError } = await supabase
      .from('attendance_bulks')
      .select('*')
      .order('created_at', { ascending: true });
    
    if (bulksError) throw bulksError;
    console.log(`   Found ${bulks?.length || 0} attendance bulk records`);
    sqlStatements.push(...generateInsertStatements('attendance_bulks', bulks || []));

    // Export attendance (with pagination for large datasets)
    console.log('\n📦 Exporting attendance...');
    let allAttendance: any[] = [];
    let from = 0;
    const batchSize = 1000;
    let hasMore = true;

    while (hasMore) {
      const { data: attendanceBatch, error: attendanceError } = await supabase
        .from('attendance')
        .select('*')
        .order('created_at', { ascending: true })
        .range(from, from + batchSize - 1);
      
      if (attendanceError) throw attendanceError;
      if (attendanceBatch && attendanceBatch.length > 0) {
        allAttendance = allAttendance.concat(attendanceBatch);
        console.log(`   Fetched batch: ${from}-${from + attendanceBatch.length}`);
      }
      
      if (!attendanceBatch || attendanceBatch.length < batchSize) {
        hasMore = false;
      } else {
        from += batchSize;
      }
    }

    console.log(`   Total attendance records: ${allAttendance.length}`);
    sqlStatements.push(...generateInsertStatements('attendance', allAttendance));

    // Export rewards
    console.log('\n📦 Exporting rewards...');
    const { data: rewards, error: rewardsError } = await supabase
      .from('rewards')
      .select('*')
      .order('created_at', { ascending: true });
    
    if (rewardsError) throw rewardsError;
    console.log(`   Found ${rewards?.length || 0} rewards`);
    sqlStatements.push(...generateInsertStatements('rewards', rewards || []));

    // Add footer
    sqlStatements.push('COMMIT;');
    sqlStatements.push('');
    sqlStatements.push('-- Export completed successfully');

    // Write to file
    const outputFile = 'supabase_export.sql';
    writeFileSync(outputFile, sqlStatements.join('\n'), 'utf-8');

    console.log('\n' + '='.repeat(50));
    console.log('✅ Export completed successfully!');
    console.log(`📄 SQL file created: ${outputFile}`);
    console.log('\nTo import this file into PostgreSQL:');
    console.log(`   psql -U username -d database_name -f ${outputFile}`);
    console.log('='.repeat(50));

  } catch (error) {
    console.error('\n❌ Export failed:', error);
    process.exit(1);
  }
}

// Run the export
exportToSql().catch((error) => {
  console.error('Fatal error:', error);
  process.exit(1);
});
