"""Apple Calendar (ICS) feed for the GA time table.

GA subscribes to the feed once on the iPhone (Settings > Calendar > Accounts >
Add Subscribed Calendar). Each typed time table entry becomes a weekly event
with an alarm at the row start, so the phone shows a native reminder that GA
can close.
"""

from __future__ import annotations

import hashlib
import hmac
import html
import re
import uuid
from datetime import date, datetime, timedelta, timezone

from app.config import settings
from app.models.ga_time_slot_template import GaTimeSlotTemplate

FEED_TIMEZONE = "Europe/Tirane"
FEED_NAME = "PrimeFlow GA Time Table"

_ICS_DAYS = ["MO", "TU", "WE", "TH", "FR", "SA", "SU"]

# Central European Time rules, so iOS does not have to guess the zone.
_VTIMEZONE = [
    "BEGIN:VTIMEZONE",
    f"TZID:{FEED_TIMEZONE}",
    "BEGIN:DAYLIGHT",
    "TZOFFSETFROM:+0100",
    "TZOFFSETTO:+0200",
    "TZNAME:CEST",
    "DTSTART:19700329T020000",
    "RRULE:FREQ=YEARLY;BYMONTH=3;BYDAY=-1SU",
    "END:DAYLIGHT",
    "BEGIN:STANDARD",
    "TZOFFSETFROM:+0200",
    "TZOFFSETTO:+0100",
    "TZNAME:CET",
    "DTSTART:19701025T030000",
    "RRULE:FREQ=YEARLY;BYMONTH=10;BYDAY=-1SU",
    "END:STANDARD",
    "END:VTIMEZONE",
]


def feed_token(user_id: uuid.UUID) -> str:
    message = f"ga-calendar-feed:{user_id}".encode()
    return hmac.new(settings.JWT_SECRET.encode(), message, hashlib.sha256).hexdigest()[:40]


def is_valid_feed_token(token: str, user_id: uuid.UUID) -> bool:
    return hmac.compare_digest(token, feed_token(user_id))


def _plain_text(value: str) -> str:
    text = re.sub(r"<\s*br\s*/?>|</\s*(div|p|li)\s*>", "\n", value or "", flags=re.IGNORECASE)
    text = html.unescape(re.sub(r"<[^>]+>", "", text))
    lines = [re.sub(r"[ \t ]+", " ", line).strip() for line in text.splitlines()]
    return "\n".join(line for line in lines if line)


def _escape(value: str) -> str:
    return (
        value.replace("\\", "\\\\")
        .replace(";", "\\;")
        .replace(",", "\\,")
        .replace("\r\n", "\\n")
        .replace("\n", "\\n")
    )


def _fold(line: str) -> str:
    # RFC 5545: lines longer than 75 octets continue on the next line after a space.
    encoded = line.encode("utf-8")
    if len(encoded) <= 75:
        return line
    parts: list[str] = []
    current = ""
    limit = 75
    for char in line:
        if len((current + char).encode("utf-8")) > limit:
            parts.append(current)
            current = char
            limit = 74
        else:
            current += char
    parts.append(current)
    return "\r\n ".join(parts)


def _utc_stamp(value: datetime | None) -> str:
    moment = value or datetime.now(timezone.utc)
    if moment.tzinfo is None:
        moment = moment.replace(tzinfo=timezone.utc)
    return moment.astimezone(timezone.utc).strftime("%Y%m%dT%H%M%SZ")


def _first_occurrence(entry: GaTimeSlotTemplate) -> date:
    # Start the weekly series on the entry's weekday in the week it was created.
    created = (entry.created_at or datetime.now(timezone.utc)).date()
    week_start = created - timedelta(days=created.weekday())
    return week_start + timedelta(days=entry.day_of_week)


def build_ga_calendar(entries: list[GaTimeSlotTemplate]) -> str:
    lines = [
        "BEGIN:VCALENDAR",
        "VERSION:2.0",
        "PRODID:-//PrimeFlow//GA Time Table//EN",
        "CALSCALE:GREGORIAN",
        "METHOD:PUBLISH",
        f"X-WR-CALNAME:{FEED_NAME}",
        f"X-WR-TIMEZONE:{FEED_TIMEZONE}",
        "REFRESH-INTERVAL;VALUE=DURATION:PT15M",
        "X-PUBLISHED-TTL:PT15M",
        *_VTIMEZONE,
    ]
    for entry in entries:
        summary = _plain_text(entry.content)
        if not summary or not 0 <= entry.day_of_week <= 6:
            continue
        title = summary.splitlines()[0]
        start_day = _first_occurrence(entry)
        end_time = entry.end_time if entry.end_time > entry.start_time else entry.start_time
        start = datetime.combine(start_day, entry.start_time).strftime("%Y%m%dT%H%M%S")
        end = datetime.combine(start_day, end_time).strftime("%Y%m%dT%H%M%S")
        lines += [
            "BEGIN:VEVENT",
            f"UID:ga-time-slot-{entry.id}@primeflow.primexeu.com",
            f"DTSTAMP:{_utc_stamp(entry.updated_at)}",
            f"LAST-MODIFIED:{_utc_stamp(entry.updated_at)}",
            f"DTSTART;TZID={FEED_TIMEZONE}:{start}",
            f"DTEND;TZID={FEED_TIMEZONE}:{end}",
            f"RRULE:FREQ=WEEKLY;BYDAY={_ICS_DAYS[entry.day_of_week]}",
            f"SUMMARY:{_escape(title)}",
            f"DESCRIPTION:{_escape(summary)}",
            "BEGIN:VALARM",
            "ACTION:DISPLAY",
            f"DESCRIPTION:{_escape(title)}",
            "TRIGGER:PT0M",
            "END:VALARM",
            "END:VEVENT",
        ]
    lines.append("END:VCALENDAR")
    return "\r\n".join(_fold(line) for line in lines) + "\r\n"
