# 1H Report Slot: 16:00 Rollover + Common View Freeze

**Date:** 2026-07-06
**Status:** Updated

## Problem

1H report slots are stored per task per date (`task_one_h_report_slots`, unique on
`task_id` + `report_date`) and are set manually each day. The default behavior
maps today's slot column to the next working day after 16:00. Common View also
needs a display-only freeze option so users can still inspect or print the
selected date's saved slots when needed.

## Behavior

Default slot behavior:

- Before 16:00, today's slot reads and writes use today.
- At and after 16:00, today's slot reads and writes use the next working day.
- Past and future selected dates keep their own date.
- History is never modified or deleted. No scheduled job wipes slot rows.

Common View freeze behavior:

- `freeze_one_h_slots=true` makes Common View read the selected task date's slot
  row directly for display and print.
- The freeze option does not change slot saving and does not affect Daily Report
  or department views.

## Implementation

One shared backend helper is used by Daily Report, default Common View reads,
and the slot update endpoint:

```python
effective_slot_date(view_date: date, now: datetime | None = None) -> date
```

Used in three places:

1. **`backend/app/api/routers/reports.py`** - daily report builds
   `one_h_slot_map` by querying slots for the effective date.
2. **`backend/app/api/routers/common_view.py`** - Common View reads the effective
   date by default, or the selected task date when `freeze_one_h_slots=true`.
3. **`backend/app/api/routers/tasks.py`**
   (`update_task_one_h_report_slot`) - writes the slot under the effective date.

The frontend keeps sending the visible selected date. Common View adds a local
toolbar toggle that only changes the aggregate `/common-view` read mode.

## Testing

- Unit tests for `effective_slot_date`: before 16:00, exactly 16:00, after
  16:00, Friday, Saturday, Sunday, past dates, and future dates.
- Common View default mode reads the effective rollover date.
- Common View freeze mode reads the selected task date.
