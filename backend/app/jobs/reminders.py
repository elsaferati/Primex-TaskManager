from __future__ import annotations

from datetime import datetime, time, timedelta, timezone
import uuid
from zoneinfo import ZoneInfo

from sqlalchemy import or_, select
from sqlalchemy.dialects.postgresql import insert

from app.config import settings
from app.db import SessionLocal
from app.models.enums import NotificationType
from app.models.meeting import Meeting, MeetingParticipant, MeetingReminderDelivery
from app.models.meeting_occurrence_status import MeetingOccurrenceStatus
from app.services.meeting_occurrence import meeting_occurs_on_date
from app.services.notifications import add_notification, publish_notification


def _next_occurrence(meeting: Meeting, now: datetime, local_timezone: ZoneInfo) -> datetime | None:
    if meeting.starts_at is None:
        return None
    recurrence = (meeting.recurrence_type or "").strip().lower()
    if recurrence not in {"weekly", "monthly", "yearly"}:
        starts_at = meeting.starts_at
        return starts_at.replace(tzinfo=timezone.utc) if starts_at.tzinfo is None else starts_at.astimezone(timezone.utc)

    local_now = now.astimezone(local_timezone)
    local_start = meeting.starts_at.astimezone(local_timezone) if meeting.starts_at.tzinfo else meeting.starts_at.replace(tzinfo=local_timezone)
    for offset in range(0, 367):
        candidate_day = local_now.date() + timedelta(days=offset)
        if not meeting_occurs_on_date(meeting, candidate_day, local_timezone=local_timezone):
            continue
        candidate = datetime.combine(candidate_day, time(local_start.hour, local_start.minute), tzinfo=local_timezone)
        # Keep the just-started occurrence eligible for the scheduler's
        # five-minute polling grace window (notably for "at start" alerts).
        if candidate >= local_now - timedelta(minutes=5):
            return candidate.astimezone(timezone.utc)
    return None


def _reminder_is_due(*, occurrence: datetime, current: datetime, minutes_before: int) -> bool:
    notify_at = occurrence - timedelta(minutes=minutes_before)
    return notify_at <= current < occurrence + timedelta(minutes=5)


def _delivery_insert(values: list[dict]):
    return (
        insert(MeetingReminderDelivery)
        .values(values)
        .on_conflict_do_nothing(constraint="uq_meeting_reminder_delivery")
        .returning(
            MeetingReminderDelivery.meeting_id,
            MeetingReminderDelivery.user_id,
            MeetingReminderDelivery.occurrence_starts_at,
            MeetingReminderDelivery.minutes_before,
        )
    )


async def process_reminders(now: datetime | None = None) -> int:
    current = now or datetime.now(timezone.utc)
    if current.tzinfo is None:
        current = current.replace(tzinfo=timezone.utc)
    current = current.astimezone(timezone.utc)
    local_timezone = ZoneInfo(settings.APP_TIMEZONE)
    pending_publications = []

    async with SessionLocal() as db:
        rows = (
            await db.execute(
                select(Meeting, MeetingParticipant.user_id)
                .join(MeetingParticipant, MeetingParticipant.meeting_id == Meeting.id)
                .where(
                    MeetingParticipant.assignment_source == "manual",
                    Meeting.reminder_minutes_before.is_not(None),
                    or_(
                        Meeting.calendar_sync_status.is_(None),
                        Meeting.calendar_sync_status.notin_(("cancelled", "excluded", "out_of_window")),
                    ),
                )
            )
        ).all()
        candidates: dict[tuple, tuple[Meeting, uuid.UUID, datetime, int]] = {}
        for meeting, user_id in rows:
            occurrence = _next_occurrence(meeting, current, local_timezone)
            if occurrence is None:
                continue
            minutes_before = int(meeting.reminder_minutes_before or 0)
            if not _reminder_is_due(
                occurrence=occurrence,
                current=current,
                minutes_before=minutes_before,
            ):
                continue
            key = (meeting.id, user_id, occurrence, minutes_before)
            candidates[key] = (meeting, user_id, occurrence, minutes_before)

        if not candidates:
            return 0

        meeting_ids = {key[0] for key in candidates}
        occurrence_days = {
            occurrence.astimezone(local_timezone).date()
            for _, _, occurrence, _ in candidates.values()
        }
        canceled_occurrences = set(
            (
                await db.execute(
                    select(MeetingOccurrenceStatus.meeting_id, MeetingOccurrenceStatus.occurrence_date).where(
                        MeetingOccurrenceStatus.meeting_id.in_(meeting_ids),
                        MeetingOccurrenceStatus.occurrence_date.in_(occurrence_days),
                        MeetingOccurrenceStatus.status == "canceled",
                    )
                )
            ).all()
        )
        delivery_values = [
            {
                "id": uuid.uuid4(),
                "meeting_id": meeting.id,
                "user_id": user_id,
                "occurrence_starts_at": occurrence,
                "minutes_before": minutes_before,
                "sent_at": current,
            }
            for meeting, user_id, occurrence, minutes_before in candidates.values()
            if (meeting.id, occurrence.astimezone(local_timezone).date()) not in canceled_occurrences
        ]
        if not delivery_values:
            return 0

        inserted = (
            await db.execute(
                _delivery_insert(delivery_values)
            )
        ).all()
        for meeting_id, user_id, occurrence, minutes_before in inserted:
            meeting, _, _, _ = candidates[(meeting_id, user_id, occurrence, minutes_before)]
            notification = add_notification(
                db=db,
                user_id=user_id,
                type=NotificationType.reminder,
                title="PrimeFlow Meeting Reminder",
                body=f"{meeting.title}\nStarts in {minutes_before} minutes",
                data={
                    "meeting_id": str(meeting.id),
                    "meeting_url": meeting.meeting_url,
                    "starts_at": occurrence.isoformat(),
                    "open_url": meeting.meeting_url or f"/common?meeting={meeting.id}",
                },
            )
            pending_publications.append((user_id, notification))
        await db.commit()

    for user_id, notification in pending_publications:
        await publish_notification(user_id=user_id, notification=notification)
    return len(pending_publications)


