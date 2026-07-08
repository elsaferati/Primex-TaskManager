import uuid
from datetime import date, time

from fastapi import APIRouter, Depends, HTTPException, status
from sqlalchemy import delete, func, select
from sqlalchemy.ext.asyncio import AsyncSession

from app.api.deps import get_current_user
from app.db import get_db
from app.models.enums import UserRole
from app.models.ga_time_table_row import GaTimeTableRow
from app.models.ga_time_slot_template import GaTimeSlotTemplate
from app.models.user import User
from app.schemas.ga_time_slot import (
    GaTimeSlotEntryIn,
    GaTimeSlotEntryOut,
    GaTimeSlotEntryUpdate,
    GaTimeTableRowOut,
    GaTimeTableRowsUpdate,
)
from app.services.ga_time_table import GaTimeTableRowData, format_ga_time_label, get_ga_time_table_rows


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


def _row_out(row: GaTimeTableRow | GaTimeTableRowData) -> GaTimeTableRowOut:
    return GaTimeTableRowOut(
        id=getattr(row, "id", None),
        sort_order=row.sort_order,
        nr_label=row.nr_label,
        label=row.label,
        start_time=row.start_time,
        end_time=row.end_time,
        is_special=row.is_special,
    )


@router.get("/rows", response_model=list[GaTimeTableRowOut])
async def list_ga_time_table_rows(
    db: AsyncSession = Depends(get_db),
    current_user: User = Depends(get_current_user),
) -> list[GaTimeTableRowOut]:
    rows = await get_ga_time_table_rows(db)
    return [_row_out(row) for row in rows]


@router.put("/rows", response_model=list[GaTimeTableRowOut])
async def update_ga_time_table_rows(
    payload: GaTimeTableRowsUpdate,
    db: AsyncSession = Depends(get_db),
    current_user: User = Depends(get_current_user),
) -> list[GaTimeTableRowOut]:
    _ensure_can_edit(current_user)
    visible_rows = sorted(payload.rows, key=lambda row: row.start_time)
    if not visible_rows:
        raise HTTPException(status_code=status.HTTP_422_UNPROCESSABLE_ENTITY, detail="At least one row is required")
    for idx, row in enumerate(visible_rows):
        if row.start_time >= row.end_time:
            raise HTTPException(status_code=status.HTTP_422_UNPROCESSABLE_ENTITY, detail="End time must be after start time")
        if idx > 0 and visible_rows[idx - 1].end_time > row.start_time:
            raise HTTPException(status_code=status.HTTP_422_UNPROCESSABLE_ENTITY, detail="Rows cannot overlap")

    await db.execute(delete(GaTimeTableRow))
    rows: list[GaTimeTableRow] = [
        GaTimeTableRow(
            sort_order=0,
            nr_label="",
            label="",
            start_time=time(0, 0),
            end_time=time(0, 1),
            is_special=True,
        ),
        GaTimeTableRow(
            sort_order=1,
            nr_label="",
            label="",
            start_time=time(0, 1),
            end_time=time(0, 2),
            is_special=True,
        ),
    ]
    for idx, row in enumerate(visible_rows, start=1):
        rows.append(
            GaTimeTableRow(
                sort_order=idx + 1,
                nr_label=str(idx),
                label=format_ga_time_label(row.start_time, row.end_time),
                start_time=row.start_time,
                end_time=row.end_time,
                is_special=False,
            )
        )
    db.add_all(rows)
    await db.commit()
    for row in rows:
        await db.refresh(row)
    return [_row_out(row) for row in rows]


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
