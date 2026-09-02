import inspect
import unittest
import uuid

from app.api.routers.realization import _weekly_response
from app.models.enums import FrequencyType
from app.models.system_task_template import SystemTaskTemplate
from app.schemas.system_task_template import SystemTaskTemplateCreate, SystemTaskTemplateUpdate
from app.services.realization_daily import calculate_daily_period


class TestSystemTaskWeeklyPlannerVisibility(unittest.TestCase):
    def test_create_payload_is_opt_in(self) -> None:
        payload = SystemTaskTemplateCreate(
            title="Weekly planner task",
            frequency=FrequencyType.DAILY,
            zv1_user_id=uuid.uuid4(),
            zv2_user_id=uuid.uuid4(),
        )

        self.assertIsNone(payload.show_in_weekly_planner)

    def test_update_payload_can_enable_visibility(self) -> None:
        payload = SystemTaskTemplateUpdate(show_in_weekly_planner=True)

        self.assertTrue(payload.show_in_weekly_planner)

    def test_database_column_is_non_nullable_and_defaults_off(self) -> None:
        column = SystemTaskTemplate.__table__.c.show_in_weekly_planner

        self.assertFalse(column.nullable)
        self.assertIsNotNone(column.server_default)
        self.assertEqual(str(column.server_default.arg).lower(), "false")

    def test_daily_realization_only_loads_opted_in_system_tasks(self) -> None:
        source = inspect.getsource(calculate_daily_period)

        self.assertIn("SystemTaskTemplate.show_in_weekly_planner.is_(True)", source)

    def test_weekly_realization_only_loads_opted_in_system_tasks(self) -> None:
        source = inspect.getsource(_weekly_response)

        self.assertIn("SystemTaskTemplate.show_in_weekly_planner.is_(True)", source)


if __name__ == "__main__":
    unittest.main()
