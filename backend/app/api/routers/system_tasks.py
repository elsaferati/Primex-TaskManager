from __future__ import annotations

import uuid
from datetime import datetime, timezone

from fastapi import APIRouter, Depends, HTTPException, Response, status
from sqlalchemy import and_, delete, insert, or_, select, text, cast, String as SQLString
from sqlalchemy.ext.asyncio import AsyncSession

from app.api.access import ensure_department_access, ensure_manager_or_admin
from app.api.deps import get_current_user, require_admin
from app.db import get_db
from app.models.department import Department
from app.models.enums import (
    FrequencyType,
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
from app.models.system_task_template_alignment_role import SystemTaskTemplateAlignmentRole
from app.models.system_task_template_alignment_user import SystemTaskTemplateAlignmentUser
from app.models.user import User
from app.schemas.system_task import SystemTaskOut
from app.schemas.task import TaskAssigneeOut
from app.schemas.system_task_template import (
    SystemTaskTemplateCreate, SystemTaskTemplateOut,
    SystemTaskTemplateOut,
    SystemTaskTemplateUpdate,
)
from app.services.system_task_schedule import should_reopen_system_task


router = APIRouter()


def _enum_value(value) -> str | None:
    if value is None:
        return None
    return value.value if hasattr(value, "value") else value


def _task_is_active(template: SystemTaskTemplate) -> bool:
    if not template.is_active:
        return False
    return True


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


async def _replace_task_assignees(
    db: AsyncSession, task: Task, assignee_ids: list[uuid.UUID]
) -> None:
    await db.execute(delete(TaskAssignee).where(TaskAssignee.task_id == task.id))
    if assignee_ids:
        values = [{"task_id": task.id, "user_id": user_id} for user_id in assignee_ids]
        await db.execute(insert(TaskAssignee), values)


async def _sync_task_for_template(
    *,
    db: AsyncSession,
    template: SystemTaskTemplate,
    creator_id: uuid.UUID | None,
) -> tuple[Task, bool]:
    now = datetime.now(timezone.utc)
    # Some DBs may contain multiple rows per template (historical data). Pick the newest.
    task = (
        await db.execute(
            select(Task)
            .where(Task.system_template_origin_id == template.id)
            .order_by(Task.created_at.desc())
        )
    ).scalars().first()
    active_value = _task_is_active(template)

    if task is None:
        task = Task(
            title=template.title,
            description=template.description,
            internal_notes=template.internal_notes,
            department_id=template.department_id,
            assigned_to=template.default_assignee_id,
            created_by=creator_id,
            status=_enum_value(TaskStatus.TODO),
            priority=_enum_value(template.priority or TaskPriority.NORMAL),
            finish_period=_enum_value(template.finish_period),
            system_template_origin_id=template.id,
            start_date=now,
            is_active=active_value,
        )
        db.add(task)
        await db.flush()
        return task, True

    task.title = template.title
    task.description = template.description
    task.internal_notes = template.internal_notes
    task.department_id = template.department_id
    task.assigned_to = template.default_assignee_id
    task.finish_period = _enum_value(template.finish_period)
    task.is_active = active_value
    if task.priority is None:
        task.priority = _enum_value(template.priority or TaskPriority.NORMAL)
    if active_value and should_reopen_system_task(task, template, now):
        task.status = _enum_value(TaskStatus.TODO)
        task.completed_at = None
    return task, False


def _task_row_to_out(
    task: Task,
    template: SystemTaskTemplate,
    assignees: list[TaskAssigneeOut],
    user_comment: str | None = None,
    alignment_roles: list[str] | None = None,
    alignment_user_ids: list[uuid.UUID] | None = None,
) -> SystemTaskOut:
    priority_value = task.priority or TaskPriority.NORMAL
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
        priority=priority_value,
        finish_period=task.finish_period,
        status=task.status,
        is_active=task.is_active,
        user_comment=user_comment,
        requires_alignment=bool(getattr(template, "requires_alignment", False)),
        alignment_time=getattr(template, "alignment_time", None),
        alignment_roles=alignment_roles,
        alignment_user_ids=alignment_user_ids,
        created_at=task.created_at,
    )


