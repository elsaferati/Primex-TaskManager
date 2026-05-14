from __future__ import annotations

import re
import uuid
from datetime import datetime, timedelta
from pathlib import Path

from fastapi import APIRouter, Depends, File, Form, HTTPException, UploadFile, status
from pydantic import BaseModel
from sqlalchemy import or_, select
from sqlalchemy.ext.asyncio import AsyncSession
from sqlalchemy.orm import selectinload

from app.api.access import ensure_department_access, ensure_task_editor
from app.api.deps import get_current_user
from app.config import settings
from app.db import get_db
from app.models.enums import GaNoteStatus, GaNoteType, TaskStatus, UserRole
from app.models.plan_note import PlanNote
from app.models.plan_note_attachment import PlanNoteAttachment
from app.models.project import Project
from app.models.task import Task
from app.schemas.plan_note import (
    PlanNoteAttachmentOut,
    PlanNoteCreate,
    PlanNoteOut,
    PlanNoteTaskDeadlineUpdate,
    PlanNoteUpdate,
)
from app.services.audit import add_audit_log

router = APIRouter()


class MarkWaitingDoneResponse(BaseModel):
    updated_count: int
    skipped_count: int


class PlanNoteTaskDeadlineResponse(BaseModel):
    updated_count: int
    due_date: datetime | None = None
    is_deadline_important: bool | None = None


def _plan_note_task_title(content: str | None) -> str:
    lines = [
        re.sub(r"[ \t\f\v]+", " ", line).strip()
        for line in (content or "").replace("\r\n", "\n").replace("\r", "\n").split("\n")
    ]
    cleaned = "\n".join(line for line in lines if line)
    if not cleaned:
        return "Plan note task"
    return cleaned


def _plan_note_default_task_description(content: str | None) -> str | None:
    trimmed = (content or "").strip()
    return trimmed or None


def _attachment_out(attachment: PlanNoteAttachment) -> PlanNoteAttachmentOut:
    return PlanNoteAttachmentOut(
        id=attachment.id,
        note_id=attachment.note_id,
        original_filename=attachment.original_filename,
        stored_filename=attachment.stored_filename,
        content_type=attachment.content_type,
        size_bytes=attachment.size_bytes,
        created_by=attachment.created_by,
        created_at=attachment.created_at,
    )


def _note_out(note: PlanNote) -> PlanNoteOut:
    return PlanNoteOut(
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
        is_discussed=note.is_discussed,
        project_id=note.project_id,
        department_id=note.department_id,
        planned_for_date=note.planned_for_date,
        created_at=note.created_at,
        updated_at=note.updated_at,
        attachments=[_attachment_out(a) for a in (note.attachments or [])],
    )


def _plan_note_upload_base_dir() -> Path:
    upload_base = Path(settings.PLAN_NOTES_UPLOAD_DIR)
    if not upload_base.is_absolute():
        upload_base = Path(__file__).resolve().parents[3] / upload_base
    return upload_base


async def _ensure_note_access(note: PlanNote, user, db: AsyncSession) -> None:
    if note.project_id is not None:
        project = (await db.execute(select(Project).where(Project.id == note.project_id))).scalar_one_or_none()
        if project and project.department_id is not None:
            ensure_department_access(user, project.department_id)
    elif note.department_id is not None:
        ensure_department_access(user, note.department_id)


async def _get_note_or_404(note_id: uuid.UUID, db: AsyncSession) -> PlanNote:
    note = (await db.execute(select(PlanNote).where(PlanNote.id == note_id))).scalar_one_or_none()
    if note is None:
        raise HTTPException(status_code=status.HTTP_404_NOT_FOUND, detail="Plan note not found")
    return note


