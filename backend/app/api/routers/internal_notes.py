from __future__ import annotations

import uuid
from datetime import datetime

from fastapi import APIRouter, Depends, HTTPException, status
from sqlalchemy import select
from sqlalchemy.ext.asyncio import AsyncSession

from app.api.access import ensure_department_access
from app.api.deps import get_current_user
from app.db import get_db
from app.models.department import Department
from app.models.internal_note import InternalNote
from app.models.project import Project
from app.models.user import User
from app.models.enums import UserRole
from app.schemas.internal_note import (
    InternalNoteCreate,
    InternalNoteDoneUpdate,
    InternalNoteGroupUpdate,
    InternalNoteOut,
    InternalNoteUpdate,
)


router = APIRouter()


@router.get("", response_model=list[InternalNoteOut])
async def list_internal_notes(
    department_id: uuid.UUID | None = None,
    to_user_id: uuid.UUID | None = None,
    db: AsyncSession = Depends(get_db),
    user=Depends(get_current_user),
) -> list[InternalNoteOut]:
    if department_id is None:
        raise HTTPException(status_code=status.HTTP_400_BAD_REQUEST, detail="department_id required")
    ensure_department_access(user, department_id)

    stmt = select(InternalNote).where(InternalNote.department_id == department_id)
    if to_user_id is not None:
        stmt = stmt.where(InternalNote.to_user_id == to_user_id)
    stmt = stmt.order_by(InternalNote.created_at.desc())
    notes = (await db.execute(stmt)).scalars().all()
    return [
        InternalNoteOut(
            id=n.id,
            title=n.title,
            description=n.description,
            from_user_id=n.from_user_id,
            to_user_id=n.to_user_id,
            department_id=n.department_id,
            project_id=n.project_id,
            to_department_id=n.to_department_id,
            is_done=n.is_done,
            done_at=n.done_at,
            done_by_user_id=n.done_by_user_id,
            created_at=n.created_at,
            updated_at=n.updated_at,
        )
        for n in notes
    ]


@router.post("", response_model=list[InternalNoteOut], status_code=status.HTTP_201_CREATED)
async def create_internal_note(
    payload: InternalNoteCreate,
    db: AsyncSession = Depends(get_db),
    user=Depends(get_current_user),
) -> list[InternalNoteOut]:
    if payload.department_id is not None:
        department = (
            await db.execute(select(Department).where(Department.id == payload.department_id))
        ).scalar_one_or_none()
        if department is None:
            raise HTTPException(status_code=status.HTTP_404_NOT_FOUND, detail="Department not found")
        ensure_department_access(user, payload.department_id)

    project = None
    if payload.project_id is not None:
        project = (
            await db.execute(select(Project).where(Project.id == payload.project_id))
        ).scalar_one_or_none()
        if project is None:
            raise HTTPException(status_code=status.HTTP_404_NOT_FOUND, detail="Project not found")
        if payload.department_id is not None and project.department_id != payload.department_id:
            raise HTTPException(
                status_code=status.HTTP_400_BAD_REQUEST, detail="Project must belong to selected department"
            )

    to_user_ids: list[uuid.UUID] = []
    if payload.to_user_ids:
        to_user_ids = payload.to_user_ids
    elif payload.to_user_id:
        to_user_ids = [payload.to_user_id]
    if not to_user_ids:
        raise HTTPException(status_code=status.HTTP_400_BAD_REQUEST, detail="to_user_id or to_user_ids required")

    users_result = await db.execute(select(User).where(User.id.in_(to_user_ids)))
    target_users = users_result.scalars().all()
    if len(target_users) != len(set(to_user_ids)):
        raise HTTPException(status_code=status.HTTP_404_NOT_FOUND, detail="User not found")

    notes: list[InternalNote] = []
    for target_user in target_users:
        if target_user.department_id is None:
            raise HTTPException(status_code=status.HTTP_400_BAD_REQUEST, detail="Target user has no department")
        note = InternalNote(
            title=payload.title,
            description=payload.description,
            from_user_id=user.id,
            to_user_id=target_user.id,
            department_id=target_user.department_id,
            project_id=payload.project_id,
            to_department_id=target_user.department_id,
        )
        db.add(note)
        notes.append(note)
    await db.commit()
    for note in notes:
        await db.refresh(note)
    return [
        InternalNoteOut(
            id=note.id,
            title=note.title,
            description=note.description,
            from_user_id=note.from_user_id,
            to_user_id=note.to_user_id,
            department_id=note.department_id,
            project_id=note.project_id,
            to_department_id=note.to_department_id,
            is_done=note.is_done,
            done_at=note.done_at,
            done_by_user_id=note.done_by_user_id,
            created_at=note.created_at,
            updated_at=note.updated_at,
        )
        for note in notes
    ]


