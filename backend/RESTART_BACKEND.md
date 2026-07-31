# Backend Restart and PM2 Runbook

This project uses the API, Celery, MCP, and report processes from
`backend/ecosystem.config.cjs`. The Celery process names are:
- `celery_worker`
- `celery_beat`

## Start / Restart

```powershell
cd backend
pm2 start ecosystem.config.cjs
pm2 restart primex-backend
pm2 restart celery_worker
pm2 restart celery_beat
pm2 save
pm2 status
```

After deployment, verify backend-only planner routes with an API request before testing them from the UI. The deploy should ensure the current backend process owns both API ports used by the environment before the UI is tested.

## Required Runtime Environment

- `REDIS_ENABLED=true`
- `REDIS_URL=redis://<host>:6379/0`
- `APP_TIMEZONE=Europe/Budapest`
- `WEEKLY_PLANNING_AUDIT_TIMEZONE=Europe/Tirane`
- `WEEKLY_PLANNING_AUDIT_ENABLED=true`
- `REPORT_STORAGE_DIR=<persistent report directory>`

These are read from the environment and defaulted in `ecosystem.config.cjs`.

## Verify Celery Jobs

```powershell
pm2 logs celery_beat --lines 200
```

Beat must show these schedules:
- `reconcile-system-task-slots` at `06:30`
- `pregenerate-system-tasks-by-7am` at `06:50`
- `generate-system-tasks` at `07:00`
- `weekly-planning-audit-0900` through `weekly-planning-audit-1100` on Friday

## One-Time Recovery After Deployment

Run once to recover recent missing tasks:

```powershell
cd backend
python scripts/reconcile_system_task_slots.py --days 7
```

Then verify system tasks are present for the current local day.
# Redeploy Notes

- 2026-07-06: Trigger backend redeploy so production API serves the 1H report slot save endpoint and schema.
