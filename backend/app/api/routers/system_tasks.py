from __future__ import annotations

import uuid
from datetime import date, datetime, timezone

from fastapi import APIRouter, Depends, HTTPException, Response, status
from sqlalchemy import func, or_, select, text, update
from sqlalchemy.ext.asyncio import AsyncSession

from app.api.access import ensure_department_access, ensure_manager_or_admin
from app.api.deps import get_current_user, require_admin
from app.db import get_db
from app.models.department import Department
from app.models.enums import FrequencyType, NotificationType, TaskPriority, TaskStatus, UserRole
from app.models.notification import Notification
from app.models.task import Task
from app.models.system_task_template import SystemTaskTemplate
from app.models.user import User
from app.schemas.system_task_template import SystemTaskTemplateCreate, SystemTaskTemplateOut
from app.services.audit import add_audit_log
from app.services.notifications import add_notification, publish_notification


router = APIRouter()


def _should_run_template(template: SystemTaskTemplate, today: date) -> bool:
    if template.frequency == FrequencyType.DAILY:
        return True
    if template.frequency == FrequencyType.WEEKLY:
        if template.day_of_week is None:
            return today.weekday() == 0
        return today.weekday() == template.day_of_week
    if template.frequency == FrequencyType.MONTHLY:
        if template.day_of_month is None:
            return today.day == 1
        return today.day == template.day_of_month
    if template.frequency == FrequencyType.YEARLY:
        if template.month_of_year is not None and today.month != template.month_of_year:
            return False
        if template.day_of_month is not None and today.day != template.day_of_month:
            return False
        return True
    if template.frequency == FrequencyType.THREE_MONTHS:
        if template.month_of_year is not None and today.month != template.month_of_year:
            return False
        if template.day_of_month is not None and today.day != template.day_of_month:
            return False
        return today.month % 3 == 0
    if template.frequency == FrequencyType.SIX_MONTHS:
        if template.month_of_year is not None and today.month != template.month_of_year:
            return False
        if template.day_of_month is not None and today.day != template.day_of_month:
            return False
        return today.month % 6 == 0
    return False


async def _create_tasks_from_template(
    *,
    db: AsyncSession,
    template: SystemTaskTemplate,
    creator_id: uuid.UUID,
) -> list[Notification]:
    today = datetime.now(timezone.utc).date()
    if not template.is_active or not _should_run_template(template, today):
        return []

    if template.department_id is not None:
        target_departments = [template.department_id]
    else:
        target_departments = (await db.execute(select(Department.id))).scalars().all()

    if not target_departments:
        return []

    created_tasks: list[Task] = []
    for dept_id in target_departments:
        existing = (
            await db.execute(
                select(Task.id).where(
                    Task.system_template_origin_id == template.id,
                    Task.department_id == dept_id,
                    func.date(Task.start_date) == today,
                )
            )
        ).scalar_one_or_none()
        if existing is not None:
            continue

        task = Task(
            department_id=dept_id,
            project_id=None,
            title=template.title,
            description=template.description,
            status=TaskStatus.TODO,
            priority=template.priority or TaskPriority.MEDIUM,
            assigned_to=template.default_assignee_id,
            created_by=template.default_assignee_id or creator_id,
            system_template_origin_id=template.id,
            start_date=datetime.now(timezone.utc),
        )
        db.add(task)
        created_tasks.append(task)

    if not created_tasks:
        return []

    await db.flush()

    created_notifications: list[Notification] = []
    for task in created_tasks:
        add_audit_log(
            db=db,
            actor_user_id=creator_id,
            entity_type="task",
            entity_id=task.id,
            action="system_generated",
            after={
                "template_id": str(template.id),
                "run_date": today.isoformat(),
                "department_id": str(task.department_id),
            },
        )
        if template.default_assignee_id is not None:
            created_notifications.append(
                add_notification(
                    db=db,
                    user_id=template.default_assignee_id,
                    type=NotificationType.assignment,
                    title="System task assigned",
                    body=template.title,
                    data={"task_id": str(task.id), "template_id": str(template.id)},
                )
            )

    return created_notifications


