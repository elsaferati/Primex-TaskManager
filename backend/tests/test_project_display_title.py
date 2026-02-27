import unittest
import uuid
from datetime import date
from types import SimpleNamespace

from app.models.enums import ProjectType
from app.services.project_display_title import (
    build_display_title,
    build_project_display_title_map,
    compute_project_control_week_metrics,
)


class _FakeResult:
    def __init__(self, rows):
        self._rows = rows

    def all(self):
        return self._rows


class _FakeAsyncSession:
    def __init__(self, responses):
        self._responses = list(responses)

    async def execute(self, _stmt):
        if not self._responses:
            raise AssertionError("Unexpected execute() call with no queued response")
        return _FakeResult(self._responses.pop(0))


class TestProjectDisplayTitle(unittest.IsolatedAsyncioTestCase):
    async def test_mst_title_known_total_no_progress(self):
        project_id = uuid.uuid4()
        db = _FakeAsyncSession(
            [
                [],  # control tasks
            ]
        )
        projects = [
            SimpleNamespace(
                id=project_id,
                title="MST ABC (50)",
                project_type=ProjectType.MST,
                total_products=50,
            )
        ]

        out = await build_project_display_title_map(db, projects)
        self.assertEqual(
            out[project_id],
            "MST ABC (TOTAL 50/TOTAL DONE 0/REALIZED FOR THAT WEEK 0)",
        )

    def test_non_mst_tt_title_unchanged(self):
        out = build_display_title(
            title="General Project",
            project_type="GENERAL",
            total_products=100,
            progress={"total": 100, "done_total": 25, "realised_week": 5},
        )
        self.assertEqual(out, "General Project")

    def test_trailing_total_is_normalized(self):
        out = build_display_title(
            title="MST ALPHA (50)",
            project_type=ProjectType.MST,
            total_products=50,
            progress={"total": 50, "done_total": 10, "realised_week": 3},
        )
        self.assertEqual(
            out,
            "MST ALPHA (TOTAL 50/TOTAL DONE 10/REALIZED FOR THAT WEEK 3)",
        )

    async def test_week_realized_uses_completed_delta_not_completed_value(self):
        project_id = uuid.uuid4()
        task_id = uuid.uuid4()
        db = _FakeAsyncSession(
            [
                [
                    (task_id, project_id, 50, "total_products=50", None, None),
                ],  # controls
                [
                    (task_id, 40),
                ],  # all-time completed_value rows
                [
                    (task_id, 3),
                ],  # weekly completed_delta rows
            ]
        )

        progress = await compute_project_control_week_metrics(
            db,
            [project_id],
            week_start=date(2026, 2, 23),
            week_end=date(2026, 3, 1),
            project_total_by_id={project_id: 50},
        )
        bucket = progress[project_id]
        self.assertEqual(bucket["done_total"], 40)
        self.assertEqual(bucket["realised_week"], 3)

    async def test_done_total_all_time_max_per_task_and_cap_to_total(self):
        project_id = uuid.uuid4()
        task_a = uuid.uuid4()
        task_b = uuid.uuid4()
        db = _FakeAsyncSession(
            [
                [
                    (task_a, project_id, 30, "total_products=30", None, None),
                    (task_b, project_id, 30, "total_products=30", None, None),
                ],  # controls
                [
                    (task_a, 20),
                    (task_a, 35),  # max should be used, then capped to task total 30
                    (task_b, 40),  # capped to task total 30
                ],  # all-time completed_value
                [
                    (task_a, 15),
                    (task_b, 20),
                ],  # weekly completed_delta
            ]
        )

        progress = await compute_project_control_week_metrics(
            db,
            [project_id],
            week_start=date(2026, 2, 23),
            week_end=date(2026, 3, 1),
            project_total_by_id={project_id: 50},
        )
        bucket = progress[project_id]
        self.assertEqual(bucket["done_total"], 50)
        self.assertEqual(bucket["realised_week"], 0)

    async def test_fallback_done_total_from_completed_products_notes(self):
        project_id = uuid.uuid4()
        task_id = uuid.uuid4()
        db = _FakeAsyncSession(
            [
                [
                    (
                        task_id,
                        project_id,
                        20,
                        "total_products=20 completed_products=7",
                        None,
                        None,
                    )
                ],  # controls
                [],  # all-time completed_value rows
                [],  # weekly completed_delta rows
            ]
        )

        progress = await compute_project_control_week_metrics(
            db,
            [project_id],
            week_start=date(2026, 2, 23),
            week_end=date(2026, 3, 1),
            project_total_by_id={project_id: 20},
        )
        bucket = progress[project_id]
        self.assertEqual(bucket["done_total"], 7)
        self.assertEqual(bucket["realised_week"], 0)

    async def test_realized_week_is_capped_by_remaining_capacity(self):
        project_id = uuid.uuid4()
        task_id = uuid.uuid4()
        db = _FakeAsyncSession(
            [
                [
                    (task_id, project_id, 50, "total_products=50", None, None),
                ],  # controls
                [
                    (task_id, 45),
                ],  # all-time completed_value rows
                [
                    (task_id, 20),
                ],  # weekly completed_delta rows
            ]
        )

        progress = await compute_project_control_week_metrics(
            db,
            [project_id],
            week_start=date(2026, 2, 23),
            week_end=date(2026, 3, 1),
            project_total_by_id={project_id: 50},
        )
        bucket = progress[project_id]
        self.assertEqual(bucket["done_total"], 45)
        self.assertEqual(bucket["realised_week"], 5)


if __name__ == "__main__":
    unittest.main()
