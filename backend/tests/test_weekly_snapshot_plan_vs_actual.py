import unittest
import uuid
from datetime import date

from app.api.routers.planners import (
    _classify_weekly_plan_performance,
    _flatten_weekly_department_tasks,
    _group_compare_tasks_by_assignee,
    _to_compare_task_out,
)


class TestWeeklySnapshotPlanVsActualHelpers(unittest.TestCase):
    def test_flatten_merges_same_task_id_across_slots(self) -> None:
        assignee_id = uuid.uuid4()
        project_id = uuid.uuid4()
        task_id = uuid.uuid4()
        department_payload = {
            "days": [
                {
                    "date": "2026-02-02",
                    "users": [
                        {
                            "user_id": str(assignee_id),
                            "user_name": "Elsa",
                            "am_projects": [
                                {
                                    "project_id": str(project_id),
                                    "project_title": "Launch",
                                    "tasks": [
                                        {
                                            "task_id": str(task_id),
                                            "task_title": "Prepare deck",
                                            "status": "TODO",
                                            "daily_status": None,
                                            "completed_at": None,
                                            "finish_period": "AM",
                                        }
                                    ],
                                }
                            ],
                            "pm_projects": [
                                {
                                    "project_id": str(project_id),
                                    "project_title": "Launch",
                                    "tasks": [
                                        {
                                            "task_id": str(task_id),
                                            "task_title": "Prepare deck",
                                            "status": "DONE",
                                            "daily_status": "DONE",
                                            "completed_at": "2026-02-02T09:00:00+00:00",
                                            "finish_period": "PM",
                                        }
                                    ],
                                }
                            ],
                            "am_system_tasks": [],
                            "pm_system_tasks": [],
                            "am_fast_tasks": [],
                            "pm_fast_tasks": [],
                        }
                    ],
                }
            ]
        }

        tasks = _flatten_weekly_department_tasks(department_payload)
        self.assertEqual(len(tasks), 1)
        self.assertEqual(tasks[0]["task_id"], task_id)
        self.assertEqual(tasks[0]["match_key"], f"id:{task_id}")
        self.assertTrue(tasks[0]["is_completed"])
        self.assertEqual(len(tasks[0]["occurrences"]), 2)

    def test_flatten_fallback_key_for_tasks_without_id(self) -> None:
        assignee_id = uuid.uuid4()
        department_payload = {
            "days": [
                {
                    "date": "2026-02-03",
                    "users": [
                        {
                            "user_id": str(assignee_id),
                            "user_name": "Endi",
                            "am_projects": [],
                            "pm_projects": [],
                            "am_system_tasks": [],
                            "pm_system_tasks": [],
                            "am_fast_tasks": [
                                {
                                    "task_id": None,
                                    "title": "Inbox cleanup",
                                    "status": "TODO",
                                    "daily_status": None,
                                    "completed_at": None,
                                    "finish_period": "AM",
                                }
                            ],
                            "pm_fast_tasks": [
                                {
                                    "task_id": None,
                                    "title": "Inbox cleanup",
                                    "status": "IN_PROGRESS",
                                    "daily_status": None,
                                    "completed_at": None,
                                    "finish_period": "PM",
                                }
                            ],
                        }
                    ],
                }
            ]
        }

        tasks = _flatten_weekly_department_tasks(department_payload)
        self.assertEqual(len(tasks), 1)
        self.assertIsNone(tasks[0]["task_id"])
        self.assertTrue(tasks[0]["match_key"].startswith("fallback:"))
        self.assertIsNotNone(tasks[0]["fallback_key"])
        self.assertEqual(len(tasks[0]["occurrences"]), 2)

    def test_grouping_by_assignee_and_unassigned(self) -> None:
        assignee_id = uuid.uuid4()
        completed_task = _to_compare_task_out(
            {
                "match_key": "id:1",
                "task_id": None,
                "title": "Task 1",
                "source_type": "project",
                "status": "DONE",
                "is_completed": True,
                "tags": [],
                "assignees": [{"assignee_id": assignee_id, "assignee_name": "Laurent"}],
                "occurrences": [],
            }
        )
        additional_task = _to_compare_task_out(
            {
                "match_key": "fallback:a",
                "task_id": None,
                "title": "Task 2",
                "source_type": "fast",
                "status": "TODO",
                "is_completed": False,
                "tags": [],
                "assignees": [],
                "occurrences": [],
            }
        )

        groups = _group_compare_tasks_by_assignee(
            completed=[completed_task],
            in_progress=[],
            pending=[],
            late=[],
            additional=[additional_task],
            removed_or_canceled=[],
        )

        self.assertEqual(len(groups), 2)
        names = {group.assignee_name for group in groups}
        self.assertIn("Laurent", names)
        self.assertIn("Unassigned", names)
        laurent_group = next(group for group in groups if group.assignee_name == "Laurent")
        self.assertEqual(len(laurent_group.completed), 1)
        unassigned_group = next(group for group in groups if group.assignee_name == "Unassigned")
        self.assertEqual(len(unassigned_group.additional), 1)

    def test_classify_late_pending_in_progress_removed_and_additional(self) -> None:
        week_end = date(2026, 2, 6)  # Friday
        as_of_date = date(2026, 2, 6)  # Friday (live compare)

        planned_assignee_id = uuid.uuid4()
        planned_tasks = {
            "id:1": {
                "match_key": "id:1",
                "task_id": uuid.uuid4(),
                "title": "Planned late task",
                "source_type": "project",
                "status": "TODO",
                "daily_status": None,
                "completed_at": None,
                "is_completed": False,
                "tags": [],
                "assignees": [{"assignee_id": planned_assignee_id, "assignee_name": "Planned Assignee"}],
                "occurrences": [{"day": date(2026, 2, 4), "time_slot": "AM", "assignee_id": planned_assignee_id, "assignee_name": "Planned Assignee"}],
                "finish_period": "AM",
            },
            "id:2": {
                "match_key": "id:2",
                "task_id": uuid.uuid4(),
                "title": "Planned in-progress task",
                "source_type": "project",
                "status": "TODO",
                "daily_status": None,
                "completed_at": None,
                "is_completed": False,
                "tags": [],
                "assignees": [{"assignee_id": planned_assignee_id, "assignee_name": "Planned Assignee"}],
                "occurrences": [{"day": date(2026, 2, 6), "time_slot": "PM", "assignee_id": planned_assignee_id, "assignee_name": "Planned Assignee"}],
                "finish_period": "PM",
            },
            "id:3": {
                "match_key": "id:3",
                "task_id": uuid.uuid4(),
                "title": "Planned removed task",
                "source_type": "project",
                "status": "TODO",
                "daily_status": None,
                "completed_at": None,
                "is_completed": False,
                "tags": [],
                "assignees": [{"assignee_id": planned_assignee_id, "assignee_name": "Planned Assignee"}],
                "occurrences": [{"day": date(2026, 2, 5), "time_slot": "AM", "assignee_id": planned_assignee_id, "assignee_name": "Planned Assignee"}],
                "finish_period": "AM",
            },
        }

        actual_tasks = {
            "id:1": {
                "match_key": "id:1",
                "task_id": planned_tasks["id:1"]["task_id"],
                "title": "Planned late task",
                "source_type": "project",
                "status": "TODO",
                "daily_status": None,
                "completed_at": None,
                "is_completed": False,
                "tags": [],
                "assignees": [{"assignee_id": uuid.uuid4(), "assignee_name": "Actual Assignee"}],
                "occurrences": [{"day": date(2026, 2, 6), "time_slot": "AM", "assignee_id": uuid.uuid4(), "assignee_name": "Actual Assignee"}],
                "finish_period": "AM",
            },
            "id:2": {
                "match_key": "id:2",
                "task_id": planned_tasks["id:2"]["task_id"],
                "title": "Planned in-progress task",
                "source_type": "project",
                "status": "IN_PROGRESS",
                "daily_status": None,
                "completed_at": None,
                "is_completed": False,
                "tags": [],
                "assignees": [{"assignee_id": uuid.uuid4(), "assignee_name": "Actual Assignee"}],
                "occurrences": [{"day": date(2026, 2, 6), "time_slot": "PM", "assignee_id": uuid.uuid4(), "assignee_name": "Actual Assignee"}],
                "finish_period": "PM",
            },
            "id:4": {
                "match_key": "id:4",
                "task_id": uuid.uuid4(),
                "title": "Additional task",
                "source_type": "fast",
                "status": "TODO",
                "daily_status": None,
                "completed_at": None,
                "is_completed": False,
                "tags": [],
                "assignees": [{"assignee_id": uuid.uuid4(), "assignee_name": "Actual Assignee"}],
                "occurrences": [],
                "finish_period": None,
            },
        }

        buckets = _classify_weekly_plan_performance(
            planned_tasks=planned_tasks,
            actual_tasks=actual_tasks,
            week_end=week_end,
            as_of_date=as_of_date,
        )

        self.assertEqual([t["match_key"] for t in buckets["late"]], ["id:1"])
        self.assertEqual([t["match_key"] for t in buckets["in_progress"]], ["id:2"])
        self.assertEqual([t["match_key"] for t in buckets["pending"]], [])
        self.assertEqual([t["match_key"] for t in buckets["removed_or_canceled"]], ["id:3"])
        self.assertEqual([t["match_key"] for t in buckets["additional"]], ["id:4"])

        # Planned buckets must keep planned assignees/occurrences for attribution + display.
        merged_late = buckets["late"][0]
        self.assertEqual(merged_late["assignees"][0]["assignee_id"], planned_assignee_id)
        self.assertEqual(merged_late["occurrences"][0]["day"], date(2026, 2, 4))

        # Friday report: after the week ends, tasks planned for Friday become late if still incomplete.
        buckets_after_week = _classify_weekly_plan_performance(
            planned_tasks=planned_tasks,
            actual_tasks=actual_tasks,
            week_end=week_end,
            as_of_date=date(2026, 2, 7),
        )
        self.assertIn("id:2", [t["match_key"] for t in buckets_after_week["late"]])


if __name__ == "__main__":
    unittest.main()
