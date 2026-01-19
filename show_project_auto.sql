-- AUTOMATIC QUERY: Shows project and checks Anisa's membership
-- No need to replace any UUIDs - it finds Anisa automatically

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
    anisa_user.id as anisa_user_id,
    anisa_user.full_name as anisa_name
FROM projects p
LEFT JOIN departments d ON p.department_id = d.id
LEFT JOIN (
    SELECT id, full_name 
    FROM users 
    WHERE full_name ILIKE '%Anisa%' OR full_name ILIKE '%Ternava%'
    LIMIT 1
) anisa_user ON 1=1
LEFT JOIN project_members pm ON p.id = pm.project_id 
    AND pm.user_id = anisa_user.id
WHERE p.title ILIKE '%TEST PLAN WEEK PRJK%'
ORDER BY p.created_at DESC
LIMIT 1;

-- ALTERNATIVE: Show project with ALL members (easier to see)
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
    u.email as member_email,
    CASE 
        WHEN u.full_name ILIKE '%Anisa%' OR u.full_name ILIKE '%Ternava%' THEN '← THIS IS ANISA'
        ELSE ''
    END as is_anisa
FROM projects p
LEFT JOIN departments d ON p.department_id = d.id
LEFT JOIN project_members pm ON p.id = pm.project_id
LEFT JOIN users u ON pm.user_id = u.id
WHERE p.title ILIKE '%TEST PLAN WEEK PRJK%'
ORDER BY p.created_at DESC, 
    CASE WHEN u.full_name ILIKE '%Anisa%' OR u.full_name ILIKE '%Ternava%' THEN 0 ELSE 1 END,
    u.full_name;
