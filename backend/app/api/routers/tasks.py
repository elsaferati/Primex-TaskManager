from __future__ import annotations

import re
import uuid
from datetime import date, datetime, timedelta, timezone

from fastapi import APIRouter, Depends, HTTPException, status
from sqlalchemy import and_, or_, select
from sqlalchemy.ext.asyncio import AsyncSession

from app.api.access import ensure_department_access, ensure_manager_or_admin
from app.api.deps import get_current_user
from app.db import get_db
from app.models.board import Board
from app.models.enums import NotificationType, TaskType, UserRole
from app.models.notification import Notification
from app.models.project import Project
from app.models.task import Task
from app.models.task_status import TaskStatus
from app.models.user import User
from app.schemas.task import TaskCreate, TaskMove, TaskOut, TaskUpdate
from app.services.audit import add_audit_log
from app.services.notifications import add_notification, publish_notification


router = APIRouter()

MENTION_RE = re.compile(r"@([A-Za-z0-9_\\-\\.]{3,64})")


def _task_to_out(task: Task) -> TaskOut:
    return TaskOut(
        id=task.id,
        department_id=task.department_id,
        board_id=task.board_id,
        project_id=task.project_id,
        title=task.title,
        description=task.description,
        task_type=task.task_type,
        status_id=task.status_id,
        position=task.position,
        assigned_to_user_id=task.assigned_to_user_id,
        planned_for=task.planned_for,
        is_carried_over=task.is_carried_over,
        carried_over_from=task.carried_over_from,
        is_milestone=task.is_milestone,
        reminder_enabled=task.reminder_enabled,
        next_reminder_at=task.next_reminder_at,
        created_at=task.created_at,
        updated_at=task.updated_at,
        completed_at=task.completed_at,
    )


async def _project_board_department(db: AsyncSession, project_id: uuid.UUID) -> tuple[Project, Board]:
    project = (await db.execute(select(Project).where(Project.id == project_id))).scalar_one_or_none()
    if project is None:
        raise HTTPException(status_code=status.HTTP_404_NOT_FOUND, detail="Project not found")
    board = (await db.execute(select(Board).where(Board.id == project.board_id))).scalar_one_or_none()
    if board is None:
        raise HTTPException(status_code=status.HTTP_404_NOT_FOUND, detail="Board not found")
    return project, board


async def _status_for_department(db: AsyncSession, department_id: uuid.UUID, status_id: uuid.UUID) -> TaskStatus:
    status_row = (
        await db.execute(
            select(TaskStatus).where(TaskStatus.id == status_id, TaskStatus.department_id == department_id)
        )
    ).scalar_one_or_none()
    if status_row is None:
        raise HTTPException(status_code=status.HTTP_400_BAD_REQUEST, detail="Invalid status")
    return status_row


async def _users_by_usernames(db: AsyncSession, usernames: set[str]) -> list[User]:
    if not usernames:
        return []
    rows = (await db.execute(select(User).where(User.username.in_(sorted(usernames))))).scalars().all()
    return rows


def _extract_mentions(text: str | None) -> set[str]:
    if not text:
        return set()
    return set(MENTION_RE.findall(text))


@router.get("", response_model=list[TaskOut])
async def list_tasks(
    department_id: uuid.UUID | None = None,
    board_id: uuid.UUID | None = None,
    project_id: uuid.UUID | None = None,
    status_id: uuid.UUID | None = None,
    assigned_to_user_id: uuid.UUID | None = None,
    planned_from: date | None = None,
    planned_to: date | None = None,
    include_done: bool = True,
    db: AsyncSession = Depends(get_db),
    user=Depends(get_current_user),
) -> list[TaskOut]:
    stmt = select(Task)

    if user.role != UserRole.admin:
        if user.department_id is None:
            return []
        stmt = stmt.where(Task.department_id == user.department_id)

    if department_id:
        ensure_department_access(user, department_id)
        stmt = stmt.where(Task.department_id == department_id)
    if board_id:
        stmt = stmt.where(Task.board_id == board_id)
    if project_id:
        stmt = stmt.where(Task.project_id == project_id)
    if status_id:
        stmt = stmt.where(Task.status_id == status_id)
    if assigned_to_user_id:
        stmt = stmt.where(Task.assigned_to_user_id == assigned_to_user_id)
    if planned_from:
        stmt = stmt.where(Task.planned_for >= planned_from)
    if planned_to:
        stmt = stmt.where(Task.planned_for <= planned_to)
    if not include_done:
        stmt = stmt.where(Task.completed_at.is_(None))

    tasks = (await db.execute(stmt.order_by(Task.status_id, Task.position, Task.created_at))).scalars().all()
    return [_task_to_out(t) for t in tasks]


