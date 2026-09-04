from __future__ import annotations

import uuid
from dataclasses import asdict
from datetime import date, datetime, timedelta, timezone

import httpx
from fastapi import APIRouter, Depends, HTTPException, Request, status
from sqlalchemy import delete, select
from sqlalchemy.ext.asyncio import AsyncSession

from app.api.access import ensure_admin, ensure_department_access, ensure_manager_or_admin, ensure_meeting_editor
from app.api.deps import get_current_user
from app.db import get_db
from app.models.meeting import Meeting, MeetingParticipant
from app.models.meeting_occurrence_status import MeetingOccurrenceStatus
from app.models.project import Project
from app.models.user import User
from app.schemas.meeting import (
    MeetingCreate,
    MeetingCreateOut,
    MeetingOccurrenceStatusOut,
    MeetingOccurrenceStatusUpdate,
    MeetingOut,
    MeetingUpdate,
)
from app.services.meeting_system_tasks import (
    deactivate_external_meeting_system_tasks,
    reconcile_agent_test_task_for_meeting,
    reconcile_external_meeting_system_tasks_for_meeting,
    reconcile_pim_image_test_task_for_meeting,
)
from app.services.microsoft_calendar_sync import (
    get_shared_calendar_token,
    sync_external_calendar_events,
)
from app.api.routers.microsoft import resolve_redirect_uri


router = APIRouter()


def _occurrence_status_out(row: MeetingOccurrenceStatus) -> MeetingOccurrenceStatusOut:
    return MeetingOccurrenceStatusOut(
        id=row.id,
        meeting_id=row.meeting_id,
        occurrence_date=row.occurrence_date,
        status=row.status,
        note=row.note,
        checked_by_user_id=row.checked_by_user_id,
        checked_at=row.checked_at,
        created_at=row.created_at,
        updated_at=row.updated_at,
    )


@router.get("", response_model=list[MeetingOut])
async def list_meetings(
    department_id: uuid.UUID | None = None,
    project_id: uuid.UUID | None = None,
    participant_user_id: uuid.UUID | None = None,
    include_all_departments: bool = False,
    meeting_type: str | None = None,
    db: AsyncSession = Depends(get_db),
    user=Depends(get_current_user),
) -> list[MeetingOut]:
    stmt = select(Meeting)
    if department_id is None and project_id is None and participant_user_id is None:
        if include_all_departments:
            # Allow all users to see all meetings in common view
            pass
        else:
            raise HTTPException(
                status_code=status.HTTP_400_BAD_REQUEST,
                detail="department_id, project_id, or participant_user_id required",
            )
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
    if participant_user_id is not None:
        stmt = stmt.join(MeetingParticipant).where(MeetingParticipant.user_id == participant_user_id)
    if meeting_type is not None:
        stmt = stmt.where(Meeting.meeting_type == meeting_type)

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
            ends_at=m.ends_at,
            meeting_url=m.meeting_url,
            microsoft_event_id=m.microsoft_event_id,
            calendar_imported=bool(m.calendar_imported),
            calendar_sync_status=m.calendar_sync_status,
            calendar_last_synced_at=m.calendar_last_synced_at,
            meeting_type=m.meeting_type,
            recurrence_type=m.recurrence_type,
            recurrence_days_of_week=m.recurrence_days_of_week,
            recurrence_days_of_month=m.recurrence_days_of_month,
            external_agent_test_task_requested=m.external_agent_test_task_requested,
            external_pim_image_test_task_requested=m.external_pim_image_test_task_requested,
            department_id=m.department_id,
            project_id=m.project_id,
            created_by=m.created_by,
            created_at=m.created_at,
            updated_at=m.updated_at,
            participant_ids=participants_by_meeting.get(m.id, []),
            paired_external_meeting_id=m.paired_external_meeting_id,
        )
        for m in meetings
    ]


