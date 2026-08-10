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

    before = struck_points(before_text, field_name=field_name)
    after = struck_points(after_text, field_name=field_name)
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
    """Split title/description text into points while retaining legacy marks."""

    raw = value or ""
    cleaned = TECHNICAL_TAGS.sub("", raw).strip()
    matches = list(CHECKLIST_ITEM.finditer(cleaned))
    if not matches:
        points = [cleaned] if cleaned else []
        heading = ""
    else:
        heading = cleaned[:matches[0].start()].strip()
        points = [
            cleaned[match.start():matches[index + 1].start() if index + 1 < len(matches) else len(cleaned)].strip()
            for index, match in enumerate(matches)
        ]
    legacy_done = set(struck_points(raw, field_name=field_name))
    return heading, [
        StrikePoint(point_key(text, field_name=field_name), text) for text in points if text
    ], legacy_done


def render_text_for_interval(
    text: str | None,
    events: Iterable[TaskStrikeEvent],
    *,
    interval_start: datetime,
    interval_end: datetime,
    field_name: str = "DESCRIPTION",
) -> tuple[str, str]:
    """Return plain and marked text for a 1H report interval.

    Open points are always shown. A point struck during this interval is shown
    once with a strike-through; an older struck point is omitted. Reopening a
    point makes it open and visible again immediately.
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

    heading, points, legacy_done = _text_points(text, field_name=field_name)
    plain_parts = [heading] if heading else []
    marked_parts = [heading] if heading else []
    for point in points:
        event = event_for_point(point)
        if event is None:
            # A mark without a timestamp cannot be claimed as work from this
            # interval. Treat it as historical and omit it, rather than showing
            # a misleading new strike in every following 1H report.
            if point.key in legacy_done:
                continue
            else:
                plain_parts.append(point.text)
                marked_parts.append(point.text)
            continue
        if event.action == "STRUCK":
            if interval_start < event.occurred_at <= interval_end:
                plain_parts.append(point.text)
                marked_parts.append(f"[[done]]{point.text}[[/done]]")
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
