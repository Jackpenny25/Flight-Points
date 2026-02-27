-- Add is_nco column to cadets table
-- NCOs cannot receive points
ALTER TABLE cadets ADD COLUMN IF NOT EXISTS is_nco BOOLEAN DEFAULT FALSE;
