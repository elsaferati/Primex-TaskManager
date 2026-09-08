from types import SimpleNamespace

from app.services.meeting_palette import meeting_report_color, meeting_report_tone


def test_outlook_category_names_use_common_view_palette() -> None:
    assert meeting_report_tone({"calendarCategories": ["Red category"]}) == "meeting-red"
    assert meeting_report_tone({"calendarCategories": ["DAILY/WEEKLY", "Yellow category"]}) == "meeting-brown"
    assert meeting_report_tone({"calendarCategories": ["EVVENT/FIZIK"]}) == "meeting-teal"
    assert meeting_report_tone({"calendarCategories": ["Blue category"]}) == "meeting-blue"
    assert meeting_report_tone({"calendarCategories": ["TAK INT"]}) == "meeting-yellow"
    assert meeting_report_tone({"calendarCategories": ["Orange category"]}) == "meeting-orange"


def test_uncategorized_imported_meeting_uses_external_online_red() -> None:
    meeting = SimpleNamespace(
        calendar_categories=[],
        calendar_imported=True,
        microsoft_event_id="event-1",
        meeting_type="external",
        recurrence_type="none",
    )

    assert meeting_report_tone(meeting) == "meeting-red"
    assert meeting_report_color(meeting) == "#FFD5DC"


def test_local_internal_and_weekly_fallbacks_match_common_view() -> None:
    assert meeting_report_tone({}, meeting_type="internal") == "meeting-yellow"
    assert meeting_report_tone({"recurrence_type": "weekly"}, meeting_type="external") == "meeting-brown"
