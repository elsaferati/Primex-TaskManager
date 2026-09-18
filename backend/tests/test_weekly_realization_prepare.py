import asyncio
import uuid
from datetime import datetime, timedelta
from types import SimpleNamespace
from unittest.mock import AsyncMock, Mock, patch
from zoneinfo import ZoneInfo

from app.api.routers.realization import prepare_weekly_realization
from app.config import settings
from app.models.enums import UserRole
from app.schemas.weekly_planner_snapshot import WeeklySnapshotType
from app.services.realization_periods import normalize_week_start


class _ScalarResult:
    def __init__(self, value):
        self.value = value

    def scalar_one_or_none(self):
        return self.value


def test_prepare_weekly_recovers_missing_planned_snapshot_for_current_week():
    department_id = uuid.uuid4()
    manager = SimpleNamespace(
        id=uuid.uuid4(), department_id=department_id, role=UserRole.MANAGER
    )
    department = SimpleNamespace(id=department_id, name="Development")
    week_start = normalize_week_start(
        datetime.now(ZoneInfo(settings.REALIZATION_TIMEZONE)).date()
    )
    period = SimpleNamespace(
        id=uuid.uuid4(), start_date=week_start, end_date=week_start + timedelta(days=4)
    )
    snapshot = SimpleNamespace(id=uuid.uuid4())
    db = SimpleNamespace(
        execute=AsyncMock(return_value=_ScalarResult(department)),
        commit=AsyncMock(),
        rollback=AsyncMock(),
        refresh=AsyncMock(),
    )
    ensure = AsyncMock(
        side_effect=[(period, None, None), (period, snapshot, None)]
    )
    ensure_daily = AsyncMock(
        return_value=(SimpleNamespace(status="CALCULATED"), snapshot)
    )
    create = AsyncMock(return_value=SimpleNamespace(snapshot=snapshot))

    async def run():
        with (
            patch("app.api.routers.realization._ensure_department_scope"),
            patch(
                "app.api.routers.realization.ensure_weekly_period", new=ensure
            ),
            patch(
                "app.api.routers.realization.ensure_daily_period", new=ensure_daily
            ),
            patch(
                "app.api.routers.planners._create_and_store_weekly_snapshot",
                new=create,
            ),
            patch("app.api.routers.realization.add_audit_log", new=Mock()) as audit,
            patch(
                "app.api.routers.realization._weekly_response",
                new=AsyncMock(return_value={"has_planned_snapshot": True}),
            ),
        ):
            response = await prepare_weekly_realization(
                department_id=department_id,
                week_start=week_start,
                db=db,
                user=manager,
            )
            return response, audit

    response, audit = asyncio.run(run())

    assert response["has_planned_snapshot"] is True
    assert ensure.await_count == 2
    create.assert_awaited_once_with(
        db=db,
        user=manager,
        department_id=department_id,
        week_start_date=week_start,
        snapshot_type=WeeklySnapshotType.PLANNED,
        is_this_week=True,
    )
    audit.assert_called_once()
    db.commit.assert_awaited_once()
    db.refresh.assert_awaited_once_with(period)
    db.rollback.assert_not_awaited()


def test_prepare_weekly_keeps_existing_planned_snapshot():
    department_id = uuid.uuid4()
    manager = SimpleNamespace(
        id=uuid.uuid4(), department_id=department_id, role=UserRole.MANAGER
    )
    department = SimpleNamespace(id=department_id, name="Development")
    week_start = normalize_week_start(
        datetime.now(ZoneInfo(settings.REALIZATION_TIMEZONE)).date()
    )
    period = SimpleNamespace(
        id=uuid.uuid4(), start_date=week_start, end_date=week_start + timedelta(days=4)
    )
    snapshot = SimpleNamespace(id=uuid.uuid4())
    db = SimpleNamespace(
        execute=AsyncMock(return_value=_ScalarResult(department)),
        commit=AsyncMock(),
        rollback=AsyncMock(),
        refresh=AsyncMock(),
    )
    ensure = AsyncMock(return_value=(period, snapshot, None))
    ensure_daily = AsyncMock(
        return_value=(SimpleNamespace(status="CALCULATED"), snapshot)
    )
    create = AsyncMock()

    async def run():
        with (
            patch("app.api.routers.realization._ensure_department_scope"),
            patch(
                "app.api.routers.realization.ensure_weekly_period", new=ensure
            ),
            patch(
                "app.api.routers.realization.ensure_daily_period", new=ensure_daily
            ),
            patch(
                "app.api.routers.planners._create_and_store_weekly_snapshot",
                new=create,
            ),
            patch(
                "app.api.routers.realization._weekly_response",
                new=AsyncMock(return_value={"has_planned_snapshot": True}),
            ),
        ):
            return await prepare_weekly_realization(
                department_id=department_id,
                week_start=week_start,
                db=db,
                user=manager,
            )

    response = asyncio.run(run())

    assert response["has_planned_snapshot"] is True
    ensure.assert_awaited_once()
    create.assert_not_awaited()
    db.commit.assert_awaited_once()
    db.refresh.assert_awaited_once_with(period)


def test_prepare_weekly_calculates_an_open_missing_day():
    department_id = uuid.uuid4()
    manager = SimpleNamespace(
        id=uuid.uuid4(), department_id=department_id, role=UserRole.MANAGER
    )
    department = SimpleNamespace(id=department_id, name="Development")
    week_start = normalize_week_start(
        datetime.now(ZoneInfo(settings.REALIZATION_TIMEZONE)).date()
    )
    period = SimpleNamespace(id=uuid.uuid4(), start_date=week_start, end_date=week_start)
    snapshot = SimpleNamespace(id=uuid.uuid4())
    daily_period = SimpleNamespace(id=uuid.uuid4(), status="OPEN")
    locked_daily_period = SimpleNamespace(id=daily_period.id, status="OPEN")
    db = SimpleNamespace(
        execute=AsyncMock(return_value=_ScalarResult(department)),
        commit=AsyncMock(),
        rollback=AsyncMock(),
        refresh=AsyncMock(),
    )
    calculate_daily = AsyncMock()

    async def run():
        with (
            patch("app.api.routers.realization._ensure_department_scope"),
            patch(
                "app.api.routers.realization.ensure_weekly_period",
                new=AsyncMock(return_value=(period, snapshot, None)),
            ),
            patch(
                "app.api.routers.realization.ensure_daily_period",
                new=AsyncMock(return_value=(daily_period, snapshot)),
            ),
            patch(
                "app.api.routers.realization._period",
                new=AsyncMock(return_value=locked_daily_period),
            ),
            patch(
                "app.api.routers.realization.calculate_daily_period",
                new=calculate_daily,
            ),
            patch("app.api.routers.realization.add_audit_log", new=Mock()),
            patch(
                "app.api.routers.realization._weekly_response",
                new=AsyncMock(return_value={"has_planned_snapshot": True}),
            ),
        ):
            return await prepare_weekly_realization(
                department_id=department_id,
                week_start=week_start,
                db=db,
                user=manager,
            )

    response = asyncio.run(run())

    assert response["has_planned_snapshot"] is True
    calculate_daily.assert_awaited_once_with(
        db,
        period=locked_daily_period,
        planned_snapshot=snapshot,
        actor_id=manager.id,
    )
