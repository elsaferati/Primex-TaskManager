from __future__ import annotations

import uuid
from datetime import datetime, timedelta
from pathlib import Path

from fastapi import APIRouter, Depends, File, Form, HTTPException, UploadFile, status
from sqlalchemy import or_, select
from sqlalchemy.ext.asyncio import AsyncSession
from sqlalchemy.orm import selectinload

from app.api.access import ensure_department_access
from app.api.deps import get_current_user
from app.db import get_db
from app.models.ga_note import GaNote
from app.models.ga_note_attachment import GaNoteAttachment
from app.models.enums import GaNotePriority, GaNoteStatus, GaNoteType, UserRole
from app.models.project import Project
from app.schemas.ga_note import GaNoteAttachmentOut, GaNoteCreate, GaNoteOut, GaNoteUpdate
from app.config import settings


router = APIRouter()


def _attachment_out(attachment: GaNoteAttachment) -> GaNoteAttachmentOut:
    return GaNoteAttachmentOut(
        id=attachment.id,
        note_id=attachment.note_id,
        original_filename=attachment.original_filename,
        stored_filename=attachment.stored_filename,
        content_type=attachment.content_type,
        size_bytes=attachment.size_bytes,
        created_by=attachment.created_by,
        created_at=attachment.created_at,
    )


def _note_out(note: GaNote) -> GaNoteOut:
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
        attachments=[_attachment_out(a) for a in (note.attachments or [])],
    )


async def _ensure_note_access(note: GaNote, user, db: AsyncSession) -> None:
    if note.project_id is not None:
        project = (await db.execute(select(Project).where(Project.id == note.project_id))).scalar_one_or_none()
        if project and project.department_id is not None:
            ensure_department_access(user, project.department_id)
    elif note.department_id is not None:
        ensure_department_access(user, note.department_id)


async def _get_note_or_404(note_id: uuid.UUID, db: AsyncSession) -> GaNote:
    note = (await db.execute(select(GaNote).where(GaNote.id == note_id))).scalar_one_or_none()
    if note is None:
        raise HTTPException(status_code=status.HTTP_404_NOT_FOUND, detail="GA note not found")
    return note


async def _save_ga_note_attachments(
    note: GaNote,
    files: list[UploadFile],
    db: AsyncSession,
    user,
) -> list[GaNoteAttachmentOut]:
    await _ensure_note_access(note, user, db)

    if not files:
        raise HTTPException(status_code=status.HTTP_400_BAD_REQUEST, detail="No files uploaded")
    if len(files) > settings.GA_NOTES_MAX_FILES:
        raise HTTPException(
            status_code=status.HTTP_400_BAD_REQUEST,
            detail=f"Too many files. Max {settings.GA_NOTES_MAX_FILES}.",
        )

    max_bytes = settings.GA_NOTES_MAX_FILE_MB * 1024 * 1024
    upload_base = Path(settings.GA_NOTES_UPLOAD_DIR)
    if not upload_base.is_absolute():
        upload_base = Path(__file__).resolve().parents[3] / upload_base
    note_dir = upload_base / str(note.id)
    note_dir.mkdir(parents=True, exist_ok=True)

    created: list[GaNoteAttachment] = []
    stored_paths: list[Path] = []
    try:
        for upload in files:
            attachment_id = uuid.uuid4()
            original_name = (upload.filename or "file").strip()
            extension = Path(original_name).suffix
            stored_name = f"{attachment_id}{extension}"
            stored_path = note_dir / stored_name

            size_bytes = 0
            with stored_path.open("wb") as buffer:
                while True:
                    chunk = await upload.read(1024 * 1024)
                    if not chunk:
                        break
                    size_bytes += len(chunk)
                    if size_bytes > max_bytes:
                        buffer.close()
                        if stored_path.exists():
                            stored_path.unlink()
                        await upload.close()
                        raise HTTPException(
                            status_code=status.HTTP_400_BAD_REQUEST,
                            detail=f"File too large. Max {settings.GA_NOTES_MAX_FILE_MB}MB.",
                        )
                    buffer.write(chunk)
            stored_paths.append(stored_path)

            attachment = GaNoteAttachment(
                id=attachment_id,
                note_id=note.id,
                original_filename=original_name,
                stored_filename=stored_name,
                content_type=upload.content_type,
                size_bytes=size_bytes,
                created_by=user.id,
            )
            db.add(attachment)
            created.append(attachment)
            await upload.close()

        await db.commit()
    except Exception:
        for path in stored_paths:
            if path.exists():
                path.unlink()
        await db.rollback()
        raise

    return [_attachment_out(a) for a in created]


