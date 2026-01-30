from __future__ import annotations

import asyncio
import uuid

import asyncpg
from fastapi import APIRouter, Depends, HTTPException, status
from pydantic import BaseModel
from sqlalchemy import func, select, update
from sqlalchemy.dialects.postgresql.asyncpg import AsyncAdapt_asyncpg_dbapi
from sqlalchemy.ext.asyncio import AsyncSession
from sqlalchemy.orm import selectinload

from app.api.access import ensure_department_access
from app.api.deps import get_current_user
from app.db import get_db
from app.models.department import Department
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

PROJECT_ACCEPTANCE_PATH = "project acceptance"
GA_DV_MEETING_PATH = "ga/dv meeting"
PROPOZIM_KO1_KO2_PATH = "propozim ko1/ko2"
PUNIMI_PATH = "punimi"
CONTROL_KO1_KO2_PATH = "control ko1/ko2"
FINALIZATION_PATH = "finalization"

# Graphic Design (GD) - "Pranimi i Projektit" checklist items
GD_PROJECT_ACCEPTANCE_TEMPLATE: list[str] = [
    "A është pranuar projekti?",
    "A është krijuar folderi për projektin?",
    "A janë ruajtur të gjitha dokumentet?",
    "A janë eksportuar të gjitha fotot në dosjen 01_ALL_PHOTO?",
    "A është kryer organizimi i fotove në foldera?",
    "A është shqyrtuar sa foto janë mungesë nese po është dergu email tek klienti?",
    "A janë analizuar dokumentet që i ka dërguar klienti?",
    "A jane identifikuar karakteristikat e produktit? p.sh (glass, soft close).",
    "A janë gjetur variancat? (fusse, farbe)",
    "A eshte pergatitur lista e produkteve e ndare me kategori?",
    "A eshte rast i ri, apo eshte kategori ekzistuese?",
]

# Graphic Design (GD) - "Takim me GA/DV" checklist items
GD_GA_DV_MEETING_TEMPLATE: list[str] = [
    "A është diskutuar me GA për propozimin?",
    "Çfarë është vendosur për të vazhduar?",
    "A ka pasur pika shtesë nga takimi?",
]

# Graphic Design (GD) - "PROPOZIM KO1/KO2" checklist items
GD_PROPOZIM_KO1_KO2_TEMPLATE: list[str] = [
    "Cila është kategoria?",
    "A eshte hulumtuar ne Otto.de, amazon.de dhe portale te tjera per top produkte te kategorise qe e kemi?",
    "Vendos linget ku je bazuar?",
]

# Graphic Design (GD) - "PUNIMI" checklist items
GD_PUNIMI_TEMPLATE: list[str] = [
    "Me dhan mundsi me shtu per kategorit qe vazhdojm psh mujn me 3 kategori ose 4 ose 1 nvaret prej klientit",
    "A janë dërguar të gjitha fotot për bz 1n1?",
]
# Graphic Design (GD) - "Përgatitja për dërgim KO1/KO2" checklist items
GD_CONTROL_KO1_KO2_TEMPLATE: list[str] = [
    "A janë bartur të gjitha produktet te folderi FINAL?",
    "A janë bartur vetëm fotot e nevojshme (3 foto)?",
    "A janë riemërtuar të gjitha fotot sipas kodit (kodi_1, kodi_2, kodi_3)?",
    "A është kontrolluar nëse janë kryer të gjitha produktet?",
    "A janë riemërtuar të gjitha fotot me kodin e artikullit dhe SKU-në interne?",
    "A janë vendosur të gjitha fotot e një kategorie në një folder?",
    "A është krijuar WeTransfer?",
    "A është dërguar WeTransfer-i në grup?",
]
# Graphic Design (GD) - "Finalizimi" checklist items
GD_FINALIZATION_TEMPLATE: list[str] = [
    "A eshte derguar?",
]




