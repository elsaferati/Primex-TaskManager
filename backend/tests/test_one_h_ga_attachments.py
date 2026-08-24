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
    render_ga_time_table_png,
)
from app.services.primeflow_report_delivery import split_ga_recipient_map


def _result(rows):
    result = MagicMock()
    result.scalars.return_value.all.return_value = rows
    return result


class GaOnlyOneHAttachmentTests(unittest.IsolatedAsyncioTestCase):
    def test_ga_is_removed_from_every_regular_recipient_header(self) -> None:
        regular, ga = split_ga_recipient_map({
            "to": ["staff@primexeu.com"],
            "cc": ["GA@PRIMEXEU.COM", "manager@primexeu.com"],
            "bcc": ["ga@primexeu.com", "audit@primexeu.com"],
        })

        self.assertEqual(regular, {
            "to": ["staff@primexeu.com"],
            "cc": ["manager@primexeu.com"],
            "bcc": ["audit@primexeu.com"],
        })
        self.assertEqual(ga, {"to": ["ga@primexeu.com"], "cc": [], "bcc": []})

    def test_regular_cc_is_promoted_when_ga_was_the_only_to_recipient(self) -> None:
        regular, ga = split_ga_recipient_map({
            "to": ["ga@primexeu.com"],
            "cc": ["manager@primexeu.com"],
            "bcc": [],
        })

        self.assertEqual(regular["to"], ["manager@primexeu.com"])
        self.assertEqual(regular["cc"], [])
        self.assertIsNotNone(ga)

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


if __name__ == "__main__":
    unittest.main()
