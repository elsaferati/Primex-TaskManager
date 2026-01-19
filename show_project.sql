-- ============================================
-- QUERY TO SHOW THE PROJECT AND CHECK MEMBERSHIP
-- ============================================
-- Replace '4dc1eda6-191b-426c-b805-6e5fbb310e...' with Anisa's actual user_id from the previous query

-- Option 1: Show project with all members
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
    u.email as member_email,
    CASE 
        WHEN pm.user_id IS NOT NULL THEN 'YES - Member'
        ELSE 'NO - Not a member'
    END as membership_status
FROM projects p
LEFT JOIN departments d ON p.department_id = d.id
LEFT JOIN project_members pm ON p.id = pm.project_id
LEFT JOIN users u ON pm.user_id = u.id
WHERE p.title ILIKE '%TEST PLAN WEEK PRJK%'
   OR p.title ILIKE '%TEST PLAN%'
ORDER BY p.created_at DESC, u.full_name;

-- Option 2: Check if Anisa is specifically a member of this project
-- Replace '4dc1eda6-191b-426c-b805-6e5fbb310e...' with Anisa's user_id
SELECT 
    p.id as project_id,
    p.title,
    p.due_date,
    p.start_date,
    p.created_at,
    p.completed_at,
    p.is_template,
    d.name as department_name,
    CASE 
        WHEN pm.user_id IS NOT NULL THEN 'YES - Anisa IS a member'
        ELSE 'NO - Anisa is NOT a member'
    END as anisa_membership,
    pm.user_id as anisa_user_id,
    u.full_name as anisa_name
FROM projects p
LEFT JOIN departments d ON p.department_id = d.id
LEFT JOIN project_members pm ON p.id = pm.project_id 
    AND pm.user_id = '4dc1eda6-191b-426c-b805-6e5fbb310e...'  -- Replace with Anisa's user_id
LEFT JOIN users u ON pm.user_id = u.id
WHERE p.title ILIKE '%TEST PLAN WEEK PRJK%'
   OR p.title ILIKE '%TEST PLAN%'
ORDER BY p.created_at DESC;

-- Option 3: Comprehensive check - Project details + all members + Anisa's status
SELECT 
    p.id as project_id,
    p.title,
    p.due_date,
    DATE(p.due_date) as due_date_only,
    p.start_date,
    DATE(p.start_date) as start_date_only,
    p.created_at,
    DATE(p.created_at) as created_date_only,
    p.completed_at,
    p.is_template,
    d.name as department_name,
    d.id as department_id,
    COUNT(DISTINCT pm_all.user_id) as total_members,
    STRING_AGG(DISTINCT u_all.full_name, ', ' ORDER BY u_all.full_name) as all_member_names,
    CASE 
        WHEN pm_anisa.user_id IS NOT NULL THEN 'YES - Anisa IS a member'
        ELSE 'NO - Anisa is NOT a member'
    END as anisa_is_member,
    pm_anisa.user_id as anisa_user_id
FROM projects p
LEFT JOIN departments d ON p.department_id = d.id
LEFT JOIN project_members pm_all ON p.id = pm_all.project_id
LEFT JOIN users u_all ON pm_all.user_id = u_all.id
LEFT JOIN project_members pm_anisa ON p.id = pm_anisa.project_id 
    AND pm_anisa.user_id = '4dc1eda6-191b-426c-b805-6e5fbb310e...'  -- Replace with Anisa's user_id
WHERE p.title ILIKE '%TEST PLAN WEEK PRJK%'
   OR p.title ILIKE '%TEST PLAN%'
GROUP BY p.id, p.title, p.due_date, p.start_date, p.created_at, p.completed_at, p.is_template, 
         d.name, d.id, pm_anisa.user_id
ORDER BY p.created_at DESC;

-- Option 4: Simple - Just show the project with key info
SELECT 
    p.id,
    p.title,
    p.due_date,
    p.start_date,
    p.created_at,
    p.completed_at,
    p.is_template,
    d.name as department,
    (SELECT COUNT(*) FROM project_members WHERE project_id = p.id) as member_count
FROM projects p
LEFT JOIN departments d ON p.department_id = d.id
WHERE p.title ILIKE '%TEST PLAN WEEK PRJK%'
ORDER BY p.created_at DESC
LIMIT 1;
