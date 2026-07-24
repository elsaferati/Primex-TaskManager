import unittest
from types import SimpleNamespace

from app.api.routers.exports import _open_task_source_label, _open_task_wrapped_line_count


class TestOpenTasksExportLayout(unittest.TestCase):
    def test_wrapped_line_count_accounts_for_column_width(self) -> None:
        title = "AT/OH:EF/RA: ASC: DEF KO1/KO2/KOF PER KUZHINA (CLAIMS)"

        self.assertEqual(_open_task_wrapped_line_count(title, 44), 2)

    def test_wrapped_line_count_accounts_for_explicit_newlines(self) -> None:
        title = "First line\nSecond line\nThird line"

        self.assertEqual(_open_task_wrapped_line_count(title, 44), 3)

    def test_px_jav_task_uses_ga_ka_source_group(self) -> None:
        task = SimpleNamespace(
            ga_note_origin_id=None,
            plan_note_origin_id="plan-note-id",
            system_template_origin_id=None,
            project_id="project-id",
            is_bllok=False,
            is_r1=False,
            is_1h_report=False,
            is_personal=False,
        )

        self.assertEqual(_open_task_source_label(task), "GA/KA")


if __name__ == "__main__":
    unittest.main()