@router.post("/sync-microsoft-calendar")
async def sync_microsoft_calendar(
    request: Request,
    start: datetime | None = None,
    end: datetime | None = None,
    db: AsyncSession = Depends(get_db),
    user=Depends(get_current_user),
) -> dict:
    """Import every event from the shared info calendar as a TAK EXT."""
    now = datetime.now(timezone.utc)
    sync_start = start or (now - timedelta(days=90))
    sync_end = end or (now + timedelta(days=365))
    if sync_start.tzinfo is None:
        sync_start = sync_start.replace(tzinfo=timezone.utc)
    if sync_end.tzinfo is None:
        sync_end = sync_end.replace(tzinfo=timezone.utc)
    if sync_end <= sync_start:
        raise HTTPException(status_code=status.HTTP_400_BAD_REQUEST, detail="end must be after start")
    if sync_end - sync_start > timedelta(days=730):
        raise HTTPException(status_code=status.HTTP_400_BAD_REQUEST, detail="Sync range cannot exceed 730 days")

    try:
        token = await get_shared_calendar_token(db, redirect_uri=resolve_redirect_uri(request))
        if token is None:
            raise HTTPException(
                status_code=status.HTTP_409_CONFLICT,
                detail="The shared Microsoft calendar is not connected.",
            )
        result = await sync_external_calendar_events(
            db,
            access_token=token.access_token,
            connected_by_user_id=token.user_id,
            start=sync_start,
            end=sync_end,
        )
    except HTTPException:
        raise
    except httpx.HTTPError as exc:
        raise HTTPException(
            status_code=status.HTTP_502_BAD_GATEWAY,
            detail=f"Microsoft Calendar sync failed: {exc.__class__.__name__}",
        ) from exc
    return asdict(result)


@router.get("/occurrence-statuses", response_model=list[MeetingOccurrenceStatusOut])
async def list_meeting_occurrence_statuses(
    occurrence_date: date,
    db: AsyncSession = Depends(get_db),
    user=Depends(get_current_user),
) -> list[MeetingOccurrenceStatusOut]:
    rows = (
        await db.execute(
            select(MeetingOccurrenceStatus).where(MeetingOccurrenceStatus.occurrence_date == occurrence_date)
        )
    ).scalars().all()
    return [_occurrence_status_out(row) for row in rows]


@router.patch("/{meeting_id}/occurrence-status", response_model=MeetingOccurrenceStatusOut)
async def update_meeting_occurrence_status(
    meeting_id: uuid.UUID,
    payload: MeetingOccurrenceStatusUpdate,
    db: AsyncSession = Depends(get_db),
    user=Depends(get_current_user),
) -> MeetingOccurrenceStatusOut:
    meeting = (await db.execute(select(Meeting).where(Meeting.id == meeting_id))).scalar_one_or_none()
    if meeting is None:
        raise HTTPException(status_code=status.HTTP_404_NOT_FOUND, detail="Meeting not found")
    row = (
        await db.execute(
            select(MeetingOccurrenceStatus).where(
                MeetingOccurrenceStatus.meeting_id == meeting_id,
                MeetingOccurrenceStatus.occurrence_date == payload.occurrence_date,
            )
        )
    ).scalar_one_or_none()
    if row is None:
        row = MeetingOccurrenceStatus(
            meeting_id=meeting_id,
            occurrence_date=payload.occurrence_date,
        )
        db.add(row)
    row.status = payload.status
    row.note = payload.note
    row.checked_by_user_id = user.id
    row.checked_at = datetime.now().astimezone()
    await db.commit()
    await db.refresh(row)
    return _occurrence_status_out(row)


