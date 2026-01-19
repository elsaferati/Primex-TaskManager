-- SIMPLE QUERY: Show the project and check if Anisa is a member
-- Replace '4dc1eda6-191b-426c-b805-6e5fbb310e...' with Anisa's full user_id

SELECT 
    p.id as project_id,
    p.title,
    p.due_date,
    DATE(p.due_date) as due_date_date_only,
    p.start_date,
    DATE(p.start_date) as start_date_date_only,
    p.created_at,
    DATE(p.created_at) as created_date_only,
    p.completed_at,
    p.is_template,
    d.name as department_name,
    CASE 
        WHEN pm.user_id IS NOT NULL THEN 'YES - Anisa IS a member ✓'
        ELSE 'NO - Anisa is NOT a member ✗'
    END as anisa_is_member,
    u.full_name as anisa_name,
    pm.user_id as anisa_user_id
FROM projects p
LEFT JOIN departments d ON p.department_id = d.id
LEFT JOIN project_members pm ON p.id = pm.project_id 
    AND pm.user_id = '4dc1eda6-191b-426c-b805-6e5fbb310e...'  -- Replace with Anisa's full user_id
LEFT JOIN users u ON pm.user_id = u.id
WHERE p.title ILIKE '%TEST PLAN WEEK PRJK%'
ORDER BY p.created_at DESC
LIMIT 1;
