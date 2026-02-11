import unittest

from app.api.routers.tasks import list_tasks


class _EmptyScalars:
    def all(self):
        return []


class _EmptyResult:
    def scalars(self):
        return _EmptyScalars()


class FakeAsyncSession:
    def __init__(self) -> None:
        self.executed = []

    async def execute(self, stmt):
        self.executed.append(stmt)
        return _EmptyResult()


class TestListTasksInactiveFilter(unittest.IsolatedAsyncioTestCase):
    async def test_default_filters_inactive(self) -> None:
        db = FakeAsyncSession()
        await list_tasks(db=db, user=object())
        self.assertTrue(db.executed, "Expected at least one statement to be executed")
        where = getattr(db.executed[0], "whereclause", None)
        self.assertIsNotNone(where, "Expected a WHERE clause when include_inactive is default/False")
        self.assertIn("is_active", str(where))

    async def test_include_inactive_true_skips_filter(self) -> None:
        db = FakeAsyncSession()
        await list_tasks(db=db, user=object(), include_inactive=True)
        self.assertTrue(db.executed, "Expected at least one statement to be executed")
        where = getattr(db.executed[0], "whereclause", None)
        self.assertIsNone(where, "Expected no WHERE clause when include_inactive=True and no other filters")


if __name__ == "__main__":
    unittest.main()
