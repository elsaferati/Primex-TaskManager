# Backend Restart and PM2 Runbook

This project uses three PM2 apps from `backend/ecosystem.config.cjs`:
- `backend-api`
- `backend-celery-worker`
- `backend-celery-beat`

## Start / Restart

```powershell
cd backend
pm2 start ecosystem.config.cjs
pm2 restart backend-api
pm2 restart backend-celery-worker
pm2 restart backend-celery-beat
pm2 save
pm2 status
```

## Required Runtime Environment

- `REDIS_ENABLED=true`
- `REDIS_URL=redis://<host>:6379/0`
- `APP_TIMEZONE=Europe/Budapest`

These are read from the environment and defaulted in `ecosystem.config.cjs`.

## Verify Daily System Task Jobs

```powershell
pm2 logs backend-celery-beat --lines 200
```

Beat must show these schedules:
- `reconcile-system-task-slots` at `06:30`
- `pregenerate-system-tasks-by-7am` at `06:50`
- `generate-system-tasks` at `07:00`

## One-Time Recovery After Deployment

Run once to recover recent missing tasks:

```powershell
cd backend
python scripts/reconcile_system_task_slots.py --days 7
```

Then verify system tasks are present for the current local day.
