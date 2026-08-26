from __future__ import annotations

import inspect
import uuid
from datetime import date, datetime, timezone
from types import SimpleNamespace

import pytest

from app.models.daily_planner_snapshot import DailyPlannerSnapshot
from app.services.daily_realization_baseline import _daily_payload, ensure_daily_baseline
from app.services.daily_realization_classifier import DailyClassificationInput, classify_daily_task
from app.services.daily_realization_events import semantic_local_day
from app.services.daily_realization_explanation import requires_daily_explanation
from app.services.daily_realization_live import candidate_task_ids_for_person, day_bounds, local_day, timeline_from_events
from app.services.daily_realization_metrics import calculate_daily_metrics


DAY = date(2026, 8, 26)


def case(**overrides):
    values = dict(
        day=DAY, in_baseline=True, original_due_date=DAY, current_due_date=DAY,
        created_date=date(2026, 8, 1), completed_date=None, status="TODO",
    )
    values.update(overrides)
    return DailyClassificationInput(**values)


@pytest.mark.parametrize(("value", "expected"), [
    (case(completed_date=DAY, status="DONE"), "REALIZED_AS_PLANNED"),
    (case(), "NO_PROGRESS"),
    (case(status="IN_PROGRESS"), "IN_PROGRESS"),
    (case(status="WAITING_CONFIRMATION"), "WAITING_CONFIRMATION"),
    (case(current_due_date=date(2026, 8, 27), postponed=True), "POSTPONED_UNAPPROVED"),
    (case(current_due_date=date(2026, 8, 29), postponed=True), "POSTPONED_UNAPPROVED"),
    (case(current_due_date=DAY, postponed=False), "NO_PROGRESS"),
    (case(in_baseline=False, original_due_date=date(2026, 8, 25), completed_date=DAY, status="DONE"), "COMPLETED_LATE"),
    (case(in_baseline=False, original_due_date=date(2026, 8, 27), completed_date=DAY, status="DONE"), "COMPLETED_EARLY"),
    (case(in_baseline=False, original_due_date=None, created_date=DAY, completed_date=DAY, status="DONE"), "ADDITIONAL_COMPLETED"),
    (case(in_baseline=False, original_due_date=None, created_date=DAY), "ADDED_DURING_DAY"),
    (case(reopened=True), "REOPENED"),
    (case(reassigned_out=True), "REASSIGNED_OUT"),
    (case(in_baseline=False, reassigned_in=True), "REASSIGNED_IN"),
    (case(blocked=True), "BLOCKED"),
    (case(progress_delta=35), "IN_PROGRESS"),
    (case(current_due_date=date(2026, 8, 27), postponed=True, postponement_approved=True), "POSTPONED_APPROVED"),
])
def test_classification_matrix(value, expected):
    assert classify_daily_task(value) == expected


def test_definition_of_done_metrics_keeps_extra_out_of_raw_denominator():
    rows = (
        [{"classification": "REALIZED_AS_PLANNED", "in_original_plan": True}] * 5
        + [{"classification": "IN_PROGRESS", "in_original_plan": True}]
        + [{"classification": "POSTPONED_UNAPPROVED", "in_original_plan": True}]
        + [{"classification": "NO_PROGRESS", "in_original_plan": True}]
        + [{"classification": "ADDITIONAL_COMPLETED", "in_original_plan": False}] * 2
    )
    metrics = calculate_daily_metrics(rows)
    assert metrics["original_planned_count"] == 8
    assert metrics["planned_completed_today_count"] == 5
    assert metrics["in_progress_count"] == 1
    assert metrics["postponed_count"] == 1
    assert metrics["no_progress_count"] == 1
    assert metrics["additional_completed_count"] == 2
    assert metrics["raw_plan_realization"] == 62.5
    assert metrics["total_completed_today_count"] == 7


def test_adjusted_metric_excludes_only_approved_scope_change():
    rows = (
        [{"classification": "REALIZED_AS_PLANNED", "in_original_plan": True}] * 7
        + [{"classification": "POSTPONED_APPROVED", "in_original_plan": True}] * 2
        + [{"classification": "NO_PROGRESS", "in_original_plan": True}]
    )
    metrics = calculate_daily_metrics(rows)
    assert metrics["raw_plan_realization"] == 70.0
    assert metrics["adjusted_denominator"] == 8
    assert metrics["adjusted_plan_realization"] == 87.5


def test_zero_denominators_are_na_not_false_success():
    metrics = calculate_daily_metrics([])
    assert metrics["raw_plan_realization"] is None
    assert metrics["adjusted_plan_realization"] is None


def test_deadline_metrics_keep_postponed_original_deadline_in_population():
    metrics = calculate_daily_metrics([
        {"classification": "REALIZED_AS_PLANNED", "in_original_plan": True,
         "deadline_was_today": True, "deadline_completed": True},
        {"classification": "POSTPONED_APPROVED", "in_original_plan": True,
         "deadline_was_today": True, "postponed_today": True},
        {"classification": "NO_PROGRESS", "in_original_plan": True,
         "deadline_was_today": True, "action_required": True},
    ])
    assert metrics["deadlines_today_count"] == 3
    assert metrics["deadlines_completed_count"] == 1
    assert metrics["deadlines_postponed_count"] == 1
    assert metrics["deadlines_open_count"] == 1
    assert metrics["deadline_compliance_percentage"] == 33.3
    assert metrics["daily_control_state"] == "ACTION_REQUIRED"


def audit(action, at, old, new):
    return SimpleNamespace(
        id=uuid.uuid4(), action=action, created_at=at, actor_user_id=uuid.uuid4(),
        before={"value": old}, after={"value": new},
    )


