from __future__ import annotations

import asyncio
import inspect
import os
import uuid
from types import SimpleNamespace
from unittest.mock import AsyncMock, patch


os.environ.setdefault("DATABASE_URL", "postgresql+asyncpg://postgres:postgres@localhost/primex_test")
os.environ.setdefault("JWT_SECRET", "test-secret")

from app.api.routers import question_library  # noqa: E402
from app.models.question_library import QuestionDefinition  # noqa: E402
from app.schemas.question_library import QuestionDefinitionCreate  # noqa: E402


class FakeDb:
    def __init__(self) -> None:
        self.added: list[object] = []
        self.commit_count = 0

    async def scalar(self, _statement):
        return -1

    def add(self, value: object) -> None:
        self.added.append(value)

    async def flush(self) -> None:
        return None

    async def commit(self) -> None:
        self.commit_count += 1

    async def refresh(self, _value: object) -> None:
        return None


def test_creating_question_only_creates_question_definition() -> None:
    async def scenario() -> None:
        db = FakeDb()
        current_user = SimpleNamespace(id=uuid.uuid4())
        payload = QuestionDefinitionCreate(text="A test question?", guidance=None)

        with (
            patch.object(question_library, "_category_or_404", new=AsyncMock(return_value=object())),
            patch.object(question_library, "_question_out", new=AsyncMock(return_value=object())),
        ):
            await question_library.create_question_definition(
                uuid.uuid4(),
                payload,
                db,  # type: ignore[arg-type]
                current_user,  # type: ignore[arg-type]
            )

        assert len(db.added) == 1
        assert isinstance(db.added[0], QuestionDefinition)
        assert db.commit_count == 1

    asyncio.run(scenario())


def test_question_create_and_edit_routes_have_no_task_creation_path() -> None:
    source = "\n".join(
        (
            inspect.getsource(question_library.create_question_definition),
            inspect.getsource(question_library.update_question_definition),
        )
    )
    assert "Task(" not in source
    assert "TaskAssignee(" not in source
    assert "question_batch_date" not in source
