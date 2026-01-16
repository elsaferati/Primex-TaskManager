-- Run this query to export your VS/VL template task descriptions
-- Copy the results and add them to the seed.py file

SELECT 
    t.title,
    t.description,
    t.phase,
    t.due_date,
    t.assigned_to,
    u.email AS assigned_to_email,
    t.priority,
    t.status
FROM tasks t
LEFT JOIN users u ON t.assigned_to = u.id
INNER JOIN projects p ON t.project_id = p.id
WHERE (p.title = 'VS/VL PROJEKT I MADH' OR p.title = 'VS/VL PROJEKT I MADH TEMPLATE')
  AND p.is_template = true
ORDER BY 
    CASE t.phase
        WHEN 'AMAZON' THEN 1
        WHEN 'CHECK' THEN 2
        WHEN 'DREAMROBOT' THEN 3
        ELSE 4
    END,
    t.title;
