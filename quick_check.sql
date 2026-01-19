-- QUICK CHECK: Run this to see if everything is correct
-- This shows the project, its members, and key dates

SELECT 
    p.id as project_id,
    p.title,
    p.due_date,
    p.start_date,
    p.created_at,
    p.completed_at,
    p.is_template,
    d.name as department_name,
    u.id as member_user_id,
    u.full_name as member_name,
    CASE 
        WHEN pm.user_id IS NOT NULL THEN 'YES'
        ELSE 'NO'
    END as is_member
FROM projects p
LEFT JOIN departments d ON p.department_id = d.id
LEFT JOIN project_members pm ON p.id = pm.project_id
LEFT JOIN users u ON pm.user_id = u.id
WHERE p.title ILIKE '%TEST PLAN WEEK PRJK%'
ORDER BY p.created_at DESC, u.full_name;
