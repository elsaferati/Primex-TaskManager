from __future__ import annotations

import uuid

from fastapi import APIRouter, Depends, HTTPException, status
from sqlalchemy import select
from sqlalchemy.ext.asyncio import AsyncSession
from sqlalchemy.sql import nulls_last

from app.api.access import ensure_department_access
from app.api.deps import get_current_user
from app.db import get_db
from app.models.project import Project
from app.models.project_phase_checklist_item import ProjectPhaseChecklistItem
from app.schemas.project_phase_checklist_item import (
    ProjectPhaseChecklistItemCreate,
    ProjectPhaseChecklistItemOut,
    ProjectPhaseChecklistItemUpdate,
)


router = APIRouter()

PHASE_KEY_DEVELOPMENT = "development"


def _ensure_project_access(project: Project, user) -> None:
    if project.department_id is not None:
        ensure_department_access(user, project.department_id)


def _to_out(item: ProjectPhaseChecklistItem) -> ProjectPhaseChecklistItemOut:
    return ProjectPhaseChecklistItemOut(
        id=item.id,
        project_id=item.project_id,
        phase_key=item.phase_key,
        title=item.title,
        comment=item.comment,
        is_checked=item.is_checked,
        sort_order=item.sort_order,
        created_by=item.created_by,
        created_at=item.created_at,
        updated_at=item.updated_at,
    )


@router.get(
    "/projects/{project_id}/phases/development/checklist",
    response_model=list[ProjectPhaseChecklistItemOut],
)
async def list_development_phase_checklist_items(
    project_id: uuid.UUID,
    db: AsyncSession = Depends(get_db),
    user=Depends(get_current_user),
) -> list[ProjectPhaseChecklistItemOut]:
    project = (await db.execute(select(Project).where(Project.id == project_id))).scalar_one_or_none()
    if project is None:
        raise HTTPException(status_code=status.HTTP_404_NOT_FOUND, detail="Project not found")
    _ensure_project_access(project, user)

    stmt = (
        select(ProjectPhaseChecklistItem)
        .where(
            ProjectPhaseChecklistItem.project_id == project_id,
            ProjectPhaseChecklistItem.phase_key == PHASE_KEY_DEVELOPMENT,
        )
        .order_by(
            nulls_last(ProjectPhaseChecklistItem.sort_order),
            ProjectPhaseChecklistItem.created_at,
        )
    )
    items = (await db.execute(stmt)).scalars().all()
    return [_to_out(item) for item in items]


@router.post(
    "/projects/{project_id}/phases/development/checklist",
    response_model=ProjectPhaseChecklistItemOut,
    status_code=status.HTTP_201_CREATED,
)
async def create_development_phase_checklist_item(
    project_id: uuid.UUID,
    payload: ProjectPhaseChecklistItemCreate,
    db: AsyncSession = Depends(get_db),
    user=Depends(get_current_user),
) -> ProjectPhaseChecklistItemOut:
    title = payload.title.strip() if payload.title else ""
    if not title:
        raise HTTPException(status_code=status.HTTP_400_BAD_REQUEST, detail="Title is required")

    project = (await db.execute(select(Project).where(Project.id == project_id))).scalar_one_or_none()
    if project is None:
        raise HTTPException(status_code=status.HTTP_404_NOT_FOUND, detail="Project not found")
    _ensure_project_access(project, user)

    item = ProjectPhaseChecklistItem(
        project_id=project_id,
        phase_key=PHASE_KEY_DEVELOPMENT,
        title=title,
        comment=payload.comment.strip() if payload.comment else None,
        is_checked=False,
        created_by=getattr(user, "id", None),
    )
    db.add(item)
    await db.commit()
    await db.refresh(item)
    return _to_out(item)


@router.patch(
    "/phase-checklist-items/{item_id}",
    response_model=ProjectPhaseChecklistItemOut,
)
async def update_phase_checklist_item(
    item_id: uuid.UUID,
    payload: ProjectPhaseChecklistItemUpdate,
    db: AsyncSession = Depends(get_db),
    user=Depends(get_current_user),
) -> ProjectPhaseChecklistItemOut:
    item = (await db.execute(select(ProjectPhaseChecklistItem).where(ProjectPhaseChecklistItem.id == item_id))).scalar_one_or_none()
    if item is None:
        raise HTTPException(status_code=status.HTTP_404_NOT_FOUND, detail="Checklist item not found")

    project = (await db.execute(select(Project).where(Project.id == item.project_id))).scalar_one_or_none()
    if project is None:
        raise HTTPException(status_code=status.HTTP_404_NOT_FOUND, detail="Project not found")
    _ensure_project_access(project, user)

    if payload.title is not None:
        title = payload.title.strip()
        if not title:
            raise HTTPException(status_code=status.HTTP_400_BAD_REQUEST, detail="Title is required")
        item.title = title
    if payload.comment is not None:
        item.comment = payload.comment.strip() if payload.comment else None
    if payload.is_checked is not None:
        item.is_checked = payload.is_checked
    if payload.sort_order is not None:
        item.sort_order = payload.sort_order

    await db.commit()
    await db.refresh(item)
    return _to_out(item)


@router.delete(
    "/phase-checklist-items/{item_id}",
    status_code=status.HTTP_200_OK,
)
async def delete_phase_checklist_item(
    item_id: uuid.UUID,
    db: AsyncSession = Depends(get_db),
    user=Depends(get_current_user),
) -> dict:
    item = (await db.execute(select(ProjectPhaseChecklistItem).where(ProjectPhaseChecklistItem.id == item_id))).scalar_one_or_none()
    if item is None:
        raise HTTPException(status_code=status.HTTP_404_NOT_FOUND, detail="Checklist item not found")

    project = (await db.execute(select(Project).where(Project.id == item.project_id))).scalar_one_or_none()
    if project is None:
        raise HTTPException(status_code=status.HTTP_404_NOT_FOUND, detail="Project not found")
    _ensure_project_access(project, user)

    await db.delete(item)
    await db.commit()
    return {"ok": True}
