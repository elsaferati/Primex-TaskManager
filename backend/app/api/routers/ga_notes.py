from __future__ import annotations

import uuid

from fastapi import APIRouter, Depends, HTTPException, status
from sqlalchemy import select
from sqlalchemy.ext.asyncio import AsyncSession

from app.api.access import ensure_department_access
from app.api.deps import get_current_user
from app.db import get_db
from app.models.ga_note import GaNote
from app.models.project import Project
from app.schemas.ga_note import GaNoteOut


router = APIRouter()


@router.get("", response_model=list[GaNoteOut])
async def list_ga_notes(
    project_id: uuid.UUID,
    db: AsyncSession = Depends(get_db),
    user=Depends(get_current_user),
) -> list[GaNoteOut]:
    project = (await db.execute(select(Project).where(Project.id == project_id))).scalar_one_or_none()
    if project is None:
        raise HTTPException(status_code=status.HTTP_404_NOT_FOUND, detail="Project not found")
    if project.department_id is not None:
        ensure_department_access(user, project.department_id)

    notes = (
        await db.execute(select(GaNote).where(GaNote.project_id == project_id).order_by(GaNote.created_at))
    ).scalars().all()
    return [
        GaNoteOut(
            id=n.id,
            content=n.content,
            created_by=n.created_by,
            start_date=n.start_date,
            due_date=n.due_date,
            completed_at=n.completed_at,
            is_converted_to_task=n.is_converted_to_task,
            project_id=n.project_id,
            created_at=n.created_at,
            updated_at=n.updated_at,
        )
        for n in notes
    ]
