from __future__ import annotations

import uuid
from datetime import datetime, time, timedelta, timezone
from zoneinfo import ZoneInfo

from sqlalchemy import or_, select
from sqlalchemy.ext.asyncio import AsyncSession

from app.config import settings
from app.models.meeting import Meeting, MeetingParticipant
from app.models.meeting_schedule_request import (
    MeetingScheduleRequest,
    MeetingScheduleRequestParticipant,
    MeetingSchedulingStandard,
)
from app.models.project import Project
from app.models.user import User
from app.schemas.meeting_scheduler import (
    MeetingScheduleConflict,
    MeetingScheduleRequestBase,
    MeetingScheduleValidationOut,
)


ACTIVE_REQUEST_STATUSES = {"PENDING_APPROVAL", "APPROVED", "CREATING_TEAMS", "CREATION_FAILED"}
FINAL_REQUEST_STATUSES = {"CREATED", "REJECTED", "CANCELED"}
DEFAULT_EXISTING_MEETING_DURATION = timedelta(minutes=60)


def _app_timezone() -> ZoneInfo:
    try:
        return ZoneInfo(settings.APP_TIMEZONE)
    except Exception:
        return ZoneInfo("UTC")


def _overlaps(left_start: datetime, left_end: datetime, right_start: datetime, right_end: datetime) -> bool:
    return left_start < right_end and right_start < left_end


def meeting_occurrence_window(meeting: Meeting, target: datetime) -> tuple[datetime, datetime] | None:
    if meeting.starts_at is None:
        return None
    tz = _app_timezone()
    target_local = target.astimezone(tz)
    source_local = meeting.starts_at.astimezone(tz)
    recurrence = (meeting.recurrence_type or "").strip().lower()
    occurs = False
    if recurrence == "weekly":
        occurs = bool(meeting.recurrence_days_of_week and target_local.weekday() in meeting.recurrence_days_of_week)
    elif recurrence == "monthly":
        occurs = bool(meeting.recurrence_days_of_month and target_local.day in meeting.recurrence_days_of_month)
    elif recurrence == "yearly":
        occurs = target_local.month == source_local.month and target_local.day == source_local.day
    else:
        occurs = target_local.date() == source_local.date()
    if not occurs:
        return None
    start_local = datetime.combine(target_local.date(), source_local.timetz(), tzinfo=tz)
    start = start_local.astimezone(timezone.utc)
    duration = (
        meeting.ends_at - meeting.starts_at
        if meeting.ends_at is not None and meeting.ends_at > meeting.starts_at
        else DEFAULT_EXISTING_MEETING_DURATION
    )
    return start, start + duration


