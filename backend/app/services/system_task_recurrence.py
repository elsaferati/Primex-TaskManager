import calendar
from datetime import date, datetime, time, timedelta, timezone

try:
    from zoneinfo import ZoneInfo
except ImportError:  # pragma: no cover
    ZoneInfo = None

from app.models.enums import FrequencyType, SystemTaskRecurrenceKind
from app.models.system_task_template import SystemTaskTemplate

DEFAULT_TIMEZONE = "Europe/Tirane"
DEFAULT_DUE_TIME = time(9, 0)


def _resolve_timezone(name: str | None) -> timezone:
    tz_name = name or DEFAULT_TIMEZONE
    if ZoneInfo is not None:
        try:
            return ZoneInfo(tz_name)
        except Exception:
            pass
    try:
        import pytz  # type: ignore[import-not-found]

        return pytz.timezone(tz_name)
    except Exception:
        return timezone.utc


def _resolve_due_time(template: SystemTaskTemplate) -> time:
    return template.due_time or DEFAULT_DUE_TIME


def _anchor_date(template: SystemTaskTemplate, tz) -> date:
    base = template.start_at or template.created_at
    if isinstance(base, datetime):
        if base.tzinfo is None:
            base = base.replace(tzinfo=timezone.utc)
        return base.astimezone(tz).date()
    return date.today()


def _recurrence_kind(template: SystemTaskTemplate) -> str:
    if template.recurrence_kind:
        return str(template.recurrence_kind)
    frequency = str(template.frequency) if template.frequency else None
    if not frequency:
        return SystemTaskRecurrenceKind.DAILY.value
    if frequency in (FrequencyType.THREE_MONTHS.value, FrequencyType.SIX_MONTHS.value):
        return SystemTaskRecurrenceKind.MONTHLY.value
    return str(frequency)


def _interval_value(template: SystemTaskTemplate) -> int:
    if template.interval and template.interval > 0:
        return int(template.interval)
    frequency = str(template.frequency) if template.frequency else None
    if frequency == FrequencyType.THREE_MONTHS.value:
        return 3
    if frequency == FrequencyType.SIX_MONTHS.value:
        return 6
    if frequency == FrequencyType.YEARLY.value:
        return 12
    return 1


def _resolved_bymonthday(template: SystemTaskTemplate, target: date, anchor_day: int) -> int:
    if template.bymonthday is not None:
        day = template.bymonthday
    elif template.day_of_month is not None:
        day = template.day_of_month
    else:
        day = anchor_day
    last_day = calendar.monthrange(target.year, target.month)[1]
    if day is None:
        return target.day
    if day > last_day:
        return last_day
    if day < 1:
        return 1
    return day


def _resolved_byweekday(template: SystemTaskTemplate) -> list[int]:
    if template.byweekday:
        return [int(value) for value in template.byweekday]
    if template.days_of_week:
        return [int(value) for value in template.days_of_week]
    if template.day_of_week is not None:
        return [int(template.day_of_week)]
    return []


def _within_effective_bounds(template: SystemTaskTemplate, candidate: date) -> bool:
    if template.effective_from and candidate < template.effective_from:
        return False
    if template.effective_to and candidate > template.effective_to:
        return False
    return True


def matches_recurrence(template: SystemTaskTemplate, candidate: date) -> bool:
    if not _within_effective_bounds(template, candidate):
        return False
    kind = _recurrence_kind(template)
    interval = _interval_value(template)
    tz = _resolve_timezone(template.timezone)
    anchor = _anchor_date(template, tz)

    if kind == SystemTaskRecurrenceKind.DAILY.value:
        diff_days = (candidate - anchor).days
        return diff_days % interval == 0

    if kind == SystemTaskRecurrenceKind.WEEKLY.value:
        weekdays = _resolved_byweekday(template)
        if not weekdays:
            weekdays = [anchor.weekday()]
        if weekdays and candidate.weekday() not in weekdays:
            return False
        anchor_week_start = anchor - timedelta(days=anchor.weekday())
        candidate_week_start = candidate - timedelta(days=candidate.weekday())
        diff_weeks = (candidate_week_start - anchor_week_start).days // 7
        return diff_weeks % interval == 0

    if kind == SystemTaskRecurrenceKind.MONTHLY.value:
        target_day = _resolved_bymonthday(template, candidate, anchor.day)
        if candidate.day != target_day:
            return False
        anchor_month = template.month_of_year or anchor.month
        anchor_month_index = anchor.year * 12 + (anchor_month - 1)
        candidate_month_index = candidate.year * 12 + (candidate.month - 1)
        diff_months = candidate_month_index - anchor_month_index
        return diff_months % interval == 0

    if kind == SystemTaskRecurrenceKind.YEARLY.value:
        month = template.month_of_year or anchor.month
        if candidate.month != month:
            return False
        target_day = _resolved_bymonthday(template, candidate, anchor.day)
        if candidate.day != target_day:
            return False
        anchor_month_index = anchor.year * 12 + (month - 1)
        candidate_month_index = candidate.year * 12 + (candidate.month - 1)
        diff_months = candidate_month_index - anchor_month_index
        return diff_months % interval == 0

    return False


def first_run_at(template: SystemTaskTemplate, now_utc: datetime | None = None) -> datetime:
    now = now_utc or datetime.now(timezone.utc)
    if now.tzinfo is None:
        now = now.replace(tzinfo=timezone.utc)
    tz = _resolve_timezone(template.timezone)
    local_now = now.astimezone(tz)
    due_time = _resolve_due_time(template)

    start_date = local_now.date()
    for offset in range(0, 400):
        candidate = start_date + timedelta(days=offset)
        if not matches_recurrence(template, candidate):
            continue
        if candidate == local_now.date() and local_now.time() > due_time:
            continue
        candidate_dt = datetime.combine(candidate, due_time, tzinfo=tz)
        return candidate_dt.astimezone(timezone.utc)

    return now


def next_run_at(current_run_at: datetime, template: SystemTaskTemplate) -> datetime:
    if current_run_at.tzinfo is None:
        current_run_at = current_run_at.replace(tzinfo=timezone.utc)
    tz = _resolve_timezone(template.timezone)
    local_current = current_run_at.astimezone(tz)
    due_time = _resolve_due_time(template)
    start_date = local_current.date()
    if local_current.time() >= due_time:
        start_date = start_date + timedelta(days=1)
    for offset in range(0, 400):
        candidate = start_date + timedelta(days=offset)
        if not matches_recurrence(template, candidate):
            continue
        candidate_dt = datetime.combine(candidate, due_time, tzinfo=tz)
        return candidate_dt.astimezone(timezone.utc)

    return current_run_at + timedelta(days=1)
