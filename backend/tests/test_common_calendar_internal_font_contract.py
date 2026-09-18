from pathlib import Path


def test_calendar_internal_meeting_titles_are_muted_in_both_views():
    source = (Path(__file__).resolve().parents[2] / "frontend/src/app/(app)/common/page.tsx").read_text(encoding="utf-8")
    assert 'isCalendarLinkedInternalMeeting(e) ? "calendar-internal-muted" : ""' in source
    assert 'row.id === "internal" && cell.isCalendarMeeting ? "calendar-internal-muted" : ""' in source
    assert '.week-table-entry.calendar-internal-muted .week-table-meeting-title' in source
    assert '.swimlane-cell.calendar-internal-muted .swimlane-title' in source