async def _ensure_gd_project_acceptance_items(db: AsyncSession, project: Project) -> None:
    """
    Ensure the GD "Pranimi i Projektit" checklist exists for a project.

    - Does NOT delete anything.
    - Idempotent: only inserts missing items.
    - Stores items with path = "project acceptance" as requested.
    """
    if project.department_id is None:
        return

    dept = (
        await db.execute(select(Department).where(Department.id == project.department_id))
    ).scalar_one_or_none()
    if dept is None or dept.code != "GD":
        return

    # If the project already has any acceptance items with the requested path, only backfill missing titles.
    existing_items = (
        await db.execute(
            select(ChecklistItem)
            .join(Checklist, ChecklistItem.checklist_id == Checklist.id)
            .where(
                Checklist.project_id == project.id,
                ChecklistItem.path == PROJECT_ACCEPTANCE_PATH,
                ChecklistItem.item_type == ChecklistItemType.CHECKBOX,
            )
        )
    ).scalars().all()
    existing_titles = {i.title for i in existing_items if i.title}

    missing = [t for t in GD_PROJECT_ACCEPTANCE_TEMPLATE if t not in existing_titles]
    if not missing:
        return

    # Use the default (group_key is NULL) project checklist so it stays consistent with existing behavior.
    checklist = (
        await db.execute(
            select(Checklist)
            .where(Checklist.project_id == project.id, Checklist.group_key.is_(None))
            .order_by(Checklist.created_at)
        )
    ).scalars().first()
    if checklist is None:
        checklist = Checklist(project_id=project.id, title="Checklist")
        db.add(checklist)
        await db.flush()

    for position, title in enumerate(GD_PROJECT_ACCEPTANCE_TEMPLATE):
        if title in existing_titles:
            continue
        db.add(
            ChecklistItem(
                checklist_id=checklist.id,
                item_type=ChecklistItemType.CHECKBOX,
                position=position,
                path=PROJECT_ACCEPTANCE_PATH,
                title=title,
                is_checked=False,
            )
        )

    await db.commit()


async def _ensure_gd_ga_dv_meeting_items(db: AsyncSession, project: Project) -> None:
    """
    Ensure the GD "Takim me GA/DV" checklist exists for a project.

    - Does NOT delete anything.
    - Idempotent: only inserts missing items.
    - Stores items with path = "ga/dv meeting" as requested.
    """
    if project.department_id is None:
        return

    dept = (
        await db.execute(select(Department).where(Department.id == project.department_id))
    ).scalar_one_or_none()
    if dept is None or dept.code != "GD":
        return

    existing_items = (
        await db.execute(
            select(ChecklistItem)
            .join(Checklist, ChecklistItem.checklist_id == Checklist.id)
            .where(
                Checklist.project_id == project.id,
                ChecklistItem.path == GA_DV_MEETING_PATH,
                ChecklistItem.item_type == ChecklistItemType.CHECKBOX,
            )
        )
    ).scalars().all()
    existing_titles = {i.title for i in existing_items if i.title}

    missing = [t for t in GD_GA_DV_MEETING_TEMPLATE if t not in existing_titles]
    if not missing:
        return

    checklist = (
        await db.execute(
            select(Checklist)
            .where(Checklist.project_id == project.id, Checklist.group_key.is_(None))
            .order_by(Checklist.created_at)
        )
    ).scalars().first()
    if checklist is None:
        checklist = Checklist(project_id=project.id, title="Checklist")
        db.add(checklist)
        await db.flush()

    for position, title in enumerate(GD_GA_DV_MEETING_TEMPLATE):
        if title in existing_titles:
            continue
        db.add(
            ChecklistItem(
                checklist_id=checklist.id,
                item_type=ChecklistItemType.CHECKBOX,
                position=position,
                path=GA_DV_MEETING_PATH,
                title=title,
                is_checked=False,
            )
        )

    await db.commit()


