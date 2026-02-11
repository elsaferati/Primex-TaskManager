-- Backfill KO owner into task_assignees for PCM TT/MST CONTROL tasks.
--
-- Context:
-- Some parts of the app treat assignment via `task_assignees` as authoritative.
-- KO ownership is stored in `tasks.internal_notes` as `ko_user_id=<uuid>`.
-- This query ensures the KO user is treated as an assignee everywhere.
--
-- Safe to run multiple times (ON CONFLICT DO NOTHING).

INSERT INTO task_assignees (task_id, user_id)
SELECT
  t.id AS task_id,
  (substring(
    t.internal_notes
    from 'ko_user_id[:=]\s*([0-9a-f]{8}-[0-9a-f]{4}-[0-9a-f]{4}-[0-9a-f]{4}-[0-9a-f]{12})'
  ))::uuid AS user_id
FROM tasks t
JOIN projects p ON p.id = t.project_id
JOIN departments d ON d.id = p.department_id
WHERE d.code = 'PCM'
  AND upper(coalesce(t.phase, '')) = 'CONTROL'
  AND (
    upper(coalesce(p.project_type, '')) = 'MST'
    OR upper(coalesce(p.title, '')) = 'TT'
    OR upper(coalesce(p.title, '')) LIKE 'TT %'
    OR upper(coalesce(p.title, '')) LIKE 'TT-%'
    OR upper(coalesce(p.title, '')) LIKE '%MST%'
  )
  AND t.internal_notes ~* 'ko_user_id[:=]\s*[0-9a-f]{8}-[0-9a-f]{4}-[0-9a-f]{4}-[0-9a-f]{4}-[0-9a-f]{12}'
ON CONFLICT DO NOTHING;

