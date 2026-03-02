from __future__ import annotations

import uuid
from datetime import date, datetime, time, timedelta, timezone

from fastapi import APIRouter, Depends, HTTPException, Response, status
from pydantic import BaseModel
from sqlalchemy import and_, delete, func, insert, or_, select, text
from sqlalchemy.dialects.postgresql import insert as pg_insert
from sqlalchemy.ext.asyncio import AsyncSession

from app.api.access import ensure_department_access, ensure_manager_or_admin
from app.api.deps import get_current_user, require_admin
from app.db import get_db
from app.models.department import Department
from app.models.enums import (
    FrequencyType,
    SystemTaskOutcome,
    SystemTaskRecurrenceKind,
    SystemTaskScope,
    TaskFinishPeriod,
    TaskPriority,
    TaskStatus,
    UserRole,
)
from app.models.task import Task
from app.models.task_assignee import TaskAssignee
from app.models.task_user_comment import TaskUserComment
from app.models.system_task_template import SystemTaskTemplate
from app.models.system_task_template_assignee import SystemTaskTemplateAssignee
from app.models.system_task_template_alignment_role import SystemTaskTemplateAlignmentRole
from app.models.system_task_template_alignment_user import SystemTaskTemplateAlignmentUser
from app.models.user import User
from app.schemas.system_task import SystemTaskOut
from app.schemas.task import TaskAssigneeOut
from app.schemas.system_task_template import (
    SystemTaskTemplateCreate,
    SystemTaskTemplateOut,
    SystemTaskTemplateUpdate,
)
from app.services.system_task_recurrence import first_run_at


router = APIRouter()


DEFAULT_TIMEZONE = "Europe/Tirane"
DEFAULT_DUE_TIME = time(9, 0)
DEFAULT_LOOKAHEAD_DAYS = 30


def _enum_value(value) -> str | None:
    if value is None:
        return None
    return value.value if hasattr(value, "value") else value


def _user_to_assignee(user: User) -> TaskAssigneeOut:
    return TaskAssigneeOut(
        id=user.id,
        email=user.email,
        username=user.username,
        full_name=user.full_name,
    )


async def _validate_alignment_user_ids(db: AsyncSession, user_ids: list[uuid.UUID]) -> list[uuid.UUID]:
    if not user_ids:
        return []
    users = (await db.execute(select(User).where(User.id.in_(user_ids)))).scalars().all()
    if len(users) != len(set(user_ids)):
        raise HTTPException(status_code=status.HTTP_404_NOT_FOUND, detail="Alignment user not found")
    for u in users:
        if u.role != UserRole.MANAGER:
            raise HTTPException(status_code=status.HTTP_400_BAD_REQUEST, detail="Alignment users must be MANAGERs")
    # stable unique
    seen: set[uuid.UUID] = set()
    return [uid for uid in user_ids if not (uid in seen or seen.add(uid))]


async def _assignees_for_tasks(
    db: AsyncSession, task_ids: list[uuid.UUID]
) -> dict[uuid.UUID, list[TaskAssigneeOut]]:
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
    assignees: dict[uuid.UUID, list[TaskAssigneeOut]] = {task_id: [] for task_id in task_ids}
    for task_id, user in rows:
        assignees.setdefault(task_id, []).append(_user_to_assignee(user))
    return assignees


async def _alignment_maps_for_templates(
    db: AsyncSession, template_ids: list[uuid.UUID]
) -> tuple[dict[uuid.UUID, list[str]], dict[uuid.UUID, list[uuid.UUID]]]:
    if not template_ids:
        return {}, {}
    role_rows = (
        await db.execute(
            select(SystemTaskTemplateAlignmentRole.template_id, SystemTaskTemplateAlignmentRole.role)
            .where(SystemTaskTemplateAlignmentRole.template_id.in_(template_ids))
        )
    ).all()
    roles_map: dict[uuid.UUID, list[str]] = {}
    for tid, role in role_rows:
        roles_map.setdefault(tid, []).append(role)

    alignment_user_rows = (
        await db.execute(
            select(SystemTaskTemplateAlignmentUser.template_id, SystemTaskTemplateAlignmentUser.user_id)
            .where(SystemTaskTemplateAlignmentUser.template_id.in_(template_ids))
        )
    ).all()
    alignment_users_map: dict[uuid.UUID, list[uuid.UUID]] = {}
    for tid, uid in alignment_user_rows:
        alignment_users_map.setdefault(tid, []).append(uid)

    return roles_map, alignment_users_map


def _normalize_days_of_week(
    days_of_week: list[int] | None, day_of_week: int | None
) -> list[int] | None:
    if days_of_week is None and day_of_week is not None:
        days_of_week = [day_of_week]
    if days_of_week is None:
        return None
    cleaned = sorted({int(day) for day in days_of_week})
    if any(day < 0 or day > 6 for day in cleaned):
        raise HTTPException(status_code=status.HTTP_400_BAD_REQUEST, detail="Invalid weekday")
    return cleaned


def _recurrence_from_frequency(
    frequency: FrequencyType,
    days_of_week: list[int] | None,
    day_of_week: int | None,
    day_of_month: int | None,
) -> tuple[str, int, list[int] | None, int | None]:
    if frequency == FrequencyType.DAILY:
        return SystemTaskRecurrenceKind.DAILY.value, 1, None, None
    if frequency == FrequencyType.WEEKLY:
        normalized = _normalize_days_of_week(days_of_week, day_of_week)
        return SystemTaskRecurrenceKind.WEEKLY.value, 1, normalized, None
    if frequency == FrequencyType.MONTHLY:
        return SystemTaskRecurrenceKind.MONTHLY.value, 1, None, day_of_month
    if frequency == FrequencyType.THREE_MONTHS:
        return SystemTaskRecurrenceKind.MONTHLY.value, 3, None, day_of_month
    if frequency == FrequencyType.SIX_MONTHS:
        return SystemTaskRecurrenceKind.MONTHLY.value, 6, None, day_of_month
    if frequency == FrequencyType.YEARLY:
        return SystemTaskRecurrenceKind.YEARLY.value, 12, None, day_of_month
    return SystemTaskRecurrenceKind.DAILY.value, 1, None, None


def _normalize_time(value: time | None) -> time:
    return value or DEFAULT_DUE_TIME


def _apply_template_defaults(template: SystemTaskTemplate) -> None:
    if not template.timezone:
        template.timezone = DEFAULT_TIMEZONE
    if template.due_time is None:
        template.due_time = DEFAULT_DUE_TIME
    if template.lookahead_days is None:
        template.lookahead_days = DEFAULT_LOOKAHEAD_DAYS
    if template.interval is None:
        template.interval = 1
    if template.recurrence_kind is None:
        template.recurrence_kind = SystemTaskRecurrenceKind.DAILY.value
    if template.start_at is None:
        base = template.created_at or datetime.now(timezone.utc)
        template.start_at = datetime.combine(base.date(), _normalize_time(template.due_time), tzinfo=timezone.utc)