def _template_to_out(template: SystemTaskTemplate) -> SystemTaskTemplateOut:
    priority_value = template.priority or TaskPriority.MEDIUM
    if priority_value == TaskPriority.URGENT:
        priority_value = TaskPriority.HIGH
    return SystemTaskTemplateOut(
        id=template.id,
        title=template.title,
        description=template.description,
        department_id=template.department_id,
        default_assignee_id=template.default_assignee_id,
        frequency=template.frequency,
        day_of_week=template.day_of_week,
        day_of_month=template.day_of_month,
        month_of_year=template.month_of_year,
        priority=priority_value,
        is_active=template.is_active,
        created_at=template.created_at,
    )


@router.get("", response_model=list[SystemTaskTemplateOut])
async def list_system_task_templates(
    department_id: uuid.UUID | None = None,
    only_active: bool = False,
    db: AsyncSession = Depends(get_db),
    user=Depends(get_current_user),
) -> list[SystemTaskTemplateOut]:
    stmt = select(SystemTaskTemplate)

    if department_id is not None:
        if user.role != UserRole.ADMIN:
            ensure_department_access(user, department_id)
        stmt = stmt.where(
            or_(
                SystemTaskTemplate.department_id == department_id,
                SystemTaskTemplate.department_id.is_(None),
            )
        )

    if only_active:
        stmt = stmt.where(SystemTaskTemplate.is_active.is_(True))

    rows = (await db.execute(stmt.order_by(SystemTaskTemplate.created_at))).scalars().all()
    return [_template_to_out(template) for template in rows]


@router.post("", response_model=SystemTaskTemplateOut, status_code=status.HTTP_201_CREATED)
async def create_system_task_template(
    payload: SystemTaskTemplateCreate,
    db: AsyncSession = Depends(get_db),
    user=Depends(get_current_user),
) -> SystemTaskTemplateOut:
    ensure_manager_or_admin(user)
    if payload.department_id is not None:
        ensure_department_access(user, payload.department_id)

    if payload.department_id is not None:
        department = (
            await db.execute(select(Department).where(Department.id == payload.department_id))
        ).scalar_one_or_none()
        if department is None:
            raise HTTPException(status_code=status.HTTP_404_NOT_FOUND, detail="Department not found")

    default_assignee: User | None = None
    if payload.default_assignee_id is not None:
        default_assignee = (
            await db.execute(select(User).where(User.id == payload.default_assignee_id))
        ).scalar_one_or_none()
        if default_assignee is None:
            raise HTTPException(status_code=status.HTTP_404_NOT_FOUND, detail="Assignee not found")
        if payload.department_id is not None and default_assignee.department_id != payload.department_id:
            raise HTTPException(
                status_code=status.HTTP_400_BAD_REQUEST,
                detail="Assignee must belong to the selected department",
            )

    priority_value = payload.priority or TaskPriority.MEDIUM
    if priority_value == TaskPriority.URGENT:
        priority_value = TaskPriority.HIGH

    template = SystemTaskTemplate(
        title=payload.title,
        description=payload.description,
        department_id=payload.department_id,
        default_assignee_id=payload.default_assignee_id,
        frequency=payload.frequency,
        day_of_week=payload.day_of_week,
        day_of_month=payload.day_of_month,
        month_of_year=payload.month_of_year,
        priority=priority_value,
        is_active=payload.is_active if payload.is_active is not None else True,
    )

    db.add(template)
    await db.flush()

    created_notifications = await _create_tasks_from_template(db=db, template=template, creator_id=user.id)

    await db.commit()
    await db.refresh(template)

    for notification in created_notifications:
        try:
            await publish_notification(user_id=notification.user_id, notification=notification)
        except Exception:
            pass
    return _template_to_out(template)


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
        await db.execute(
            update(Task)
            .where(Task.system_template_origin_id == template_id)
            .values(system_template_origin_id=None)
        )

    await db.delete(template)
    await db.commit()
    return Response(status_code=status.HTTP_204_NO_CONTENT)