async def _save_plan_note_attachments(
    note: PlanNote,
    files: list[UploadFile],
    db: AsyncSession,
    user,
) -> list[PlanNoteAttachmentOut]:
    await _ensure_note_access(note, user, db)

    if not files:
        raise HTTPException(status_code=status.HTTP_400_BAD_REQUEST, detail="No files uploaded")
    if len(files) > settings.GA_NOTES_MAX_FILES:
        raise HTTPException(
            status_code=status.HTTP_400_BAD_REQUEST,
            detail=f"Too many files. Max {settings.GA_NOTES_MAX_FILES}.",
        )

    max_bytes = settings.GA_NOTES_MAX_FILE_MB * 1024 * 1024
    upload_base = _plan_note_upload_base_dir()
    note_dir = upload_base / str(note.id)
    note_dir.mkdir(parents=True, exist_ok=True)

    created: list[PlanNoteAttachment] = []
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

            attachment = PlanNoteAttachment(
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


@router.get("", response_model=list[PlanNoteOut])
async def list_plan_notes(
    project_id: uuid.UUID | None = None,
    department_id: uuid.UUID | None = None,
    db: AsyncSession = Depends(get_db),
    user=Depends(get_current_user),
) -> list[PlanNoteOut]:
    closed_cutoff = datetime.utcnow() - timedelta(days=30)

    stmt = select(PlanNote).options(selectinload(PlanNote.attachments)).order_by(PlanNote.created_at.desc())

    stmt = stmt.where(
        or_(
            PlanNote.status != GaNoteStatus.CLOSED,
            PlanNote.completed_at.is_(None),
            PlanNote.completed_at >= closed_cutoff,
        )
    )

    if project_id is not None:
        project = (await db.execute(select(Project).where(Project.id == project_id))).scalar_one_or_none()
        if project is None:
            raise HTTPException(status_code=status.HTTP_404_NOT_FOUND, detail="Project not found")
        stmt = stmt.where(PlanNote.project_id == project_id)
    elif department_id is not None:
        stmt = stmt.where(PlanNote.department_id == department_id)

    notes = (await db.execute(stmt)).scalars().all()
    return [_note_out(n) for n in notes]


@router.post("", response_model=PlanNoteOut, status_code=status.HTTP_201_CREATED)
async def create_plan_note(
    payload: PlanNoteCreate,
    db: AsyncSession = Depends(get_db),
    user=Depends(get_current_user),
) -> PlanNoteOut:
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

    note = PlanNote(
        content=payload.content,
        created_by=payload.created_by or user.id,
        note_type=payload.note_type or GaNoteType.GA,
        status=payload.status or GaNoteStatus.OPEN,
        priority=payload.priority,
        start_date=payload.start_date,
        due_date=payload.due_date,
        completed_at=payload.completed_at,
        is_converted_to_task=payload.is_converted_to_task or False,
        is_discussed=payload.is_discussed or False,
        project_id=payload.project_id,
        department_id=department_id,
        planned_for_date=payload.planned_for_date,
    )
    db.add(note)
    await db.commit()
    await db.refresh(note)
    return _note_out(note)


@router.patch("/{note_id}", response_model=PlanNoteOut)
async def update_plan_note(
    note_id: uuid.UUID,
    payload: PlanNoteUpdate,
    db: AsyncSession = Depends(get_db),
    user=Depends(get_current_user),
) -> PlanNoteOut:
    note = (await db.execute(select(PlanNote).where(PlanNote.id == note_id))).scalar_one_or_none()
    if note is None:
        raise HTTPException(status_code=status.HTTP_404_NOT_FOUND, detail="Plan note not found")
    await _ensure_note_access(note, user, db)

    old_content = note.content
    update_data = payload.model_dump(exclude_unset=True)

    if "content" in update_data:
        note.content = update_data["content"]
    if "status" in update_data:
        note.status = update_data["status"]
        if update_data["status"] == GaNoteStatus.CLOSED:
            note.completed_at = note.completed_at or datetime.utcnow()
    if "priority" in update_data:
        note.priority = update_data["priority"]
    if "is_converted_to_task" in update_data:
        note.is_converted_to_task = update_data["is_converted_to_task"]
    if "is_discussed" in update_data:
        note.is_discussed = update_data["is_discussed"]
    if "planned_for_date" in update_data:
        note.planned_for_date = update_data["planned_for_date"]

    if "content" in update_data and update_data["content"] != old_content:
        new_task_title = _plan_note_task_title(note.content)
        old_default_description = _plan_note_default_task_description(old_content)
        new_default_description = _plan_note_default_task_description(note.content)

        linked_tasks = (
            await db.execute(select(Task).where(Task.plan_note_origin_id == note.id))
        ).scalars().all()

        for task in linked_tasks:
            task.title = new_task_title
            if task.description == old_default_description:
                task.description = new_default_description

    await db.commit()
    await db.refresh(note)
    return _note_out(note)


@router.patch("/{note_id}/task-deadline", response_model=PlanNoteTaskDeadlineResponse)
async def update_plan_note_task_deadline(
    note_id: uuid.UUID,
    payload: PlanNoteTaskDeadlineUpdate,
    db: AsyncSession = Depends(get_db),
    user=Depends(get_current_user),
) -> PlanNoteTaskDeadlineResponse:
    note = await _get_note_or_404(note_id, db)
    await _ensure_note_access(note, user, db)

    linked_tasks = (
        await db.execute(
            select(Task).where(Task.plan_note_origin_id == note_id).where(Task.is_active.is_(True))
        )
    ).scalars().all()

    if not linked_tasks:
        raise HTTPException(
            status_code=status.HTTP_404_NOT_FOUND,
            detail="No active tasks found for this plan note",
        )

    can_edit = False
    forbidden_error: HTTPException | None = None
    for task in linked_tasks:
        try:
            ensure_task_editor(user, task)
            can_edit = True
            break
        except HTTPException as exc:
            forbidden_error = exc
            continue
    if not can_edit:
        raise forbidden_error or HTTPException(status_code=status.HTTP_403_FORBIDDEN, detail="Forbidden")

    new_due_date = None if payload.clear else payload.due_date
    update_due = payload.clear or payload.due_date is not None
    update_important = payload.is_deadline_important is not None

    if not update_due and not update_important:
        return PlanNoteTaskDeadlineResponse(
            updated_count=0,
            due_date=linked_tasks[0].due_date,
            is_deadline_important=linked_tasks[0].is_deadline_important,
        )

    updated_count = 0
    for task in linked_tasks:
        before = {
            "due_date": task.due_date.isoformat() if task.due_date else None,
            "is_deadline_important": task.is_deadline_important,
        }
        changed = False

        if update_due:
            if (
                task.due_date is not None
                and new_due_date is not None
                and new_due_date != task.due_date
                and task.original_due_date is None
            ):
                task.original_due_date = task.due_date
            if task.due_date != new_due_date:
                task.due_date = new_due_date
                changed = True

        if update_important and task.is_deadline_important != payload.is_deadline_important:
            task.is_deadline_important = bool(payload.is_deadline_important)
            changed = True

        if changed:
            updated_count += 1
            after = {
                "due_date": task.due_date.isoformat() if task.due_date else None,
                "is_deadline_important": task.is_deadline_important,
            }
            add_audit_log(
                db=db,
                actor_user_id=user.id,
                entity_type="task",
                entity_id=task.id,
                action="plan_note_deadline_update",
                before=before,
                after=after,
            )

    await db.commit()

    sample = linked_tasks[0]
    return PlanNoteTaskDeadlineResponse(
        updated_count=updated_count,
        due_date=sample.due_date,
        is_deadline_important=sample.is_deadline_important,
    )


@router.post("/{note_id}/mark-waiting-done", response_model=MarkWaitingDoneResponse)
async def mark_plan_note_waiting_tasks_done(
    note_id: uuid.UUID,
    db: AsyncSession = Depends(get_db),
    user=Depends(get_current_user),
) -> MarkWaitingDoneResponse:
    note = await _get_note_or_404(note_id, db)
    await _ensure_note_access(note, user, db)

    tasks = (await db.execute(select(Task).where(Task.plan_note_origin_id == note_id))).scalars().all()

    updated_count = 0
    for task in tasks:
        if task.status == TaskStatus.WAITING_CONFIRMATION:
            task.status = TaskStatus.DONE
            updated_count += 1

    await db.commit()

    return MarkWaitingDoneResponse(
        updated_count=updated_count,
        skipped_count=len(tasks) - updated_count,
    )


@router.get("/{note_id}", response_model=PlanNoteOut)
async def get_plan_note(
    note_id: uuid.UUID,
    db: AsyncSession = Depends(get_db),
    user=Depends(get_current_user),
) -> PlanNoteOut:
    note = (
        await db.execute(
            select(PlanNote).options(selectinload(PlanNote.attachments)).where(PlanNote.id == note_id)
        )
    ).scalar_one_or_none()
    if note is None:
        raise HTTPException(status_code=status.HTTP_404_NOT_FOUND, detail="Plan note not found")
    await _ensure_note_access(note, user, db)
    return _note_out(note)


@router.post("/{note_id}/attachments", response_model=list[PlanNoteAttachmentOut], status_code=status.HTTP_201_CREATED)
async def upload_plan_note_attachments(
    note_id: uuid.UUID,
    files: list[UploadFile] = File(...),
    db: AsyncSession = Depends(get_db),
    user=Depends(get_current_user),
) -> list[PlanNoteAttachmentOut]:
    note = await _get_note_or_404(note_id, db)
    return await _save_plan_note_attachments(note, files, db, user)


@router.post("/attachments", response_model=list[PlanNoteAttachmentOut], status_code=status.HTTP_201_CREATED)
async def upload_plan_note_attachments_by_form(
    note_id: uuid.UUID = Form(...),
    files: list[UploadFile] = File(...),
    db: AsyncSession = Depends(get_db),
    user=Depends(get_current_user),
) -> list[PlanNoteAttachmentOut]:
    note = await _get_note_or_404(note_id, db)
    return await _save_plan_note_attachments(note, files, db, user)


@router.get("/attachments/{attachment_id}")
async def download_plan_note_attachment(
    attachment_id: uuid.UUID,
    db: AsyncSession = Depends(get_db),
    user=Depends(get_current_user),
):
    attachment = (
        await db.execute(
            select(PlanNoteAttachment)
            .options(selectinload(PlanNoteAttachment.note))
            .where(PlanNoteAttachment.id == attachment_id)
        )
    ).scalar_one_or_none()
    if attachment is None:
        raise HTTPException(status_code=status.HTTP_404_NOT_FOUND, detail="Attachment not found")

    await _ensure_note_access(attachment.note, user, db)

    upload_base = _plan_note_upload_base_dir()
    stored_path = upload_base / str(attachment.note_id) / attachment.stored_filename
    if not stored_path.exists():
        raise HTTPException(status_code=status.HTTP_404_NOT_FOUND, detail="File not found on server")

    from fastapi.responses import FileResponse

    return FileResponse(
        stored_path,
        media_type=attachment.content_type or "application/octet-stream",
        filename=attachment.original_filename,
    )


@router.delete("/attachments/{attachment_id}", status_code=status.HTTP_204_NO_CONTENT, response_model=None)
async def delete_plan_note_attachment(
    attachment_id: uuid.UUID,
    db: AsyncSession = Depends(get_db),
    user=Depends(get_current_user),
):
    attachment = (
        await db.execute(
            select(PlanNoteAttachment)
            .options(selectinload(PlanNoteAttachment.note))
            .where(PlanNoteAttachment.id == attachment_id)
        )
    ).scalar_one_or_none()
    if attachment is None:
        raise HTTPException(status_code=status.HTTP_404_NOT_FOUND, detail="Attachment not found")

    await _ensure_note_access(attachment.note, user, db)

    upload_base = _plan_note_upload_base_dir()
    note_dir = upload_base / str(attachment.note_id)
    stored_path = note_dir / attachment.stored_filename

    await db.delete(attachment)
    await db.commit()

    try:
        if stored_path.exists():
            stored_path.unlink()
        if note_dir.exists() and not any(note_dir.iterdir()):
            note_dir.rmdir()
    except OSError:
        pass
