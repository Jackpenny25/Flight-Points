-- Migration to fix given_by and submitted_by fields that contain JWT tokens
-- Run this in DBeaver after connecting through the Cloudflare tunnel

-- First, let's see what JWT tokens are in the database
-- Uncomment the following lines to see the data before updating:
-- SELECT DISTINCT given_by FROM points WHERE given_by LIKE 'ey%';
-- SELECT DISTINCT submitted_by FROM attendance WHERE submitted_by LIKE 'ey%';
-- SELECT DISTINCT submitted_by FROM attendance_bulks WHERE submitted_by LIKE 'ey%';

-- Since JWT tokens can't be easily decoded in PostgreSQL without extensions,
-- we'll need to map them manually or use a default value.

-- Option 1: Update all JWT tokens to a specific user name (RECOMMENDED)
-- Replace 'Jack Penny' with your actual name
UPDATE points 
SET given_by = 'Jack Penny', 
    updated_at = NOW()
WHERE given_by LIKE 'ey%';

UPDATE attendance 
SET submitted_by = 'Jack Penny'
WHERE submitted_by LIKE 'ey%';

UPDATE attendance_bulks 
SET submitted_by = 'Jack Penny'
WHERE submitted_by LIKE 'ey%';

-- Option 2: If you want to mark them as unknown instead:
-- UPDATE points 
-- SET given_by = 'Unknown', 
--     updated_at = NOW()
-- WHERE given_by LIKE 'ey%';

-- UPDATE attendance 
-- SET submitted_by = 'Unknown'
-- WHERE submitted_by LIKE 'ey%';

-- UPDATE attendance_bulks 
-- SET submitted_by = 'Unknown'
-- WHERE submitted_by LIKE 'ey%';

-- Verify the changes
SELECT 
    'Points' as table_name,
    COUNT(*) as records_updated
FROM points 
WHERE given_by = 'Jack Penny' 
  AND updated_at > NOW() - INTERVAL '1 minute'
UNION ALL
SELECT 
    'Attendance' as table_name,
    COUNT(*) as records_updated
FROM attendance 
WHERE submitted_by = 'Jack Penny'
UNION ALL
SELECT 
    'Attendance Bulks' as table_name,
    COUNT(*) as records_updated
FROM attendance_bulks 
WHERE submitted_by = 'Jack Penny';
