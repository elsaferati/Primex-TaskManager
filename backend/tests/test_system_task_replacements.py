from __future__ import annotations

import uuid
from types import SimpleNamespace
from unittest import IsolatedAsyncioTestCase, TestCase
from unittest.mock import AsyncMock

from fastapi import HTTPException
from app.api.routers.system_tasks import (
    _is_gane_user,
    _replacements_required,
    _validate_replacement_users,
)
from app.models.enums import FrequencyType
from app.models.system_task_template import SystemTaskTemplate
from app.schemas.system_task_template import SystemTaskTemplateCreate


class _UsersResult:
    def __init__(self, users):
        self._users = users

    def scalars(self):
        return SimpleNamespace(all=lambda: self._users)


class TestSystemTaskReplacementSchema(TestCase):
    def test_create_schema_allows_all_users_without_replacements(self) -> None:
        payload = SystemTaskTemplateCreate(title="All users", frequency=FrequencyType.DAILY)
        self.assertIsNone(payload.zv1_user_id)
        self.assertIsNone(payload.zv2_user_id)

    def test_existing_database_rows_may_have_null_replacements(self) -> None:
        self.assertTrue(SystemTaskTemplate.__table__.c.zv1_user_id.nullable)
        self.assertTrue(SystemTaskTemplate.__table__.c.zv2_user_id.nullable)

    def test_gane_identity_uses_email_case_insensitively(self) -> None:
        self.assertTrue(_is_gane_user(SimpleNamespace(email="GA@PrimexEU.com", username=None)))
        self.assertFalse(_is_gane_user(SimpleNamespace(email="other@example.com", username="gane.arifaj")))

    def test_replacements_are_required_only_for_one_to_nine_assignees(self) -> None:
        self.assertFalse(_replacements_required([]))
        self.assertTrue(_replacements_required([uuid.uuid4()]))
        self.assertTrue(_replacements_required([uuid.uuid4() for _ in range(9)]))
        self.assertFalse(_replacements_required([uuid.uuid4() for _ in range(10)]))


class TestSystemTaskReplacementValidation(IsolatedAsyncioTestCase):
    async def test_all_users_allows_both_replacements_to_be_empty(self) -> None:
        db = SimpleNamespace(execute=AsyncMock())
        await _validate_replacement_users(
            db,
            zv1_user_id=None,
            zv2_user_id=None,
            assignee_ids=[],
            required=False,
        )
        db.execute.assert_not_awaited()

    async def test_missing_replacements_are_rejected_when_required(self) -> None:
        db = SimpleNamespace(execute=AsyncMock())
        with self.assertRaises(HTTPException) as missing_error:
            await _validate_replacement_users(
                db,
                zv1_user_id=None,
                zv2_user_id=None,
                assignee_ids=[],
                required=True,
            )
        self.assertEqual(missing_error.exception.status_code, 400)
        db.execute.assert_not_awaited()

    async def test_replacements_must_be_distinct_and_outside_assignees(self) -> None:
        user_id = uuid.uuid4()
        db = SimpleNamespace(execute=AsyncMock())

        with self.assertRaises(HTTPException) as same_error:
            await _validate_replacement_users(
                db,
                zv1_user_id=user_id,
                zv2_user_id=user_id,
                assignee_ids=[],
                required=True,
            )
        self.assertEqual(same_error.exception.status_code, 400)

        with self.assertRaises(HTTPException) as overlap_error:
            await _validate_replacement_users(
                db,
                zv1_user_id=user_id,
                zv2_user_id=uuid.uuid4(),
                assignee_ids=[user_id],
                required=True,
            )
        self.assertEqual(overlap_error.exception.status_code, 400)

    async def test_replacements_must_exist_and_be_active(self) -> None:
        zv1_id, zv2_id = uuid.uuid4(), uuid.uuid4()
        missing_db = SimpleNamespace(
            execute=AsyncMock(
                return_value=_UsersResult([SimpleNamespace(id=zv1_id, is_active=True)])
            )
        )
        with self.assertRaises(HTTPException) as missing_error:
            await _validate_replacement_users(
                missing_db,
                zv1_user_id=zv1_id,
                zv2_user_id=zv2_id,
                assignee_ids=[],
                required=True,
            )
        self.assertEqual(missing_error.exception.status_code, 404)

        inactive_db = SimpleNamespace(
            execute=AsyncMock(
                return_value=_UsersResult(
                    [
                        SimpleNamespace(id=zv1_id, is_active=True),
                        SimpleNamespace(id=zv2_id, is_active=False),
                    ]
                )
            )
        )
        with self.assertRaises(HTTPException) as inactive_error:
            await _validate_replacement_users(
                inactive_db,
                zv1_user_id=zv1_id,
                zv2_user_id=zv2_id,
                assignee_ids=[],
                required=True,
            )
        self.assertEqual(inactive_error.exception.status_code, 400)

        valid_db = SimpleNamespace(
            execute=AsyncMock(
                return_value=_UsersResult(
                    [
                        SimpleNamespace(id=zv1_id, is_active=True),
                        SimpleNamespace(id=zv2_id, is_active=True),
                    ]
                )
            )
        )
        await _validate_replacement_users(
            valid_db,
            zv1_user_id=zv1_id,
            zv2_user_id=zv2_id,
            assignee_ids=[],
            required=True,
        )


if __name__ == "__main__":
    import unittest

    unittest.main()
