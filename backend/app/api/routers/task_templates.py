from __future__ import annotations

import uuid

from fastapi import APIRouter, Depends, HTTPException, status
from sqlalchemy import select
from sqlalchemy.ext.asyncio import AsyncSession

from app.api.access import ensure_department_access, ensure_manager_or_admin
from app.api.deps import get_current_user
from app.db import get_db
from app.models.board import Board
from app.models.project import Project
from app.models.task_status import TaskStatus
from app.models.task_template import TaskTemplate
from app.models.user import User
from app.schemas.task_template import TaskTemplateCreate, TaskTemplateOut, TaskTemplateUpdate
from app.services.audit import add_audit_log


router = APIRouter()


def _to_out(t: TaskTemplate) -> TaskTemplateOut:
    return TaskTemplateOut(
        id=t.id,
        department_id=t.department_id,
        board_id=t.board_id,
        project_id=t.project_id,
        title=t.title,
        description=t.description,
        recurrence=t.recurrence,
        default_status_id=t.default_status_id,
        assigned_to_user_id=t.assigned_to_user_id,
        created_by_user_id=t.created_by_user_id,
        is_active=t.is_active,
        created_at=t.created_at,
        updated_at=t.updated_at,
    )


@router.get("", response_model=list[TaskTemplateOut])
async def list_templates(db: AsyncSession = Depends(get_db), user=Depends(get_current_user)) -> list[TaskTemplateOut]:
    ensure_manager_or_admin(user)
    stmt = select(TaskTemplate)
    if user.role.value != "admin":
        if user.department_id is None:
            return []
        stmt = stmt.where(TaskTemplate.department_id == user.department_id)
    templates = (await db.execute(stmt.order_by(TaskTemplate.created_at))).scalars().all()
    return [_to_out(t) for t in templates]


@router.post("", response_model=TaskTemplateOut)
async def create_template(
    payload: TaskTemplateCreate,
    db: AsyncSession = Depends(get_db),
    user=Depends(get_current_user),
) -> TaskTemplateOut:
    ensure_manager_or_admin(user)
    board = (await db.execute(select(Board).where(Board.id == payload.board_id))).scalar_one_or_none()
    if board is None:
        raise HTTPException(status_code=status.HTTP_404_NOT_FOUND, detail="Board not found")
    ensure_department_access(user, board.department_id)

    if payload.project_id is not None:
        project = (
            await db.execute(select(Project).where(Project.id == payload.project_id, Project.board_id == board.id))
        ).scalar_one_or_none()
        if project is None:
            raise HTTPException(status_code=status.HTTP_400_BAD_REQUEST, detail="Invalid project")

    status_row = (
        await db.execute(
            select(TaskStatus).where(TaskStatus.id == payload.default_status_id, TaskStatus.department_id == board.department_id)
        )
    ).scalar_one_or_none()
    if status_row is None:
        raise HTTPException(status_code=status.HTTP_400_BAD_REQUEST, detail="Invalid default status")

    if payload.assigned_to_user_id is not None:
        assigned_user = (
            await db.execute(select(User).where(User.id == payload.assigned_to_user_id))
        ).scalar_one_or_none()
        if assigned_user is None:
            raise HTTPException(status_code=status.HTTP_400_BAD_REQUEST, detail="Assigned user not found")
        if assigned_user.department_id != board.department_id:
            raise HTTPException(status_code=status.HTTP_400_BAD_REQUEST, detail="Assigned user must be in department")

    tmpl = TaskTemplate(
        department_id=board.department_id,
        board_id=board.id,
        project_id=payload.project_id,
        title=payload.title,
        description=payload.description,
        recurrence=payload.recurrence,
        default_status_id=payload.default_status_id,
        assigned_to_user_id=payload.assigned_to_user_id,
        created_by_user_id=user.id,
        is_active=payload.is_active,
    )
    db.add(tmpl)
    await db.flush()
    add_audit_log(
        db=db,
        actor_user_id=user.id,
        entity_type="task_template",
        entity_id=tmpl.id,
        action="created",
        after={"title": tmpl.title, "recurrence": tmpl.recurrence.value},
    )
    await db.commit()
    await db.refresh(tmpl)
    return _to_out(tmpl)


@router.patch("/{template_id}", response_model=TaskTemplateOut)
async def update_template(
    template_id: uuid.UUID,
    payload: TaskTemplateUpdate,
    db: AsyncSession = Depends(get_db),
    user=Depends(get_current_user),
) -> TaskTemplateOut:
    ensure_manager_or_admin(user)
    tmpl = (await db.execute(select(TaskTemplate).where(TaskTemplate.id == template_id))).scalar_one_or_none()
    if tmpl is None:
        raise HTTPException(status_code=status.HTTP_404_NOT_FOUND, detail="Template not found")
    ensure_department_access(user, tmpl.department_id)

    before = {"title": tmpl.title, "recurrence": tmpl.recurrence.value, "is_active": tmpl.is_active}

    if payload.title is not None:
        tmpl.title = payload.title
    if payload.description is not None:
        tmpl.description = payload.description
    if payload.recurrence is not None:
        tmpl.recurrence = payload.recurrence
    if payload.default_status_id is not None:
        status_row = (
            await db.execute(
                select(TaskStatus).where(
                    TaskStatus.id == payload.default_status_id, TaskStatus.department_id == tmpl.department_id
                )
            )
        ).scalar_one_or_none()
        if status_row is None:
            raise HTTPException(status_code=status.HTTP_400_BAD_REQUEST, detail="Invalid default status")
        tmpl.default_status_id = payload.default_status_id
    if payload.assigned_to_user_id is not None:
        assigned_user = (
            await db.execute(select(User).where(User.id == payload.assigned_to_user_id))
        ).scalar_one_or_none()
        if assigned_user is None:
            raise HTTPException(status_code=status.HTTP_400_BAD_REQUEST, detail="Assigned user not found")
        if assigned_user.department_id != tmpl.department_id:
            raise HTTPException(status_code=status.HTTP_400_BAD_REQUEST, detail="Assigned user must be in department")
        tmpl.assigned_to_user_id = payload.assigned_to_user_id
    if payload.is_active is not None:
        tmpl.is_active = payload.is_active

    after = {"title": tmpl.title, "recurrence": tmpl.recurrence.value, "is_active": tmpl.is_active}
    add_audit_log(
        db=db,
        actor_user_id=user.id,
        entity_type="task_template",
        entity_id=tmpl.id,
        action="updated",
        before=before,
        after=after,
    )

    await db.commit()
    await db.refresh(tmpl)
    return _to_out(tmpl)
