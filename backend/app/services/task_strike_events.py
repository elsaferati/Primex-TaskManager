from __future__ import annotations

import hashlib
import re
import uuid
from dataclasses import dataclass
from datetime import datetime
from typing import Iterable

from sqlalchemy.ext.asyncio import AsyncSession

from app.models.task_strike_event import TaskStrikeEvent


DONE_BLOCK = re.compile(r"\[\[\s*done\s*\]\](.*?)\[\[\s*/\s*done\s*\]\]", re.IGNORECASE | re.DOTALL)
TECHNICAL_TAGS = re.compile(r"\[\[\s*/?\s*(?:added|done)\s*\]\]", re.IGNORECASE)
# Checklist points can be numbered or use the bullet controls in PX/GA notes.
CHECKLIST_ITEM = re.compile(r"(?m)^\s*(?:\d+\.\s+|[•*-]\s+)")


@dataclass(frozen=True)
class StrikePoint:
    key: str
    text: str
    legacy_key: str = ""


@dataclass(frozen=True)
class StrikeState:
    action: str
    occurred_at: datetime


def _normalise(value: str) -> str:
    return " ".join(value.split())


def point_key(value: str, *, field_name: str = "DESCRIPTION") -> str:
    # Keep existing description keys stable. New title keys are deliberately
    # separate because a title and description can contain identical text.
    source = _normalise(value).casefold()
    if field_name != "DESCRIPTION":
        source = f"{field_name}|{source}"
    return hashlib.sha256(source.encode("utf-8")).hexdigest()


def _point_identity_key(value: str, occurrence: int, *, field_name: str) -> str:
    """Key a point by its content and duplicate occurrence, so bullets differ."""

    source = f"{field_name}|{occurrence}|{_normalise(value).casefold()}"
    return hashlib.sha256(source.encode("utf-8")).hexdigest()


def _numbered_points(value: str) -> list[str]:
    cleaned = TECHNICAL_TAGS.sub("", value or "").strip()
    matches = list(CHECKLIST_ITEM.finditer(cleaned))
    if not matches:
        return [cleaned] if cleaned else []
    return [
        cleaned[match.start():matches[index + 1].start() if index + 1 < len(matches) else len(cleaned)].strip()
        for index, match in enumerate(matches)
    ]


def _numbered_point_spans(value: str) -> list[tuple[int, int]]:
    """Return checklist-line ranges using offsets from the original marked text.

    The browser may wrap only the selected part of a numbered line in
    ``[[done]]`` tags.  Replacing tags with spaces preserves its offsets so a
    partial selection can still be associated with its complete checklist item.
    """

    raw = value or ""
    masked = TECHNICAL_TAGS.sub(lambda match: " " * len(match.group(0)), raw)
    matches = list(CHECKLIST_ITEM.finditer(masked))
    return [
        (match.start(), matches[index + 1].start() if index + 1 < len(matches) else len(raw))
        for index, match in enumerate(matches)
    ]


def _point_entries(value: str | None, *, field_name: str) -> list[tuple[StrikePoint, int, int]]:
    """Return point text with offsets so selected lines can be identified."""

    raw = value or ""
    masked = TECHNICAL_TAGS.sub(lambda match: " " * len(match.group(0)), raw)
    checklist_matches = list(CHECKLIST_ITEM.finditer(masked))
    if checklist_matches:
        spans = [
            (match.start(), checklist_matches[index + 1].start() if index + 1 < len(checklist_matches) else len(raw))
            for index, match in enumerate(checklist_matches)
        ]
    else:
        # Plain multiline text has one independently strikable point per line.
        spans = [(match.start(), match.end()) for match in re.finditer(r"(?m)^.*\S.*$", masked)]

    entries: list[tuple[StrikePoint, int, int]] = []
    occurrences: dict[str, int] = {}
    for start, end in spans:
        text = TECHNICAL_TAGS.sub("", raw[start:end]).strip()
        if not text:
            continue
        normalized = _normalise(text).casefold()
        occurrence = occurrences.get(normalized, 0)
        occurrences[normalized] = occurrence + 1
        entries.append((
            StrikePoint(
                _point_identity_key(text, occurrence, field_name=field_name),
                text,
                point_key(text, field_name=field_name),
            ),
            start,
            end,
        ))
    return entries


def _struck_points_by_identity(value: str | None, *, field_name: str) -> dict[str, StrikePoint]:
    """Return currently struck points using the position-aware key."""

    raw = value or ""
    entries = _point_entries(raw, field_name=field_name)
    result: dict[str, StrikePoint] = {}
    for match in DONE_BLOCK.finditer(raw):
        done_start, done_end = match.span()
        for point, start, end in entries:
            if start < done_end and done_start < end:
                result[point.key] = point
    return result


def struck_points(value: str | None, *, field_name: str = "DESCRIPTION") -> dict[str, StrikePoint]:
    """Return the individual checklist points currently wrapped in [[done]]."""

    raw = value or ""
    result: dict[str, StrikePoint] = {}
    numbered_spans = _numbered_point_spans(raw)
    for match in DONE_BLOCK.finditer(raw):
        done_start, done_end = match.span()
        affected_spans = [
            (start, end)
            for start, end in numbered_spans
            if start < done_end and done_start < end
        ]
        # A partial selection still represents the complete numbered line.
        # For non-numbered text, retain the existing selection-level behavior.
        texts = (
            [TECHNICAL_TAGS.sub("", raw[start:end]).strip() for start, end in affected_spans]
            if affected_spans else _numbered_points(match.group(1))
        )
        for text in texts:
            if not text:
                continue
            key = point_key(text, field_name=field_name)
            result[key] = StrikePoint(key, text)
    return result


