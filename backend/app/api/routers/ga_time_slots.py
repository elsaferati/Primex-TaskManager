import uuid
from datetime import date, time

from fastapi import APIRouter, Depends, HTTPException, status
from sqlalchemy import delete, func, select, update
from sqlalchemy.ext.asyncio import AsyncSession

from app.api.deps import get_current_user
from app.db import get_db
from app.models.enums import UserRole
from app.models.ga_time_table_row import GaTimeTableRow
from app.models.ga_time_slot_template import GaTimeSlotTemplate
from app.models.user import User
from app.schemas.ga_time_slot import (
    GaTimeSlotEntriesReorder,
    GaTimeSlotEntryIn,
    GaTimeSlotEntryOut,
    GaTimeSlotEntryUpdate,
    GaTimeTableRowComment,
    GaTimeTableRowCommentUpdate,
    GaTimeTableRowCommentsUpdate,
    GaTimeTableRowIn,
    GaTimeTableRowOut,
    GaTimeTableRowsUpdate,
)
from app.services.ga_time_table import (
    DEFAULT_GA_TIME_TABLE_ROWS,
    GaTimeTableRowData,
    format_ga_time_label,
    get_ga_time_table_rows,
)


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
    comments: list[GaTimeTableRowComment] = []
    end_comments: list[GaTimeTableRowComment] = []
    for raw_comment in getattr(row, "comments", None) or []:
        try:
            parsed_comment = GaTimeTableRowComment.model_validate(raw_comment)
            if parsed_comment.column == "end":
                end_comments.append(parsed_comment)
            else:
                comments.append(parsed_comment)
        except (TypeError, ValueError):
            continue
    legacy_comment = (getattr(row, "comment", "") or "").strip()
    if not comments and legacy_comment:
        legacy_key = getattr(row, "id", None) or f"{row.start_time}-{row.end_time}"
        comments.append(
            GaTimeTableRowComment(
                id=f"legacy-{legacy_key}",
                content=legacy_comment,
                comment_background_color=getattr(row, "comment_background_color", "#FFFFFF") or "#FFFFFF",
                comment_text_color=getattr(row, "comment_text_color", "#0F172A") or "#0F172A",
                comment_is_bold=bool(getattr(row, "comment_is_bold", False)),
                comment_is_italic=bool(getattr(row, "comment_is_italic", False)),
            )
        )
    return GaTimeTableRowOut(
        id=getattr(row, "id", None),
        sort_order=row.sort_order,
        nr_label=row.nr_label,
        label=row.label,
        start_time=row.start_time,
        end_time=row.end_time,
        is_special=row.is_special,
        comment=getattr(row, "comment", "") or "",
        comment_background_color=getattr(row, "comment_background_color", "#FFFFFF") or "#FFFFFF",
        comment_text_color=getattr(row, "comment_text_color", "#0F172A") or "#0F172A",
        comment_is_bold=bool(getattr(row, "comment_is_bold", False)),
        comment_is_italic=bool(getattr(row, "comment_is_italic", False)),
        comments=comments,
        end_comments=end_comments,
    )


