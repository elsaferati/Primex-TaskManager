# Plan: persist the weekly realization state

Status: agreed, not implemented. Nothing from this plan is in the codebase yet.

## Why

The weekly realization state is never stored. `_weekly_response` rebuilds every
working day of the week from the audit log on each request, so:

- No weekly period has a FINAL snapshot, and weekly person results hold 0 or 1 rows.
- Opening the week costs roughly 5.5 s for one department and scales with the
  number of days and departments.
- What the week shows depends on who happened to open the page and when.

Measured rebuild cost, six departments, 95k task audit rows:

| Rebuild | Time |
|---|---|
| 1 department, 1 day | 1.86 s |
| 6 departments, 1 day | 3.58 s |
| 6 departments, full week | 20.94 s |

A fixed refresh cadence is therefore out: refreshing the whole week every minute
would consume 21 s of every 60 s. The state must be refreshed **only when a task
actually changes**.

## Decisions already taken

- The weekly **plan** (PLANNED snapshot) stays **manual**: managers and staff save
  it on Friday after weekly planning. No job may invent it. An automatic Monday
  capture was built and then reverted for exactly this reason.
- When the plan is missing or was captured after Monday, the page **warns** rather
  than fabricating one. This warning is already implemented.
- The **FINAL** snapshot is refreshed continuously during the week and frozen for
  good on Friday.
- The realization state is saved **on change**, not on a clock.
- Plan vs extra is already decided by the task's creation date, so it no longer
  depends on the snapshot at all. Only the day-by-day plan attribution and the
  PLANNED/FINAL diff still need snapshots.

## Steps

1. **Storage.** New table `realization_day_states`: `department_id`, `day_date`,
   `payload` (the `build_live_daily_realization` result), `computed_at`,
   `stale_since`, unique on `(department_id, day_date)`, partial index on
   `stale_since IS NOT NULL`. Migration on top of head `0124_one_h_print_snapshots`.

2. **Mark on change.** Every task mutation writes an audit row through the single
   helper `add_audit_log` in `backend/app/services/audit.py`. Mark the affected
   `(department, day)` rows stale from there: the local day of the event, plus any
   due-date day present in `before`/`after`. A stale mark is a cheap upsert; no
   recomputation happens on the user's request path, since 1.86 s is far too slow
   to do inline.

3. **Recompute what is marked.** A worker processes only rows with `stale_since`
   set. When nothing changed it does no work at all. It must skip periods that
   `require_recalculable` rejects, because a period under manager review or locked
   must never be overwritten.

4. **Read from storage.** `_weekly_response` loads the stored days for the week
   instead of calling `build_live_daily_realization` five times. If a day is
   missing or still stale, compute it inline and store it, so the page can never
   show stale numbers: worst case equals today's behaviour, common case is fast.
   `_daily_response` reads the same store.

5. **FINAL snapshot.** Refresh it from the stored state during the week and freeze
   it on Friday.

## Loose end worth fixing on the way

Two realization jobs appear not to run, even though Celery Beat itself is healthy
(the 07:00 daily baseline fires every working day, 55 snapshots recorded).

- `generate-daily-realization-snapshots`, Mon–Fri 16:20: daily periods for the week
  of 14–18/09 were created at scattered morning times (06:34, 07:20, 08:23, 09:33,
  11:37), which is the signature of the lazy path that runs when somebody opens the
  page, not of a 16:20 job.
- `generate-weekly-realization-results`, Friday 17:25: it has never produced a
  FINAL snapshot.

Unlike the other beat entries for realization, neither crontab passes
`nowfun=_realization_now`, so their timezone handling differs from the baseline
job that does work. Worth checking first.

## Open question

Which day a task change belongs to is not always one day. An event that moves a due
date touches both the old and the new day, and a change made today about yesterday
touches yesterday. Step 2 handles the due-date case explicitly; confirm there is no
further case before relying on the marks.