async def _ensure_gd_propozim_ko1_ko2_items(db: AsyncSession, project: Project) -> None:
    """
    Ensure the GD "PROPOZIM KO1/KO2" checklist exists for a project.

    - Does NOT delete anything.
    - Idempotent: only inserts missing items.
    - Stores items with path = "propozim ko1/ko2" as requested.
    """
    if project.department_id is None:
        return

    dept = (
        await db.execute(select(Department).where(Department.id == project.department_id))
    ).scalar_one_or_none()
    if dept is None or dept.code != "GD":
        return

    existing_items = (
        await db.execute(
            select(ChecklistItem)
            .join(Checklist, ChecklistItem.checklist_id == Checklist.id)
            .where(
                Checklist.project_id == project.id,
                ChecklistItem.path == PROPOZIM_KO1_KO2_PATH,
                ChecklistItem.item_type == ChecklistItemType.CHECKBOX,
            )
        )
    ).scalars().all()
    existing_titles = {i.title for i in existing_items if i.title}

    missing = [t for t in GD_PROPOZIM_KO1_KO2_TEMPLATE if t not in existing_titles]
    if not missing:
        return

    checklist = (
        await db.execute(
            select(Checklist)
            .where(Checklist.project_id == project.id, Checklist.group_key.is_(None))
            .order_by(Checklist.created_at)
        )
    ).scalars().first()
    if checklist is None:
        checklist = Checklist(project_id=project.id, title="Checklist")
        db.add(checklist)
        await db.flush()

    for position, title in enumerate(GD_PROPOZIM_KO1_KO2_TEMPLATE):
        if title in existing_titles:
            continue
        db.add(
            ChecklistItem(
                checklist_id=checklist.id,
                item_type=ChecklistItemType.CHECKBOX,
                position=position,
                path=PROPOZIM_KO1_KO2_PATH,
                title=title,
                is_checked=False,
            )
        )

    await db.commit()


async def _ensure_gd_punimi_items(db: AsyncSession, project: Project) -> None:
    """
    Ensure the GD "PUNIMI" checklist exists for a project.

    - Does NOT delete anything.
    - Idempotent: only inserts missing items.
    - Stores items with path = "punimi" as requested.
    """
    if project.department_id is None:
        return

    dept = (
        await db.execute(select(Department).where(Department.id == project.department_id))
    ).scalar_one_or_none()
    if dept is None or dept.code != "GD":
        return

    existing_items = (
        await db.execute(
            select(ChecklistItem)
            .join(Checklist, ChecklistItem.checklist_id == Checklist.id)
            .where(
                Checklist.project_id == project.id,
                ChecklistItem.path == PUNIMI_PATH,
                ChecklistItem.item_type == ChecklistItemType.CHECKBOX,
            )
        )
    ).scalars().all()
    existing_titles = {i.title for i in existing_items if i.title}

    missing = [t for t in GD_PUNIMI_TEMPLATE if t not in existing_titles]
    if not missing:
        return

    checklist = (
        await db.execute(
            select(Checklist)
            .where(Checklist.project_id == project.id, Checklist.group_key.is_(None))
            .order_by(Checklist.created_at)
        )
    ).scalars().first()
    if checklist is None:
        checklist = Checklist(project_id=project.id, title="Checklist")
        db.add(checklist)
        await db.flush()

    for position, title in enumerate(GD_PUNIMI_TEMPLATE):
        if title in existing_titles:
            continue
        db.add(
            ChecklistItem(
                checklist_id=checklist.id,
                item_type=ChecklistItemType.CHECKBOX,
                position=position,
                path=PUNIMI_PATH,
                title=title,
                is_checked=False,
            )
        )

    await db.commit()


