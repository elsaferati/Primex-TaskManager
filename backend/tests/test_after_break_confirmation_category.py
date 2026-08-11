import unittest
from datetime import datetime
from types import SimpleNamespace

from app.services.after_break_report import _format_confirmation_questions, _new_system_task_rows


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