def _entry_out(entry: GaTimeSlotTemplate) -> GaTimeSlotEntryOut:
    return GaTimeSlotEntryOut(
        id=entry.id,
        user_id=entry.user_id,
        day_of_week=entry.day_of_week,
        start_time=entry.start_time,
        end_time=entry.end_time,
        content=entry.content,
        sort_order=entry.sort_order,
        background_color=entry.background_color,
        text_color=entry.text_color,
        is_bold=entry.is_bold,
        is_italic=entry.is_italic,
        created_at=entry.created_at,
        updated_at=entry.updated_at,
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

    existing_rows = (
        await db.execute(select(GaTimeTableRow))
    ).scalars().all()
    existing_comments = {
        (row.start_time, row.end_time, row.is_special): {
            "comment": row.comment or "",
            "comment_background_color": row.comment_background_color or "#FFFFFF",
            "comment_text_color": row.comment_text_color or "#0F172A",
            "comment_is_bold": bool(row.comment_is_bold),
            "comment_is_italic": bool(row.comment_is_italic),
            "comments": list(row.comments or []),
        }
        for row in existing_rows
    }
    await db.execute(delete(GaTimeTableRow))
    rows: list[GaTimeTableRow] = [
        GaTimeTableRow(
            sort_order=0,
            nr_label="",
            label="",
            start_time=time(0, 0),
            end_time=time(0, 1),
            is_special=True,
            **existing_comments.get((time(0, 0), time(0, 1), True), {}),
        ),
        GaTimeTableRow(
            sort_order=1,
            nr_label="",
            label="",
            start_time=time(0, 1),
            end_time=time(0, 2),
            is_special=True,
            **existing_comments.get((time(0, 1), time(0, 2), True), {}),
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
                **existing_comments.get(
                    (row.start_time, row.end_time, False),
                    {
                        "comment": row.comment.strip(),
                        "comment_background_color": row.comment_background_color,
                        "comment_text_color": row.comment_text_color,
                        "comment_is_bold": row.comment_is_bold,
                        "comment_is_italic": row.comment_is_italic,
                    },
                ),
            )
        )
    db.add_all(rows)
    await db.commit()
    for row in rows:
        await db.refresh(row)
    return [_row_out(row) for row in rows]


@router.post("/rows", response_model=list[GaTimeTableRowOut], status_code=status.HTTP_201_CREATED)
async def create_ga_time_table_row(
    payload: GaTimeTableRowIn,
    db: AsyncSession = Depends(get_db),
    current_user: User = Depends(get_current_user),
) -> list[GaTimeTableRowOut]:
    _ensure_can_edit(current_user)
    if payload.start_time >= payload.end_time:
        raise HTTPException(
            status_code=status.HTTP_422_UNPROCESSABLE_ENTITY,
            detail="End time must be after start time",
        )

    stored_rows = (
        await db.execute(
            select(GaTimeTableRow)
            .order_by(GaTimeTableRow.sort_order, GaTimeTableRow.start_time)
            .with_for_update()
        )
    ).scalars().all()

    if not stored_rows:
        stored_rows = [
            GaTimeTableRow(
                sort_order=row.sort_order,
                nr_label=row.nr_label,
                label=row.label,
                start_time=row.start_time,
                end_time=row.end_time,
                is_special=row.is_special,
                comment=row.comment,
                comment_background_color=row.comment_background_color,
                comment_text_color=row.comment_text_color,
                comment_is_bold=row.comment_is_bold,
                comment_is_italic=row.comment_is_italic,
            )
            for row in DEFAULT_GA_TIME_TABLE_ROWS
        ]
        db.add_all(stored_rows)
        await db.flush()

    visible_rows = [row for row in stored_rows if not row.is_special]
    overlapping_rows = [
        existing
        for existing in visible_rows
        if existing.start_time < payload.end_time and payload.start_time < existing.end_time
    ]

    if overlapping_rows:
        containing_row = overlapping_rows[0] if len(overlapping_rows) == 1 else None
        if (
            containing_row is None
            or payload.start_time < containing_row.start_time
            or payload.end_time > containing_row.end_time
        ):
            raise HTTPException(
                status_code=status.HTTP_422_UNPROCESSABLE_ENTITY,
                detail="Rows cannot partially overlap",
            )
        if (
            payload.start_time == containing_row.start_time
            and payload.end_time == containing_row.end_time
        ):
            raise HTTPException(
                status_code=status.HTTP_409_CONFLICT,
                detail="This time row already exists",
            )

        original_start = containing_row.start_time
        original_end = containing_row.end_time
        containing_row.start_time = payload.start_time
        containing_row.end_time = payload.end_time

        split_rows: list[GaTimeTableRow] = []
        if original_start < payload.start_time:
            split_rows.append(
                GaTimeTableRow(
                    sort_order=0,
                    nr_label="",
                    label=format_ga_time_label(original_start, payload.start_time),
                    start_time=original_start,
                    end_time=payload.start_time,
                    is_special=False,
                )
            )
        if payload.end_time < original_end:
            split_rows.append(
                GaTimeTableRow(
                    sort_order=0,
                    nr_label="",
                    label=format_ga_time_label(payload.end_time, original_end),
                    start_time=payload.end_time,
                    end_time=original_end,
                    is_special=False,
                )
            )
        db.add_all(split_rows)
        visible_rows.extend(split_rows)

        # Entries previously attached to the larger row stay with the segment
        # explicitly selected by the user. The newly created remainder is empty.
        ga_user = await _resolve_ga_user(db)
        if ga_user is not None:
            await db.execute(
                update(GaTimeSlotTemplate)
                .where(
                    GaTimeSlotTemplate.user_id == ga_user.id,
                    GaTimeSlotTemplate.start_time == original_start,
                    GaTimeSlotTemplate.end_time == original_end,
                )
                .values(start_time=payload.start_time, end_time=payload.end_time)
            )
    else:
        new_row = GaTimeTableRow(
            sort_order=len(visible_rows) + 2,
            nr_label="",
            label=format_ga_time_label(payload.start_time, payload.end_time),
            start_time=payload.start_time,
            end_time=payload.end_time,
            is_special=False,
            comment=payload.comment.strip(),
            comment_background_color=payload.comment_background_color,
            comment_text_color=payload.comment_text_color,
            comment_is_bold=payload.comment_is_bold,
            comment_is_italic=payload.comment_is_italic,
        )
        db.add(new_row)
        visible_rows.append(new_row)
    visible_rows.sort(key=lambda row: (row.start_time, row.end_time))
    for idx, row in enumerate(visible_rows, start=1):
        row.sort_order = idx + 1
        row.nr_label = str(idx)
        row.label = format_ga_time_label(row.start_time, row.end_time)

    await db.commit()
    rows = await get_ga_time_table_rows(db)
    return [_row_out(row) for row in rows]


@router.patch("/rows/comment", response_model=GaTimeTableRowOut)
async def update_ga_time_table_row_comment(
    payload: GaTimeTableRowCommentUpdate,
    db: AsyncSession = Depends(get_db),
    current_user: User = Depends(get_current_user),
) -> GaTimeTableRowOut:
    _ensure_can_edit(current_user)
    rows = (
        await db.execute(
            select(GaTimeTableRow)
            .order_by(GaTimeTableRow.sort_order, GaTimeTableRow.start_time)
            .with_for_update()
        )
    ).scalars().all()
    if not rows:
        rows = [
            GaTimeTableRow(
                sort_order=row.sort_order,
                nr_label=row.nr_label,
                label=row.label,
                start_time=row.start_time,
                end_time=row.end_time,
                is_special=row.is_special,
                comment=row.comment,
                comment_background_color=row.comment_background_color,
                comment_text_color=row.comment_text_color,
                comment_is_bold=row.comment_is_bold,
                comment_is_italic=row.comment_is_italic,
            )
            for row in DEFAULT_GA_TIME_TABLE_ROWS
        ]
        db.add_all(rows)
        await db.flush()

    target = next(
        (
            row for row in rows
            if row.start_time == payload.start_time and row.end_time == payload.end_time
        ),
        None,
    )
    if target is None:
        raise HTTPException(status_code=status.HTTP_404_NOT_FOUND, detail="Time row not found")
    target.comment = payload.comment.strip()
    target.comment_background_color = payload.comment_background_color
    target.comment_text_color = payload.comment_text_color
    target.comment_is_bold = payload.comment_is_bold
    target.comment_is_italic = payload.comment_is_italic
    end_comments = [
        raw_comment
        for raw_comment in (target.comments or [])
        if isinstance(raw_comment, dict) and raw_comment.get("column") == "end"
    ]
    start_comments = (
        [
            {
                "id": f"legacy-{target.id}",
                "content": target.comment,
                "column": "start",
                "comment_background_color": target.comment_background_color,
                "comment_text_color": target.comment_text_color,
                "comment_is_bold": target.comment_is_bold,
                "comment_is_italic": target.comment_is_italic,
            }
        ]
        if target.comment
        else []
    )
    target.comments = [*end_comments, *start_comments]
    await db.commit()
    await db.refresh(target)
    return _row_out(target)


@router.put("/rows/comments", response_model=GaTimeTableRowOut)
async def update_ga_time_table_row_comments(
    payload: GaTimeTableRowCommentsUpdate,
    db: AsyncSession = Depends(get_db),
    current_user: User = Depends(get_current_user),
) -> GaTimeTableRowOut:
    _ensure_can_edit(current_user)
    rows = (
        await db.execute(
            select(GaTimeTableRow)
            .order_by(GaTimeTableRow.sort_order, GaTimeTableRow.start_time)
            .with_for_update()
        )
    ).scalars().all()
    if not rows:
        rows = [
            GaTimeTableRow(
                sort_order=row.sort_order,
                nr_label=row.nr_label,
                label=row.label,
                start_time=row.start_time,
                end_time=row.end_time,
                is_special=row.is_special,
                comment=row.comment,
                comment_background_color=row.comment_background_color,
                comment_text_color=row.comment_text_color,
                comment_is_bold=row.comment_is_bold,
                comment_is_italic=row.comment_is_italic,
            )
            for row in DEFAULT_GA_TIME_TABLE_ROWS
        ]
        db.add_all(rows)
        await db.flush()

    target = next(
        (
            row for row in rows
            if row.start_time == payload.start_time and row.end_time == payload.end_time
        ),
        None,
    )
    if target is None:
        raise HTTPException(status_code=status.HTTP_404_NOT_FOUND, detail="Time row not found")

    existing_other_column_comments = [
        raw_comment
        for raw_comment in (target.comments or [])
        if isinstance(raw_comment, dict)
        and raw_comment.get("column", "start") != payload.column
    ]
    serialized_comments = [
        {**comment.model_dump(mode="json"), "column": payload.column}
        for comment in payload.comments
    ]
    target.comments = [*existing_other_column_comments, *serialized_comments]
    if payload.column == "start":
        target.comment = "\n".join(comment.content.strip() for comment in payload.comments)
        if payload.comments:
            first = payload.comments[0]
            target.comment_background_color = first.comment_background_color
            target.comment_text_color = first.comment_text_color
            target.comment_is_bold = first.comment_is_bold
            target.comment_is_italic = first.comment_is_italic
        else:
            target.comment_background_color = "#FFFFFF"
            target.comment_text_color = "#0F172A"
            target.comment_is_bold = False
            target.comment_is_italic = False

    await db.commit()
    await db.refresh(target)
    return _row_out(target)


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
            .order_by(
                GaTimeSlotTemplate.day_of_week,
                GaTimeSlotTemplate.start_time,
                GaTimeSlotTemplate.sort_order,
                GaTimeSlotTemplate.created_at,
            )
        )
    ).scalars().all()
    return [_entry_out(row) for row in rows]


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
        sort_order=payload.sort_order,
        content=content,
        background_color=payload.background_color,
        text_color=payload.text_color,
        is_bold=payload.is_bold,
        is_italic=payload.is_italic,
    )
    db.add(entry)
    await db.commit()
    await db.refresh(entry)
    return _entry_out(entry)


