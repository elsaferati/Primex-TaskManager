from __future__ import annotations

import uuid

from fastapi import APIRouter, Depends, HTTPException, status
from sqlalchemy import nulls_last, select
from sqlalchemy.ext.asyncio import AsyncSession
from sqlalchemy.orm import selectinload

from app.api.access import ensure_department_access
from app.api.deps import get_current_user
from app.db import get_db
from app.models.checklist import Checklist
from app.models.checklist_item import ChecklistItem, ChecklistItemAssignee
from app.models.enums import UserRole
from app.models.project import Project
from app.models.task import Task
from app.schemas.checklist import ChecklistCreate, ChecklistOut, ChecklistUpdate, ChecklistWithItemsOut
from app.schemas.checklist_item import ChecklistItemAssigneeOut, ChecklistItemOut


router = APIRouter()


def _item_to_out(item: ChecklistItem) -> ChecklistItemOut:
    assignees = [
        ChecklistItemAssigneeOut(
            user_id=assignee.user_id,
            user_full_name=assignee.user.full_name if assignee.user else None,
            user_username=assignee.user.username if assignee.user else None,
        )
        for assignee in item.assignees
    ]

    return ChecklistItemOut(
        id=item.id,
        checklist_id=item.checklist_id,
        item_type=item.item_type,
        position=item.position,
        path=item.path,
        keyword=item.keyword,
        description=item.description,
        category=item.category,
        day=item.day,
        owner=item.owner,
        time=item.time,
        title=item.title,
        comment=item.comment,
        is_checked=item.is_checked,
        assignees=assignees,
    )


@router.get("", response_model=list[ChecklistWithItemsOut])
async def list_checklists(
    task_id: uuid.UUID | None = None,
    project_id: uuid.UUID | None = None,
    group_key: str | None = None,
    meeting_only: bool = False,
    template_only: bool = False,
    include_items: bool = True,
    db: AsyncSession = Depends(get_db),
    user=Depends(get_current_user),
) -> list[ChecklistWithItemsOut]:
    stmt = select(Checklist)
    # If task_id is provided, it takes precedence over project_id.
    if task_id is not None:
        task = (await db.execute(select(Task).where(Task.id == task_id))).scalar_one_or_none()
        if task is None:
            raise HTTPException(status_code=status.HTTP_404_NOT_FOUND, detail="Task not found")
        if task.project_id is None:
            if user.role not in (UserRole.ADMIN, UserRole.MANAGER):
                raise HTTPException(status_code=status.HTTP_403_FORBIDDEN, detail="Forbidden")
        else:
            project = (await db.execute(select(Project).where(Project.id == task.project_id))).scalar_one_or_none()
            if project is None:
                raise HTTPException(status_code=status.HTTP_404_NOT_FOUND, detail="Project not found")
            if project.department_id is not None:
                ensure_department_access(user, project.department_id)
        stmt = stmt.where(Checklist.task_id == task_id)
    elif project_id is not None:
        project = (await db.execute(select(Project).where(Project.id == project_id))).scalar_one_or_none()
        if project is None:
            raise HTTPException(status_code=status.HTTP_404_NOT_FOUND, detail="Project not found")
        stmt = stmt.where(Checklist.project_id == project_id)
    if meeting_only:
        stmt = stmt.where(Checklist.group_key.isnot(None))
    if template_only:
        stmt = stmt.where(Checklist.project_id.is_(None))
    if group_key is not None:
        stmt = stmt.where(Checklist.group_key == group_key)
    if include_items:
        stmt = stmt.options(
            selectinload(Checklist.items)
            .selectinload(ChecklistItem.assignees)
            .selectinload(ChecklistItemAssignee.user)
        )
    stmt = stmt.order_by(nulls_last(Checklist.position), Checklist.created_at)

    checklists = (await db.execute(stmt)).scalars().all()
    results: list[ChecklistWithItemsOut] = []
    for checklist in checklists:
        items: list[ChecklistItemOut] = []
        if include_items:
            sorted_items = sorted(checklist.items, key=lambda item: (item.position, item.id))
            items = [_item_to_out(item) for item in sorted_items]
        results.append(
            ChecklistWithItemsOut(
                id=checklist.id,
                title=checklist.title,
                task_id=checklist.task_id,
                project_id=checklist.project_id,
                note=checklist.note,
                default_owner=checklist.default_owner,
                default_time=checklist.default_time,
                group_key=checklist.group_key,
                columns=checklist.columns,
                position=checklist.position,
                created_at=checklist.created_at,
                items=items,
            )
        )

    return results


@router.post("", response_model=ChecklistOut, status_code=201)
async def create_checklist(
    payload: ChecklistCreate,
    db: AsyncSession = Depends(get_db),
    user=Depends(get_current_user),
) -> ChecklistOut:
    if payload.group_key:
        existing = (
            await db.execute(select(Checklist).where(Checklist.group_key == payload.group_key))
        ).scalar_one_or_none()
        if existing is not None:
            return ChecklistOut(
                id=existing.id,
                title=existing.title,
                task_id=existing.task_id,
                project_id=existing.project_id,
                note=existing.note,
                default_owner=existing.default_owner,
                default_time=existing.default_time,
                group_key=existing.group_key,
                columns=existing.columns,
                position=existing.position,
                created_at=existing.created_at,
            )

    checklist = Checklist(
        title=payload.title,
        task_id=payload.task_id,
        project_id=payload.project_id,
        note=payload.note,
        default_owner=payload.default_owner,
        default_time=payload.default_time,
        group_key=payload.group_key,
        columns=payload.columns,
        position=payload.position,
    )
    db.add(checklist)
    await db.commit()
    await db.refresh(checklist)
    return ChecklistOut(
        id=checklist.id,
        title=checklist.title,
        task_id=checklist.task_id,
        project_id=checklist.project_id,
        note=checklist.note,
        default_owner=checklist.default_owner,
        default_time=checklist.default_time,
        group_key=checklist.group_key,
        columns=checklist.columns,
        position=checklist.position,
        created_at=checklist.created_at,
    )


@router.patch("/{checklist_id}", response_model=ChecklistOut)
async def update_checklist(
    checklist_id: uuid.UUID,
    payload: ChecklistUpdate,
    db: AsyncSession = Depends(get_db),
    user=Depends(get_current_user),
) -> ChecklistOut:
    checklist = (await db.execute(select(Checklist).where(Checklist.id == checklist_id))).scalar_one_or_none()
    if checklist is None:
        raise HTTPException(status_code=status.HTTP_404_NOT_FOUND, detail="Checklist not found")
    
    # Only admins can update meeting templates (checklists with group_key)
    if checklist.group_key and user.role != UserRole.ADMIN:
        raise HTTPException(status_code=status.HTTP_403_FORBIDDEN, detail="Only admins can update meeting templates")
    
    if payload.title is not None:
        checklist.title = payload.title
    if payload.note is not None:
        checklist.note = payload.note
    if payload.default_owner is not None:
        checklist.default_owner = payload.default_owner
    if payload.default_time is not None:
        checklist.default_time = payload.default_time
    if payload.columns is not None:
        checklist.columns = payload.columns
    if payload.position is not None:
        checklist.position = payload.position
    
    await db.commit()
    await db.refresh(checklist)
    return ChecklistOut(
        id=checklist.id,
        title=checklist.title,
        task_id=checklist.task_id,
        project_id=checklist.project_id,
        note=checklist.note,
        default_owner=checklist.default_owner,
        default_time=checklist.default_time,
        group_key=checklist.group_key,
        columns=checklist.columns,
        position=checklist.position,
        created_at=checklist.created_at,
    )