def test_timeline_preserves_every_postponement_in_deterministic_order():
    events = [
        audit("task.due_date_changed", datetime(2026, 8, 26, 13, 27, tzinfo=timezone.utc), "2026-08-26", "2026-08-27"),
        audit("task.due_date_changed", datetime(2026, 8, 26, 15, 48, tzinfo=timezone.utc), "2026-08-27", "2026-08-29"),
        audit("task.due_date_changed", datetime(2026, 8, 26, 16, 0, tzinfo=timezone.utc), "2026-08-29", "2026-08-30"),
    ]
    rows = timeline_from_events(
        day=DAY, baseline_task={"match_key": "id:1", "original_daily_plan": DAY.isoformat()},
        events=list(reversed(events)),
    )
    assert [row["type"] for row in rows] == ["PLANNED_FOR_DAY", "POSTPONED", "POSTPONED_AGAIN", "POSTPONED_AGAIN"]
    assert [(row["old_value"], row["new_value"]) for row in rows[1:]] == [
        ("2026-08-26", "2026-08-27"), ("2026-08-27", "2026-08-29"), ("2026-08-29", "2026-08-30"),
    ]


def test_timeline_recognizes_move_back_to_today():
    rows = timeline_from_events(day=DAY, baseline_task=None, events=[
        audit("task.due_date_changed", datetime(2026, 8, 26, 14, tzinfo=timezone.utc), "2026-08-27", "2026-08-26")
    ])
    assert rows[0]["type"] == "MOVED_BACK_TO_TODAY"


def test_daily_payload_uses_canonical_occurrences_and_multi_assignees():
    task_id, a_id, b_id = uuid.uuid4(), uuid.uuid4(), uuid.uuid4()
    payload = _daily_payload({
        "week_start": "2026-08-24",
        "task_items": [{
            "match_key": f"id:{task_id}", "task_id": str(task_id), "title": "Shared",
            "source_type": "project", "planned_due_date": DAY.isoformat(),
            "occurrences": [
                {"day": DAY.isoformat(), "time_slot": "AM", "assignee_id": str(a_id), "assignee_name": "A"},
                {"day": DAY.isoformat(), "time_slot": "PM", "assignee_id": str(b_id), "assignee_name": "B"},
                {"day": "2026-08-27", "time_slot": "AM", "assignee_id": str(a_id), "assignee_name": "A"},
            ],
        }],
    }, DAY)
    assert {row["user_id"] for row in payload["people"]} == {str(a_id), str(b_id)}
    assert all(len(row["tasks"]) == 1 for row in payload["people"])


def test_baseline_model_and_service_enforce_immutability_by_construction():
    constraints = {constraint.name for constraint in DailyPlannerSnapshot.__table__.constraints}
    assert "uq_daily_planner_snapshot_department_day" in constraints
    source = inspect.getsource(ensure_daily_baseline)
    assert "on_conflict_do_nothing" in source
    assert ".payload =" not in source


def test_tirana_midnight_boundary_is_not_naive_utc():
    # 22:30 UTC is 00:30 on the next local summer day in Tirana.
    assert local_day(datetime(2026, 8, 25, 22, 30, tzinfo=timezone.utc)) == DAY
    start, end = day_bounds(DAY)
    assert start == datetime(2026, 8, 25, 22, 0, tzinfo=timezone.utc)
    assert end.date() == DAY


def test_semantic_due_date_direction_uses_local_day_not_iso_string_order():
    assert semantic_local_day("2026-08-25T22:30:00+00:00") == DAY
    assert semantic_local_day("2026-08-27T00:30:00+02:00") == date(2026, 8, 27)


@pytest.mark.parametrize(("status", "deadline", "was_today", "postponed", "required"), [
    ("TODO", date(2026, 8, 27), False, False, True),
    ("TODO", DAY, False, False, True),
    ("IN_PROGRESS", date(2026, 8, 27), False, False, False),
    ("IN_PROGRESS", DAY, False, False, True),
    ("IN_PROGRESS", date(2026, 8, 25), False, False, True),
    ("IN_PROGRESS", date(2026, 8, 27), True, False, True),
    ("DONE", DAY, True, True, False),
    ("TODO", date(2026, 8, 27), True, True, True),
])
def test_daily_explanation_matrix(status, deadline, was_today, postponed, required):
    requirement = requires_daily_explanation(
        status=status, selected_day=DAY, deadline=deadline,
        deadline_was_today=was_today, postponed_today=postponed,
    )
    assert requirement.requires_explanation is required
    assert requirement.reason_required is required
    assert requirement.comment_required is required


def test_reassignment_a_to_b_to_c_keeps_intermediate_owner_candidate():
    task_id = uuid.uuid4()
    a_id, b_id, c_id = uuid.uuid4(), uuid.uuid4(), uuid.uuid4()
    events = [
        SimpleNamespace(id=uuid.uuid4(), action="task.assignee_changed", created_at=datetime(2026, 8, 26, 10, tzinfo=timezone.utc), actor_user_id=None,
                        before={"assignee_ids": [str(a_id)]}, after={"assignee_ids": [str(b_id)]}),
        SimpleNamespace(id=uuid.uuid4(), action="task.assignee_changed", created_at=datetime(2026, 8, 26, 14, tzinfo=timezone.utc), actor_user_id=None,
                        before={"assignee_ids": [str(b_id)]}, after={"assignee_ids": [str(c_id)]}),
    ]
    events_by_task = {task_id: events}
    current = {task_id: {c_id}}
    for owner in (a_id, b_id, c_id):
        assert task_id in candidate_task_ids_for_person(
            owner, baseline_by_user={a_id: {task_id: {}}},
            current_assignees=current, tasks={}, events_by_task=events_by_task, day=DAY,
        )
