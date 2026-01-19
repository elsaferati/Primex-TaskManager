-- ============================================
-- QUERIES TO CHECK PROJECT DATA IN DATABASE
-- ============================================

-- 1. Find the project by title (partial match)
SELECT 
    p.id,
    p.title,
    p.due_date,
    p.start_date,
    p.created_at,
    p.completed_at,
    p.department_id,
    p.is_template,
    d.name as department_name
FROM projects p
LEFT JOIN departments d ON p.department_id = d.id
WHERE p.title ILIKE '%TEST PLAN WEEK PRJK%'
   OR p.title ILIKE '%TEST PLAN%'
ORDER BY p.created_at DESC;

-- 2. Check if Anisa Ternava is a member of the project
-- First, find Anisa's user ID
SELECT 
    u.id as user_id,
    u.full_name,
    u.email,
    u.department_id,
    d.name as department_name
FROM users u
LEFT JOIN departments d ON u.department_id = d.id
WHERE u.full_name ILIKE '%Anisa%'
   OR u.full_name ILIKE '%Ternava%';

-- 3. Check project members for the specific project
-- Replace 'PROJECT_ID_HERE' with the actual project ID from query #1
SELECT 
    pm.project_id,
    pm.user_id,
    u.full_name as user_name,
    u.email,
    p.title as project_title,
    p.due_date as project_due_date
FROM project_members pm
JOIN users u ON pm.user_id = u.id
JOIN projects p ON pm.project_id = p.id
WHERE p.title ILIKE '%TEST PLAN WEEK PRJK%'
   OR p.title ILIKE '%TEST PLAN%'
ORDER BY p.created_at DESC, u.full_name;

-- 4. Comprehensive check: Project + Members + Department in one query
SELECT 
    p.id as project_id,
    p.title as project_title,
    p.due_date,
    p.start_date,
    p.created_at,
    p.completed_at,
    p.is_template,
    d.name as department_name,
    d.id as department_id,
    COUNT(pm.user_id) as member_count,
    STRING_AGG(u.full_name, ', ' ORDER BY u.full_name) as member_names,
    STRING_AGG(u.id::text, ', ' ORDER BY u.full_name) as member_ids
FROM projects p
LEFT JOIN departments d ON p.department_id = d.id
LEFT JOIN project_members pm ON p.id = pm.project_id
LEFT JOIN users u ON pm.user_id = u.id
WHERE p.title ILIKE '%TEST PLAN WEEK PRJK%'
   OR p.title ILIKE '%TEST PLAN%'
GROUP BY p.id, p.title, p.due_date, p.start_date, p.created_at, p.completed_at, p.is_template, d.name, d.id
ORDER BY p.created_at DESC;

-- 5. Check if Anisa is specifically a member (replace USER_ID with Anisa's ID from query #2)
-- Replace 'PROJECT_ID_HERE' and 'USER_ID_HERE' with actual IDs
SELECT 
    pm.project_id,
    pm.user_id,
    p.title as project_title,
    p.due_date,
    u.full_name as user_name,
    CASE 
        WHEN pm.user_id IS NOT NULL THEN 'YES - Anisa IS a member'
        ELSE 'NO - Anisa is NOT a member'
    END as membership_status
FROM projects p
LEFT JOIN project_members pm ON p.id = pm.project_id AND pm.user_id = 'USER_ID_HERE'  -- Replace with Anisa's user_id
LEFT JOIN users u ON pm.user_id = u.id
WHERE p.title ILIKE '%TEST PLAN WEEK PRJK%'
   OR p.title ILIKE '%TEST PLAN%';

-- 6. Check all projects with due dates in Graphic Design department
SELECT 
    p.id,
    p.title,
    p.due_date,
    p.start_date,
    p.created_at,
    p.completed_at,
    d.name as department_name,
    COUNT(pm.user_id) as member_count
FROM projects p
JOIN departments d ON p.department_id = d.id
LEFT JOIN project_members pm ON p.id = pm.project_id
WHERE d.name = 'Graphic Design'
  AND p.due_date IS NOT NULL
  AND p.completed_at IS NULL
  AND p.is_template = false
GROUP BY p.id, p.title, p.due_date, p.start_date, p.created_at, p.completed_at, d.name
ORDER BY p.due_date DESC, p.created_at DESC;

-- 7. Check projects that should appear in weekly planner for Anisa
-- This simulates what the backend code should find
-- Replace 'ANISA_USER_ID' with Anisa's actual user ID
SELECT 
    p.id,
    p.title,
    p.due_date,
    p.start_date,
    p.created_at,
    p.completed_at,
    d.name as department_name,
    u.full_name as user_name,
    CASE 
        WHEN p.due_date < CURRENT_DATE THEN 'OVERDUE'
        WHEN p.due_date >= CURRENT_DATE THEN 'UPCOMING'
        ELSE 'NO DUE DATE'
    END as status
FROM projects p
JOIN departments d ON p.department_id = d.id
JOIN project_members pm ON p.id = pm.project_id
JOIN users u ON pm.user_id = u.id
WHERE u.id = 'ANISA_USER_ID'  -- Replace with Anisa's user_id
  AND p.due_date IS NOT NULL
  AND p.completed_at IS NULL
  AND p.is_template = false
  AND d.name = 'Graphic Design'
ORDER BY p.due_date;

-- ============================================
-- QUICK CHECK: Run this first to get IDs
-- ============================================
-- Get Anisa's user ID
SELECT id, full_name, email, department_id 
FROM users 
WHERE full_name ILIKE '%Anisa%' OR full_name ILIKE '%Ternava%';

-- Get the project ID
SELECT id, title, due_date, department_id, created_at
FROM projects 
WHERE title ILIKE '%TEST PLAN WEEK PRJK%'
ORDER BY created_at DESC 
LIMIT 1;
