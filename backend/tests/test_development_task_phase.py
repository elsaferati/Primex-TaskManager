import unittest

from app.api.routers.tasks import _normalize_project_task_phase
from app.models.enums import ProjectPhaseStatus


class DevelopmentTaskPhaseTests(unittest.TestCase):
    def test_development_task_cannot_be_created_in_meetings_phase(self) -> None:
        phase = _normalize_project_task_phase(
            ProjectPhaseStatus.MEETINGS,
            is_development_project=True,
        )

        self.assertEqual(phase, ProjectPhaseStatus.PLANNING)

    def test_development_task_keeps_a_task_bearing_phase(self) -> None:
        phase = _normalize_project_task_phase(
            ProjectPhaseStatus.DEVELOPMENT,
            is_development_project=True,
        )

        self.assertEqual(phase, ProjectPhaseStatus.DEVELOPMENT)

    def test_other_departments_can_keep_meetings_phase(self) -> None:
        phase = _normalize_project_task_phase(
            ProjectPhaseStatus.MEETINGS,
            is_development_project=False,
        )

        self.assertEqual(phase, ProjectPhaseStatus.MEETINGS)


if __name__ == "__main__":
    unittest.main()
