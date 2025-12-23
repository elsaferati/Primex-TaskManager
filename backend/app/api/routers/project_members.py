from __future__ import annotations

import uuid

from fastapi import APIRouter, Depends, HTTPException, status
from pydantic import BaseModel
from sqlalchemy import select
from sqlalchemy.ext.asyncio import AsyncSession

from app.api.access import ensure_department_access
from app.api.deps import get_current_user
from app.db import get_db
from app.models.project import Project
from app.models.project_member import ProjectMember
from app.models.user import User
from app.schemas.user import UserOut


router = APIRouter()


class ProjectMembersCreatePayload(BaseModel):
    project_id: uuid.UUID
    user_ids: list[uuid.UUID]


@router.get("", response_model=list[UserOut])
async def list_project_members(
    project_id: uuid.UUID,
    db: AsyncSession = Depends(get_db),
    user=Depends(get_current_user),
) -> list[UserOut]:
    project = (await db.execute(select(Project).where(Project.id == project_id))).scalar_one_or_none()
    if project is None:
        raise HTTPException(status_code=status.HTTP_404_NOT_FOUND, detail="Project not found")
    if project.department_id is not None:
        ensure_department_access(user, project.department_id)

    members = (
        await db.execute(
            select(User)
            .join(ProjectMember, ProjectMember.user_id == User.id)
            .where(ProjectMember.project_id == project_id)
            .order_by(User.full_name)
        )
    ).scalars().all()

    return [
        UserOut(
            id=u.id,
            email=u.email,
            username=u.username,
            full_name=u.full_name,
            role=u.role,
            department_id=u.department_id,
            is_active=u.is_active,
        )
        for u in members
    ]


@router.post("", response_model=list[UserOut], status_code=status.HTTP_201_CREATED)
async def add_project_members(
    payload: ProjectMembersCreatePayload,
    db: AsyncSession = Depends(get_db),
    user=Depends(get_current_user),
) -> list[UserOut]:
    project = (await db.execute(select(Project).where(Project.id == payload.project_id))).scalar_one_or_none()
    if project is None:
        raise HTTPException(status_code=status.HTTP_404_NOT_FOUND, detail="Project not found")
    if project.department_id is not None:
        ensure_department_access(user, project.department_id)

    if not payload.user_ids:
        raise HTTPException(status_code=status.HTTP_400_BAD_REQUEST, detail="user_ids required")

    rows = (await db.execute(select(User).where(User.id.in_(payload.user_ids)))).scalars().all()
    if len(rows) != len(set(payload.user_ids)):
        raise HTTPException(status_code=status.HTTP_400_BAD_REQUEST, detail="Invalid users")

    for u in rows:
        if project.department_id is not None and u.department_id != project.department_id:
            raise HTTPException(status_code=status.HTTP_400_BAD_REQUEST, detail="User must be in department")

    existing = (
        await db.execute(
            select(ProjectMember.user_id).where(ProjectMember.project_id == payload.project_id)
        )
    ).scalars().all()
    existing_set = set(existing)

    for u in rows:
        if u.id in existing_set:
            continue
        db.add(ProjectMember(project_id=payload.project_id, user_id=u.id))

    await db.commit()

    return [
        UserOut(
            id=u.id,
            email=u.email,
            username=u.username,
            full_name=u.full_name,
            role=u.role,
            department_id=u.department_id,
            is_active=u.is_active,
        )
        for u in rows
    ]
