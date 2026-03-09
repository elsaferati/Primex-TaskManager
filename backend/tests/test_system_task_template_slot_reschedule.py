import unittest
import uuid
from datetime import datetime, time, timezone
from types import SimpleNamespace
from unittest.mock import AsyncMock, patch

from app.api.routers.system_tasks import (
    _reset_template_slots_next_run_at,
    update_system_task_template,
)
from app.models.enums import FrequencyType, SystemTaskScope
from app.schemas.system_task_template import SystemTaskTemplateUpdate


class _ScalarResult:
    def __init__(self, value):
        self._value = value

    def scalar_one_or_none(self):
        return self._value


class _ScalarsResult:
    def __init__(self, values):
        self._values = values

    def scalars(self):
        return self

    def all(self):
        return self._values


class _FakeSession:
    def __init__(self, execute_results):
        self._execute_results = list(execute_results)
        self.flush = AsyncMock()
        self.commit = AsyncMock()
        self.refresh = AsyncMock()

    async def execute(self, _stmt):
        return self._execute_results.pop(0)


class TestSystemTaskTemplateSlotReschedule(unittest.IsolatedAsyncioTestCase):
    async def test_reset_template_slots_next_run_at_uses_updated_monthly_schedule(self) -> None:
        template = SimpleNamespace(
            id=uuid.uuid4(),
            frequency=FrequencyType.MONTHLY,
            timezone="Europe/Budapest",
            due_time=time(9, 0),
            day_of_month=15,
            month_of_year=None,
            interval=1,
            apply_from=None,
            created_at=datetime(2026, 3, 1, 8, 0, tzinfo=timezone.utc),
        )
        stale_run_at = datetime(2026, 3, 4, 8, 0, tzinfo=timezone.utc)
        slots = [
            SimpleNamespace(id=uuid.uuid4(), next_run_at=stale_run_at),
            SimpleNamespace(id=uuid.uuid4(), next_run_at=stale_run_at),
        ]
        db = _FakeSession([_ScalarsResult(slots)])

        await _reset_template_slots_next_run_at(
            db,
            template=template,
            now=datetime(2026, 3, 9, 12, 0, tzinfo=timezone.utc),
        )

        for slot in slots:
            self.assertEqual(slot.next_run_at.isoformat(), "2026-03-13T08:00:00+00:00")
        db.flush.assert_awaited_once()

    async def test_update_template_reschedules_slots_when_only_day_changes(self) -> None:
        template = SimpleNamespace(
            id=uuid.uuid4(),
            title="TASK MUJORE RINESA LAURENTI",
            description=None,
            internal_notes=None,
            department_id=None,
            default_assignee_id=None,
            assignee_ids=None,
            scope=SystemTaskScope.ALL,
            frequency=FrequencyType.MONTHLY,
            day_of_week=None,
            days_of_week=None,
            day_of_month=4,
            month_of_year=None,
            timezone="Europe/Budapest",
            due_time=time(9, 0),
            lookahead=14,
            interval=1,
            apply_from=None,
            duration_days=1,
            priority=None,
            finish_period=None,
            requires_alignment=False,
            alignment_time=None,
            is_active=True,
        )
        db = _FakeSession([_ScalarResult(template)])
        payload = SystemTaskTemplateUpdate(day_of_month=15)
        user = SimpleNamespace(id=uuid.uuid4())

        with (
            patch(
                "app.api.routers.system_tasks._reset_template_slots_next_run_at",
                new=AsyncMock(),
            ) as reset_slots,
            patch(
                "app.api.routers.system_tasks._template_to_out",
                new=AsyncMock(return_value={"id": str(template.id)}),
            ),
        ):
            result = await update_system_task_template(
                template_id=template.id,
                payload=payload,
                db=db,
                user=user,
            )

        self.assertEqual(template.day_of_month, 15)
        reset_slots.assert_awaited_once_with(db, template=template)
        db.commit.assert_awaited_once()
        db.refresh.assert_awaited_once_with(template)
        self.assertEqual(result, {"id": str(template.id)})


if __name__ == "__main__":
    unittest.main()
