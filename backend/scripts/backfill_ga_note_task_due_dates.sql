-- Backfill missing due dates for GA/KA note-origin tasks.
--
-- This is intentionally an opt-in maintenance script.
-- Review the WHERE clause and preview the affected rows before running.
--
-- Targets:
--   - tasks created from GA/KA notes (`ga_note_origin_id` is set)
--   - tasks that currently have `due_date` = NULL (won't show in Weekly Planner)
--
-- Policy:
--   - Set `due_date` to `start_date` if present, otherwise `created_at`
--   - Ensure `start_date` is also set (to the same fallback) for consistency
--
-- Preview:
--   SELECT id, title, ga_note_origin_id, start_date, due_date, created_at
--   FROM tasks
--   WHERE ga_note_origin_id IS NOT NULL AND due_date IS NULL
--   ORDER BY created_at DESC;
--
-- Apply:
UPDATE tasks
SET
  start_date = COALESCE(start_date, created_at),
  due_date = COALESCE(start_date, created_at)
WHERE ga_note_origin_id IS NOT NULL
  AND due_date IS NULL;

