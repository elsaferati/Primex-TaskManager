import unittest
import uuid

from app.api.routers.planners import (
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
        added_task = _to_compare_task_out(
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
            not_completed=[],
            added_during_week=[added_task],
            removed_or_canceled=[],
        )

        self.assertEqual(len(groups), 2)
        names = {group.assignee_name for group in groups}
        self.assertIn("Laurent", names)
        self.assertIn("Unassigned", names)
        laurent_group = next(group for group in groups if group.assignee_name == "Laurent")
        self.assertEqual(len(laurent_group.completed), 1)
        unassigned_group = next(group for group in groups if group.assignee_name == "Unassigned")
        self.assertEqual(len(unassigned_group.added_during_week), 1)


if __name__ == "__main__":
    unittest.main()
