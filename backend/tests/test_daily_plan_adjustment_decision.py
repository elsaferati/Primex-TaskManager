import asyncio
import os
import uuid
from types import SimpleNamespace
from unittest.mock import AsyncMock, Mock, patch

import pytest

os.environ.setdefault("DATABASE_URL", "postgresql+asyncpg://test:test@localhost/test")
os.environ.setdefault("JWT_SECRET", "test-secret-that-is-long-enough-for-tests")

from app.api.routers.realization import decide_daily_plan_adjustment
from app.models.enums import UserRole
from app.schemas.realization import DailyPlanAdjustmentDecision


class Result:
    def __init__(self, value):
        self.value = value

    def scalar_one_or_none(self):
        return self.value


def payload(*, status: str = "APPROVED", comment: str | None = "Mund të vazhdohet"):
    return DailyPlanAdjustmentDecision(
        audit_event_id=uuid.uuid4(), user_id=uuid.uuid4(), status=status,
        reason="Kapaciteti i konfirmuar", comment=comment,
    )


def test_staff_cannot_decide_postponement():
    manager = SimpleNamespace(id=uuid.uuid4(), role=UserRole.STAFF, department_id=uuid.uuid4())
    db = SimpleNamespace(execute=AsyncMock())
    with pytest.raises(Exception) as exc:
        asyncio.run(decide_daily_plan_adjustment(uuid.uuid4(), payload(), db=db, user=manager))
    assert exc.value.status_code == 403
    db.execute.assert_not_awaited()


def test_manager_from_wrong_department_cannot_decide():
    manager = SimpleNamespace(id=uuid.uuid4(), role=UserRole.MANAGER, department_id=uuid.uuid4(), full_name="Marie")
    request = payload()
    adjustment = SimpleNamespace(
        id=uuid.uuid4(), task_id=uuid.uuid4(), audit_event_id=request.audit_event_id,
        user_id=request.user_id, status="PENDING", reason=None, decision_comment=None,
        decided_by=None, decided_at=None,
    )
    subject = SimpleNamespace(id=request.user_id, department_id=uuid.uuid4())
    db = SimpleNamespace(execute=AsyncMock(return_value=Result(adjustment)), get=AsyncMock(return_value=subject))
    with pytest.raises(Exception) as exc:
        asyncio.run(decide_daily_plan_adjustment(adjustment.task_id, request, db=db, user=manager))
    assert exc.value.status_code == 403


@pytest.mark.parametrize("status", ["APPROVED", "REJECTED"])
def test_manager_decision_persists_and_returns_authoritative_evidence(status):
    department_id = uuid.uuid4()
    manager = SimpleNamespace(id=uuid.uuid4(), role=UserRole.MANAGER, department_id=department_id, full_name="Marie")
    request = payload(status=status)
    adjustment = SimpleNamespace(
        id=uuid.uuid4(), task_id=uuid.uuid4(), audit_event_id=request.audit_event_id,
        user_id=request.user_id, status="PENDING", reason=None, decision_comment=None,
        decided_by=None, decided_at=None,
    )
    subject = SimpleNamespace(id=request.user_id, department_id=department_id)
    db = SimpleNamespace(
        execute=AsyncMock(return_value=Result(adjustment)), get=AsyncMock(return_value=subject),
        commit=AsyncMock(),
    )
    with patch("app.api.routers.realization.add_audit_log", new=Mock()) as audit:
        response = asyncio.run(decide_daily_plan_adjustment(adjustment.task_id, request, db=db, user=manager))
    assert adjustment.status == status
    assert adjustment.reason == request.reason
    assert adjustment.decision_comment == request.comment
    assert adjustment.decided_by == manager.id
    assert adjustment.decided_at is not None
    assert response == {
        "id": str(adjustment.id), "status": status, "reason": request.reason,
        "comment": request.comment, "decided_by_user_id": str(manager.id),
        "decided_by_name": "Marie", "decided_at": adjustment.decided_at.isoformat(),
    }
    db.commit.assert_awaited_once()
    audit.assert_called_once()
