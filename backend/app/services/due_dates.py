from __future__ import annotations

from dataclasses import dataclass
from datetime import date, datetime, time, timedelta
from typing import Union
from zoneinfo import ZoneInfo
import calendar

DateLike = Union[date, datetime, str]


@dataclass(frozen=True)
class MonthlyDueDateResult:
    due_date: date

    def iso(self) -> str:
        return self.due_date.isoformat()


def _parse_reference_date(reference_date: DateLike, timezone: str) -> date:
    if isinstance(reference_date, datetime):
        if reference_date.tzinfo is None:
            aware = reference_date.replace(tzinfo=ZoneInfo(timezone))
        else:
            aware = reference_date.astimezone(ZoneInfo(timezone))
        return aware.date()
    if isinstance(reference_date, date):
        return reference_date
    if isinstance(reference_date, str):
        parsed = datetime.fromisoformat(reference_date)
        if parsed.tzinfo is None:
            parsed = parsed.replace(tzinfo=ZoneInfo(timezone))
        else:
            parsed = parsed.astimezone(ZoneInfo(timezone))
        return parsed.date()
    raise TypeError("reference_date must be a date, datetime, or ISO string")


def getMonthlyDueDate(reference_date: DateLike, timezone: str) -> date:
    """
    Return the last-day-of-month due date in the provided timezone.

    Rules:
    - Due date is the last calendar day of the month of reference_date.
    - If that day is Sunday, shift to Friday (minus 2 days).

    Usage:
        due_date = getMonthlyDueDate("2024-02-10", "UTC")
        print(due_date.isoformat())  # 2024-02-29
    """
    local_date = _parse_reference_date(reference_date, timezone)
    year = local_date.year
    month = local_date.month
    last_day = calendar.monthrange(year, month)[1]
    due_date = date(year, month, last_day)

    if due_date.weekday() == 6:  # Sunday
        due_date -= timedelta(days=2)

    return due_date


def getMonthlyDueDateVanilla(reference_date: date) -> date:
    """
    Vanilla implementation without timezone handling.

    Use this when you already have a local date and do not need TZ conversion.
    """
    year = reference_date.year
    month = reference_date.month
    last_day = calendar.monthrange(year, month)[1]
    due_date = date(year, month, last_day)

    if due_date.weekday() == 6:  # Sunday
        due_date -= timedelta(days=2)

    return due_date