@router.get("/{task_id}", response_model=TaskOut)
async def get_task(
    task_id: uuid.UUID,
    db: AsyncSession = Depends(get_db),
    user=Depends(get_current_user),
) -> TaskOut:
    task = (await db.execute(select(Task).where(Task.id == task_id))).scalar_one_or_none()
    if task is None:
        raise HTTPException(status_code=status.HTTP_404_NOT_FOUND, detail="Task not found")
    ensure_department_access(user, task.department_id)
    return _task_to_out(task)


@router.post("", response_model=TaskOut)
async def create_task(
    payload: TaskCreate,
    db: AsyncSession = Depends(get_db),
    user=Depends(get_current_user),
) -> TaskOut:
    ensure_manager_or_admin(user)
    if payload.task_type == TaskType.system:
        raise HTTPException(status_code=status.HTTP_400_BAD_REQUEST, detail="System tasks are generated from templates")

    project, board = await _project_board_department(db, payload.project_id)
    ensure_department_access(user, board.department_id)

    status_row = await _status_for_department(db, board.department_id, payload.status_id)

    assigned_user = None
    if payload.assigned_to_user_id is not None:
        assigned_user = (
            await db.execute(select(User).where(User.id == payload.assigned_to_user_id))
        ).scalar_one_or_none()
        if assigned_user is None:
            raise HTTPException(status_code=status.HTTP_400_BAD_REQUEST, detail="Assigned user not found")
        if assigned_user.department_id != board.department_id:
            raise HTTPException(status_code=status.HTTP_400_BAD_REQUEST, detail="Assigned user must be in department")

    reminder_enabled = payload.reminder_enabled or payload.task_type == TaskType.reminder
    next_reminder_at = None
    if reminder_enabled:
        next_reminder_at = datetime.now(timezone.utc) + timedelta(minutes=60)

    task = Task(
        department_id=board.department_id,
        board_id=board.id,
        project_id=project.id,
        title=payload.title,
        description=payload.description,
        task_type=payload.task_type,
        status_id=payload.status_id,
        position=payload.position,
        assigned_to_user_id=payload.assigned_to_user_id,
        created_by_user_id=user.id,
        planned_for=payload.planned_for,
        is_milestone=payload.is_milestone,
        reminder_enabled=reminder_enabled,
        next_reminder_at=next_reminder_at,
    )
    db.add(task)
    await db.flush()

    add_audit_log(
        db=db,
        actor_user_id=user.id,
        entity_type="task",
        entity_id=task.id,
        action="created",
        before=None,
        after={"title": task.title, "status_id": str(task.status_id), "assigned_to_user_id": str(task.assigned_to_user_id) if task.assigned_to_user_id else None},
    )

    created_notifications: list[Notification] = []
    if assigned_user is not None:
        created_notifications.append(
            add_notification(
                db=db,
                user_id=assigned_user.id,
                type=NotificationType.assignment,
                title="Task assigned",
                body=task.title,
                data={"task_id": str(task.id)},
            )
        )

    mentions = _extract_mentions(task.title) | _extract_mentions(task.description)
    if mentions:
        mentioned_users = await _users_by_usernames(db, mentions)
        for mu in mentioned_users:
            if mu.id == user.id:
                continue
            created_notifications.append(
                add_notification(
                    db=db,
                    user_id=mu.id,
                    type=NotificationType.mention,
                    title="Mentioned in task",
                    body=task.title,
                    data={"task_id": str(task.id)},
                )
            )

    await db.commit()

    for n in created_notifications:
        try:
            await publish_notification(user_id=n.user_id, notification=n)
        except Exception:
            pass

    await db.refresh(task)
    return _task_to_out(task)


