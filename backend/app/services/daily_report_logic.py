from __future__ import annotations

import re
import uuid
from datetime import date, datetime, time, timedelta, timezone
from typing import Iterable, Literal


DailyReportTyoMode = Literal["range", "dueOnly"]

KO_USER_RE = re.compile(r"ko_user_id[:=]\s*([a-f0-9-]+)", re.IGNORECASE)

DEPT_CODE_ALIASES: dict[str, str] = {
    # Seed uses "GD" but many parts of the app refer to "GDS".
    "GD": "GDS",
}


def normalize_dept_code(dept_code: str | None) -> str:
    normalized = (dept_code or "").strip().upper()
    return DEPT_CODE_ALIASES.get(normalized, normalized)


def parse_ko_user_id(internal_notes: str | None) -> uuid.UUID | None:
    if not internal_notes:
        return None
    match = KO_USER_RE.search(internal_notes)
    if not match:
        return None
    try:
        return uuid.UUID(match.group(1))
    except (ValueError, AttributeError):
        return None


def is_mst_or_tt_project(project) -> bool:
    title = (getattr(project, "title", None) or getattr(project, "name", None) or "").upper().strip()
    is_tt = title == "TT" or title.startswith("TT ") or title.startswith("TT-")
    project_type = (getattr(project, "project_type", None) or "").upper().strip()
    return project_type == "MST" or ("MST" in title) or is_tt


def ko_rule_applies_for_task(task, *, project, dept_code: str | None) -> bool:
    """
    Returns True when KO ownership rules apply to this task:
    PCM department + TT/MST project + CONTROL phase.
    """
    phase = (getattr(task, "phase", None) or "").upper().strip()
    normalized = (dept_code or "").strip().upper()
    return bool(
        normalized == "PCM"
        and project is not None
        and is_mst_or_tt_project(project)
        and phase == "CONTROL"
    )


def ko_owner_user_id_for_task(task, *, project, dept_code: str | None) -> uuid.UUID | None:
    if not ko_rule_applies_for_task(task, project=project, dept_code=dept_code):
        return None
    return parse_ko_user_id(getattr(task, "internal_notes", None))


def completed_on_day(value: datetime | None, day: date, tz: timezone = timezone.utc) -> bool:
    if value is None:
        return False
    if isinstance(value, datetime):
        dt = value
    else:
        return False
    if dt.tzinfo is None:
        dt = dt.replace(tzinfo=tz)
    dt = dt.astimezone(tz)
    start = datetime.combine(day, time.min, tzinfo=tz)
    end = start + timedelta(days=1)
    return start <= dt < end


def _as_utc_date(value: datetime | date | None) -> date | None:
    if value is None:
        return None
    if isinstance(value, datetime):
        return value.astimezone(timezone.utc).date() if value.tzinfo else value.date()
    return value


def planned_range_for_daily_report(task, dept_code: str | None) -> tuple[date | None, date | None]:
    due_dt = getattr(task, "due_date", None)
    if due_dt is None:
        return None, None
    due = _as_utc_date(due_dt)
    if due is None:
        return None, None

    start = _as_utc_date(getattr(task, "start_date", None))
    normalized = normalize_dept_code(dept_code)
    is_project_task = getattr(task, "project_id", None) is not None

    if is_project_task:
        if normalized in {"PCM", "GDS"}:
            return due, due
        if normalized == "DEV":
            if start is not None and start <= due:
                return start, due
            return due, due
        # Unknown department: preserve legacy behavior (range when valid, else due-only).
        if start is not None and start <= due:
            return start, due
        return due, due

    # Fast/standalone tasks: show from start_date until due_date, then overdue until done.
    if start is not None and start <= due:
        return start, due
    return due, due


def task_is_visible_to_user(
    task,
    *,
    user_id: uuid.UUID,
    assignee_ids: Iterable[uuid.UUID] | None,
    project,
    dept_code: str | None = None,
) -> bool:
    if ko_rule_applies_for_task(task, project=project, dept_code=dept_code):
        ko_owner_id = parse_ko_user_id(getattr(task, "internal_notes", None))
        return ko_owner_id is not None and ko_owner_id == user_id

    assigned_to = getattr(task, "assigned_to", None)
    if assigned_to is not None and assigned_to == user_id:
        return True
    if assignee_ids:
        for uid in assignee_ids:
            if uid == user_id:
                return True
    return False


def daily_report_tyo_label(
    *,
    report_day: date,
    start_day: date | None,
    due_day: date | None,
    mode: DailyReportTyoMode,
) -> str:
    if due_day is None:
        return "-"

    if mode == "range":
        if start_day is not None:
            if report_day < start_day:
                return "-"
            if report_day <= due_day:
                return "T"
        else:
            if report_day <= due_day:
                return "T" if report_day == due_day else "-"
    else:
        if report_day < due_day:
            return "-"
        if report_day == due_day:
            return "T"

    late_days = (report_day - due_day).days
    if late_days == 1:
        return "Y"
    if late_days >= 2:
        return str(late_days)
    return "-"
