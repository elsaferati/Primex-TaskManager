import unittest

from app.services.task_classification import is_fast_task_fields


class TestTaskClassification(unittest.TestCase):
    def test_ga_note_standalone_is_fast(self) -> None:
        self.assertTrue(
            is_fast_task_fields(
                title="GA note task",
                project_id=None,
                dependency_task_id=None,
                system_template_origin_id=None,
                ga_note_origin_id="some-ga-note-id",
            )
        )

    def test_project_task_is_not_fast(self) -> None:
        self.assertFalse(
            is_fast_task_fields(
                title="Project task",
                project_id="some-project-id",
                dependency_task_id=None,
                system_template_origin_id=None,
                ga_note_origin_id="some-ga-note-id",
            )
        )

    def test_system_task_is_not_fast(self) -> None:
        self.assertFalse(
            is_fast_task_fields(
                title="System task",
                project_id=None,
                dependency_task_id=None,
                system_template_origin_id="some-template-id",
                ga_note_origin_id="some-ga-note-id",
            )
        )


if __name__ == "__main__":
    unittest.main()

