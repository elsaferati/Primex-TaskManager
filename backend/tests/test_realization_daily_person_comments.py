import asyncio
import uuid
from datetime import date
from types import SimpleNamespace
from unittest.mock import AsyncMock, patch

import pytest
from fastapi import HTTPException
from pydantic import ValidationError
from sqlalchemy import Column, MetaData, Table, Uuid, create_engine, select
from sqlalchemy.orm import Session

from app.api.routers.realization import (
    _daily_person_comment_context, get_daily_person_comment, put_daily_person_comment,
)
from app.models.enums import UserRole
from app.models.realization import RealizationDailyPersonComment
from app.schemas.realization import RealizationDailyPersonCommentUpsert


def make_period(department, **overrides):
    values = dict(id=uuid.uuid4(), department_id=department, period_type="DAILY",
                  slot="ALL", status="OPEN", start_date=date(2026, 9, 30))
    return SimpleNamespace(**(values | overrides))


class ScalarResult:
    def __init__(self, value): self.value = value
    def scalar_one_or_none(self): return self.value


@pytest.mark.parametrize("role", [UserRole.ADMIN, UserRole.MANAGER])
def test_managers_can_comment_on_each_daily_period_without_weekly_normalization(role):
    department_id = uuid.uuid4()
    person = SimpleNamespace(id=uuid.uuid4(), department_id=department_id)
    actor = SimpleNamespace(id=uuid.uuid4(), role=role, department_id=uuid.uuid4())
    period = make_period(department_id)
    db = SimpleNamespace(execute=AsyncMock(return_value=ScalarResult(person)))
    with patch("app.api.routers.realization._period", AsyncMock(return_value=period)) as load:
        actual = asyncio.run(_daily_person_comment_context(
            db, period_id=period.id, subject_user_id=person.id, actor=actor, editing=True,
        ))
    assert actual == (period, True)
    load.assert_awaited_once_with(db, period.id, for_update=True)


@pytest.mark.parametrize("editing,own,status", [(True, True, 403), (False, False, 403)])
def test_staff_cannot_edit_comments_or_read_somebody_elses_comment(editing, own, status):
    department_id = uuid.uuid4()
    person = SimpleNamespace(id=uuid.uuid4(), department_id=department_id)
    actor = SimpleNamespace(id=person.id if own else uuid.uuid4(), role=UserRole.STAFF,
                            department_id=department_id)
    db = SimpleNamespace(execute=AsyncMock(return_value=ScalarResult(person)))
    with patch("app.api.routers.realization._period", AsyncMock(return_value=make_period(department_id))):
        with pytest.raises(HTTPException) as error:
            asyncio.run(_daily_person_comment_context(
                db, period_id=uuid.uuid4(), subject_user_id=person.id, actor=actor, editing=editing,
            ))
    assert error.value.status_code == status


def test_staff_can_read_their_own_daily_comment():
    department_id = uuid.uuid4()
    person = SimpleNamespace(id=uuid.uuid4(), department_id=department_id)
    actor = SimpleNamespace(id=person.id, role=UserRole.STAFF, department_id=department_id)
    period = make_period(department_id)
    db = SimpleNamespace(execute=AsyncMock(return_value=ScalarResult(person)))
    with patch("app.api.routers.realization._period", AsyncMock(return_value=period)):
        assert asyncio.run(_daily_person_comment_context(
            db, period_id=period.id, subject_user_id=person.id, actor=actor, editing=False,
        )) == (period, False)


@pytest.mark.parametrize("overrides", [{"period_type": "WEEKLY"}, {"slot": "AM"}, {"department_id": None}])
def test_daily_comments_reject_other_period_scopes(overrides):
    period = make_period(uuid.uuid4(), **overrides)
    with patch("app.api.routers.realization._period", AsyncMock(return_value=period)):
        with pytest.raises(HTTPException) as error:
            asyncio.run(_daily_person_comment_context(
                SimpleNamespace(), period_id=period.id, subject_user_id=uuid.uuid4(),
                actor=SimpleNamespace(), editing=False,
            ))
    assert error.value.status_code == 422


def test_daily_comments_reject_a_person_outside_the_daily_department():
    period = make_period(uuid.uuid4())
    person = SimpleNamespace(id=uuid.uuid4(), department_id=uuid.uuid4())
    db = SimpleNamespace(execute=AsyncMock(return_value=ScalarResult(person)))
    with patch("app.api.routers.realization._period", AsyncMock(return_value=period)):
        with pytest.raises(HTTPException) as error:
            asyncio.run(_daily_person_comment_context(
                db, period_id=period.id, subject_user_id=person.id, actor=SimpleNamespace(), editing=False,
            ))
    assert error.value.status_code == 404