@router.get("", response_model=list[GaNoteOut])
async def list_ga_notes(
    project_id: uuid.UUID | None = None,
    department_id: uuid.UUID | None = None,
    db: AsyncSession = Depends(get_db),
    user=Depends(get_current_user),
) -> list[GaNoteOut]:
    # Filter out closed notes that were closed more than 30 days ago
    closed_cutoff = datetime.utcnow() - timedelta(days=30)

    stmt = select(GaNote).options(selectinload(GaNote.attachments)).order_by(GaNote.created_at.desc())

    # Include all open notes; include closed notes only if recently closed
    stmt = stmt.where(
        or_(
            GaNote.status != GaNoteStatus.CLOSED,
            GaNote.completed_at.is_(None),
            GaNote.completed_at >= closed_cutoff,
        )
    )
    
    if project_id is not None:
        project = (await db.execute(select(Project).where(Project.id == project_id))).scalar_one_or_none()
        if project is None:
            raise HTTPException(status_code=status.HTTP_404_NOT_FOUND, detail="Project not found")
        stmt = stmt.where(GaNote.project_id == project_id)
    elif department_id is not None:
        stmt = stmt.where(GaNote.department_id == department_id)

    notes = (await db.execute(stmt)).scalars().all()
    return [_note_out(n) for n in notes]


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
    return _note_out(note)


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
    await _ensure_note_access(note, user, db)

    if payload.content is not None:
        note.content = payload.content
    if payload.status is not None:
        note.status = payload.status
        if payload.status == GaNoteStatus.CLOSED:
            note.completed_at = note.completed_at or datetime.utcnow()
    if payload.priority is not None:
        note.priority = payload.priority
    if payload.is_converted_to_task is not None:
        note.is_converted_to_task = payload.is_converted_to_task

    await db.commit()
    await db.refresh(note)
    return _note_out(note)


@router.get("/{note_id}", response_model=GaNoteOut)
async def get_ga_note(
    note_id: uuid.UUID,
    db: AsyncSession = Depends(get_db),
    user=Depends(get_current_user),
) -> GaNoteOut:
    note = (
        await db.execute(
            select(GaNote)
            .options(selectinload(GaNote.attachments))
            .where(GaNote.id == note_id)
        )
    ).scalar_one_or_none()
    if note is None:
        raise HTTPException(status_code=status.HTTP_404_NOT_FOUND, detail="GA note not found")
    await _ensure_note_access(note, user, db)
    return _note_out(note)


@router.post("/{note_id}/attachments", response_model=list[GaNoteAttachmentOut], status_code=status.HTTP_201_CREATED)
async def upload_ga_note_attachments(
    note_id: uuid.UUID,
    files: list[UploadFile] = File(...),
    db: AsyncSession = Depends(get_db),
    user=Depends(get_current_user),
) -> list[GaNoteAttachmentOut]:
    note = await _get_note_or_404(note_id, db)
    return await _save_ga_note_attachments(note, files, db, user)


@router.post("/attachments", response_model=list[GaNoteAttachmentOut], status_code=status.HTTP_201_CREATED)
async def upload_ga_note_attachments_by_form(
    note_id: uuid.UUID = Form(...),
    files: list[UploadFile] = File(...),
    db: AsyncSession = Depends(get_db),
    user=Depends(get_current_user),
) -> list[GaNoteAttachmentOut]:
    note = await _get_note_or_404(note_id, db)
    return await _save_ga_note_attachments(note, files, db, user)


@router.get("/attachments/{attachment_id}")
async def download_ga_note_attachment(
    attachment_id: uuid.UUID,
    db: AsyncSession = Depends(get_db),
    user=Depends(get_current_user),
):
    attachment = (
        await db.execute(
            select(GaNoteAttachment)
            .options(selectinload(GaNoteAttachment.note))
            .where(GaNoteAttachment.id == attachment_id)
        )
    ).scalar_one_or_none()
    if attachment is None:
        raise HTTPException(status_code=status.HTTP_404_NOT_FOUND, detail="Attachment not found")

    await _ensure_note_access(attachment.note, user, db)

    upload_base = Path(settings.GA_NOTES_UPLOAD_DIR)
    if not upload_base.is_absolute():
        upload_base = Path(__file__).resolve().parents[3] / upload_base
    stored_path = upload_base / str(attachment.note_id) / attachment.stored_filename
    if not stored_path.exists():
        raise HTTPException(status_code=status.HTTP_404_NOT_FOUND, detail="File not found on server")

    from fastapi.responses import FileResponse

    return FileResponse(
        stored_path,
        media_type=attachment.content_type or "application/octet-stream",
        filename=attachment.original_filename,
    )
