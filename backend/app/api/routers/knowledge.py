"""Knowledge PX — Prompts (prompt library + prompt notes).

Prompt notes are regular PX Notes (``ga_notes``) tagged with ``knowledge_type='PROMPT'``,
so they show up in PX Notes automatically and can be turned into tasks with the
existing ``POST /tasks`` flow (``ga_note_origin_id``).

When the task is done, the assignee adds the prompt (text and/or file). A prompt then
needs two other people: one who tests it, and a manager/admin who approves it into the
Prompt Library.
"""

from __future__ import annotations

import mimetypes
import re
import uuid
from datetime import datetime, timezone
from pathlib import Path

from fastapi import APIRouter, Depends, File, Form, HTTPException, UploadFile, status
from fastapi.responses import FileResponse
from sqlalchemy import select
from sqlalchemy.ext.asyncio import AsyncSession

from app.api.access import ensure_department_access
from app.api.deps import get_current_user
from app.config import settings
from app.db import get_db
from app.models.enums import GaNotePriority, GaNoteStatus, GaNoteType, UserRole
from app.models.ga_note import GaNote
from app.models.knowledge_prompt import KnowledgePrompt
from app.models.task import Task
from app.models.user import User
from app.schemas.knowledge import (
    KnowledgePromptBrief,
    KnowledgePromptOut,
    KnowledgeUserRef,
    PromptNoteCreate,
    PromptNoteOut,
    PromptNoteTaskOut,
    PromptNoteUpdate,
    PromptReviewAction,
)

router = APIRouter()

KNOWLEDGE_TYPE_PROMPT = "PROMPT"

STATUS_PENDING_TEST = "PENDING_TEST"
STATUS_PENDING_APPROVAL = "PENDING_APPROVAL"
STATUS_APPROVED = "APPROVED"
STATUS_REJECTED = "REJECTED"
PROMPT_STATUSES = {STATUS_PENDING_TEST, STATUS_PENDING_APPROVAL, STATUS_APPROVED, STATUS_REJECTED}

TEXT_EXTENSIONS = {".txt", ".md", ".markdown", ".json", ".yaml", ".yml", ".prompt", ".xml", ".csv"}
MAX_KEYWORDS = 30


# ---------------------------------------------------------------------------
# helpers
# ---------------------------------------------------------------------------


def _now() -> datetime:
    return datetime.now(timezone.utc)


def _is_manager(user: User) -> bool:
    return user.role in (UserRole.ADMIN, UserRole.MANAGER)


def _upload_base_dir() -> Path:
    base = Path(settings.GA_NOTES_UPLOAD_DIR).parent / "knowledge-prompts"
    if not base.is_absolute():
        base = Path(__file__).resolve().parents[3] / base
    return base


def parse_keywords(raw: str | list[str] | None) -> list[str]:
    """Split on comma/semicolon/newline/#, trim, de-duplicate case-insensitively."""
    if raw is None:
        return []
    parts = raw if isinstance(raw, list) else re.split(r"[,;\n#]+", raw)
    seen: set[str] = set()
    out: list[str] = []
    for part in parts:
        word = re.sub(r"\s+", " ", str(part)).strip()
        if not word:
            continue
        word = word[:100]
        key = word.casefold()
        if key in seen:
            continue
        seen.add(key)
        out.append(word)
        if len(out) >= MAX_KEYWORDS:
            break
    return out


async def _user_map(db: AsyncSession, ids: set[uuid.UUID | None]) -> dict[uuid.UUID, KnowledgeUserRef]:
    clean = {i for i in ids if i is not None}
    if not clean:
        return {}
    rows = (await db.execute(select(User.id, User.full_name).where(User.id.in_(clean)))).all()
    return {row.id: KnowledgeUserRef(id=row.id, full_name=row.full_name) for row in rows}


def _prompt_user_ids(prompt: KnowledgePrompt) -> set[uuid.UUID | None]:
    return {prompt.created_by, prompt.tested_by, prompt.approved_by, prompt.rejected_by}