def record_text_strike_events(
    db: AsyncSession,
    *,
    task_id: uuid.UUID,
    actor_user_id: uuid.UUID | None,
    before_text: str | None,
    after_text: str | None,
    field_name: str,
) -> None:
    """Queue events only for actual done/un-done transitions in task points."""

    before = _struck_points_by_identity(before_text, field_name=field_name)
    after = _struck_points_by_identity(after_text, field_name=field_name)
    for key in after.keys() - before.keys():
        point = after[key]
        db.add(TaskStrikeEvent(
            task_id=task_id,
            actor_user_id=actor_user_id,
            field_name=field_name,
            point_key=key,
            point_text=point.text,
            action="STRUCK",
        ))
    for key in before.keys() - after.keys():
        point = before[key]
        db.add(TaskStrikeEvent(
            task_id=task_id,
            actor_user_id=actor_user_id,
            field_name=field_name,
            point_key=key,
            point_text=point.text,
            action="UNSTRUCK",
        ))


def record_description_strike_events(
    db: AsyncSession,
    *,
    task_id: uuid.UUID,
    actor_user_id: uuid.UUID | None,
    before_description: str | None,
    after_description: str | None,
) -> None:
    record_text_strike_events(
        db,
        task_id=task_id,
        actor_user_id=actor_user_id,
        before_text=before_description,
        after_text=after_description,
        field_name="DESCRIPTION",
    )


def record_title_strike_events(
    db: AsyncSession,
    *,
    task_id: uuid.UUID,
    actor_user_id: uuid.UUID | None,
    before_title: str | None,
    after_title: str | None,
) -> None:
    record_text_strike_events(
        db,
        task_id=task_id,
        actor_user_id=actor_user_id,
        before_text=before_title,
        after_text=after_title,
        field_name="TITLE",
    )


def _text_points(value: str | None, *, field_name: str) -> tuple[str, list[StrikePoint], set[str]]:
    """Split text into report points, keeping numbered headings out of the list."""

    raw = value or ""
    cleaned = TECHNICAL_TAGS.sub("", raw).strip()
    matches = list(CHECKLIST_ITEM.finditer(cleaned))
    heading = cleaned[:matches[0].start()].strip() if matches else ""
    points = [point for point, _start, _end in _point_entries(raw, field_name=field_name)]
    current_done = set(_struck_points_by_identity(raw, field_name=field_name))
    return heading, points, current_done


def render_text_for_interval(
    text: str | None,
    events: Iterable[TaskStrikeEvent],
    *,
    interval_start: datetime,
    interval_end: datetime,
    field_name: str = "DESCRIPTION",
) -> tuple[str, str]:
    """Return plain and colour-marked text for a 1H report interval.

    Open points are always shown. Current-day strikes from this reporting
    interval are blue; earlier strikes from the same day are green; strikes
    from an earlier day are grey. Reopening a point makes it open immediately.
    """

    latest: dict[str, TaskStrikeEvent] = {}
    relevant_events: list[TaskStrikeEvent] = []
    for event in sorted(events, key=lambda item: (item.occurred_at, str(item.id))):
        event_field = getattr(event, "field_name", "DESCRIPTION")
        if event_field == field_name and event.occurred_at <= interval_end:
            latest[event.point_key] = event
            relevant_events.append(event)

    def event_for_point(point: StrikePoint) -> TaskStrikeEvent | None:
        """Find an event even when an older UI save omitted ``1.`` from it."""

        exact = latest.get(point.key)
        if exact is not None:
            return exact
        # Old events only have a text-based key. One such event cannot identify
        # which of several identical bullets was actually struck.
        if sum(candidate.legacy_key == point.legacy_key for candidate in points) != 1:
            return None
        legacy = latest.get(point.legacy_key)
        if legacy is not None:
            return legacy
        full = _normalise(point.text).casefold()
        without_marker = re.sub(r"^(?:\d+\.|[•*-])\s*", "", full)
        compatible = []
        for event in relevant_events:
            event_text = _normalise(getattr(event, "point_text", "")).casefold()
            if not event_text:
                continue
            if event_text in {full, without_marker}:
                compatible.append(event)
        return compatible[-1] if compatible else None

    heading, points, current_done = _text_points(text, field_name=field_name)
    plain_parts = [heading] if heading else []
    marked_parts = [heading] if heading else []
    for point in points:
        event = event_for_point(point)
        if event is None:
            if point.key in current_done:
                plain_parts.append(point.text)
                marked_parts.append(f"[[done:grey]]{point.text}[[/done]]")
            else:
                plain_parts.append(point.text)
                marked_parts.append(point.text)
            continue
        if event.action == "STRUCK":
            occurred_at = event.occurred_at
            if occurred_at.tzinfo is None:
                occurred_at = occurred_at.replace(tzinfo=interval_end.tzinfo)
            local_occurred_at = occurred_at.astimezone(interval_end.tzinfo)
            if local_occurred_at.date() < interval_end.date():
                colour = "grey"
            elif interval_start < occurred_at <= interval_end:
                colour = "blue"
            else:
                colour = "green"
            plain_parts.append(point.text)
            marked_parts.append(f"[[done:{colour}]]{point.text}[[/done]]")
            continue
        plain_parts.append(point.text)
        marked_parts.append(point.text)
    return "\n".join(plain_parts), "\n".join(marked_parts)


def render_description_for_interval(
    description: str | None,
    events: Iterable[TaskStrikeEvent],
    *,
    interval_start: datetime,
    interval_end: datetime,
) -> tuple[str, str]:
    """Backward-compatible description-specific wrapper."""

    return render_text_for_interval(
        description,
        events,
        interval_start=interval_start,
        interval_end=interval_end,
        field_name="DESCRIPTION",
    )
