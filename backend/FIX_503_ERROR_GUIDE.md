# Fix Live Server System Tasks 503 Error - Implementation Guide

## What Was Done

1. ✅ **Restored Migration Files**
   - Created `fc9a8516095c_merge_heads.py` - Merges divergent migration heads
   - Created `57e9452f55a2_add_assignee_ids_and_update_tasks_.py` - Main migration with idempotent checks
   - Both migrations are safe to run even if changes already exist

2. ✅ **Created Investigation Tools**
   - `verify_database_state.sql` - SQL queries to check database state
   - `CHECK_SERVER_LOGS.md` - Guide for checking server logs

## Next Steps

### Step 1: Verify Database State on Live Server

Run the queries from `verify_database_state.sql` in pgAdmin on your live server:

**Expected Results:**
- ✅ `assignee_ids` column exists (you confirmed this)
- ❓ Unique index `uq_tasks_system_template_user_date` - **Check if this exists**
- ❓ Old constraint `uq_tasks_system_template_origin_id` - **Should NOT exist**
- ❓ Function `immutable_date()` - **Check if this exists**

### Step 2: Check Server Logs

Follow the guide in `CHECK_SERVER_LOGS.md` to check PM2 logs:

```powershell
pm2 logs backend --lines 100
```

Look for the actual error when `/api/system-tasks` is called.

### Step 3: Apply Fix Based on Findings

#### Scenario A: Missing Unique Index
If `uq_tasks_system_template_user_date` doesn't exist:

**Option 1 (Recommended):** Run the migration on the server:
```powershell
cd backend
python -m alembic upgrade head
```

**Option 2:** Create it manually:
```sql
CREATE OR REPLACE FUNCTION immutable_date(timestamp with time zone)
RETURNS date
LANGUAGE sql
IMMUTABLE
AS $$
    SELECT $1::date;
$$;

CREATE UNIQUE INDEX uq_tasks_system_template_user_date 
ON tasks (system_template_origin_id, assigned_to, immutable_date(start_date))
WHERE system_template_origin_id IS NOT NULL;
```

#### Scenario B: Old Constraint Still Exists
If `uq_tasks_system_template_origin_id` constraint exists:

**Option 1 (Recommended):** Run the migration (it will drop it):
```powershell
cd backend
python -m alembic upgrade head
```

**Option 2:** Drop it manually:
```sql
ALTER TABLE tasks DROP CONSTRAINT IF EXISTS uq_tasks_system_template_origin_id;
```

#### Scenario C: Code Error
If logs show a Python exception (not a database error):
- The error message will indicate what's wrong
- Common issues:
  - Missing error handling for NULL arrays
  - Incorrect query syntax
  - Missing imports

#### Scenario D: Duplicate Tasks
If the verification query shows duplicate tasks:
- The migration will clean them up automatically
- Or run the cleanup manually:
```sql
DELETE FROM tasks t1
WHERE t1.system_template_origin_id IS NOT NULL
AND EXISTS (
    SELECT 1 FROM tasks t2
    WHERE t2.system_template_origin_id = t1.system_template_origin_id
    AND t2.assigned_to = t1.assigned_to
    AND DATE(t2.start_date) = DATE(t1.start_date)
    AND t2.id > t1.id
);
```

### Step 4: Deploy Migration to Main Branch

Once you've identified and fixed the issue:

1. Commit the migration files:
```powershell
git add backend/alembic/versions/fc9a8516095c_merge_heads.py
git add backend/alembic/versions/57e9452f55a2_add_assignee_ids_and_update_tasks_.py
git commit -m "Restore migration files for assignee_ids feature"
```

2. Push to main branch (migration will run automatically via deploy.yml)

## Important Notes

- The migration is **idempotent** - it's safe to run multiple times
- It checks if objects exist before creating/dropping them
- The migration will skip steps that are already completed
- After fixing, restart the backend: `pm2 restart backend`

## Verification

After applying the fix, verify:
1. ✅ System tasks endpoint returns data (no 503 error)
2. ✅ Frontend displays system tasks correctly
3. ✅ No errors in server logs
4. ✅ Database has all required objects (index, function, constraints)
