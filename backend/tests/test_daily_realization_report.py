import os
import asyncio
import uuid
from datetime import date
from types import SimpleNamespace

os.environ.setdefault("DATABASE_URL", "postgresql+asyncpg://test:test@localhost/test")
os.environ.setdefault("JWT_SECRET", "test-secret-that-is-long-enough-for-tests")

from app.services import daily_realization_report as report_service
from app.services.daily_realization_report import _build_authoritative_report, _summary, report_delta
from app.services.daily_rlz_control_delivery import (
    DEFAULT_VARIANT_TIMES, _deadline_display, final_recipient_map, render_html, render_plain, subject_for,
)

DAY = date(2026, 8, 17)


def _metrics():
    return {
        "original_planned_count": 1, "planned_completed_today_count": 0,
        "in_progress_count": 1, "postponed_count": 0, "no_progress_count": 0,
        "additional_completed_count": 0, "total_completed_today_count": 0,
        "raw_plan_realization": 0.0, "adjusted_plan_realization": 0.0,
        "deadlines_today_count": 1, "deadlines_completed_count": 0,
        "deadlines_postponed_count": 0, "deadlines_open_count": 1,
        "overdue_open_count": 0, "critical_deadlines_open_count": 0,
        "deadline_compliance_percentage": 0.0, "daily_control_state": "ACTION_REQUIRED",
    }


def _report(comment="Fillestar"):
    task = {
        "task_id": "task-1", "title": "Integrimi", "status": "IN_PROGRESS",
        "current_status": "IN_PROGRESS", "classification": "IN_PROGRESS",
        "in_original_plan": True, "planned_today": True, "completed_today": False,
        "extra": False, "postponed": False, "postponed_today": False,
        "original_daily_plan": DAY.isoformat(), "planned_due_date": DAY.isoformat(),
        "due_date": "2026-08-18", "reason_code": "WAITING_CLIENT",
        "reason_label": "Në pritje të klientit", "comment": comment,
        "one_h_report_slot": None, "issues": [], "flags": [],
        "deadline_was_today": True, "deadline_completed": False,
        "deadline_is_overdue": False, "deadline_critical": False,
        "action_required": True, "is_bllok": False,
    }
    metrics = _metrics()
    return {
        "content_version": 3, "variant": "FINAL", "day": DAY.isoformat(),
        "summary": {**metrics, "employees_checked": 1}, "all_good": False,
        "people": [{
            "user_id": "user-1", "employee": "Elsa", "department_id": "dep-1",
            "department": "Development", "daily_progress_percent": 0,
            "weekly_progress_percent": 0, "rlz_close_state": {"status": "SAVED"},
            "manager_approval": {"status": "APPROVED"}, "control_state": "ACTION_REQUIRED",
            "metrics": metrics, "tasks": [task], "narrative": None,
        }], "narrative": None,
    }


def test_report_variant_schedule_and_required_recipients():
    assert DEFAULT_VARIANT_TIMES == {"PRECHECK": "16:10", "FINAL": "16:40", "CORRECTION": "17:05"}
    merged = final_recipient_map({"to": ["GA@primexeu.com"], "cc": ["ga@primexeu.com"], "bcc": ["extra@example.com"]})
    flattened = [email.casefold() for values in merged.values() for email in values]
    assert flattened.count("ga@primexeu.com") == 1
    assert flattened.count("130primex.eu@gmail.com") == 1


def test_authoritative_summary_uses_shared_daily_metrics():
    summary = _summary(_report()["people"])
    assert summary["original_planned_count"] == 1
    assert summary["in_progress_count"] == 1
    assert summary["deadlines_today_count"] == 1
    assert summary["deadline_compliance_percentage"] == 0.0


def test_correction_contains_only_material_changes():
    before = _report()
    assert report_delta(before, _report())["people"] == []
    changed = report_delta(before, _report(comment="Klienti u përgjigj"))
    assert changed["people"][0]["tasks"][0]["change_type"] == "UPDATED"


