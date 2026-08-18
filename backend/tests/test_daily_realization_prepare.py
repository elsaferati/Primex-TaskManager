from __future__ import annotations

import asyncio
import uuid
from datetime import date
from types import SimpleNamespace
from unittest.mock import AsyncMock, Mock, patch

import pytest

from app.api.routers.realization import prepare_daily_realization
from app.models.enums import UserRole


DAY = date(2026, 8, 18)


class _DepartmentResult:
    def __init__(self, department):
        self.department = department

    def scalar_one_or_none(self):
        return self.department


def test_prepare_at_1530_creates_a_separate_result_for_each_person():
    """Regression: Daily RLZ must not depend on the later 16:20 snapshot job."""
    department_id = uuid.uuid4()
    department = SimpleNamespace(id=department_id, name="Development")
    period = SimpleNamespace(id=uuid.uuid4())
    planned = SimpleNamespace(id=uuid.uuid4())
    people = [
        SimpleNamespace(id=uuid.uuid4(), department_id=department_id, role=UserRole.STAFF),
        SimpleNamespace(id=uuid.uuid4(), department_id=department_id, role=UserRole.STAFF),
        SimpleNamespace(id=uuid.uuid4(), department_id=department_id, role=UserRole.STAFF),
    ]
    db = SimpleNamespace(
        execute=AsyncMock(return_value=_DepartmentResult(department)),
        commit=AsyncMock(),
        rollback=AsyncMock(),
        refresh=AsyncMock(),
    )
    calculate = AsyncMock()

    async def response_for_user(_db, *, period, department_name, user):
        return {
            "period_id": str(period.id),
            "department_name": department_name,
            "people": [{"user_id": str(user.id)}],
        }

    async def run_for_all_people():
        with (
            patch("app.api.routers.realization.is_closable_day", return_value=True),
            patch(
                "app.api.routers.realization.ensure_daily_period",
                new=AsyncMock(return_value=(period, planned)),
            ),
            patch(
                "app.api.routers.realization._period",
                new=AsyncMock(return_value=period),
            ),
            patch(
                "app.api.routers.realization.calculate_daily_period",
                new=calculate,
            ),
            patch(
                "app.api.routers.realization.add_audit_log",
                new=Mock(),
            ),
            patch(
                "app.api.routers.realization._daily_response",
                new=AsyncMock(side_effect=response_for_user),
            ),
        ):
            return [
                await prepare_daily_realization(
                    department_id=department_id,
                    day=DAY,
                    db=db,
                    user=person,
                )
                for person in people
            ]

    responses = asyncio.run(run_for_all_people())

    assert [row["people"][0]["user_id"] for row in responses] == [
        str(person.id) for person in people
    ]
    assert calculate.await_count == len(people)
    assert [call.kwargs["only_user_id"] for call in calculate.await_args_list] == [
        person.id for person in people
    ]
    assert db.commit.await_count == len(people)
    db.rollback.assert_not_awaited()


def test_prepare_is_rejected_before_1530_without_writing():
    department_id = uuid.uuid4()
    person = SimpleNamespace(
        id=uuid.uuid4(), department_id=department_id, role=UserRole.STAFF
    )
    db = SimpleNamespace(
        execute=AsyncMock(),
        commit=AsyncMock(),
        rollback=AsyncMock(),
        refresh=AsyncMock(),
    )

    async def run_before_open():
        with patch("app.api.routers.realization.is_closable_day", return_value=False):
            await prepare_daily_realization(
                department_id=department_id,
                day=DAY,
                db=db,
                user=person,
            )

    with pytest.raises(Exception) as exc_info:
        asyncio.run(run_before_open())

    assert getattr(exc_info.value, "status_code", None) == 409
    assert exc_info.value.detail["code"] == "DAILY_RLZ_CLOSE_WINDOW_NOT_OPEN"
    db.execute.assert_not_awaited()
    db.commit.assert_not_awaited()
