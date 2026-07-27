from __future__ import annotations

import calendar
from datetime import date, datetime, time, timedelta, timezone
from zoneinfo import ZoneInfo

from app.config import settings
from app.models.enums import FrequencyType, TaskStatus
from app.models.system_task_template import SystemTaskTemplate
from app.models.task import Task


def _first_working_day_of_month(year: int, month: int) -> int:
    for day in range(1, 8):
        check_date = date(year, month, day)
        if check_date.weekday() <= 4:
            return day
    return 1


def _previous_working_day(value: date) -> date:
    while value.weekday() > 4:
        value = value - timedelta(days=1)
    return value


def _is_working_day(value: date) -> bool:
    return value.weekday() <= 4


def _last_working_day_of_month(year: int, month: int) -> date:
    last_day = calendar.monthrange(year, month)[1]
    return _previous_working_day(date(year, month, last_day))


def _resolved_day_of_month(template_day: int | None, target: date) -> int | None:
    if template_day is None:
        return None
    if template_day == 0:
        return _last_working_day_of_month(target.year, target.month).day
    if template_day == -1:
        return _first_working_day_of_month(target.year, target.month)
    return template_day


def resolved_occurrence_date(template: SystemTaskTemplate, target: date) -> date | None:
    return _resolved_occurrence_date_for_month(template, target.year, target.month)


def _resolved_occurrence_date_for_month(
    template: SystemTaskTemplate,
    year: int,
    month: int,
) -> date | None:
    nominal_month = date(year, month, 1)
    template_day = _resolved_day_of_month(template.day_of_month, nominal_month)
    if template_day is None:
        return None
    month_last_day = calendar.monthrange(year, month)[1]
    candidate = date(year, month, min(template_day, month_last_day))
    return _previous_working_day(candidate)


def _template_weekdays(template: SystemTaskTemplate) -> set[int]:
    configured = set(template.days_of_week or [])
    if not configured and template.day_of_week is not None:
        configured.add(template.day_of_week)
    # Weekend schedules run on the previous working day (Friday).
    return {4 if day > 4 else day for day in configured}


def _matches_template_day_of_week(template: SystemTaskTemplate, target: date) -> bool:
    return target.weekday() in _template_weekdays(template)


def _next_month(year: int, month: int) -> tuple[int, int]:
    return (year + 1, 1) if month == 12 else (year, month + 1)


def _matching_nominal_month(
    template: SystemTaskTemplate,
    target: date,
) -> tuple[int, int] | None:
    candidates = [(target.year, target.month), _next_month(target.year, target.month)]
    for year, month in candidates:
        if _resolved_occurrence_date_for_month(template, year, month) == target:
            return year, month
    return None


def _matching_nominal_year(
    template: SystemTaskTemplate,
    target: date,
) -> int | None:
    month_of_year = getattr(template, "month_of_year", None)
    if month_of_year is None:
        return None
    for year in (target.year, target.year + 1):
        if (
            _resolved_occurrence_date_for_month(template, year, month_of_year)
            == target
        ):
            return year
    return None


def _matches_month_cycle(
    frequency: FrequencyType, target_month: int, start_month: int | None
) -> bool:
    if start_month is None:
        return True
    if frequency == FrequencyType.THREE_MONTHS:
        return (target_month - start_month) % 3 == 0
    if frequency == FrequencyType.SIX_MONTHS:
        return (target_month - start_month) % 6 == 0
    return True


def _matches_base_template_date(template: SystemTaskTemplate, target: date) -> bool:
    frequency = template.frequency
    if frequency == FrequencyType.DAILY:
        return _is_working_day(target)
    if frequency == FrequencyType.WEEKLY:
        return _matches_template_day_of_week(template, target)

    if frequency in (FrequencyType.MONTHLY, FrequencyType.THREE_MONTHS, FrequencyType.SIX_MONTHS):
        nominal = _matching_nominal_month(template, target)
        if nominal is None:
            return False
        _, nominal_month = nominal
        return _matches_month_cycle(
            frequency,
            nominal_month,
            getattr(template, "month_of_year", None),
        )

    if frequency == FrequencyType.YEARLY:
        return _matching_nominal_year(template, target) is not None

    return True


def matches_template_date(template: SystemTaskTemplate, target: date) -> bool:
    """Return whether the complete recurrence, including interval, runs on target."""
    return _matches_template_datetime(template, target)


def template_tz(template: SystemTaskTemplate) -> ZoneInfo:
    tz_name = getattr(template, "timezone", None) or settings.APP_TIMEZONE
    try:
        return ZoneInfo(tz_name)
    except Exception:
        try:
            return ZoneInfo(settings.APP_TIMEZONE)
        except Exception:
            return ZoneInfo("UTC")


