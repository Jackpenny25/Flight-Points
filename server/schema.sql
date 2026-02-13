CREATE EXTENSION IF NOT EXISTS "pgcrypto";

DO $$
BEGIN
  IF NOT EXISTS (SELECT 1 FROM pg_type WHERE typname = 'attendance_status') THEN
    CREATE TYPE attendance_status AS ENUM ('present', 'authorised_absence', 'absent');
  END IF;
END $$;

CREATE TABLE IF NOT EXISTS cadets (
  id UUID PRIMARY KEY DEFAULT gen_random_uuid(),
  name VARCHAR NOT NULL,
  flight VARCHAR NOT NULL,
  created_at TIMESTAMP DEFAULT NOW(),
  updated_at TIMESTAMP
);

CREATE TABLE IF NOT EXISTS points (
  id UUID PRIMARY KEY DEFAULT gen_random_uuid(),
  cadet_name VARCHAR NOT NULL,
  date TIMESTAMP,
  flight VARCHAR,
  reason TEXT,
  points INTEGER,
  type VARCHAR,
  given_by VARCHAR,
  created_at TIMESTAMP DEFAULT NOW(),
  updated_at TIMESTAMP
);

CREATE TABLE IF NOT EXISTS attendance_bulks (
  id UUID PRIMARY KEY DEFAULT gen_random_uuid(),
  date TIMESTAMP,
  flight_filter VARCHAR,
  total_records INTEGER,
  total_present INTEGER,
  submitted_by VARCHAR,
  created_at TIMESTAMP DEFAULT NOW()
);

CREATE TABLE IF NOT EXISTS attendance (
  id UUID PRIMARY KEY DEFAULT gen_random_uuid(),
  cadet_name VARCHAR NOT NULL,
  date TIMESTAMP,
  flight VARCHAR,
  status attendance_status NOT NULL,
  submitted_by VARCHAR,
  bulk_id UUID REFERENCES attendance_bulks(id) ON DELETE SET NULL,
  created_at TIMESTAMP DEFAULT NOW()
);

CREATE TABLE IF NOT EXISTS rewards (
  id UUID PRIMARY KEY DEFAULT gen_random_uuid(),
  title VARCHAR,
  how_to_win TEXT,
  prize TEXT,
  ends_at TIMESTAMP,
  created_by VARCHAR,
  created_at TIMESTAMP DEFAULT NOW(),
  updated_at TIMESTAMP
);

CREATE INDEX IF NOT EXISTS idx_cadets_name ON cadets (name);
CREATE INDEX IF NOT EXISTS idx_cadets_flight ON cadets (flight);

CREATE INDEX IF NOT EXISTS idx_points_cadet_name ON points (cadet_name);
CREATE INDEX IF NOT EXISTS idx_points_date ON points (date);
CREATE INDEX IF NOT EXISTS idx_points_flight ON points (flight);

CREATE INDEX IF NOT EXISTS idx_attendance_cadet_name ON attendance (cadet_name);
CREATE INDEX IF NOT EXISTS idx_attendance_date ON attendance (date);
CREATE INDEX IF NOT EXISTS idx_attendance_flight ON attendance (flight);
CREATE INDEX IF NOT EXISTS idx_attendance_bulk_id ON attendance (bulk_id);

CREATE INDEX IF NOT EXISTS idx_attendance_bulks_date ON attendance_bulks (date);
CREATE INDEX IF NOT EXISTS idx_attendance_bulks_flight_filter ON attendance_bulks (flight_filter);

CREATE INDEX IF NOT EXISTS idx_rewards_ends_at ON rewards (ends_at);
