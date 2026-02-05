from __future__ import annotations

import uuid
from datetime import date, datetime, timedelta, timezone

from fastapi import APIRouter, Depends, HTTPException, status
from sqlalchemy import or_, select
from sqlalchemy.ext.asyncio import AsyncSession

from app.api.access import ensure_department_access
from app.api.deps import get_current_user
from app.db import get_db
from app.models.enums import GaNoteStatus, UserRole
from app.models.ga_note import GaNote
from app.models.project import Project
from app.models.daily_report_ga_entry import DailyReportGaEntry
from app.models.system_task_occurrence import SystemTaskOccurrence
from app.models.system_task_template import SystemTaskTemplate
from app.models.task import Task
from app.models.task_assignee import TaskAssignee
from app.models.user import User
from app.schemas.daily_report import (
    DailyReportResponse,
    DailyReportSystemOccurrence,
    DailyReportTaskItem,
    DailyReportGaEntryOut,
    DailyReportGaEntryUpsert,
    DailyReportGaNoteOut,
    DailyReportGaTableResponse,
)
from app.schemas.task import TaskAssigneeOut, TaskOut
from app.services.system_task_occurrences import (
    OPEN,
    ensure_occurrences_in_range,
)


router = APIRouter()


def _user_to_assignee(user: User) -> TaskAssigneeOut:
    return TaskAssigneeOut(
        id=user.id,
        email=user.email,
        username=user.username,
        full_name=user.full_name,
    )


async def _assignees_for_tasks(db: AsyncSession, task_ids: list[uuid.UUID]) -> dict[uuid.UUID, list[TaskAssigneeOut]]:
    if not task_ids:
        return {}
    rows = (
        await db.execute(
            select(TaskAssignee.task_id, User)
            .join(User, TaskAssignee.user_id == User.id)
            .where(TaskAssignee.task_id.in_(task_ids))
            .order_by(User.full_name)
        )
    ).all()
    out: dict[uuid.UUID, list[TaskAssigneeOut]] = {tid: [] for tid in task_ids}
    for tid, user in rows:
        out.setdefault(tid, []).append(_user_to_assignee(user))
    return out


def _task_to_out(t: Task, assignees: list[TaskAssigneeOut]) -> TaskOut:
    # Reuse TaskOut model shape; keep it minimal for reporting.
    return TaskOut(
        id=t.id,
        title=t.title,
        description=t.description,
        internal_notes=t.internal_notes,
        project_id=t.project_id,
        dependency_task_id=t.dependency_task_id,
        department_id=t.department_id,
        assigned_to=t.assigned_to,
        assignees=assignees,
        created_by=t.created_by,
        ga_note_origin_id=t.ga_note_origin_id,
        system_template_origin_id=t.system_template_origin_id,
        status=t.status,
        priority=t.priority,
        finish_period=t.finish_period,
        phase=t.phase,
        progress_percentage=t.progress_percentage,
        daily_products=t.daily_products,
        start_date=t.start_date,
        due_date=t.due_date,
        completed_at=t.completed_at,
        is_bllok=t.is_bllok,
        is_1h_report=t.is_1h_report,
        is_r1=t.is_r1,
        is_personal=t.is_personal,
        is_active=t.is_active,
        user_comment=None,
        created_at=t.created_at,
        updated_at=t.updated_at,
    )


def _planned_range_for_task(t: Task) -> tuple[date | None, date | None]:
    if t.due_date is None:
        return None, None
    due = t.due_date.date()
    if t.start_date is not None:
        start = t.start_date.date()
        # Only treat start_date as a planning start if it forms a valid interval.
        if start <= due:
            return start, due
    # Default: single-day planned task on due date.
    return due, due


