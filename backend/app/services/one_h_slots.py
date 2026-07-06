"""Effective-date logic for 1H report slots.

The slot workday ends at 16:00 (app timezone): from 16:00 onward, the slot
column for "today" targets the next working day so employees plan tomorrow's
slots. Past and future dates are untouched, so history stays per-date.
"""

from datetime import date, datetime, time, timedelta
from zoneinfo import ZoneInfo

SLOT_ROLLOVER_TIME = time(16, 0)


def _next_working_day(day: date) -> date:
    result = day + timedelta(days=1)
    while result.weekday() >= 5:  # Saturday=5, Sunday=6
        result += timedelta(days=1)
    return result


def effective_slot_date(view_date: date, now: datetime | None = None) -> date:
    if now is None:
        from app.config import settings

        now = datetime.now(ZoneInfo(settings.APP_TIMEZONE))
    if view_date != now.date():
        return view_date
    if now.time() < SLOT_ROLLOVER_TIME:
        return view_date
    return _next_working_day(view_date)