@router.delete("/{note_id}", response_model=InternalNoteOut)
async def delete_internal_note(
    note_id: uuid.UUID,
    db: AsyncSession = Depends(get_db),
    user=Depends(get_current_user),
) -> InternalNoteOut:
    note = (await db.execute(select(InternalNote).where(InternalNote.id == note_id))).scalar_one_or_none()
    if note is None:
        raise HTTPException(status_code=status.HTTP_404_NOT_FOUND, detail="Internal note not found")

    ensure_department_access(user, note.department_id)

    is_admin_or_manager = user.role in (UserRole.ADMIN, UserRole.MANAGER)
    is_target_user = note.to_user_id == user.id
    if not (is_admin_or_manager or is_target_user):
        raise HTTPException(status_code=status.HTTP_403_FORBIDDEN, detail="Forbidden")

    await db.delete(note)
    await db.commit()
    return InternalNoteOut(
        id=note.id,
        title=note.title,
        description=note.description,
        from_user_id=note.from_user_id,
        to_user_id=note.to_user_id,
        department_id=note.department_id,
        project_id=note.project_id,
        to_department_id=note.to_department_id,
        is_done=note.is_done,
        done_at=note.done_at,
        done_by_user_id=note.done_by_user_id,
        created_at=note.created_at,
        updated_at=note.updated_at,
    )


@router.patch("/group", response_model=list[InternalNoteOut])
async def update_internal_note_group(
    payload: InternalNoteGroupUpdate,
    db: AsyncSession = Depends(get_db),
    user=Depends(get_current_user),
) -> list[InternalNoteOut]:
    if not payload.note_ids:
        raise HTTPException(status_code=status.HTTP_400_BAD_REQUEST, detail="noteIds required")
    if not payload.to_user_ids:
        raise HTTPException(status_code=status.HTTP_400_BAD_REQUEST, detail="toUserIds required")
    if not payload.title.strip():
        raise HTTPException(status_code=status.HTTP_400_BAD_REQUEST, detail="title cannot be empty")

    notes = (
        await db.execute(select(InternalNote).where(InternalNote.id.in_(payload.note_ids)))
    ).scalars().all()
    if len(notes) != len(set(payload.note_ids)):
        raise HTTPException(status_code=status.HTTP_404_NOT_FOUND, detail="Internal note not found")

    for note in notes:
        ensure_department_access(user, note.department_id)
    ensure_department_access(user, payload.department_id)

    is_admin_or_manager = user.role in (UserRole.ADMIN, UserRole.MANAGER)
    origin_from_user_id = notes[0].from_user_id
    if not (is_admin_or_manager or origin_from_user_id == user.id):
        raise HTTPException(status_code=status.HTTP_403_FORBIDDEN, detail="Forbidden")

    if payload.project_id is not None:
        project = (
            await db.execute(select(Project).where(Project.id == payload.project_id))
        ).scalar_one_or_none()
        if project is None:
            raise HTTPException(status_code=status.HTTP_404_NOT_FOUND, detail="Project not found")
        if project.department_id != payload.department_id:
            raise HTTPException(
                status_code=status.HTTP_400_BAD_REQUEST, detail="Project must belong to selected department"
            )

    users_result = await db.execute(select(User).where(User.id.in_(payload.to_user_ids)))
    target_users = users_result.scalars().all()
    if len(target_users) != len(set(payload.to_user_ids)):
        raise HTTPException(status_code=status.HTTP_404_NOT_FOUND, detail="User not found")
    for target_user in target_users:
        if target_user.department_id != payload.department_id:
            raise HTTPException(
                status_code=status.HTTP_400_BAD_REQUEST,
                detail="All target users must belong to selected department",
            )

    title = payload.title.strip()
    description = payload.description.strip() if payload.description is not None else None
    description = description or None
    origin_created_at = notes[0].created_at

    existing_by_to_user_id: dict[uuid.UUID, InternalNote] = {n.to_user_id: n for n in notes}
    target_to_user_ids = set(payload.to_user_ids)
    kept_notes: list[InternalNote] = []

    for note in notes:
        if note.to_user_id not in target_to_user_ids:
            await db.delete(note)
            continue
        note.title = title
        note.description = description
        note.project_id = payload.project_id
        note.department_id = payload.department_id
        note.to_department_id = payload.department_id
        kept_notes.append(note)

    created_notes: list[InternalNote] = []
    for target_user_id in target_to_user_ids:
        if target_user_id in existing_by_to_user_id:
            continue
        note = InternalNote(
            title=title,
            description=description,
            from_user_id=origin_from_user_id,
            to_user_id=target_user_id,
            department_id=payload.department_id,
            project_id=payload.project_id,
            to_department_id=payload.department_id,
        )
        note.created_at = origin_created_at
        db.add(note)
        created_notes.append(note)

    await db.commit()
    for note in [*kept_notes, *created_notes]:
        await db.refresh(note)

    all_notes = [*kept_notes, *created_notes]
    all_notes.sort(key=lambda n: str(n.to_user_id))
    return [
        InternalNoteOut(
            id=n.id,
            title=n.title,
            description=n.description,
            from_user_id=n.from_user_id,
            to_user_id=n.to_user_id,
            department_id=n.department_id,
            project_id=n.project_id,
            to_department_id=n.to_department_id,
            is_done=n.is_done,
            done_at=n.done_at,
            done_by_user_id=n.done_by_user_id,
            created_at=n.created_at,
            updated_at=n.updated_at,
        )
        for n in all_notes
    ]


