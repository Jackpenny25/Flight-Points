-- Add rank column to cadets table for staff/HQ flight members
ALTER TABLE cadets ADD COLUMN IF NOT EXISTS rank VARCHAR;
