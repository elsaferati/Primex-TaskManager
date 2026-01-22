from __future__ import annotations

import uuid
from datetime import date, datetime, timezone

from fastapi import APIRouter, Depends, HTTPException, status
from pydantic import BaseModel, Field
from sqlalchemy import select
from sqlalchemy.ext.asyncio import AsyncSession

from app.api.deps import get_current_user
from app.db import get_db
from app.models.enums import UserRole
from app.models.system_task_occurrence import SystemTaskOccurrence
from app.models.system_task_template import SystemTaskTemplate
from app.services.system_task_occurrences import DONE, NOT_DONE, OPEN, SKIPPED, ensure_occurrences_in_range


router = APIRouter()


class SystemTaskOccurrenceUpdate(BaseModel):
    template_id: uuid.UUID
    occurrence_date: date
    status: str = Field(..., description="OPEN | DONE | NOT_DONE | SKIPPED")
    comment: str | None = None


@router.post("/occurrences", status_code=status.HTTP_200_OK)
async def set_system_task_occurrence_status(
    payload: SystemTaskOccurrenceUpdate,
    db: AsyncSession = Depends(get_db),
    user=Depends(get_current_user),
) -> dict:
    allowed = {OPEN, DONE, NOT_DONE, SKIPPED}
    if payload.status not in allowed:
        raise HTTPException(status_code=status.HTTP_400_BAD_REQUEST, detail="Invalid status")

    tmpl = (
        await db.execute(select(SystemTaskTemplate).where(SystemTaskTemplate.id == payload.template_id))
    ).scalar_one_or_none()
    if tmpl is None:
        raise HTTPException(status_code=status.HTTP_404_NOT_FOUND, detail="Template not found")

    # Minimal permissions: user can update their own occurrence; admins/managers can also do it.
    if user.role not in (UserRole.ADMIN, UserRole.MANAGER, UserRole.STAFF):
        raise HTTPException(status_code=status.HTTP_403_FORBIDDEN, detail="Forbidden")

    # Ensure the occurrence row exists (idempotent).
    await ensure_occurrences_in_range(db=db, start=payload.occurrence_date, end=payload.occurrence_date, template_ids=[tmpl.id])

    occ = (
        await db.execute(
            select(SystemTaskOccurrence)
            .where(SystemTaskOccurrence.template_id == tmpl.id)
            .where(SystemTaskOccurrence.user_id == user.id)
            .where(SystemTaskOccurrence.occurrence_date == payload.occurrence_date)
        )
    ).scalar_one_or_none()
    if occ is None:
        # Not assigned to user, or template has no assignee mapping.
        raise HTTPException(status_code=status.HTTP_400_BAD_REQUEST, detail="Occurrence not available for this user")

    now = datetime.now(timezone.utc)
    occ.status = payload.status
    occ.comment = payload.comment
    occ.acted_at = None if payload.status == OPEN else now

    await db.commit()
    return {"ok": True}