def _prompt_out(prompt: KnowledgePrompt, users: dict[uuid.UUID, KnowledgeUserRef]) -> KnowledgePromptOut:
    ref = lambda uid: users.get(uid) if uid else None  # noqa: E731
    return KnowledgePromptOut(
        id=prompt.id,
        title=prompt.title,
        content=prompt.content or "",
        keywords=list(prompt.keywords or []),
        files_path=prompt.files_path,
        source_note_id=prompt.source_note_id,
        status=prompt.status,
        created_by=ref(prompt.created_by),
        tested_by=ref(prompt.tested_by),
        tested_at=prompt.tested_at,
        test_comment=prompt.test_comment,
        approved_by=ref(prompt.approved_by),
        approved_at=prompt.approved_at,
        rejected_by=ref(prompt.rejected_by),
        rejected_at=prompt.rejected_at,
        rejection_reason=prompt.rejection_reason,
        file_original_name=prompt.file_original_name,
        file_content_type=prompt.file_content_type,
        file_size=prompt.file_size,
        created_at=prompt.created_at,
        updated_at=prompt.updated_at,
    )


async def _single_prompt_out(db: AsyncSession, prompt: KnowledgePrompt) -> KnowledgePromptOut:
    await db.refresh(prompt)
    return _prompt_out(prompt, await _user_map(db, _prompt_user_ids(prompt)))


async def _get_prompt_or_404(db: AsyncSession, prompt_id: uuid.UUID) -> KnowledgePrompt:
    prompt = (
        await db.execute(select(KnowledgePrompt).where(KnowledgePrompt.id == prompt_id))
    ).scalar_one_or_none()
    if prompt is None:
        raise HTTPException(status_code=status.HTTP_404_NOT_FOUND, detail="Prompti nuk u gjet")
    return prompt


async def _get_prompt_note_or_404(db: AsyncSession, note_id: uuid.UUID) -> GaNote:
    note = (await db.execute(select(GaNote).where(GaNote.id == note_id))).scalar_one_or_none()
    if note is None or note.knowledge_type != KNOWLEDGE_TYPE_PROMPT:
        raise HTTPException(status_code=status.HTTP_404_NOT_FOUND, detail="Shënimi i promptit nuk u gjet")
    return note


def _reset_review(prompt: KnowledgePrompt) -> None:
    prompt.status = STATUS_PENDING_TEST
    prompt.tested_by = None
    prompt.tested_at = None
    prompt.test_comment = None
    prompt.approved_by = None
    prompt.approved_at = None
    prompt.rejected_by = None
    prompt.rejected_at = None
    prompt.rejection_reason = None


async def _store_upload(prompt: KnowledgePrompt, upload: UploadFile) -> tuple[Path, bytes | None]:
    """Save the uploaded file; return its path and the raw bytes when it is a small text file."""
    max_bytes = settings.GA_NOTES_MAX_FILE_MB * 1024 * 1024
    original_name = (upload.filename or "prompt.txt").strip()[:255] or "prompt.txt"
    extension = Path(original_name).suffix.lower()
    stored_name = f"{uuid.uuid4()}{extension}"
    target_dir = _upload_base_dir() / str(prompt.id)
    target_dir.mkdir(parents=True, exist_ok=True)
    target = target_dir / stored_name

    size = 0
    text_buffer = bytearray() if extension in TEXT_EXTENSIONS else None
    with target.open("wb") as fh:
        while True:
            chunk = await upload.read(1024 * 1024)
            if not chunk:
                break
            size += len(chunk)
            if size > max_bytes:
                fh.close()
                target.unlink(missing_ok=True)
                await upload.close()
                raise HTTPException(
                    status_code=status.HTTP_400_BAD_REQUEST,
                    detail=f"Skedari është shumë i madh. Maksimumi {settings.GA_NOTES_MAX_FILE_MB}MB.",
                )
            fh.write(chunk)
            if text_buffer is not None:
                text_buffer.extend(chunk)
    await upload.close()

    old_stored = prompt.file_stored_name
    prompt.file_original_name = original_name
    prompt.file_stored_name = stored_name
    prompt.file_content_type = upload.content_type or mimetypes.guess_type(original_name)[0]
    prompt.file_size = size
    if old_stored and old_stored != stored_name:
        (target_dir / old_stored).unlink(missing_ok=True)
    return target, bytes(text_buffer) if text_buffer is not None else None