@router.patch("/{note_id}", response_model=InternalNoteOut)
async def update_internal_note(
    note_id: uuid.UUID,
    payload: InternalNoteUpdate,
    db: AsyncSession = Depends(get_db),
    user=Depends(get_current_user),
) -> InternalNoteOut:
    note = (await db.execute(select(InternalNote).where(InternalNote.id == note_id))).scalar_one_or_none()
    if note is None:
        raise HTTPException(status_code=status.HTTP_404_NOT_FOUND, detail="Internal note not found")

    ensure_department_access(user, note.department_id)

    is_admin_or_manager = user.role in (UserRole.ADMIN, UserRole.MANAGER)
    is_creator = note.from_user_id == user.id
    is_target_user = note.to_user_id == user.id
    if not (is_admin_or_manager or is_creator or is_target_user):
        raise HTTPException(status_code=status.HTTP_403_FORBIDDEN, detail="Forbidden")

    fields_set = payload.model_fields_set
    if "title" in fields_set:
        if payload.title is None or not payload.title.strip():
            raise HTTPException(status_code=status.HTTP_400_BAD_REQUEST, detail="title cannot be empty")
        note.title = payload.title.strip()
    if "description" in fields_set:
        description = payload.description.strip() if payload.description is not None else None
        note.description = description or None
    if "project_id" in fields_set:
        if payload.project_id is None:
            note.project_id = None
        else:
            project = (
                await db.execute(select(Project).where(Project.id == payload.project_id))
            ).scalar_one_or_none()
            if project is None:
                raise HTTPException(status_code=status.HTTP_404_NOT_FOUND, detail="Project not found")
            if project.department_id != note.department_id:
                raise HTTPException(
                    status_code=status.HTTP_400_BAD_REQUEST, detail="Project must belong to note department"
                )
            note.project_id = payload.project_id

    await db.commit()
    await db.refresh(note)
    return InternalNoteOut(
        id=note.id,
        title=note.title,
        description=note.description,
        from_user_id=note.from_user_id,
        to_user_id=note.to_user_id,
        department_id=note.department_id,
        project_id=note.project_id,
        to_department_id=note.to_department_id,
        is_done=note.is_done,
        done_at=note.done_at,
        done_by_user_id=note.done_by_user_id,
        created_at=note.created_at,
        updated_at=note.updated_at,
    )


@router.patch("/{note_id}/done", response_model=InternalNoteOut)
async def update_internal_note_done(
    note_id: uuid.UUID,
    payload: InternalNoteDoneUpdate,
    db: AsyncSession = Depends(get_db),
    user=Depends(get_current_user),
) -> InternalNoteOut:
    note = (await db.execute(select(InternalNote).where(InternalNote.id == note_id))).scalar_one_or_none()
    if note is None:
        raise HTTPException(status_code=status.HTTP_404_NOT_FOUND, detail="Internal note not found")

    ensure_department_access(user, note.department_id)

    is_admin_or_manager = user.role in (UserRole.ADMIN, UserRole.MANAGER)
    is_target_user = note.to_user_id == user.id
    if not (is_admin_or_manager or is_target_user):
        raise HTTPException(status_code=status.HTTP_403_FORBIDDEN, detail="Forbidden")

    note.is_done = payload.is_done
    if payload.is_done:
        note.done_at = datetime.utcnow()
        note.done_by_user_id = user.id
    else:
        note.done_at = None
        note.done_by_user_id = None

    await db.commit()
    await db.refresh(note)
    return InternalNoteOut(
        id=note.id,
        title=note.title,
        description=note.description,
        from_user_id=note.from_user_id,
        to_user_id=note.to_user_id,
        department_id=note.department_id,
        project_id=note.project_id,
        to_department_id=note.to_department_id,
        is_done=note.is_done,
        done_at=note.done_at,
        done_by_user_id=note.done_by_user_id,
        created_at=note.created_at,
        updated_at=note.updated_at,
    )
