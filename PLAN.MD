**Title**
System Tasks Refactor With Duration, Weekend Policy, and Absence-Aware Assignment

**Summary**
1. Replace `system_task_occurrences` usage with real `tasks` instances generated per assignee slot, using concurrency-safe `next_run_at` scheduling and immutable `origin_run_at`.
2. Add `duration_days` and weekend-adjusted due dates, plus absence-aware assignee resolution (primary → ZV1 → ZV2, with ZV2 fallback).
3. Keep existing endpoints but rewire them to read/write `tasks`, with back-compat input for assignee slots.

**Plan**
1. **Database schema changes (Alembic migration)**
   1. Add to `system_task_templates`: `timezone` (string, default `Europe/Tirane`), `due_time` (time, default `09:00`), `lookahead` (int, default `14`), `interval` (int, default `1`), `apply_from` (timestamptz, nullable), `duration_days` (int, default `1`).
   2. Create `system_task_template_assignee_slots` with `id` UUID PK, `template_id` FK, `primary_user_id`, `zv1_user_id`, `zv2_user_id`, `next_run_at` timestamptz, `is_active` boolean default true, `created_at`, `updated_at`; indexes `idx_slots_template_primary (template_id, primary_user_id)` and `idx_slots_next_run_at (next_run_at)`.
   3. Add to `tasks`: `origin_run_at` timestamptz (nullable), `system_task_slot_id` UUID FK; add partial unique index `UNIQUE(system_template_origin_id, system_task_slot_id, origin_run_at) WHERE origin_run_at IS NOT NULL`.
   4. Data backfill in migration: for each existing template, create one slot per `assignee_ids` (or `default_assignee_id`) with `primary_user_id` set and `next_run_at` computed via `first_run_at` using template defaults; this preserves current behavior without requiring manual setup.

2. **Model and schema updates**
   1. Add new model `SystemTaskTemplateAssigneeSlot` and update `SystemTaskTemplate` with new scheduling fields and `duration_days`.
   2. Update `Task` model with `origin_run_at` and `system_task_slot_id`.
   3. Update Pydantic schemas:
      1. `SystemTaskTemplateCreate/Update/Out` include `timezone`, `due_time`, `lookahead`, `interval`, `apply_from`, `duration_days`.
      2. Add `assignee_slots` input/output (array of `{id?, primary_user_id, zv1_user_id?, zv2_user_id?, is_active?}`).
      3. Keep `assignee_ids` for back-compat; if `assignee_slots` is omitted, create slots from `assignee_ids`/`default_assignee_id`.

3. **Scheduling utilities (`system_task_schedule.py`)**
   1. Add helpers:
      1. `template_tz(template)` returns ZoneInfo, fallback `Europe/Tirane`.
      2. `template_due_time(template)` returns `due_time` or default `09:00`.
      3. `first_run_at(template, from_dt)` returns first occurrence ≥ `from_dt` in template TZ, applying daily policy (if now > today@due_time, start tomorrow@due_time).
      4. `next_occurrence(template, current_dt)` advances according to frequency and `interval` for DAILY/WEEKLY/MONTHLY/YEARLY; THREE/SIX_MONTHS unchanged.
      5. Monthly fallback: if `day_of_month` > last day of month, use last day.
   2. Interval anchoring: use `apply_from` if set; else use template `created_at` (in template TZ) to compute the cycle for DAILY/WEEKLY/MONTHLY/YEARLY.
   
4. **Generator service (`system_task_instances.py`)**
   1. Implement `generate_system_task_instances(now_utc)`:
      1. Select active slots joined with active templates where `next_run_at <= now_utc + max_lookahead`, with `FOR UPDATE SKIP LOCKED`.
      2. For each slot, compute template-specific `lookahead_end_utc` and loop while `next_run_at <= lookahead_end_utc`.
      3. Compute `origin_run_at = next_run_at` (UTC); compute local `start_date` in template TZ.
      4. Compute `due_date_local = start_date_local + (duration_days - 1)` days at due_time, then apply weekend policy: if Saturday/Sunday, move to previous Friday, same local time.
      5. Convert `due_date_local` to UTC.
      6. Resolve assignee via absence logic (below), insert `Task` with `origin_run_at`, `system_task_slot_id`, `system_template_origin_id`, `start_date`, `due_date`, `status=TODO`, and add `TaskAssignee`.
      7. Advance `next_run_at` using `next_occurrence`, persist slot update once per slot.
   2. Implement `ensure_task_instances_in_range(start, end)` that calls generator with an adjusted lookahead window to cover the range.

