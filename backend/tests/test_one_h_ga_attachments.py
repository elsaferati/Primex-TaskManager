from __future__ import annotations

import unittest
from datetime import date
from io import BytesIO
from types import SimpleNamespace
from unittest.mock import AsyncMock, MagicMock, patch

from PIL import Image

from app.services.ga_time_table import DEFAULT_GA_TIME_TABLE_ROWS
from app.services.one_h_ga_attachments import (
    build_ga_only_1h_attachments,
    render_ga_tables_html,
    render_ga_time_table_html,
    render_ga_time_table_png,
)
from app.services.primeflow_report_delivery import split_ga_recipient_map
from app.services.primeflow_report import build_report_document, render_html


def _result(rows):
    result = MagicMock()
    result.scalars.return_value.all.return_value = rows
    return result


class GaOnlyOneHAttachmentTests(unittest.IsolatedAsyncioTestCase):
    def test_temporary_png_recipient_is_removed_from_every_regular_header(self) -> None:
        regular, ga = split_ga_recipient_map({
            "to": ["staff@primexeu.com"],
            "cc": ["130PRIMEX.EU@GMAIL.COM", "manager@primexeu.com"],
            "bcc": ["130primex.eu@gmail.com", "audit@primexeu.com"],
        })

        self.assertEqual(regular, {
            "to": ["staff@primexeu.com"],
            "cc": ["manager@primexeu.com"],
            "bcc": ["audit@primexeu.com"],
        })
        self.assertEqual(ga, {"to": ["130primex.eu@gmail.com"], "cc": [], "bcc": []})

    def test_regular_cc_is_promoted_when_png_recipient_was_the_only_to_recipient(self) -> None:
        regular, ga = split_ga_recipient_map({
            "to": ["130primex.eu@gmail.com"],
            "cc": ["manager@primexeu.com"],
            "bcc": [],
        })

        self.assertEqual(regular["to"], ["manager@primexeu.com"])
        self.assertEqual(regular["cc"], [])
        self.assertIsNotNone(ga)

    def test_temporary_png_recipient_is_added_even_when_not_in_regular_configuration(self) -> None:
        regular, ga = split_ga_recipient_map({
            "to": ["ga@primexeu.com"],
            "cc": [],
            "bcc": [],
        })

        self.assertEqual(regular["to"], ["ga@primexeu.com"])
        self.assertEqual(ga, {"to": ["130primex.eu@gmail.com"], "cc": [], "bcc": []})

    async def test_empty_timetable_still_renders_a_valid_week_png(self) -> None:
        db = SimpleNamespace(execute=AsyncMock(side_effect=[
            _result(list(DEFAULT_GA_TIME_TABLE_ROWS)),
            _result([SimpleNamespace(id="ga-user")]),
            _result([]),
            _result([]),
        ]))

        png = await render_ga_time_table_png(db, date(2026, 8, 24))

        self.assertTrue(png.startswith(b"\x89PNG\r\n\x1a\n"))
        image = Image.open(BytesIO(png))
        self.assertGreater(image.width, 1500)
        self.assertGreater(image.height, 700)

    async def test_attachment_bundle_has_weekly_timetable_and_daily_ga_hv_png(self) -> None:
        with (
            patch(
                "app.services.one_h_ga_attachments.render_ga_time_table_png",
                new=AsyncMock(return_value=b"\x89PNG-time"),
            ),
            patch(
                "app.services.one_h_ga_attachments.render_ga_hv_tasks_png",
                new=AsyncMock(return_value=b"\x89PNG-tasks"),
            ),
        ):
            attachments = await build_ga_only_1h_attachments(SimpleNamespace(), date(2026, 8, 26))

        self.assertEqual(
            [(name, mime) for name, _, mime in attachments],
            [
                ("GA-Time-Table-2026-08-24.png", "image/png"),
                ("GA-HV-Tasks-2026-08-26.png", "image/png"),
            ],
        )

    async def test_timetable_email_version_is_a_native_html_table(self) -> None:
        db = SimpleNamespace(execute=AsyncMock(side_effect=[
            _result(list(DEFAULT_GA_TIME_TABLE_ROWS)),
            _result([SimpleNamespace(id="ga-user")]),
            _result([]),
            _result([]),
        ]))

        rendered = await render_ga_time_table_html(db, date(2026, 8, 24))

        self.assertIn('data-ga-time-table="true"', rendered)
        self.assertIn("24.08.2026", rendered)
        self.assertIn("28.08.2026", rendered)
        self.assertNotIn("<img", rendered)

    async def test_inline_tables_are_inserted_before_the_first_slot(self) -> None:
        document = build_report_document(
            {"guardrails": {"truncated": {}}, "items": {}},
            date(2026, 8, 24),
            "10:00",
        )

        with (
            patch(
                "app.services.one_h_ga_attachments.render_ga_time_table_html",
                new=AsyncMock(return_value='<table data-ga-time-table="true"></table>'),
            ),
            patch(
                "app.services.one_h_ga_attachments.render_ga_hv_tasks_html",
                new=AsyncMock(return_value='<table data-ga-hv-tasks="true"></table>'),
            ),
        ):
            tables = await render_ga_tables_html(SimpleNamespace(), date(2026, 8, 24))
        rendered = render_html(document, pre_sections_html=tables, content_width=1200)

        inline_position = rendered.index('data-ga-inline-tables="true"')
        first_slot_position = rendered.index("10:00 SLOTI 24.08.2026")
        self.assertLess(inline_position, first_slot_position)
        self.assertIn('data-ga-time-table="true"', rendered)
        self.assertIn('data-ga-hv-tasks="true"', rendered)
        self.assertNotIn("cid:primeflow-ga", rendered)
        self.assertIn('width="1200"', rendered)


if __name__ == "__main__":
    unittest.main()