@router.post("", response_model=MeetingCreateOut, status_code=status.HTTP_201_CREATED)
async def create_meeting(
    payload: MeetingCreate,
    db: AsyncSession = Depends(get_db),
    user=Depends(get_current_user),
) -> MeetingCreateOut:
    ensure_department_access(user, payload.department_id)
    requested_meeting_type = payload.meeting_type or "external"
    paired_external: Meeting | None = None
    if payload.paired_external_meeting_id is not None:
        if requested_meeting_type != "internal":
            raise HTTPException(
                status_code=status.HTTP_400_BAD_REQUEST,
                detail="Only a TAK INT can be linked to a TAK EXT",
            )
        paired_external = (
            await db.execute(
                select(Meeting).where(Meeting.id == payload.paired_external_meeting_id)
            )
        ).scalar_one_or_none()
        if paired_external is None or paired_external.meeting_type != "external":
            raise HTTPException(status_code=status.HTTP_404_NOT_FOUND, detail="TAK EXT not found")
        existing_pair = (
            await db.execute(
                select(Meeting.id).where(
                    Meeting.paired_external_meeting_id == payload.paired_external_meeting_id
                )
            )
        ).scalar_one_or_none()
        if existing_pair is not None:
            raise HTTPException(
                status_code=status.HTTP_409_CONFLICT,
                detail="This TAK EXT already has a linked TAK INT",
            )
    should_create_internal_meeting = (
        payload.create_internal_meeting
        if payload.create_internal_meeting is not None
        else payload.internal_starts_at is not None
    )
    if (
        requested_meeting_type == "external"
        and should_create_internal_meeting
        and payload.internal_starts_at is None
    ):
        raise HTTPException(
            status_code=status.HTTP_400_BAD_REQUEST,
            detail="Internal meeting date and time are required when creating TAK INT",
        )
    if payload.project_id is not None:
        project = (await db.execute(select(Project).where(Project.id == payload.project_id))).scalar_one_or_none()
        if project is None:
            raise HTTPException(status_code=status.HTTP_404_NOT_FOUND, detail="Project not found")
        if project.department_id != payload.department_id:
            raise HTTPException(status_code=status.HTTP_400_BAD_REQUEST, detail="Project must be in department")

    # Every meeting must belong to at least one person's view.
    participant_ids = payload.participant_ids or []
    if not participant_ids:
        raise HTTPException(
            status_code=status.HTTP_400_BAD_REQUEST,
            detail="Select at least one person for the meeting",
        )
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
        ends_at=payload.ends_at,
        meeting_url=payload.meeting_url,
        meeting_type=requested_meeting_type,
        recurrence_type=payload.recurrence_type,
        recurrence_days_of_week=payload.recurrence_days_of_week,
        recurrence_days_of_month=payload.recurrence_days_of_month,
        department_id=payload.department_id,
        project_id=payload.project_id,
        paired_external_meeting_id=payload.paired_external_meeting_id,
        created_by=user.id,
    )
    db.add(meeting)
    await db.flush()  # Flush to get the meeting ID

    paired_internal_meeting: Meeting | None = None
    if (
        meeting.meeting_type == "external"
        and should_create_internal_meeting
        and payload.internal_starts_at is not None
    ):
        paired_internal_meeting = Meeting(
            title=payload.title,
            platform=payload.platform,
            starts_at=payload.internal_starts_at,
            ends_at=None,
            meeting_url=payload.meeting_url,
            meeting_type="internal",
            recurrence_type=payload.recurrence_type,
            recurrence_days_of_week=payload.recurrence_days_of_week,
            recurrence_days_of_month=payload.recurrence_days_of_month,
            department_id=payload.department_id,
            project_id=payload.project_id,
            paired_external_meeting_id=meeting.id,
            created_by=user.id,
        )
        db.add(paired_internal_meeting)
        await db.flush()
    
    # Create participants
    for user_id in participant_ids:
        participant = MeetingParticipant(meeting_id=meeting.id, user_id=user_id)
        db.add(participant)
        if paired_internal_meeting is not None:
            db.add(MeetingParticipant(meeting_id=paired_internal_meeting.id, user_id=user_id))

    await db.flush()
    await db.commit()
    await db.refresh(meeting)
    if paired_internal_meeting is not None:
        await db.refresh(paired_internal_meeting)
    
    # Load participants for response
    participants_stmt = select(MeetingParticipant).where(MeetingParticipant.meeting_id == meeting.id)
    participants = (await db.execute(participants_stmt)).scalars().all()
    participant_ids_list = [p.user_id for p in participants]
    
    paired_internal_out = None
    if paired_internal_meeting is not None:
        paired_internal_out = MeetingOut(
            id=paired_internal_meeting.id,
            title=paired_internal_meeting.title,
            platform=paired_internal_meeting.platform,
            starts_at=paired_internal_meeting.starts_at,
            ends_at=paired_internal_meeting.ends_at,
            meeting_url=paired_internal_meeting.meeting_url,
            microsoft_event_id=paired_internal_meeting.microsoft_event_id,
            calendar_imported=bool(paired_internal_meeting.calendar_imported),
            calendar_sync_status=paired_internal_meeting.calendar_sync_status,
            calendar_last_synced_at=paired_internal_meeting.calendar_last_synced_at,
            meeting_type=paired_internal_meeting.meeting_type,
            recurrence_type=paired_internal_meeting.recurrence_type,
            recurrence_days_of_week=paired_internal_meeting.recurrence_days_of_week,
            recurrence_days_of_month=paired_internal_meeting.recurrence_days_of_month,
            external_agent_test_task_requested=paired_internal_meeting.external_agent_test_task_requested,
            external_pim_image_test_task_requested=paired_internal_meeting.external_pim_image_test_task_requested,
            department_id=paired_internal_meeting.department_id,
            project_id=paired_internal_meeting.project_id,
            created_by=paired_internal_meeting.created_by,
            created_at=paired_internal_meeting.created_at,
            updated_at=paired_internal_meeting.updated_at,
            participant_ids=participant_ids_list,
            paired_external_meeting_id=paired_internal_meeting.paired_external_meeting_id,
        )

    return MeetingCreateOut(
        id=meeting.id,
        title=meeting.title,
        platform=meeting.platform,
        starts_at=meeting.starts_at,
        ends_at=meeting.ends_at,
        meeting_url=meeting.meeting_url,
        microsoft_event_id=meeting.microsoft_event_id,
        calendar_imported=bool(meeting.calendar_imported),
        calendar_sync_status=meeting.calendar_sync_status,
        calendar_last_synced_at=meeting.calendar_last_synced_at,
        meeting_type=meeting.meeting_type,
        recurrence_type=meeting.recurrence_type,
        recurrence_days_of_week=meeting.recurrence_days_of_week,
        recurrence_days_of_month=meeting.recurrence_days_of_month,
        external_agent_test_task_requested=meeting.external_agent_test_task_requested,
        external_pim_image_test_task_requested=meeting.external_pim_image_test_task_requested,
        department_id=meeting.department_id,
        project_id=meeting.project_id,
        created_by=meeting.created_by,
        created_at=meeting.created_at,
        updated_at=meeting.updated_at,
        participant_ids=participant_ids_list,
        paired_external_meeting_id=meeting.paired_external_meeting_id,
        paired_internal_meeting=paired_internal_out,
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
    if meeting.calendar_imported:
        raise HTTPException(
            status_code=status.HTTP_409_CONFLICT,
            detail="Calendar meetings must be edited in Microsoft Calendar",
        )
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
    if "meeting_type" in payload_dict and payload.meeting_type is not None:
        meeting.meeting_type = payload.meeting_type
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
        if not participant_ids:
            raise HTTPException(
                status_code=status.HTTP_400_BAD_REQUEST,
                detail="Select at least one person for the meeting",
            )
        # Validate participant user IDs
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

    await db.flush()
    await reconcile_external_meeting_system_tasks_for_meeting(db, meeting)

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
        ends_at=meeting.ends_at,
        meeting_url=meeting.meeting_url,
        microsoft_event_id=meeting.microsoft_event_id,
        calendar_imported=bool(meeting.calendar_imported),
        calendar_sync_status=meeting.calendar_sync_status,
        calendar_last_synced_at=meeting.calendar_last_synced_at,
        meeting_type=meeting.meeting_type,
        recurrence_type=meeting.recurrence_type,
        recurrence_days_of_week=meeting.recurrence_days_of_week,
        recurrence_days_of_month=meeting.recurrence_days_of_month,
        external_agent_test_task_requested=meeting.external_agent_test_task_requested,
        external_pim_image_test_task_requested=meeting.external_pim_image_test_task_requested,
        department_id=meeting.department_id,
        project_id=meeting.project_id,
        created_by=meeting.created_by,
        created_at=meeting.created_at,
        updated_at=meeting.updated_at,
        participant_ids=participant_ids_list,
        paired_external_meeting_id=meeting.paired_external_meeting_id,
    )


