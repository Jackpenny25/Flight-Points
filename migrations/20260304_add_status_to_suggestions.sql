-- Add status column to reward_suggestions table for moderation workflow
ALTER TABLE reward_suggestions ADD COLUMN IF NOT EXISTS status VARCHAR DEFAULT 'pending';

-- Add reviewed_at column to track when SNCO reviewed it
ALTER TABLE reward_suggestions ADD COLUMN IF NOT EXISTS reviewed_at TIMESTAMP;

-- Add reviewed_by column to track which SNCO reviewed it
ALTER TABLE reward_suggestions ADD COLUMN IF NOT EXISTS reviewed_by VARCHAR;

-- Create index for status to speed up filtering
CREATE INDEX IF NOT EXISTS idx_reward_suggestions_status ON reward_suggestions (status);