def _decode_text(raw: bytes | None) -> str:
    if not raw:
        return ""
    for encoding in ("utf-8-sig", "utf-16", "cp1252"):
        try:
            return raw.decode(encoding).strip()
        except UnicodeDecodeError:
            continue
    return ""


# ---------------------------------------------------------------------------
# Prompt notes
# ---------------------------------------------------------------------------


@router.get("/prompt-notes", response_model=list[PromptNoteOut])
async def list_prompt_notes(
    db: AsyncSession = Depends(get_db),
    user=Depends(get_current_user),
) -> list[PromptNoteOut]:
    notes = (
        await db.execute(
            select(GaNote)
            .where(GaNote.knowledge_type == KNOWLEDGE_TYPE_PROMPT)
            .order_by(GaNote.created_at.desc())
        )
    ).scalars().all()
    note_ids = [n.id for n in notes]

    tasks: list[Task] = []
    prompts: list[KnowledgePrompt] = []
    if note_ids:
        tasks = (
            await db.execute(
                select(Task)
                .where(Task.ga_note_origin_id.in_(note_ids))
                .where(Task.is_active.is_(True))
                .order_by(Task.created_at.asc())
            )
        ).scalars().all()
        prompts = (
            await db.execute(
                select(KnowledgePrompt)
                .where(KnowledgePrompt.source_note_id.in_(note_ids))
                .order_by(KnowledgePrompt.created_at.asc())
            )
        ).scalars().all()

    users = await _user_map(db, {n.created_by for n in notes} | {t.assigned_to for t in tasks})

    tasks_by_note: dict[uuid.UUID, list[PromptNoteTaskOut]] = {}
    for task in tasks:
        tasks_by_note.setdefault(task.ga_note_origin_id, []).append(
            PromptNoteTaskOut(
                id=task.id,
                title=task.title,
                status=task.status.value if hasattr(task.status, "value") else str(task.status),
                assignee=users.get(task.assigned_to) if task.assigned_to else None,
                due_date=task.due_date,
                completed_at=task.completed_at,
            )
        )
    prompts_by_note: dict[uuid.UUID, list[KnowledgePromptBrief]] = {}
    for prompt in prompts:
        prompts_by_note.setdefault(prompt.source_note_id, []).append(
            KnowledgePromptBrief(id=prompt.id, title=prompt.title, status=prompt.status)
        )

    return [
        PromptNoteOut(
            id=note.id,
            content=note.content,
            status=note.status.value,
            priority=note.priority.value if note.priority else None,
            department_id=note.department_id,
            is_converted_to_task=note.is_converted_to_task,
            created_by=users.get(note.created_by) if note.created_by else None,
            created_at=note.created_at,
            updated_at=note.updated_at,
            completed_at=note.completed_at,
            tasks=tasks_by_note.get(note.id, []),
            prompts=prompts_by_note.get(note.id, []),
        )
        for note in notes
    ]


@router.post("/prompt-notes", response_model=PromptNoteOut, status_code=status.HTTP_201_CREATED)
async def create_prompt_note(
    payload: PromptNoteCreate,
    db: AsyncSession = Depends(get_db),
    user=Depends(get_current_user),
) -> PromptNoteOut:
    department_id = payload.department_id or user.department_id
    if department_id is None and not _is_manager(user):
        raise HTTPException(status_code=status.HTTP_400_BAD_REQUEST, detail="Zgjidh departamentin")
    if department_id is not None and payload.department_id is not None:
        ensure_department_access(user, department_id)

    note = GaNote(
        content=payload.content.strip(),
        created_by=user.id,
        note_type=GaNoteType.GA,
        status=GaNoteStatus.OPEN,
        priority=GaNotePriority(payload.priority) if payload.priority else None,
        department_id=department_id,
        knowledge_type=KNOWLEDGE_TYPE_PROMPT,
    )
    db.add(note)
    await db.commit()
    await db.refresh(note)
    return PromptNoteOut(
        id=note.id,
        content=note.content,
        status=note.status.value,
        priority=note.priority.value if note.priority else None,
        department_id=note.department_id,
        is_converted_to_task=note.is_converted_to_task,
        created_by=KnowledgeUserRef(id=user.id, full_name=user.full_name),
        created_at=note.created_at,
        updated_at=note.updated_at,
        completed_at=note.completed_at,
    )


