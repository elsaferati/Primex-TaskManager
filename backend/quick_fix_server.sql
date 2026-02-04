-- Quick Fix Script for Live Server
-- Run these commands in pgAdmin on your live server database

-- Step 1: Check current state
SELECT 'Checking database state...' as status;

-- Check if assignee_ids column exists
SELECT 
    CASE 
        WHEN EXISTS (
            SELECT 1 FROM information_schema.columns 
            WHERE table_name = 'system_task_templates' 
            AND column_name = 'assignee_ids'
        ) THEN '✅ assignee_ids column EXISTS'
        ELSE '❌ assignee_ids column MISSING'
    END as assignee_ids_status;

-- Check if unique index exists
SELECT 
    CASE 
        WHEN EXISTS (
            SELECT 1 FROM pg_indexes 
            WHERE tablename = 'tasks' 
            AND indexname = 'uq_tasks_system_template_user_date'
        ) THEN '✅ Unique index EXISTS'
        ELSE '❌ Unique index MISSING'
    END as unique_index_status;

-- Check if old constraint exists
SELECT 
    CASE 
        WHEN EXISTS (
            SELECT 1 FROM pg_constraint 
            WHERE conrelid = 'tasks'::regclass 
            AND conname = 'uq_tasks_system_template_origin_id'
        ) THEN '⚠️ Old constraint EXISTS (should be dropped)'
        ELSE '✅ Old constraint does NOT exist (good)'
    END as old_constraint_status;

-- Check if function exists
SELECT 
    CASE 
        WHEN EXISTS (
            SELECT 1 FROM pg_proc 
            WHERE proname = 'immutable_date'
        ) THEN '✅ immutable_date function EXISTS'
        ELSE '❌ immutable_date function MISSING'
    END as function_status;

-- Step 2: Apply fixes based on what's missing

-- Fix 1: Create immutable_date function if missing
CREATE OR REPLACE FUNCTION immutable_date(timestamp with time zone)
RETURNS date
LANGUAGE sql
IMMUTABLE
AS $$
    SELECT $1::date;
$$;

-- Fix 2: Drop old constraint if it exists
ALTER TABLE tasks DROP CONSTRAINT IF EXISTS uq_tasks_system_template_origin_id;

-- Fix 3: Clean up duplicate tasks (keep most recent)
DELETE FROM tasks t1
WHERE t1.system_template_origin_id IS NOT NULL
AND EXISTS (
    SELECT 1 FROM tasks t2
    WHERE t2.system_template_origin_id = t1.system_template_origin_id
    AND t2.assigned_to = t1.assigned_to
    AND DATE(t2.start_date) = DATE(t1.start_date)
    AND t2.id > t1.id
);

-- Fix 4: Create unique index if it doesn't exist
CREATE UNIQUE INDEX IF NOT EXISTS uq_tasks_system_template_user_date 
ON tasks (system_template_origin_id, assigned_to, immutable_date(start_date))
WHERE system_template_origin_id IS NOT NULL;

-- Step 3: Verify fixes
SELECT 'All fixes applied. Please restart the backend server.' as status;
