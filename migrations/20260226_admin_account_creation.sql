-- Add columns to app_users for admin-created accounts
-- Run each statement one at a time in DBeaver

-- Step 1: Add created_by column
ALTER TABLE app_users ADD COLUMN IF NOT EXISTS created_by TEXT;

-- Step 2: Add cadet_id column (without FK first)
ALTER TABLE app_users ADD COLUMN IF NOT EXISTS cadet_id UUID;

-- Step 3: Add the foreign key constraint
DO $$
BEGIN
  IF NOT EXISTS (
    SELECT 1 FROM information_schema.table_constraints
    WHERE constraint_name = 'app_users_cadet_id_fkey'
      AND table_name = 'app_users'
  ) THEN
    ALTER TABLE app_users
      ADD CONSTRAINT app_users_cadet_id_fkey
      FOREIGN KEY (cadet_id) REFERENCES cadets(id) ON DELETE SET NULL;
  END IF;
END $$;

-- Step 4: Add index
CREATE INDEX IF NOT EXISTS idx_app_users_cadet_id ON app_users (cadet_id);
