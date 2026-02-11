from __future__ import annotations

import uuid
from datetime import date, datetime, timedelta, timezone

from fastapi import APIRouter, Depends, HTTPException, Response, status
from pydantic import BaseModel
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
from app.models.system_task_occurrence import SystemTaskOccurrence
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
from app.services.system_task_schedule import matches_template_date, should_reopen_system_task
from app.services.system_task_occurrences import DONE, NOT_DONE, OPEN, SKIPPED, ensure_occurrences_in_range


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
) -> list[Task]:
    """Sync tasks for all assignees of a template. Returns list of tasks."""
    now = datetime.now(timezone.utc)
    active_value = _task_is_active(template)
    
    # Get all assignees from the array (safely handle NULL or missing field)
    assignee_ids = getattr(template, 'assignee_ids', None) or []
    if not assignee_ids and template.default_assignee_id:
        assignee_ids = [template.default_assignee_id]
    
    if not assignee_ids:
        return []
    
    tasks = []
    for assignee_id in assignee_ids:
        # Get user to determine department
        user = (
            await db.execute(select(User).where(User.id == assignee_id))
        ).scalar_one_or_none()
        
        if not user:
            continue
        
        # Check if task exists for this user
        task = (
            await db.execute(
                select(Task)
                .where(
                    Task.system_template_origin_id == template.id,
                    Task.assigned_to == assignee_id
                )
                .order_by(Task.created_at.desc())
            )
        ).scalars().first()
        
        if task is None:
            task = Task(
                title=template.title,
                description=template.description,
                internal_notes=template.internal_notes,
                department_id=user.department_id or template.department_id,
                assigned_to=assignee_id,
                created_by=creator_id,
                status=_enum_value(TaskStatus.TODO),
                priority=_enum_value(template.priority or TaskPriority.NORMAL),
                finish_period=_enum_value(template.finish_period),
                system_template_origin_id=template.id,
                start_date=now,
                is_active=active_value,
            )
            db.add(task)
            try:
                await db.flush()
            except Exception as e:
                # Check if it's a unique constraint violation
                error_msg = str(e).lower()
                if 'unique' in error_msg or 'duplicate' in error_msg:
                    # Task might already exist, try to fetch it again
                    task = (
                        await db.execute(
                            select(Task)
                            .where(
                                Task.system_template_origin_id == template.id,
                                Task.assigned_to == assignee_id
                            )
                            .order_by(Task.created_at.desc())
                        )
                    ).scalars().first()
                    if task is None:
                        raise  # Re-raise if we still can't find it
                else:
                    raise  # Re-raise if it's a different error
            
            # Add single assignee to TaskAssignee table (only if not already exists)
            existing_assignee = (
                await db.execute(
                    select(TaskAssignee)
                    .where(TaskAssignee.task_id == task.id, TaskAssignee.user_id == assignee_id)
                )
            ).scalar_one_or_none()
            if not existing_assignee:
                await db.execute(
                    insert(TaskAssignee),
                    [{"task_id": task.id, "user_id": assignee_id}],
                )
        else:
            # Update existing task
            task.title = template.title
            task.description = template.description
            task.internal_notes = template.internal_notes
            task.department_id = user.department_id or template.department_id
            task.finish_period = _enum_value(template.finish_period)
            task.is_active = active_value
            task.priority = _enum_value(template.priority or TaskPriority.NORMAL)
            if active_value and should_reopen_system_task(task, template, now):
                task.status = _enum_value(TaskStatus.TODO)
                task.completed_at = None
        
        tasks.append(task)
    
    return tasks


def _task_row_to_out(
    task: Task,
    template: SystemTaskTemplate,
    assignees: list[TaskAssigneeOut],
    user_comment: str | None = None,
    alignment_roles: list[str] | None = None,
    alignment_user_ids: list[uuid.UUID] | None = None,
    occurrence_date: date | None = None,
    occurrence_status: str | None = None,  # NEW: occurrence status for current user
) -> SystemTaskOut:
    priority_value = task.priority or TaskPriority.NORMAL
    
    # Use occurrence status if provided, otherwise use task status
    # Map occurrence status to TaskStatus
    if occurrence_status:
        if occurrence_status == "DONE":
            final_status = TaskStatus.DONE
        elif occurrence_status == "NOT_DONE":
            final_status = TaskStatus.NOT_DONE
        elif occurrence_status == "SKIPPED":
            final_status = TaskStatus.NOT_DONE
        elif occurrence_status == "OPEN":
            final_status = TaskStatus.TODO
        else:
            final_status = task.status
    else:
        final_status = task.status
    
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
        priority=priority_value,
        finish_period=task.finish_period,
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