def template_due_time(template: SystemTaskTemplate) -> time:
    value = getattr(template, "due_time", None)
    if isinstance(value, time):
        return value.replace(second=0, microsecond=0)
    return time(9, 0)


def _local_anchor_date(template: SystemTaskTemplate) -> date:
    tz = template_tz(template)
    anchor = getattr(template, "apply_from", None) or getattr(template, "created_at", None)
    if anchor is None:
        return datetime.now(tz).date()
    if isinstance(anchor, datetime):
        if anchor.tzinfo is None:
            anchor = anchor.replace(tzinfo=timezone.utc)
        return anchor.astimezone(tz).date()
    if isinstance(anchor, date):
        return anchor
    return datetime.now(tz).date()


def _month_add(base: date, months: int) -> date:
    y = base.year + (base.month - 1 + months) // 12
    m = (base.month - 1 + months) % 12 + 1
    d = min(base.day, calendar.monthrange(y, m)[1])
    return date(y, m, d)


def _months_between(a: date, b: date) -> int:
    return (b.year - a.year) * 12 + (b.month - a.month)


def _matches_interval(template: SystemTaskTemplate, target: date) -> bool:
    frequency = getattr(template, "frequency", None)
    interval = max(int(getattr(template, "interval", 1) or 1), 1)
    if interval == 1:
        return True

    anchor = _local_anchor_date(template)
    if frequency == FrequencyType.DAILY:
        return (target - anchor).days % interval == 0
    if frequency == FrequencyType.WEEKLY:
        if not _matches_template_day_of_week(template, target):
            return False
        return ((target - anchor).days // 7) % interval == 0
    if frequency == FrequencyType.MONTHLY:
        months = _months_between(anchor, target)
        return months >= 0 and (months % interval == 0)
    if frequency == FrequencyType.YEARLY:
        years = target.year - anchor.year
        return years >= 0 and (years % interval == 0)
    return True


def _matches_template_datetime(template: SystemTaskTemplate, target_local_date: date) -> bool:
    frequency = getattr(template, "frequency", None)
    if frequency == FrequencyType.MONTHLY:
        nominal = _matching_nominal_month(template, target_local_date)
        if nominal is None:
            return False
        nominal_year, nominal_month = nominal
        return _matches_interval(
            template,
            date(nominal_year, nominal_month, 1),
        )
    if frequency == FrequencyType.YEARLY:
        nominal_year = _matching_nominal_year(template, target_local_date)
        if nominal_year is None:
            return False
        return _matches_interval(
            template,
            date(nominal_year, template.month_of_year or 1, 1),
        )
    return _matches_base_template_date(template, target_local_date) and _matches_interval(
        template,
        target_local_date,
    )


def first_run_at(template: SystemTaskTemplate, from_dt: datetime) -> datetime:
    tz = template_tz(template)
    due = template_due_time(template)
    if from_dt.tzinfo is None:
        from_dt = from_dt.replace(tzinfo=timezone.utc)
    local_from = from_dt.astimezone(tz)
    candidate_date = max(local_from.date(), _local_anchor_date(template))
    candidate = datetime.combine(candidate_date, due, tzinfo=tz)
    if candidate_date == local_from.date() and local_from > candidate:
        candidate_date = candidate_date + timedelta(days=1)
    # Keep search bounded but practical.
    for _ in range(3700):
        if _matches_template_datetime(template, candidate_date):
            return datetime.combine(candidate_date, due, tzinfo=tz).astimezone(timezone.utc)
        candidate_date = candidate_date + timedelta(days=1)
    return datetime.combine(local_from.date(), due, tzinfo=tz).astimezone(timezone.utc)


def next_occurrence(template: SystemTaskTemplate, current_dt: datetime) -> datetime:
    # Return the next occurrence strictly after current_dt.
    start = current_dt + timedelta(minutes=1)
    return first_run_at(template, start)


def previous_occurrence_date(template: SystemTaskTemplate, target: date) -> date:
    """Find the most recent occurrence date on or before target."""
    candidate = target
    for _ in range(370):
        if matches_template_date(template, candidate):
            return candidate
        candidate = candidate - timedelta(days=1)
    return target


def next_occurrence_date(template: SystemTaskTemplate, target: date) -> date:
    """Find the next occurrence date on or after target."""
    candidate = target
    for _ in range(370):
        if matches_template_date(template, candidate):
            return candidate
        candidate = candidate + timedelta(days=1)
    return target


def should_reopen_system_task(
    task: Task, template: SystemTaskTemplate, now: datetime
) -> bool:
    if task.status != TaskStatus.DONE:
        return False
    if task.completed_at is None:
        return False
    today = now.date()
    if task.completed_at.date() >= today:
        return False
    return True
