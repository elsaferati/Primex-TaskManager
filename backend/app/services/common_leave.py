from __future__ import annotations

import re
from datetime import date

from app.models.common_entry import CommonEntry


def parse_common_view_entry_day(entry: CommonEntry) -> date:
    """Common View stores the operational day in the note, not only entry_date."""
    note = entry.description or ""
    date_match = re.search(r"Date:\s*(\d{4}-\d{2}-\d{2})", note, re.I)
    if date_match:
        return date.fromisoformat(date_match.group(1))
    return entry.entry_date or entry.created_at.date()


def is_common_view_full_day_absence(entry: CommonEntry) -> bool:
    """A timed gap during the day is still work; only a full-day MUNG hides it."""
    note = entry.description or ""
    match = re.search(
        r"From:\s*(\d{1,2}:\d{2})\s*-\s*To:\s*(\d{1,2}:\d{2})", note, re.I
    )
    if not match:
        return True
    start_hour, start_minute = (int(part) for part in match.group(1).split(":"))
    end_hour, end_minute = (int(part) for part in match.group(2).split(":"))
    return start_hour * 60 + start_minute <= 8 * 60 and end_hour * 60 + end_minute >= 16 * 60


def parse_common_view_annual_leave(
    entry: CommonEntry,
) -> tuple[date, date, bool, str | None, str | None, str | None, bool]:
    """PrimeFlow Common View's canonical annual-leave interpretation."""
    note = entry.description or ""
    base_date = entry.entry_date or entry.created_at.date()
    start_date = base_date
    end_date = base_date
    full_day = True
    start_time: str | None = None
    end_time: str | None = None
    is_all_users = False

    if "[ALL_USERS]" in note:
        is_all_users = True
        note = note.replace("[ALL_USERS]", "").strip()

    date_range_match = re.search(r"Date range:\s*(\d{4}-\d{2}-\d{2})\s+to\s+(\d{4}-\d{2}-\d{2})", note, re.I)
    if date_range_match:
        start_date = date.fromisoformat(date_range_match.group(1))
        end_date = date.fromisoformat(date_range_match.group(2))
        note = re.sub(
            r"Date range:\s*\d{4}-\d{2}-\d{2}\s+to\s+\d{4}-\d{2}-\d{2}",
            "",
            note,
            flags=re.I,
        ).strip()
    else:
        date_match = re.search(r"Date:\s*(\d{4}-\d{2}-\d{2})", note, re.I)
        if date_match:
            parsed = date.fromisoformat(date_match.group(1))
            start_date = parsed
            end_date = parsed
            note = re.sub(r"Date:\s*\d{4}-\d{2}-\d{2}", "", note, flags=re.I).strip()
        else:
            date_matches = re.findall(r"\d{4}-\d{2}-\d{2}", note)
            if date_matches:
                start_date = date.fromisoformat(date_matches[0])
                end_date = date.fromisoformat(date_matches[1] if len(date_matches) > 1 else date_matches[0])

    if re.search(r"\(Full day\)", note, re.I):
        full_day = True
        note = re.sub(r"\(Full day\)", "", note, flags=re.I).strip()
    else:
        time_match = re.search(r"\((\d{1,2}:\d{2})\s*-\s*(\d{1,2}:\d{2})\)", note)
        if time_match:
            full_day = False
            start_time = time_match.group(1)
            end_time = time_match.group(2)
            note = re.sub(r"\(\d{1,2}:\d{2}\s*-\s*\d{1,2}:\d{2}\)", "", note).strip()

    cleaned_note = note.strip() if note.strip() else None
    return start_date, end_date, full_day, start_time, end_time, cleaned_note, is_all_users