def test_final_email_contains_complete_manager_story_and_semantic_colors():
    report = _report()
    plain, html = render_plain(report, "16:40"), render_html(report, "16:40")
    assert subject_for(DAY, "16:40", "FINAL") == "[PrimeFlow] Realizimi ditor FINAL - 17/08/2026 - 16:40"
    for value in ("Plan Realization", "Deadline Compliance", "ACTION_REQUIRED", "Manager Approval", "Integrimi", "Në pritje të klientit", "Fillestar"):
        assert value in plain
    for value in ("DONE FROM PLAN", "IN PROGRESS", "DEADLINE TODAY", "Deadline Control", "Elsa", "Development"):
        assert value in html
    assert "#FFFF00" in html
    assert "BLOCKED" not in html


def test_bll_is_metadata_not_blocked_or_red():
    report = _report()
    report["people"][0]["tasks"][0]["is_bllok"] = True
    html = render_html(report, "16:40")
    assert "BLL" in html and "BLOCKED" not in html and "#FFFF00" in html


def test_final_email_uses_done_todo_and_critical_deadline_colors():
    report = _report()
    base = report["people"][0]["tasks"][0]
    done = {**base, "task_id": "done", "title": "Done", "status": "DONE", "classification": "REALIZED_AS_PLANNED", "deadline_completed": True}
    todo = {**base, "task_id": "todo", "title": "Todo", "status": "TODO", "classification": "NO_PROGRESS", "deadline_critical": True}
    report["people"][0]["tasks"] = [done, todo]
    html = render_html(report, "16:40")
    assert "#C4FDC4" in html and "#FFC4ED" in html and "#DC2626" in html


def test_deadline_display_distinguishes_future_plan_and_move_back_history():
    assert _deadline_display({"planned_due_date": "2026-08-29", "due_date": "2026-08-29", "timeline": []}) == "2026-08-29"
    assert _deadline_display({"timeline": [
        {"type": "POSTPONED", "old_value": "2026-08-26", "new_value": "2026-08-27"},
        {"type": "MOVED_BACK_TO_TODAY", "old_value": "2026-08-27", "new_value": "2026-08-26"},
    ]}) == "2026-08-26 → 2026-08-27 → 2026-08-26"


def test_final_builder_consumes_live_metrics_and_day_scoped_compliance(monkeypatch):
    user_id, department_id = uuid.uuid4(), uuid.uuid4()
    user = SimpleNamespace(id=user_id, department_id=department_id, full_name="DV", username="dv", email="dv@example.com")
    department = SimpleNamespace(id=department_id, name="PCM")

    class Scalars:
        def __init__(self, values): self.values = values
        def all(self): return self.values
    class Result:
        def __init__(self, values): self.values = values
        def scalars(self): return Scalars(self.values)
    class Db:
        def __init__(self): self.results = [[user], [department]]
        async def execute(self, _statement): return Result(self.results.pop(0))

    task = dict(_report()["people"][0]["tasks"][0])
    task.update({
        "current_status": "IN_PROGRESS", "baseline_due_date": DAY.isoformat(),
        "current_due_date": "2026-08-18", "project_title": "PrimeFlow",
    })
    live_metrics = _metrics()

    async def live(*_args, **_kwargs):
        return {"baseline_available": True, "people": [{"user_id": str(user_id), "tasks": [task], "metrics": live_metrics}]}
    async def compliance(*_args, **_kwargs):
        return {
            "tasks": [{"task_id": "task-1", "reason_label": "Në pritje të klientit", "one_h_report_slot": None}],
            "blockers": [], "rlz_close_state": {"status": "SAVED"},
            "manager_approval": {"status": "APPROVED"},
        }
    monkeypatch.setattr(report_service, "build_live_daily_realization", live)
    monkeypatch.setattr(report_service, "build_daily_rlz_compliance", compliance)

    report = asyncio.run(_build_authoritative_report(Db(), day=DAY, variant="FINAL"))
    person = report["people"][0]
    assert person["metrics"] == live_metrics
    assert person["tasks"][0]["comment"] == "Fillestar"
    assert person["tasks"][0]["reason_label"] == "Në pritje të klientit"
    assert report["summary"]["original_planned_count"] == live_metrics["original_planned_count"]