5. **Absence-aware assignment**
   1. Implement `resolve_assignee(primary, zv1, zv2, task_start_date, task_due_date)`:
      1. If `primary` not absent → assign primary.
      2. Else if `zv1` not absent → assign zv1.
      3. Else if `zv2` exists → assign zv2.
      4. Else fallback to `primary`.
   2. Absence detection:
      1. Use `CommonEntry` where `category in {absences, annual_leave}` and `approval_status = approved`.
      2. Determine entry user as `assigned_to_user_id` or `created_by_user_id` (same as current UI).
      3. Parse annual leave ranges using existing helpers; treat `[ALL_USERS]` leave as global absence.
      4. For date-only policy, consider user absent if any entry date range overlaps `[start_date, due_date]` (local dates).

6. **Router/service rewires to `tasks`**
   1. `system_tasks`, `reports`, `planners`, `exports`, `tasks` router:
      1. Replace `system_task_occurrences` reads with `tasks` filtered by `origin_run_at`.
      2. Before list/report, call `ensure_task_instances_in_range` for requested range.
      3. For date filtering, use SQL `timezone(template.timezone, tasks.origin_run_at)` cast to date to match requested day in template TZ.
      4. Overdue: `origin_run_at` date (template TZ) < requested day AND `status != DONE`.
      5. Status update: write `tasks.status`; when DONE, set `completed_at`, otherwise clear `completed_at`.
      6. Reschedule: only update `tasks.due_date`; never change `origin_run_at`.
   2. Keep existing endpoint shapes; add new fields only where needed (see API changes).

7. **Legacy cleanup scripts**
   1. Add manual SQL script or documented steps (no migration execution):
      1. Archive legacy system tasks into `tasks_system_legacy_archive` and delete from `tasks` where `system_template_origin_id IS NOT NULL AND origin_run_at IS NULL`; delete corresponding `task_assignees`.
      2. `TRUNCATE system_task_occurrences` and `system_task_occurrence_overrides`.

8. **Tests**
   1. Unit tests:
      1. `next_occurrence` with `interval` for DAILY/WEEKLY/MONTHLY/YEARLY.
      2. Monthly fallback to last day.
      3. Daily policy: if now > due_time, first_run_at is tomorrow.
      4. Duration logic: `duration_days=1` stays same day; `duration_days=4` yields `start + 3 days`.
      5. Weekend policy: due_date on Sat/Sun moves to previous Friday.
      6. Absence resolution: primary absent → ZV1, ZV1 absent → ZV2, all absent → ZV2.
   2. Integration tests:
      1. Concurrency: generator with `SKIP LOCKED` and unique index does not double-create tasks.
      2. List by date uses `origin_run_at` in template TZ.
      3. Overdue tasks do not block future generation.

**Public API / Interface Changes**
1. `SystemTaskTemplateCreate/Update/Out` adds `timezone`, `due_time`, `lookahead`, `interval`, `apply_from`, `duration_days`, and `assignee_slots`.
2. `TaskOut` adds `origin_run_at` and `system_task_slot_id`.
3. `SystemTaskOut` keeps existing fields but switches occurrence data source to `tasks`; `occurrence_date` and `next_occurrence_date` are derived from `origin_run_at` and schedule.

**Assumptions and Defaults**
1. `duration_days` is inclusive: `due_date = origin_run_at + (duration_days - 1)` days at due_time.
2. `due_time` default is `09:00` if missing.
3. Absence detection uses approved `CommonEntry` only; date-only overlap.
4. Weekend policy always shifts due_date to previous Friday, even if it becomes earlier than `start_date`.
5. Absence dates are treated in template timezone (default `Europe/Tirane`).
