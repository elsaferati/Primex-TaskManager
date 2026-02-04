-- SQL queries to verify database state on live server
-- Run these queries in pgAdmin or psql to check if all required objects exist

-- 1. Check if assignee_ids column exists (should return 1 row)
SELECT 1 FROM information_schema.columns 
WHERE table_name = 'system_task_templates' 
AND column_name = 'assignee_ids';

-- 2. Check if unique index exists (should return 1 row)
SELECT indexname FROM pg_indexes 
WHERE tablename = 'tasks' 
AND indexname = 'uq_tasks_system_template_user_date';

-- 3. Check if old constraint still exists (should return 0 rows - constraint should be dropped)
SELECT conname FROM pg_constraint 
WHERE conrelid = 'tasks'::regclass 
AND conname = 'uq_tasks_system_template_origin_id';

-- 4. Check if immutable_date function exists (should return 1 row)
SELECT proname FROM pg_proc 
WHERE proname = 'immutable_date';

-- 5. Check for duplicate tasks that would violate the new unique index
-- (This query helps identify if cleanup is needed)
SELECT 
    system_template_origin_id,
    assigned_to,
    DATE(start_date) as task_date,
    COUNT(*) as duplicate_count
FROM tasks
WHERE system_template_origin_id IS NOT NULL
GROUP BY system_template_origin_id, assigned_to, DATE(start_date)
HAVING COUNT(*) > 1;
