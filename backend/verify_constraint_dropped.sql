-- Verify that the old constraint is actually dropped
-- Run this to confirm the fix worked

SELECT 
    CASE 
        WHEN EXISTS (
            SELECT 1 FROM pg_constraint 
            WHERE conrelid = 'tasks'::regclass 
            AND conname = 'uq_tasks_system_template_origin_id'
        ) THEN '❌ ERROR: Old constraint STILL EXISTS - needs to be dropped!'
        ELSE '✅ SUCCESS: Old constraint does NOT exist (dropped successfully)'
    END as constraint_status;

-- Also verify the new index exists
SELECT 
    CASE 
        WHEN EXISTS (
            SELECT 1 FROM pg_indexes 
            WHERE tablename = 'tasks' 
            AND indexname = 'uq_tasks_system_template_user_date'
        ) THEN '✅ New unique index EXISTS'
        ELSE '❌ New unique index MISSING'
    END as new_index_status;
