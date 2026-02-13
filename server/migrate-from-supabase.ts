/**
 * Migration Script: Supabase to Local PostgreSQL
 * 
 * This script fetches all data from Supabase and imports it into a local PostgreSQL database.
 * 
 * SETUP INSTRUCTIONS:
 * 1. Create a .env.migration file in the project root with:
 *    SUPABASE_URL=https://diutyuulfulleqfmjlxp.supabase.co
 *    SUPABASE_ANON_KEY=eyJhbGciOiJIUzI1NiIsInR5cCI6IkpXVCJ9.eyJpc3MiOiJzdXBhYmFzZSIsInJlZiI6ImRpdXR5dXVsZnVsbGVxZm1qbHhwIiwicm9sZSI6ImFub24iLCJpYXQiOjE3NjU5MTIwODgsImV4cCI6MjA4MTQ4ODA4OH0.y-JROlzATycLHcEyqOppWe1HNi-nQaV6kBg7FAa1F6Y
 *    DATABASE_URL=postgresql://username:password@localhost:5432/your_database
 * 
 * 2. Run: npm install @supabase/supabase-js pg dotenv
 * 
 * 3. Execute: tsx server/migrate-from-supabase.ts
 * 
 * WHAT IT DOES:
 * - Fetches all records from Supabase tables: cadets, points, attendance_bulks, attendance, rewards
 * - Inserts them into your local PostgreSQL database
 * - Skips records that already exist (by ID) to prevent duplicates
 * - Shows progress and summary statistics
 */

import { createClient } from '@supabase/supabase-js';
import { Pool } from 'pg';
import dotenv from 'dotenv';
import { readFileSync } from 'fs';
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
const DATABASE_URL = process.env.DATABASE_URL;

if (!SUPABASE_URL || !SUPABASE_ANON_KEY || !DATABASE_URL) {
  console.error('❌ Missing required environment variables:');
  if (!SUPABASE_URL) console.error('   - SUPABASE_URL');
  if (!SUPABASE_ANON_KEY) console.error('   - SUPABASE_ANON_KEY');
  if (!DATABASE_URL) console.error('   - DATABASE_URL');
  console.error('\nPlease create a .env.migration file with these variables.');
  process.exit(1);
}

// Initialize Supabase client
const supabase = createClient(SUPABASE_URL, SUPABASE_ANON_KEY);

// Initialize PostgreSQL pool
const pool = new Pool({
  connectionString: DATABASE_URL,
  ssl: process.env.PGSSLMODE === 'require' ? { rejectUnauthorized: false } : undefined,
});

interface MigrationStats {
  total: number;
  inserted: number;
  skipped: number;
  errors: number;
}

/**
 * Migrate cadets table
 */
async function migrateCadets(): Promise<MigrationStats> {
  console.log('\n📦 Migrating cadets...');
  const stats: MigrationStats = { total: 0, inserted: 0, skipped: 0, errors: 0 };

  try {
    // Fetch all cadets from Supabase
    const { data, error } = await supabase
      .from('cadets')
      .select('*')
      .order('created_at', { ascending: true });

    if (error) throw error;
    if (!data || data.length === 0) {
      console.log('   No cadets found in Supabase');
      return stats;
    }

    stats.total = data.length;
    console.log(`   Found ${stats.total} cadets`);

    // Insert each cadet
    for (const cadet of data) {
      try {
        // Check if cadet already exists
        const checkResult = await pool.query(
          'SELECT id FROM cadets WHERE id = $1',
          [cadet.id]
        );

        if (checkResult.rows.length > 0) {
          stats.skipped++;
          continue;
        }

        // Insert cadet
        await pool.query(
          `INSERT INTO cadets (id, name, flight, created_at, updated_at)
           VALUES ($1, $2, $3, $4, $5)`,
          [cadet.id, cadet.name, cadet.flight, cadet.created_at, cadet.updated_at]
        );
        stats.inserted++;
      } catch (err) {
        console.error(`   Error inserting cadet ${cadet.name}:`, err);
        stats.errors++;
      }
    }

    console.log(`   ✅ Inserted: ${stats.inserted}, Skipped: ${stats.skipped}, Errors: ${stats.errors}`);
  } catch (error) {
    console.error('   ❌ Failed to migrate cadets:', error);
  }

  return stats;
}

/**
 * Migrate points table
 */