@router.post("/{meeting_id}/agent-test-task", response_model=MeetingOut)
async def create_agent_test_task_for_meeting(
    meeting_id: uuid.UUID,
    db: AsyncSession = Depends(get_db),
    user=Depends(get_current_user),
) -> MeetingOut:
    meeting = (await db.execute(select(Meeting).where(Meeting.id == meeting_id))).scalar_one_or_none()
    if meeting is None:
        raise HTTPException(status_code=status.HTTP_404_NOT_FOUND, detail="Meeting not found")
    ensure_manager_or_admin(user)
    ensure_department_access(user, meeting.department_id)
    if meeting.meeting_type != "external":
        raise HTTPException(status_code=status.HTTP_400_BAD_REQUEST, detail="Agent test task is only available for external meetings")

    meeting.external_agent_test_task_requested = True
    await db.flush()
    created = await reconcile_agent_test_task_for_meeting(db, meeting)
    if created == 0 and meeting.starts_at is None:
        raise HTTPException(status_code=status.HTTP_400_BAD_REQUEST, detail="Meeting start date is required")
    if created == 0 and (meeting.recurrence_type or "").strip().lower() not in ("", "none"):
        raise HTTPException(status_code=status.HTTP_400_BAD_REQUEST, detail="Agent test task is only available for one-time meetings")

    await db.commit()
    await db.refresh(meeting)

    participants_stmt = select(MeetingParticipant).where(MeetingParticipant.meeting_id == meeting.id)
    participants = (await db.execute(participants_stmt)).scalars().all()
    participant_ids_list = [p.user_id for p in participants]

    return MeetingOut(
        id=meeting.id,
        title=meeting.title,
        platform=meeting.platform,
        starts_at=meeting.starts_at,
        ends_at=meeting.ends_at,
        meeting_url=meeting.meeting_url,
        microsoft_event_id=meeting.microsoft_event_id,
        calendar_imported=bool(meeting.calendar_imported),
        calendar_sync_status=meeting.calendar_sync_status,
        calendar_last_synced_at=meeting.calendar_last_synced_at,
        meeting_type=meeting.meeting_type,
        recurrence_type=meeting.recurrence_type,
        recurrence_days_of_week=meeting.recurrence_days_of_week,
        recurrence_days_of_month=meeting.recurrence_days_of_month,
        external_agent_test_task_requested=meeting.external_agent_test_task_requested,
        external_pim_image_test_task_requested=meeting.external_pim_image_test_task_requested,
        department_id=meeting.department_id,
        project_id=meeting.project_id,
        created_by=meeting.created_by,
        created_at=meeting.created_at,
        updated_at=meeting.updated_at,
        participant_ids=participant_ids_list,
        paired_external_meeting_id=meeting.paired_external_meeting_id,
    )


