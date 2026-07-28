import unittest

from app.models.enums import FrequencyType
from app.models.system_task_template import SystemTaskTemplate
from app.schemas.system_task_template import SystemTaskTemplateCreate, SystemTaskTemplateUpdate


class TestSystemTaskWeeklyPlannerVisibility(unittest.TestCase):
    def test_create_payload_is_opt_in(self) -> None:
        payload = SystemTaskTemplateCreate(title="Weekly planner task", frequency=FrequencyType.DAILY)

        self.assertIsNone(payload.show_in_weekly_planner)

    def test_update_payload_can_enable_visibility(self) -> None:
        payload = SystemTaskTemplateUpdate(show_in_weekly_planner=True)

        self.assertTrue(payload.show_in_weekly_planner)

    def test_database_column_is_non_nullable_and_defaults_off(self) -> None:
        column = SystemTaskTemplate.__table__.c.show_in_weekly_planner

        self.assertFalse(column.nullable)
        self.assertIsNotNone(column.server_default)
        self.assertEqual(str(column.server_default.arg).lower(), "false")


if __name__ == "__main__":
    unittest.main()
