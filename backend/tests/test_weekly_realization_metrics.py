from app.services.realization_calculator import build_live_questions
from app.services.realization_weekly_metrics import (
    build_weekly_question_metrics,
    build_weekly_task_metrics,
)


def task(task_id, attribution, classification="no_progress"):
    return {"task_id": task_id, "attribution": attribution, "classification": classification}


def test_extra_completions_count_toward_realization_and_open_extras_do_not():
    metrics = build_weekly_task_metrics([
        task("A", "planned_owner", "completed_on_time"),
        task("B", "planned_owner"),
        task("C", "additional_owner", "additional_completed"),
        task("D", "additional_owner"),
    ], [])
    assert metrics["weekly_planned_count"] == 2
    assert metrics["weekly_completed_count"] == 1
    assert metrics["weekly_all_completed_count"] == 2
    assert metrics["weekly_additional_count"] == 2
    assert metrics["weekly_additional_completed_count"] == 1
    assert metrics["weekly_additional_in_progress_count"] == 0
    assert metrics["weekly_additional_postponed_count"] == 0
    assert metrics["weekly_additional_todo_count"] == 1
    assert metrics["weekly_additional_no_progress_count"] == 1
    assert metrics["weekly_progress_percent"] == 100


def test_extra_work_is_capped_at_full_realization():
    metrics = build_weekly_task_metrics([
        task("A", "planned_owner", "completed_on_time"),
        task("B", "additional_owner", "additional_completed"),
    ], [])
    assert metrics["weekly_progress_percent"] == 100


def test_same_task_across_snapshot_and_multiple_days_is_counted_once():
    timeline = [
        {"tasks": [task("A", "planned_today"), task("B", "added_after_weekly_plan", "completed")]},
        {"tasks": [task("A", "planned_today", "completed"), task("B", "added_after_weekly_plan", "completed")]},
    ]
    metrics = build_weekly_task_metrics([task("A", "planned_owner")], timeline)
    assert metrics["weekly_planned_count"] == 1
    assert metrics["weekly_completed_count"] == 1
    assert metrics["weekly_all_completed_count"] == 2
    assert metrics["weekly_additional_count"] == 1
    assert timeline[0]["completed_count"] == 0
    assert timeline[1]["completed_count"] == 1


def test_no_plan_uses_extra_work_as_denominator():
    metrics = build_weekly_task_metrics([], [{"tasks": [
        task("A", "completed_outside_weekly_plan", "completed"),
        task("B", "added_after_weekly_plan"),
    ]}])
    assert metrics["weekly_progress_percent"] == 50
    assert metrics["weekly_additional_count"] == 2
    assert build_weekly_task_metrics([], [])["weekly_progress_percent"] == 0


def test_final_completed_plan_is_preserved_when_daily_entry_is_older():
    metrics = build_weekly_task_metrics([task("A", "planned_owner", "completed_late")], [
        {"tasks": [task("A", "planned_today")]},
    ])
    assert metrics["weekly_completed_count"] == 1
    assert metrics["weekly_progress_percent"] == 100


def test_live_daily_tasks_without_attribution_are_aggregated_for_the_week():
    timeline = [{"tasks": [
        {"task_id": "P", "in_original_plan": True, "classification": "REALIZED_AS_PLANNED", "current_status": "DONE"},
        {"task_id": "E1", "in_original_plan": False, "classification": "ADDITIONAL_COMPLETED", "current_status": "DONE"},
        {"task_id": "E2", "in_original_plan": False, "classification": "IN_PROGRESS", "current_status": "IN_PROGRESS"},
        {"task_id": "E3", "in_original_plan": False, "classification": "NO_PROGRESS", "current_status": "TODO"},
        {"task_id": "E4", "in_original_plan": False, "classification": "POSTPONED_APPROVED", "current_status": "TODO"},
    ]}]
    metrics = build_weekly_task_metrics([], timeline)
    assert metrics["weekly_planned_count"] == 1
    assert metrics["weekly_completed_count"] == 1
    # E4 was added, never started and pushed to a later date, so it is reported
    # apart from the week's own load rather than inside it.
    assert metrics["weekly_additional_count"] == 3
    assert metrics["weekly_additional_deferred_count"] == 1
    assert metrics["weekly_additional_completed_count"] == 1
    assert metrics["weekly_additional_in_progress_count"] == 1
    assert metrics["weekly_additional_todo_count"] == 1
    assert metrics["weekly_additional_postponed_count"] == 0


def test_live_extra_is_counted_once_across_days_and_completed_state_is_kept():
    timeline = [
        {"tasks": [{"task_id": "E", "in_original_plan": False, "classification": "IN_PROGRESS"}]},
        {"tasks": [{"task_id": "E", "in_original_plan": False, "classification": "ADDITIONAL_COMPLETED"}]},
        {"tasks": [{"task_id": "E", "in_original_plan": False, "classification": "NO_PROGRESS"}]},
    ]
    metrics = build_weekly_task_metrics([], timeline)
    assert metrics["weekly_additional_count"] == 1
    assert metrics["weekly_additional_completed_count"] == 1
    assert metrics["weekly_additional_in_progress_count"] == 0


