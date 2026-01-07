from __future__ import annotations

import re
import uuid
from datetime import datetime, timezone

from fastapi import APIRouter, Depends, HTTPException, status
from sqlalchemy import delete, insert, select
from sqlalchemy.ext.asyncio import AsyncSession

from app.api.access import ensure_department_access, ensure_manager_or_admin
from app.api.deps import get_current_user
from app.db import get_db
from app.models.enums import NotificationType, ProjectPhaseStatus, TaskPriority, TaskStatus, UserRole
from app.models.ga_note import GaNote
from app.models.notification import Notification
from app.models.project import Project
from app.models.task import Task
from app.models.task_assignee import TaskAssignee
from app.models.user import User
from app.schemas.task import TaskAssigneeOut, TaskCreate, TaskOut, TaskUpdate
from app.services.audit import add_audit_log
from app.services.notifications import add_notification, publish_notification


router = APIRouter()

MENTION_RE = re.compile(r"@([A-Za-z0-9_\\-\\.]{3,64})")


def _user_to_assignee(user: User) -> TaskAssigneeOut:
    return TaskAssigneeOut(
        id=user.id,
        email=user.email,
        username=user.username,
        full_name=user.full_name,
    )


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


async def _replace_task_assignees(
    db: AsyncSession, task: Task, assignee_ids: list[uuid.UUID]
) -> None:
    await db.execute(delete(TaskAssignee).where(TaskAssignee.task_id == task.id))
    if assignee_ids:
        values = [{"task_id": task.id, "user_id": user_id} for user_id in assignee_ids]
        await db.execute(insert(TaskAssignee), values)


def _task_to_out(task: Task, assignees: list[TaskAssigneeOut]) -> TaskOut:
    return TaskOut(
        id=task.id,
        title=task.title,
        description=task.description,
        internal_notes=task.internal_notes,
        project_id=task.project_id,
        dependency_task_id=task.dependency_task_id,
        department_id=task.department_id,
        assigned_to=task.assigned_to,
        assignees=assignees,
        created_by=task.created_by,
        ga_note_origin_id=task.ga_note_origin_id,
        system_template_origin_id=task.system_template_origin_id,
        status=task.status,
        priority=task.priority,
        finish_period=task.finish_period,
        phase=task.phase,
        progress_percentage=task.progress_percentage,
        start_date=task.start_date,
        due_date=task.due_date,
        completed_at=task.completed_at,
        is_bllok=task.is_bllok,
        is_1h_report=task.is_1h_report,
        is_r1=task.is_r1,
        is_active=task.is_active,
        created_at=task.created_at,
        updated_at=task.updated_at,
    )


