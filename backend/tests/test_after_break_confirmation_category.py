import unittest
from datetime import datetime
from types import SimpleNamespace

from app.services.after_break_report import (
    _blue_note_rows,
    _format_confirmation_questions,
    _new_system_task_rows,
)


class AfterBreakConfirmationCategoryTests(unittest.TestCase):
    def test_empty_confirmation_questions(self) -> None:
        lines = _format_confirmation_questions([])
        self.assertEqual(lines, ["PYETJE PER KONFIRMIM: 0"])

    def test_confirmation_table_includes_category_column(self) -> None:
        lines = _format_confirmation_questions(
            [
                ("PYETJE PËR BARAZIM", "Sa urgjente është?", "Sheno shkallen"),
                ("PYETJET PER 1H", "A eshte bere share detyra tek PX Notes?", ""),
            ]
        )
        joined = "\n".join(lines)
        self.assertIn("Kategoria", joined)
        self.assertIn("PYETJA", joined)
        self.assertIn("PYETJE PËR BARAZIM", joined)
        self.assertIn("PYETJET PER 1H", joined)
        self.assertIn("Sa urgjente është?", joined)
        self.assertIn("A eshte bere share detyra tek PX Notes?", joined)
        self.assertNotIn("LISTA", joined)


class NewSystemTaskRowsTests(unittest.IsolatedAsyncioTestCase):
    async def test_px_note_rows_include_all_and_only_undiscussed_notes(self) -> None:
        included = SimpleNamespace(
            id="included", content="Created before the former M2 window", is_discussed=False,
            created_by=None, created_at=datetime(2026, 8, 11, 9, 0), updated_at=None,
        )
        discussed = SimpleNamespace(
            id="discussed", content="Already discussed", is_discussed=True,
            created_by=None, created_at=datetime(2026, 8, 11, 12, 0), updated_at=None,
        )
        linked = SimpleNamespace(
            id="linked", content="Already linked to a task", is_discussed=False,
            created_by=None, created_at=datetime(2026, 8, 11, 14, 0), updated_at=None,
        )

        class FakeResult:
            def __init__(self, values):
                self.values = values

            def scalars(self):
                return SimpleNamespace(all=lambda: self.values)

        class FakeDb:
            def __init__(self):
                self.results = iter([[included, discussed, linked], [linked.id]])

            async def execute(self, _statement):
                return FakeResult(next(self.results))

        rows = await _blue_note_rows(FakeDb())

        self.assertEqual(len(rows), 1)
        self.assertEqual(rows[0][1], "NO")
        self.assertIn("Created before the former M2 window", rows[0][2])

    async def test_new_system_tasks_include_department_and_finish_period(self) -> None:
        template = SimpleNamespace(
            title="New system task",
            department_id="development",
            finish_period="PM",
            assignee_ids=[],
            default_assignee_id=None,
            created_at=datetime(2026, 8, 11, 9, 0),
        )

        class FakeResult:
            def scalars(self):
                return SimpleNamespace(all=lambda: [template])

        class FakeDb:
            async def execute(self, _statement):
                return FakeResult()

        rows = await _new_system_task_rows(FakeDb(), {"development": "DEV"})

        self.assertEqual(rows, [["1", "-", "DEV", "PM", "New system task", "11.08.2026"]])


if __name__ == "__main__":
    unittest.main()