@router.patch("/{task_id}", response_model=TaskOut)
async def update_task(
    task_id: uuid.UUID,
    payload: TaskUpdate,
    db: AsyncSession = Depends(get_db),
    user=Depends(get_current_user),
) -> TaskOut:
    task = (await db.execute(select(Task).where(Task.id == task_id))).scalar_one_or_none()
    if task is None:
        raise HTTPException(status_code=status.HTTP_404_NOT_FOUND, detail="Task not found")
    ensure_department_access(user, task.department_id)

    if user.role == UserRole.staff and task.assigned_to_user_id != user.id:
        raise HTTPException(status_code=status.HTTP_403_FORBIDDEN, detail="Forbidden")

    if user.role == UserRole.staff:
        forbidden_fields = {
            "title": payload.title,
            "assigned_to_user_id": payload.assigned_to_user_id,
            "planned_for": payload.planned_for,
            "is_milestone": payload.is_milestone,
        }
        if any(v is not None for v in forbidden_fields.values()):
            raise HTTPException(status_code=status.HTTP_403_FORBIDDEN, detail="Forbidden")

    before = {
        "title": task.title,
        "description": task.description,
        "status_id": str(task.status_id),
        "position": task.position,
        "assigned_to_user_id": str(task.assigned_to_user_id) if task.assigned_to_user_id else None,
        "planned_for": task.planned_for.isoformat() if task.planned_for else None,
        "reminder_enabled": task.reminder_enabled,
    }

    created_notifications: list[Notification] = []

    if payload.title is not None:
        task.title = payload.title
    if payload.description is not None:
        task.description = payload.description
    if payload.position is not None:
        task.position = payload.position

    new_status_row = None
    if payload.status_id is not None and payload.status_id != task.status_id:
        new_status_row = await _status_for_department(db, task.department_id, payload.status_id)
        task.status_id = payload.status_id
        if new_status_row.is_done:
            task.completed_at = datetime.now(timezone.utc)
        else:
            task.completed_at = None

    if payload.assigned_to_user_id is not None and payload.assigned_to_user_id != task.assigned_to_user_id:
        ensure_manager_or_admin(user)
        assigned_user = (
            await db.execute(select(User).where(User.id == payload.assigned_to_user_id))
        ).scalar_one_or_none()
        if assigned_user is None:
            raise HTTPException(status_code=status.HTTP_400_BAD_REQUEST, detail="Assigned user not found")
        if assigned_user.department_id != task.department_id:
            raise HTTPException(status_code=status.HTTP_400_BAD_REQUEST, detail="Assigned user must be in department")
        task.assigned_to_user_id = payload.assigned_to_user_id
        created_notifications.append(
            add_notification(
                db=db,
                user_id=assigned_user.id,
                type=NotificationType.assignment,
                title="Task assigned",
                body=task.title,
                data={"task_id": str(task.id)},
            )
        )

    if payload.planned_for is not None:
        ensure_manager_or_admin(user)
        task.planned_for = payload.planned_for

    if payload.is_milestone is not None:
        ensure_manager_or_admin(user)
        task.is_milestone = payload.is_milestone

    if payload.reminder_enabled is not None:
        task.reminder_enabled = payload.reminder_enabled
        if task.reminder_enabled and task.next_reminder_at is None and task.completed_at is None:
            task.next_reminder_at = datetime.now(timezone.utc) + timedelta(minutes=60)
        if not task.reminder_enabled:
            task.next_reminder_at = None

    if new_status_row is not None and task.assigned_to_user_id is not None:
        created_notifications.append(
            add_notification(
                db=db,
                user_id=task.assigned_to_user_id,
                type=NotificationType.status_change,
                title="Task status changed",
                body=task.title,
                data={"task_id": str(task.id), "status_id": str(task.status_id)},
            )
        )

    mentions = _extract_mentions(payload.title) | _extract_mentions(payload.description)
    if mentions:
        mentioned_users = await _users_by_usernames(db, mentions)
        for mu in mentioned_users:
            if mu.id == user.id:
                continue
            created_notifications.append(
                add_notification(
                    db=db,
                    user_id=mu.id,
                    type=NotificationType.mention,
                    title="Mentioned in task",
                    body=task.title,
                    data={"task_id": str(task.id)},
                )
            )

    after = {
        "title": task.title,
        "description": task.description,
        "status_id": str(task.status_id),
        "position": task.position,
        "assigned_to_user_id": str(task.assigned_to_user_id) if task.assigned_to_user_id else None,
        "planned_for": task.planned_for.isoformat() if task.planned_for else None,
        "reminder_enabled": task.reminder_enabled,
    }

    add_audit_log(
        db=db,
        actor_user_id=user.id,
        entity_type="task",
        entity_id=task.id,
        action="updated",
        before=before,
        after=after,
    )

    await db.commit()

    for n in created_notifications:
        try:
            await publish_notification(user_id=n.user_id, notification=n)
        except Exception:
            pass

    await db.refresh(task)
    return _task_to_out(task)


@router.patch("/{task_id}/move", response_model=TaskOut)
async def move_task(
    task_id: uuid.UUID,
    payload: TaskMove,
    db: AsyncSession = Depends(get_db),
    user=Depends(get_current_user),
) -> TaskOut:
    return await update_task(task_id, TaskUpdate(status_id=payload.status_id, position=payload.position), db, user)