async function migratePoints(): Promise<MigrationStats> {
  console.log('\n📦 Migrating points...');
  const stats: MigrationStats = { total: 0, inserted: 0, skipped: 0, errors: 0 };

  try {
    // Fetch all points from Supabase
    const { data, error } = await supabase
      .from('points')
      .select('*')
      .order('created_at', { ascending: true });

    if (error) throw error;
    if (!data || data.length === 0) {
      console.log('   No points found in Supabase');
      return stats;
    }

    stats.total = data.length;
    console.log(`   Found ${stats.total} points records`);

    // Insert each point record
    for (const point of data) {
      try {
        // Check if point already exists
        const checkResult = await pool.query(
          'SELECT id FROM points WHERE id = $1',
          [point.id]
        );

        if (checkResult.rows.length > 0) {
          stats.skipped++;
          continue;
        }

        // Insert point
        await pool.query(
          `INSERT INTO points (id, cadet_name, date, flight, reason, points, type, given_by, created_at, updated_at)
           VALUES ($1, $2, $3, $4, $5, $6, $7, $8, $9, $10)`,
          [
            point.id,
            point.cadet_name,
            point.date,
            point.flight,
            point.reason,
            point.points,
            point.type,
            point.given_by,
            point.created_at,
            point.updated_at
          ]
        );
        stats.inserted++;
      } catch (err) {
        console.error(`   Error inserting point ${point.id}:`, err);
        stats.errors++;
      }
    }

    console.log(`   ✅ Inserted: ${stats.inserted}, Skipped: ${stats.skipped}, Errors: ${stats.errors}`);
  } catch (error) {
    console.error('   ❌ Failed to migrate points:', error);
  }

  return stats;
}

/**
 * Migrate attendance_bulks table
 */
async function migrateAttendanceBulks(): Promise<MigrationStats> {
  console.log('\n📦 Migrating attendance_bulks...');
  const stats: MigrationStats = { total: 0, inserted: 0, skipped: 0, errors: 0 };

  try {
    // Fetch all attendance bulks from Supabase
    const { data, error } = await supabase
      .from('attendance_bulks')
      .select('*')
      .order('created_at', { ascending: true });

    if (error) throw error;
    if (!data || data.length === 0) {
      console.log('   No attendance_bulks found in Supabase');
      return stats;
    }

    stats.total = data.length;
    console.log(`   Found ${stats.total} attendance bulk records`);

    // Insert each attendance bulk
    for (const bulk of data) {
      try {
        // Check if bulk already exists
        const checkResult = await pool.query(
          'SELECT id FROM attendance_bulks WHERE id = $1',
          [bulk.id]
        );

        if (checkResult.rows.length > 0) {
          stats.skipped++;
          continue;
        }

        // Insert bulk
        await pool.query(
          `INSERT INTO attendance_bulks (id, date, flight_filter, total_records, total_present, submitted_by, created_at)
           VALUES ($1, $2, $3, $4, $5, $6, $7)`,
          [
            bulk.id,
            bulk.date,
            bulk.flight_filter,
            bulk.total_records,
            bulk.total_present,
            bulk.submitted_by,
            bulk.created_at
          ]
        );
        stats.inserted++;
      } catch (err) {
        console.error(`   Error inserting attendance bulk ${bulk.id}:`, err);
        stats.errors++;
      }
    }

    console.log(`   ✅ Inserted: ${stats.inserted}, Skipped: ${stats.skipped}, Errors: ${stats.errors}`);
  } catch (error) {
    console.error('   ❌ Failed to migrate attendance_bulks:', error);
  }

  return stats;
}

/**
 * Migrate attendance table
 */
async function migrateAttendance(): Promise<MigrationStats> {
  console.log('\n📦 Migrating attendance...');
  const stats: MigrationStats = { total: 0, inserted: 0, skipped: 0, errors: 0 };

  try {
    // Fetch all attendance records from Supabase in batches
    let from = 0;
    const batchSize = 1000;
    let hasMore = true;

    while (hasMore) {
      const { data, error } = await supabase
        .from('attendance')
        .select('*')
        .order('created_at', { ascending: true })
        .range(from, from + batchSize - 1);

      if (error) throw error;
      if (!data || data.length === 0) {
        hasMore = false;
        break;
      }

      stats.total += data.length;

      // Insert each attendance record
      for (const record of data) {
        try {
          // Check if attendance already exists
          const checkResult = await pool.query(
            'SELECT id FROM attendance WHERE id = $1',
            [record.id]
          );

          if (checkResult.rows.length > 0) {
            stats.skipped++;
            continue;
          }

          // Insert attendance
          await pool.query(
            `INSERT INTO attendance (id, cadet_name, date, flight, status, submitted_by, bulk_id, created_at)
             VALUES ($1, $2, $3, $4, $5, $6, $7, $8)`,
            [
              record.id,
              record.cadet_name,
              record.date,
              record.flight,
              record.status,
              record.submitted_by,
              record.bulk_id,
              record.created_at
            ]
          );
          stats.inserted++;
        } catch (err) {
          console.error(`   Error inserting attendance ${record.id}:`, err);
          stats.errors++;
        }
      }

      console.log(`   Processed batch: ${from}-${from + data.length} (Inserted: ${stats.inserted})`);

      if (data.length < batchSize) {
        hasMore = false;
      } else {
        from += batchSize;
      }
    }

    console.log(`   ✅ Total: ${stats.total}, Inserted: ${stats.inserted}, Skipped: ${stats.skipped}, Errors: ${stats.errors}`);
  } catch (error) {
    console.error('   ❌ Failed to migrate attendance:', error);
  }

  return stats;
}

