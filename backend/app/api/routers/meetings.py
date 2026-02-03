from __future__ import annotations

import uuid

from fastapi import APIRouter, Depends, HTTPException, status
from sqlalchemy import delete, select
from sqlalchemy.ext.asyncio import AsyncSession

from app.api.access import ensure_admin, ensure_department_access, ensure_meeting_editor
from app.api.deps import get_current_user
from app.db import get_db
from app.models.meeting import Meeting, MeetingParticipant
from app.models.project import Project
from app.models.user import User
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
            # Allow all users to see all meetings in common view
            pass
        else:
            raise HTTPException(status_code=status.HTTP_400_BAD_REQUEST, detail="department_id or project_id required")
    elif include_all_departments:
        # Allow all users to see all meetings in common view
        pass
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
    
    # Load participants for all meetings
    meeting_ids = [m.id for m in meetings]
    participants_stmt = select(MeetingParticipant).where(MeetingParticipant.meeting_id.in_(meeting_ids))
    participants = (await db.execute(participants_stmt)).scalars().all()
    participants_by_meeting: dict[uuid.UUID, list[uuid.UUID]] = {}
    for p in participants:
        if p.meeting_id not in participants_by_meeting:
            participants_by_meeting[p.meeting_id] = []
        participants_by_meeting[p.meeting_id].append(p.user_id)
    
    return [
        MeetingOut(
            id=m.id,
            title=m.title,
            platform=m.platform,
            starts_at=m.starts_at,
            meeting_url=m.meeting_url,
            recurrence_type=m.recurrence_type,
            recurrence_days_of_week=m.recurrence_days_of_week,
            recurrence_days_of_month=m.recurrence_days_of_month,
            department_id=m.department_id,
            project_id=m.project_id,
            created_by=m.created_by,
            created_at=m.created_at,
            updated_at=m.updated_at,
            participant_ids=participants_by_meeting.get(m.id, []),
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

    # Validate participant user IDs if provided
    participant_ids = payload.participant_ids or []
    if participant_ids:
        users_stmt = select(User).where(User.id.in_(participant_ids))
        existing_users = (await db.execute(users_stmt)).scalars().all()
        existing_user_ids = {u.id for u in existing_users}
        invalid_ids = set(participant_ids) - existing_user_ids
        if invalid_ids:
            raise HTTPException(
                status_code=status.HTTP_400_BAD_REQUEST,
                detail=f"Invalid user IDs: {list(invalid_ids)}"
            )

    meeting = Meeting(
        title=payload.title,
        platform=payload.platform,
        starts_at=payload.starts_at,
        meeting_url=payload.meeting_url,
        recurrence_type=payload.recurrence_type,
        recurrence_days_of_week=payload.recurrence_days_of_week,
        recurrence_days_of_month=payload.recurrence_days_of_month,
        department_id=payload.department_id,
        project_id=payload.project_id,
        created_by=user.id,
    )
    db.add(meeting)
    await db.flush()  # Flush to get the meeting ID
    
    # Create participants
    for user_id in participant_ids:
        participant = MeetingParticipant(meeting_id=meeting.id, user_id=user_id)
        db.add(participant)
    
    await db.commit()
    await db.refresh(meeting)
    
    # Load participants for response
    participants_stmt = select(MeetingParticipant).where(MeetingParticipant.meeting_id == meeting.id)
    participants = (await db.execute(participants_stmt)).scalars().all()
    participant_ids_list = [p.user_id for p in participants]
    
    return MeetingOut(
        id=meeting.id,
        title=meeting.title,
        platform=meeting.platform,
        starts_at=meeting.starts_at,
        meeting_url=meeting.meeting_url,
        recurrence_type=meeting.recurrence_type,
        recurrence_days_of_week=meeting.recurrence_days_of_week,
        recurrence_days_of_month=meeting.recurrence_days_of_month,
        department_id=meeting.department_id,
        project_id=meeting.project_id,
        created_by=meeting.created_by,
        created_at=meeting.created_at,
        updated_at=meeting.updated_at,
        participant_ids=participant_ids_list,
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
    # Allow admin, manager, or the person that created it to edit
    ensure_meeting_editor(user, meeting)

    # Get fields that were explicitly set in the request
    payload_dict = payload.model_dump(exclude_unset=True)
    
    if "title" in payload_dict and payload.title is not None:
        meeting.title = payload.title
    if "platform" in payload_dict:
        meeting.platform = payload.platform
    if "starts_at" in payload_dict:
        meeting.starts_at = payload.starts_at
    if "meeting_url" in payload_dict:
        meeting.meeting_url = payload.meeting_url
    if "recurrence_type" in payload_dict:
        # If recurrence_type is None/null, clear all recurrence fields
        meeting.recurrence_type = payload.recurrence_type
        if payload.recurrence_type is None:
            meeting.recurrence_days_of_week = None
            meeting.recurrence_days_of_month = None
    if "recurrence_days_of_week" in payload_dict:
        meeting.recurrence_days_of_week = payload.recurrence_days_of_week
    if "recurrence_days_of_month" in payload_dict:
        meeting.recurrence_days_of_month = payload.recurrence_days_of_month
    # Handle project_id update - can be set to None or a valid project
    if "project_id" in payload_dict:
        if payload.project_id is not None:
            project = (await db.execute(select(Project).where(Project.id == payload.project_id))).scalar_one_or_none()
            if project is None:
                raise HTTPException(status_code=status.HTTP_404_NOT_FOUND, detail="Project not found")
            if project.department_id != meeting.department_id:
                raise HTTPException(status_code=status.HTTP_400_BAD_REQUEST, detail="Project must be in department")
            meeting.project_id = payload.project_id
        else:
            meeting.project_id = None
    
    # Update participants if provided
    if "participant_ids" in payload_dict:
        participant_ids = payload.participant_ids or []
        # Validate participant user IDs
        if participant_ids:
            users_stmt = select(User).where(User.id.in_(participant_ids))
            existing_users = (await db.execute(users_stmt)).scalars().all()
            existing_user_ids = {u.id for u in existing_users}
            invalid_ids = set(participant_ids) - existing_user_ids
            if invalid_ids:
                raise HTTPException(
                    status_code=status.HTTP_400_BAD_REQUEST,
                    detail=f"Invalid user IDs: {list(invalid_ids)}"
                )
        
        # Delete existing participants
        await db.execute(
            delete(MeetingParticipant).where(MeetingParticipant.meeting_id == meeting.id)
        )
        
        # Create new participants
        for user_id in participant_ids:
            participant = MeetingParticipant(meeting_id=meeting.id, user_id=user_id)
            db.add(participant)

    await db.commit()
    await db.refresh(meeting)
    
    # Load participants for response
    participants_stmt = select(MeetingParticipant).where(MeetingParticipant.meeting_id == meeting.id)
    participants = (await db.execute(participants_stmt)).scalars().all()
    participant_ids_list = [p.user_id for p in participants]
    
    return MeetingOut(
        id=meeting.id,
        title=meeting.title,
        platform=meeting.platform,
        starts_at=meeting.starts_at,
        meeting_url=meeting.meeting_url,
        recurrence_type=meeting.recurrence_type,
        recurrence_days_of_week=meeting.recurrence_days_of_week,
        recurrence_days_of_month=meeting.recurrence_days_of_month,
        department_id=meeting.department_id,
        project_id=meeting.project_id,
        created_by=meeting.created_by,
        created_at=meeting.created_at,
        updated_at=meeting.updated_at,
        participant_ids=participant_ids_list,
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
    # Only admins can delete external meetings
    ensure_admin(user)
    await db.delete(meeting)
    await db.commit()
    return {"ok": True}
