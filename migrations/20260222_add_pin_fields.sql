-- Add PIN support to app_users table
ALTER TABLE app_users ADD COLUMN IF NOT EXISTS pin_hash TEXT;
ALTER TABLE app_users ADD COLUMN IF NOT EXISTS pin_last_changed TIMESTAMP;
ALTER TABLE app_users ADD COLUMN IF NOT EXISTS pin_is_default BOOLEAN DEFAULT TRUE;

-- Create index for faster lookups
CREATE INDEX IF NOT EXISTS idx_app_users_id ON app_users (id);