def test_locked_day_is_readable_but_cannot_be_changed():
    department_id = uuid.uuid4()
    period = make_period(department_id, status="LOCKED")
    person = SimpleNamespace(id=uuid.uuid4(), department_id=department_id)
    actor = SimpleNamespace(id=uuid.uuid4(), role=UserRole.ADMIN, department_id=None)
    db = SimpleNamespace(execute=AsyncMock(return_value=ScalarResult(person)))
    with patch("app.api.routers.realization._period", AsyncMock(return_value=period)):
        assert asyncio.run(_daily_person_comment_context(
            db, period_id=period.id, subject_user_id=person.id, actor=actor, editing=False,
        )) == (period, False)
        with pytest.raises(HTTPException) as error:
            asyncio.run(_daily_person_comment_context(
                db, period_id=period.id, subject_user_id=person.id, actor=actor, editing=True,
            ))
    assert error.value.status_code == 409


def test_daily_comment_text_is_trimmed_and_can_be_cleared():
    assert RealizationDailyPersonCommentUpsert(comment="  Punë e mirë, kërkon përcjellje.  ").comment == "Punë e mirë, kërkon përcjellje."
    assert RealizationDailyPersonCommentUpsert(comment=" \n ").comment is None
    with pytest.raises(ValidationError):
        RealizationDailyPersonCommentUpsert(comment="x" * 4001)


class AsyncSessionAdapter:
    """Exercise the routes against an actual SQL database without external state."""
    def __init__(self, session): self.session = session
    async def execute(self, statement): return self.session.execute(statement)
    def add(self, row): self.session.add(row)
    async def flush(self): self.session.flush()
    async def commit(self): self.session.commit()
    async def refresh(self, row): self.session.refresh(row)


def test_comments_persist_after_reload_and_are_independent_for_each_person_and_day():
    metadata = MetaData()
    Table("users", metadata, Column("id", Uuid(), primary_key=True))
    Table("realization_periods", metadata, Column("id", Uuid(), primary_key=True))
    RealizationDailyPersonComment.__table__.to_metadata(metadata)
    engine = create_engine("sqlite://")
    metadata.create_all(engine)
    department_id = uuid.uuid4()
    first = make_period(department_id)
    second = make_period(department_id, start_date=date(2026, 10, 1))
    periods = {first.id: first, second.id: second}
    person_a, person_b = uuid.uuid4(), uuid.uuid4()
    actor = SimpleNamespace(id=uuid.uuid4())

    async def context(db, *, period_id, **kwargs): return periods[period_id], True

    async def exercise():
        with Session(engine) as session:
            db = AsyncSessionAdapter(session)
            for period_id, user_id, comment in [
                (first.id, person_a, "Koment për sot: çështje për përcjellje"),
                (second.id, person_a, "Koment për nesër"),
                (first.id, person_b, "Koment për personin tjetër"),
            ]:
                saved = await put_daily_person_comment(period_id, user_id,
                    RealizationDailyPersonCommentUpsert(comment=comment), db=db, user=actor)
                assert saved.comment == comment
            await put_daily_person_comment(first.id, person_a,
                RealizationDailyPersonCommentUpsert(comment="Ndryshuar"), db=db, user=actor)
        with Session(engine) as session:
            db = AsyncSessionAdapter(session)
            assert (await get_daily_person_comment(first.id, person_a, db=db, user=actor)).comment == "Ndryshuar"
            assert (await get_daily_person_comment(second.id, person_a, db=db, user=actor)).comment == "Koment për nesër"
            assert (await get_daily_person_comment(first.id, person_b, db=db, user=actor)).comment == "Koment për personin tjetër"
            assert len(session.scalars(select(RealizationDailyPersonComment)).all()) == 3
            await put_daily_person_comment(first.id, person_a,
                RealizationDailyPersonCommentUpsert(comment=""), db=db, user=actor)
            assert (await get_daily_person_comment(first.id, person_a, db=db, user=actor)).comment is None
            assert (await get_daily_person_comment(second.id, person_a, db=db, user=actor)).comment == "Koment për nesër"

    with patch("app.api.routers.realization._daily_person_comment_context", context), \
         patch("app.api.routers.realization.add_audit_log"):
        asyncio.run(exercise())
    engine.dispose()
