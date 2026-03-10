import unittest
import uuid
from datetime import date, datetime, time, timezone
from types import SimpleNamespace

from app.api.routers.system_tasks import list_system_tasks
from app.models.enums import FrequencyType, SystemTaskScope


class _ScalarsResult:
    def __init__(self, values):
        self._values = values

    def scalars(self):
        return self

    def all(self):
        return self._values


class _FakeAsyncSession:
    def __init__(self, execute_results):
        self._execute_results = list(execute_results)
        self.executed = []

    async def execute(self, stmt):
        self.executed.append(stmt)
        return self._execute_results.pop(0)


class TestSystemTasksListGeneratedOnly(unittest.IsolatedAsyncioTestCase):
    async def test_list_system_tasks_excludes_templates_without_generated_rows(self) -> None:
        template = SimpleNamespace(
            id=uuid.uuid4(),
            title="TASK MUJORE RINESA LAURENTI",
            description=None,
            internal_notes=None,
            department_id=None,
            default_assignee_id=uuid.uuid4(),
            assignee_ids=None,
            scope=SystemTaskScope.ALL.value,
            frequency=FrequencyType.DAILY,
            day_of_week=None,
            days_of_week=None,
            day_of_month=None,
            month_of_year=None,
            timezone="Europe/Budapest",
            due_time=time(9, 0),
            priority=None,
            finish_period=None,
            requires_alignment=False,
            alignment_time=None,
            is_active=True,
            created_at=datetime(2026, 3, 9, 9, 0, tzinfo=timezone.utc),
        )
        db = _FakeAsyncSession([
            _ScalarsResult([template]),
            _ScalarsResult([]),
        ])
        user = SimpleNamespace(id=uuid.uuid4())

        result = await list_system_tasks(
            occurrence_date=date(2026, 3, 9),
            db=db,
            user=user,
        )

        self.assertEqual(result, [])
        self.assertEqual(len(db.executed), 2)

    async def test_list_system_tasks_with_occurrence_date_excludes_previous_occurrence_templates(self) -> None:
        matching_template = SimpleNamespace(
            id=uuid.uuid4(),
            title="TEST SYSTEM TASK WEEKLY",
            description=None,
            internal_notes=None,
            department_id=None,
            default_assignee_id=uuid.uuid4(),
            assignee_ids=None,
            scope=SystemTaskScope.ALL.value,
            frequency=FrequencyType.WEEKLY,
            day_of_week=1,
            days_of_week=[1],
            day_of_month=None,
            month_of_year=None,
            timezone="Europe/Budapest",
            due_time=time(9, 0),
            priority=None,
            finish_period=None,
            requires_alignment=False,
            alignment_time=None,
            is_active=True,
            created_at=datetime(2026, 3, 9, 9, 0, tzinfo=timezone.utc),
        )
        previous_only_template = SimpleNamespace(
            id=uuid.uuid4(),
            title="FINC - MBYLLJA E VITIT PX",
            description=None,
            internal_notes=None,
            department_id=None,
            default_assignee_id=uuid.uuid4(),
            assignee_ids=None,
            scope=SystemTaskScope.ALL.value,
            frequency=FrequencyType.YEARLY,
            day_of_week=None,
            days_of_week=None,
            day_of_month=30,
            month_of_year=1,
            timezone="Europe/Budapest",
            due_time=time(9, 0),
            priority=None,
            finish_period=None,
            requires_alignment=False,
            alignment_time=None,
            is_active=True,
            created_at=datetime(2026, 1, 30, 9, 0, tzinfo=timezone.utc),
        )
        matching_task = SimpleNamespace(
            id=uuid.uuid4(),
            title=matching_template.title,
            description=None,
            internal_notes=None,
            department_id=uuid.uuid4(),
            assigned_to=matching_template.default_assignee_id,
            system_template_origin_id=matching_template.id,
            origin_run_at=datetime(2026, 3, 10, 8, 0, tzinfo=timezone.utc),
            start_date=datetime(2026, 3, 10, 8, 0, tzinfo=timezone.utc),
            due_date=datetime(2026, 3, 10, 8, 0, tzinfo=timezone.utc),
            status="TODO",
            priority="NORMAL",
            finish_period=None,
            is_active=True,
            created_by=matching_template.default_assignee_id,
            created_at=datetime(2026, 3, 10, 8, 0, tzinfo=timezone.utc),
            system_task_slot_id=None,
        )
        db = _FakeAsyncSession([
            _ScalarsResult([matching_template, previous_only_template]),
            _ScalarsResult([matching_task]),
            _ScalarsResult([]),
            _ScalarsResult([]),
            _ScalarsResult([]),
            _ScalarsResult([]),
            _ScalarsResult([]),
        ])
        user = SimpleNamespace(id=uuid.uuid4())

        result = await list_system_tasks(
            occurrence_date=date(2026, 3, 10),
            db=db,
            user=user,
        )

        self.assertEqual(len(result), 1)
        self.assertEqual(str(result[0].template_id), str(matching_template.id))


if __name__ == "__main__":
    unittest.main()