@router.put("/reorder", response_model=list[GaTimeSlotEntryOut])
async def reorder_ga_time_slots(
    payload: GaTimeSlotEntriesReorder,
    db: AsyncSession = Depends(get_db),
    current_user: User = Depends(get_current_user),
) -> list[GaTimeSlotEntryOut]:
    _ensure_can_edit(current_user)
    ga_user = await _resolve_ga_user(db)
    if ga_user is None:
        raise HTTPException(status_code=status.HTTP_404_NOT_FOUND, detail="GA user not found")

    entry_ids = [item.id for item in payload.entries]
    if len(entry_ids) != len(set(entry_ids)):
        raise HTTPException(status_code=status.HTTP_422_UNPROCESSABLE_ENTITY, detail="Duplicate entry ids")

    entries = (
        await db.execute(
            select(GaTimeSlotTemplate).where(
                GaTimeSlotTemplate.id.in_(entry_ids),
                GaTimeSlotTemplate.user_id == ga_user.id,
            )
        )
    ).scalars().all()
    entries_by_id = {entry.id: entry for entry in entries}
    if len(entries_by_id) != len(entry_ids):
        raise HTTPException(status_code=status.HTTP_404_NOT_FOUND, detail="One or more entries were not found")

    for item in payload.entries:
        entry = entries_by_id[item.id]
        entry.day_of_week = item.day_of_week
        entry.start_time = item.start_time
        entry.end_time = item.end_time
        entry.sort_order = item.sort_order

    await db.commit()
    for entry in entries:
        await db.refresh(entry)
    return [_entry_out(entries_by_id[item.id]) for item in payload.entries]


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
    if payload.background_color is not None:
        entry.background_color = payload.background_color
    if payload.text_color is not None:
        entry.text_color = payload.text_color
    if payload.is_bold is not None:
        entry.is_bold = payload.is_bold
    if payload.is_italic is not None:
        entry.is_italic = payload.is_italic
    await db.commit()
    await db.refresh(entry)
    return _entry_out(entry)


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