async def _project_for_id(db: AsyncSession, project_id: uuid.UUID) -> Project:
    project = (await db.execute(select(Project).where(Project.id == project_id))).scalar_one_or_none()
    if project is None:
        raise HTTPException(status_code=status.HTTP_404_NOT_FOUND, detail="Project not found")
    return project


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
    project_id: uuid.UUID | None = None,
    status: TaskStatus | None = None,
    assigned_to: uuid.UUID | None = None,
    created_by: uuid.UUID | None = None,
    due_from: datetime | None = None,
    due_to: datetime | None = None,
    include_done: bool = True,
    db: AsyncSession = Depends(get_db),
    user=Depends(get_current_user),
) -> list[TaskOut]:
    stmt = select(Task)

    if user.role == UserRole.ADMIN:
        pass  # Admin can see all tasks
    elif user.role == UserRole.MANAGER:
        # Manager can see their department's tasks OR tasks without a department (GA tasks)
        if user.department_id is not None:
            stmt = stmt.where((Task.department_id == user.department_id) | (Task.department_id.is_(None)))
        # If manager has no department, they can see tasks without a department
    else:
        # STAFF can only see their department's tasks
        if user.department_id is None:
            return []
        stmt = stmt.where(Task.department_id == user.department_id)

    if department_id:
        ensure_department_access(user, department_id)
        stmt = stmt.where(Task.department_id == department_id)
    if project_id:
        stmt = stmt.where(Task.project_id == project_id)
    if status:
        stmt = stmt.where(Task.status == status)
    if assigned_to:
        stmt = stmt.where(Task.assigned_to == assigned_to)
    if created_by:
        stmt = stmt.where(Task.created_by == created_by)
    if due_from:
        stmt = stmt.where(Task.due_date >= due_from)
    if due_to:
        stmt = stmt.where(Task.due_date <= due_to)
    if not include_done:
        stmt = stmt.where(Task.status.notin_([TaskStatus.DONE, TaskStatus.CANCELLED]))

    tasks = (await db.execute(stmt.order_by(Task.created_at))).scalars().all()
    task_ids = [t.id for t in tasks]
    assignee_map = await _assignees_for_tasks(db, task_ids)
    fallback_ids = [
        t.assigned_to
        for t in tasks
        if t.assigned_to is not None and not assignee_map.get(t.id)
    ]
    if fallback_ids:
        fallback_users = (
            await db.execute(select(User).where(User.id.in_(fallback_ids)))
        ).scalars().all()
        fallback_map = {user.id: user for user in fallback_users}
        for t in tasks:
            if assignee_map.get(t.id):
                continue
            if t.assigned_to in fallback_map:
                assignee_map[t.id] = [_user_to_assignee(fallback_map[t.assigned_to])]

    return [_task_to_out(t, assignee_map.get(t.id, [])) for t in tasks]


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
    assignee_map = await _assignees_for_tasks(db, [task.id])
    if not assignee_map.get(task.id) and task.assigned_to is not None:
        assigned_user = (await db.execute(select(User).where(User.id == task.assigned_to))).scalar_one_or_none()
        if assigned_user is not None:
            assignee_map[task.id] = [_user_to_assignee(assigned_user)]
    return _task_to_out(task, assignee_map.get(task.id, []))