async def _sync_template_assignees(
    db: AsyncSession,
    template: SystemTaskTemplate,
    assignee_ids: list[uuid.UUID],
    recompute_next_run_at: bool = False,
) -> None:
    now = datetime.now(timezone.utc)
    existing_rows = (
        await db.execute(
            select(SystemTaskTemplateAssignee)
            .where(SystemTaskTemplateAssignee.template_id == template.id)
        )
    ).scalars().all()
    existing_map = {row.user_id: row for row in existing_rows}
    desired_ids = set(assignee_ids)

    for user_id in desired_ids:
        existing = existing_map.get(user_id)
        next_run = existing.next_run_at if existing else None
        if recompute_next_run_at or next_run is None:
            next_run = first_run_at(template, now)
        values = {
            "template_id": template.id,
            "user_id": user_id,
            "next_run_at": next_run,
            "active": True,
            "updated_at": now,
        }
        upsert = pg_insert(SystemTaskTemplateAssignee).values(values)
        upsert = upsert.on_conflict_do_update(
            index_elements=["template_id", "user_id"],
            set_={
                "next_run_at": next_run,
                "active": True,
                "updated_at": now,
            },
        )
        await db.execute(upsert)

    removed_ids = set(existing_map.keys()) - desired_ids
    if removed_ids:
        await db.execute(
            (
                SystemTaskTemplateAssignee.__table__.update()
                .where(SystemTaskTemplateAssignee.template_id == template.id)
                .where(SystemTaskTemplateAssignee.user_id.in_(removed_ids))
                .values(active=False, updated_at=now)
            )
        )


def _task_row_to_out(
    task: Task,
    template: SystemTaskTemplate,
    assignees: list[TaskAssigneeOut],
    user_comment: str | None = None,
    alignment_roles: list[str] | None = None,
    alignment_user_ids: list[uuid.UUID] | None = None,
    occurrence_date: date | None = None,
    next_occurrence_date_value: date | None = None,
    effective_occurrence_date: date | None = None,
    system_outcome: str | None = None,
) -> SystemTaskOut:
    priority_value = task.priority or TaskPriority.NORMAL

    outcome_value = system_outcome or task.system_outcome or SystemTaskOutcome.OPEN.value
    if outcome_value == SystemTaskOutcome.DONE.value:
        final_status = TaskStatus.DONE
    else:
        final_status = TaskStatus.TODO
    
    return SystemTaskOut(
        id=task.id,
        template_id=template.id,
        title=task.title,
        description=task.description,
        internal_notes=template.internal_notes,
        department_id=task.department_id,
        default_assignee_id=task.assigned_to,
        assignees=assignees,
        scope=template.scope,
        frequency=template.frequency,
        day_of_week=template.day_of_week,
        days_of_week=template.days_of_week,
        day_of_month=template.day_of_month,
        month_of_year=template.month_of_year,
        occurrence_date=occurrence_date,
        next_occurrence_date=next_occurrence_date_value,
        effective_occurrence_date=effective_occurrence_date,
        origin_run_at=task.origin_run_at,
        system_outcome=outcome_value,
        priority=priority_value,
        finish_period=task.finish_period,
        timezone=template.timezone,
        start_at=template.start_at,
        due_time=template.due_time,
        interval=template.interval,
        lookahead_days=template.lookahead_days,
        recurrence_kind=template.recurrence_kind,
        byweekday=template.byweekday,
        bymonthday=template.bymonthday,
        effective_from=template.effective_from,
        effective_to=template.effective_to,
        status=final_status,
        is_active=task.is_active,
        user_comment=user_comment,
        requires_alignment=bool(getattr(template, "requires_alignment", False)),
        alignment_time=getattr(template, "alignment_time", None),
        alignment_roles=alignment_roles,
        alignment_user_ids=alignment_user_ids,
        created_by=task.created_by,
        created_at=task.created_at,
    )


