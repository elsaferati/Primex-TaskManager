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


def _resolved_day_of_month(template_day: int | None, target: date) -> int | None:
    if template_day is None:
        return None
    if template_day == 0:
        return calendar.monthrange(target.year, target.month)[1]
    if template_day == -1:
        return _first_working_day_of_month(target.year, target.month)
    return template_day


def _matches_template_day_of_week(template: SystemTaskTemplate, target: date) -> bool:
    target_day = target.weekday()
    if template.days_of_week:
        return target_day in template.days_of_week
    if template.day_of_week is not None:
        return template.day_of_week == target_day
    return False


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


def matches_template_date(template: SystemTaskTemplate, target: date) -> bool:
    frequency = template.frequency
    if frequency == FrequencyType.DAILY:
        return True
    if frequency == FrequencyType.WEEKLY:
        return _matches_template_day_of_week(template, target)

    resolved_day = _resolved_day_of_month(template.day_of_month, target)
    day_matches = resolved_day is None or resolved_day == target.day

    if frequency in (FrequencyType.MONTHLY, FrequencyType.THREE_MONTHS, FrequencyType.SIX_MONTHS):
        if not day_matches:
            return False
        return _matches_month_cycle(frequency, target.month, template.month_of_year)

    if frequency == FrequencyType.YEARLY:
        if template.month_of_year is not None and template.month_of_year != target.month:
            return False
        return day_matches

    return True


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
        if template.day_of_month is None:
            return False
        month_last_day = calendar.monthrange(target_local_date.year, target_local_date.month)[1]
        expected_day = min(template.day_of_month, month_last_day)
        if target_local_date.day != expected_day:
            return False
        return _matches_interval(template, target_local_date)
    if frequency == FrequencyType.YEARLY:
        if template.month_of_year and target_local_date.month != template.month_of_year:
            return False
        if template.day_of_month is not None:
            month_last_day = calendar.monthrange(target_local_date.year, target_local_date.month)[1]
            expected_day = min(template.day_of_month, month_last_day)
            if target_local_date.day != expected_day:
                return False
        return _matches_interval(template, target_local_date)
    return matches_template_date(template, target_local_date) and _matches_interval(template, target_local_date)


def first_run_at(template: SystemTaskTemplate, from_dt: datetime) -> datetime:
    tz = template_tz(template)
    due = template_due_time(template)
    if from_dt.tzinfo is None:
        from_dt = from_dt.replace(tzinfo=timezone.utc)
    local_from = from_dt.astimezone(tz)
    candidate_date = local_from.date()
    candidate = datetime.combine(candidate_date, due, tzinfo=tz)
    if local_from > candidate:
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
