"""Effective-date logic for 1H report slots.

The slot workday ends at 16:00 in the app timezone. From 16:00 onward, the
slot column for today targets the next working day. Other selected dates keep
their own date.
"""

from datetime import date, datetime, time, timedelta
from zoneinfo import ZoneInfo

SLOT_ROLLOVER_TIME = time(16, 0)


def _next_working_day(day: date) -> date:
    next_day = day + timedelta(days=1)
    while next_day.weekday() >= 5:
        next_day += timedelta(days=1)
    return next_day


def effective_slot_date(view_date: date, now: datetime | None = None) -> date:
    if now is None:
        from app.config import settings

        now = datetime.now(ZoneInfo(settings.APP_TIMEZONE))
    current = now
    if view_date != current.date():
        return view_date
    if current.time() < SLOT_ROLLOVER_TIME:
        return view_date
    return _next_working_day(view_date)
