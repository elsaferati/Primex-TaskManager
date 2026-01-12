from __future__ import annotations

import uuid

from fastapi import APIRouter, Depends, HTTPException, status
from pydantic import BaseModel
from sqlalchemy import select
from sqlalchemy.ext.asyncio import AsyncSession
from sqlalchemy.orm import selectinload

from app.api.access import ensure_department_access
from app.api.deps import get_current_user
from app.db import get_db
from app.models.checklist import Checklist
from app.models.checklist_item import ChecklistItem, ChecklistItemAssignee
from app.models.project import Project
from app.models.user import User
from app.models.enums import ChecklistItemType
from app.schemas.checklist_item import (
    ChecklistItemOut,
    ChecklistItemCreate,
    ChecklistItemUpdate,
    ChecklistItemAssigneeOut,
)


router = APIRouter()


def _item_to_out(item: ChecklistItem) -> ChecklistItemOut:
    """Convert ChecklistItem model to ChecklistItemOut schema."""
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
        title=item.title,
        comment=item.comment,
        is_checked=item.is_checked,
        assignees=assignees,
    )


@router.get("", response_model=list[ChecklistItemOut])
async def list_checklist_items(
    project_id: uuid.UUID | None = None,
    checklist_id: uuid.UUID | None = None,
    db: AsyncSession = Depends(get_db),
    user=Depends(get_current_user),
) -> list[ChecklistItemOut]:
    if project_id is None and checklist_id is None:
        raise HTTPException(status_code=status.HTTP_400_BAD_REQUEST, detail="project_id or checklist_id required")

    if project_id is not None:
        project = (await db.execute(select(Project).where(Project.id == project_id))).scalar_one_or_none()
        if project is None:
            raise HTTPException(status_code=status.HTTP_404_NOT_FOUND, detail="Project not found")
        if project.department_id is not None:
            ensure_department_access(user, project.department_id)
        stmt = (
            select(ChecklistItem)
            .options(selectinload(ChecklistItem.assignees).selectinload(ChecklistItemAssignee.user))
            .join(Checklist, ChecklistItem.checklist_id == Checklist.id)
            .where(Checklist.project_id == project_id)
            .order_by(ChecklistItem.position, ChecklistItem.id)
        )
    else:
        stmt = (
            select(ChecklistItem)
            .options(selectinload(ChecklistItem.assignees).selectinload(ChecklistItemAssignee.user))
            .where(ChecklistItem.checklist_id == checklist_id)
            .order_by(ChecklistItem.position, ChecklistItem.id)
        )

    items = (await db.execute(stmt)).scalars().all()
    return [_item_to_out(item) for item in items]


class ChecklistItemCreateWithProject(BaseModel):
    """Wrapper to support project_id in create payload."""
    project_id: uuid.UUID | None = None
    checklist_id: uuid.UUID | None = None
    item_type: ChecklistItemType
    position: int | None = None
    path: str | None = None
    keyword: str | None = None
    description: str | None = None
    category: str | None = None
    title: str | None = None
    comment: str | None = None
    is_checked: bool | None = None
    assignee_user_ids: list[uuid.UUID] = []


@router.post("", response_model=ChecklistItemOut, status_code=status.HTTP_201_CREATED)
async def create_checklist_item(
    payload: ChecklistItemCreateWithProject,
    db: AsyncSession = Depends(get_db),
    user=Depends(get_current_user),
) -> ChecklistItemOut:
    if payload.project_id is None and payload.checklist_id is None:
        raise HTTPException(status_code=status.HTTP_400_BAD_REQUEST, detail="project_id or checklist_id required")

    # Validate using the schema validator
    create_payload = ChecklistItemCreate(
        checklist_id=payload.checklist_id,
        item_type=payload.item_type,
        position=payload.position,
        path=payload.path,
        keyword=payload.keyword,
        description=payload.description,
        category=payload.category,
        title=payload.title,
        comment=payload.comment,
        is_checked=payload.is_checked,
        assignee_user_ids=payload.assignee_user_ids,
    )

    checklist: Checklist | None = None
    if payload.project_id is not None:
        project = (await db.execute(select(Project).where(Project.id == payload.project_id))).scalar_one_or_none()
        if project is None:
            raise HTTPException(status_code=status.HTTP_404_NOT_FOUND, detail="Project not found")
        if project.department_id is not None:
            ensure_department_access(user, project.department_id)

        checklist = (
            await db.execute(select(Checklist).where(Checklist.project_id == payload.project_id))
        ).scalar_one_or_none()
        if checklist is None:
            checklist = Checklist(project_id=payload.project_id, title="Checklist")
            db.add(checklist)
            await db.flush()

    if checklist is None and payload.checklist_id is not None:
        checklist = (
            await db.execute(select(Checklist).where(Checklist.id == payload.checklist_id))
        ).scalar_one_or_none()
        if checklist is None:
            raise HTTPException(status_code=status.HTTP_404_NOT_FOUND, detail="Checklist not found")
        if checklist.project_id is not None:
            project = (
                await db.execute(select(Project).where(Project.id == checklist.project_id))
            ).scalar_one_or_none()
            if project and project.department_id is not None:
                ensure_department_access(user, project.department_id)

    if checklist is None:
        raise HTTPException(status_code=status.HTTP_400_BAD_REQUEST, detail="Checklist resolution failed")

    position = create_payload.position
    if position is None:
        max_position = (
            await db.execute(
                select(ChecklistItem.position)
                .where(ChecklistItem.checklist_id == checklist.id)
                .order_by(ChecklistItem.position.desc())
            )
        ).scalars().first()
        position = (max_position + 1) if max_position is not None else 0

    item = ChecklistItem(
        checklist_id=checklist.id,
        item_type=create_payload.item_type,
        position=position,
        path=create_payload.path,
        keyword=create_payload.keyword,
        description=create_payload.description,
        category=create_payload.category,
        title=create_payload.title,
        comment=create_payload.comment,
        is_checked=create_payload.is_checked,
    )
    db.add(item)
    await db.flush()

    # Add assignees
    if create_payload.assignee_user_ids:
        users = (
            await db.execute(select(User).where(User.id.in_(create_payload.assignee_user_ids)))
        ).scalars().all()
        user_ids = {u.id for u in users}
        for user_id in create_payload.assignee_user_ids:
            if user_id in user_ids:
                assignee = ChecklistItemAssignee(checklist_item_id=item.id, user_id=user_id)
                db.add(assignee)

    await db.commit()
    await db.refresh(item, ["assignees", "assignees.user"])

    return _item_to_out(item)


