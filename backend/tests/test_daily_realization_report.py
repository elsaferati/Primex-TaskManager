import os
from datetime import date, datetime, timezone
from types import SimpleNamespace

os.environ.setdefault("DATABASE_URL", "postgresql+asyncpg://test:test@localhost/test")
os.environ.setdefault("JWT_SECRET", "test-secret-that-is-long-enough-for-tests")

from app.services.daily_realization_report import _task_row, report_delta
from app.services.daily_rlz_control_delivery import render_html, render_plain, subject_for


DAY = date(2026, 8, 17)


def _source(**overrides):
    values = {
        "title": "Task",
        "status": "TODO",
        "completed_at": None,
        "due_date": datetime(2026, 8, 18, 12, tzinfo=timezone.utc),
        "original_due_date": datetime(2026, 8, 17, 12, tzinfo=timezone.utc),
        "system_template_origin_id": None,
        "project_id": "project-1",
        "one_h_report_slot": None,
    }
    values.update(overrides)
    return SimpleNamespace(**values)


def _state(reason="WAITING_CLIENT", comment="Në pritje të përgjigjes"):
    return SimpleNamespace(reason_code=reason, comment=comment)


def test_task_row_classifies_carryover_and_postponement_deterministically():
    row = _task_row(
        {"task_id": "task-1", "title": "Integrimi", "status": "IN_PROGRESS", "attribution": "planned_today"},
        source=_source(), state=_state(), compliance=None, day=DAY,
    )

    assert row["planned_today"] is True
    assert row["carryover_next_day"] is True
    assert row["postponed"] is True
    assert row["reason_label"]
    assert row["comment"] == "Në pritje të përgjigjes"


def test_task_row_marks_completed_extra_work():
    row = _task_row(
        {"task_id": "task-2", "title": "Urgjencë", "status": "DONE", "attribution": "added_after_weekly_plan"},
        source=_source(completed_at=datetime(2026, 8, 17, 14, tzinfo=timezone.utc)),
        state=None, compliance=None, day=DAY,
    )

    assert row["completed_today"] is True
    assert row["extra"] is True
    assert row["status"] == "DONE"


def test_task_row_prefers_live_task_state_over_stale_snapshot_state():
    row = _task_row(
        {"task_id": "task-3", "title": "Live", "status": "TODO", "classification": "no_progress"},
        source=_source(status="IN_PROGRESS"), state=None, compliance=None, day=DAY,
    )

    assert row["status"] == "IN_PROGRESS"
    assert row["classification"] == "in_progress"


def _report(comment="Fillestar"):
    task = {
        "task_id": "task-1", "title": "Integrimi", "status": "IN_PROGRESS",
        "planned_today": True, "completed_today": False, "extra": False,
        "carryover_next_day": True, "postponed": False,
        "planned_due_date": DAY.isoformat(), "due_date": "2026-08-18",
        "reason_code": "WAITING_CLIENT", "reason_label": "Në pritje të klientit",
        "comment": comment, "one_h_report_slot": None, "issues": [],
        "flags": ["planned_today", "carryover_next_day"],
    }
    return {
        "content_version": 2, "variant": "FINAL", "day": DAY.isoformat(),
        "summary": {}, "all_good": False, "narrative": None,
        "people": [{
            "user_id": "user-1", "employee": "Elsa", "department_id": "dep-1",
            "department": "Development", "daily_progress_percent": 50,
            "weekly_progress_percent": 60, "rlz_close_state": {"status": "SAVED"},
            "manager_approval": {"status": "APPROVED"},
            "tasks": [task], "narrative": None,
        }],
    }


def test_correction_contains_only_material_changes():
    before = _report()
    unchanged = report_delta(before, _report())
    assert unchanged["variant"] == "CORRECTION"
    assert unchanged["people"] == []

    changed = report_delta(before, _report(comment="Klienti u përgjigj"))
    assert len(changed["people"]) == 1
    assert changed["people"][0]["tasks"][0]["change_type"] == "UPDATED"


def test_final_email_contains_comparison_reason_and_comment():
    report = _report()
    report["summary"] = {
        "planned_today": 1, "completed_today": 0, "unfinished": 1,
        "extras": 0, "carryover_next_day": 1, "postponed": 0,
    }

    plain = render_plain(report, "16:30")
    html = render_html(report, "16:30")

    assert "Realizimi ditor FINAL" in subject_for(DAY, "16:30", "FINAL")
    assert "Integrimi" in plain and "Në pritje të klientit" in plain and "Fillestar" in plain
    assert "Integrimi" in html and "16:30" in html