@router.get("", response_model=list[SystemTaskOut])
async def list_system_tasks(
    department_id: uuid.UUID | None = None,
    only_active: bool = False,
    assigned_to: uuid.UUID | None = None,  # Filter by user for "My View"
    occurrence_date: date | None = None,
    db: AsyncSession = Depends(get_db),
    user=Depends(get_current_user),
) -> list[SystemTaskOut]:
    template_stmt = select(SystemTaskTemplate)

    if department_id is not None:
        # Allow all users to view system tasks from any department (for department kanban views)
        template_stmt = template_stmt.where(
            or_(
                and_(
                    SystemTaskTemplate.scope == SystemTaskScope.DEPARTMENT.value,
                    SystemTaskTemplate.department_id == department_id,
                ),
                SystemTaskTemplate.scope == SystemTaskScope.ALL.value,
            )
        )
    # When no department_id is provided (main system tasks view), show all system tasks to all users
    # No filtering needed - everyone can see all system tasks

    templates = (await db.execute(template_stmt)).scalars().all()
    if not templates:
        return []

    template_ids = [t.id for t in templates]
    for tmpl in templates:
        _apply_template_defaults(tmpl)

    template_ids = [t.id for t in templates]
    roles_map, alignment_users_map = await _alignment_maps_for_templates(db, template_ids)

    assignee_rows = (
        await db.execute(
            select(SystemTaskTemplateAssignee)
            .where(SystemTaskTemplateAssignee.template_id.in_(template_ids))
            .where(SystemTaskTemplateAssignee.active.is_(True))
        )
    ).scalars().all()
    next_run_map: dict[tuple[uuid.UUID, uuid.UUID], datetime] = {}
    for row in assignee_rows:
        if row.next_run_at is not None:
            next_run_map[(row.template_id, row.user_id)] = row.next_run_at

    now = datetime.now(timezone.utc)
    task_rows: list[tuple[Task, SystemTaskTemplate]] = []
    if occurrence_date is not None:
        task_stmt = (
            select(Task, SystemTaskTemplate)
            .join(SystemTaskTemplate, Task.system_template_origin_id == SystemTaskTemplate.id)
            .where(SystemTaskTemplate.id.in_(template_ids))
            .where(Task.origin_run_at.is_not(None))
        )
        if assigned_to is not None:
            task_stmt = task_stmt.where(Task.assigned_to == assigned_to)
        if only_active:
            task_stmt = task_stmt.where(Task.is_active.is_(True))
        date_match = func.date(Task.origin_run_at) == occurrence_date
        overdue_match = and_(
            Task.system_outcome == SystemTaskOutcome.OPEN.value,
            func.date(Task.origin_run_at) < occurrence_date,
        )
        task_stmt = task_stmt.where(or_(date_match, overdue_match))
        task_rows = (await db.execute(task_stmt)).all()
    else:
        day_start = datetime.combine(now.date(), time.min, tzinfo=timezone.utc)
        base_stmt = (
            select(
                Task.system_template_origin_id.label("template_id"),
                Task.assigned_to.label("user_id"),
                func.min(Task.origin_run_at).label("origin_run_at"),
            )
            .where(Task.system_template_origin_id.in_(template_ids))
            .where(Task.origin_run_at.is_not(None))
            .where(Task.origin_run_at >= day_start)
        )
        if assigned_to is not None:
            base_stmt = base_stmt.where(Task.assigned_to == assigned_to)
        if only_active:
            base_stmt = base_stmt.where(Task.is_active.is_(True))
        base_subq = base_stmt.group_by(Task.system_template_origin_id, Task.assigned_to).subquery()
        task_stmt = (
            select(Task, SystemTaskTemplate)
            .join(
                base_subq,
                and_(
                    Task.system_template_origin_id == base_subq.c.template_id,
                    Task.assigned_to == base_subq.c.user_id,
                    Task.origin_run_at == base_subq.c.origin_run_at,
                ),
            )
            .join(SystemTaskTemplate, Task.system_template_origin_id == SystemTaskTemplate.id)
        )
        task_rows = (await db.execute(task_stmt)).all()

    if not task_rows:
        return []

    task_ids = [task.id for task, _ in task_rows]
    assignee_map = await _assignees_for_tasks(db, task_ids)
    fallback_ids = [
        task.assigned_to
        for task, _ in task_rows
        if task.assigned_to is not None and not assignee_map.get(task.id)
    ]
    if fallback_ids:
        fallback_users = (
            await db.execute(select(User).where(User.id.in_(fallback_ids)))
        ).scalars().all()
        fallback_map = {user.id: user for user in fallback_users}
        for task, _ in task_rows:
            if assignee_map.get(task.id):
                continue
            if task.assigned_to in fallback_map:
                assignee_map[task.id] = [_user_to_assignee(fallback_map[task.assigned_to])]

    user_comment_map: dict[uuid.UUID, str | None] = {}
    if user.id and task_ids:
        comment_rows = (
            await db.execute(
                select(TaskUserComment.task_id, TaskUserComment.comment)
                .where(TaskUserComment.task_id.in_(task_ids))
                .where(TaskUserComment.user_id == user.id)
            )
        ).all()
        user_comment_map = {task_id: comment for task_id, comment in comment_rows}

    if assigned_to is not None:
        result = []
        for task, template in task_rows:
            task_assignees = assignee_map.get(task.id, [])
            next_run = next_run_map.get((template.id, task.assigned_to)) if task.assigned_to else None
            task_out = _task_row_to_out(
                task,
                template,
                task_assignees,
                user_comment_map.get(task.id),
                roles_map.get(template.id),
                alignment_users_map.get(template.id),
                occurrence_date=task.origin_run_at.date() if task.origin_run_at else None,
                next_occurrence_date_value=next_run.date() if next_run else None,
                effective_occurrence_date=task.due_date.date() if task.due_date else None,
                system_outcome=task.system_outcome,
            )
            task_out.department_ids = [task.department_id] if task.department_id else None
            result.append(task_out)
        return result

    template_tasks_map: dict[uuid.UUID, list[Task]] = {}
    for task, template in task_rows:
        template_tasks_map.setdefault(template.id, []).append(task)

    result: list[SystemTaskOut] = []
    template_map = {t.id: t for t in templates}
    for template_id, tasks in template_tasks_map.items():
        template = template_map[template_id]
        department_ids_set = {task.department_id for task in tasks if task.department_id is not None}
        department_ids = sorted(list(department_ids_set)) if department_ids_set else None

        all_assignees_map: dict[uuid.UUID, TaskAssigneeOut] = {}
        for task in tasks:
            for assignee in assignee_map.get(task.id, []):
                all_assignees_map.setdefault(assignee.id, assignee)
        all_assignees = list(all_assignees_map.values())

        first_task = tasks[0]
        next_run = None
        if first_task.assigned_to is not None:
            next_run = next_run_map.get((template_id, first_task.assigned_to))
        task_out = _task_row_to_out(
            first_task,
            template,
            all_assignees,
            user_comment_map.get(first_task.id),
            roles_map.get(template.id),
            alignment_users_map.get(template.id),
            occurrence_date=first_task.origin_run_at.date() if first_task.origin_run_at else None,
            next_occurrence_date_value=next_run.date() if next_run else None,
            effective_occurrence_date=first_task.due_date.date() if first_task.due_date else None,
            system_outcome=first_task.system_outcome,
        )
        task_out.department_ids = department_ids
        result.append(task_out)

    return result


@router.get("/templates", response_model=list[SystemTaskTemplateOut])
async def list_system_task_templates(
    db: AsyncSession = Depends(get_db),
    user=Depends(get_current_user),
) -> list[SystemTaskTemplateOut]:
    ensure_manager_or_admin(user)
    templates = (await db.execute(select(SystemTaskTemplate).order_by(SystemTaskTemplate.created_at.desc()))).scalars().all()
    if not templates:
        return []

    template_ids = [t.id for t in templates]
    role_rows = []
    if template_ids:
        role_rows = (
            await db.execute(
                select(SystemTaskTemplateAlignmentRole.template_id, SystemTaskTemplateAlignmentRole.role)
                .where(SystemTaskTemplateAlignmentRole.template_id.in_(template_ids))
            )
        ).all()
    roles_map: dict[uuid.UUID, list[str]] = {}
    for tid, role in role_rows:
        roles_map.setdefault(tid, []).append(role)

    alignment_user_rows = []
    if template_ids:
        alignment_user_rows = (
            await db.execute(
                select(SystemTaskTemplateAlignmentUser.template_id, SystemTaskTemplateAlignmentUser.user_id).where(
                    SystemTaskTemplateAlignmentUser.template_id.in_(template_ids)
                )
            )
        ).all()
    alignment_users_map: dict[uuid.UUID, list[uuid.UUID]] = {}
    for tid, uid in alignment_user_rows:
        alignment_users_map.setdefault(tid, []).append(uid)

    return [
        SystemTaskTemplateOut(
            id=t.id,
            title=t.title,
            description=t.description,
            internal_notes=t.internal_notes,
            department_id=t.department_id,
            default_assignee_id=t.default_assignee_id,
            assignee_ids=t.assignee_ids,
            scope=SystemTaskScope(t.scope),
            frequency=FrequencyType(t.frequency),
            day_of_week=t.day_of_week,
            days_of_week=t.days_of_week,
            day_of_month=t.day_of_month,
            month_of_year=t.month_of_year,
            timezone=t.timezone,
            start_at=t.start_at,
            due_time=t.due_time,
            interval=t.interval,
            lookahead_days=t.lookahead_days,
            recurrence_kind=t.recurrence_kind,
            byweekday=t.byweekday,
            bymonthday=t.bymonthday,
            effective_from=t.effective_from,
            effective_to=t.effective_to,
            priority=TaskPriority(t.priority) if t.priority else None,
            finish_period=TaskFinishPeriod(t.finish_period) if t.finish_period else None,
            requires_alignment=bool(getattr(t, "requires_alignment", False)),
            alignment_time=getattr(t, "alignment_time", None),
            alignment_roles=roles_map.get(t.id),
            alignment_user_ids=alignment_users_map.get(t.id),
            is_active=t.is_active,
            created_at=t.created_at,
        )
        for t in templates
    ]


