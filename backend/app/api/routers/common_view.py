from __future__ import annotations

import hashlib
import os
import re
import uuid
from datetime import date, datetime, timedelta, timezone
from time import perf_counter
from typing import Any
try:
    from zoneinfo import ZoneInfo
except Exception:
    ZoneInfo = None

from fastapi import APIRouter, Depends, Request, Response, status
from pydantic import BaseModel, Field
from sqlalchemy import and_, func, or_, select, cast, Date
from sqlalchemy.ext.asyncio import AsyncSession

from app.api.access import ensure_department_access
from app.api.deps import get_current_user
from app.db import get_db
from app.models.common_entry import CommonEntry
from app.models.department import Department
from app.models.enums import CommonCategory, UserRole
from app.models.meeting import Meeting
from app.models.project import Project
from app.models.system_task_template import SystemTaskTemplate
from app.models.system_task_template_alignment_user import SystemTaskTemplateAlignmentUser
from app.models.task import Task
from app.models.task_assignee import TaskAssignee
from app.models.user import User
from app.services.system_task_schedule import matches_template_date


router = APIRouter()


KNOWN_INCLUDES = {"users", "departments", "entries", "meetings", "system_tasks", "tasks"}
DEFAULT_INCLUDES = ["users", "departments", "entries", "meetings", "system_tasks", "tasks"]
BUCKETS = [
    "late",
    "absent",
    "leave",
    "blocked",
    "oneH",
    "personal",
    "external",
    "internal",
    "r1",
    "problems",
    "feedback",
    "priority",
    "bz",
]

DEFAULT_MAX_ITEMS_PER_BUCKET = int(os.getenv("COMMON_VIEW_MAX_ITEMS_PER_BUCKET", "1000"))
SERVER_CACHE_TTL_SECONDS = int(os.getenv("COMMON_VIEW_CACHE_TTL_SECONDS", "15"))

_cache: dict[str, tuple[float, str, dict[str, Any]]] = {}


class CommonViewGuardrails(BaseModel):
    max_items_per_bucket: int
    truncated: dict[str, bool]


class CommonViewCounts(BaseModel):
    late: int = 0
    absent: int = 0
    leave: int = 0
    blocked: int = 0
    oneH: int = 0
    personal: int = 0
    external: int = 0
    internal: int = 0
    r1: int = 0
    problems: int = 0
    feedback: int = 0
    priority: int = 0
    bz: int = 0


class CommonViewItemPayload(BaseModel):
    late: list[dict[str, Any]] = Field(default_factory=list)
    absent: list[dict[str, Any]] = Field(default_factory=list)
    leave: list[dict[str, Any]] = Field(default_factory=list)
    blocked: list[dict[str, Any]] = Field(default_factory=list)
    oneH: list[dict[str, Any]] = Field(default_factory=list)
    personal: list[dict[str, Any]] = Field(default_factory=list)
    external: list[dict[str, Any]] = Field(default_factory=list)
    internal: list[dict[str, Any]] = Field(default_factory=list)
    r1: list[dict[str, Any]] = Field(default_factory=list)
    problems: list[dict[str, Any]] = Field(default_factory=list)
    feedback: list[dict[str, Any]] = Field(default_factory=list)
    priority: list[dict[str, Any]] = Field(default_factory=list)
    bz: list[dict[str, Any]] = Field(default_factory=list)


class CommonViewResponse(BaseModel):
    schema_version: int
    generated_at: datetime
    week_start: date
    week_end: date
    requested: list[str]
    included: list[str]
    missing: list[str]
    counts: CommonViewCounts
    items: CommonViewItemPayload
    guardrails: CommonViewGuardrails
    trace_id: str
    timings_ms: dict[str, float] | None = None
    users: list[dict[str, Any]] | None = None
    departments: list[dict[str, Any]] | None = None
    meetings: list[dict[str, Any]] | None = None
    system_tasks: list[dict[str, Any]] | None = None
    tasks: list[dict[str, Any]] | None = None


def _week_start_for(value: date | None) -> date:
    base = value or date.today()
    return base - timedelta(days=base.weekday())


def _week_dates(week_start: date) -> list[date]:
    return [week_start + timedelta(days=i) for i in range(5)]