@router.get("", response_model=list[SystemTaskOut])
async def list_system_tasks(
    department_id: uuid.UUID | None = None,
    only_active: bool = False,
    db: AsyncSession = Depends(get_db),
    user=Depends(get_current_user),
) -> list[SystemTaskOut]:
    template_stmt = select(SystemTaskTemplate)

    if department_id is not None:
        if user.role != UserRole.ADMIN:
            if not (user.role == UserRole.MANAGER and user.department_id is None):
                ensure_department_access(user, department_id)
        template_stmt = template_stmt.where(
            or_(
                and_(
                    SystemTaskTemplate.scope == SystemTaskScope.DEPARTMENT.value,
                    SystemTaskTemplate.department_id == department_id,
                ),
                SystemTaskTemplate.scope == SystemTaskScope.ALL.value,
            )
        )
    elif user.role != UserRole.ADMIN:
        if user.department_id is None:
            if user.role != UserRole.MANAGER:
                return []
        else:
            template_stmt = template_stmt.where(
                or_(
                    SystemTaskTemplate.scope == SystemTaskScope.ALL.value,
                    SystemTaskTemplate.scope == SystemTaskScope.GA.value,
                    and_(
                        SystemTaskTemplate.scope == SystemTaskScope.DEPARTMENT.value,
                        SystemTaskTemplate.department_id == user.department_id,
                    ),
                )
            )

    templates = (await db.execute(template_stmt)).scalars().all()
    if not templates:
        return []

    for tmpl in templates:
        await _sync_task_for_template(db=db, template=tmpl, creator_id=user.id)
    await db.commit()

    template_ids = [t.id for t in templates]
    task_stmt = (
        select(Task, SystemTaskTemplate)
        .join(SystemTaskTemplate, Task.system_template_origin_id == SystemTaskTemplate.id)
        .where(Task.system_template_origin_id.in_(template_ids))
    )
    if only_active:
        task_stmt = task_stmt.where(Task.is_active.is_(True))
    task_stmt = task_stmt.order_by(Task.is_active.desc(), Task.created_at.desc())

    rows = (await db.execute(task_stmt)).all()
    # De-dupe: keep only the newest task per template to avoid duplicates and crashes on legacy data.
    dedup: dict[uuid.UUID, tuple[Task, SystemTaskTemplate]] = {}
    for task, tmpl in rows:
        prev = dedup.get(tmpl.id)
        if prev is None or (task.created_at and prev[0].created_at and task.created_at > prev[0].created_at):
            dedup[tmpl.id] = (task, tmpl)
    rows = list(dedup.values())
    task_ids = [task.id for task, _ in rows]
    assignee_map = await _assignees_for_tasks(db, task_ids)
    fallback_ids = [
        task.assigned_to
        for task, _ in rows
        if task.assigned_to is not None and not assignee_map.get(task.id)
    ]
    if fallback_ids:
        fallback_users = (
            await db.execute(select(User).where(User.id.in_(fallback_ids)))
        ).scalars().all()
        fallback_map = {user.id: user for user in fallback_users}
        for task, _ in rows:
            if assignee_map.get(task.id):
                continue
            if task.assigned_to in fallback_map:
                assignee_map[task.id] = [_user_to_assignee(fallback_map[task.assigned_to])]

    # Fetch user comments for all tasks
    user_comment_map: dict[uuid.UUID, str | None] = {}
    if user.id:
        comment_rows = (
            await db.execute(
                select(TaskUserComment.task_id, TaskUserComment.comment)
                .where(TaskUserComment.task_id.in_(task_ids))
                .where(TaskUserComment.user_id == user.id)
            )
        ).all()
        user_comment_map = {task_id: comment for task_id, comment in comment_rows}

    roles_map, alignment_users_map = await _alignment_maps_for_templates(db, template_ids)

    return [
        _task_row_to_out(
            task,
            template,
            assignee_map.get(task.id, []),
            user_comment_map.get(task.id),
            roles_map.get(template.id),
            alignment_users_map.get(template.id),
        )
        for task, template in rows
    ]


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
            assignees=None,
            scope=SystemTaskScope(t.scope),
            frequency=FrequencyType(t.frequency),
            day_of_week=t.day_of_week,
            days_of_week=t.days_of_week,
            day_of_month=t.day_of_month,
            month_of_year=t.month_of_year,
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