@router.get("/daily", response_model=DailyReportResponse)
async def daily_report(
    day: date,
    department_id: uuid.UUID | None = None,
    user_id: uuid.UUID | None = None,
    db: AsyncSession = Depends(get_db),
    user=Depends(get_current_user),
) -> DailyReportResponse:
    """
    Daily Report = execution/accountability:
    - tasks scheduled for day
    - tasks from previous days not completed (late X days, show original planned date)
    - system tasks: per-occurrence status (OPEN / DONE / NOT_DONE / SKIPPED), with late logic
    """
    if user.role == UserRole.STAFF:
        department_id = user.department_id
        user_id = user.id

    if department_id is not None:
        ensure_department_access(user, department_id)
    elif user.role != UserRole.ADMIN:
        department_id = user.department_id

    if user_id is None:
        user_id = user.id

    # --- Regular tasks (non-system) ---
    task_stmt = (
        select(Task)
        .where(Task.completed_at.is_(None))
        .where(Task.is_active.is_(True))
        .where(Task.system_template_origin_id.is_(None))
        .where(Task.due_date.is_not(None))
    )
    if department_id is not None:
        task_stmt = task_stmt.where(Task.department_id == department_id)
    if user_id is not None:
        task_stmt = task_stmt.where(Task.assigned_to == user_id)

    tasks = (await db.execute(task_stmt.order_by(Task.due_date, Task.created_at))).scalars().all()
    task_ids = [t.id for t in tasks]
    assignee_map = await _assignees_for_tasks(db, task_ids)
    project_title_by_id: dict[uuid.UUID, str] = {}
    project_ids = {t.project_id for t in tasks if t.project_id is not None}
    if project_ids:
        project_rows = (
            await db.execute(
                select(Project.id, Project.title).where(Project.id.in_(project_ids))
            )
        ).all()
        for pid, title in project_rows:
            if title:
                project_title_by_id[pid] = title

    tasks_today: list[DailyReportTaskItem] = []
    tasks_overdue: list[DailyReportTaskItem] = []
    for t in tasks:
        planned_start, planned_end = _planned_range_for_task(t)
        if planned_start is None or planned_end is None:
            continue

        if planned_start <= day <= planned_end:
            tasks_today.append(
                DailyReportTaskItem(
                    task=_task_to_out(t, assignee_map.get(t.id, [])),
                    project_title=project_title_by_id.get(t.project_id) if t.project_id else None,
                    planned_start=planned_start,
                    planned_end=planned_end,
                    original_planned_end=t.original_due_date.date() if t.original_due_date else planned_end,
                    is_overdue=False,
                    late_days=None,
                )
            )
        elif planned_end < day:
            late_days = (day - planned_end).days
            tasks_overdue.append(
                DailyReportTaskItem(
                    task=_task_to_out(t, assignee_map.get(t.id, [])),
                    project_title=project_title_by_id.get(t.project_id) if t.project_id else None,
                    planned_start=planned_start,
                    planned_end=planned_end,
                    original_planned_end=t.original_due_date.date() if t.original_due_date else planned_end,
                    is_overdue=True,
                    late_days=late_days,
                )
            )

    # --- System/recurring occurrences ---
    # Ensure occurrences exist so overdue logic is consistent.
    # Backfill a limited window; older overdue occurrences should already exist if the scheduler ran.
    await ensure_occurrences_in_range(db=db, start=day - timedelta(days=60), end=day)
    await db.commit()

    occ_today_rows = (
        await db.execute(
            select(SystemTaskOccurrence, SystemTaskTemplate)
            .join(SystemTaskTemplate, SystemTaskOccurrence.template_id == SystemTaskTemplate.id)
            .where(SystemTaskOccurrence.user_id == user_id)
            .where(SystemTaskOccurrence.occurrence_date == day)
            .order_by(SystemTaskTemplate.title)
        )
    ).all()
    occ_overdue_rows = (
        await db.execute(
            select(SystemTaskOccurrence, SystemTaskTemplate)
            .join(SystemTaskTemplate, SystemTaskOccurrence.template_id == SystemTaskTemplate.id)
            .where(SystemTaskOccurrence.user_id == user_id)
            .where(SystemTaskOccurrence.occurrence_date < day)
            .where(SystemTaskOccurrence.status == OPEN)
            .order_by(SystemTaskOccurrence.occurrence_date.desc(), SystemTaskTemplate.title)
        )
    ).all()

    system_today: list[DailyReportSystemOccurrence] = []
    for occ, tmpl in occ_today_rows:
        system_today.append(
            DailyReportSystemOccurrence(
                template_id=tmpl.id,
                title=tmpl.title,
                frequency=tmpl.frequency,
                department_id=tmpl.department_id,
                scope=tmpl.scope,
                occurrence_date=occ.occurrence_date,
                status=occ.status,
                comment=occ.comment,
                acted_at=occ.acted_at,
                is_overdue=False,
                late_days=None,
            )
        )

    today_template_ids = {tmpl.id for _, tmpl in occ_today_rows}
    seen_templates: set[uuid.UUID] = set()
    system_overdue: list[DailyReportSystemOccurrence] = []
    for occ, tmpl in occ_overdue_rows:
        if tmpl.id in today_template_ids or tmpl.id in seen_templates:
            continue
        seen_templates.add(tmpl.id)
        late_days = (day - occ.occurrence_date).days
        system_overdue.append(
            DailyReportSystemOccurrence(
                template_id=tmpl.id,
                title=tmpl.title,
                frequency=tmpl.frequency,
                department_id=tmpl.department_id,
                scope=tmpl.scope,
                occurrence_date=occ.occurrence_date,
                status=occ.status,
                comment=occ.comment,
                acted_at=occ.acted_at,
                is_overdue=True,
                late_days=late_days,
            )
        )

    return DailyReportResponse(
        day=day,
        tasks_today=tasks_today,
        tasks_overdue=tasks_overdue,
        system_today=system_today,
        system_overdue=system_overdue,
    )