@router.post("", response_model=TaskOut)
async def create_task(
    payload: TaskCreate,
    db: AsyncSession = Depends(get_db),
    user=Depends(get_current_user),
) -> TaskOut:
    ensure_manager_or_admin(user)
    department_id = payload.department_id
    project = None
    if payload.project_id is not None:
        project = await _project_for_id(db, payload.project_id)
        if project.department_id is not None and project.department_id != department_id:
            raise HTTPException(status_code=status.HTTP_400_BAD_REQUEST, detail="Project department mismatch")

    if department_id is not None:
        ensure_department_access(user, department_id)

    dependency_task_id = payload.dependency_task_id
    if dependency_task_id is not None:
        if payload.project_id is None:
            raise HTTPException(status_code=status.HTTP_400_BAD_REQUEST, detail="Dependency requires a project")
        dependency_task = (
            await db.execute(select(Task).where(Task.id == dependency_task_id))
        ).scalar_one_or_none()
        if dependency_task is None:
            raise HTTPException(status_code=status.HTTP_400_BAD_REQUEST, detail="Dependency task not found")
        if dependency_task.project_id != payload.project_id:
            raise HTTPException(status_code=status.HTTP_400_BAD_REQUEST, detail="Dependency must be in the same project")

    if payload.ga_note_origin_id is not None:
        ga_note = (
            await db.execute(select(GaNote).where(GaNote.id == payload.ga_note_origin_id))
        ).scalar_one_or_none()
        if ga_note is None:
            raise HTTPException(status_code=status.HTTP_400_BAD_REQUEST, detail="GA note not found")
        if ga_note.department_id is not None and ga_note.department_id != department_id:
            raise HTTPException(status_code=status.HTTP_400_BAD_REQUEST, detail="GA note department mismatch")
        if ga_note.project_id is not None and ga_note.project_id != payload.project_id:
            raise HTTPException(status_code=status.HTTP_400_BAD_REQUEST, detail="GA note project mismatch")

    assignee_ids: list[uuid.UUID] | None = None
    assignee_users: list[User] = []
    if payload.assignees is not None:
        seen: set[uuid.UUID] = set()
        assignee_ids = [uid for uid in payload.assignees if not (uid in seen or seen.add(uid))]
    elif payload.assigned_to is not None:
        assignee_ids = [payload.assigned_to]

    if assignee_ids is not None:
        assignee_users = (
            await db.execute(select(User).where(User.id.in_(assignee_ids)))
        ).scalars().all()
        if len(assignee_users) != len(assignee_ids):
            raise HTTPException(status_code=status.HTTP_400_BAD_REQUEST, detail="Assigned user not found")
        for assignee in assignee_users:
            if assignee.department_id != department_id:
                raise HTTPException(status_code=status.HTTP_400_BAD_REQUEST, detail="Assigned user must be in department")

    status_value = payload.status or TaskStatus.TODO
    priority_value = payload.priority or TaskPriority.NORMAL
    phase_value = payload.phase or (project.current_phase if project else ProjectPhaseStatus.TAKIMET)
    completed_at = payload.completed_at
    if completed_at is None and status_value in (TaskStatus.DONE, TaskStatus.CANCELLED):
        completed_at = datetime.now(timezone.utc)

    task = Task(
        title=payload.title,
        description=payload.description,
        internal_notes=payload.internal_notes,
        project_id=payload.project_id,
        dependency_task_id=dependency_task_id,
        department_id=department_id,
        assigned_to=assignee_ids[0] if assignee_ids else None,
        created_by=user.id,
        ga_note_origin_id=payload.ga_note_origin_id,
        status=status_value,
        priority=priority_value,
        finish_period=payload.finish_period,
        phase=phase_value,
        progress_percentage=payload.progress_percentage or 0,
        start_date=payload.start_date or datetime.now(timezone.utc),
        due_date=payload.due_date,
        completed_at=completed_at,
        is_bllok=payload.is_bllok or False,
        is_1h_report=payload.is_1h_report or False,
        is_r1=payload.is_r1 or False,
    )
    db.add(task)
    await db.flush()
    if assignee_ids is not None:
        await _replace_task_assignees(db, task, assignee_ids)
        if assignee_ids == [] and task.system_template_origin_id and task.department_id is not None:
            task.is_active = False

    add_audit_log(
        db=db,
        actor_user_id=user.id,
        entity_type="task",
        entity_id=task.id,
        action="created",
        before=None,
        after={
            "title": task.title,
            "status": task.status.value,
            "assigned_to": str(task.assigned_to) if task.assigned_to else None,
        },
    )

    created_notifications: list[Notification] = []
    existing_assignee_ids: set[uuid.UUID] = set()
    if payload.assignees is not None or payload.assigned_to is not None:
        rows = (
            await db.execute(
                select(TaskAssignee.user_id).where(TaskAssignee.task_id == task.id)
            )
        ).scalars().all()
        existing_assignee_ids = set(rows)
    for assignee in assignee_users:
        created_notifications.append(
            add_notification(
                db=db,
                user_id=assignee.id,
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
    assignee_map = await _assignees_for_tasks(db, [task.id])
    if not assignee_map.get(task.id) and task.assigned_to is not None:
        assigned_user = (await db.execute(select(User).where(User.id == task.assigned_to))).scalar_one_or_none()
        if assigned_user is not None:
            assignee_map[task.id] = [_user_to_assignee(assigned_user)]
    return _task_to_out(task, assignee_map.get(task.id, []))


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

    if user.role == UserRole.STAFF and task.assigned_to != user.id:
        raise HTTPException(status_code=status.HTTP_403_FORBIDDEN, detail="Forbidden")

    if user.role == UserRole.STAFF:
        forbidden_fields = {
            "title": payload.title,
            "project_id": payload.project_id,
            "department_id": payload.department_id,
            "dependency_task_id": payload.dependency_task_id,
            "assigned_to": payload.assigned_to,
            "assignees": payload.assignees,
            "priority": payload.priority,
            "phase": payload.phase,
            "is_bllok": payload.is_bllok,
            "is_1h_report": payload.is_1h_report,
            "is_r1": payload.is_r1,
        }
        if any(v is not None for v in forbidden_fields.values()):
            raise HTTPException(status_code=status.HTTP_403_FORBIDDEN, detail="Forbidden")

    before = {
        "title": task.title,
        "description": task.description,
        "internal_notes": task.internal_notes,
        "dependency_task_id": str(task.dependency_task_id) if task.dependency_task_id else None,
        "status": task.status.value,
        "priority": task.priority.value,
        "finish_period": task.finish_period.value if task.finish_period else None,
        "phase": task.phase.value if task.phase else None,
        "assigned_to": str(task.assigned_to) if task.assigned_to else None,
        "progress_percentage": task.progress_percentage,
        "due_date": task.due_date.isoformat() if task.due_date else None,
    }

    created_notifications: list[Notification] = []
    assignee_users: list[User] = []

    if payload.title is not None:
        task.title = payload.title
    if payload.description is not None:
        task.description = payload.description
    if payload.internal_notes is not None:
        task.internal_notes = payload.internal_notes
    dependency_set = False
    if hasattr(payload, "model_fields_set"):
        dependency_set = "dependency_task_id" in payload.model_fields_set  # type: ignore[attr-defined]
    elif hasattr(payload, "__fields_set__"):
        dependency_set = "dependency_task_id" in payload.__fields_set__  # type: ignore[attr-defined]

    if dependency_set:
        ensure_manager_or_admin(user)
        if payload.dependency_task_id is None:
            task.dependency_task_id = None
        else:
            dependency_task = (
                await db.execute(select(Task).where(Task.id == payload.dependency_task_id))
            ).scalar_one_or_none()
            if dependency_task is None:
                raise HTTPException(status_code=status.HTTP_400_BAD_REQUEST, detail="Dependency task not found")
            if task.project_id is None or dependency_task.project_id != task.project_id:
                raise HTTPException(status_code=status.HTTP_400_BAD_REQUEST, detail="Dependency must be in the same project")
            task.dependency_task_id = payload.dependency_task_id

    if payload.project_id is not None:
        ensure_manager_or_admin(user)
        project = await _project_for_id(db, payload.project_id)
        if task.department_id != project.department_id:
            raise HTTPException(status_code=status.HTTP_400_BAD_REQUEST, detail="Project department mismatch")
        task.project_id = payload.project_id

    if payload.department_id is not None and payload.department_id != task.department_id:
        ensure_manager_or_admin(user)
        ensure_department_access(user, payload.department_id)
        task.department_id = payload.department_id

    if payload.assignees is not None:
        ensure_manager_or_admin(user)
        rows = (
            await db.execute(
                select(TaskAssignee.user_id).where(TaskAssignee.task_id == task.id)
            )
        ).scalars().all()
        existing_assignee_ids = set(rows)
        seen: set[uuid.UUID] = set()
        assignee_ids = [uid for uid in payload.assignees if not (uid in seen or seen.add(uid))]
        assignee_users = (
            await db.execute(select(User).where(User.id.in_(assignee_ids)))
        ).scalars().all()
        if len(assignee_users) != len(assignee_ids):
            raise HTTPException(status_code=status.HTTP_400_BAD_REQUEST, detail="Assigned user not found")
        for assignee in assignee_users:
            if assignee.department_id != task.department_id:
                raise HTTPException(status_code=status.HTTP_400_BAD_REQUEST, detail="Assigned user must be in department")
        await _replace_task_assignees(db, task, assignee_ids)
        task.assigned_to = assignee_ids[0] if assignee_ids else None
        if assignee_ids == [] and task.system_template_origin_id and task.department_id is not None:
            task.is_active = False
        new_ids = set(assignee_ids) - existing_assignee_ids
        for assignee in assignee_users:
            if assignee.id not in new_ids:
                continue
            created_notifications.append(
                add_notification(
                    db=db,
                    user_id=assignee.id,
                    type=NotificationType.assignment,
                    title="Task assigned",
                    body=task.title,
                    data={"task_id": str(task.id)},
                )
            )
    elif payload.assigned_to is not None and payload.assigned_to != task.assigned_to:
        ensure_manager_or_admin(user)
        assigned_user = (await db.execute(select(User).where(User.id == payload.assigned_to))).scalar_one_or_none()
        if assigned_user is None:
            raise HTTPException(status_code=status.HTTP_400_BAD_REQUEST, detail="Assigned user not found")
        if assigned_user.department_id != task.department_id:
            raise HTTPException(status_code=status.HTTP_400_BAD_REQUEST, detail="Assigned user must be in department")
        task.assigned_to = payload.assigned_to
        await _replace_task_assignees(db, task, [payload.assigned_to])
        assignee_users = [assigned_user]
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

    if payload.status is not None and payload.status != task.status:
        task.status = payload.status
        if task.status in (TaskStatus.DONE, TaskStatus.CANCELLED):
            task.completed_at = datetime.now(timezone.utc)
        else:
            task.completed_at = None

    if payload.priority is not None:
        task.priority = payload.priority
    if payload.finish_period is not None:
        task.finish_period = payload.finish_period
    if payload.phase is not None:
        ensure_manager_or_admin(user)
        task.phase = payload.phase
    if payload.progress_percentage is not None:
        task.progress_percentage = payload.progress_percentage
    if payload.start_date is not None:
        task.start_date = payload.start_date
    if payload.due_date is not None:
        task.due_date = payload.due_date
    if payload.completed_at is not None:
        task.completed_at = payload.completed_at
    if payload.is_bllok is not None:
        task.is_bllok = payload.is_bllok
    if payload.is_1h_report is not None:
        task.is_1h_report = payload.is_1h_report
    if payload.is_r1 is not None:
        task.is_r1 = payload.is_r1

    if payload.status is not None and task.assigned_to is not None:
        created_notifications.append(
            add_notification(
                db=db,
                user_id=task.assigned_to,
                type=NotificationType.status_change,
                title="Task status changed",
                body=task.title,
                data={"task_id": str(task.id), "status": task.status.value},
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
        "internal_notes": task.internal_notes,
        "dependency_task_id": str(task.dependency_task_id) if task.dependency_task_id else None,
        "status": task.status.value,
        "priority": task.priority.value,
        "finish_period": task.finish_period.value if task.finish_period else None,
        "phase": task.phase.value if task.phase else None,
        "assigned_to": str(task.assigned_to) if task.assigned_to else None,
        "progress_percentage": task.progress_percentage,
        "due_date": task.due_date.isoformat() if task.due_date else None,
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
    assignee_map = await _assignees_for_tasks(db, [task.id])
    if not assignee_map.get(task.id) and task.assigned_to is not None:
        assigned_user = (await db.execute(select(User).where(User.id == task.assigned_to))).scalar_one_or_none()
        if assigned_user is not None:
            assignee_map[task.id] = [_user_to_assignee(assigned_user)]
    return _task_to_out(task, assignee_map.get(task.id, []))


@router.post("/{task_id}/deactivate", response_model=TaskOut)
async def deactivate_task(
    task_id: uuid.UUID,
    db: AsyncSession = Depends(get_db),
    user=Depends(get_current_user),
) -> TaskOut:
    ensure_manager_or_admin(user)
    task = (await db.execute(select(Task).where(Task.id == task_id))).scalar_one_or_none()
    if task is None:
        raise HTTPException(status_code=status.HTTP_404_NOT_FOUND, detail="Task not found")
    ensure_department_access(user, task.department_id)
    task.is_active = False
    await db.commit()
    await db.refresh(task)
    assignee_map = await _assignees_for_tasks(db, [task.id])
    if not assignee_map.get(task.id) and task.assigned_to is not None:
        assigned_user = (await db.execute(select(User).where(User.id == task.assigned_to))).scalar_one_or_none()
        if assigned_user is not None:
            assignee_map[task.id] = [_user_to_assignee(assigned_user)]
    return _task_to_out(task, assignee_map.get(task.id, []))


