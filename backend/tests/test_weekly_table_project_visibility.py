import unittest
import uuid

from app.api.routers.planners import _should_add_empty_project_entry_for_department


class TestWeeklyTableProjectVisibility(unittest.TestCase):
    def test_product_content_department_hides_empty_projects(self) -> None:
        department_id = uuid.uuid4()

        result = _should_add_empty_project_entry_for_department(
            department_id,
            {department_id},
        )

        self.assertFalse(result)

    def test_other_departments_hide_empty_projects(self) -> None:
        department_id = uuid.uuid4()

        result = _should_add_empty_project_entry_for_department(
            department_id,
            {uuid.uuid4()},
        )

        self.assertFalse(result)

    def test_missing_department_id_hides_empty_projects(self) -> None:
        result = _should_add_empty_project_entry_for_department(
            None,
            {uuid.uuid4()},
        )

        self.assertFalse(result)


if __name__ == "__main__":
    unittest.main()