@router.patch("/prompt-notes/{note_id}", status_code=status.HTTP_204_NO_CONTENT, response_model=None)
async def update_prompt_note(
    note_id: uuid.UUID,
    payload: PromptNoteUpdate,
    db: AsyncSession = Depends(get_db),
    user=Depends(get_current_user),
) -> None:
    note = await _get_prompt_note_or_404(db, note_id)
    if note.created_by != user.id and not _is_manager(user):
        raise HTTPException(status_code=status.HTTP_403_FORBIDDEN, detail="Vetëm autori ose menaxheri")
    if payload.content is not None:
        note.content = payload.content.strip()
    if payload.status is not None:
        note.status = GaNoteStatus(payload.status)
        note.completed_at = _now() if note.status == GaNoteStatus.CLOSED else None
    await db.commit()


# ---------------------------------------------------------------------------
# Prompts
# ---------------------------------------------------------------------------


@router.get("/prompts", response_model=list[KnowledgePromptOut])
async def list_prompts(
    status_filter: str | None = None,
    db: AsyncSession = Depends(get_db),
    user=Depends(get_current_user),
) -> list[KnowledgePromptOut]:
    stmt = select(KnowledgePrompt).order_by(KnowledgePrompt.updated_at.desc())
    if status_filter:
        wanted = {s.strip().upper() for s in status_filter.split(",") if s.strip()}
        unknown = wanted - PROMPT_STATUSES
        if unknown:
            raise HTTPException(status_code=status.HTTP_400_BAD_REQUEST, detail="Status i panjohur")
        stmt = stmt.where(KnowledgePrompt.status.in_(wanted))
    prompts = (await db.execute(stmt)).scalars().all()
    ids: set[uuid.UUID | None] = set()
    for prompt in prompts:
        ids |= _prompt_user_ids(prompt)
    users = await _user_map(db, ids)
    return [_prompt_out(p, users) for p in prompts]


@router.get("/prompts/{prompt_id}", response_model=KnowledgePromptOut)
async def get_prompt(
    prompt_id: uuid.UUID,
    db: AsyncSession = Depends(get_db),
    user=Depends(get_current_user),
) -> KnowledgePromptOut:
    return await _single_prompt_out(db, await _get_prompt_or_404(db, prompt_id))


@router.post("/prompts", response_model=KnowledgePromptOut, status_code=status.HTTP_201_CREATED)
async def create_prompt(
    title: str = Form(...),
    content: str = Form(""),
    keywords: str = Form(""),
    files_path: str = Form(""),
    source_note_id: uuid.UUID | None = Form(None),
    file: UploadFile | None = File(None),
    db: AsyncSession = Depends(get_db),
    user=Depends(get_current_user),
) -> KnowledgePromptOut:
    title = title.strip()
    if len(title) < 2:
        raise HTTPException(status_code=status.HTTP_400_BAD_REQUEST, detail="Titulli i promptit mungon")
    if source_note_id is not None:
        await _get_prompt_note_or_404(db, source_note_id)

    prompt = KnowledgePrompt(
        id=uuid.uuid4(),
        title=title[:300],
        content=content.strip(),
        keywords=parse_keywords(keywords),
        files_path=files_path.strip()[:1000] or None,
        source_note_id=source_note_id,
        status=STATUS_PENDING_TEST,
        created_by=user.id,
    )
    stored_path: Path | None = None
    if file is not None and (file.filename or "").strip():
        stored_path, raw_text = await _store_upload(prompt, file)
        if not prompt.content:
            prompt.content = _decode_text(raw_text)
    if not prompt.content and not prompt.file_stored_name:
        raise HTTPException(
            status_code=status.HTTP_400_BAD_REQUEST,
            detail="Shto tekstin e promptit ose ngarko një skedar",
        )
    db.add(prompt)
    try:
        await db.commit()
    except Exception:
        if stored_path is not None:
            stored_path.unlink(missing_ok=True)
        raise
    return await _single_prompt_out(db, prompt)


