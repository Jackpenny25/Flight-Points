-- Add winner_name and status columns to rewards table
ALTER TABLE rewards ADD COLUMN IF NOT EXISTS winner_name VARCHAR;
ALTER TABLE rewards ADD COLUMN IF NOT EXISTS status VARCHAR DEFAULT 'active';

-- Update existing rewards: if ends_at has passed, set status to 'expired'
UPDATE rewards SET status = 'expired' WHERE ends_at < NOW() AND status = 'active';

-- Create reward_suggestions table for cadet suggestions with voting
CREATE TABLE IF NOT EXISTS reward_suggestions (
  id UUID PRIMARY KEY DEFAULT gen_random_uuid(),
  title VARCHAR NOT NULL,
  description TEXT,
  suggested_by VARCHAR NOT NULL,
  suggested_by_name VARCHAR,
  suggested_at TIMESTAMP DEFAULT NOW(),
  vote_count INTEGER DEFAULT 0
);

-- Create reward_votes table to track who voted (one vote per user per suggestion)
CREATE TABLE IF NOT EXISTS reward_votes (
  id UUID PRIMARY KEY DEFAULT gen_random_uuid(),
  suggestion_id UUID NOT NULL REFERENCES reward_suggestions(id) ON DELETE CASCADE,
  user_id VARCHAR NOT NULL,
  created_at TIMESTAMP DEFAULT NOW(),
  UNIQUE(suggestion_id, user_id)
);

CREATE INDEX IF NOT EXISTS idx_reward_suggestions_vote_count ON reward_suggestions (vote_count DESC);
CREATE INDEX IF NOT EXISTS idx_reward_votes_suggestion_id ON reward_votes (suggestion_id);
CREATE INDEX IF NOT EXISTS idx_reward_votes_user_id ON reward_votes (user_id);