class SystemTaskOccurrenceUpdate(BaseModel):
    template_id: uuid.UUID
    occurrence_date: date
    status: str
    comment: str | None = None


@router.post("/occurrences", status_code=status.HTTP_200_OK)
async def set_system_task_occurrence_status(
    payload: SystemTaskOccurrenceUpdate,
    db: AsyncSession = Depends(get_db),
    user=Depends(get_current_user),
) -> dict:
    allowed = {
        SystemTaskOutcome.OPEN.value,
        SystemTaskOutcome.DONE.value,
        SystemTaskOutcome.NOT_DONE.value,
        SystemTaskOutcome.SKIPPED.value,
    }
    if payload.status not in allowed:
        raise HTTPException(status_code=status.HTTP_400_BAD_REQUEST, detail="Invalid status")

    tmpl = (
        await db.execute(select(SystemTaskTemplate).where(SystemTaskTemplate.id == payload.template_id))
    ).scalar_one_or_none()
    task_for_template: Task | None = None
    if tmpl is None:
        task_for_template = (
            await db.execute(select(Task).where(Task.id == payload.template_id))
        ).scalar_one_or_none()
        if task_for_template and task_for_template.system_template_origin_id:
            tmpl = (
                await db.execute(
                    select(SystemTaskTemplate).where(SystemTaskTemplate.id == task_for_template.system_template_origin_id)
                )
            ).scalar_one_or_none()
        if tmpl is None:
            raise HTTPException(status_code=status.HTTP_404_NOT_FOUND, detail="Template not found")

    # Minimal permissions: user can update their own occurrence; admins/managers can also do it.
    if user.role not in (UserRole.ADMIN, UserRole.MANAGER, UserRole.STAFF):
        raise HTTPException(status_code=status.HTTP_403_FORBIDDEN, detail="Forbidden")

    # Check if user is in the assignee list
    assignee_ids = getattr(tmpl, 'assignee_ids', None) or []
    if not assignee_ids and tmpl.default_assignee_id:
        assignee_ids = [tmpl.default_assignee_id]
    
    if user.id not in assignee_ids:
        raise HTTPException(
            status_code=status.HTTP_403_FORBIDDEN, 
            detail="You are not assigned to this system task"
        )

    task_query = (
        select(Task)
        .where(Task.system_template_origin_id == tmpl.id)
        .where(Task.assigned_to == user.id)
        .where(Task.origin_run_at.is_not(None))
        .where(func.date(Task.origin_run_at) == payload.occurrence_date)
        .order_by(Task.origin_run_at.desc())
    )
    if task_for_template and task_for_template.system_template_origin_id == tmpl.id:
        task = task_for_template
    else:
        task = (await db.execute(task_query)).scalars().first()

    if task is None:
        raise HTTPException(
            status_code=status.HTTP_404_NOT_FOUND,
            detail="Task instance not found for this occurrence",
        )

    now = datetime.now(timezone.utc)
    task.system_outcome = payload.status
    if payload.status == SystemTaskOutcome.DONE.value:
        task.status = TaskStatus.DONE
        task.completed_at = now
    else:
        task.status = TaskStatus.TODO
        task.completed_at = None

    await db.commit()
    return {"ok": True}


class SystemTaskOccurrenceDateOverrideIn(BaseModel):
    template_id: uuid.UUID
    source_occurrence_date: date
    target_occurrence_date: date


def _can_override_system_occurrence_date(user: User, template: SystemTaskTemplate) -> bool:
    assignee_ids = getattr(template, "assignee_ids", None) or []
    if not assignee_ids and template.default_assignee_id:
        assignee_ids = [template.default_assignee_id]
    if user.id in assignee_ids:
        return True
    if user.role in (UserRole.ADMIN, UserRole.MANAGER):
        return True
    return False


@router.patch("/occurrence-date", response_model=SystemTaskOut)
async def override_system_task_occurrence_date(
    payload: SystemTaskOccurrenceDateOverrideIn,
    db: AsyncSession = Depends(get_db),
    user=Depends(get_current_user),
) -> SystemTaskOut:
    tmpl = (
        await db.execute(select(SystemTaskTemplate).where(SystemTaskTemplate.id == payload.template_id))
    ).scalar_one_or_none()
    if tmpl is None:
        raise HTTPException(status_code=status.HTTP_404_NOT_FOUND, detail="Template not found")

    if not _can_override_system_occurrence_date(user, tmpl):
        raise HTTPException(status_code=status.HTTP_403_FORBIDDEN, detail="Forbidden")

    if payload.source_occurrence_date == payload.target_occurrence_date:
        raise HTTPException(status_code=status.HTTP_400_BAD_REQUEST, detail="Target date must be different from source date")

    task = (
        await db.execute(
            select(Task)
            .where(Task.system_template_origin_id == tmpl.id)
            .where(Task.assigned_to == user.id)
            .where(Task.origin_run_at.is_not(None))
            .where(func.date(Task.origin_run_at) == payload.source_occurrence_date)
            .order_by(Task.origin_run_at.desc())
        )
    ).scalars().first()

    if task is None:
        raise HTTPException(status_code=status.HTTP_404_NOT_FOUND, detail="Task instance not found")

    if task.system_outcome == SystemTaskOutcome.DONE.value:
        raise HTTPException(status_code=status.HTTP_400_BAD_REQUEST, detail="Done system tasks cannot be edited")

    origin = task.origin_run_at or task.due_date
    if origin is None:
        raise HTTPException(status_code=status.HTTP_400_BAD_REQUEST, detail="Task instance missing origin time")
    tz = timezone.utc
    if tmpl.timezone:
        try:
            from zoneinfo import ZoneInfo

            tz = ZoneInfo(tmpl.timezone)
        except Exception:
            tz = timezone.utc
    local_origin = origin.astimezone(tz) if origin.tzinfo else origin.replace(tzinfo=tz)
    target_dt = datetime.combine(payload.target_occurrence_date, local_origin.timetz(), tzinfo=tz)
    task.due_date = target_dt.astimezone(timezone.utc)
    task.status = TaskStatus.TODO
    task.system_outcome = SystemTaskOutcome.OPEN.value
    task.completed_at = None

    await db.commit()
    await db.refresh(task)

    assignee_map = await _assignees_for_tasks(db, [task.id])
    if not assignee_map.get(task.id) and task.assigned_to is not None:
        assigned_user = (await db.execute(select(User).where(User.id == task.assigned_to))).scalar_one_or_none()
        if assigned_user is not None:
            assignee_map[task.id] = [_user_to_assignee(assigned_user)]
    roles_map, alignment_users_map = await _alignment_maps_for_templates(db, [tmpl.id])

    return _task_row_to_out(
        task,
        tmpl,
        assignee_map.get(task.id, []),
        None,
        roles_map.get(tmpl.id),
        alignment_users_map.get(tmpl.id),
        occurrence_date=payload.source_occurrence_date,
        next_occurrence_date_value=payload.source_occurrence_date,
        effective_occurrence_date=payload.target_occurrence_date,
        system_outcome=task.system_outcome,
    )