def _tirane_tz():
    tz = None
    if ZoneInfo is not None:
        try:
            tz = ZoneInfo("Europe/Tirane")
        except Exception:
            try:
                tz = ZoneInfo("Europe/Pristina")
            except Exception:
                try:
                    tz = ZoneInfo("Europe/Belgrade")
                except Exception:
                    tz = None
    if tz is None:
        try:
            import pytz

            try:
                tz = pytz.timezone("Europe/Tirane")
            except Exception:
                try:
                    tz = pytz.timezone("Europe/Pristina")
                except Exception:
                    tz = pytz.timezone("Europe/Belgrade")
        except ImportError:
            tz = timezone(timedelta(hours=1))
    return tz

def _as_tirane_dt(value: datetime | None) -> datetime | None:
    if value is None:
        return None
    if value.tzinfo:
        return value.astimezone(_tirane_tz())
    return value

def _as_tirane_date(value: datetime | date | None) -> date | None:
    if value is None:
        return None
    if isinstance(value, datetime):
        local = _as_tirane_dt(value) or value
        return local.date()
    return value


def _format_time(value: datetime | None) -> str:
    if value is None:
        return "TBD"
    local = _as_tirane_dt(value) or value
    return local.strftime("%H:%M")


def _parse_annual_leave(entry: CommonEntry) -> tuple[date, date, bool, str | None, str | None, str | None, bool]:
    note = entry.description or ""
    base_date = entry.entry_date or entry.created_at.date()
    start_date = base_date
    end_date = base_date
    full_day = True
    start_time: str | None = None
    end_time: str | None = None
    is_all_users = False

    if "[ALL_USERS]" in note:
        is_all_users = True
        note = note.replace("[ALL_USERS]", "").strip()

    date_range_match = re.search(r"Date range:\s*(\d{4}-\d{2}-\d{2})\s+to\s+(\d{4}-\d{2}-\d{2})", note, re.I)
    if date_range_match:
        start_date = date.fromisoformat(date_range_match.group(1))
        end_date = date.fromisoformat(date_range_match.group(2))
        note = re.sub(
            r"Date range:\s*\d{4}-\d{2}-\d{2}\s+to\s+\d{4}-\d{2}-\d{2}",
            "",
            note,
            flags=re.I,
        ).strip()
    else:
        date_match = re.search(r"Date:\s*(\d{4}-\d{2}-\d{2})", note, re.I)
        if date_match:
            parsed = date.fromisoformat(date_match.group(1))
            start_date = parsed
            end_date = parsed
            note = re.sub(r"Date:\s*\d{4}-\d{2}-\d{2}", "", note, flags=re.I).strip()
        else:
            date_matches = re.findall(r"\d{4}-\d{2}-\d{2}", note)
            if date_matches:
                start_date = date.fromisoformat(date_matches[0])
                end_date = date.fromisoformat(date_matches[1] if len(date_matches) > 1 else date_matches[0])

    if re.search(r"\(Full day\)", note, re.I):
        full_day = True
        note = re.sub(r"\(Full day\)", "", note, flags=re.I).strip()
    else:
        time_match = re.search(r"\((\d{1,2}:\d{2})\s*-\s*(\d{1,2}:\d{2})\)", note)
        if time_match:
            full_day = False
            start_time = time_match.group(1)
            end_time = time_match.group(2)
            note = re.sub(r"\(\d{1,2}:\d{2}\s*-\s*\d{1,2}:\d{2}\)", "", note).strip()

    cleaned_note = note.strip() if note.strip() else None
    return start_date, end_date, full_day, start_time, end_time, cleaned_note, is_all_users


def _initials(name: str) -> str:
    cleaned = name.strip()
    if not cleaned:
        return "?"
    parts = re.split(r"\s+", cleaned)
    first = parts[0][0] if parts else ""
    last = parts[-1][0] if len(parts) > 1 else ""
    return f"{first}{last}".upper()


def _should_include_task(task: Task) -> bool:
    if task.completed_at:
        return False
    status_value = (task.status or "").lower()
    if status_value in {"done", "completed"}:
        return False
    return True


def _get_task_date_source(task: Task) -> datetime | None:
    planned_for = getattr(task, "planned_for", None)
    return planned_for or task.due_date or task.start_date or task.created_at


