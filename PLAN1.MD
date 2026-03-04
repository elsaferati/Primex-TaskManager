## Plan: Stabilize System Task Generation by 07:00 Local and Unify Timezone Behavior

### Summary
Fix the missing/late system task creation by:
1. making timezone handling explicit and consistent (single app-local timezone for scheduling/display, UTC for storage),
2. adding a deterministic “pre-generate by 07:00 local” flow,
3. repairing slot drift/backfilling last 30 days,
4. hardening operations so Celery beat/worker always run.

This keeps database datetime safety (`timestamptz` + UTC) while ensuring users and SQL sessions see local time consistently.

### Decisions Locked

- Timezone policy: **Local display, UTC storage**.
- Generation target: **today’s occurrences must exist by 07:00 local**.
- Backfill: **last 30 days** for missing system tasks.

---

## Implementation Scope

### 1) Introduce one canonical app timezone
Files:
- `backend/app/config.py`
- `backend/.env` (and `.env.example` if present)
- `backend/app/services/system_task_schedule.py`
- `backend/app/api/routers/system_tasks.py`
- `backend/app/api/routers/planners.py`
- `backend/app/api/routers/common_view.py`
- `backend/app/api/routers/reports.py` (fallback timezone literals)

Changes:
- Add `APP_TIMEZONE` setting (default `Europe/Budapest`).
- Replace hardcoded fallback timezone strings (`Europe/Tirane`, `Europe/Pristina`, `Europe/Belgrade`) with `settings.APP_TIMEZONE` where used as default/fallback.
- Keep per-template timezone support intact; only fallback/default behavior changes.

Outcome:
- “Local” is defined once and reused everywhere.

---

### 2) Guarantee system tasks are generated before 07:00 local
Files:
- `backend/app/celery_app.py`
- `backend/app/celery_tasks.py`
- `backend/app/jobs/system_tasks.py`
- `README.md` / ops docs

Changes:
- Keep existing periodic generation (every 15 min or tighten to every 5 min if acceptable).
- Add a dedicated Celery beat task:
  - `pregenerate-system-tasks-by-7am`
  - runs daily at `06:50` local (`APP_TIMEZONE`) to ensure all today tasks exist before 07:00.
- Set Celery timezone from config (`settings.APP_TIMEZONE`) so cron semantics are local.
- In pre-generate job, run `ensure_slots_initialized` + `ensure_task_instances_in_range(start=today_local, end=today_local)` and commit.

Outcome:
- Deterministic daily cutoff for task availability by 07:00 local.

---

### 3) Repair slot drift and backfill missing tasks (last 30 days)
Files:
- `backend/app/services/system_task_instances.py` (new reconcile helper)
- optional admin script: `backend/scripts/reconcile_system_task_slots.py` (or admin endpoint if preferred)

Changes:
- Add reconciliation routine:
  - For each active slot/template, evaluate occurrences in `[today_local-30d, today_local]`.
  - Detect missing task rows for expected occurrence dates.
  - If missing, move `slot.next_run_at` back to earliest missing occurrence (UTC converted), then run generator.
- Run reconciliation once manually during rollout, then optionally daily at off-peak time (e.g., 06:30 local).
- Ensure idempotency via existing unique indexes and `on_conflict_do_nothing`.

Outcome:
- Recovers missing tasks caused by advanced `next_run_at` pointers.

---

### 4) Operational hardening (root cause prevention)
Files:
- deployment/start scripts or PM2/service config
- `README.md` / runbook docs

Changes:
- Enforce that **both** processes run in production/dev where auto-generation is expected:
  - `celery worker`
  - `celery beat`
- Keep Redis enabled where Celery is used (`REDIS_ENABLED=true` for environments expecting background jobs).
- Add health checks/runbook commands:
  - verify beat heartbeats,
  - verify count of tasks generated in last hour,
  - verify next due occurrence exists for today by 07:00.

Outcome:
- Scheduler outages become visible and recoverable quickly.

---

## Public Interfaces / Config Changes
- New env/config:
  - `APP_TIMEZONE=Europe/Budapest`
- Existing behavior clarified:
  - DB stores UTC in `timestamptz`.
  - API/UI and cron scheduling use `APP_TIMEZONE` unless template-specific timezone overrides.

No breaking API contract required.

---


## Data / Migration Plan
- Data migration (safe):
  - Update `system_task_templates.timezone` from legacy defaults to `APP_TIMEZONE` **only when value is null or legacy default** (do not override explicit custom timezones).
- Run reconciliation backfill (30 days).
- Verify generated rows and slot `next_run_at` progression after backfill.

---

## Test Cases and Scenarios

### Unit tests
1. `first_run_at` with `APP_TIMEZONE=Europe/Budapest` generates expected UTC for local 07:00/09:00 cases.
2. Daily/weekly/monthly template matching around DST transitions.
3. Reconcile logic finds missing occurrence and rewinds `next_run_at` correctly.
4. Reconcile is idempotent (second run creates 0 duplicates).

### Integration tests
1. At simulated local `06:50`, pre-generate job creates all today occurrences.
2. At local `07:00`, `/system-tasks` list returns today’s tasks without lazy missing rows.
3. Backfill run recovers deleted/missing rows from last 30 days.
4. Celery beat timezone respects `APP_TIMEZONE` cron timing.

### Operational verification
1. Check Celery beat logs for daily pre-generate run timestamp (local time).
2. Query DB at 07:00 local: no active template with expected today occurrence missing.
3. Validate UI and SQL session timestamps align with local expectations.

---

## Rollout Steps
1. Deploy config/code changes with `APP_TIMEZONE`.
2. Restart API + Celery worker + Celery beat.
3. Run one-time reconciliation/backfill (30 days).
4. Validate “today by 07:00” generation in next cycle.
5. Monitor for 3 days with daily audit query.

---

## Assumptions
- PostgreSQL uses `timestamptz` columns (already true), and UTC storage is acceptable.
- “Local” means `Europe/Budapest`.
- Backfill of 30 days is acceptable for task volume/performance.
- Celery + Redis are the required background stack in your environment.
