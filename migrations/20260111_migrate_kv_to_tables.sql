-- Migration: migrate kv_store entries into structured tables
-- Run this in your PostgreSQL SQL client against the target database
-- Steps: run the INSERT blocks in order: cadets, attendance, points
-- These statements use ON CONFLICT DO NOTHING (id primary key) to avoid duplicates.

-- 1) Insert cadets
INSERT INTO public.cadets (id, email, first_name, last_name, created_at)
SELECT
  (value->>'id')::uuid AS id,
  value->>'email' AS email,
  value->>'first_name' AS first_name,
  value->>'last_name' AS last_name,
  (value->>'created_at')::timestamptz AS created_at
FROM public.kv_store_73a3871f
WHERE key LIKE 'cadet:%'
ON CONFLICT (id) DO NOTHING;

-- 2) Insert attendance
INSERT INTO public.attendance (id, cadet_id, date, present, created_at)
SELECT
  (value->>'id')::uuid,
  (value->>'cadet_id')::uuid,
  (value->>'date')::date,
  CASE WHEN (value->>'present') IS NULL THEN true ELSE (value->>'present')::boolean END,
  (value->>'created_at')::timestamptz
FROM public.kv_store_73a3871f
WHERE key LIKE 'attendance:%'
ON CONFLICT (id) DO NOTHING;

-- 3) Insert points
INSERT INTO public.points (id, cadet_id, points, reason, created_at)
SELECT
  (value->>'id')::uuid,
  (value->>'cadet_id')::uuid,
  COALESCE((value->>'points')::int, 0),
  value->>'reason',
  (value->>'created_at')::timestamptz
FROM public.kv_store_73a3871f
WHERE key LIKE 'point:%'
ON CONFLICT (id) DO NOTHING;

-- Optional: verify counts
-- SELECT count(*) FROM public.cadets;
-- SELECT count(*) FROM public.attendance;
-- SELECT count(*) FROM public.points;

-- Optional cleanup (UNCOMMENT to remove migrated KV entries):
-- DELETE FROM public.kv_store_73a3871f WHERE key LIKE 'cadet:%' OR key LIKE 'attendance:%' OR key LIKE 'points:%';

-- RLS note: If you wish to enable Row Level Security (RLS) for production, create appropriate policies.
-- Example permissive select policy (for testing only):
-- ALTER TABLE public.cadets ENABLE ROW LEVEL SECURITY;
-- CREATE POLICY "Allow select" ON public.cadets FOR SELECT USING (true);

-- After running, re-run the app and Data Integrity checks should report real table counts.
