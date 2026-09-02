from __future__ import annotations

import unittest
import uuid
from datetime import datetime, timezone
from types import SimpleNamespace
from unittest.mock import AsyncMock, patch

from fastapi import HTTPException
from pydantic import ValidationError

from app.api.deps import require_manager_or_admin
from app.api.routers.skills import get_my_skills, get_team_matrix, update_my_skills
from app.models.enums import SkillRating, UserRole
from app.models.user_task_preference import UserTaskPreference
from app.schemas.skills import SKILL_FIELDS, SkillsProfileUpdate
from app.services.skills import completed_skill_count, rank_profiles, update_completion


def profile(name: str, rating: SkillRating, category: str = "analysis") -> SimpleNamespace:
    item = SimpleNamespace(user_id=uuid.uuid4(), user=SimpleNamespace(full_name=name), completed_at=None)
    for field in SKILL_FIELDS:
        setattr(item, field, None)
    setattr(item, category, rating)
    return item


class FakeDb:
    def __init__(self) -> None:
        self.added: list[object] = []
        self.commit = AsyncMock()
        self.refresh = AsyncMock()

    def add(self, item: object) -> None:
        self.added.append(item)


class MatrixDb:
    def __init__(self, rows: list[tuple[object, object | None]]) -> None:
        self.rows = rows

    async def execute(self, _statement: object) -> object:
        return SimpleNamespace(all=lambda: self.rows)


class TestSkillsLogic(unittest.TestCase):
    def test_rating_order_and_alphabetical_tie_break(self) -> None:
        ranked = rank_profiles([
            profile("Zoe", SkillRating.A_PLUS),
            profile("Amy", SkillRating.A_PLUS),
            profile("Bea", SkillRating.A),
            profile("Cal", SkillRating.B),
            profile("Dan", SkillRating.C),
        ], "analysis")
        self.assertEqual([item.user.full_name for item in ranked], ["Amy", "Zoe", "Bea", "Cal", "Dan"])

    def test_each_rating_has_the_expected_weight_order(self) -> None:
        ranked = rank_profiles(
            [profile("C", SkillRating.C), profile("B", SkillRating.B), profile("A", SkillRating.A), profile("Plus", SkillRating.A_PLUS)],
            "analysis",
        )
        self.assertEqual([item.analysis for item in ranked], [SkillRating.A_PLUS, SkillRating.A, SkillRating.B, SkillRating.C])

    def test_unknown_category_is_rejected(self) -> None:
        with self.assertRaises(ValueError):
            rank_profiles([], "classification")

    def test_all_nine_categories_set_completion(self) -> None:
        item = profile("Complete", SkillRating.A)
        for field in SKILL_FIELDS:
            setattr(item, field, SkillRating.B)
        now = datetime(2026, 9, 2, tzinfo=timezone.utc)
        update_completion(item, now)
        self.assertEqual(completed_skill_count(item), 9)
        self.assertEqual(item.completed_at, now)

    def test_completed_at_is_preserved_during_complete_edits(self) -> None:
        item = profile("Complete", SkillRating.A)
        for field in SKILL_FIELDS:
            setattr(item, field, SkillRating.B)
        original = datetime(2026, 9, 1, tzinfo=timezone.utc)
        item.completed_at = original
        item.analysis = SkillRating.A_PLUS
        update_completion(item)
        self.assertEqual(item.completed_at, original)

    def test_invalid_rating_is_rejected(self) -> None:
        with self.assertRaises(ValidationError):
            SkillsProfileUpdate(analysis="D")

    def test_optional_text_is_trimmed(self) -> None:
        payload = SkillsProfileUpdate(experience="  Research and QA  ", motivation="   ")
        self.assertEqual(payload.experience, "Research and QA")
        self.assertIsNone(payload.motivation)


class TestSkillsPermissions(unittest.IsolatedAsyncioTestCase):
    async def test_manager_and_admin_can_access_team_dependencies(self) -> None:
        for role in (UserRole.MANAGER, UserRole.ADMIN):
            user = SimpleNamespace(role=role)
            self.assertIs(await require_manager_or_admin(user), user)

    async def test_staff_cannot_access_team_dependencies(self) -> None:
        with self.assertRaises(HTTPException) as raised:
            await require_manager_or_admin(SimpleNamespace(role=UserRole.STAFF))
        self.assertEqual(raised.exception.status_code, 403)

    async def test_manager_can_retrieve_team_matrix(self) -> None:
        department = SimpleNamespace(name="Development")
        user = SimpleNamespace(id=uuid.uuid4(), full_name="Ada Example", department_id=uuid.uuid4(), department=department)
        result = await get_team_matrix(MatrixDb([(user, None)]), SimpleNamespace(role=UserRole.MANAGER))
        self.assertEqual(len(result), 1)
        self.assertEqual(result[0].name, "Ada Example")
        self.assertFalse(result[0].exists)

    async def test_empty_own_profile_returns_default_structure(self) -> None:
        user = SimpleNamespace(id=uuid.uuid4())
        with patch("app.api.routers.skills._find_profile", new=AsyncMock(return_value=None)):
            result = await get_my_skills(FakeDb(), user)
        self.assertEqual(result.user_id, user.id)
        self.assertFalse(result.exists)
        self.assertEqual(result.completed_count, 0)

    async def test_user_creates_only_their_own_profile(self) -> None:
        user = SimpleNamespace(id=uuid.uuid4())
        db = FakeDb()
        with patch("app.api.routers.skills._find_profile", new=AsyncMock(return_value=None)):
            result = await update_my_skills(SkillsProfileUpdate(analysis=SkillRating.A_PLUS), db, user)
        self.assertEqual(len(db.added), 1)
        self.assertEqual(db.added[0].user_id, user.id)
        self.assertEqual(result.user_id, user.id)
        db.commit.assert_awaited_once()

    async def test_user_updates_their_existing_profile(self) -> None:
        user = SimpleNamespace(id=uuid.uuid4())
        existing = UserTaskPreference(user_id=user.id, analysis=SkillRating.B)
        db = FakeDb()
        with patch("app.api.routers.skills._find_profile", new=AsyncMock(return_value=existing)):
            result = await update_my_skills(SkillsProfileUpdate(analysis=SkillRating.A), db, user)
        self.assertEqual(existing.analysis, SkillRating.A)
        self.assertEqual(result.analysis, SkillRating.A)
        self.assertEqual(db.added, [])


if __name__ == "__main__":
    unittest.main()
