from __future__ import annotations

from datetime import date

from sqlalchemy import and_, case, func, or_

from app.models.task import Task


def task_date_window_filter(window_from: date | None, window_to: date | None):
    """Match the task days rendered by Common View, including overlapping ranges."""
    effective_columns = [Task.due_date, Task.start_date, Task.created_at]
    if hasattr(Task, "planned_for"):
        effective_columns.insert(0, getattr(Task, "planned_for"))
    effective_date = func.date(func.coalesce(*effective_columns))
    has_range = and_(
        Task.start_date.isnot(None),
        Task.due_date.isnot(None),
        func.upper(func.coalesce(Task.phase, "")).notin_(["CHECK", "CONTROL"]),
    )
    # Common View also normalizes accidentally reversed start/end dates.
    start = func.date(Task.start_date)
    end = func.date(Task.due_date)
    range_start = case((start <= end, start), else_=end)
    range_end = case((start <= end, end), else_=start)
    first_day = case((has_range, range_start), else_=effective_date)
    last_day = case((has_range, range_end), else_=effective_date)
    filters = []
    if window_from is not None:
        filters.append(last_day >= window_from)
    if window_to is not None:
        filters.append(first_day <= window_to)
    return and_(*filters)


def common_view_task_date_window_filter(window_from: date | None, window_to: date | None):
    """Include deadline-important tasks from their start through completion."""
    regular_window = task_date_window_filter(window_from, window_to)
    if window_to is None:
        return regular_window

    deadline_start_columns = [Task.start_date, Task.due_date]
    if hasattr(Task, "planned_for"):
        deadline_start_columns.append(getattr(Task, "planned_for"))
    deadline_start_columns.append(Task.created_at)
    deadline_start = func.date(func.coalesce(*deadline_start_columns))
    deadline_end_conditions = [
        and_(
            Task.completed_at.is_(None),
            func.upper(func.coalesce(Task.status, "")).notin_(["DONE", "COMPLETED"]),
        )
    ]
    if window_from is not None:
        deadline_end_conditions.append(func.date(Task.completed_at) >= window_from)

    active_deadline = and_(
        Task.is_deadline_important.is_(True),
        deadline_start <= window_to,
        or_(*deadline_end_conditions),
    )
    return or_(regular_window, active_deadline)