@router.patch("/{item_id}", response_model=ChecklistItemOut)
async def update_checklist_item(
    item_id: uuid.UUID,
    payload: ChecklistItemUpdate,
    db: AsyncSession = Depends(get_db),
    user=Depends(get_current_user),
) -> ChecklistItemOut:
    item = (
        await db.execute(
            select(ChecklistItem)
            .options(selectinload(ChecklistItem.assignees).selectinload(ChecklistItemAssignee.user))
            .where(ChecklistItem.id == item_id)
        )
    ).scalar_one_or_none()
    if item is None:
        raise HTTPException(status_code=status.HTTP_404_NOT_FOUND, detail="Checklist item not found")

    if item.checklist_id is not None:
        checklist = (
            await db.execute(select(Checklist).where(Checklist.id == item.checklist_id))
        ).scalar_one_or_none()
        if checklist and checklist.project_id is not None:
            project = (
                await db.execute(select(Project).where(Project.id == checklist.project_id))
            ).scalar_one_or_none()
            if project and project.department_id is not None:
                ensure_department_access(user, project.department_id)

    # Update fields
    if payload.item_type is not None:
        item.item_type = payload.item_type
    if payload.position is not None:
        item.position = payload.position
    if payload.path is not None:
        item.path = payload.path
    if payload.keyword is not None:
        item.keyword = payload.keyword
    if payload.description is not None:
        item.description = payload.description
    if payload.category is not None:
        item.category = payload.category
    if payload.title is not None:
        item.title = payload.title
    if payload.comment is not None:
        item.comment = payload.comment
    if payload.is_checked is not None:
        item.is_checked = payload.is_checked

    # Update assignees if provided
    if payload.assignee_user_ids is not None:
        # Remove existing assignees
        for assignee in item.assignees:
            await db.delete(assignee)
        await db.flush()

        # Add new assignees
        if payload.assignee_user_ids:
            users = (
                await db.execute(select(User).where(User.id.in_(payload.assignee_user_ids)))
            ).scalars().all()
            user_ids = {u.id for u in users}
            for user_id in payload.assignee_user_ids:
                if user_id in user_ids:
                    assignee = ChecklistItemAssignee(checklist_item_id=item.id, user_id=user_id)
                    db.add(assignee)

    await db.commit()
    await db.refresh(item, ["assignees", "assignees.user"])

    return _item_to_out(item)


@router.delete("/{item_id}", status_code=status.HTTP_200_OK)
async def delete_checklist_item(
    item_id: uuid.UUID,
    db: AsyncSession = Depends(get_db),
    user=Depends(get_current_user),
) -> dict:
    item = (await db.execute(select(ChecklistItem).where(ChecklistItem.id == item_id))).scalar_one_or_none()
    if item is None:
        raise HTTPException(status_code=status.HTTP_404_NOT_FOUND, detail="Checklist item not found")

    if item.checklist_id is not None:
        checklist = (
            await db.execute(select(Checklist).where(Checklist.id == item.checklist_id))
        ).scalar_one_or_none()
        if checklist and checklist.project_id is not None:
            project = (
                await db.execute(select(Project).where(Project.id == checklist.project_id))
            ).scalar_one_or_none()
            if project and project.department_id is not None:
                ensure_department_access(user, project.department_id)

    await db.delete(item)
    await db.commit()
    return {"ok": True}
