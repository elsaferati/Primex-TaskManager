from __future__ import annotations

import re
import uuid
from datetime import date, datetime, timedelta
from typing import Any

from sqlalchemy import select
from sqlalchemy.ext.asyncio import AsyncSession

from app.models.enums import ProjectType, ProjectPhaseStatus
from app.models.project import Project
from app.models.task import Task
from app.models.task_daily_progress import TaskDailyProgress

TOTAL_PRODUCTS_RE = re.compile(r"total_products[:=]\s*(\d+)", re.IGNORECASE)
COMPLETED_PRODUCTS_RE = re.compile(r"completed_products[:=]\s*(\d+)", re.IGNORECASE)
ORIGIN_TASK_ID_RE = re.compile(r"origin_task_id[:=]\s*([a-f0-9-]+)", re.IGNORECASE)
TRAILING_TOTAL_RE = re.compile(r"\((\d+)\)\s*$")


def _project_type_text(project_type: Any) -> str:
    if project_type is None:
        return ""
    if hasattr(project_type, "value"):
        return str(project_type.value or "")
    return str(project_type or "")


def _parse_int(pattern: re.Pattern[str], text: str | None) -> int | None:
    if not text:
        return None
    match = pattern.search(text)
    if not match:
        return None
    try:
        value = int(match.group(1))
    except Exception:
        return None
    return max(0, value)


def _parse_origin_task_id(text: str | None) -> uuid.UUID | None:
    if not text:
        return None
    match = ORIGIN_TASK_ID_RE.search(text)
    if not match:
        return None
    try:
        return uuid.UUID(match.group(1))
    except Exception:
        return None


def is_tt_or_mst(project_title: str | None, project_type: Any) -> bool:
    title_upper = (project_title or "").strip().upper()
    is_tt = title_upper == "TT" or title_upper.startswith("TT ") or title_upper.startswith("TT-")
    type_upper = _project_type_text(project_type).strip().upper()
    is_mst = type_upper == ProjectType.MST.value or "MST" in title_upper
    return is_tt or is_mst


def normalize_base_title(raw_title: str, total: int | None) -> str:
    title = (raw_title or "").strip()
    if not title:
        return "Untitled project"
    if total is None or total <= 0:
        return title
    match = TRAILING_TOTAL_RE.search(title)
    if not match:
        return title
    try:
        trailing_total = int(match.group(1))
    except Exception:
        return title
    if trailing_total != total:
        return title
    return title[: match.start()].strip() or "Untitled project"


def _week_start(d: date) -> date:
    return d - timedelta(days=d.weekday())


def _normalize_week_range(
    week_start: date | None,
    week_end: date | None,
) -> tuple[date, date]:
    today = date.today()
    normalized_start = _week_start(week_start or today)
    normalized_end = week_end or (normalized_start + timedelta(days=6))
    if normalized_end < normalized_start:
        normalized_end = normalized_start + timedelta(days=6)
    return normalized_start, normalized_end


def _to_date(value: datetime | date | None) -> date | None:
    if value is None:
        return None
    if isinstance(value, datetime):
        return value.date()
    return value


def _overlaps_week(
    *,
    start_date: datetime | date | None,
    due_date: datetime | date | None,
    week_start: date,
    week_end: date,
) -> bool:
    start = _to_date(start_date)
    due = _to_date(due_date)
    if start is not None and due is not None:
        return start <= week_end and due >= week_start
    if due is not None:
        return week_start <= due <= week_end
    if start is not None:
        return week_start <= start <= week_end
    return False


