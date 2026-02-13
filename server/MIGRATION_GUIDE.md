# Supabase to PostgreSQL Migration Guide

This guide explains how to migrate your data from Supabase to a local PostgreSQL database.

## Overview

Two migration scripts are provided:
1. **migrate-from-supabase.ts** - Direct migration that connects to both databases and copies data
2. **export-supabase-to-sql.ts** - Exports Supabase data to a SQL file for manual import

## Prerequisites

- Node.js installed
- PostgreSQL database set up and running
- Access to your Supabase project

## Setup Instructions

### Step 1: Create Environment Configuration

Create a file named `.env.migration` in the project root:

```env
# Supabase credentials (already filled in for your project)
SUPABASE_URL=https://diutyuulfulleqfmjlxp.supabase.co
SUPABASE_ANON_KEY=eyJhbGciOiJIUzI1NiIsInR5cCI6IkpXVCJ9.eyJpc3MiOiJzdXBhYmFzZSIsInJlZiI6ImRpdXR5dXVsZnVsbGVxZm1qbHhwIiwicm9sZSI6ImFub24iLCJpYXQiOjE3NjU5MTIwODgsImV4cCI6MjA4MTQ4ODA4OH0.y-JROlzATycLHcEyqOppWe1HNi-nQaV6kBg7FAa1F6Y

# Your local PostgreSQL database
DATABASE_URL=postgresql://username:password@localhost:5432/database_name
```

**Replace** `username`, `password`, and `database_name` with your actual PostgreSQL credentials.

### Step 2: Ensure Database Schema is Set Up

Make sure your local PostgreSQL database has the schema created:

```powershell
# Run the schema creation script
psql -U username -d database_name -f server/schema.sql
```

Or if you're using the app's server, the schema should already be created automatically.

## Option 1: Direct Migration (Recommended)

This method directly transfers data from Supabase to your PostgreSQL database.

### Run the Migration

```powershell
tsx server/migrate-from-supabase.ts
```

### What It Does

- Connects to both Supabase and PostgreSQL
- Fetches all records from these tables:
  - `cadets`
  - `points`
  - `attendance_bulks`
  - `attendance`
  - `rewards`
- Inserts each record into your local database
- **Skips duplicates** - checks if each record already exists by ID
- Shows progress and statistics

### Example Output

```
🚀 Starting Supabase to PostgreSQL Migration
==================================================

🔌 Testing database connections...
   ✅ PostgreSQL connection successful
   ✅ Supabase connection successful

📦 Migrating cadets...
   Found 45 cadets
   ✅ Inserted: 45, Skipped: 0, Errors: 0

📦 Migrating points...
   Found 1234 points records
   ✅ Inserted: 1234, Skipped: 0, Errors: 0

📦 Migrating attendance_bulks...
   Found 23 attendance bulk records
   ✅ Inserted: 23, Skipped: 0, Errors: 0

📦 Migrating attendance...
   Found 2500 attendance records
   Processed batch: 0-1000 (Inserted: 1000)
   Processed batch: 1000-2000 (Inserted: 2000)
   Processed batch: 2000-2500 (Inserted: 2500)
   ✅ Total: 2500, Inserted: 2500, Skipped: 0, Errors: 0

📦 Migrating rewards...
   Found 5 rewards
   ✅ Inserted: 5, Skipped: 0, Errors: 0

==================================================
📊 Migration Summary
==================================================

cadets:
   Total:    45
   Inserted: 45
   Skipped:  0
   Errors:   0

points:
   Total:    1234
   Inserted: 1234
   Skipped:  0
   Errors:   0

attendance_bulks:
   Total:    23
   Inserted: 23
   Skipped:  0
   Errors:   0

attendance:
   Total:    2500
   Inserted: 2500
   Skipped:  0
   Errors:   0

rewards:
   Total:    5
   Inserted: 5
   Skipped:  0
   Errors:   0

==================================================
✅ Migration completed in 12.34s
   Total Inserted: 3807
   Total Skipped:  0
   Total Errors:   0
==================================================
```

### Running Multiple Times

You can safely run the migration script multiple times. It will skip any records that already exist in your database (based on their ID), so only new records will be inserted.

## Option 2: Export to SQL File

This method creates a SQL file that you can manually import.

### Run the Export

```powershell
tsx server/export-supabase-to-sql.ts
```

This creates a file called `supabase_export.sql` with all the INSERT statements.

### Import the SQL File

```powershell
psql -U username -d database_name -f supabase_export.sql
```

Or use pgAdmin:
1. Open pgAdmin
2. Right-click on your database
3. Select "Query Tool"
4. Click "Open File" and select `supabase_export.sql`
5. Click "Execute"

## Troubleshooting

### "Missing required environment variables"

- Make sure `.env.migration` file exists in the project root
- Check that all variables are filled in correctly
- Don't use quotes around the values

### "PostgreSQL connection failed"

- Verify your PostgreSQL server is running
- Check the DATABASE_URL format: `postgresql://username:password@host:port/database`
- Test connection with: `psql -U username -d database_name`

### "Supabase connection failed"

- Verify the SUPABASE_URL and SUPABASE_ANON_KEY are correct
- Check your internet connection
- Make sure the Supabase project is active

### "Duplicate key error"

This shouldn't happen because the scripts check for existing records, but if it does:
- The script will skip that record and continue
- Check the error message to see which record failed

### "Cannot find module 'tsx'"

Install tsx globally:
```powershell
npm install -g tsx
```

Or use npx:
```powershell
npx tsx server/migrate-from-supabase.ts
```

## Data Tables Migrated

| Table | Description |
|-------|-------------|
| **cadets** | All cadet records (name, flight, etc.) |
| **points** | Point awards history |
| **attendance_bulks** | Bulk attendance submission records |
| **attendance** | Individual attendance records |
| **rewards** | Reward/competition definitions |

## Security Notes

- The `.env.migration` file contains sensitive credentials
- Add it to `.gitignore` (recommended)
- Delete it after migration is complete
- Never commit database credentials to version control

## After Migration

1. Test your local application to ensure data is correct
2. Verify record counts match:
   ```sql
   SELECT COUNT(*) FROM cadets;
   SELECT COUNT(*) FROM points;
   SELECT COUNT(*) FROM attendance;
   SELECT COUNT(*) FROM rewards;
   ```
3. Delete `.env.migration` file if no longer needed
4. Update your application to use the local database

## Need Help?

If you encounter any issues:
1. Check the error message carefully
2. Verify all prerequisites are met
3. Make sure database schema is created
4. Test database connections separately
