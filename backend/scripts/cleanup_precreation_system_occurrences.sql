-- Deletes system task occurrence rows earlier than the template creation date.
DELETE FROM system_task_occurrences AS occ
USING system_task_templates AS tmpl
WHERE occ.template_id = tmpl.id
  AND tmpl.created_at IS NOT NULL
  AND occ.occurrence_date < (timezone('Europe/Tirane', tmpl.created_at))::date;
