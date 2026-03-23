-- Migration: Add potential_rewards table
-- Run this in DBeaver if you want to pre-create the table before the server auto-creates it.
-- The server will also create this table automatically via ensureRewardsSchema() on first use.

CREATE TABLE IF NOT EXISTS potential_rewards (
    id         UUID PRIMARY KEY DEFAULT gen_random_uuid(),
    text       VARCHAR NOT NULL,
    created_by VARCHAR NOT NULL,
    created_at TIMESTAMP DEFAULT NOW()
);