@router.post("/{meeting_id}/pim-image-test-task", response_model=MeetingOut)
async def create_pim_image_test_task_for_meeting(
    meeting_id: uuid.UUID,
    db: AsyncSession = Depends(get_db),
    user=Depends(get_current_user),
) -> MeetingOut:
    meeting = (await db.execute(select(Meeting).where(Meeting.id == meeting_id))).scalar_one_or_none()
    if meeting is None:
        raise HTTPException(status_code=status.HTTP_404_NOT_FOUND, detail="Meeting not found")
    ensure_manager_or_admin(user)
    ensure_department_access(user, meeting.department_id)
    if meeting.meeting_type != "external":
        raise HTTPException(status_code=status.HTTP_400_BAD_REQUEST, detail="PIM image test task is only available for external meetings")
    if meeting.starts_at is None:
        raise HTTPException(status_code=status.HTTP_400_BAD_REQUEST, detail="Meeting start date is required")
    if (meeting.recurrence_type or "").strip().lower() not in ("", "none"):
        raise HTTPException(status_code=status.HTTP_400_BAD_REQUEST, detail="PIM image test task is only available for one-time meetings")

    meeting.external_pim_image_test_task_requested = True
    await db.flush()
    await reconcile_pim_image_test_task_for_meeting(db, meeting)
    await db.commit()
    await db.refresh(meeting)

    participants_stmt = select(MeetingParticipant).where(MeetingParticipant.meeting_id == meeting.id)
    participants = (await db.execute(participants_stmt)).scalars().all()
    participant_ids_list = [p.user_id for p in participants]

    return MeetingOut(
        id=meeting.id,
        title=meeting.title,
        platform=meeting.platform,
        starts_at=meeting.starts_at,
        ends_at=meeting.ends_at,
        meeting_url=meeting.meeting_url,
        microsoft_event_id=meeting.microsoft_event_id,
        calendar_imported=bool(meeting.calendar_imported),
        calendar_sync_status=meeting.calendar_sync_status,
        calendar_last_synced_at=meeting.calendar_last_synced_at,
        meeting_type=meeting.meeting_type,
        recurrence_type=meeting.recurrence_type,
        recurrence_days_of_week=meeting.recurrence_days_of_week,
        recurrence_days_of_month=meeting.recurrence_days_of_month,
        external_agent_test_task_requested=meeting.external_agent_test_task_requested,
        external_pim_image_test_task_requested=meeting.external_pim_image_test_task_requested,
        department_id=meeting.department_id,
        project_id=meeting.project_id,
        created_by=meeting.created_by,
        created_at=meeting.created_at,
        updated_at=meeting.updated_at,
        participant_ids=participant_ids_list,
        paired_external_meeting_id=meeting.paired_external_meeting_id,
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
    if meeting.calendar_imported:
        raise HTTPException(
            status_code=status.HTTP_409_CONFLICT,
            detail="Calendar meetings must be deleted in Microsoft Calendar",
        )
    # Only admins can delete external meetings
    ensure_admin(user)
    await deactivate_external_meeting_system_tasks(db, meeting.id)
    await db.delete(meeting)
    await db.commit()
    return {"ok": True}