async def validate_meeting_schedule(
    db: AsyncSession,
    payload: MeetingScheduleRequestBase,
    *,
    exclude_request_id: uuid.UUID | None = None,
) -> MeetingScheduleValidationOut:
    errors: list[str] = []
    warnings: list[str] = []
    conflicts: list[MeetingScheduleConflict] = []
    now = datetime.now(timezone.utc)
    starts_at = payload.starts_at.astimezone(timezone.utc)
    ends_at = payload.ends_at.astimezone(timezone.utc)

    users = (await db.execute(select(User).where(User.id.in_(payload.participant_ids)))).scalars().all()
    valid_user_ids = {user.id for user in users if user.is_active}
    missing_users = set(payload.participant_ids) - valid_user_ids
    if missing_users:
        errors.append("Një ose më shumë pjesëmarrës nuk ekzistojnë ose nuk janë aktivë.")

    if payload.project_id is not None:
        project = (await db.execute(select(Project).where(Project.id == payload.project_id))).scalar_one_or_none()
        if project is None:
            errors.append("Projekti i zgjedhur nuk ekziston.")
        elif project.department_id != payload.department_id:
            errors.append("Projekti duhet t'i përkasë departamentit të zgjedhur.")

    standard = None
    if payload.standard_id is not None:
        standard = (
            await db.execute(
                select(MeetingSchedulingStandard).where(
                    MeetingSchedulingStandard.id == payload.standard_id,
                    MeetingSchedulingStandard.is_active.is_(True),
                )
            )
        ).scalar_one_or_none()
        if standard is None:
            errors.append("Standardi i zgjedhur nuk ekziston ose nuk është aktiv.")
        elif standard.meeting_type != payload.meeting_type:
            errors.append("Standardi nuk përputhet me llojin e takimit.")

    if standard is not None:
        tz = _app_timezone()
        local_start = starts_at.astimezone(tz)
        local_end = ends_at.astimezone(tz)
        allowed_start = time.fromisoformat(standard.workday_start)
        allowed_end = time.fromisoformat(standard.workday_end)
        if local_start.weekday() > 4:
            errors.append("Takimi nuk mund të planifikohet në fundjavë.")
        if local_start.time().replace(tzinfo=None) < allowed_start or local_end.time().replace(tzinfo=None) > allowed_end:
            errors.append(f"Takimi duhet të jetë brenda orarit {standard.workday_start}–{standard.workday_end}.")
        duration = int((ends_at - starts_at).total_seconds() // 60)
        if duration != standard.default_duration_minutes:
            warnings.append(
                f"Standardi rekomandon {standard.default_duration_minutes} minuta; u zgjodhën {duration} minuta."
            )

    buffer_minutes = int(getattr(standard, "buffer_minutes", 0) or 0)
    conflict_window_start = starts_at - timedelta(minutes=buffer_minutes)
    conflict_window_end = ends_at + timedelta(minutes=buffer_minutes)

    if starts_at < now:
        errors.append("Takimi nuk mund të planifikohet në të kaluarën.")

    participant_ids = set(payload.participant_ids)
    meeting_rows = (
        await db.execute(
            select(Meeting, MeetingParticipant.user_id)
            .join(MeetingParticipant, MeetingParticipant.meeting_id == Meeting.id)
            .where(MeetingParticipant.user_id.in_(participant_ids))
            .where(Meeting.starts_at.is_not(None))
        )
    ).all()
    meeting_participants: dict[uuid.UUID, set[uuid.UUID]] = {}
    meetings: dict[uuid.UUID, Meeting] = {}
    for meeting, participant_id in meeting_rows:
        meetings[meeting.id] = meeting
        meeting_participants.setdefault(meeting.id, set()).add(participant_id)

    # A single shared organizer cannot host overlapping TAK EXT meetings.
    # Check every TAK EXT, regardless of whether participants overlap.
    if payload.meeting_type == "external":
        external_meetings = (
            await db.execute(
                select(Meeting).where(
                    Meeting.meeting_type == "external",
                    Meeting.starts_at.is_not(None),
                    or_(
                        Meeting.calendar_sync_status.is_(None),
                        Meeting.calendar_sync_status != "cancelled",
                    ),
                )
            )
        ).scalars().all()
        for external_meeting in external_meetings:
            meetings.setdefault(external_meeting.id, external_meeting)

    for meeting_id, meeting in meetings.items():
        window = meeting_occurrence_window(meeting, starts_at)
        if window and _overlaps(conflict_window_start, conflict_window_end, *window):
            conflicts.append(
                MeetingScheduleConflict(
                    source=(
                        "tak_ext"
                        if payload.meeting_type == "external" and meeting.meeting_type == "external"
                        else "primeflow"
                    ),
                    title=meeting.title,
                    starts_at=window[0],
                    ends_at=window[1],
                    participant_ids=sorted(meeting_participants.get(meeting_id, set()), key=str),
                )
            )

    request_stmt = (
        select(MeetingScheduleRequest, MeetingScheduleRequestParticipant.user_id)
        .join(
            MeetingScheduleRequestParticipant,
            MeetingScheduleRequestParticipant.request_id == MeetingScheduleRequest.id,
        )
        .where(MeetingScheduleRequestParticipant.user_id.in_(participant_ids))
        .where(MeetingScheduleRequest.status.in_(ACTIVE_REQUEST_STATUSES))
        .where(
            MeetingScheduleRequest.starts_at < conflict_window_end,
            MeetingScheduleRequest.ends_at > conflict_window_start,
        )
    )
    if exclude_request_id is not None:
        request_stmt = request_stmt.where(MeetingScheduleRequest.id != exclude_request_id)
    request_rows = (await db.execute(request_stmt)).all()
    request_participants: dict[uuid.UUID, set[uuid.UUID]] = {}
    requests: dict[uuid.UUID, MeetingScheduleRequest] = {}
    for request_row, participant_id in request_rows:
        requests[request_row.id] = request_row
        request_participants.setdefault(request_row.id, set()).add(participant_id)

    # Pending TAK EXT requests also reserve their interval. Otherwise two
    # requests with different participants could both reach approval.
    if payload.meeting_type == "external":
        external_request_stmt = (
            select(MeetingScheduleRequest)
            .where(MeetingScheduleRequest.meeting_type == "external")
            .where(MeetingScheduleRequest.status.in_(ACTIVE_REQUEST_STATUSES))
            .where(
                MeetingScheduleRequest.starts_at < conflict_window_end,
                MeetingScheduleRequest.ends_at > conflict_window_start,
            )
        )
        if exclude_request_id is not None:
            external_request_stmt = external_request_stmt.where(
                MeetingScheduleRequest.id != exclude_request_id
            )
        external_requests = (await db.execute(external_request_stmt)).scalars().all()
        for external_request in external_requests:
            requests.setdefault(external_request.id, external_request)

    for request_id, request_row in requests.items():
        conflicts.append(
            MeetingScheduleConflict(
                source=(
                    "tak_ext_request"
                    if payload.meeting_type == "external" and request_row.meeting_type == "external"
                    else "request"
                ),
                title=request_row.title,
                starts_at=request_row.starts_at,
                ends_at=request_row.ends_at,
                participant_ids=sorted(request_participants.get(request_id, set()), key=str),
            )
        )

    external_conflict = next(
        (conflict for conflict in conflicts if conflict.source in {"tak_ext", "tak_ext_request"}),
        None,
    )
    if external_conflict is not None:
        conflict_start = external_conflict.starts_at.astimezone(_app_timezone()).strftime("%d.%m.%Y %H:%M")
        conflict_end = external_conflict.ends_at.astimezone(_app_timezone()).strftime("%H:%M")
        errors.append(
            f'Nuk mund të krijohet TAK EXT. Intervali konflikton me "{external_conflict.title}" '
            f'({conflict_start}–{conflict_end}).'
        )
    elif conflicts:
        errors.append("Një ose më shumë pjesëmarrës janë të zënë në këtë orar.")

    return MeetingScheduleValidationOut(
        can_create=not errors,
        errors=errors,
        warnings=warnings,
        conflicts=conflicts,
        checked_at=now,
    )


def microsoft_schedule_conflicts(
    schedule_rows: list[dict],
    *,
    starts_at: datetime,
    ends_at: datetime,
) -> list[MeetingScheduleConflict]:
    result: list[MeetingScheduleConflict] = []
    for schedule in schedule_rows:
        email = str(schedule.get("scheduleId") or "Microsoft calendar")
        for item in schedule.get("scheduleItems") or []:
            status = str(item.get("status") or "").lower()
            if status in {"free", "unknown"}:
                continue
            try:
                item_start = datetime.fromisoformat(str(item["start"]["dateTime"]).replace("Z", "+00:00"))
                item_end = datetime.fromisoformat(str(item["end"]["dateTime"]).replace("Z", "+00:00"))
                if item_start.tzinfo is None:
                    item_start = item_start.replace(tzinfo=timezone.utc)
                if item_end.tzinfo is None:
                    item_end = item_end.replace(tzinfo=timezone.utc)
            except (KeyError, TypeError, ValueError):
                continue
            if _overlaps(starts_at, ends_at, item_start, item_end):
                result.append(
                    MeetingScheduleConflict(
                        source="microsoft",
                        title=f"{email} — {status}",
                        starts_at=item_start,
                        ends_at=item_end,
                    )
                )
    return result
