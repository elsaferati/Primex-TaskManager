from __future__ import annotations

import uuid
from datetime import datetime

from fastapi import APIRouter, Depends, HTTPException, status
from sqlalchemy import select
from sqlalchemy.ext.asyncio import AsyncSession

from app.api.access import ensure_department_access
from app.api.deps import get_current_user
from app.db import get_db
from app.models.ga_note import GaNote
from app.models.enums import GaNotePriority, GaNoteStatus, GaNoteType, UserRole
from app.models.project import Project
from app.schemas.ga_note import GaNoteCreate, GaNoteOut, GaNoteUpdate


router = APIRouter()


@router.get("", response_model=list[GaNoteOut])
async def list_ga_notes(
    project_id: uuid.UUID | None = None,
    department_id: uuid.UUID | None = None,
    db: AsyncSession = Depends(get_db),
    user=Depends(get_current_user),
) -> list[GaNoteOut]:
    stmt = select(GaNote).order_by(GaNote.created_at)
    if project_id is None and department_id is None:
        if user.role not in (UserRole.ADMIN, UserRole.MANAGER):
            raise HTTPException(status_code=status.HTTP_400_BAD_REQUEST, detail="project_id or department_id required")
    elif project_id is not None:
        project = (await db.execute(select(Project).where(Project.id == project_id))).scalar_one_or_none()
        if project is None:
            raise HTTPException(status_code=status.HTTP_404_NOT_FOUND, detail="Project not found")
        if project.department_id is not None:
            ensure_department_access(user, project.department_id)
        stmt = stmt.where(GaNote.project_id == project_id)
    elif department_id is not None:
        ensure_department_access(user, department_id)
        stmt = stmt.where(GaNote.department_id == department_id)

    notes = (await db.execute(stmt)).scalars().all()
    return [
        GaNoteOut(
            id=n.id,
            content=n.content,
            created_by=n.created_by,
            note_type=n.note_type,
            status=n.status,
            priority=n.priority,
            start_date=n.start_date,
            due_date=n.due_date,
            completed_at=n.completed_at,
            is_converted_to_task=n.is_converted_to_task,
            project_id=n.project_id,
            department_id=n.department_id,
            created_at=n.created_at,
            updated_at=n.updated_at,
        )
        for n in notes
    ]


@router.post("", response_model=GaNoteOut, status_code=status.HTTP_201_CREATED)
async def create_ga_note(
    payload: GaNoteCreate,
    db: AsyncSession = Depends(get_db),
    user=Depends(get_current_user),
) -> GaNoteOut:
    if payload.project_id is None and payload.department_id is None:
        if user.role not in (UserRole.ADMIN, UserRole.MANAGER):
            raise HTTPException(status_code=status.HTTP_400_BAD_REQUEST, detail="project_id or department_id required")

    project = None
    department_id = payload.department_id
    if payload.project_id is not None:
        project = (await db.execute(select(Project).where(Project.id == payload.project_id))).scalar_one_or_none()
        if project is None:
            raise HTTPException(status_code=status.HTTP_404_NOT_FOUND, detail="Project not found")
        if project.department_id is not None:
            ensure_department_access(user, project.department_id)
        if department_id is not None and project.department_id != department_id:
            raise HTTPException(status_code=status.HTTP_400_BAD_REQUEST, detail="Project department mismatch")
        department_id = project.department_id
    elif department_id is not None:
        ensure_department_access(user, department_id)

    if payload.priority == GaNotePriority.URGENT:
        raise HTTPException(status_code=status.HTTP_400_BAD_REQUEST, detail="Urgent priority is not allowed")

    note = GaNote(
        content=payload.content,
        created_by=payload.created_by or user.id,
        note_type=payload.note_type or GaNoteType.GA,
        status=payload.status or GaNoteStatus.OPEN,
        priority=payload.priority,
        start_date=payload.start_date,
        due_date=payload.due_date,
        completed_at=payload.completed_at,
        is_converted_to_task=payload.is_converted_to_task or False,
        project_id=payload.project_id,
        department_id=department_id,
    )
    db.add(note)
    await db.commit()
    await db.refresh(note)
    return GaNoteOut(
        id=note.id,
        content=note.content,
        created_by=note.created_by,
        note_type=note.note_type,
        status=note.status,
        priority=note.priority,
        start_date=note.start_date,
        due_date=note.due_date,
        completed_at=note.completed_at,
        is_converted_to_task=note.is_converted_to_task,
        project_id=note.project_id,
        department_id=note.department_id,
        created_at=note.created_at,
        updated_at=note.updated_at,
    )


@router.patch("/{note_id}", response_model=GaNoteOut)
async def update_ga_note(
    note_id: uuid.UUID,
    payload: GaNoteUpdate,
    db: AsyncSession = Depends(get_db),
    user=Depends(get_current_user),
) -> GaNoteOut:
    note = (await db.execute(select(GaNote).where(GaNote.id == note_id))).scalar_one_or_none()
    if note is None:
        raise HTTPException(status_code=status.HTTP_404_NOT_FOUND, detail="GA note not found")
    if note.project_id is not None:
        project = (await db.execute(select(Project).where(Project.id == note.project_id))).scalar_one_or_none()
        if project and project.department_id is not None:
            ensure_department_access(user, project.department_id)

    if payload.status is not None:
        note.status = payload.status
        if payload.status == GaNoteStatus.CLOSED:
            note.completed_at = note.completed_at or datetime.utcnow()
    if payload.priority is not None:
        if payload.priority == GaNotePriority.URGENT:
            raise HTTPException(status_code=status.HTTP_400_BAD_REQUEST, detail="Urgent priority is not allowed")
        note.priority = payload.priority

    await db.commit()
    await db.refresh(note)
    return GaNoteOut(
        id=note.id,
        content=note.content,
        created_by=note.created_by,
        note_type=note.note_type,
        status=note.status,
        priority=note.priority,
        start_date=note.start_date,
        due_date=note.due_date,
        completed_at=note.completed_at,
        is_converted_to_task=note.is_converted_to_task,
        project_id=note.project_id,
        department_id=note.department_id,
        created_at=note.created_at,
        updated_at=note.updated_at,
    )
