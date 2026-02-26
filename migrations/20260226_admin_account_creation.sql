-- Add columns to app_users for admin-created accounts
ALTER TABLE app_users ADD COLUMN IF NOT EXISTS created_by TEXT;
ALTER TABLE app_users ADD COLUMN IF NOT EXISTS cadet_id UUID REFERENCES cadets(id) ON DELETE SET NULL;
CREATE INDEX IF NOT EXISTS idx_app_users_cadet_id ON app_users (cadet_id);
