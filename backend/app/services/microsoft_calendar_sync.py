from __future__ import annotations

import asyncio
import re
from collections import Counter
from dataclasses import dataclass
from datetime import datetime, timedelta, timezone
from typing import Any

from sqlalchemy import select, update
from sqlalchemy.ext.asyncio import AsyncSession

from app.config import settings
import httpx

from app.integrations.microsoft import (
    compute_expires_at,
    fetch_calendar_events,
    fetch_user_profile,
    microsoft_account_email,
    refresh_access_token,
)
from app.models.department import Department
from app.models.meeting import Meeting, MeetingParticipant
from app.models.microsoft_token import MicrosoftToken
from app.models.user import User


_sync_lock = asyncio.Lock()


@dataclass(frozen=True)
class MicrosoftCalendarSyncResult:
    fetched: int
    created: int
    updated: int
    cancelled: int
    skipped: int


def microsoft_calendar_sync_window(now: datetime) -> tuple[datetime, datetime]:
    """Return the forward-only shared-calendar import window."""
    return now, now + timedelta(days=max(settings.MS_CALENDAR_SYNC_FUTURE_DAYS, 1))


async def get_shared_calendar_token(
    db: AsyncSession,
    *,
    redirect_uri: str,
) -> MicrosoftToken | None:
    rows = (
        await db.execute(
            select(MicrosoftToken).order_by(MicrosoftToken.updated_at.desc(), MicrosoftToken.created_at.desc())
        )
    ).scalars().all()
    expected_email = settings.MS_ORGANIZER_EMAIL.strip().casefold()
    refreshed = False
    for row in rows:
        try:
            if row.expires_at <= datetime.now(timezone.utc) + timedelta(seconds=30):
                token_data = await refresh_access_token(row.refresh_token, redirect_uri)
                row.access_token = token_data["access_token"]
                if token_data.get("refresh_token"):
                    row.refresh_token = token_data["refresh_token"]
                row.scope = token_data.get("scope")
                row.expires_at = compute_expires_at(int(token_data.get("expires_in", 3600)))
                refreshed = True
            profile = await fetch_user_profile(row.access_token)
        except httpx.HTTPError:
            continue
        if microsoft_account_email(profile) == expected_email:
            if refreshed:
                await db.commit()
            return row
    if refreshed:
        await db.commit()
    return None


def parse_graph_datetime(value: Any) -> datetime | None:
    raw = value.get("dateTime") if isinstance(value, dict) else value
    if not raw:
        return None
    try:
        parsed = datetime.fromisoformat(str(raw).replace("Z", "+00:00"))
    except ValueError:
        return None
    if parsed.tzinfo is None:
        parsed = parsed.replace(tzinfo=timezone.utc)
    return parsed.astimezone(timezone.utc)


def graph_attendee_emails(event: dict[str, Any], organizer_email: str) -> list[str]:
    organizer_key = organizer_email.strip().casefold()
    result: list[str] = []
    seen: set[str] = set()
    for attendee in event.get("attendees") or []:
        address = str((attendee.get("emailAddress") or {}).get("address") or "").strip()
        key = address.casefold()
        if not key or key == organizer_key or key in seen:
            continue
        seen.add(key)
        result.append(key)
    return result


def graph_meeting_url(event: dict[str, Any]) -> str | None:
    online = event.get("onlineMeeting") or {}
    return online.get("joinUrl") or event.get("onlineMeetingUrl") or event.get("webLink")


def graph_platform(event: dict[str, Any]) -> str:
    if event.get("isOnlineMeeting") or (event.get("onlineMeeting") or {}).get("joinUrl"):
        return "TEAMS"
    location = str((event.get("location") or {}).get("displayName") or "").strip()
    return location or "OUTLOOK"


def graph_event_categories(event: dict[str, Any]) -> list[str]:
    return [
        str(category).strip()
        for category in (event.get("categories") or [])
        if str(category).strip()
    ]


def is_annual_leave_title_or_categories(title: str | None, categories: list[str] | None) -> bool:
    normalized_categories = {
        str(category).strip().casefold()
        for category in (categories or [])
        if str(category).strip()
    }
    if "pv" in normalized_categories:
        return True
    return re.search(r"(?<![A-Z0-9])PV(?![A-Z0-9])", str(title or ""), flags=re.IGNORECASE) is not None


def is_annual_leave_event(event: dict[str, Any]) -> bool:
    categories = graph_event_categories(event)
    return is_annual_leave_title_or_categories(event.get("subject"), categories)


def choose_department_id(
    participants: list[User],
    departments: list[Department],
) -> Any | None:
    counts = Counter(user.department_id for user in participants if user.department_id is not None)
    if counts:
        return sorted(counts.items(), key=lambda item: (-item[1], str(item[0])))[0][0]
    default_code = settings.MS_CALENDAR_DEFAULT_DEPARTMENT_CODE.strip().casefold()
    default = next((department for department in departments if department.code.casefold() == default_code), None)
    return default.id if default is not None else (departments[0].id if departments else None)