async def compute_project_control_week_metrics(
    db: AsyncSession,
    project_ids: list[uuid.UUID],
    week_start: date | None = None,
    week_end: date | None = None,
    project_total_by_id: dict[uuid.UUID, int | None] | None = None,
) -> dict[uuid.UUID, dict[str, int | bool | None]]:
    if not project_ids:
        return {}
    normalized_week_start, normalized_week_end = _normalize_week_range(week_start, week_end)

    unique_ids = list(dict.fromkeys(project_ids))
    controls = (
        await db.execute(
            select(Task.id, Task.project_id, Task.daily_products, Task.internal_notes, Task.start_date, Task.due_date)
            .where(Task.project_id.in_(unique_ids))
            .where(Task.phase == ProjectPhaseStatus.CONTROL.value)
            .where(Task.is_active.is_(True))
        )
    ).all()

    progress: dict[uuid.UUID, dict[str, int | bool | None]] = {
        pid: {"total": None, "done_total": 0, "realised_week": 0, "has_control": False} for pid in unique_ids
    }

    origin_ids: set[uuid.UUID] = set()
    origin_by_task_id: dict[uuid.UUID, uuid.UUID] = {}
    task_project_map: dict[uuid.UUID, uuid.UUID] = {}
    for task_id, project_id, _, notes, _, _ in controls:
        task_project_map[task_id] = project_id
        origin_id = _parse_origin_task_id(notes)
        if origin_id is not None:
            origin_ids.add(origin_id)
            origin_by_task_id[task_id] = origin_id

    origin_totals: dict[uuid.UUID, int] = {}
    if origin_ids:
        rows = (
            await db.execute(
                select(Task.id, Task.daily_products, Task.internal_notes).where(Task.id.in_(list(origin_ids)))
            )
        ).all()
        for origin_id, daily_products, notes in rows:
            if daily_products is not None and daily_products > 0:
                origin_totals[origin_id] = int(daily_products)
                continue
            notes_total = _parse_int(TOTAL_PRODUCTS_RE, notes)
            if notes_total is not None and notes_total > 0:
                origin_totals[origin_id] = notes_total

    for task_id, project_id, daily_products, notes, start_date, due_date in controls:
        task_project_map[task_id] = project_id
        bucket = progress.setdefault(project_id, {"total": None, "done_total": 0, "realised_week": 0, "has_control": False})
        bucket["has_control"] = True

        task_total = _parse_int(TOTAL_PRODUCTS_RE, notes)
        if task_total is None and daily_products is not None and daily_products > 0:
            task_total = int(daily_products)
        if task_total is None:
            origin_id = origin_by_task_id.get(task_id)
            if origin_id is not None:
                task_total = origin_totals.get(origin_id)

        if task_total is not None and task_total > 0:
            current_total = bucket.get("total")
            if current_total is None or int(current_total) < task_total:
                bucket["total"] = task_total
    task_ids = list(task_project_map.keys())
    done_by_task: dict[uuid.UUID, int] = {}
    if task_ids:
        all_time_rows = (
            await db.execute(
                select(TaskDailyProgress.task_id, TaskDailyProgress.completed_value)
                .where(TaskDailyProgress.task_id.in_(task_ids))
            )
        ).all()
        for task_id, completed_value in all_time_rows:
            try:
                completed = max(0, int(completed_value or 0))
            except Exception:
                completed = 0
            existing = done_by_task.get(task_id, 0)
            if completed > existing:
                done_by_task[task_id] = completed

        weekly_rows = (
            await db.execute(
                select(TaskDailyProgress.task_id, TaskDailyProgress.completed_delta)
                .where(TaskDailyProgress.task_id.in_(task_ids))
                .where(TaskDailyProgress.day_date >= normalized_week_start)
                .where(TaskDailyProgress.day_date <= normalized_week_end)
            )
        ).all()
        for task_id, completed_delta in weekly_rows:
            project_id = task_project_map.get(task_id)
            if project_id is None:
                continue
            bucket = progress.setdefault(
                project_id, {"total": None, "done_total": 0, "realised_week": 0, "has_control": False}
            )
            realized_delta = 0
            try:
                realized_delta = max(0, int(completed_delta or 0))
            except Exception:
                realized_delta = 0
            bucket["realised_week"] = int(bucket.get("realised_week", 0) or 0) + realized_delta

    for task_id, project_id, daily_products, notes, _start_date, _due_date in controls:
        bucket = progress.setdefault(project_id, {"total": None, "done_total": 0, "realised_week": 0, "has_control": False})

        task_total = _parse_int(TOTAL_PRODUCTS_RE, notes)
        if task_total is None and daily_products is not None and daily_products > 0:
            task_total = int(daily_products)
        if task_total is None:
            origin_id = origin_by_task_id.get(task_id)
            if origin_id is not None:
                task_total = origin_totals.get(origin_id)
        if task_total is not None and task_total < 0:
            task_total = 0

        task_done = done_by_task.get(task_id)
        if task_done is None:
            parsed_done = _parse_int(COMPLETED_PRODUCTS_RE, notes)
            task_done = parsed_done if parsed_done is not None else 0
        task_done = max(0, int(task_done))
        if task_total is not None and task_total > 0:
            task_done = min(task_done, int(task_total))

        bucket["done_total"] = int(bucket.get("done_total", 0) or 0) + task_done

    if project_total_by_id:
        for pid, project_total in project_total_by_id.items():
            if project_total is None or project_total <= 0:
                continue
            bucket = progress.setdefault(pid, {"total": None, "done_total": 0, "realised_week": 0, "has_control": False})
            bucket["total"] = int(project_total)

    for pid, bucket in progress.items():
        total = bucket.get("total")
        done_total = max(0, int(bucket.get("done_total", 0) or 0))
        realized_week = max(0, int(bucket.get("realised_week", 0) or 0))
        if total is not None:
            resolved_total = int(total)
            done_total = min(done_total, resolved_total)
            realized_week = min(realized_week, resolved_total)
            remaining_capacity = max(0, resolved_total - done_total)
            realized_week = min(realized_week, remaining_capacity)
        bucket["done_total"] = done_total
        bucket["realised_week"] = realized_week
        progress[pid] = bucket

    return progress