async def _ensure_gd_control_ko1_ko2_items(db: AsyncSession, project: Project) -> None:
    """
    Ensure the GD "Përgatitja për dërgim KO1/KO2" checklist exists for a project.

    - Does NOT delete anything.
    - Idempotent: only inserts missing items.
    - Stores items with path = "control ko1/ko2" as requested.
    """
    if project.department_id is None:
        return

    dept = (
        await db.execute(select(Department).where(Department.id == project.department_id))
    ).scalar_one_or_none()
    if dept is None or dept.code != "GD":
        return

    existing_items = (
        await db.execute(
            select(ChecklistItem)
            .join(Checklist, ChecklistItem.checklist_id == Checklist.id)
            .where(
                Checklist.project_id == project.id,
                ChecklistItem.path == CONTROL_KO1_KO2_PATH,
                ChecklistItem.item_type == ChecklistItemType.CHECKBOX,
            )
        )
    ).scalars().all()
    existing_titles = {i.title for i in existing_items if i.title}

    missing = [t for t in GD_CONTROL_KO1_KO2_TEMPLATE if t not in existing_titles]
    if not missing:
        return

    checklist = (
        await db.execute(
            select(Checklist)
            .where(Checklist.project_id == project.id, Checklist.group_key.is_(None))
            .order_by(Checklist.created_at)
        )
    ).scalars().first()
    if checklist is None:
        checklist = Checklist(project_id=project.id, title="Checklist")
        db.add(checklist)
        await db.flush()

    for position, title in enumerate(GD_CONTROL_KO1_KO2_TEMPLATE):
        if title in existing_titles:
            continue
        db.add(
            ChecklistItem(
                checklist_id=checklist.id,
                item_type=ChecklistItemType.CHECKBOX,
                position=position,
                path=CONTROL_KO1_KO2_PATH,
                title=title,
                is_checked=False,
            )
        )

    await db.commit()


