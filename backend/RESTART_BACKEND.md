# Restart Backend After Database Changes

After running the SQL fixes, you **MUST restart the backend server** for the changes to take effect.

## Why Restart is Needed

The backend application caches database schema information. Even though the constraint was dropped in the database, the running application may still have the old schema cached in memory.

## Steps to Restart

### On the Live Server (via SSH or Remote Desktop):

```powershell
# Stop the backend
pm2 stop backend

# Wait a few seconds
Start-Sleep -Seconds 3

# Start the backend again
pm2 start backend

# Or use restart (does both stop and start)
pm2 restart backend

# Verify it's running
pm2 status
```

### Alternative: Full Restart

If `pm2 restart` doesn't work, try:

```powershell
# Delete and recreate
pm2 delete backend
pm2 start "C:\Users\Administrator\AppData\Local\Programs\Python\Python313\python.exe" --name backend -- -m uvicorn app.main:app --host 0.0.0.0 --port 8000
pm2 save
```

## Verify the Fix

After restarting, test the endpoint:

1. Open the System Tasks page in the frontend
2. Check if tasks are loading (should see tasks, not "No scheduled tasks found")
3. Check PM2 logs: `pm2 logs backend --lines 50` - should NOT see the unique constraint error anymore

## If Still Not Working

If the error persists after restart:

1. **Verify constraint was dropped**: Run `verify_constraint_dropped.sql` in pgAdmin
2. **Check for other constraints**: There might be another constraint with a similar name
3. **Clear database connection pool**: The restart should handle this, but if not, you may need to wait a few minutes for connections to expire
