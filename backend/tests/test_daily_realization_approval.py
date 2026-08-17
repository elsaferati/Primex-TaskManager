import os
import uuid
from datetime import datetime, timezone
from types import SimpleNamespace

os.environ.setdefault("DATABASE_URL", "postgresql+asyncpg://test:test@localhost/test")
os.environ.setdefault("JWT_SECRET", "test-secret-that-is-long-enough-for-tests")

from app.services.daily_realization_approval import approval_state_from_events
from app.api.routers.realization import _require_daily_approval_access
from app.models.enums import UserRole
from fastapi import HTTPException
import pytest


def _close(action="CLOSE"):
    return SimpleNamespace(id=uuid.uuid4(), action=action)


def _approval(close_id, action="APPROVE"):
    return SimpleNamespace(
        id=uuid.uuid4(), action=action, source_close_event_id=close_id,
        actor_user_id=uuid.uuid4(), created_at=datetime.now(timezone.utc),
        approval_comment="Kontrolluar", reason=None,
    )


def test_approval_is_pending_without_manager_action():
    assert approval_state_from_events(None, _close(), personal_close_status="SAVED")["status"] == "PENDING"


def test_approval_is_valid_only_for_the_current_saved_close():
    close = _close()
    approval = _approval(close.id)
    assert approval_state_from_events(approval, close, personal_close_status="SAVED")["status"] == "APPROVED"
    assert approval_state_from_events(approval, close, personal_close_status="STALE")["status"] == "STALE"
    assert approval_state_from_events(approval, _close(), personal_close_status="SAVED")["status"] == "STALE"


def test_revocation_is_reported_separately():
    close = _close()
    approval = _approval(close.id, action="REVOKE")
    approval.reason = "Duhet korrigjuar"
    assert approval_state_from_events(approval, close, personal_close_status="SAVED")["status"] == "REVOKED"


def test_manager_can_approve_only_own_department_and_admin_can_approve_all():
    department_id = uuid.uuid4()
    _require_daily_approval_access(
        SimpleNamespace(role=UserRole.MANAGER, department_id=department_id), department_id
    )
    _require_daily_approval_access(
        SimpleNamespace(role=UserRole.ADMIN, department_id=None), department_id
    )
    with pytest.raises(HTTPException) as error:
        _require_daily_approval_access(
            SimpleNamespace(role=UserRole.MANAGER, department_id=uuid.uuid4()), department_id
        )
    assert error.value.status_code == 403
