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
from app.schemas.project_prompt import ProjectPromptCreate, ProjectPromptOut, ProjectPromptUpdate


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


@router.post("", response_model=ProjectPromptOut, status_code=status.HTTP_201_CREATED)
async def create_project_prompt(
    payload: ProjectPromptCreate,
    db: AsyncSession = Depends(get_db),
    user=Depends(get_current_user),
) -> ProjectPromptOut:
    project = (await db.execute(select(Project).where(Project.id == payload.project_id))).scalar_one_or_none()
    if project is None:
        raise HTTPException(status_code=status.HTTP_404_NOT_FOUND, detail="Project not found")
    if project.department_id is not None:
        ensure_department_access(user, project.department_id)

    prompt = ProjectPrompt(
        project_id=payload.project_id,
        type=payload.type,
        content=payload.content,
    )
    db.add(prompt)
    await db.commit()
    await db.refresh(prompt)
    return ProjectPromptOut(
        id=prompt.id,
        project_id=prompt.project_id,
        type=prompt.type,
        content=prompt.content,
        created_at=prompt.created_at,
    )


@router.patch("/{prompt_id}", response_model=ProjectPromptOut)
async def update_project_prompt(
    prompt_id: uuid.UUID,
    payload: ProjectPromptUpdate,
    db: AsyncSession = Depends(get_db),
    user=Depends(get_current_user),
) -> ProjectPromptOut:
    prompt = (await db.execute(select(ProjectPrompt).where(ProjectPrompt.id == prompt_id))).scalar_one_or_none()
    if prompt is None:
        raise HTTPException(status_code=status.HTTP_404_NOT_FOUND, detail="Prompt not found")
    project = (await db.execute(select(Project).where(Project.id == prompt.project_id))).scalar_one_or_none()
    if project and project.department_id is not None:
        ensure_department_access(user, project.department_id)

    prompt.content = payload.content
    await db.commit()
    await db.refresh(prompt)
    return ProjectPromptOut(
        id=prompt.id,
        project_id=prompt.project_id,
        type=prompt.type,
        content=prompt.content,
        created_at=prompt.created_at,
    )
