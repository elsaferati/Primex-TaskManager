from __future__ import annotations

import unittest
from datetime import date
from io import BytesIO
from unittest.mock import AsyncMock, patch

from docx import Document
from openpyxl import load_workbook
from PIL import Image

from app.services.tomorrow_closing_sections import ClosingSection, ClosingTable, ClosingTableRow, _stack_start_due
from app.services.tomorrow_print_report import (
    _closing_sections_html,
    _docx_table_attachment,
    _excel_table_attachment,
    _png_table_attachment,
    build_tomorrow_print_report,
)


def closing_fixture() -> list[ClosingSection]:
    return [
        ClosingSection(
            title="DET PA PROGRESS",
            tables=[ClosingTable(
                label="TODO",
                columns=["NR", "KUSH", "DEP", "AM/PM", "TITULLI", "ARSYEJA", "KOMENT"],
                rows=[ClosingTableRow(
                    values=["1", "EF", "DEV", "PM", "Pink task", "Urgjence", "Pres input"],
                    status="TODO",
                )],
                tone="todo",
            )],
        ),
        ClosingSection(
            title="DET SYS PA KRY",
            tables=[ClosingTable(
                label="DET SYS PA KRY",
                columns=["NR", "KUSH", "DEP", "AM/PM", "TITULLI"],
                rows=[ClosingTableRow(
                    values=["1", "RA", "DEV", "AM", "System unfinished"],
                    status="IN_PROGRESS",
                )],
            )],
        ),
        ClosingSection(
            title="DET E SHTYERA",
            tables=[ClosingTable(
                label="SHTYER DUE DATE",
                columns=["NR", "KUSH", "DEP", "AM/PM", "LLOJI", "NGA", "NE", "TITULLI"],
                rows=[ClosingTableRow(
                    values=[
                        "1", "FG", "GD", "PM", "P",
                        "START: 02.09.2026\nDUE: 02.09.2026",
                        "START: 03.09.2026\nDUE: 03.09.2026",
                        "Moved task",
                    ],
                    status="WAITING_CONFIRMATION",
                )],
            )],
        ),
        ClosingSection(
            title="NOTES PA DISK",
            tables=[ClosingTable(
                label="NOTES",
                columns=["NR", "DISK", "NOTE", "FROM", "TIME"],
                rows=[ClosingTableRow(values=["1", "NO", "Undiscussed note", "GA", "09:15"])],
                tone="notes",
            )],
        ),
    ]


class TomorrowClosingFormatParityTests(unittest.TestCase):
    def test_m3_start_due_value_is_stacked(self) -> None:
        self.assertEqual(
            _stack_start_due("START: 02.09.2026 / DUE: 02.09.2026"),
            "START: 02.09.2026\nDUE: 02.09.2026",
        )

    def test_html_xlsx_png_and_docx_contain_same_closing_sections(self) -> None:
        sections = closing_fixture()
        expected = [section.title for section in sections] + [
            "Pink task", "System unfinished", "Moved task", "Undiscussed note"
        ]

        html = _closing_sections_html(sections)
        for value in expected:
            self.assertIn(value, html)
        self.assertLess(html.index("DET PA PROGRESS"), html.index("DET SYS PA KRY"))
        self.assertIn("background-color:#FFC4ED", html)
        self.assertIn("background-color:#FFFF00", html)
        self.assertIn("background-color:#DBEAFE", html)
        self.assertIn("table-layout:auto", html)
        self.assertIn('width="1%"', html)
        self.assertIn("white-space:nowrap;width:1%", html)
        self.assertIn('width="16%"', html)
        self.assertIn("border-bottom:1px solid #94A3B8", html)
        self.assertIn("START: 02.09.2026</div>", html)
        self.assertIn("DUE: 02.09.2026</div>", html)

        _, xlsx_bytes, _ = _excel_table_attachment([], [], date(2026, 9, 3), closing_sections=sections)
        workbook = load_workbook(BytesIO(xlsx_bytes))
        xlsx_text = "\n".join(str(cell.value or "") for row in workbook.active.iter_rows() for cell in row)
        for value in expected:
            self.assertIn(value, xlsx_text)

        _, png_bytes, _ = _png_table_attachment([], date(2026, 9, 3), closing_sections=sections)
        image = Image.open(BytesIO(png_bytes))
        self.assertEqual(image.format, "PNG")
        self.assertGreater(image.height, 500)

        _, docx_bytes, _ = _docx_table_attachment([], date(2026, 9, 3), closing_sections=sections)
        document = Document(BytesIO(docx_bytes))
        self.assertGreater(document.sections[0].page_width, document.sections[0].page_height)
        self.assertGreaterEqual(len(document.tables), 5)
        docx_text = "\n".join(
            [paragraph.text for paragraph in document.paragraphs]
            + [cell.text for table in document.tables for row in table.rows for cell in row.cells]
        )
        for value in expected:
            self.assertIn(value, docx_text)
        document_xml = document._element.xml
        for color in ("FFC4ED", "FFFF00", "FFEDD5", "DBEAFE", "FEE2E2"):
            self.assertIn(color, document_xml)


class TomorrowClosingBuildTests(unittest.IsolatedAsyncioTestCase):
    async def test_tomorrow_report_places_closing_sections_before_tasks_and_adds_all_formats(self) -> None:
        payload = {
            "items": {"oneH": [{
                "id": "task-next", "title": "Tomorrow task", "date": "2026-09-03",
                "status": "TODO", "oneHReportSlot": "10:00",
            }]},
            "users": [],
            "departments": [],
        }
        with patch(
            "app.services.tomorrow_print_report.build_tomorrow_closing_sections",
            new=AsyncMock(return_value=closing_fixture()),
        ):
            report = await build_tomorrow_print_report(
                date(2026, 9, 2), include_attachment=True, db=object(), payload=payload
            )
        self.assertLess(report["html"].index("DET PA PROGRESS"), report["html"].index("Tomorrow task"))
        self.assertEqual(
            [attachment[2] for attachment in report["attachments"]],
            [
                "application/vnd.openxmlformats-officedocument.spreadsheetml.sheet",
                "image/png",
                "application/vnd.openxmlformats-officedocument.wordprocessingml.document",
            ],
        )


if __name__ == "__main__":
    unittest.main()