def _get_task_dates(task: Task, single_day_only: bool) -> list[date]:
    if single_day_only:
        source = _get_task_date_source(task)
        return [_as_tirane_date(source) or date.today()]

    start_dt = task.start_date
    due_dt = task.due_date
    if start_dt and due_dt:
        start = _as_tirane_date(start_dt) or start_dt.date()
        end = _as_tirane_date(due_dt) or due_dt.date()
        if start > end:
            start, end = end, start
        dates: list[date] = []
        current = start
        while current <= end:
            if current.weekday() < 5:
                dates.append(current)
            current = current + timedelta(days=1)
        return dates if dates else [start]

    source = _get_task_date_source(task)
    return [_as_tirane_date(source) or date.today()]


def _meeting_occurs_on_date(meeting: Meeting, day: date) -> bool:
    if meeting.recurrence_type == "weekly":
        if not meeting.recurrence_days_of_week:
            return False
        return day.weekday() in meeting.recurrence_days_of_week
    if meeting.recurrence_type == "monthly":
        if not meeting.recurrence_days_of_month:
            return False
        return day.day in meeting.recurrence_days_of_month
    if meeting.recurrence_type == "yearly":
        month = meeting.starts_at.month if meeting.starts_at else None
        day_value = meeting.recurrence_days_of_month[0] if meeting.recurrence_days_of_month else None
        if month is None or day_value is None:
            return False
        return day.month == month and day.day == day_value
    return False


async def _max_timestamp(
    db: AsyncSession, model, column, filters: list[Any] | None = None
) -> datetime | None:
    stmt = select(func.max(column))
    if filters:
        stmt = stmt.where(and_(*filters))
    return (await db.execute(stmt)).scalar_one_or_none()


async def _compute_etag(
    db: AsyncSession,
    week_start: date,
    week_end: date,
    requested: list[str],
    user: User,
    department_id: uuid.UUID | None,
    include_all_departments: bool,
) -> str:
    parts: list[str] = [
        week_start.isoformat(),
        week_end.isoformat(),
        ",".join(sorted(requested)),
        str(department_id) if department_id else "",
        "1" if include_all_departments else "0",
        str(user.role),
    ]
    if "users" in requested:
        ts = await _max_timestamp(db, User, User.updated_at)
        parts.append(ts.isoformat() if ts else "")
    if "departments" in requested or "meetings" in requested or "tasks" in requested:
        ts = await _max_timestamp(db, Department, Department.created_at)
        parts.append(ts.isoformat() if ts else "")
    if "entries" in requested:
        entry_effective = func.coalesce(CommonEntry.entry_date, func.date(CommonEntry.created_at))
        entry_filters = [entry_effective >= week_start, entry_effective <= week_end]
        ts = await _max_timestamp(db, CommonEntry, CommonEntry.updated_at, entry_filters)
        parts.append(ts.isoformat() if ts else "")
    if "meetings" in requested:
        ts = await _max_timestamp(db, Meeting, Meeting.updated_at)
        parts.append(ts.isoformat() if ts else "")
    if "system_tasks" in requested:
        ts = await _max_timestamp(db, SystemTaskTemplate, SystemTaskTemplate.created_at)
        parts.append(ts.isoformat() if ts else "")
    if "tasks" in requested:
        effective_columns = [Task.due_date, Task.start_date, Task.created_at]
        if hasattr(Task, "planned_for"):
            effective_columns.insert(0, getattr(Task, "planned_for"))
        effective_date = cast(func.coalesce(*effective_columns), Date)
        task_filters = [effective_date >= week_start, effective_date <= week_end]
        ts = await _max_timestamp(db, Task, Task.updated_at, task_filters)
        parts.append(ts.isoformat() if ts else "")

    raw = "|".join(parts).encode("utf-8")
    return hashlib.sha1(raw).hexdigest()


