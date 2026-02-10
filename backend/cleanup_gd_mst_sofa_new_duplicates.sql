-- Remove duplicate SOFA NEW checklist items across all projects.
-- Duplicates are determined by (checklist_id, path, title, keyword, description) normalized.
-- Keeps the first item (lowest position, then lowest id) and deletes the rest.

WITH project_items AS (
  SELECT
    ci.id,
    ci.checklist_id,
    ci.path,
    ci.position,
    ci.title,
    ci.keyword,
    ci.description
  FROM checklist_items ci
  JOIN checklists c ON c.id = ci.checklist_id
  WHERE c.project_id IS NOT NULL
    AND ci.path = 'gd_mst_sofa_new'
),
ranked AS (
  SELECT
    id,
    checklist_id,
    path,
    position,
    ROW_NUMBER() OVER (
      PARTITION BY
        checklist_id,
        path,
        lower(trim(coalesce(title, ''))),
        lower(trim(coalesce(keyword, ''))),
        lower(trim(coalesce(description, '')))
      ORDER BY position NULLS LAST, id
    ) AS rn
  FROM project_items
),
to_delete AS (
  SELECT id FROM ranked WHERE rn > 1
),
deleted AS (
  DELETE FROM checklist_items
  WHERE id IN (SELECT id FROM to_delete)
  RETURNING checklist_id, path
),
affected AS (
  SELECT DISTINCT checklist_id, path FROM deleted
),
renumbered AS (
  SELECT
    ci.id,
    ci.checklist_id,
    ci.path,
    ROW_NUMBER() OVER (
      PARTITION BY ci.checklist_id, ci.path
      ORDER BY ci.position NULLS LAST, ci.id
    ) - 1 AS new_position
  FROM checklist_items ci
  JOIN affected a
    ON a.checklist_id = ci.checklist_id
   AND a.path = ci.path
)
UPDATE checklist_items ci
SET position = r.new_position
FROM renumbered r
WHERE ci.id = r.id;
