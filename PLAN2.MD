## Stabilize Daily System Task Creation (07:00 Local, Slots -> `tasks` Rows)

### Summary
Current behavior explains your issue:
- Generation into `tasks` is not done from normal list reads; it is mainly done by Celery jobs and template sync flows.
- `system_task_template_assignee_slots` can exist with `next_run_at`, but if worker/beat is not running, those slots never materialize into `tasks`.
- In this repo, [`backend/.env`](C:/Users/Admin/OneDrive/Desktop/Primex-platforma/Primex-TaskManager/backend/.env) currently has `REDIS_ENABLED=false`, which is a strong indicator background processing may not be active as expected.

Chosen decisions:
- Trigger mode: `Dual Safety` (Celery + API fallback).
- Schedule: `06:50 + 07:00` local.
- Backfill: `7 days`.
- Process manager: `PM2`.

### Implementation Plan

### 1) Add deterministic morning generation + reconciliation jobs
Files:
- [`backend/app/jobs/system_tasks.py`](C:/Users/Admin/OneDrive/Desktop/Primex-platforma/Primex-TaskManager/backend/app/jobs/system_tasks.py)
- [`backend/app/celery_tasks.py`](C:/Users/Admin/OneDrive/Desktop/Primex-platforma/Primex-TaskManager/backend/app/celery_tasks.py)
- [`backend/app/celery_app.py`](C:/Users/Admin/OneDrive/Desktop/Primex-platforma/Primex-TaskManager/backend/app/celery_app.py)

Changes:
1. Add async job `pregenerate_system_tasks_today()`:
- `ensure_slots_initialized(db)`
- compute local `today` in `settings.APP_TIMEZONE`
- `ensure_task_instances_in_range(start=today, end=today)`
- commit and return created count

2. Add async job `reconcile_system_task_slots_daily()`:
- `ensure_slots_initialized(db)`
- `reconcile_system_task_slots(db, lookback_days=7)`
- commit and return result

3. Expose both as Celery tasks in [`celery_tasks.py`](C:/Users/Admin/OneDrive/Desktop/Primex-platforma/Primex-TaskManager/backend/app/celery_tasks.py).

4. Update beat schedule in [`celery_app.py`](C:/Users/Admin/OneDrive/Desktop/Primex-platforma/Primex-TaskManager/backend/app/celery_app.py):
- `reconcile-system-task-slots`: `06:30`
- `pregenerate-system-tasks-by-7am`: `06:50`
- keep `generate-system-tasks`: `07:00`
- keep timezone = `settings.APP_TIMEZONE`

### 2) Add API fallback safety for today’s missing rows
Files:
- [`backend/app/services/system_task_instances.py`](C:/Users/Admin/OneDrive/Desktop/Primex-platforma/Primex-TaskManager/backend/app/services/system_task_instances.py)
- [`backend/app/api/routers/system_tasks.py`](C:/Users/Admin/OneDrive/Desktop/Primex-platforma/Primex-TaskManager/backend/app/api/routers/system_tasks.py)

Changes:
1. Add a lightweight helper in `system_task_instances.py`:
- check if any active slot is due (`next_run_at <= now_utc`) for active templates
- if yes, generate/commit missing instances for current window

2. In `list_system_tasks`, before read-querying tasks:
- run fallback only when `occurrence_date` is not provided or equals local today
- call fallback helper (best-effort)
- keep behavior idempotent; rely on existing unique constraints

This gives “self-healing” even if beat/worker missed a run.

### 3) PM2 process hardening (API + worker + beat)
Files:
- new [`backend/ecosystem.config.cjs`](C:/Users/Admin/OneDrive/Desktop/Primex-platforma/Primex-TaskManager/backend/ecosystem.config.cjs)
- docs updates in [`README.md`](C:/Users/Admin/OneDrive/Desktop/Primex-platforma/Primex-TaskManager/README.md) and [`backend/RESTART_BACKEND.md`](C:/Users/Admin/OneDrive/Desktop/Primex-platforma/Primex-TaskManager/backend/RESTART_BACKEND.md)

Changes:
1. Define 3 PM2 apps:
- `backend-api` (uvicorn)
- `backend-celery-worker`
- `backend-celery-beat`

2. Ensure env for runtime:
- `REDIS_ENABLED=true`
- valid `REDIS_URL`
- `APP_TIMEZONE=Europe/Budapest`

3. Document commands:
- `pm2 start ecosystem.config.cjs`
- `pm2 save`
- `pm2 status`
- `pm2 logs backend-celery-beat --lines 200`

### 4) One-time recovery for already-missed tasks
Files:
- existing [`backend/scripts/reconcile_system_task_slots.py`](C:/Users/Admin/OneDrive/Desktop/Primex-platforma/Primex-TaskManager/backend/scripts/reconcile_system_task_slots.py)

Runbook:
1. Execute once after deployment:
- `python scripts/reconcile_system_task_slots.py --days 7`

2. Verify:
- no active slots stuck in past without matching `tasks` row for current local day
- 06:50 and 07:00 jobs visible in beat logs

### Public APIs / Interfaces / Types
- No response schema changes required.
- Behavioral change: `GET /api/system-tasks` may perform best-effort generation for today (write-on-read fallback).
- New operational interfaces: additional Celery task names and PM2 apps.
- Config expectation change: environments expecting daily auto-generation must run with Redis/Celery active.

### Test Cases and Scenarios

1. Unit tests
- `celery_app` includes `06:30`, `06:50`, `07:00` schedule entries.
- fallback helper does nothing when no due slots, runs generator when due slots exist.
- fallback in `list_system_tasks` runs only for today/default date.

2. Integration tests
- with due slots and no preexisting task rows, `GET /api/system-tasks` creates today rows.
- pre-generate job at 06:50 creates today rows before 07:00.
- reconcile job backfills missing rows for last 7 days and is idempotent on second run.

3. Operational acceptance
- stop beat temporarily, create a due slot, call `/api/system-tasks`, confirm task row appears.
- restart beat/worker, confirm next day rows are already present by 07:00 local.

### Assumptions and Defaults
- Local business timezone remains `Europe/Budapest`.
- Missing historical generation recovery is exactly 7 days.
- PM2 is the supervisor for API + Celery worker + Celery beat.
- Existing unique indexes (`origin_run_at`/slot-based) remain the idempotency guard; no new DB migration is required for this fix.
