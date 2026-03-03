-- Manual cleanup for legacy system-task rows after rollout.
-- Run intentionally by operator; this is not an Alembic migration.

BEGIN;

CREATE TABLE IF NOT EXISTS tasks_system_legacy_archive AS
SELECT *
FROM tasks
WHERE 1 = 0;

INSERT INTO tasks_system_legacy_archive
SELECT *
FROM tasks
WHERE system_template_origin_id IS NOT NULL
  AND origin_run_at IS NULL;

DELETE FROM task_assignees ta
USING tasks t
WHERE ta.task_id = t.id
  AND t.system_template_origin_id IS NOT NULL
  AND t.origin_run_at IS NULL;

DELETE FROM tasks
WHERE system_template_origin_id IS NOT NULL
  AND origin_run_at IS NULL;

TRUNCATE TABLE system_task_occurrence_overrides;
TRUNCATE TABLE system_task_occurrences;

COMMIT;
