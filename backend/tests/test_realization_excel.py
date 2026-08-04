import io
import unittest

from openpyxl import load_workbook

from app.services.realization_excel import build_realization_workbook


class TestRealizationExcel(unittest.TestCase):
    def test_export_has_department_evidence_guide_and_no_money(self) -> None:
        payload = build_realization_workbook(
            week_start="2026-08-03",
            week_end="2026-08-07",
            departments=[
                {
                    "name": "Development",
                    "status": "CALCULATED",
                    "people": [
                        {
                            "user_name": "Test Person",
                            "planned_count": 5,
                            "completed_on_time_count": 4,
                            "completed_late_count": 0,
                            "additional_count": 1,
                            "suggested_level": "A",
                            "suggested_symbol": "+",
                            "final_level": None,
                            "final_symbol": None,
                            "facts_json": {
                                "weekly_progress_percent": 80,
                                "questions": [
                                    {
                                        "key": "task_status",
                                        "label": "Statusi i detyrave",
                                        "auto_value": {"planned": 5, "completed": 4},
                                        "final_value": None,
                                        "source_status": "AUTO",
                                        "evidence_ids": ["task-1"],
                                        "explanation": "",
                                    }
                                ],
                                "tasks": [
                                    {
                                        "task_id": "task-1",
                                        "match_key": "task-1",
                                        "title": "Task",
                                        "source_type": "system",
                                        "classification": "completed_on_time",
                                    }
                                ],
                                "observations": [],
                            },
                        }
                    ],
                }
            ],
        )
        workbook = load_workbook(io.BytesIO(payload), data_only=False)
        self.assertEqual(
            workbook.sheetnames,
            ["Përmbledhje", "Development", "Evidenca", "Udhëzuesi"],
        )
        values = " ".join(
            str(cell.value or "")
            for sheet in workbook.worksheets
            for row in sheet.iter_rows()
            for cell in row
        ).lower()
        self.assertNotIn("bonus", values)
        self.assertNotIn("€", values)


if __name__ == "__main__":
    unittest.main()
