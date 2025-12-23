from __future__ import annotations

import uuid

from fastapi import APIRouter, Depends, HTTPException, status
from sqlalchemy import select
from sqlalchemy.ext.asyncio import AsyncSession

from app.api.access import ensure_department_access
from app.api.deps import get_current_user
from app.db import get_db
from app.models.project import Project
from app.models.project_prompt import ProjectPrompt
from app.schemas.project_prompt import ProjectPromptOut


router = APIRouter()


@router.get("", response_model=list[ProjectPromptOut])
async def list_project_prompts(
    project_id: uuid.UUID,
    db: AsyncSession = Depends(get_db),
    user=Depends(get_current_user),
) -> list[ProjectPromptOut]:
    project = (await db.execute(select(Project).where(Project.id == project_id))).scalar_one_or_none()
    if project is None:
        raise HTTPException(status_code=status.HTTP_404_NOT_FOUND, detail="Project not found")
    if project.department_id is not None:
        ensure_department_access(user, project.department_id)

    prompts = (
        await db.execute(
            select(ProjectPrompt).where(ProjectPrompt.project_id == project_id).order_by(ProjectPrompt.created_at)
        )
    ).scalars().all()
    return [
        ProjectPromptOut(
            id=p.id,
            project_id=p.project_id,
            type=p.type,
            content=p.content,
            created_at=p.created_at,
        )
        for p in prompts
    ]
