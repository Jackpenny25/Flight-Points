CREATE EXTENSION IF NOT EXISTS "pgcrypto";

CREATE TABLE IF NOT EXISTS app_users (
  id UUID PRIMARY KEY DEFAULT gen_random_uuid(),
  email TEXT NOT NULL UNIQUE,
  name TEXT NOT NULL,
  role TEXT NOT NULL DEFAULT 'cadet',
  password_hash TEXT NOT NULL,
  created_at TIMESTAMP DEFAULT NOW(),
  updated_at TIMESTAMP
);

CREATE TABLE IF NOT EXISTS signup_codes (
  id UUID PRIMARY KEY DEFAULT gen_random_uuid(),
  code TEXT NOT NULL UNIQUE,
  duration_seconds INTEGER NOT NULL CHECK (duration_seconds > 0),
  expires_at TIMESTAMP NOT NULL,
  is_active BOOLEAN NOT NULL DEFAULT TRUE,
  created_at TIMESTAMP NOT NULL DEFAULT NOW(),
  created_by TEXT,
  revoked_at TIMESTAMP,
  revoked_by TEXT
);

CREATE TABLE IF NOT EXISTS signup_requests (
  id UUID PRIMARY KEY DEFAULT gen_random_uuid(),
  email TEXT NOT NULL,
  name TEXT NOT NULL,
  password TEXT NOT NULL,
  flight TEXT,
  status TEXT NOT NULL DEFAULT 'pending',
  created_at TIMESTAMP NOT NULL DEFAULT NOW()
);

CREATE INDEX IF NOT EXISTS idx_signup_codes_active ON signup_codes (is_active);
CREATE INDEX IF NOT EXISTS idx_signup_codes_expires_at ON signup_codes (expires_at);
CREATE INDEX IF NOT EXISTS idx_signup_requests_email ON signup_requests (email);
CREATE INDEX IF NOT EXISTS idx_signup_requests_created_at ON signup_requests (created_at);
CREATE INDEX IF NOT EXISTS idx_app_users_email ON app_users (email);