async def _ensure_gd_finalization_items(db: AsyncSession, project: Project) -> None:
    """
    Ensure the GD "Finalizimi" checklist exists for a project.

    - Does NOT delete anything.
    - Idempotent: only inserts missing items.
    - Stores items with path = "finalization" as requested.
    """
    if project.department_id is None:
        return

    dept = (
        await db.execute(select(Department).where(Department.id == project.department_id))
    ).scalar_one_or_none()
    if dept is None or dept.code != "GD":
        return

    existing_items = (
        await db.execute(
            select(ChecklistItem)
            .join(Checklist, ChecklistItem.checklist_id == Checklist.id)
            .where(
                Checklist.project_id == project.id,
                ChecklistItem.path == FINALIZATION_PATH,
                ChecklistItem.item_type == ChecklistItemType.CHECKBOX,
            )
        )
    ).scalars().all()
    existing_titles = {i.title for i in existing_items if i.title}

    missing = [t for t in GD_FINALIZATION_TEMPLATE if t not in existing_titles]
    if not missing:
        return

    checklist = (
        await db.execute(
            select(Checklist)
            .where(Checklist.project_id == project.id, Checklist.group_key.is_(None))
            .order_by(Checklist.created_at)
        )
    ).scalars().first()
    if checklist is None:
        checklist = Checklist(project_id=project.id, title="Checklist")
        db.add(checklist)
        await db.flush()

    for position, title in enumerate(GD_FINALIZATION_TEMPLATE):
        if title in existing_titles:
            continue
        db.add(
            ChecklistItem(
                checklist_id=checklist.id,
                item_type=ChecklistItemType.CHECKBOX,
                position=position,
                path=FINALIZATION_PATH,
                title=title,
                is_checked=False,
            )
        )

    await db.commit()


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
        day=item.day,
        owner=item.owner,
        time=item.time,
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

        # Auto-seed GD "Pranimi i Projektit" checklist (no deletes, only inserts missing items).
        await _ensure_gd_project_acceptance_items(db, project)
        # Auto-seed GD "Takim me GA/DV" checklist (no deletes, only inserts missing items).
        await _ensure_gd_ga_dv_meeting_items(db, project)
        # Auto-seed GD "PROPOZIM KO1/KO2" checklist (no deletes, only inserts missing items).
        await _ensure_gd_propozim_ko1_ko2_items(db, project)
        # Auto-seed GD "PUNIMI" checklist (no deletes, only inserts missing items).
        await _ensure_gd_punimi_items(db, project)
        # Auto-seed GD "Përgatitja për dërgim KO1/KO2" checklist (no deletes, only inserts missing items).
        await _ensure_gd_control_ko1_ko2_items(db, project)
        # Auto-seed GD "Finalizimi" checklist (no deletes, only inserts missing items).
        await _ensure_gd_finalization_items(db, project)

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
    group_key: str | None = None
    checklist_title: str | None = None
    item_type: ChecklistItemType | None = None
    position: int | None = None
    path: str | None = None
    keyword: str | None = None
    description: str | None = None
    category: str | None = None
    day: str | None = None
    owner: str | None = None
    time: str | None = None
    title: str | None = None
    content: str | None = None
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
    resolved_item_type = payload.item_type
    resolved_title = payload.title or payload.content
    if resolved_item_type is None and (resolved_title or payload.comment):
        resolved_item_type = ChecklistItemType.CHECKBOX
    if resolved_item_type is None:
        raise HTTPException(status_code=status.HTTP_400_BAD_REQUEST, detail="item_type is required")

    create_payload = ChecklistItemCreate(
        checklist_id=payload.checklist_id,
        item_type=resolved_item_type,
        position=payload.position,
        path=payload.path,
        keyword=payload.keyword,
        description=payload.description,
        category=payload.category,
        day=payload.day,
        owner=payload.owner,
        time=payload.time,
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

        if payload.group_key is not None:
            # Structured/grouped checklist (admin-managed template-style checklists)
            if user.role != "ADMIN":
                raise HTTPException(status_code=status.HTTP_403_FORBIDDEN, detail="Admin only")
            checklist = (
                await db.execute(
                    select(Checklist).where(
                        Checklist.project_id == payload.project_id,
                        Checklist.group_key == payload.group_key,
                    )
                )
            ).scalar_one_or_none()
            if checklist is None:
                checklist = Checklist(
                    project_id=payload.project_id,
                    title=payload.checklist_title or payload.group_key,
                    group_key=payload.group_key,
                )
                db.add(checklist)
                await db.flush()
        else:
            # Default checklist for ad-hoc items (avoid colliding with structured/grouped checklists)
            checklist = (
                await db.execute(
                    select(Checklist)
                    .where(Checklist.project_id == payload.project_id, Checklist.group_key.is_(None))
                    .order_by(Checklist.created_at)
                )
            ).scalars().first()
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
        # Global template-style checklists (group_key set, no project/task) are admin-only.
        # Exception: Internal meeting checklists allow department members to create items
        if checklist.project_id is None and checklist.task_id is None and checklist.group_key is not None:
            is_internal_meeting = checklist.group_key in ("development_internal_meetings", "pcm_internal_meetings")
            if is_internal_meeting:
                # Determine department from group_key
                if checklist.group_key == "development_internal_meetings":
                    dept_name = "Development"
                elif checklist.group_key == "pcm_internal_meetings":
                    dept_name = "Project Content Manager"
                else:
                    dept_name = None
                
                if dept_name:
                    dept = (await db.execute(select(Department).where(Department.name == dept_name))).scalar_one_or_none()
                    if dept:
                        ensure_department_access(user, dept.id)
                    else:
                        if user.role != "ADMIN":
                            raise HTTPException(status_code=status.HTTP_403_FORBIDDEN, detail="Admin only")
                else:
                    if user.role != "ADMIN":
                        raise HTTPException(status_code=status.HTTP_403_FORBIDDEN, detail="Admin only")
            else:
                if user.role != "ADMIN":
                    raise HTTPException(status_code=status.HTTP_403_FORBIDDEN, detail="Admin only")
        if checklist.project_id is not None:
            project = (
                await db.execute(select(Project).where(Project.id == checklist.project_id))
            ).scalar_one_or_none()
            if project and project.department_id is not None:
                ensure_department_access(user, project.department_id)

    if checklist is None:
        raise HTTPException(status_code=status.HTTP_400_BAD_REQUEST, detail="Checklist resolution failed")

    # Idempotency guard: prevent duplicate inserts when multiple clients/tabs seed the same template at the same time.
    # We treat an item as duplicate if it matches (checklist_id, item_type, path, day, title case-insensitively).
    if create_payload.item_type == ChecklistItemType.CHECKBOX and create_payload.title:
        normalized_title = create_payload.title.strip().lower()
        if normalized_title:
            existing = (
                await db.execute(
                    select(ChecklistItem)
                    .options(
                        selectinload(ChecklistItem.assignees).selectinload(ChecklistItemAssignee.user)
                    )
                    .where(
                        ChecklistItem.checklist_id == checklist.id,
                        ChecklistItem.item_type == ChecklistItemType.CHECKBOX,
                        ChecklistItem.path == create_payload.path,
                        ChecklistItem.day == create_payload.day,
                        ChecklistItem.title.isnot(None),
                        func.lower(func.trim(ChecklistItem.title)) == normalized_title,
                    )
                    .limit(1)
                )
            ).scalar_one_or_none()
            if existing is not None:
                return _item_to_out(existing)

    position = create_payload.position
    path_filter = (
        ChecklistItem.path.is_(None)
        if create_payload.path is None
        else ChecklistItem.path == create_payload.path
    )
    if position is None:
        max_position = (
            await db.execute(
                select(ChecklistItem.position)
                .where(ChecklistItem.checklist_id == checklist.id, path_filter)
                .order_by(ChecklistItem.position.desc())
            )
        ).scalars().first()
        position = (max_position + 1) if max_position is not None else 0
    else:
        # Insert by position: shift existing items down to keep numbering consistent.
        await db.execute(
            update(ChecklistItem)
            .where(
                ChecklistItem.checklist_id == checklist.id,
                path_filter,
                ChecklistItem.position >= position,
            )
            .values(position=ChecklistItem.position + 1)
        )

    item = ChecklistItem(
        checklist_id=checklist.id,
        item_type=create_payload.item_type,
        position=position,
        path=create_payload.path,
        keyword=create_payload.keyword,
        description=create_payload.description,
        category=create_payload.category,
        day=create_payload.day,
        owner=create_payload.owner,
        time=create_payload.time,
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
    item = (
        await db.execute(
            select(ChecklistItem)
            .options(selectinload(ChecklistItem.assignees).selectinload(ChecklistItemAssignee.user))
            .where(ChecklistItem.id == item.id)
        )
    ).scalar_one()

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
        # Global template-style checklists (group_key set, no project/task) are admin-only to edit.
        # Exception: Internal meeting checklists allow department members to update is_checked field
        if checklist and checklist.project_id is None and checklist.task_id is None and checklist.group_key is not None:
            is_internal_meeting = checklist.group_key in ("development_internal_meetings", "pcm_internal_meetings")
            # For internal meetings, allow department members to update is_checked, but require admin for other fields
            if is_internal_meeting:
                # Determine department from group_key
                if checklist.group_key == "development_internal_meetings":
                    dept_name = "Development"
                elif checklist.group_key == "pcm_internal_meetings":
                    dept_name = "Project Content Manager"
                else:
                    dept_name = None
                
                if dept_name:
                    dept = (await db.execute(select(Department).where(Department.name == dept_name))).scalar_one_or_none()
                    if dept:
                        ensure_department_access(user, dept.id)
                        # If only updating is_checked, allow it. Otherwise require admin for other fields.
                        if payload.is_checked is None and (payload.title is not None or payload.position is not None or payload.comment is not None or payload.item_type is not None):
                            if user.role != "ADMIN":
                                raise HTTPException(status_code=status.HTTP_403_FORBIDDEN, detail="Admin only for editing internal meeting items")
                    else:
                        if user.role != "ADMIN":
                            raise HTTPException(status_code=status.HTTP_403_FORBIDDEN, detail="Admin only")
                else:
                    if user.role != "ADMIN":
                        raise HTTPException(status_code=status.HTTP_403_FORBIDDEN, detail="Admin only")
            else:
                if user.role != "ADMIN":
                    raise HTTPException(status_code=status.HTTP_403_FORBIDDEN, detail="Admin only")
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
        new_pos = payload.position
        old_pos = item.position
        if new_pos != old_pos and item.checklist_id is not None:
            path_filter = (
                ChecklistItem.path.is_(None)
                if item.path is None
                else ChecklistItem.path == item.path
            )
            if new_pos > old_pos:
                # Moving down: pull intervening items up.
                await db.execute(
                    update(ChecklistItem)
                    .where(
                        ChecklistItem.checklist_id == item.checklist_id,
                        path_filter,
                        ChecklistItem.position > old_pos,
                        ChecklistItem.position <= new_pos,
                        ChecklistItem.id != item.id,
                    )
                    .values(position=ChecklistItem.position - 1)
                )
            else:
                # Moving up: push intervening items down.
                await db.execute(
                    update(ChecklistItem)
                    .where(
                        ChecklistItem.checklist_id == item.checklist_id,
                        path_filter,
                        ChecklistItem.position >= new_pos,
                        ChecklistItem.position < old_pos,
                        ChecklistItem.id != item.id,
                    )
                    .values(position=ChecklistItem.position + 1)
                )
            item.position = new_pos
    if payload.path is not None:
        item.path = payload.path
    if payload.keyword is not None:
        item.keyword = payload.keyword
    if payload.description is not None:
        item.description = payload.description
    if payload.category is not None:
        item.category = payload.category
    if payload.day is not None:
        item.day = payload.day
    if payload.owner is not None:
        item.owner = payload.owner
    if payload.time is not None:
        item.time = payload.time
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
    item = (
        await db.execute(
            select(ChecklistItem)
            .options(selectinload(ChecklistItem.assignees).selectinload(ChecklistItemAssignee.user))
            .where(ChecklistItem.id == item.id)
        )
    ).scalar_one()

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
        # Global template-style checklists (group_key set, no project/task) are admin-only to delete.
        if checklist and checklist.project_id is None and checklist.task_id is None and checklist.group_key is not None:
            if user.role != "ADMIN":
                raise HTTPException(status_code=status.HTTP_403_FORBIDDEN, detail="Admin only")
        if checklist and checklist.project_id is not None:
            project = (
                await db.execute(select(Project).where(Project.id == checklist.project_id))
            ).scalar_one_or_none()
            if project and project.department_id is not None:
                ensure_department_access(user, project.department_id)

    deleted_checklist_id = item.checklist_id
    deleted_position = item.position
    path_filter = (
        ChecklistItem.path.is_(None)
        if item.path is None
        else ChecklistItem.path == item.path
    )
    await db.delete(item)
    # Keep numbering contiguous.
    # Use retry mechanism to handle deadlocks from concurrent deletions
    if deleted_checklist_id is not None:
        max_retries = 3
        for attempt in range(max_retries):
            try:
                # Lock rows in consistent order (by position) to prevent deadlocks
                # First, select and lock the rows we need to update in order
                items_to_update = (
                    await db.execute(
                        select(ChecklistItem)
                        .where(
                            ChecklistItem.checklist_id == deleted_checklist_id,
                            path_filter,
                            ChecklistItem.position > deleted_position,
                        )
                        .order_by(ChecklistItem.position)
                        .with_for_update()
                    )
                ).scalars().all()
                
                # Update positions
                if items_to_update:
                    await db.execute(
                        update(ChecklistItem)
                        .where(
                            ChecklistItem.checklist_id == deleted_checklist_id,
                            path_filter,
                            ChecklistItem.position > deleted_position,
                        )
                        .values(position=ChecklistItem.position - 1)
                    )
                await db.commit()
                break
            except Exception as e:
                # Check if it's a deadlock error
                # SQLAlchemy wraps asyncpg exceptions, so we need to check both
                is_deadlock = False
                if hasattr(e, 'orig'):
                    # Check the underlying asyncpg exception
                    if isinstance(e.orig, asyncpg.exceptions.DeadlockDetectedError):
                        is_deadlock = True
                elif "deadlock" in str(e).lower():
                    # Fallback: check error message
                    is_deadlock = True
                
                if is_deadlock and attempt < max_retries - 1:
                    await db.rollback()
                    # Exponential backoff: wait longer on each retry
                    await asyncio.sleep(0.1 * (2 ** attempt))
                    continue
                else:
                    await db.rollback()
                    raise
    else:
        await db.commit()
    return {"ok": True}