@router.post("", response_model=SystemTaskOut, status_code=status.HTTP_201_CREATED)
async def create_system_task_template(
    payload: SystemTaskTemplateCreate,
    db: AsyncSession = Depends(get_db),
    user=Depends(get_current_user),
) -> SystemTaskOut:
    if payload.frequency == FrequencyType.YEARLY:
        if payload.month_of_year is None:
            raise HTTPException(
                status_code=status.HTTP_400_BAD_REQUEST,
                detail="Start month is required for yearly tasks",
            )
        if payload.month_of_year < 1 or payload.month_of_year > 12:
            raise HTTPException(status_code=status.HTTP_400_BAD_REQUEST, detail="Invalid start month")
    if payload.frequency in (FrequencyType.THREE_MONTHS, FrequencyType.SIX_MONTHS):
        if payload.day_of_month is None or payload.month_of_year is None:
            raise HTTPException(
                status_code=status.HTTP_400_BAD_REQUEST,
                detail="Day of month and start month are required for 3/6-month tasks",
            )
        if payload.month_of_year < 1 or payload.month_of_year > 12:
            raise HTTPException(status_code=status.HTTP_400_BAD_REQUEST, detail="Invalid start month")
    days_of_week = _normalize_days_of_week(payload.days_of_week, payload.day_of_week)

    assignee_ids = None
    if payload.assignee_ids is not None:
        seen: set[uuid.UUID] = set()
        assignee_ids = [uid for uid in payload.assignee_ids if not (uid in seen or seen.add(uid))]
    elif payload.default_assignee_id is not None:
        assignee_ids = [payload.default_assignee_id]

    # Get assignee users first to determine department automatically
    assignee_users: list[User] | None = None
    if assignee_ids is not None:
        assignee_users = (
            await db.execute(select(User).where(User.id.in_(assignee_ids)))
        ).scalars().all()
        if len(assignee_users) != len(assignee_ids):
            raise HTTPException(status_code=status.HTTP_404_NOT_FOUND, detail="Assignee not found")

    # Determine department and scope from assignees if not explicitly set
    department_id = payload.department_id
    scope_value = payload.scope
    
    if assignee_users and len(assignee_users) > 0:
        # Get unique departments from assignees
        assignee_departments = {u.department_id for u in assignee_users if u.department_id is not None}
        is_gane_assignee = any(
            u.username and u.username.lower() == "gane.arifaj" for u in assignee_users
        )
        ga_department = None
        if is_gane_assignee:
            ga_department = (
                await db.execute(select(Department).where(Department.code == "GA"))
            ).scalar_one_or_none()

        # Only force GA when ALL assignees are from GA (prevents mixed-department tasks from being hidden)
        if ga_department and assignee_departments == {ga_department.id}:
            department_id = ga_department.id
            scope_value = SystemTaskScope.DEPARTMENT
        elif len(assignee_departments) == 1:
            # All assignees are from the same department - use that department
            department_id = list(assignee_departments)[0]
            scope_value = SystemTaskScope.DEPARTMENT
        elif len(assignee_departments) > 1:
            # Assignees are from different departments - use ALL scope
            department_id = None
            scope_value = SystemTaskScope.ALL
        elif len(assignee_departments) == 0:
            # Assignees have no department - if no department was set, use ALL scope
            if department_id is None:
                scope_value = SystemTaskScope.ALL
    else:
        # No assignees - use scope/department from payload or defaults
        if scope_value is None:
            scope_value = SystemTaskScope.DEPARTMENT if payload.department_id is not None else SystemTaskScope.ALL
        if scope_value == SystemTaskScope.DEPARTMENT and department_id is None:
            raise HTTPException(status_code=status.HTTP_400_BAD_REQUEST, detail="Department is required when scope is DEPARTMENT and no assignees are provided")

    # Validate scope and department consistency
    if scope_value == SystemTaskScope.DEPARTMENT:
        if department_id is None:
            raise HTTPException(status_code=status.HTTP_400_BAD_REQUEST, detail="Department is required")
    else:
        if department_id is not None:
            raise HTTPException(status_code=status.HTTP_400_BAD_REQUEST, detail="Department must be empty for ALL scope")

    if department_id is not None:
        department = (
            await db.execute(select(Department).where(Department.id == department_id))
        ).scalar_one_or_none()
        if department is None:
            raise HTTPException(status_code=status.HTTP_404_NOT_FOUND, detail="Department not found")

    recurrence_kind = payload.recurrence_kind
    interval_value = payload.interval
    byweekday = payload.byweekday
    bymonthday = payload.bymonthday
    if payload.frequency is not None and recurrence_kind is None:
        rec_kind, rec_interval, rec_byweekday, rec_bymonthday = _recurrence_from_frequency(
            payload.frequency,
            days_of_week,
            payload.day_of_week,
            payload.day_of_month,
        )
        recurrence_kind = rec_kind
        interval_value = interval_value or rec_interval
        if byweekday is None:
            byweekday = rec_byweekday
        if bymonthday is None:
            bymonthday = rec_bymonthday
    if recurrence_kind is None:
        recurrence_kind = SystemTaskRecurrenceKind.DAILY.value
    if interval_value is None:
        interval_value = 1

    priority_value = payload.priority or TaskPriority.NORMAL

    template = SystemTaskTemplate(
        title=payload.title,
        description=payload.description,
        internal_notes=payload.internal_notes,
        department_id=department_id,
        default_assignee_id=assignee_ids[0] if assignee_ids else None,
        assignee_ids=assignee_ids,
        scope=_enum_value(scope_value),
        frequency=_enum_value(payload.frequency),
        day_of_week=days_of_week[0] if days_of_week else payload.day_of_week,
        days_of_week=days_of_week,
        day_of_month=payload.day_of_month,
        month_of_year=payload.month_of_year,
        timezone=payload.timezone or DEFAULT_TIMEZONE,
        start_at=payload.start_at,
        due_time=_normalize_time(payload.due_time),
        interval=interval_value,
        lookahead_days=payload.lookahead_days or DEFAULT_LOOKAHEAD_DAYS,
        recurrence_kind=recurrence_kind,
        byweekday=byweekday,
        bymonthday=bymonthday,
        effective_from=payload.effective_from,
        effective_to=payload.effective_to,
        priority=_enum_value(priority_value),
        finish_period=_enum_value(payload.finish_period),
        requires_alignment=payload.requires_alignment if payload.requires_alignment is not None else False,
        alignment_time=payload.alignment_time,
        is_active=payload.is_active if payload.is_active is not None else True,
    )

    db.add(template)
    await db.flush()
    _apply_template_defaults(template)

    # Alignment roles/users. Stored on the template (applies to future occurrences).
    if payload.requires_alignment:
        if payload.alignment_time is None:
            raise HTTPException(status_code=status.HTTP_400_BAD_REQUEST, detail="alignment_time is required")
        roles = payload.alignment_roles or []
        cleaned = sorted({str(r).upper() for r in roles if str(r).strip()})
        if not cleaned:
            cleaned = ["MANAGER"]
        values = [{"template_id": template.id, "role": role} for role in cleaned]
        await db.execute(insert(SystemTaskTemplateAlignmentRole), values)
        alignment_user_ids = await _validate_alignment_user_ids(db, payload.alignment_user_ids or [])
        if alignment_user_ids:
            await db.execute(
                insert(SystemTaskTemplateAlignmentUser),
                [{"template_id": template.id, "user_id": uid} for uid in alignment_user_ids],
            )
    await _sync_template_assignees(db=db, template=template, assignee_ids=assignee_ids or [], recompute_next_run_at=True)
    await db.commit()
    await db.refresh(template)
    roles_map, alignment_users_map = await _alignment_maps_for_templates(db, [template.id])

    assignees_list = []
    department_ids_set = set()
    if template.assignee_ids:
        assignee_users = (
            await db.execute(select(User).where(User.id.in_(template.assignee_ids)))
        ).scalars().all()
        assignees_list = [_user_to_assignee(user) for user in assignee_users]
        department_ids_set = {user.department_id for user in assignee_users if user.department_id is not None}
    elif template.default_assignee_id:
        assignee_user = (
            await db.execute(select(User).where(User.id == template.default_assignee_id))
        ).scalar_one_or_none()
        if assignee_user:
            assignees_list = [_user_to_assignee(assignee_user)]
            if assignee_user.department_id:
                department_ids_set.add(assignee_user.department_id)

    if template.department_id and template.department_id not in department_ids_set:
        department_ids_set.add(template.department_id)
    department_ids = sorted(list(department_ids_set)) if department_ids_set else None

    return SystemTaskOut(
        id=template.id,
        template_id=template.id,
        title=template.title,
        description=template.description,
        internal_notes=template.internal_notes,
        department_id=template.department_id,
        department_ids=department_ids,
        default_assignee_id=template.default_assignee_id,
        assignees=assignees_list,
        scope=SystemTaskScope(template.scope),
        frequency=FrequencyType(template.frequency),
        day_of_week=template.day_of_week,
        days_of_week=template.days_of_week,
        day_of_month=template.day_of_month,
        month_of_year=template.month_of_year,
        priority=TaskPriority(template.priority) if template.priority else TaskPriority.NORMAL,
        finish_period=TaskFinishPeriod(template.finish_period) if template.finish_period else None,
        origin_run_at=None,
        system_outcome=SystemTaskOutcome.OPEN.value,
        status=TaskStatus.TODO,
        is_active=template.is_active,
        user_comment=None,
        requires_alignment=getattr(template, "requires_alignment", False),
        alignment_time=getattr(template, "alignment_time", None),
        alignment_roles=roles_map.get(template.id),
        alignment_user_ids=alignment_users_map.get(template.id),
        created_by=user.id,
        created_at=template.created_at,
        timezone=template.timezone,
        start_at=template.start_at,
        due_time=template.due_time,
        interval=template.interval,
        lookahead_days=template.lookahead_days,
        recurrence_kind=template.recurrence_kind,
        byweekday=template.byweekday,
        bymonthday=template.bymonthday,
        effective_from=template.effective_from,
        effective_to=template.effective_to,
    )


