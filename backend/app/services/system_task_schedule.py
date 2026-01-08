from __future__ import annotations

import calendar
from datetime import date, datetime

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


def should_reopen_system_task(
    task: Task, template: SystemTaskTemplate, now: datetime
) -> bool:
    if task.status not in (TaskStatus.DONE, TaskStatus.CANCELLED):
        return False
    if task.completed_at is None:
        return False
    today = now.date()
    if task.completed_at.date() >= today:
        return False
    return True
