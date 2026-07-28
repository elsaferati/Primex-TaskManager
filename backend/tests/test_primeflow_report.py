from __future__ import annotations

import unittest
import io
import os
import zipfile
import asyncio
from datetime import date
from unittest.mock import patch

from app.services.primeflow_report import (
    GmailService, STATUS_MARKERS, build_report, clean_description, clean_title, exact_subject, filter_tasks,
    build_report_document, predecessor, previous_working_day, render_docx, render_html,
    render_plain_text, render_png, report_subject,
)


class PrimeFlowReportTests(unittest.TestCase):
    def test_smtp_message_contains_word_and_png_attachments(self) -> None:
        sent_messages = []

        class FakeSmtp:
            def __init__(self, *args, **kwargs):
                pass

            def __enter__(self):
                return self

            def __exit__(self, *args):
                pass

            def ehlo(self):
                pass

            def starttls(self, **kwargs):
                pass

            def login(self, *args):
                pass

            def send_message(self, message, **kwargs):
                sent_messages.append(message)

        with patch.dict(os.environ, {"EMAIL_USER": "sender@example.com", "EMAIL_PASSWORD": "app-password"}):
            with patch("app.services.primeflow_report.smtplib.SMTP", FakeSmtp):
                asyncio.run(GmailService().send_verified(
                    "Report", ["recipient@example.com"], "Plain", "<strong>HTML</strong>",
                    attachments=[
                        ("report.docx", b"word", "application/vnd.openxmlformats-officedocument.wordprocessingml.document"),
                        ("report.png", b"png", "image/png"),
                    ],
                ))

        self.assertEqual(len(sent_messages), 1)
        attachments = list(sent_messages[0].iter_attachments())
        self.assertEqual([item.get_filename() for item in attachments], ["report.docx", "report.png"])
        self.assertEqual(
            [item.get_content_type() for item in attachments],
            ["application/vnd.openxmlformats-officedocument.wordprocessingml.document", "image/png"],
        )

    def test_previous_working_day_and_subject(self) -> None:
        self.assertEqual(previous_working_day(date(2026, 7, 27)), date(2026, 7, 24))
        self.assertEqual(previous_working_day(date(2026, 7, 28)), date(2026, 7, 27))
        self.assertEqual(report_subject(date(2026, 7, 28), "10:00"), "PrimeFlow 1H – 28.07.2026 – 10:00")

    def test_exact_subject_is_not_fuzzy(self) -> None:
        headers = [{"name": "Subject", "value": "PrimeFlow 1H – 28.07.2026 – 10:00"}]
        self.assertTrue(exact_subject(headers, "PrimeFlow 1H – 28.07.2026 – 10:00"))
        self.assertFalse(exact_subject(headers, "PrimeFlow 1H – 28.07.2026 – 11:00"))

    def test_description_removes_only_technical_tags(self) -> None:
        original = "[[added]]1. Çdo Überprüfung\n\nMiSSpelled TEXT[[/added]]\n[[done]]2. Përfundo[[/done]]"
        self.assertEqual(clean_description(original), "1. Çdo Überprüfung\n\nMiSSpelled TEXT\n2. Përfundo")
        self.assertEqual(clean_title("[[added]] [[ADDED]]Exact[[/added]] [[ / added ]]"), "Exact")

    def test_filtering_deduplicates_and_requires_exact_date_slot_and_user(self) -> None:
        base = {"id": "1", "date": "2026-07-28", "slot": "10:00", "employee": "Elsa", "title": "Exact", "status": "TODO"}
        tasks = [base, dict(base), {**base, "id": "2", "date": "2026-07-29"}, {**base, "id": "3", "slot": "11:00"}, {**base, "id": "4", "employee": ""}]
        self.assertEqual(filter_tasks(tasks, date(2026, 7, 28), "10:00"), [base])

    def test_status_sort_numbering_order_and_description_preservation(self) -> None:
        tasks = [
            {"id": "d", "date": "2026-07-28", "slot": "10:00", "employee": "Besa", "title": "Done EXACT", "description": "Zeile 1\n\nZeile 3", "status": "DONE"},
            {"id": "i", "date": "2026-07-28", "slot": "10:00", "employee": "Besa", "title": "in progress exact", "description": "[[added]]Përshkrim[[/added]]", "status": "IN_PROGRESS"},
            {"id": "t", "date": "2026-07-28", "slot": "10:00", "employee": "Besa", "title": "TODO exact", "description": "1. Erst\n2. Zweit", "status": "TODO"},
        ]
        body = build_report({"generated_at": "2026-07-28T08:59:00+02:00", "guardrails": {"truncated": {}}, "items": {"oneH": tasks}}, date(2026, 7, 28), "10:00")
        self.assertLess(body.index(STATUS_MARKERS["IN_PROGRESS"]), body.index(STATUS_MARKERS["TODO"]))
        self.assertLess(body.index(STATUS_MARKERS["TODO"]), body.index(STATUS_MARKERS["DONE"]))
        self.assertIn("1.1 🟡 IN PROGRESS in progress exact", body)
        self.assertIn("Zeile 1\n\nZeile 3", body)
        self.assertIn("1. Erst\n2. Zweit", body)
        self.assertNotIn("[[added]]", body)

    def test_truncation_blocks_report(self) -> None:
        with self.assertRaisesRegex(ValueError, "truncated"):
            build_report({"guardrails": {"truncated": {"oneH": True}}}, date(2026, 7, 28), "10:00")

    def test_section_order_and_backfill_chain(self) -> None:
        body = build_report({"guardrails": {"truncated": {}}, "items": {}}, date(2026, 7, 28), "10:00")
        headings = ["SLOTI 27.07.2026 16:00", "SLOTI 28.07.2026 10:00", "SLOTI 28.07.2026 11:00", "DETYRA PA SLOT", "DETYRAT E BLLOKUT", "P: PERSONALE", "R1 = 1H"]
        positions = [body.index(value) for value in headings]
        self.assertEqual(positions, sorted(positions))
        self.assertEqual(predecessor(date(2026, 7, 28), "10:00"), (date(2026, 7, 27), "16:00"))
        self.assertEqual(predecessor(date(2026, 7, 28), "14:20"), (date(2026, 7, 28), "11:50"))

    def test_all_formats_share_one_normalized_document(self) -> None:
        exact_title = "ÄNDERUNG pa përmbledhje"
        exact_description = "1. Zeile\n\n2. Përshkrim [[added]]EXACT[[/added]]"
        data = {
            "generated_at": "2026-07-28T08:59:00+02:00",
            "guardrails": {"truncated": {}},
            "items": {"oneH": [{
                "id": "x", "date": "2026-07-28", "one_h_report_slot": "10:00",
                "person": "Besa", "task_title": exact_title, "description": exact_description,
                "status": "IN_PROGRESS",
            }]},
        }
        document = build_report_document(data, date(2026, 7, 28), "10:00", {"to": ["ga@primexeu.com"], "cc": [], "bcc": []})
        plain = render_plain_text(document)
        html = render_html(document)
        docx = render_docx(document)
        png = render_png(document)
        self.assertIn(exact_title, plain)
        self.assertIn("1. Zeile\n\n2. Përshkrim EXACT", plain)
        self.assertIn(exact_title, html)
        self.assertIn("@media(max-width:600px)", html)
        self.assertIn("#fef3c7", html)
        with zipfile.ZipFile(io.BytesIO(docx)) as archive:
            xml = archive.read("word/document.xml").decode("utf-8")
        self.assertIn(exact_title, xml)
        self.assertIn("Përshkrim EXACT", xml)
        self.assertIn('w:fill="fef3c7"', xml)
        self.assertTrue(png.startswith(b"\x89PNG\r\n\x1a\n"))
        self.assertGreater(document.task_count, 0)


if __name__ == "__main__":
    unittest.main()