@router.patch("/prompts/{prompt_id}", response_model=KnowledgePromptOut)
async def update_prompt(
    prompt_id: uuid.UUID,
    title: str | None = Form(None),
    content: str | None = Form(None),
    keywords: str | None = Form(None),
    files_path: str | None = Form(None),
    remove_file: bool = Form(False),
    file: UploadFile | None = File(None),
    db: AsyncSession = Depends(get_db),
    user=Depends(get_current_user),
) -> KnowledgePromptOut:
    prompt = await _get_prompt_or_404(db, prompt_id)
    is_author = prompt.created_by == user.id
    if not _is_manager(user) and not (is_author and prompt.status != STATUS_APPROVED):
        raise HTTPException(
            status_code=status.HTTP_403_FORBIDDEN,
            detail="Vetëm autori (para aprovimit) ose menaxheri mund ta ndryshojë promptin",
        )

    if title is not None:
        if len(title.strip()) < 2:
            raise HTTPException(status_code=status.HTTP_400_BAD_REQUEST, detail="Titulli i promptit mungon")
        prompt.title = title.strip()[:300]
    if content is not None:
        prompt.content = content.strip()
    if keywords is not None:
        prompt.keywords = parse_keywords(keywords)
    if files_path is not None:
        prompt.files_path = files_path.strip()[:1000] or None
    if remove_file and prompt.file_stored_name:
        (_upload_base_dir() / str(prompt.id) / prompt.file_stored_name).unlink(missing_ok=True)
        prompt.file_original_name = None
        prompt.file_stored_name = None
        prompt.file_content_type = None
        prompt.file_size = None
    if file is not None and (file.filename or "").strip():
        _, raw_text = await _store_upload(prompt, file)
        if not prompt.content:
            prompt.content = _decode_text(raw_text)
    if not prompt.content and not prompt.file_stored_name:
        raise HTTPException(
            status_code=status.HTTP_400_BAD_REQUEST,
            detail="Shto tekstin e promptit ose ngarko një skedar",
        )

    # Any change to a prompt that is not yet in the library restarts the review.
    if prompt.status != STATUS_APPROVED:
        _reset_review(prompt)
    await db.commit()
    return await _single_prompt_out(db, prompt)


@router.post("/prompts/{prompt_id}/confirm-test", response_model=KnowledgePromptOut)
async def confirm_prompt_test(
    prompt_id: uuid.UUID,
    payload: PromptReviewAction,
    db: AsyncSession = Depends(get_db),
    user=Depends(get_current_user),
) -> KnowledgePromptOut:
    prompt = await _get_prompt_or_404(db, prompt_id)
    if prompt.status != STATUS_PENDING_TEST:
        raise HTTPException(status_code=status.HTTP_409_CONFLICT, detail="Prompti nuk është në pritje të testimit")
    if prompt.created_by == user.id:
        raise HTTPException(
            status_code=status.HTTP_403_FORBIDDEN,
            detail="Testimin duhet ta konfirmojë një person tjetër, jo autori",
        )
    prompt.status = STATUS_PENDING_APPROVAL
    prompt.tested_by = user.id
    prompt.tested_at = _now()
    prompt.test_comment = (payload.comment or "").strip() or None
    prompt.rejected_by = None
    prompt.rejected_at = None
    prompt.rejection_reason = None
    await db.commit()
    return await _single_prompt_out(db, prompt)


