import unittest

from app.api.routers.tasks import _should_auto_status_from_product_counts
from app.models.enums import ProjectPhaseStatus


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


if __name__ == "__main__":
    unittest.main()