def _previous_occurrence_date(template: SystemTaskTemplate, target: date) -> date:
    """Find the most recent occurrence date on or before target."""
    candidate = target
    for _ in range(370):
        if matches_template_date(template, candidate):
            return candidate
        candidate = candidate - timedelta(days=1)
    return target


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

    for tmpl in templates:
        try:
            await _sync_task_for_template(db=db, template=tmpl, creator_id=user.id)
        except Exception as e:
            # Log the error but continue with other templates
            import logging
            logger = logging.getLogger(__name__)
            logger.error(f"Error syncing task for template {tmpl.id}: {str(e)}", exc_info=True)
            # Rollback this template's changes
            await db.rollback()
            continue
    await db.commit()

    template_ids = [t.id for t in templates]
    base_date = occurrence_date or date.today()
    occurrence_date_map: dict[uuid.UUID, date] = {
        tmpl.id: (base_date if matches_template_date(tmpl, base_date) else _previous_occurrence_date(tmpl, base_date))
        for tmpl in templates
    }
    # Start from templates and LEFT JOIN tasks to include templates without tasks
    task_stmt = (
        select(SystemTaskTemplate, Task)
        .outerjoin(Task, Task.system_template_origin_id == SystemTaskTemplate.id)
        .where(SystemTaskTemplate.id.in_(template_ids))
    )
    # If filtering by user (My View), only show tasks assigned to that user
    if assigned_to is not None:
        task_stmt = task_stmt.where(Task.assigned_to == assigned_to)
    if only_active:
        task_stmt = task_stmt.where(
            or_(
                Task.is_active.is_(True),
                Task.id.is_(None)  # Include templates without tasks
            )
        )
    task_stmt = task_stmt.order_by(
        SystemTaskTemplate.created_at.desc(),
        Task.is_active.desc().nullslast(),
        Task.created_at.desc().nullslast()
    )

    rows = (await db.execute(task_stmt)).all()
    # Return all tasks for each template (no de-duplication)
    # Also include templates that don't have tasks yet
    task_ids = [task.id for template, task in rows if task is not None]
    assignee_map = await _assignees_for_tasks(db, task_ids)
    fallback_ids = [
        task.assigned_to
        for template, task in rows
        if task is not None and task.assigned_to is not None and not assignee_map.get(task.id)
    ]
    if fallback_ids:
        fallback_users = (
            await db.execute(select(User).where(User.id.in_(fallback_ids)))
        ).scalars().all()
        fallback_map = {user.id: user for user in fallback_users}
        for template, task in rows:
            if task is None:
                continue
            if assignee_map.get(task.id):
                continue
            if task.assigned_to in fallback_map:
                assignee_map[task.id] = [_user_to_assignee(fallback_map[task.assigned_to])]

    # Fetch user comments for all tasks
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

    # Fetch occurrence statuses for the current user (for My View / per-user status)
    occurrence_status_map: dict[uuid.UUID, str] = {}
    if user.id and template_ids:
        templates_by_date: dict[date, list[uuid.UUID]] = {}
        for template_id, target_date in occurrence_date_map.items():
            templates_by_date.setdefault(target_date, []).append(template_id)

        for target_date, date_template_ids in templates_by_date.items():
            await ensure_occurrences_in_range(
                db=db,
                start=target_date,
                end=target_date,
                template_ids=date_template_ids,
            )
            occ_rows = (
                await db.execute(
                    select(SystemTaskOccurrence.template_id, SystemTaskOccurrence.status)
                    .where(SystemTaskOccurrence.template_id.in_(date_template_ids))
                    .where(SystemTaskOccurrence.user_id == user.id)
                    .where(SystemTaskOccurrence.occurrence_date == target_date)
                )
            ).all()
            for template_id, status_value in occ_rows:
                occurrence_status_map[template_id] = status_value

    roles_map, alignment_users_map = await _alignment_maps_for_templates(db, template_ids)

    # If filtering by user (My View), return individual tasks instead of grouped
    if assigned_to is not None:
        result = []
        for template, task in rows:
            if task is None:
                continue  # Skip templates without tasks in My View
            
            task_assignees = assignee_map.get(task.id, [])
            if not task_assignees and task.assigned_to:
                # Fallback to assigned_to user
                assigned_user = (
                    await db.execute(select(User).where(User.id == task.assigned_to))
                ).scalar_one_or_none()
                if assigned_user:
                    task_assignees = [_user_to_assignee(assigned_user)]
            
            # Get occurrence status for this template and user
            occ_status = occurrence_status_map.get(template.id)
            if occ_status is None and user.id:
                assignee_ids = getattr(template, "assignee_ids", None) or []
                if not assignee_ids and template.default_assignee_id:
                    assignee_ids = [template.default_assignee_id]
                if user.id in assignee_ids:
                    occ_status = OPEN
            
            task_out = _task_row_to_out(
                task,
                template,
                task_assignees,
                user_comment_map.get(task.id),
                roles_map.get(template.id),
                alignment_users_map.get(template.id),
                occurrence_date=occurrence_date_map.get(template.id),
                occurrence_status=occ_status,
            )
            # For individual tasks, department_ids is just the task's department
            task_out.department_ids = [task.department_id] if task.department_id else None
            result.append(task_out)
        return result

    # Group tasks by template_id to collect all departments (for Department View)
    template_tasks_map: dict[uuid.UUID, list[tuple[Task, SystemTaskTemplate]]] = {}
    template_only_map: dict[uuid.UUID, SystemTaskTemplate] = {}
    
    for template, task in rows:
        if task is None:
            template_only_map[template.id] = template
        else:
            if template.id not in template_tasks_map:
                template_tasks_map[template.id] = []
            template_tasks_map[template.id].append((task, template))
    
    result = []
    
    # Process templates with tasks - group by template and collect all departments
    for template_id, task_list in template_tasks_map.items():
        template = task_list[0][1]  # Get template from first task
        # Collect all unique department IDs from tasks
        department_ids_set = {task.department_id for task, _ in task_list if task.department_id is not None}
        department_ids = sorted(list(department_ids_set)) if department_ids_set else None
        
        # Collect all unique assignees from all tasks
        all_assignees_map = {}
        for task, _ in task_list:
            task_assignees = assignee_map.get(task.id, [])
            for assignee in task_assignees:
                if assignee.id not in all_assignees_map:
                    all_assignees_map[assignee.id] = assignee
        all_assignees = list(all_assignees_map.values())
        
        # Use the first task for the main response, but include all department_ids and all assignees
        first_task, _ = task_list[0]
        # Get occurrence status for the current user (if viewing their own tasks)
        occ_status = occurrence_status_map.get(template.id) if user.id else None
        if occ_status is None and user.id:
            assignee_ids = getattr(template, "assignee_ids", None) or []
            if not assignee_ids and template.default_assignee_id:
                assignee_ids = [template.default_assignee_id]
            if user.id in assignee_ids:
                occ_status = OPEN
        task_out = _task_row_to_out(
            first_task,
            template,
            all_assignees,
            user_comment_map.get(first_task.id),
            roles_map.get(template.id),
            alignment_users_map.get(template.id),
            occurrence_date=occurrence_date_map.get(template.id),
            occurrence_status=occ_status,
        )
        # Add department_ids to the response
        task_out.department_ids = department_ids if department_ids else None
        result.append(task_out)
    
    # Process templates without tasks
    for template_id, template in template_only_map.items():
        assignees_list = []
        department_ids_set = set()
        
        if template.assignee_ids:
            assignee_users = (
                await db.execute(select(User).where(User.id.in_(template.assignee_ids)))
            ).scalars().all()
            assignees_list = [_user_to_assignee(user) for user in assignee_users]
            # Collect department IDs from assignees
            department_ids_set = {user.department_id for user in assignee_users if user.department_id is not None}
        elif template.default_assignee_id:
            assignee_user = (
                await db.execute(select(User).where(User.id == template.default_assignee_id))
            ).scalar_one_or_none()
            if assignee_user:
                assignees_list = [_user_to_assignee(assignee_user)]
                if assignee_user.department_id:
                    department_ids_set.add(assignee_user.department_id)
        
        department_ids = sorted(list(department_ids_set)) if department_ids_set else None
        if template.department_id and template.department_id not in department_ids_set:
            department_ids_set.add(template.department_id)
            department_ids = sorted(list(department_ids_set))
        
        result.append(SystemTaskOut(
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
            occurrence_date=occurrence_date_map.get(template.id),
            priority=TaskPriority(template.priority) if template.priority else TaskPriority.NORMAL,
            finish_period=TaskFinishPeriod(template.finish_period) if template.finish_period else None,
            status=TaskStatus.TODO,
            is_active=template.is_active,
            user_comment=None,
            requires_alignment=getattr(template, "requires_alignment", False),
            alignment_time=getattr(template, "alignment_time", None),
            alignment_roles=roles_map.get(template.id),
            alignment_user_ids=alignment_users_map.get(template.id),
            created_by=None,
            created_at=template.created_at,
        ))
    
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
    allowed = {OPEN, DONE, NOT_DONE, SKIPPED}
    if payload.status not in allowed:
        raise HTTPException(status_code=status.HTTP_400_BAD_REQUEST, detail="Invalid status")

    tmpl = (
        await db.execute(select(SystemTaskTemplate).where(SystemTaskTemplate.id == payload.template_id))
    ).scalar_one_or_none()
    if tmpl is None:
        # Some clients might send a task ID instead of a template ID.
        task = (
            await db.execute(select(Task).where(Task.id == payload.template_id))
        ).scalar_one_or_none()
        if task and task.system_template_origin_id:
            tmpl = (
                await db.execute(
                    select(SystemTaskTemplate).where(SystemTaskTemplate.id == task.system_template_origin_id)
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

    # Ensure the occurrence row exists (idempotent).
    await ensure_occurrences_in_range(db=db, start=payload.occurrence_date, end=payload.occurrence_date, template_ids=[tmpl.id])

    occ = (
        await db.execute(
            select(SystemTaskOccurrence)
            .where(SystemTaskOccurrence.template_id == tmpl.id)
            .where(SystemTaskOccurrence.user_id == user.id)
            .where(SystemTaskOccurrence.occurrence_date == payload.occurrence_date)
        )
    ).scalar_one_or_none()
    if occ is None:
        # This shouldn't happen if ensure_occurrences_in_range worked, but handle it gracefully
        raise HTTPException(
            status_code=status.HTTP_400_BAD_REQUEST, 
            detail="Occurrence not available for this user. Please refresh and try again."
        )

    now = datetime.now(timezone.utc)
    occ.status = payload.status
    occ.comment = payload.comment
    occ.acted_at = None if payload.status == OPEN else now

    # Also update the corresponding Task status if it exists
    # Find the task for this user and template
    task = (
        await db.execute(
            select(Task)
            .where(Task.system_template_origin_id == tmpl.id)
            .where(Task.assigned_to == user.id)
            .order_by(Task.created_at.desc())
        )
    ).scalars().first()
    
    if task:
        # Map occurrence status to task status
        if payload.status == DONE:
            task.status = TaskStatus.DONE
            task.completed_at = now
        elif payload.status == NOT_DONE:
            task.status = TaskStatus.NOT_DONE
            task.completed_at = now
        elif payload.status == SKIPPED:
            task.status = TaskStatus.NOT_DONE  # Map SKIPPED to NOT_DONE for tasks
            task.completed_at = now
        elif payload.status == OPEN:
            task.status = TaskStatus.TODO
            task.completed_at = None

    await db.commit()
    return {"ok": True}


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
        # Check if any assignee is gane.arifaj - if so, set department to GA
        gane_user = next((u for u in assignee_users if u.username and u.username.lower() == "gane.arifaj"), None)
        if gane_user:
            # Find GA department
            ga_department = (
                await db.execute(select(Department).where(Department.code == "GA"))
            ).scalar_one_or_none()
            if ga_department:
                # Set department to GA and scope to DEPARTMENT
                department_id = ga_department.id
                scope_value = SystemTaskScope.DEPARTMENT
        else:
            # Get unique departments from assignees
            assignee_departments = {u.department_id for u in assignee_users if u.department_id is not None}
            
            if len(assignee_departments) == 1:
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
    tasks = await _sync_task_for_template(db=db, template=template, creator_id=user.id)
    await db.commit()
    await db.refresh(template)
    if tasks:
        # Refresh all tasks
        for task in tasks:
            await db.refresh(task)
        # Use the first task for the response
        task = tasks[0]
        assignee_map = await _assignees_for_tasks(db, [task.id])
        if not assignee_map.get(task.id) and task.assigned_to is not None:
            assigned_user = (await db.execute(select(User).where(User.id == task.assigned_to))).scalar_one_or_none()
            if assigned_user is not None:
                assignee_map[task.id] = [_user_to_assignee(assigned_user)]
        roles_map, alignment_users_map = await _alignment_maps_for_templates(db, [template.id])
        # Collect all department IDs from all tasks
        department_ids_set = {t.department_id for t in tasks if t.department_id is not None}
        department_ids = sorted(list(department_ids_set)) if department_ids_set else None
        task_out = _task_row_to_out(
            task,
            template,
            assignee_map.get(task.id, []),
            None,
            roles_map.get(template.id),
            alignment_users_map.get(template.id),
        )
        task_out.department_ids = department_ids
        return task_out
    else:
        # No tasks created, return a response using template data directly
        roles_map, alignment_users_map = await _alignment_maps_for_templates(db, [template.id])
        
        # Get all assignees from the template's assignee_ids
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
        
        # Return using template data directly (no task needed)
        return SystemTaskOut(
            id=template.id,  # Use template ID as the task ID for display
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
            status=TaskStatus.TODO,  # Default status
            is_active=template.is_active,
            user_comment=None,
            requires_alignment=getattr(template, "requires_alignment", False),
            alignment_time=getattr(template, "alignment_time", None),
            alignment_roles=roles_map.get(template.id),
            alignment_user_ids=alignment_users_map.get(template.id),
            created_by=user.id,
            created_at=template.created_at,
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
        # Check if any assignee is gane.arifaj - if so, set department to GA
        gane_user = next((u for u in assignee_users if u.username and u.username.lower() == "gane.arifaj"), None)
        if gane_user:
            # Find GA department
            ga_department = (
                await db.execute(select(Department).where(Department.code == "GA"))
            ).scalar_one_or_none()
            if ga_department:
                # Set department to GA and scope to DEPARTMENT
                target_department = ga_department.id
                scope_value = SystemTaskScope.DEPARTMENT
        else:
            # Get unique departments from assignees
            assignee_departments = {u.department_id for u in assignee_users if u.department_id is not None}
            
            if len(assignee_departments) == 1:
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
        # If gane.arifaj is assigned, ensure department is set to GA (already set above)
        elif assignee_set and assignee_users:
            gane_user = next((u for u in assignee_users if u.username and u.username.lower() == "gane.arifaj"), None)
            if gane_user and template.department_id is None:
                ga_department = (
                    await db.execute(select(Department).where(Department.code == "GA"))
                ).scalar_one_or_none()
                if ga_department:
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
    tasks = await _sync_task_for_template(db=db, template=template, creator_id=user.id)
    await db.commit()
    await db.refresh(template)
    if tasks:
        # Refresh all tasks
        for task in tasks:
            await db.refresh(task)
        # Use the first task for the response
        task = tasks[0]
        assignee_map = await _assignees_for_tasks(db, [task.id])
        if not assignee_map.get(task.id) and task.assigned_to is not None:
            assigned_user = (await db.execute(select(User).where(User.id == task.assigned_to))).scalar_one_or_none()
            if assigned_user is not None:
                assignee_map[task.id] = [_user_to_assignee(assigned_user)]
        roles_map, alignment_users_map = await _alignment_maps_for_templates(db, [template.id])
        # Collect all department IDs from all tasks
        department_ids_set = {t.department_id for t in tasks if t.department_id is not None}
        department_ids = sorted(list(department_ids_set)) if department_ids_set else None
        task_out = _task_row_to_out(
            task,
            template,
            assignee_map.get(task.id, []),
            None,
            roles_map.get(template.id),
            alignment_users_map.get(template.id),
        )
        task_out.department_ids = department_ids
        return task_out
    else:
        # No tasks created, return a response using template data directly
        roles_map, alignment_users_map = await _alignment_maps_for_templates(db, [template.id])
        
        # Get all assignees from the template's assignee_ids
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
        
        # Return using template data directly (no task needed)
        return SystemTaskOut(
            id=template.id,  # Use template ID as the task ID for display
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
            status=TaskStatus.TODO,  # Default status
            is_active=template.is_active,
            user_comment=None,
            requires_alignment=getattr(template, "requires_alignment", False),
            alignment_time=getattr(template, "alignment_time", None),
            alignment_roles=roles_map.get(template.id),
            alignment_user_ids=alignment_users_map.get(template.id),
            created_by=user.id,
            created_at=template.created_at,
        )