async def sync_external_calendar_events(
    db: AsyncSession,
    *,
    access_token: str,
    connected_by_user_id: Any,
    start: datetime,
    end: datetime,
) -> MicrosoftCalendarSyncResult:
    async with _sync_lock:
        events = await fetch_calendar_events(access_token, start, end)
        users = list((await db.execute(select(User).where(User.is_active.is_(True)))).scalars().all())
        departments = list((await db.execute(select(Department).order_by(Department.name))).scalars().all())
        users_by_email = {user.email.strip().casefold(): user for user in users if user.email}

        existing_rows = list(
            (
                await db.execute(
                    select(Meeting).where(Meeting.microsoft_event_id.is_not(None))
                )
            ).scalars().all()
        )
        existing_by_event_id = {
            str(row.microsoft_event_id): row for row in existing_rows if row.microsoft_event_id
        }
        existing_participant_ids_by_meeting: dict[Any, set[Any]] = {}
        if existing_rows:
            participant_rows = list(
                (
                    await db.execute(
                        select(MeetingParticipant).where(
                            MeetingParticipant.meeting_id.in_([row.id for row in existing_rows])
                        )
                    )
                ).scalars().all()
            )
            for participant_row in participant_rows:
                existing_participant_ids_by_meeting.setdefault(
                    participant_row.meeting_id, set()
                ).add(participant_row.user_id)
        seen_event_ids: set[str] = set()
        unchanged_meeting_ids: list[Any] = []
        now = datetime.now(timezone.utc)
        created = updated = cancelled = skipped = 0

        for event in events:
            event_id = str(event.get("id") or "").strip()
            if not event_id:
                skipped += 1
                continue
            seen_event_ids.add(event_id)
            row = existing_by_event_id.get(event_id)
            categories = graph_event_categories(event)
            if is_annual_leave_event(event):
                if row is not None:
                    row.calendar_imported = True
                    row.calendar_sync_status = "excluded"
                    row.calendar_categories = categories
                    row.calendar_change_key = event.get("changeKey")
                    row.calendar_last_synced_at = now
                skipped += 1
                continue
            if event.get("isCancelled"):
                if row is not None and row.calendar_sync_status != "cancelled":
                    row.calendar_imported = True
                    row.calendar_sync_status = "cancelled"
                    row.calendar_last_synced_at = now
                    cancelled += 1
                continue

            starts_at = parse_graph_datetime(event.get("start"))
            ends_at = parse_graph_datetime(event.get("end"))
            if starts_at is None:
                skipped += 1
                continue

            attendee_emails = graph_attendee_emails(event, settings.MS_ORGANIZER_EMAIL)
            participants = [users_by_email[email] for email in attendee_emails if email in users_by_email]
            mapped_department_id = choose_department_id(participants, departments)
            change_key = event.get("changeKey")
            if (
                row is not None
                and row.calendar_imported
                and row.calendar_sync_status == "active"
                and change_key
                and row.calendar_change_key == change_key
                and (row.calendar_categories or []) == categories
            ):
                unchanged_meeting_ids.append(row.id)
                continue
            if row is None:
                if mapped_department_id is None:
                    skipped += 1
                    continue
                row = Meeting(
                    title=str(event.get("subject") or "External meeting")[:200],
                    platform=graph_platform(event),
                    starts_at=starts_at,
                    ends_at=ends_at,
                    meeting_url=graph_meeting_url(event),
                    microsoft_event_id=event_id,
                    meeting_type="external",
                    department_id=mapped_department_id,
                    created_by=connected_by_user_id,
                    calendar_imported=True,
                    calendar_sync_status="active",
                    calendar_change_key=change_key,
                    calendar_categories=categories,
                    calendar_last_synced_at=now,
                )
                db.add(row)
                await db.flush()
                existing_by_event_id[event_id] = row
                created += 1
            else:
                was_calendar_imported = bool(row.calendar_imported)
                row.title = str(event.get("subject") or "External meeting")[:200]
                row.platform = graph_platform(event)
                row.starts_at = starts_at
                row.ends_at = ends_at
                row.meeting_url = graph_meeting_url(event)
                row.meeting_type = "external"
                row.calendar_imported = True
                row.calendar_sync_status = "active"
                row.calendar_change_key = change_key
                row.calendar_categories = categories
                row.calendar_last_synced_at = now
                if was_calendar_imported and mapped_department_id is not None:
                    row.department_id = mapped_department_id
                updated += 1

            # Calendar attendees are added automatically, while PrimeFlow users
            # assigned manually remain assigned across subsequent syncs.
            existing_participant_ids = existing_participant_ids_by_meeting.setdefault(row.id, set())
            for participant in participants:
                if participant.id in existing_participant_ids:
                    continue
                db.add(MeetingParticipant(meeting_id=row.id, user_id=participant.id))
                existing_participant_ids.add(participant.id)

        if unchanged_meeting_ids:
            await db.execute(
                update(Meeting)
                .where(Meeting.id.in_(unchanged_meeting_ids))
                .values(calendar_last_synced_at=now)
            )

        for row in existing_rows:
            if not row.calendar_imported or not row.microsoft_event_id or row.calendar_sync_status == "cancelled":
                continue
            if row.starts_at is None or not (start <= row.starts_at < end):
                row.calendar_sync_status = "out_of_window"
                row.calendar_last_synced_at = now
                continue
            if str(row.microsoft_event_id) not in seen_event_ids:
                row.calendar_sync_status = "cancelled"
                row.calendar_last_synced_at = now
                cancelled += 1

        await db.commit()
        return MicrosoftCalendarSyncResult(
            fetched=len(events),
            created=created,
            updated=updated,
            cancelled=cancelled,
            skipped=skipped,
        )