@router.delete("/{template_id}", status_code=status.HTTP_204_NO_CONTENT, response_model=None)
async def delete_system_task_template(
    template_id: uuid.UUID,
    db: AsyncSession = Depends(get_db),
    user=Depends(require_admin),
) -> Response:
    template = (
        await db.execute(select(SystemTaskTemplate).where(SystemTaskTemplate.id == template_id))
    ).scalar_one_or_none()
    if template is None:
        raise HTTPException(status_code=status.HTTP_404_NOT_FOUND, detail="System task not found")

    has_system_origin = await db.execute(
        text(
            "select 1 from information_schema.columns "
            "where table_name = 'tasks' and column_name = 'system_template_origin_id'"
        )
    )
    if has_system_origin.scalar() is not None:
        await db.execute(delete(Task).where(Task.system_template_origin_id == template_id))

    await db.delete(template)
    await db.commit()
    return Response(status_code=status.HTTP_204_NO_CONTENT)


@router.patch("/{template_id}", response_model=SystemTaskOut)
async def update_system_task_template(
    template_id: uuid.UUID,
    payload: SystemTaskTemplateUpdate,
    db: AsyncSession = Depends(get_db),
    user=Depends(get_current_user),
) -> SystemTaskOut:
    template = (
        await db.execute(select(SystemTaskTemplate).where(SystemTaskTemplate.id == template_id))
    ).scalar_one_or_none()
    if template is None:
        raise HTTPException(status_code=status.HTTP_404_NOT_FOUND, detail="System task not found")

    # Allow all users to edit all system tasks - no permission restrictions

    fields_set = payload.__fields_set__
    scope_set = "scope" in fields_set
    department_set = "department_id" in fields_set
    assignee_set = "default_assignee_id" in fields_set or "assignee_ids" in fields_set
    days_set = "days_of_week" in fields_set or "day_of_week" in fields_set
    schedule_fields_set = (
        "frequency" in fields_set
        or "day_of_month" in fields_set
        or "month_of_year" in fields_set
    )
    recurrence_fields_set = (
        "timezone" in fields_set
        or "start_at" in fields_set
        or "due_time" in fields_set
        or "interval" in fields_set
        or "lookahead_days" in fields_set
        or "recurrence_kind" in fields_set
        or "byweekday" in fields_set
        or "bymonthday" in fields_set
        or "effective_from" in fields_set
        or "effective_to" in fields_set
        or schedule_fields_set
        or days_set
    )
    effective_frequency = payload.frequency if "frequency" in fields_set else template.frequency
    if schedule_fields_set and effective_frequency == FrequencyType.YEARLY:
        effective_month = payload.month_of_year if "month_of_year" in fields_set else template.month_of_year
        if effective_month is None:
            raise HTTPException(
                status_code=status.HTTP_400_BAD_REQUEST,
                detail="Start month is required for yearly tasks",
            )
        if effective_month < 1 or effective_month > 12:
            raise HTTPException(status_code=status.HTTP_400_BAD_REQUEST, detail="Invalid start month")
    if schedule_fields_set and effective_frequency in (FrequencyType.THREE_MONTHS, FrequencyType.SIX_MONTHS):
        effective_day = payload.day_of_month if "day_of_month" in fields_set else template.day_of_month
        effective_month = payload.month_of_year if "month_of_year" in fields_set else template.month_of_year
        if effective_day is None or effective_month is None:
            raise HTTPException(
                status_code=status.HTTP_400_BAD_REQUEST,
                detail="Day of month and start month are required for 3/6-month tasks",
            )
        if effective_month < 1 or effective_month > 12:
            raise HTTPException(status_code=status.HTTP_400_BAD_REQUEST, detail="Invalid start month")
    days_of_week = payload.days_of_week
    if days_set:
        days_of_week = _normalize_days_of_week(payload.days_of_week, payload.day_of_week) or []

    assignee_ids = None
    if "assignee_ids" in fields_set:
        seen: set[uuid.UUID] = set()
        assignee_ids = [uid for uid in (payload.assignee_ids or []) if not (uid in seen or seen.add(uid))]
    elif "default_assignee_id" in fields_set and payload.default_assignee_id is not None:
        assignee_ids = [payload.default_assignee_id]
    elif assignee_set:
        # Use existing assignees from template
        assignee_ids = template.assignee_ids or ([template.default_assignee_id] if template.default_assignee_id else None)

    # Get assignee users first to determine department automatically
    assignee_users: list[User] | None = None
    if assignee_ids is not None:
        assignee_users = (
            await db.execute(select(User).where(User.id.in_(assignee_ids)))
        ).scalars().all()
        if len(assignee_users) != len(assignee_ids):
            raise HTTPException(status_code=status.HTTP_404_NOT_FOUND, detail="Assignee not found")

    # Determine department and scope from assignees if assignees are being set
    scope_value = template.scope
    if scope_set:
        if payload.scope is None:
            raise HTTPException(status_code=status.HTTP_400_BAD_REQUEST, detail="Scope is required")
        scope_value = payload.scope

    target_department = payload.department_id if department_set else template.department_id
    
    # If assignees are being set/changed, automatically determine department from assignees
    if assignee_set and assignee_users and len(assignee_users) > 0:
        # Get unique departments from assignees
        assignee_departments = {u.department_id for u in assignee_users if u.department_id is not None}
        is_gane_assignee = any(
            u.username and u.username.lower() == "gane.arifaj" for u in assignee_users
        )
        ga_department = None
        if is_gane_assignee:
            ga_department = (
                await db.execute(select(Department).where(Department.code == "GA"))
            ).scalar_one_or_none()

        # Only force GA when ALL assignees are from GA (prevents mixed-department tasks from being hidden)
        if ga_department and assignee_departments == {ga_department.id}:
            target_department = ga_department.id
            scope_value = SystemTaskScope.DEPARTMENT
        elif len(assignee_departments) == 1:
            # All assignees are from the same department - use that department
            target_department = list(assignee_departments)[0]
            scope_value = SystemTaskScope.DEPARTMENT
        elif len(assignee_departments) > 1:
            # Assignees are from different departments - use ALL scope
            target_department = None
            scope_value = SystemTaskScope.ALL
        elif len(assignee_departments) == 0:
            # Assignees have no department - if no department was set, use ALL scope
            if target_department is None:
                scope_value = SystemTaskScope.ALL

    # Validate scope and department consistency
    if scope_value == SystemTaskScope.DEPARTMENT:
        if target_department is None:
            raise HTTPException(status_code=status.HTTP_400_BAD_REQUEST, detail="Department is required")
    else:
        if department_set and payload.department_id is not None:
            raise HTTPException(status_code=status.HTTP_400_BAD_REQUEST, detail="Department must be empty for ALL scope")
        target_department = None

    if scope_value == SystemTaskScope.DEPARTMENT and target_department is not None:
        # Allow all users to edit tasks from any department
        department = (
            await db.execute(select(Department).where(Department.id == target_department))
        ).scalar_one_or_none()
        if department is None:
            raise HTTPException(status_code=status.HTTP_404_NOT_FOUND, detail="Department not found")

    if payload.title is not None:
        template.title = payload.title
    if payload.description is not None:
        template.description = payload.description
    if "internal_notes" in fields_set:
        template.internal_notes = payload.internal_notes
    if scope_set:
        template.scope = _enum_value(scope_value)
    if scope_value == SystemTaskScope.DEPARTMENT:
        if department_set:
            template.department_id = payload.department_id
        # If assignees are GA-only and department is missing, set GA department
        elif assignee_set and assignee_users and template.department_id is None:
            assignee_departments = {u.department_id for u in assignee_users if u.department_id is not None}
            is_gane_assignee = any(
                u.username and u.username.lower() == "gane.arifaj" for u in assignee_users
            )
            if is_gane_assignee:
                ga_department = (
                    await db.execute(select(Department).where(Department.code == "GA"))
                ).scalar_one_or_none()
                if ga_department and assignee_departments == {ga_department.id}:
                    template.department_id = ga_department.id
    else:
        template.department_id = None
    if assignee_set and assignee_ids is not None:
        template.default_assignee_id = assignee_ids[0] if assignee_ids else None
        template.assignee_ids = assignee_ids
    if payload.frequency is not None:
        template.frequency = _enum_value(payload.frequency)
    if days_set:
        template.days_of_week = days_of_week or None
        template.day_of_week = days_of_week[0] if days_of_week else payload.day_of_week
    if payload.day_of_month is not None:
        template.day_of_month = payload.day_of_month
    if payload.month_of_year is not None:
        template.month_of_year = payload.month_of_year
    if payload.priority is not None:
        template.priority = _enum_value(payload.priority)
    if "finish_period" in fields_set:
        template.finish_period = _enum_value(payload.finish_period)
    if payload.requires_alignment is not None:
        template.requires_alignment = payload.requires_alignment
    if "alignment_time" in fields_set:
        template.alignment_time = payload.alignment_time
    if payload.is_active is not None:
        template.is_active = payload.is_active
    if "timezone" in fields_set:
        template.timezone = payload.timezone
    if "start_at" in fields_set:
        template.start_at = payload.start_at
    if "due_time" in fields_set:
        template.due_time = payload.due_time
    if "interval" in fields_set:
        template.interval = payload.interval
    if "lookahead_days" in fields_set:
        template.lookahead_days = payload.lookahead_days
    if "recurrence_kind" in fields_set:
        template.recurrence_kind = payload.recurrence_kind
    if "byweekday" in fields_set:
        template.byweekday = payload.byweekday
    if "bymonthday" in fields_set:
        template.bymonthday = payload.bymonthday
    if "effective_from" in fields_set:
        template.effective_from = payload.effective_from
    if "effective_to" in fields_set:
        template.effective_to = payload.effective_to

    if schedule_fields_set or days_set:
        rec_kind, rec_interval, rec_byweekday, rec_bymonthday = _recurrence_from_frequency(
            effective_frequency,
            days_of_week if days_set else template.days_of_week,
            template.day_of_week,
            payload.day_of_month if "day_of_month" in fields_set else template.day_of_month,
        )
        if "recurrence_kind" not in fields_set:
            template.recurrence_kind = rec_kind
        if "interval" not in fields_set:
            template.interval = rec_interval
        if "byweekday" not in fields_set:
            template.byweekday = rec_byweekday
        if "bymonthday" not in fields_set:
            template.bymonthday = rec_bymonthday

    # Update alignment roles if provided.
    if (
        "alignment_roles" in fields_set
        or "alignment_user_ids" in fields_set
        or "requires_alignment" in fields_set
    ):
        await db.execute(delete(SystemTaskTemplateAlignmentRole).where(SystemTaskTemplateAlignmentRole.template_id == template.id))
        await db.execute(delete(SystemTaskTemplateAlignmentUser).where(SystemTaskTemplateAlignmentUser.template_id == template.id))
        if template.requires_alignment:
            if template.alignment_time is None:
                raise HTTPException(status_code=status.HTTP_400_BAD_REQUEST, detail="alignment_time is required")
            roles = payload.alignment_roles or []
            cleaned = sorted({str(r).upper() for r in roles if str(r).strip()})
            if not cleaned:
                cleaned = ["MANAGER"]
            values = [{"template_id": template.id, "role": role} for role in cleaned]
            await db.execute(insert(SystemTaskTemplateAlignmentRole), values)
            alignment_user_ids = await _validate_alignment_user_ids(db, payload.alignment_user_ids or [])
            if alignment_user_ids:
                await db.execute(
                    insert(SystemTaskTemplateAlignmentUser),
                    [{"template_id": template.id, "user_id": uid} for uid in alignment_user_ids],
                )

    await db.flush()
    _apply_template_defaults(template)

    desired_assignee_ids: list[uuid.UUID] = []
    if assignee_set and assignee_ids is not None:
        desired_assignee_ids = assignee_ids
    elif recurrence_fields_set:
        existing_assignees = (
            await db.execute(
                select(SystemTaskTemplateAssignee.user_id)
                .where(SystemTaskTemplateAssignee.template_id == template.id)
                .where(SystemTaskTemplateAssignee.active.is_(True))
            )
        ).scalars().all()
        desired_assignee_ids = list(existing_assignees)

    if assignee_set or recurrence_fields_set:
        await _sync_template_assignees(
            db=db,
            template=template,
            assignee_ids=desired_assignee_ids,
            recompute_next_run_at=recurrence_fields_set,
        )

    await db.commit()
    await db.refresh(template)
    roles_map, alignment_users_map = await _alignment_maps_for_templates(db, [template.id])

    assignees_list = []
    department_ids_set = set()
    if template.assignee_ids:
        assignee_users = (
            await db.execute(select(User).where(User.id.in_(template.assignee_ids)))
        ).scalars().all()
        assignees_list = [_user_to_assignee(user) for user in assignee_users]
        department_ids_set = {user.department_id for user in assignee_users if user.department_id is not None}
    elif template.default_assignee_id:
        assignee_user = (
            await db.execute(select(User).where(User.id == template.default_assignee_id))
        ).scalar_one_or_none()
        if assignee_user:
            assignees_list = [_user_to_assignee(assignee_user)]
            if assignee_user.department_id:
                department_ids_set.add(assignee_user.department_id)

    if template.department_id and template.department_id not in department_ids_set:
        department_ids_set.add(template.department_id)
    department_ids = sorted(list(department_ids_set)) if department_ids_set else None

    return SystemTaskOut(
        id=template.id,
        template_id=template.id,
        title=template.title,
        description=template.description,
        internal_notes=template.internal_notes,
        department_id=template.department_id,
        department_ids=department_ids,
        default_assignee_id=template.default_assignee_id,
        assignees=assignees_list,
        scope=SystemTaskScope(template.scope),
        frequency=FrequencyType(template.frequency),
        day_of_week=template.day_of_week,
        days_of_week=template.days_of_week,
        day_of_month=template.day_of_month,
        month_of_year=template.month_of_year,
        priority=TaskPriority(template.priority) if template.priority else TaskPriority.NORMAL,
        finish_period=TaskFinishPeriod(template.finish_period) if template.finish_period else None,
        origin_run_at=None,
        system_outcome=SystemTaskOutcome.OPEN.value,
        status=TaskStatus.TODO,
        is_active=template.is_active,
        user_comment=None,
        requires_alignment=getattr(template, "requires_alignment", False),
        alignment_time=getattr(template, "alignment_time", None),
        alignment_roles=roles_map.get(template.id),
        alignment_user_ids=alignment_users_map.get(template.id),
        created_by=user.id,
        created_at=template.created_at,
        timezone=template.timezone,
        start_at=template.start_at,
        due_time=template.due_time,
        interval=template.interval,
        lookahead_days=template.lookahead_days,
        recurrence_kind=template.recurrence_kind,
        byweekday=template.byweekday,
        bymonthday=template.bymonthday,
        effective_from=template.effective_from,
        effective_to=template.effective_to,
    )
