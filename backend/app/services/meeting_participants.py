from __future__ import annotations

import uuid

from fastapi import HTTPException, status
from sqlalchemy import delete, select
from sqlalchemy.ext.asyncio import AsyncSession

from app.models.meeting import Meeting, MeetingParticipant
from app.models.user import User
from app.schemas.meeting import MeetingOut


MANUAL_ASSIGNMENT_SOURCE = "manual"


async def manual_participant_ids(db: AsyncSession, meeting_ids: list[uuid.UUID]) -> dict[uuid.UUID, list[uuid.UUID]]:
    if not meeting_ids:
        return {}
    rows = (
        await db.execute(
            select(MeetingParticipant.meeting_id, MeetingParticipant.user_id).where(
                MeetingParticipant.meeting_id.in_(meeting_ids),
                MeetingParticipant.assignment_source == MANUAL_ASSIGNMENT_SOURCE,
            )
        )
    ).all()
    result: dict[uuid.UUID, list[uuid.UUID]] = {}
    for meeting_id, user_id in rows:
        result.setdefault(meeting_id, []).append(user_id)
    return result


async def replace_manual_participants(
    db: AsyncSession,
    *,
    meeting_id: uuid.UUID,
    participant_ids: list[uuid.UUID],
    actor_user_id: uuid.UUID,
) -> list[uuid.UUID]:
    unique_ids = list(dict.fromkeys(participant_ids))
    if unique_ids:
        valid_ids = set(
            (
                await db.execute(
                    select(User.id).where(User.id.in_(unique_ids), User.is_active.is_(True))
                )
            ).scalars().all()
        )
        invalid_ids = set(unique_ids) - valid_ids
        if invalid_ids:
            raise HTTPException(
                status_code=status.HTTP_400_BAD_REQUEST,
                detail=f"Invalid or inactive user IDs: {list(invalid_ids)}",
            )

    await db.execute(
        delete(MeetingParticipant).where(
            MeetingParticipant.meeting_id == meeting_id,
            MeetingParticipant.assignment_source == MANUAL_ASSIGNMENT_SOURCE,
        )
    )
    for participant_id in unique_ids:
        db.add(
            MeetingParticipant(
                meeting_id=meeting_id,
                user_id=participant_id,
                assignment_source=MANUAL_ASSIGNMENT_SOURCE,
                assigned_by_user_id=actor_user_id,
            )
        )
    return unique_ids


def meeting_to_out(
    meeting: Meeting,
    *,
    participant_ids: list[uuid.UUID] | None = None,
) -> MeetingOut:
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
        calendar_categories=meeting.calendar_categories or [],
        calendar_last_synced_at=meeting.calendar_last_synced_at,
        reminder_minutes_before=meeting.reminder_minutes_before,
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
        participant_ids=participant_ids or [],
        paired_external_meeting_id=meeting.paired_external_meeting_id,
        pre_external_meeting_id=meeting.pre_external_meeting_id,
    )