def build_display_title(
    *,
    title: str | None,
    project_type: Any,
    total_products: int | None,
    progress: dict[str, int | bool | None] | None,
) -> str:
    raw_title = (title or "").strip() or "Untitled project"
    if not is_tt_or_mst(raw_title, project_type):
        return raw_title

    progress_total = progress.get("total") if progress else None
    resolved_total = int(progress_total) if isinstance(progress_total, int) else None
    if resolved_total is None or resolved_total <= 0:
        if total_products is not None and total_products > 0:
            resolved_total = int(total_products)
    if resolved_total is None or resolved_total <= 0:
        return raw_title

    done_total = 0
    realized_week = 0
    if progress and isinstance(progress.get("done_total"), int):
        done_total = int(progress["done_total"] or 0)
    if progress and isinstance(progress.get("realised_week"), int):
        realized_week = int(progress["realised_week"] or 0)
    done_total = max(0, min(done_total, resolved_total))
    realized_week = max(0, min(realized_week, resolved_total))
    remaining_capacity = max(0, resolved_total - done_total)
    realized_week = min(realized_week, remaining_capacity)

    base = normalize_base_title(raw_title, resolved_total)
    return f"{base} ({resolved_total}/{done_total}/{realized_week})"


async def build_project_display_title_map(
    db: AsyncSession,
    projects: list[Project],
    week_start: date | None = None,
    week_end: date | None = None,
) -> dict[uuid.UUID, str]:
    if not projects:
        return {}
    project_total_by_id = {p.id: p.total_products for p in projects}
    progress_map = await compute_project_control_week_metrics(
        db,
        [p.id for p in projects],
        week_start=week_start,
        week_end=week_end,
        project_total_by_id=project_total_by_id,
    )
    out: dict[uuid.UUID, str] = {}
    for project in projects:
        out[project.id] = build_display_title(
            title=project.title,
            project_type=project.project_type,
            total_products=project.total_products,
            progress=progress_map.get(project.id),
        )
    return out
