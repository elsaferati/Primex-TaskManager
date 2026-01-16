from __future__ import annotations

import uuid

from fastapi import APIRouter, Depends, HTTPException, status
from sqlalchemy import select
from sqlalchemy.ext.asyncio import AsyncSession

from app.api.access import ensure_department_access, ensure_manager_or_admin
from app.api.deps import get_current_user
from app.db import get_db
from app.models.meeting import Meeting
from app.models.project import Project
from app.schemas.meeting import MeetingCreate, MeetingOut, MeetingUpdate


router = APIRouter()


@router.get("", response_model=list[MeetingOut])
async def list_meetings(
    department_id: uuid.UUID | None = None,
    project_id: uuid.UUID | None = None,
    include_all_departments: bool = False,
    db: AsyncSession = Depends(get_db),
    user=Depends(get_current_user),
) -> list[MeetingOut]:
    stmt = select(Meeting)
    if department_id is None and project_id is None:
        if include_all_departments:
            ensure_manager_or_admin(user)
        else:
            raise HTTPException(status_code=status.HTTP_400_BAD_REQUEST, detail="department_id or project_id required")
    elif include_all_departments:
        ensure_manager_or_admin(user)
    if project_id is not None:
        project = (await db.execute(select(Project).where(Project.id == project_id))).scalar_one_or_none()
        if project is None:
            raise HTTPException(status_code=status.HTTP_404_NOT_FOUND, detail="Project not found")
        stmt = stmt.where(Meeting.project_id == project_id)
    if department_id is not None:
        if not include_all_departments:
            ensure_department_access(user, department_id)
        stmt = stmt.where(Meeting.department_id == department_id)

    meetings = (await db.execute(stmt.order_by(Meeting.starts_at, Meeting.created_at.desc()))).scalars().all()
    return [
        MeetingOut(
            id=m.id,
            title=m.title,
            platform=m.platform,
            starts_at=m.starts_at,
            department_id=m.department_id,
            project_id=m.project_id,
            created_by=m.created_by,
            created_at=m.created_at,
            updated_at=m.updated_at,
        )
        for m in meetings
    ]


@router.post("", response_model=MeetingOut, status_code=status.HTTP_201_CREATED)
async def create_meeting(
    payload: MeetingCreate,
    db: AsyncSession = Depends(get_db),
    user=Depends(get_current_user),
) -> MeetingOut:
    ensure_department_access(user, payload.department_id)
    if payload.project_id is not None:
        project = (await db.execute(select(Project).where(Project.id == payload.project_id))).scalar_one_or_none()
        if project is None:
            raise HTTPException(status_code=status.HTTP_404_NOT_FOUND, detail="Project not found")
        if project.department_id != payload.department_id:
            raise HTTPException(status_code=status.HTTP_400_BAD_REQUEST, detail="Project must be in department")

    meeting = Meeting(
        title=payload.title,
        platform=payload.platform,
        starts_at=payload.starts_at,
        department_id=payload.department_id,
        project_id=payload.project_id,
        created_by=user.id,
    )
    db.add(meeting)
    await db.commit()
    await db.refresh(meeting)
    return MeetingOut(
        id=meeting.id,
        title=meeting.title,
        platform=meeting.platform,
        starts_at=meeting.starts_at,
        department_id=meeting.department_id,
        project_id=meeting.project_id,
        created_by=meeting.created_by,
        created_at=meeting.created_at,
        updated_at=meeting.updated_at,
    )


@router.patch("/{meeting_id}", response_model=MeetingOut)
async def update_meeting(
    meeting_id: uuid.UUID,
    payload: MeetingUpdate,
    db: AsyncSession = Depends(get_db),
    user=Depends(get_current_user),
) -> MeetingOut:
    meeting = (await db.execute(select(Meeting).where(Meeting.id == meeting_id))).scalar_one_or_none()
    if meeting is None:
        raise HTTPException(status_code=status.HTTP_404_NOT_FOUND, detail="Meeting not found")
    ensure_department_access(user, meeting.department_id)

    if payload.title is not None:
        meeting.title = payload.title
    if payload.platform is not None:
        meeting.platform = payload.platform
    if payload.starts_at is not None:
        meeting.starts_at = payload.starts_at
    if payload.project_id is not None:
        project = (await db.execute(select(Project).where(Project.id == payload.project_id))).scalar_one_or_none()
        if project is None:
            raise HTTPException(status_code=status.HTTP_404_NOT_FOUND, detail="Project not found")
        if project.department_id != meeting.department_id:
            raise HTTPException(status_code=status.HTTP_400_BAD_REQUEST, detail="Project must be in department")
        meeting.project_id = payload.project_id

    await db.commit()
    await db.refresh(meeting)
    return MeetingOut(
        id=meeting.id,
        title=meeting.title,
        platform=meeting.platform,
        starts_at=meeting.starts_at,
        department_id=meeting.department_id,
        project_id=meeting.project_id,
        created_by=meeting.created_by,
        created_at=meeting.created_at,
        updated_at=meeting.updated_at,
    )


@router.delete("/{meeting_id}", status_code=status.HTTP_200_OK)
async def delete_meeting(
    meeting_id: uuid.UUID,
    db: AsyncSession = Depends(get_db),
    user=Depends(get_current_user),
) -> dict:
    meeting = (await db.execute(select(Meeting).where(Meeting.id == meeting_id))).scalar_one_or_none()
    if meeting is None:
        raise HTTPException(status_code=status.HTTP_404_NOT_FOUND, detail="Meeting not found")
    ensure_department_access(user, meeting.department_id)
    await db.delete(meeting)
    await db.commit()
    return {"ok": True}