@router.get("/daily-ga-table", response_model=DailyReportGaTableResponse)
async def daily_ga_table(
    day: date,
    department_id: uuid.UUID | None = None,
    user_id: uuid.UUID | None = None,
    db: AsyncSession = Depends(get_db),
    user=Depends(get_current_user),
) -> DailyReportGaTableResponse:
    if user.role == UserRole.STAFF:
        department_id = user.department_id
        user_id = user.id

    if department_id is not None:
        ensure_department_access(user, department_id)
    elif user.role != UserRole.ADMIN:
        department_id = user.department_id

    if user_id is None:
        user_id = user.id

    entry = None
    if department_id is not None:
        entry = (
            await db.execute(
                select(DailyReportGaEntry).where(
                    DailyReportGaEntry.user_id == user_id,
                    DailyReportGaEntry.department_id == department_id,
                    DailyReportGaEntry.entry_date == day,
                )
            )
        ).scalar_one_or_none()

    task_stmt = (
        select(Task)
        .where(Task.completed_at.is_(None))
        .where(Task.is_active.is_(True))
        .where(Task.system_template_origin_id.is_(None))
        .where(Task.due_date.is_not(None))
    )
    if department_id is not None:
        task_stmt = task_stmt.where(Task.department_id == department_id)
    if user_id is not None:
        task_stmt = task_stmt.where(Task.assigned_to == user_id)

    tasks = (await db.execute(task_stmt.order_by(Task.due_date, Task.created_at))).scalars().all()
    project_ids: set[uuid.UUID] = set()
    for task in tasks:
        planned_start, planned_end = _planned_range_for_task(task)
        if planned_start is None or planned_end is None:
            continue
        if planned_start <= day <= planned_end and task.project_id is not None:
            project_ids.add(task.project_id)

    cutoff = datetime.utcnow() - timedelta(days=7)
    closed_cutoff = datetime.utcnow() - timedelta(days=5)
    base_filters = [
        GaNote.created_at >= cutoff,
        or_(
            GaNote.status != GaNoteStatus.CLOSED,
            GaNote.completed_at.is_(None),
            GaNote.completed_at >= closed_cutoff,
        ),
    ]

    user_notes = (
        await db.execute(
            select(GaNote)
            .where(GaNote.created_by == user_id)
            .where(*base_filters)
            .order_by(GaNote.created_at.desc())
        )
    ).scalars().all()

    project_notes: list[GaNote] = []
    if project_ids:
        project_notes = (
            await db.execute(
                select(GaNote)
                .where(GaNote.project_id.in_(project_ids))
                .where(*base_filters)
                .order_by(GaNote.created_at.desc())
            )
        ).scalars().all()

    notes_by_id: dict[uuid.UUID, GaNote] = {}
    for note in user_notes + project_notes:
        notes_by_id[note.id] = note

    note_project_ids = {note.project_id for note in notes_by_id.values() if note.project_id}
    project_map: dict[uuid.UUID, Project] = {}
    if note_project_ids:
        projects = (
            await db.execute(select(Project).where(Project.id.in_(note_project_ids)))
        ).scalars().all()
        project_map = {proj.id: proj for proj in projects}

    def _project_name(pid: uuid.UUID | None) -> str | None:
        if not pid:
            return None
        proj = project_map.get(pid)
        if not proj:
            return None
        return proj.title or proj.name

    notes_sorted = sorted(notes_by_id.values(), key=lambda n: n.created_at, reverse=True)
    notes_out = [
        DailyReportGaNoteOut(
            id=n.id,
            content=n.content,
            note_type=n.note_type,
            status=n.status,
            priority=n.priority,
            created_at=n.created_at,
            project_id=n.project_id,
            project_name=_project_name(n.project_id),
        )
        for n in notes_sorted
    ]

    return DailyReportGaTableResponse(
        entry=DailyReportGaEntryOut(
            id=entry.id,
            user_id=entry.user_id,
            department_id=entry.department_id,
            entry_date=entry.entry_date,
            content=entry.content,
            created_at=entry.created_at,
            updated_at=entry.updated_at,
        )
        if entry
        else None,
        notes=notes_out,
    )


@router.put("/daily-ga-entry", response_model=DailyReportGaEntryOut)
async def upsert_daily_ga_entry(
    payload: DailyReportGaEntryUpsert,
    db: AsyncSession = Depends(get_db),
    user=Depends(get_current_user),
) -> DailyReportGaEntryOut:
    department_id = payload.department_id
    user_id = payload.user_id or user.id

    if user.role == UserRole.STAFF:
        user_id = user.id
        department_id = user.department_id

    if department_id is None:
        raise HTTPException(status_code=status.HTTP_400_BAD_REQUEST, detail="department_id required")

    ensure_department_access(user, department_id)

    entry = (
        await db.execute(
            select(DailyReportGaEntry).where(
                DailyReportGaEntry.user_id == user_id,
                DailyReportGaEntry.department_id == department_id,
                DailyReportGaEntry.entry_date == payload.day,
            )
        )
    ).scalar_one_or_none()

    if entry is None:
        entry = DailyReportGaEntry(
            user_id=user_id,
            department_id=department_id,
            entry_date=payload.day,
            content=payload.content,
        )
        db.add(entry)
    else:
        entry.content = payload.content

    await db.commit()
    await db.refresh(entry)

    return DailyReportGaEntryOut(
        id=entry.id,
        user_id=entry.user_id,
        department_id=entry.department_id,
        entry_date=entry.entry_date,
        content=entry.content,
        created_at=entry.created_at,
        updated_at=entry.updated_at,
    )

