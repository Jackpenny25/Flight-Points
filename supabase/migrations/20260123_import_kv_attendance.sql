-- Migration: Import attendance KV rows into structured tables
-- Generated: 2026-01-23
-- WARNING: Review and backup `public.kv_store_73a3871f` before running.

BEGIN;

-- 0) Ensure target tables and columns exist (safe to run multiple times)
CREATE TABLE IF NOT EXISTS public.attendance (
  id uuid PRIMARY KEY,
  cadet_id uuid,
  date date,
  present boolean,
  flight text,
  status text,
  bulk_id uuid,
  submitted_by text,
  created_at timestamptz
);

-- Add missing columns if table already existed without them
ALTER TABLE public.attendance ADD COLUMN IF NOT EXISTS cadet_name text;
ALTER TABLE public.attendance ADD COLUMN IF NOT EXISTS status text;
ALTER TABLE public.attendance ADD COLUMN IF NOT EXISTS flight text;
ALTER TABLE public.attendance ADD COLUMN IF NOT EXISTS present boolean;
ALTER TABLE public.attendance ADD COLUMN IF NOT EXISTS bulk_id uuid;
ALTER TABLE public.attendance ADD COLUMN IF NOT EXISTS submitted_by text;
ALTER TABLE public.attendance ADD COLUMN IF NOT EXISTS created_at timestamptz;

CREATE TABLE IF NOT EXISTS public.attendance_bulk (
  id uuid PRIMARY KEY,
  date timestamptz,
  flight_filter text,
  total_records int,
  total_present int,
  submitted_by text,
  created_at timestamptz
);

-- 1) Import single attendance records from KV
INSERT INTO public.attendance (
  id, cadet_id, cadet_name, date, present, flight, status, bulk_id, submitted_by, created_at
)
SELECT
  (kv.value->>'id')::uuid AS id,
  cadets.id AS cadet_id,
  kv.value->>'cadetName' AS cadet_name,
  (kv.value->>'date')::date AS date,
  CASE WHEN (kv.value->>'status') = 'present' THEN true ELSE false END AS present,
  kv.value->>'flight' AS flight,
  kv.value->>'status' AS status,
  NULLIF(kv.value->>'bulkId', '')::uuid AS bulk_id,
  kv.value->>'submittedBy' AS submitted_by,
  (kv.value->>'createdAt')::timestamptz AS created_at
FROM public.kv_store_73a3871f kv
LEFT JOIN public.cadets ON kv.value->>'cadetName' = public.cadets.name
WHERE kv.key LIKE 'attendance:%'
ON CONFLICT (id) DO NOTHING;

-- 2) Import attendance bulk records from KV
INSERT INTO public.attendance_bulk (
  id, date, flight_filter, total_records, total_present, submitted_by, created_at
)
SELECT
  (kv.value->>'id')::uuid AS id,
  (kv.value->>'date')::timestamptz AS date,
  kv.value->>'flightFilter' AS flight_filter,
  COALESCE((kv.value->>'totalRecords')::int, 0) AS total_records,
  COALESCE((kv.value->>'totalPresent')::int, 0) AS total_present,
  kv.value->>'submittedBy' AS submitted_by,
  (kv.value->>'createdAt')::timestamptz AS created_at
FROM public.kv_store_73a3871f kv
WHERE kv.key LIKE 'attendance-bulk:%'
ON CONFLICT (id) DO NOTHING;

COMMIT;

-- OPTIONAL: After verifying imported rows, you may delete the migrated KV entries:
-- DELETE FROM public.kv_store_73a3871f WHERE key LIKE 'attendance:%' OR key LIKE 'attendance-bulk:%';

-- Verification queries (run after migration):
-- SELECT count(*) FROM public.attendance;
-- SELECT count(*) FROM public.attendance_bulk;
