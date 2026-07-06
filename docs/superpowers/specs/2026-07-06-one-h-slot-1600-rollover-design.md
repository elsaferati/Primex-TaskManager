# 1H Report Slot: 16:00 Daily Rollover

**Date:** 2026-07-06
**Status:** Approved

## Problem

1H report slots are stored per task per date (`task_one_h_report_slots`, unique on
`task_id` + `report_date`) and are set manually each day. Today the slot column
implicitly resets at midnight: a new date has no slot rows, so the column starts
empty. The business rule is that the workday ends at 16:00 — after 16:00,
employees should be planning the **next working day's** slots, not still looking
at today's.

## Behavior

The slot column operates on an **effective slot date**:

- Before 16:00 (app timezone, `APP_TIMEZONE` = Europe/Budapest), viewing/editing
  today's slot column targets **today**.
- From 16:00 onward (16:00:00 inclusive), viewing/editing today's slot column
  targets the **next working day**: Mon–Thu → tomorrow; Fri (and weekend days)
  after 16:00 → next Monday.
- Past dates always show their stored slots unchanged. History is never
  modified or deleted. No scheduled job; nothing is wiped.

## Implementation

One pure helper on the backend:

```python
effective_slot_date(view_date: date, now: datetime) -> date
```

Returns `view_date` unless `view_date == now.date()` (app timezone) and
`now.time() >= 16:00`, in which case it returns the next working day
(skipping Saturday/Sunday).

Used in three places:

1. **`backend/app/api/routers/reports.py`** — daily report builds
   `one_h_slot_map` by querying slots for the effective date instead of the
   requested date.
2. **`backend/app/api/routers/common_view.py`** — the per-task-date slot lookup
   maps today's column through the effective date.
3. **`backend/app/api/routers/tasks.py`**
   (`update_task_one_h_report_slot`) — if the client sends today's date, the
   server converts to the effective date before saving and before enforcing the
   max-2-tasks-per-employee-per-slot rule. Explicit past/future dates are
   honored as-is.

The frontend needs no changes; it keeps sending the visible date.

## Testing

- Unit tests for `effective_slot_date`: before/after 16:00, exactly 16:00,
  Friday→Monday, Saturday/Sunday after 16:00 → Monday, past and future dates
  unaffected.
- Endpoint test: writing a slot "today" after 16:00 stores it under the next
  working day, and the 2-task limit is checked against that day.
