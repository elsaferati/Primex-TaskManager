import unittest

from app.api.routers.tasks import _product_count_status_for_output, _should_auto_status_from_product_counts
from app.models.enums import ProjectPhaseStatus, TaskStatus


class _DummyProject:
    pass


class TestTaskProductAutoStatus(unittest.TestCase):
    def test_project_product_phase_uses_product_count_auto_status(self) -> None:
        self.assertTrue(
            _should_auto_status_from_product_counts(_DummyProject(), ProjectPhaseStatus.PRODUCT)
        )

    def test_project_control_phase_uses_product_count_auto_status(self) -> None:
        self.assertTrue(
            _should_auto_status_from_product_counts(_DummyProject(), ProjectPhaseStatus.CONTROL)
        )

    def test_non_product_phase_does_not_use_product_count_auto_status(self) -> None:
        self.assertFalse(
            _should_auto_status_from_product_counts(_DummyProject(), ProjectPhaseStatus.MEETINGS)
        )

    def test_task_without_project_does_not_use_product_count_auto_status(self) -> None:
        self.assertFalse(
            _should_auto_status_from_product_counts(None, ProjectPhaseStatus.PRODUCT)
        )

    def test_explicit_done_is_not_reopened_in_api_output_by_incomplete_counts(self) -> None:
        self.assertEqual(
            _product_count_status_for_output(TaskStatus.DONE, total=10, completed=4),
            TaskStatus.DONE,
        )

    def test_open_task_still_uses_product_count_status_in_api_output(self) -> None:
        self.assertEqual(
            _product_count_status_for_output(TaskStatus.TODO, total=10, completed=4),
            TaskStatus.IN_PROGRESS,
        )


if __name__ == "__main__":
    unittest.main()
