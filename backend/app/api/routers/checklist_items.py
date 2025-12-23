from __future__ import annotations

import uuid

from fastapi import APIRouter, Depends, HTTPException, status
from pydantic import BaseModel
from sqlalchemy import select
from sqlalchemy.ext.asyncio import AsyncSession

from app.api.access import ensure_department_access
from app.api.deps import get_current_user
from app.db import get_db
from app.models.checklist import Checklist
from app.models.checklist_item import ChecklistItem
from app.models.project import Project
from app.schemas.checklist_item import ChecklistItemOut


router = APIRouter()

class ChecklistItemCreatePayload(BaseModel):
    content: str
    project_id: uuid.UUID | None = None
    checklist_id: uuid.UUID | None = None
    position: int | None = None
    is_checked: bool | None = None


class ChecklistItemUpdatePayload(BaseModel):
    is_checked: bool | None = None


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
            .join(Checklist, ChecklistItem.checklist_id == Checklist.id)
            .where(Checklist.project_id == project_id)
            .order_by(ChecklistItem.position, ChecklistItem.id)
        )
    else:
        stmt = (
            select(ChecklistItem)
            .where(ChecklistItem.checklist_id == checklist_id)
            .order_by(ChecklistItem.position, ChecklistItem.id)
        )

    items = (await db.execute(stmt)).scalars().all()
    return [
        ChecklistItemOut(
            id=i.id,
            checklist_id=i.checklist_id,
            content=i.content,
            is_checked=i.is_checked,
            position=i.position,
        )
        for i in items
    ]


@router.post("", response_model=ChecklistItemOut, status_code=status.HTTP_201_CREATED)
async def create_checklist_item(
    payload: ChecklistItemCreatePayload,
    db: AsyncSession = Depends(get_db),
    user=Depends(get_current_user),
) -> ChecklistItemOut:
    if payload.project_id is None and payload.checklist_id is None:
        raise HTTPException(status_code=status.HTTP_400_BAD_REQUEST, detail="project_id or checklist_id required")

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

    position = payload.position
    if position is None:
        max_position = (
            await db.execute(
                select(ChecklistItem.position).where(ChecklistItem.checklist_id == checklist.id).order_by(ChecklistItem.position.desc())
            )
        ).scalars().first()
        position = (max_position + 1) if max_position is not None else 0

    item = ChecklistItem(
        checklist_id=checklist.id,
        content=payload.content,
        is_checked=payload.is_checked if payload.is_checked is not None else False,
        position=position,
    )
    db.add(item)
    await db.commit()
    await db.refresh(item)

    return ChecklistItemOut(
        id=item.id,
        checklist_id=item.checklist_id,
        content=item.content,
        is_checked=item.is_checked,
        position=item.position,
    )


@router.patch("/{item_id}", response_model=ChecklistItemOut)
async def update_checklist_item(
    item_id: uuid.UUID,
    payload: ChecklistItemUpdatePayload,
    db: AsyncSession = Depends(get_db),
    user=Depends(get_current_user),
) -> ChecklistItemOut:
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

    if payload.is_checked is not None:
        item.is_checked = payload.is_checked

    await db.commit()
    await db.refresh(item)
    return ChecklistItemOut(
        id=item.id,
        checklist_id=item.checklist_id,
        content=item.content,
        is_checked=item.is_checked,
        position=item.position,
    )