@router.post("", response_model=SystemTaskOut, status_code=status.HTTP_201_CREATED)
async def create_system_task_template(
    payload: SystemTaskTemplateCreate,
    db: AsyncSession = Depends(get_db),
    user=Depends(get_current_user),
) -> SystemTaskOut:
    days_of_week = payload.days_of_week
    if days_of_week is None and payload.day_of_week is not None:
        days_of_week = [payload.day_of_week]
    if days_of_week:
        cleaned_days = sorted({int(day) for day in days_of_week})
        if any(day < 0 or day > 6 for day in cleaned_days):
            raise HTTPException(status_code=status.HTTP_400_BAD_REQUEST, detail="Invalid weekday")
        days_of_week = cleaned_days

    scope_value = payload.scope
    if scope_value is None:
        scope_value = SystemTaskScope.DEPARTMENT if payload.department_id is not None else SystemTaskScope.ALL

    department_id = payload.department_id
    if scope_value == SystemTaskScope.DEPARTMENT:
        if department_id is None:
            raise HTTPException(status_code=status.HTTP_400_BAD_REQUEST, detail="Department is required")
    else:
        if department_id is not None:
            raise HTTPException(status_code=status.HTTP_400_BAD_REQUEST, detail="Department must be empty for this scope")
        department_id = None

    if department_id is not None:
        department = (
            await db.execute(select(Department).where(Department.id == department_id))
        ).scalar_one_or_none()
        if department is None:
            raise HTTPException(status_code=status.HTTP_404_NOT_FOUND, detail="Department not found")

    assignee_ids = None
    if payload.assignees is not None:
        seen: set[uuid.UUID] = set()
        assignee_ids = [uid for uid in payload.assignees if not (uid in seen or seen.add(uid))]
    elif payload.default_assignee_id is not None:
        assignee_ids = [payload.default_assignee_id]

    assignee_users: list[User] | None = None
    if assignee_ids is not None:
        assignee_users = (
            await db.execute(select(User).where(User.id.in_(assignee_ids)))
        ).scalars().all()
        if len(assignee_users) != len(assignee_ids):
            raise HTTPException(status_code=status.HTTP_404_NOT_FOUND, detail="Assignee not found")
        if scope_value == SystemTaskScope.DEPARTMENT and department_id is not None:
            for assignee in assignee_users:
                if assignee.department_id is None:
                    continue
                if assignee.department_id != department_id:
                    raise HTTPException(
                        status_code=status.HTTP_400_BAD_REQUEST,
                        detail="Assignee must belong to the selected department",
                    )

    priority_value = payload.priority or TaskPriority.NORMAL

    template = SystemTaskTemplate(
        title=payload.title,
        description=payload.description,
        internal_notes=payload.internal_notes,
        department_id=department_id,
        default_assignee_id=assignee_ids[0] if assignee_ids else None,
        scope=_enum_value(scope_value),
        frequency=_enum_value(payload.frequency),
        day_of_week=days_of_week[0] if days_of_week else payload.day_of_week,
        days_of_week=days_of_week,
        day_of_month=payload.day_of_month,
        month_of_year=payload.month_of_year,
        priority=_enum_value(priority_value),
        finish_period=_enum_value(payload.finish_period),
        requires_alignment=payload.requires_alignment if payload.requires_alignment is not None else False,
        alignment_time=payload.alignment_time,
        is_active=payload.is_active if payload.is_active is not None else True,
    )

    db.add(template)
    await db.flush()

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
    task, _ = await _sync_task_for_template(db=db, template=template, creator_id=user.id)
    if assignee_ids is not None:
        await _replace_task_assignees(db, task, assignee_ids)
        task.assigned_to = assignee_ids[0] if assignee_ids else None
    await db.commit()
    await db.refresh(template)
    await db.refresh(task)
    assignee_map = await _assignees_for_tasks(db, [task.id])
    if not assignee_map.get(task.id) and task.assigned_to is not None:
        assigned_user = (await db.execute(select(User).where(User.id == task.assigned_to))).scalar_one_or_none()
        if assigned_user is not None:
            assignee_map[task.id] = [_user_to_assignee(assigned_user)]
    roles_map, alignment_users_map = await _alignment_maps_for_templates(db, [template.id])
    return _task_row_to_out(
        task,
        template,
        assignee_map.get(task.id, []),
        None,
        roles_map.get(template.id),
        alignment_users_map.get(template.id),
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
    ensure_manager_or_admin(user)
    template = (
        await db.execute(select(SystemTaskTemplate).where(SystemTaskTemplate.id == template_id))
    ).scalar_one_or_none()
    if template is None:
        raise HTTPException(status_code=status.HTTP_404_NOT_FOUND, detail="System task not found")

    fields_set = payload.__fields_set__
    scope_set = "scope" in fields_set
    department_set = "department_id" in fields_set
    assignee_set = "default_assignee_id" in fields_set or "assignees" in fields_set
    days_set = "days_of_week" in fields_set or "day_of_week" in fields_set
    days_of_week = payload.days_of_week
    if days_of_week is None and "day_of_week" in fields_set:
        if payload.day_of_week is not None:
            days_of_week = [payload.day_of_week]
        else:
            days_of_week = []
    if days_of_week is not None:
        cleaned_days = sorted({int(day) for day in days_of_week})
        if any(day < 0 or day > 6 for day in cleaned_days):
            raise HTTPException(status_code=status.HTTP_400_BAD_REQUEST, detail="Invalid weekday")
        days_of_week = cleaned_days

    scope_value = template.scope
    if scope_set:
        if payload.scope is None:
            raise HTTPException(status_code=status.HTTP_400_BAD_REQUEST, detail="Scope is required")
        scope_value = payload.scope

    target_department = payload.department_id if department_set else template.department_id
    if scope_value == SystemTaskScope.DEPARTMENT:
        if target_department is None:
            raise HTTPException(status_code=status.HTTP_400_BAD_REQUEST, detail="Department is required")
    else:
        if department_set and payload.department_id is not None:
            raise HTTPException(status_code=status.HTTP_400_BAD_REQUEST, detail="Department must be empty for this scope")
        target_department = None

    if scope_value == SystemTaskScope.DEPARTMENT and target_department is not None:
        ensure_department_access(user, target_department)
        department = (
            await db.execute(select(Department).where(Department.id == target_department))
        ).scalar_one_or_none()
        if department is None:
            raise HTTPException(status_code=status.HTTP_404_NOT_FOUND, detail="Department not found")

    assignee_ids = None
    if "assignees" in fields_set:
        seen: set[uuid.UUID] = set()
        assignee_ids = [uid for uid in (payload.assignees or []) if not (uid in seen or seen.add(uid))]
    elif payload.default_assignee_id is not None:
        assignee_ids = [payload.default_assignee_id]

    assignee_users: list[User] | None = None
    if assignee_set and assignee_ids is not None:
        assignee_users = (
            await db.execute(select(User).where(User.id.in_(assignee_ids)))
        ).scalars().all()
        if len(assignee_users) != len(assignee_ids):
            raise HTTPException(status_code=status.HTTP_404_NOT_FOUND, detail="Assignee not found")
        if scope_value == SystemTaskScope.DEPARTMENT and target_department is not None:
            for assignee in assignee_users:
                if assignee.department_id is None:
                    continue
                if assignee.department_id != target_department:
                    raise HTTPException(
                        status_code=status.HTTP_400_BAD_REQUEST,
                        detail="Assignee must belong to the selected department",
                    )

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
    else:
        template.department_id = None
    if assignee_set and assignee_ids is not None:
        template.default_assignee_id = assignee_ids[0] if assignee_ids else None
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
    task, _ = await _sync_task_for_template(db=db, template=template, creator_id=user.id)
    if assignee_set and assignee_ids is not None:
        await _replace_task_assignees(db, task, assignee_ids)
        task.assigned_to = assignee_ids[0] if assignee_ids else None
    await db.commit()
    await db.refresh(task)
    assignee_map = await _assignees_for_tasks(db, [task.id])
    if not assignee_map.get(task.id) and task.assigned_to is not None:
        assigned_user = (await db.execute(select(User).where(User.id == task.assigned_to))).scalar_one_or_none()
        if assigned_user is not None:
            assignee_map[task.id] = [_user_to_assignee(assigned_user)]
    roles_map, alignment_users_map = await _alignment_maps_for_templates(db, [template.id])
    return _task_row_to_out(
        task,
        template,
        assignee_map.get(task.id, []),
        None,
        roles_map.get(template.id),
        alignment_users_map.get(template.id),
    )