@router.get("", response_model=CommonViewResponse)
async def get_common_view(
    request: Request,
    response: Response,
    week_start: date | None = None,
    include: str | None = None,
    department_id: uuid.UUID | None = None,
    include_all_departments: bool = False,
    max_items_per_bucket: int | None = None,
    debug: int = 0,
    db: AsyncSession = Depends(get_db),
    user=Depends(get_current_user),
) -> CommonViewResponse | Response:
    if department_id is not None and not include_all_departments:
        ensure_department_access(user, department_id)
    if include_all_departments:
        department_id = None
    if user.role == UserRole.STAFF and department_id is None and not include_all_departments:
        department_id = user.department_id

    requested: list[str] = []
    if include:
        for token in include.split(","):
            cleaned = token.strip()
            if cleaned in KNOWN_INCLUDES and cleaned not in requested:
                requested.append(cleaned)
    if not requested:
        requested = list(DEFAULT_INCLUDES)

    week_start_date = _week_start_for(week_start)
    week_end = week_start_date + timedelta(days=6)

    etag = await _compute_etag(
        db=db,
        week_start=week_start_date,
        week_end=week_end,
        requested=requested,
        user=user,
        department_id=department_id,
        include_all_departments=include_all_departments,
    )
    if_match = request.headers.get("if-none-match")
    if if_match and if_match.strip('"') == etag:
        return Response(status_code=status.HTTP_304_NOT_MODIFIED, headers={"ETag": etag})

    cache_key = f"{week_start_date}|{week_end}|{','.join(sorted(requested))}|{department_id}|{include_all_departments}|{user.role}"
    if SERVER_CACHE_TTL_SECONDS > 0:
        cached = _cache.get(cache_key)
        if cached:
            expires_at, cached_etag, payload = cached
            if expires_at >= datetime.utcnow().timestamp():
                if if_match and if_match.strip('"') == cached_etag:
                    return Response(status_code=status.HTTP_304_NOT_MODIFIED, headers={"ETag": cached_etag})
                payload_copy = dict(payload)
                payload_copy["trace_id"] = str(uuid.uuid4())
                response.headers["ETag"] = cached_etag
                return CommonViewResponse(**payload_copy).copy(
                    update={"trace_id": payload_copy["trace_id"]}
                )

    trace_id = str(uuid.uuid4())
    timings: dict[str, float] | None = {} if debug else None

    t0 = perf_counter()
    max_items = max_items_per_bucket or DEFAULT_MAX_ITEMS_PER_BUCKET

    items = {bucket: [] for bucket in BUCKETS}
    included: list[str] = []
    missing: list[str] = []

    def _time_start() -> float:
        return perf_counter()

    def _time_end(label: str, start: float) -> None:
        if timings is not None:
            timings[label] = (perf_counter() - start) * 1000

    users_map: dict[uuid.UUID, User] = {}
    departments_map: dict[uuid.UUID, Department] = {}

    needs_users = any(name in requested for name in ["users", "entries", "tasks", "meetings", "system_tasks"])
    if needs_users:
        ts = _time_start()
        users_stmt = select(User).where(User.is_active.is_(True))
        users = (await db.execute(users_stmt.order_by(User.full_name))).scalars().all()
        users_map = {u.id: u for u in users}
        _time_end("users", ts)
        if "users" in requested:
            included.append("users")
    needs_departments = any(name in requested for name in ["departments", "meetings", "tasks"])
    if needs_departments:
        ts = _time_start()
        departments = (await db.execute(select(Department).order_by(Department.name))).scalars().all()
        departments_map = {d.id: d for d in departments}
        _time_end("departments", ts)
        if "departments" in requested:
            included.append("departments")

    if "entries" in requested:
        ts = _time_start()
        effective_date = func.coalesce(CommonEntry.entry_date, func.date(CommonEntry.created_at))
        non_annual_stmt = select(CommonEntry).where(CommonEntry.category != CommonCategory.annual_leave)
        non_annual_stmt = non_annual_stmt.where(effective_date >= week_start_date, effective_date <= week_end)
        non_annual_entries = (await db.execute(non_annual_stmt)).scalars().all()

        annual_stmt = select(CommonEntry).where(CommonEntry.category == CommonCategory.annual_leave)
        annual_entries = (await db.execute(annual_stmt)).scalars().all()
        annual_overlapping: list[CommonEntry] = []
        for entry in annual_entries:
            start_date, end_date, _, _, _, _, _ = _parse_annual_leave(entry)
            if end_date < week_start_date or start_date > week_end:
                continue
            annual_overlapping.append(entry)
        entries = non_annual_entries + annual_overlapping

        for e in entries:
            user_for_entry = None
            if e.assigned_to_user_id:
                user_for_entry = users_map.get(e.assigned_to_user_id)
            if user_for_entry is None:
                user_for_entry = users_map.get(e.created_by_user_id)
            if department_id and user_for_entry and user_for_entry.department_id != department_id:
                continue
            person_name = (
                user_for_entry.full_name
                if user_for_entry and user_for_entry.full_name
                else user_for_entry.username
                if user_for_entry and user_for_entry.username
                else e.title
            )

            entry_date = e.entry_date or e.created_at.date()
            if e.description:
                match = re.search(r"Date:\s*(\d{4}-\d{2}-\d{2})", e.description, re.I)
                if match:
                    try:
                        entry_date = date.fromisoformat(match.group(1))
                    except ValueError:
                        pass

            if e.category == CommonCategory.delays:
                note = e.description or ""
                start = "08:00"
                until = "09:00"
                start_match = re.search(r"Start:\s*(\d{1,2}:\d{2})", note, re.I)
                if start_match:
                    start = start_match.group(1)
                    note = re.sub(r"Start:\s*\d{1,2}:\d{2}", "", note, flags=re.I).strip()
                until_match = re.search(r"Until:\s*(\d{1,2}:\d{2})", note, re.I)
                if until_match:
                    until = until_match.group(1)
                    note = re.sub(r"Until:\s*\d{1,2}:\d{2}", "", note, flags=re.I).strip()
                note = re.sub(r"Date:\s*\d{4}-\d{2}-\d{2}", "", note, flags=re.I).strip()
                items["late"].append(
                    {
                        "id": f"entry:{e.id}",
                        "entryId": str(e.id),
                        "person": person_name or "Unknown",
                        "date": entry_date.isoformat(),
                        "until": until,
                        "start": start,
                        "note": note or None,
                    }
                )
            elif e.category == CommonCategory.absences:
                note = e.description or ""
                from_time = "08:00"
                to_time = "23:00"
                from_to_match = re.search(r"From:\s*(\d{1,2}:\d{2})\s*-\s*To:\s*(\d{1,2}:\d{2})", note, re.I)
                if from_to_match:
                    from_time = from_to_match.group(1)
                    to_time = from_to_match.group(2)
                    note = re.sub(
                        r"From:\s*\d{1,2}:\d{2}\s*-\s*To:\s*\d{1,2}:\d{2}", "", note, flags=re.I
                    ).strip()
                note = re.sub(r"Date:\s*\d{4}-\d{2}-\d{2}", "", note, flags=re.I).strip()
                items["absent"].append(
                    {
                        "id": f"entry:{e.id}",
                        "entryId": str(e.id),
                        "person": person_name or "Unknown",
                        "date": entry_date.isoformat(),
                        "from": from_time,
                        "to": to_time,
                        "note": note or None,
                    }
                )
            elif e.category == CommonCategory.annual_leave:
                start_date, end_date, full_day, start_time, end_time, note, is_all_users = _parse_annual_leave(e)
                items["leave"].append(
                    {
                        "id": f"entry:{e.id}",
                        "entryId": str(e.id),
                        "person": person_name or "Unknown",
                        "startDate": start_date.isoformat(),
                        "endDate": end_date.isoformat(),
                        "fullDay": full_day,
                        "from": start_time,
                        "to": end_time,
                        "note": note,
                        "isAllUsers": is_all_users,
                        "userId": str(e.assigned_to_user_id or e.created_by_user_id),
                    }
                )
            elif e.category == CommonCategory.blocks:
                items["blocked"].append(
                    {
                        "id": f"entry:{e.id}",
                        "title": e.title,
                        "person": person_name or "Unknown",
                        "date": entry_date.isoformat(),
                        "note": e.description or None,
                    }
                )
            elif e.category == CommonCategory.external_tasks:
                items["external"].append(
                    {
                        "id": f"entry:{e.id}",
                        "title": e.title,
                        "date": entry_date.isoformat(),
                        "time": "14:00",
                        "platform": "Zoom",
                        "owner": person_name or "Unknown",
                        "department": None,
                    }
                )
            elif e.category == CommonCategory.problems:
                items["problems"].append(
                    {
                        "id": f"entry:{e.id}",
                        "entryId": str(e.id),
                        "title": e.title,
                        "person": person_name or "Unknown",
                        "date": entry_date.isoformat(),
                        "note": e.description or None,
                    }
                )
            elif e.category in (CommonCategory.complaints, CommonCategory.requests, CommonCategory.proposals):
                items["feedback"].append(
                    {
                        "id": f"entry:{e.id}",
                        "entryId": str(e.id),
                        "title": e.title,
                        "person": person_name or "Unknown",
                        "date": entry_date.isoformat(),
                        "note": e.description or None,
                    }
                )

        included.append("entries")
        _time_end("entries", ts)
    if "tasks" in requested:
        ts = _time_start()
        stmt = select(Task).where(Task.is_active.is_(True))
        if department_id:
            stmt = stmt.outerjoin(Project, Task.project_id == Project.id).where(
                or_(Task.department_id == department_id, Project.department_id == department_id)
            )
        effective_columns = [Task.due_date, Task.start_date, Task.created_at]
        if hasattr(Task, "planned_for"):
            effective_columns.insert(0, getattr(Task, "planned_for"))
        effective_date = cast(func.coalesce(*effective_columns), Date)
        stmt = stmt.where(effective_date >= week_start_date, effective_date <= week_end)
        tasks = (await db.execute(stmt.order_by(Task.created_at))).scalars().all()
        tasks = [t for t in tasks if _should_include_task(t)]

        task_ids = [t.id for t in tasks]
        assignee_rows = (
            await db.execute(
                select(TaskAssignee.task_id, User)
                .join(User, TaskAssignee.user_id == User.id)
                .where(TaskAssignee.task_id.in_(task_ids))
            )
        ).all()
        assignees_by_task: dict[uuid.UUID, list[User]] = {}
        for task_id, user_row in assignee_rows:
            assignees_by_task.setdefault(task_id, []).append(user_row)

        project_ids = list({t.project_id for t in tasks if t.project_id})
        projects: dict[uuid.UUID, Project] = {}
        if project_ids:
            rows = (await db.execute(select(Project).where(Project.id.in_(project_ids)))).scalars().all()
            projects = {p.id: p for p in rows}

        product_content_dept_id: uuid.UUID | None = None
        for d in departments_map.values():
            name_lower = (d.name or "").lower()
            if "project content" in name_lower or "content manager" in name_lower or d.code == "PCM":
                product_content_dept_id = d.id
                break

        priority_map: dict[uuid.UUID, dict[str, Any]] = {}
        for t in tasks:
            assignees = assignees_by_task.get(t.id) or []
            if not assignees and t.assigned_to:
                user_for_task = users_map.get(t.assigned_to)
                if user_for_task:
                    assignees = [user_for_task]
            assignee_names = [u.full_name or u.username or u.email for u in assignees if u]
            owner_label = ", ".join([n for n in assignee_names if n]) or "Unknown"

            phase_value = (t.phase or "").upper()
            is_check_phase = phase_value in {"CHECK", "CONTROL"}
            task_dates = _get_task_dates(t, is_check_phase)
            task_dates = [d for d in task_dates if week_start_date <= d <= week_end]
            if not task_dates:
                continue

            for task_date in task_dates:
                if t.is_bllok:
                    items["blocked"].append(
                        {
                            "id": f"task:{t.id}:{task_date.isoformat()}",
                            "title": t.title,
                            "person": owner_label,
                            "assignees": assignee_names or None,
                            "date": task_date.isoformat(),
                            "note": t.description or None,
                        }
                    )
                if t.is_1h_report:
                    items["oneH"].append(
                        {
                            "id": f"task:{t.id}:{task_date.isoformat()}",
                            "title": t.title,
                            "person": owner_label,
                            "assignees": assignee_names or None,
                            "date": task_date.isoformat(),
                            "note": t.description or None,
                        }
                    )
                if t.is_personal:
                    items["personal"].append(
                        {
                            "id": f"task:{t.id}:{task_date.isoformat()}",
                            "title": t.title,
                            "person": owner_label,
                            "assignees": assignee_names or None,
                            "date": task_date.isoformat(),
                            "note": t.description or None,
                        }
                    )
                if t.is_r1:
                    items["r1"].append(
                        {
                            "id": f"task:{t.id}:{task_date.isoformat()}",
                            "title": t.title,
                            "date": task_date.isoformat(),
                            "owner": owner_label,
                            "assignees": assignee_names or None,
                            "note": t.description or None,
                        }
                    )

            if t.project_id:
                project = projects.get(t.project_id)
                if not project:
                    continue
                base_title = (project.title or "").strip()
                if not base_title:
                    continue
                project_name = (
                    f"{base_title} - {project.total_products}"
                    if project.project_type == "MST" and project.total_products and project.total_products > 0
                    else base_title
                )
                entry = priority_map.get(t.project_id)
                if entry is None:
                    entry = {
                        "project": project_name,
                        "assignees_by_date": {},
                        "dates": set(),
                    }
                    priority_map[t.project_id] = entry
                for task_date in task_dates:
                    entry["dates"].add(task_date)
                    date_key = task_date.isoformat()
                    entry["assignees_by_date"].setdefault(date_key, set()).update(assignee_names)

        expanded_priority: list[dict[str, Any]] = []
        for project_id, entry in priority_map.items():
            project = projects.get(project_id)
            if not project:
                continue
            title_upper = (project.title or "").upper()
            is_mst = project.project_type == "MST" or "MST" in title_upper
            is_vs_vl = "VS" in title_upper or "VL" in title_upper
            is_product_content = project.department_id == product_content_dept_id

            dates_to_use: list[date] = []
            if (is_mst or is_vs_vl) and is_product_content:
                if project.due_date:
                    start_date = week_start_date
                    end_date = min(week_end, project.due_date.date())
                    current = start_date
                    while current <= end_date:
                        if current.weekday() < 5:
                            dates_to_use.append(current)
                        current = current + timedelta(days=1)
                elif entry["dates"]:
                    dates_to_use = sorted(entry["dates"])
                else:
                    dates_to_use = [week_start_date]
            else:
                if entry["dates"]:
                    dates_to_use = sorted(entry["dates"])
                else:
                    continue

            if entry["dates"]:
                merged = set(dates_to_use)
                merged.update(entry["dates"])
                dates_to_use = sorted(merged)
            dates_to_use = [d for d in dates_to_use if week_start_date <= d <= week_end]
            if not dates_to_use:
                continue

            for d in dates_to_use:
                date_key = d.isoformat()
                assignees = sorted(entry["assignees_by_date"].get(date_key, set()))
                dept_id = project.department_id
                dept_name = departments_map.get(dept_id).name if dept_id and dept_id in departments_map else "Other"
                expanded_priority.append(
                    {
                        "id": f"priority:{project_id}:{date_key}",
                        "project": entry["project"],
                        "date": date_key,
                        "assignees": assignees,
                        "department_id": str(dept_id) if dept_id else None,
                        "department_name": dept_name,
                    }
                )

        items["priority"] = expanded_priority
        included.append("tasks")
        _time_end("tasks", ts)

    if "meetings" in requested:
        ts = _time_start()
        meeting_stmt = select(Meeting)
        if department_id:
            meeting_stmt = meeting_stmt.where(Meeting.department_id == department_id)
        meetings = (await db.execute(meeting_stmt.order_by(Meeting.starts_at, Meeting.created_at.desc()))).scalars().all()
        week_days = [week_start_date + timedelta(days=i) for i in range(7)]

        for meeting in meetings:
            owner_user = users_map.get(meeting.created_by) if meeting.created_by else None
            owner_name = owner_user.full_name if owner_user and owner_user.full_name else owner_user.username if owner_user else "Unknown"
            department_name = (
                departments_map.get(meeting.department_id).name
                if meeting.department_id in departments_map
                else "Department TBD"
            )
            if meeting.recurrence_type and meeting.recurrence_type != "none":
                time_label = _format_time(meeting.starts_at)
                for day in week_days:
                    if _meeting_occurs_on_date(meeting, day):
                        target = "external" if meeting.meeting_type == "external" else "internal"
                        items[target].append(
                            {
                                "id": f"meeting:{meeting.id}:{day.isoformat()}",
                                "title": meeting.title or ("External meeting" if target == "external" else "Internal meeting"),
                                "date": day.isoformat(),
                                "time": time_label,
                                "platform": meeting.platform or "TBD",
                                "owner": owner_name,
                                "department": department_name,
                            }
                        )
            else:
                date_source = meeting.starts_at or meeting.created_at
                if date_source is None:
                    continue
                local_date_source = _as_tirane_dt(date_source) or date_source
                day = local_date_source.date()
                if not (week_start_date <= day <= week_end):
                    continue
                target = "external" if meeting.meeting_type == "external" else "internal"
                items[target].append(
                    {
                        "id": f"meeting:{meeting.id}:{day.isoformat()}",
                        "title": meeting.title or ("External meeting" if target == "external" else "Internal meeting"),
                        "date": day.isoformat(),
                        "time": _format_time(meeting.starts_at),
                        "platform": meeting.platform or "TBD",
                        "owner": owner_name,
                        "department": department_name,
                    }
                )

        included.append("meetings")
        _time_end("meetings", ts)

    if "system_tasks" in requested:
        ts = _time_start()
        templates = (await db.execute(select(SystemTaskTemplate))).scalars().all()
        template_ids = [t.id for t in templates]
        alignment_user_rows = (
            await db.execute(
                select(SystemTaskTemplateAlignmentUser.template_id, SystemTaskTemplateAlignmentUser.user_id)
                .where(SystemTaskTemplateAlignmentUser.template_id.in_(template_ids))
            )
        ).all()
        alignment_users_map: dict[uuid.UUID, list[uuid.UUID]] = {}
        for tid, uid in alignment_user_rows:
            alignment_users_map.setdefault(tid, []).append(uid)

        gane_user = next((u for u in users_map.values() if (u.username or "").lower() == "gane.arifaj"), None)
        gane_user_id = gane_user.id if gane_user else None
        week_dates = _week_dates(week_start_date)

        for tmpl in templates:
            alignment_ids = alignment_users_map.get(tmpl.id, [])
            if not alignment_ids:
                continue
            if not gane_user_id or gane_user_id not in alignment_ids:
                continue
            for day in week_dates:
                if not matches_template_date(tmpl, day):
                    continue
                assignee_ids = tmpl.assignee_ids or ([tmpl.default_assignee_id] if tmpl.default_assignee_id else [])
                assignees = []
                for uid in assignee_ids:
                    user_obj = users_map.get(uid)
                    if user_obj:
                        assignees.append(user_obj.full_name or user_obj.username or user_obj.email)
                bz_with = [
                    _initials(users_map[uid].full_name or users_map[uid].username or "")
                    for uid in alignment_ids
                    if uid in users_map
                ]
                bz_label = ", ".join([v for v in bz_with if v])
                items["bz"].append(
                    {
                        "id": f"system:{tmpl.id}:{day.isoformat()}",
                        "title": tmpl.title or "-",
                        "date": day.isoformat(),
                        "time": tmpl.alignment_time.strftime("%H:%M") if tmpl.alignment_time else "TBD",
                        "assignees": assignees or None,
                        "bzWithLabel": bz_label,
                    }
                )

        included.append("system_tasks")
        _time_end("system_tasks", ts)
    counts = CommonViewCounts(**{k: len(items[k]) for k in BUCKETS})
    truncated: dict[str, bool] = {}
    for bucket in BUCKETS:
        if len(items[bucket]) > max_items:
            items[bucket] = items[bucket][:max_items]
            truncated[bucket] = True
        else:
            truncated[bucket] = False

    guardrails = CommonViewGuardrails(max_items_per_bucket=max_items, truncated=truncated)

    if timings is not None:
        timings["total"] = (perf_counter() - t0) * 1000

    missing = [name for name in requested if name not in included]

    payload = CommonViewResponse(
        schema_version=1,
        generated_at=datetime.utcnow(),
        week_start=week_start_date,
        week_end=week_end,
        requested=requested,
        included=included,
        missing=missing,
        counts=counts,
        items=CommonViewItemPayload(**items),
        guardrails=guardrails,
        trace_id=trace_id,
        timings_ms=timings,
        users=[{
            "id": str(u.id),
            "username": u.username,
            "full_name": u.full_name,
            "role": u.role,
            "department_id": str(u.department_id) if u.department_id else None,
            "is_active": u.is_active,
        } for u in users_map.values()] if "users" in requested else None,
        departments=[{"id": str(d.id), "code": d.code, "name": d.name} for d in departments_map.values()] if "departments" in requested else None,
        meetings=None,
        system_tasks=None,
        tasks=None,
    )

    payload_dict = payload.dict()
    if SERVER_CACHE_TTL_SECONDS > 0:
        _cache[cache_key] = (datetime.utcnow().timestamp() + SERVER_CACHE_TTL_SECONDS, etag, payload_dict)

    response.headers["ETag"] = etag
    response_payload = CommonViewResponse(**payload_dict)
    return response_payload.copy(update={"trace_id": trace_id})
