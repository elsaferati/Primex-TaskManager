from datetime import date, datetime
from zoneinfo import ZoneInfo

import pytest

from app.services.daily_rlz_compliance import (
    REASON_LABELS, is_editable_day, next_working_day, task_issue_codes,
)
from app.services.daily_rlz_control_delivery import render_plain


DAY = date(2026, 8, 12)


@pytest.mark.parametrize(
    "status,reason,due,is_1h,slot,expected",
    [
        ("TODO", None, date(2026, 8, 13), False, None, ["REASON_MISSING"]),
        ("IN_PROGRESS", None, date(2026, 8, 13), False, None, ["REASON_MISSING"]),
        ("TODO", "OTHER", DAY, False, None, ["DUE_DATE_NOT_MOVED"]),
        ("IN_PROGRESS", "WAITING_CLIENT", date(2026, 8, 13), False, None, []),
        ("TODO", "OTHER", date(2026, 8, 13), True, None, ["ONE_H_SLOT_MISSING"]),
        ("TODO", "OTHER", date(2026, 8, 13), True, "10:00", []),
        ("TODO", "OTHER", date(2026, 8, 13), False, None, []),
        ("DONE", None, DAY, True, None, []),
        ("WAITING_CONFIRMATION", None, DAY, True, None, []),
        ("TODO", "OTHER", date(2026, 8, 11), False, None, ["DUE_DATE_NOT_MOVED"]),
    ],
)
def test_daily_rlz_task_rules(status, reason, due, is_1h, slot, expected):
    assert task_issue_codes(status=status, reason_code=reason, due_date=due,
                            is_1h_report=is_1h, one_h_report_slot=slot, day=DAY) == expected


def test_friday_moves_to_monday():
    assert next_working_day(date(2026, 8, 14)) == date(2026, 8, 17)
    assert task_issue_codes(status="TODO", reason_code="OTHER", due_date=date(2026, 8, 17),
                            is_1h_report=False, one_h_report_slot=None, day=date(2026, 8, 14)) == []


def test_reason_codes_are_stable_and_complete():
    assert len(REASON_LABELS) == 10
    assert REASON_LABELS["WAITING_CLIENT"] == "Në pritje të klientit"


def test_edit_window_uses_tirana_and_closes_at_1700():
    tz = ZoneInfo("Europe/Tirane")
    assert is_editable_day(DAY, datetime(2026, 8, 12, 16, 59, tzinfo=tz))
    assert not is_editable_day(DAY, datetime(2026, 8, 12, 17, 0, tzinfo=tz))


def test_all_good_report_is_still_rendered():
    report = {"day": DAY.isoformat(), "all_good": True, "people": [], "summary": {
        "departments_checked": 5, "employees_checked": 12, "employees_not_saved": 0,
        "employees_stale": 0, "tasks_missing_reason": 0,
        "tasks_deadline_not_moved": 0, "tasks_missing_slot": 0,
    }}
    assert "Kontrolli ditor RLZ përfundoi pa probleme." in render_plain(report)


def test_control_email_contains_task_evidence():
    report = {"day": DAY.isoformat(), "all_good": False, "summary": {
        "departments_checked": 1, "employees_checked": 1, "employees_not_saved": 1,
        "employees_stale": 0, "tasks_missing_reason": 1,
        "tasks_deadline_not_moved": 1, "tasks_missing_slot": 0,
    }, "people": [{"department": "Development", "employee": "Elsa", "rlz_close_state": {"status": "NOT_SAVED"},
        "blockers": [{"title": "Task", "status": "TODO", "due_date": DAY.isoformat(),
                      "one_h_report_slot": None, "reason_label": None, "comment": None,
                      "issues": [{"code": "REASON_MISSING", "message": "Mungon arsyeja"}]}]}]}
    body = render_plain(report)
    assert "Development" in body and "Deadline: 2026-08-12" in body and "Mungon arsyeja" in body
