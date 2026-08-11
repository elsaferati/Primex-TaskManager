import unittest
import uuid
from types import SimpleNamespace

from app.api.routers.project_members import list_project_members_batch
from app.api.routers.tasks import (
    _task_list_metadata,
    dashboard_task_summary,
    waiting_confirmation_ga_count,
)
from app.models.enums import UserRole


class _Result:
    def __init__(self, *, scalar=None, rows=None):
        self._scalar = scalar
        self._rows = rows or []

    def scalar_one(self):
        return self._scalar

    def all(self):
        return self._rows


class _Session:
    def __init__(self, results):
        self.results = list(results)
        self.executed = []

    async def execute(self, statement):
        self.executed.append(statement)
        return self.results.pop(0)


class TestPerformanceHotPaths(unittest.IsolatedAsyncioTestCase):
    async def test_dashboard_summary_uses_one_scalar_query(self):
        db = _Session([_Result(scalar=37)])

        result = await dashboard_task_summary(db=db, _=object())

        self.assertEqual(result.open_tasks, 37)
        self.assertEqual(result.overdue, 0)
        self.assertEqual(len(db.executed), 1)

    async def test_waiting_confirmation_badge_uses_one_scalar_query(self):
        db = _Session([_Result(scalar=4)])

        result = await waiting_confirmation_ga_count(db=db, user=SimpleNamespace(id=uuid.uuid4()))

        self.assertEqual(result, {"count": 4})
        self.assertEqual(len(db.executed), 1)

    async def test_task_metadata_is_combined_into_one_round_trip(self):
        task_id = uuid.uuid4()
        assignee_id = uuid.uuid4()
        alignment_id = uuid.uuid4()
        db = _Session(
            [
                _Result(
                    rows=[
                        (task_id, "assignee", assignee_id, "a@example.com", "a", "A User", None),
                        (task_id, "comment", None, None, None, None, "Private note"),
                        (task_id, "alignment", alignment_id, None, None, None, None),
                    ]
                )
            ]
        )

        assignees, comments, alignments = await _task_list_metadata(db, [task_id], uuid.uuid4())

        self.assertEqual([item.id for item in assignees[task_id]], [assignee_id])
        self.assertEqual(comments[task_id], "Private note")
        self.assertEqual(alignments[task_id], [alignment_id])
        self.assertEqual(len(db.executed), 1)

    async def test_project_members_batch_uses_one_query_for_many_projects(self):
        first_project = uuid.uuid4()
        second_project = uuid.uuid4()
        member = SimpleNamespace(
            id=uuid.uuid4(),
            email="member@example.com",
            username="member",
            full_name="Member User",
            role=UserRole.STAFF,
            department_id=uuid.uuid4(),
            is_active=True,
        )
        db = _Session([_Result(rows=[(first_project, member)])])

        result = await list_project_members_batch(
            project_ids=[first_project, second_project],
            db=db,
            user=object(),
        )

        self.assertEqual(len(result[0].members), 1)
        self.assertEqual(result[1].members, [])
        self.assertEqual(len(db.executed), 1)


if __name__ == "__main__":
    unittest.main()
