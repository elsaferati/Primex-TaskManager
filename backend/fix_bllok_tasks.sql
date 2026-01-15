-- Fix tasks with "bllok" in title that are incorrectly marked as blocked
-- This sets is_bllok to false for tasks that have "bllok" in their title
-- but should not be blocked tasks

UPDATE tasks
SET is_bllok = false
WHERE LOWER(title) LIKE '%bllok%'
  AND is_bllok = true
  AND project_id IS NULL;  -- Only fix Fast Tasks (no project)

-- Verify the changes
SELECT id, title, is_bllok, project_id
FROM tasks
WHERE LOWER(title) LIKE '%bllok%'
ORDER BY created_at DESC;