@router.post("/prompts/{prompt_id}/approve", response_model=KnowledgePromptOut)
async def approve_prompt(
    prompt_id: uuid.UUID,
    db: AsyncSession = Depends(get_db),
    user=Depends(get_current_user),
) -> KnowledgePromptOut:
    if not _is_manager(user):
        raise HTTPException(status_code=status.HTTP_403_FORBIDDEN, detail="Vetëm menaxherët mund ta aprovojnë")
    prompt = await _get_prompt_or_404(db, prompt_id)
    if prompt.status != STATUS_PENDING_APPROVAL:
        raise HTTPException(status_code=status.HTTP_409_CONFLICT, detail="Prompti duhet të testohet para aprovimit")
    if user.id in (prompt.created_by, prompt.tested_by):
        raise HTTPException(
            status_code=status.HTTP_403_FORBIDDEN,
            detail="Aprovimin duhet ta bëjë një person tjetër nga autori dhe testuesi",
        )
    now = _now()
    prompt.status = STATUS_APPROVED
    prompt.approved_by = user.id
    prompt.approved_at = now

    # The request is fulfilled: close the source prompt note (also closes it in PX Notes).
    if prompt.source_note_id is not None:
        note = (await db.execute(select(GaNote).where(GaNote.id == prompt.source_note_id))).scalar_one_or_none()
        if note is not None and note.status != GaNoteStatus.CLOSED:
            note.status = GaNoteStatus.CLOSED
            note.completed_at = now
    await db.commit()
    return await _single_prompt_out(db, prompt)


@router.post("/prompts/{prompt_id}/reject", response_model=KnowledgePromptOut)
async def reject_prompt(
    prompt_id: uuid.UUID,
    payload: PromptReviewAction,
    db: AsyncSession = Depends(get_db),
    user=Depends(get_current_user),
) -> KnowledgePromptOut:
    prompt = await _get_prompt_or_404(db, prompt_id)
    reason = (payload.comment or "").strip()
    if not reason:
        raise HTTPException(status_code=status.HTTP_400_BAD_REQUEST, detail="Shkruaj arsyen e kthimit")
    if prompt.status == STATUS_PENDING_TEST:
        if prompt.created_by == user.id:
            raise HTTPException(status_code=status.HTTP_403_FORBIDDEN, detail="Autori nuk mund ta refuzojë vetë")
    elif prompt.status in (STATUS_PENDING_APPROVAL, STATUS_APPROVED):
        if not _is_manager(user):
            raise HTTPException(status_code=status.HTTP_403_FORBIDDEN, detail="Vetëm menaxherët")
    else:
        raise HTTPException(status_code=status.HTTP_409_CONFLICT, detail="Prompti është refuzuar tashmë")
    prompt.status = STATUS_REJECTED
    prompt.rejected_by = user.id
    prompt.rejected_at = _now()
    prompt.rejection_reason = reason
    prompt.approved_by = None
    prompt.approved_at = None
    await db.commit()
    return await _single_prompt_out(db, prompt)


@router.delete("/prompts/{prompt_id}", status_code=status.HTTP_204_NO_CONTENT, response_model=None)
async def delete_prompt(
    prompt_id: uuid.UUID,
    db: AsyncSession = Depends(get_db),
    user=Depends(get_current_user),
) -> None:
    prompt = await _get_prompt_or_404(db, prompt_id)
    if not _is_manager(user) and not (prompt.created_by == user.id and prompt.status != STATUS_APPROVED):
        raise HTTPException(status_code=status.HTTP_403_FORBIDDEN, detail="Nuk keni leje ta fshini")
    if prompt.file_stored_name:
        (_upload_base_dir() / str(prompt.id) / prompt.file_stored_name).unlink(missing_ok=True)
    await db.delete(prompt)
    await db.commit()


@router.get("/prompts/{prompt_id}/file")
async def download_prompt_file(
    prompt_id: uuid.UUID,
    db: AsyncSession = Depends(get_db),
    user=Depends(get_current_user),
) -> FileResponse:
    prompt = await _get_prompt_or_404(db, prompt_id)
    if not prompt.file_stored_name:
        raise HTTPException(status_code=status.HTTP_404_NOT_FOUND, detail="Ky prompt nuk ka skedar")
    path = _upload_base_dir() / str(prompt.id) / prompt.file_stored_name
    if not path.exists():
        raise HTTPException(status_code=status.HTTP_404_NOT_FOUND, detail="Skedari mungon në server")
    return FileResponse(
        path,
        media_type=prompt.file_content_type or "application/octet-stream",
        filename=prompt.file_original_name or path.name,
    )
