import asyncio
import os
import uuid
from datetime import date, datetime, timezone
from types import SimpleNamespace
from unittest.mock import AsyncMock, patch

import pytest
from pydantic import ValidationError

os.environ.setdefault("DATABASE_URL", "postgresql+asyncpg://test:test@localhost/test")
os.environ.setdefault("JWT_SECRET", "test-secret-that-is-long-enough-for-tests")

from app.api.routers.realization import _manager_review_context
from app.models.enums import UserRole
from app.models.realization import RealizationObservation
from app.schemas.realization import RealizationManagerReviewUpsert
from app.services.realization_manager_review import (
    M3_MANAGER_REVIEW_SOURCE,
    build_manager_review_response,
    clear_manager_review,
    is_m3_manager_review,
    upsert_manager_review,
)


class ScalarResult:
    def __init__(self, value): self.value = value
    def scalar_one_or_none(self): return self.value


class ListResult:
    def __init__(self, values): self.values = values
    def scalars(self): return self
    def all(self): return self.values


def period(department_id: uuid.UUID, period_type: str = "DAILY"):
    return SimpleNamespace(id=uuid.uuid4(), period_type=period_type, department_id=department_id,
                           start_date=date(2026, 8, 27), end_date=date(2026, 8, 27))


@pytest.mark.parametrize("marker", ["POSITIVE", "NEGATIVE"])
def test_positive_and_negative_manager_reviews_require_comment(marker):
    with pytest.raises(ValidationError):
        RealizationManagerReviewUpsert(marker=marker, comment="   ")
    value = RealizationManagerReviewUpsert(marker=marker, comment="  Shpjegim i qartë.  ")
    assert value.comment == "Shpjegim i qartë."


def test_neutral_is_not_a_manager_review_option():
    with pytest.raises(ValidationError):
        RealizationManagerReviewUpsert(marker="NEUTRAL", comment="Asgjë")


def test_staff_cannot_create_manager_review():
    department_id = uuid.uuid4()
    subject = SimpleNamespace(id=uuid.uuid4(), department_id=department_id)
    actor = SimpleNamespace(id=subject.id, role=UserRole.STAFF, department_id=department_id)
    db = SimpleNamespace(execute=AsyncMock(return_value=ScalarResult(subject)))
    with patch("app.api.routers.realization._period", new=AsyncMock(return_value=period(department_id))):
        with pytest.raises(Exception) as exc:
            asyncio.run(_manager_review_context(db, period_id=uuid.uuid4(), subject_user_id=subject.id,
                                                actor=actor, editing=True))
    assert exc.value.status_code == 403


def test_manager_cannot_review_wrong_department():
    department_id = uuid.uuid4()
    subject = SimpleNamespace(id=uuid.uuid4(), department_id=department_id)
    actor = SimpleNamespace(id=uuid.uuid4(), role=UserRole.MANAGER, department_id=uuid.uuid4())
    db = SimpleNamespace(execute=AsyncMock(return_value=ScalarResult(subject)))
    with patch("app.api.routers.realization._period", new=AsyncMock(return_value=period(department_id))):
        with pytest.raises(Exception) as exc:
            asyncio.run(_manager_review_context(db, period_id=uuid.uuid4(), subject_user_id=subject.id,
                                                actor=actor, editing=True))
    assert exc.value.status_code == 403


@pytest.mark.parametrize("period_type", ["DAILY", "WEEKLY"])
def test_authorized_manager_can_review_daily_and_weekly(period_type):
    department_id = uuid.uuid4()
    subject = SimpleNamespace(id=uuid.uuid4(), department_id=department_id)
    actor = SimpleNamespace(id=uuid.uuid4(), role=UserRole.MANAGER, department_id=department_id)
    db = SimpleNamespace(execute=AsyncMock(return_value=ScalarResult(subject)))
    expected = period(department_id, period_type)
    with patch("app.api.routers.realization._period", new=AsyncMock(return_value=expected)):
        actual = asyncio.run(_manager_review_context(db, period_id=expected.id, subject_user_id=subject.id,
                                                     actor=actor, editing=True))
    assert actual == (expected, subject, True)


def observation(*, period_id, user_id, dimension, marker="POSITIVE"):
    return RealizationObservation(
        id=uuid.uuid4(), period_id=period_id, scope_type="PERSON", user_id=user_id,
        department_id=uuid.uuid4(), marker=marker, category="QUALITY", comment="Plan i qartë",
        evidence_json={"review_source": M3_MANAGER_REVIEW_SOURCE, "review_dimension": dimension},
        source_type=M3_MANAGER_REVIEW_SOURCE, source_id=None, is_system_generated=False,
        visibility="PERSON_AND_MANAGER", created_by=uuid.uuid4(), created_at=datetime.now(timezone.utc),
    )


@pytest.mark.parametrize("dimension", ["PLANNING", "REALIZATION"])
@pytest.mark.parametrize("marker", ["POSITIVE", "NEGATIVE"])
def test_manager_can_add_each_marker_for_each_dimension(dimension, marker):
    period_id, user_id, actor_id, department_id = (uuid.uuid4() for _ in range(4))
    db = SimpleNamespace(add=lambda value: setattr(db, "added", value), flush=AsyncMock())
    with patch("app.services.realization_manager_review.manager_review_rows",
               new=AsyncMock(return_value=[])):
        review = asyncio.run(upsert_manager_review(
            db, period_id=period_id, user_id=user_id, department_id=department_id,
            dimension=dimension, marker=marker, comment="Koment i detyrueshëm.", actor_id=actor_id))
    assert review.marker == marker
    assert review.evidence_json["review_dimension"] == dimension
    assert review.evidence_json["review_source"] == M3_MANAGER_REVIEW_SOURCE
    assert review.visibility == "PERSON_AND_MANAGER"