def test_weekly_quantity_and_deadline_metrics_include_every_day():
    timeline = [
        {"date": "2026-09-14", "tasks": [{
            "task_id": "A", "in_original_plan": True, "classification": "IN_PROGRESS",
            "quantity": {"planned": 4, "completed": 3},
            "deadline_was_today": True, "deadline_completed": False,
            "deadline_critical": True, "postponed_today": True,
        }]},
        {"date": "2026-09-15", "tasks": [{
            "task_id": "B", "in_original_plan": False, "classification": "ADDITIONAL_COMPLETED",
            "quantity": {"planned": 2, "completed": 2},
            "deadline_was_today": True, "deadline_completed": True,
            "deadline_critical": False, "postponed_today": False,
        }]},
    ]
    metrics = build_weekly_task_metrics([], timeline)
    assert metrics["weekly_quantity_task_count"] == 2
    assert metrics["weekly_quantity_planned_count"] == 6
    assert metrics["weekly_quantity_completed_count"] == 5
    assert metrics["weekly_quantity_delta"] == -1
    assert metrics["weekly_deadline_count"] == 2
    assert metrics["weekly_deadline_completed_count"] == 1
    assert metrics["weekly_deadline_postponed_count"] == 1
    assert metrics["weekly_deadline_in_progress_count"] == 0
    assert metrics["weekly_deadline_no_progress_count"] == 0
    assert metrics["weekly_critical_deadline_count"] == 1
    assert metrics["weekly_critical_deadline_completed_count"] == 0


def test_weekly_deadline_tasks_carry_their_day_and_state():
    timeline = [
        {"date": "2026-09-14", "tasks": [{
            "task_id": "A", "title": "Oferta", "in_original_plan": True,
            "classification": "POSTPONED_UNAPPROVED",
            "deadline_was_today": True, "postponed_today": True, "deadline_critical": True,
        }]},
        {"date": "2026-09-15", "tasks": [{
            "task_id": "B", "title": "Raporti", "in_original_plan": True,
            "classification": "REALIZED_AS_PLANNED",
            "deadline_was_today": True, "deadline_completed": True,
        }]},
    ]
    cards = build_weekly_task_metrics([], timeline)["weekly_deadline_tasks"]

    assert [(card["title"], card["day"], card["state"]) for card in cards] == [
        ("Oferta", "2026-09-14", "POSTPONED"),
        ("Raporti", "2026-09-15", "COMPLETED"),
    ]


def test_weekly_extra_answer_splits_completed_progress_and_no_progress():
    metrics = build_weekly_task_metrics([
        task("A", "additional_owner", "additional_completed"),
        task("B", "additional_owner", "in_progress"),
        task("C", "additional_owner", "no_progress"),
    ], [])
    questions = {
        item["key"]: item
        for item in build_live_questions({
            "question_scope": "WEEKLY",
            **metrics,
            "tasks": [],
            "observations": [],
        })
    }

    assert questions["extra_engagement"]["auto_value"] == {
        "answer": True,
        "total": 3,
        "completed": 1,
        "in_progress": 1,
        "no_progress": 1,
    }


def test_new_tasks_answer_splits_all_operational_states():
    metrics = build_weekly_task_metrics([
        task("A", "additional_owner", "additional_completed"),
        task("B", "additional_owner", "in_progress"),
        task("C", "additional_owner", "no_progress"),
        task("D", "additional_owner", "postponed_approved"),
    ], [])
    questions = {
        item["key"]: item
        for item in build_live_questions({
            "question_scope": "WEEKLY",
            **metrics,
            "tasks": [],
            "observations": [],
        })
    }

    # D was added, never started and pushed to a later date, so the week does
    # not claim it as its own new work.
    assert questions["new_tasks_added"]["auto_value"] == {
        "yes": True,
        "total": 3,
        "completed": 1,
        "in_progress": 1,
        "todo": 1,
        "postponed": 0,
    }


def test_weekly_question_metrics_sum_every_snapshot_day():
    metrics = build_weekly_question_metrics([
        {
            "has_snapshot": True,
            "in_progress_count": 2,
            "no_progress_count": 1,
            "pending_count": 3,
            "fast_task_count": 1,
        },
        {
            "has_snapshot": True,
            "in_progress_count": 4,
            "no_progress_count": 2,
            "pending_count": 1,
            "fast_task_count": 2,
        },
        {"has_snapshot": False, "in_progress_count": 99},
    ])

    assert metrics == {
        "weekly_in_progress_count": 6,
        "weekly_no_progress_count": 3,
        "weekly_pending_count": 4,
        "weekly_fast_task_count": 3,
        "weekly_snapshot_days": 2,
    }


def test_weekly_question_scope_uses_week_totals_even_when_daily_date_is_present():
    questions = {
        item["key"]: item
        for item in build_live_questions({
            "date": "2026-09-18",
            "question_scope": "WEEKLY",
            "daily_planned_count": 2,
            "daily_completed_count": 1,
            "weekly_planned_count": 10,
            "weekly_completed_count": 8,
            "weekly_in_progress_count": 6,
            "weekly_no_progress_count": 3,
            "weekly_fast_task_count": 4,
            "weekly_additional_count": 5,
            "counters": {"in_progress_count": 1, "no_progress_count": 0},
            "tasks": [],
            "observations": [],
            "daily_timeline": [],
        })
    }

    assert questions["plan_completed"]["auto_value"]["planned"] == 10
    assert questions["plan_completed"]["auto_value"]["completed"] == 8
    assert questions["in_progress_tasks"]["auto_value"]["count"] == 6
    assert questions["no_progress_tasks"]["auto_value"]["count"] == 3
    assert questions["new_tasks_added"]["auto_value"] == {
        "yes": True,
        "total": 5,
        "completed": 0,
        "in_progress": 0,
        "todo": 5,
        "postponed": 0,
    }
    assert questions["extra_engagement"]["auto_value"] == {
        "answer": True,
        "total": 5,
        "completed": 0,
        "in_progress": 0,
        "no_progress": 5,
    }
