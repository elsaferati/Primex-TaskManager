# How to Check Server Logs for 503 Error

## Option 1: PM2 Logs (Recommended)

If the backend is running with PM2, check the logs:

```powershell
# View all PM2 logs
pm2 logs

# View only backend logs
pm2 logs backend

# View last 100 lines
pm2 logs backend --lines 100

# Follow logs in real-time
pm2 logs backend --lines 0
```

## Option 2: Application Logs

If the application writes to log files, check:
- `backend/logs/` directory
- Application-specific log location
- Windows Event Viewer (if configured)

## What to Look For

When the `/api/system-tasks` endpoint is called, look for:

1. **Python Exceptions:**
   - `IntegrityError` - Database constraint violation
   - `ProgrammingError` - SQL syntax or column doesn't exist
   - `AttributeError` - Object attribute missing
   - `KeyError` - Dictionary key missing

2. **Common Error Patterns:**
   - `column "assignee_ids" does not exist`
   - `duplicate key value violates unique constraint`
   - `relation "uq_tasks_system_template_user_date" does not exist`
   - `function immutable_date(timestamp with time zone) does not exist`

3. **Stack Trace:**
   - Look for the full traceback showing where the error occurs
   - Usually in `_sync_task_for_template` or `list_system_tasks` functions

## Testing the Endpoint

You can also test the endpoint directly to see the error:

```powershell
# Using curl (replace YOUR_TOKEN with actual JWT token)
curl -X GET "https://api-flow.primexeu.com/api/system-tasks" `
  -H "Authorization: Bearer YOUR_TOKEN" `
  -H "Content-Type: application/json"

# Or using PowerShell Invoke-WebRequest
$headers = @{
    "Authorization" = "Bearer YOUR_TOKEN"
    "Content-Type" = "application/json"
}
Invoke-WebRequest -Uri "https://api-flow.primexeu.com/api/system-tasks" -Headers $headers
```

The response body will contain the actual error message.
