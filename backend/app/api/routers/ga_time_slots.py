import uuid
from datetime import date

from fastapi import APIRouter, Depends, HTTPException, status
from sqlalchemy import func, select
from sqlalchemy.ext.asyncio import AsyncSession

from app.api.deps import get_current_user
from app.db import get_db
from app.models.enums import UserRole
from app.models.ga_time_slot_template import GaTimeSlotTemplate
from app.models.user import User
from app.schemas.ga_time_slot import GaTimeSlotEntryIn, GaTimeSlotEntryOut, GaTimeSlotEntryUpdate


router = APIRouter()

GA_USERNAME = "gane.arifaj"
GA_EMAIL = "ga@primexeu.com"


async def _resolve_ga_user(db: AsyncSession) -> User | None:
    stmt = select(User).where(
        func.lower(User.username) == GA_USERNAME,
    )
    ga_user = (await db.execute(stmt)).scalar_one_or_none()
    if ga_user:
        return ga_user
    stmt = select(User).where(func.lower(User.email) == GA_EMAIL)
    return (await db.execute(stmt)).scalar_one_or_none()


def _ensure_can_edit(current_user: User) -> None:
    if current_user.role == UserRole.ADMIN:
        return
    if (current_user.username or "").lower() == GA_USERNAME:
        return
    raise HTTPException(status_code=status.HTTP_403_FORBIDDEN, detail="Not authorized")


@router.get("", response_model=list[GaTimeSlotEntryOut])
async def list_ga_time_slots(
    week_start: date,
    db: AsyncSession = Depends(get_db),
    current_user: User = Depends(get_current_user),
) -> list[GaTimeSlotEntryOut]:
    ga_user = await _resolve_ga_user(db)
    if ga_user is None:
        return []
    rows = (
        await db.execute(
            select(GaTimeSlotTemplate)
            .where(GaTimeSlotTemplate.user_id == ga_user.id)
            .order_by(GaTimeSlotTemplate.day_of_week, GaTimeSlotTemplate.start_time, GaTimeSlotTemplate.created_at)
        )
    ).scalars().all()
    return [
        GaTimeSlotEntryOut(
            id=row.id,
            user_id=row.user_id,
            day_of_week=row.day_of_week,
            start_time=row.start_time,
            end_time=row.end_time,
            content=row.content,
            created_at=row.created_at,
            updated_at=row.updated_at,
        )
        for row in rows
    ]


@router.post("", response_model=GaTimeSlotEntryOut)
async def create_ga_time_slot(
    payload: GaTimeSlotEntryIn,
    db: AsyncSession = Depends(get_db),
    current_user: User = Depends(get_current_user),
) -> GaTimeSlotEntryOut:
    _ensure_can_edit(current_user)
    ga_user = await _resolve_ga_user(db)
    if ga_user is None:
        raise HTTPException(status_code=status.HTTP_404_NOT_FOUND, detail="GA user not found")
    content = (payload.content or "").strip()
    if not content:
        raise HTTPException(status_code=status.HTTP_422_UNPROCESSABLE_ENTITY, detail="Content is required")
    if payload.day_of_week < 0 or payload.day_of_week > 6:
        raise HTTPException(status_code=status.HTTP_422_UNPROCESSABLE_ENTITY, detail="Invalid day_of_week")
    entry = GaTimeSlotTemplate(
        user_id=ga_user.id,
        day_of_week=payload.day_of_week,
        start_time=payload.start_time,
        end_time=payload.end_time,
        content=content,
    )
    db.add(entry)
    await db.commit()
    await db.refresh(entry)
    return GaTimeSlotEntryOut(
        id=entry.id,
        user_id=entry.user_id,
        day_of_week=entry.day_of_week,
        start_time=entry.start_time,
        end_time=entry.end_time,
        content=entry.content,
        created_at=entry.created_at,
        updated_at=entry.updated_at,
    )


@router.patch("/{entry_id}", response_model=GaTimeSlotEntryOut)
async def update_ga_time_slot(
    entry_id: uuid.UUID,
    payload: GaTimeSlotEntryUpdate,
    db: AsyncSession = Depends(get_db),
    current_user: User = Depends(get_current_user),
) -> GaTimeSlotEntryOut:
    _ensure_can_edit(current_user)
    entry = (
        await db.execute(select(GaTimeSlotTemplate).where(GaTimeSlotTemplate.id == entry_id))
    ).scalar_one_or_none()
    if entry is None:
        raise HTTPException(status_code=status.HTTP_404_NOT_FOUND, detail="Entry not found")
    ga_user = await _resolve_ga_user(db)
    if ga_user is None or entry.user_id != ga_user.id:
        raise HTTPException(status_code=status.HTTP_403_FORBIDDEN, detail="Not authorized")
    content = (payload.content or "").strip()
    if not content:
        raise HTTPException(status_code=status.HTTP_422_UNPROCESSABLE_ENTITY, detail="Content is required")
    entry.content = content
    await db.commit()
    await db.refresh(entry)
    return GaTimeSlotEntryOut(
        id=entry.id,
        user_id=entry.user_id,
        day_of_week=entry.day_of_week,
        start_time=entry.start_time,
        end_time=entry.end_time,
        content=entry.content,
        created_at=entry.created_at,
        updated_at=entry.updated_at,
    )


@router.delete("/{entry_id}")
async def delete_ga_time_slot(
    entry_id: uuid.UUID,
    db: AsyncSession = Depends(get_db),
    current_user: User = Depends(get_current_user),
) -> dict[str, str]:
    _ensure_can_edit(current_user)
    entry = (
        await db.execute(select(GaTimeSlotTemplate).where(GaTimeSlotTemplate.id == entry_id))
    ).scalar_one_or_none()
    if entry is None:
        raise HTTPException(status_code=status.HTTP_404_NOT_FOUND, detail="Entry not found")
    ga_user = await _resolve_ga_user(db)
    if ga_user is None or entry.user_id != ga_user.id:
        raise HTTPException(status_code=status.HTTP_403_FORBIDDEN, detail="Not authorized")
    await db.delete(entry)
    await db.commit()
    return {"status": "ok"}