def test_edit_supersedes_old_dimension_and_preserves_history():
    period_id, user_id, actor_id, department_id = (uuid.uuid4() for _ in range(4))
    old = observation(period_id=period_id, user_id=user_id, dimension="PLANNING")
    db = SimpleNamespace(add=lambda value: setattr(db, "added", value), flush=AsyncMock())
    with patch("app.services.realization_manager_review.manager_review_rows",
               new=AsyncMock(return_value=[old])):
        new = asyncio.run(upsert_manager_review(
            db, period_id=period_id, user_id=user_id, department_id=department_id,
            dimension="PLANNING", marker="NEGATIVE", comment="Duhet prioritet.", actor_id=actor_id))
    assert old.voided_at is not None and old.voided_by == actor_id
    assert old.void_reason == "SUPERSEDED_BY_M3_MANAGER_REVIEW"
    assert new.source_id == old.id
    assert new.evidence_json["supersedes_observation_id"] == str(old.id)
    assert new.marker == "NEGATIVE" and new.comment == "Duhet prioritet."


def test_planning_and_realization_are_independent_dimensions():
    period_id, user_id, actor_id, department_id = (uuid.uuid4() for _ in range(4))
    realization = observation(period_id=period_id, user_id=user_id, dimension="REALIZATION")
    db = SimpleNamespace(add=lambda value: None, flush=AsyncMock())
    with patch("app.services.realization_manager_review.manager_review_rows",
               new=AsyncMock(return_value=[realization])):
        asyncio.run(upsert_manager_review(
            db, period_id=period_id, user_id=user_id, department_id=department_id,
            dimension="PLANNING", marker="POSITIVE", comment="Plan realist.", actor_id=actor_id))
    assert realization.voided_at is None


def test_daily_and_weekly_are_separated_by_period_id():
    daily_id, weekly_id, user_id = uuid.uuid4(), uuid.uuid4(), uuid.uuid4()
    daily = observation(period_id=daily_id, user_id=user_id, dimension="PLANNING")
    db = SimpleNamespace(add=lambda value: None, flush=AsyncMock())
    async def rows(_db, *, period_id, user_id, for_update=False):
        return [daily] if period_id == daily_id else []
    with patch("app.services.realization_manager_review.manager_review_rows", new=rows):
        asyncio.run(upsert_manager_review(
            db, period_id=weekly_id, user_id=user_id, department_id=uuid.uuid4(),
            dimension="PLANNING", marker="NEGATIVE", comment="Review javor.", actor_id=uuid.uuid4()))
    assert daily.voided_at is None


def test_clear_voids_instead_of_deleting_and_empty_means_no_review():
    period_id, user_id, actor_id = uuid.uuid4(), uuid.uuid4(), uuid.uuid4()
    active = observation(period_id=period_id, user_id=user_id, dimension="REALIZATION")
    db = SimpleNamespace()
    with patch("app.services.realization_manager_review.manager_review_rows",
               new=AsyncMock(return_value=[active])):
        cleared = asyncio.run(clear_manager_review(
            db, period_id=period_id, user_id=user_id, dimension="REALIZATION", actor_id=actor_id))
    assert cleared == [active]
    assert active.void_reason == "M3_MANAGER_REVIEW_CLEARED" and active.voided_by == actor_id
    with patch("app.services.realization_manager_review.manager_review_rows",
               new=AsyncMock(return_value=[])):
        assert asyncio.run(clear_manager_review(
            db, period_id=period_id, user_id=user_id, dimension="PLANNING", actor_id=actor_id)) == []


def test_manager_review_source_is_qualitative_not_metric_evidence():
    assert is_m3_manager_review({"source_type": M3_MANAGER_REVIEW_SOURCE}) is True
    assert is_m3_manager_review({"source_type": "manual"}) is False
    evidence_source = (
        __import__("pathlib").Path(__file__).resolve().parents[1]
        / "app/services/realization_evidence.py"
    ).read_text(encoding="utf-8")
    daily_source = (
        __import__("pathlib").Path(__file__).resolve().parents[1]
        / "app/services/realization_daily.py"
    ).read_text(encoding="utf-8")
    assert "M3_MANAGER_REVIEW_SOURCE" in evidence_source
    assert "M3_MANAGER_REVIEW_SOURCE" in daily_source


def test_response_exposes_manager_name_timestamp_and_active_dimensions():
    period_id, user_id = uuid.uuid4(), uuid.uuid4()
    planning = observation(period_id=period_id, user_id=user_id, dimension="PLANNING")
    creator = SimpleNamespace(id=planning.created_by, full_name="GA Manager")
    db = SimpleNamespace(execute=AsyncMock(return_value=ListResult([creator])))
    with patch("app.services.realization_manager_review.manager_review_rows",
               new=AsyncMock(return_value=[planning])):
        response = asyncio.run(build_manager_review_response(
            db, period_id=period_id, user_id=user_id, can_edit=True))
    assert response["planning"]["created_by_name"] == "GA Manager"
    assert response["planning"]["created_at"] == planning.created_at
    assert response["planning"]["marker"] == "POSITIVE"
    assert response["realization"] is None
    assert response["can_edit"] is True