/**
 * Migrate rewards table
 */
async function migrateRewards(): Promise<MigrationStats> {
  console.log('\n📦 Migrating rewards...');
  const stats: MigrationStats = { total: 0, inserted: 0, skipped: 0, errors: 0 };

  try {
    // Fetch all rewards from Supabase
    const { data, error } = await supabase
      .from('rewards')
      .select('*')
      .order('created_at', { ascending: true });

    if (error) throw error;
    if (!data || data.length === 0) {
      console.log('   No rewards found in Supabase');
      return stats;
    }

    stats.total = data.length;
    console.log(`   Found ${stats.total} rewards`);

    // Insert each reward
    for (const reward of data) {
      try {
        // Check if reward already exists
        const checkResult = await pool.query(
          'SELECT id FROM rewards WHERE id = $1',
          [reward.id]
        );

        if (checkResult.rows.length > 0) {
          stats.skipped++;
          continue;
        }

        // Insert reward
        await pool.query(
          `INSERT INTO rewards (id, title, how_to_win, prize, ends_at, created_by, created_at, updated_at)
           VALUES ($1, $2, $3, $4, $5, $6, $7, $8)`,
          [
            reward.id,
            reward.title,
            reward.how_to_win,
            reward.prize,
            reward.ends_at,
            reward.created_by,
            reward.created_at,
            reward.updated_at
          ]
        );
        stats.inserted++;
      } catch (err) {
        console.error(`   Error inserting reward ${reward.title}:`, err);
        stats.errors++;
      }
    }

    console.log(`   ✅ Inserted: ${stats.inserted}, Skipped: ${stats.skipped}, Errors: ${stats.errors}`);
  } catch (error) {
    console.error('   ❌ Failed to migrate rewards:', error);
  }

  return stats;
}

/**
 * Main migration function
 */
async function runMigration() {
  console.log('🚀 Starting Supabase to PostgreSQL Migration');
  console.log('='.repeat(50));

  const startTime = Date.now();
  const allStats: { [key: string]: MigrationStats } = {};

  try {
    // Test database connection
    console.log('\n🔌 Testing database connections...');
    await pool.query('SELECT NOW()');
    console.log('   ✅ PostgreSQL connection successful');

    const { data: supabaseTest, error: supabaseError } = await supabase
      .from('cadets')
      .select('count')
      .limit(1);
    if (supabaseError) throw supabaseError;
    console.log('   ✅ Supabase connection successful');

    // Run migrations in order
    allStats.cadets = await migrateCadets();
    allStats.points = await migratePoints();
    allStats.attendance_bulks = await migrateAttendanceBulks();
    allStats.attendance = await migrateAttendance();
    allStats.rewards = await migrateRewards();

    // Print summary
    const endTime = Date.now();
    const duration = ((endTime - startTime) / 1000).toFixed(2);

    console.log('\n' + '='.repeat(50));
    console.log('📊 Migration Summary');
    console.log('='.repeat(50));

    let totalInserted = 0;
    let totalSkipped = 0;
    let totalErrors = 0;

    for (const [table, stats] of Object.entries(allStats)) {
      console.log(`\n${table}:`);
      console.log(`   Total:    ${stats.total}`);
      console.log(`   Inserted: ${stats.inserted}`);
      console.log(`   Skipped:  ${stats.skipped}`);
      console.log(`   Errors:   ${stats.errors}`);

      totalInserted += stats.inserted;
      totalSkipped += stats.skipped;
      totalErrors += stats.errors;
    }

    console.log('\n' + '='.repeat(50));
    console.log(`✅ Migration completed in ${duration}s`);
    console.log(`   Total Inserted: ${totalInserted}`);
    console.log(`   Total Skipped:  ${totalSkipped}`);
    console.log(`   Total Errors:   ${totalErrors}`);
    console.log('='.repeat(50));

  } catch (error) {
    console.error('\n❌ Migration failed:', error);
    process.exit(1);
  } finally {
    // Clean up connections
    await pool.end();
  }
}

// Run the migration
runMigration().catch((error) => {
  console.error('Fatal error:', error);
  process.exit(1);
});
