-- SIMPLEST QUERY: Just show the project and all its members
-- This will clearly show if Anisa is a member or not

SELECT 
    p.id as project_id,
    p.title,
    p.due_date,
    DATE(p.due_date) as due_date_date_only,
    p.created_at,
    DATE(p.created_at) as created_date_only,
    p.completed_at,
    p.is_template,
    d.name as department_name,
    u.id as member_user_id,
    u.full_name as member_name,
    u.email as member_email
FROM projects p
LEFT JOIN departments d ON p.department_id = d.id
LEFT JOIN project_members pm ON p.id = pm.project_id
LEFT JOIN users u ON pm.user_id = u.id
WHERE p.title ILIKE '%TEST PLAN WEEK PRJK%'
ORDER BY p.created_at DESC, u.full_name;
