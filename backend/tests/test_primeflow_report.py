from __future__ import annotations

import unittest
import io
import os
import uuid
import zipfile
import asyncio
from datetime import date, datetime, timezone
from types import SimpleNamespace
from unittest.mock import patch

from app.services.primeflow_report_access import can_manage_reports
from app.services.primeflow_report import (
    GmailService, STATUS_MARKERS, build_report, clean_description, clean_title, employee_initials,
    exact_subject, filter_tasks,
    build_report_document, predecessor, previous_working_day, render_docx, render_html,
    render_plain_text, render_png, report_subject, ReportReminderQuestion, BOARD_REMINDER_SECTION_TITLE,
    REMINDER_SECTION_TITLE,
)
from app.services.task_strike_events import (
    point_key,
    record_description_strike_events,
    render_description_for_interval,
)


class PrimeFlowReportTests(unittest.TestCase):
    def test_report_management_access_includes_laurent_hoxha(self) -> None:
        laurent = SimpleNamespace(role=SimpleNamespace(value="STAFF"), full_name="Laurent Hoxha")
        other_staff = SimpleNamespace(role=SimpleNamespace(value="STAFF"), full_name="Other Staff")
        admin = SimpleNamespace(role=SimpleNamespace(value="ADMIN"), full_name="Admin User")
        self.assertTrue(can_manage_reports(laurent))
        self.assertTrue(can_manage_reports(admin))
        self.assertFalse(can_manage_reports(other_staff))

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
        self.assertLess(body.index("in progress exact"), body.index("TODO exact"))
        self.assertLess(body.index("TODO exact"), body.index("Done EXACT"))
        self.assertNotIn("IN PROGRESS", body)
        self.assertNotIn("1.1", body)
        self.assertIn("Zeile 1\n\nZeile 3", body)
        self.assertIn("1. Erst\n2. Zweit", body)
        self.assertNotIn("[[added]]", body)

    def test_report_splits_numbered_details_and_preserves_done_marks(self) -> None:
        data = {
            "generated_at": "2026-07-28T08:59:00+02:00",
            "guardrails": {"truncated": {}},
            "items": {"oneH": [{
                "id": "marked", "date": "2026-07-28", "one_h_report_slot": "10:00",
                "person": "Anisa", "status": "TODO",
                "task_title": "PF ASSISTANT 1. First item 2. [[done]]Finished item[[/done]] 3. Third item",
                "description": "",
            }]},
        }
        document = build_report_document(data, date(2026, 7, 28), "10:00")
        html = render_html(document)
        self.assertIn("PF ASSISTANT", html)
        self.assertIn("1. First item", html)
        self.assertIn("color:#64748b", html)
        self.assertIn("text-decoration:line-through", html)
        self.assertIn("Finished item", html)
        self.assertNotIn("Përshkrimi:", html)
        self.assertNotIn("Pa përshkrim", html)
        self.assertNotIn("TODO", html)

    def test_multiline_title_details_render_grey(self) -> None:
        data = {
            "generated_at": "2026-08-06T11:00:00+02:00",
            "guardrails": {"truncated": {}},
            "items": {"oneH": [{
                "id": "dv", "date": "2026-08-06", "slot": "11:00",
                "person": "Denis", "status": "IN_PROGRESS",
                "task_title": "DV: MST: AKINEA VS PIM\n31 CUSHT- Prezentimi\n34 steps manual working",
                "description": "Rregullohet dizajni",
            }]},
        }
        html = render_html(build_report_document(data, date(2026, 8, 6), "11:00"))
        self.assertIn("DV: MST: AKINEA VS PIM", html)
        self.assertIn("31 CUSHT- Prezentimi", html)
        self.assertIn("34 steps manual working", html)
        self.assertIn("Rregullohet dizajni", html)
        self.assertIn("color:#64748b", html)
        self.assertIn("bgcolor=\"#fef3c7\"", html)
        self.assertNotIn("color:#111827", html)

    def test_reminder_questions_render_at_start(self) -> None:
        data = {
            "generated_at": "2026-08-06T11:00:00+02:00",
            "guardrails": {"truncated": {}},
            "items": {"oneH": [{
                "id": "t1", "date": "2026-08-06", "slot": "11:00",
                "person": "Denis", "status": "TODO", "title": "Task one", "description": "",
            }]},
        }
        reminders = [
            ReportReminderQuestion(
                text="A eshte perfunduar detyra sipas planifikimit per slotin e caktuar?",
                guidance="DIREKT NE TEME, SHKURT, QARTE DHE SAKTE!!!!",
            ),
            ReportReminderQuestion(text="Nese jo, pse?"),
        ]
        document = build_report_document(data, date(2026, 8, 6), "11:00", reminders=reminders)
        plain = render_plain_text(document)
        html = render_html(document)
        self.assertLess(plain.index(BOARD_REMINDER_SECTION_TITLE), plain.index(REMINDER_SECTION_TITLE))
        self.assertLess(plain.index(REMINDER_SECTION_TITLE), plain.index("SLOTI 06.08.2026 11:00"))
        self.assertIn("1. Done?", plain)
        self.assertIn("2. Strike?", plain)
        self.assertIn("3. Notes te reja?", plain)
        self.assertIn("1. A eshte perfunduar detyra", plain)
        self.assertIn("DIREKT NE TEME, SHKURT, QARTE DHE SAKTE!!!!", plain)
        self.assertIn(REMINDER_SECTION_TITLE, html)
        self.assertIn(BOARD_REMINDER_SECTION_TITLE, html)
        self.assertIn("1. A eshte perfunduar detyra sipas planifikimit per slotin e caktuar?", html)
        self.assertIn("DIREKT NE TEME, SHKURT, QARTE DHE SAKTE!!!!", html)
        self.assertIn("color:#64748b", html)
        self.assertLess(html.index(REMINDER_SECTION_TITLE), html.index("SLOTI 06.08.2026 11:00"))

    def test_truncation_blocks_report(self) -> None:
        with self.assertRaisesRegex(ValueError, "truncated"):
            build_report({"guardrails": {"truncated": {"oneH": True}}}, date(2026, 7, 28), "10:00")

    def test_section_order_and_backfill_chain(self) -> None:
        body = build_report({"guardrails": {"truncated": {}}, "items": {}}, date(2026, 7, 28), "10:00")
        headings = ["SLOTI 28.07.2026 10:00", "SLOTI 28.07.2026 11:00", "SLOTI 28.07.2026 16:00", "DETYRA PA SLOT", "DETYRAT E BLLOKUT", "P: PERSONALE", "R1 = 1H"]
        positions = [body.index(value) for value in headings]
        self.assertEqual(positions, sorted(positions))
        self.assertNotIn("SLOTI 27.07.2026", body)
        self.assertEqual(predecessor(date(2026, 7, 28), "10:00"), (date(2026, 7, 27), "16:00"))
        self.assertEqual(predecessor(date(2026, 7, 28), "14:20"), (date(2026, 7, 28), "11:50"))

    def test_after_ten_includes_current_then_immediately_previous_slot(self) -> None:
        common = {"date": "2026-07-28", "person": "Anisa Tërnava", "status": "TODO"}
        data = {
            "generated_at": "2026-07-28T13:59:00+02:00",
            "guardrails": {"truncated": {}},
            "items": {
                "oneH": [
                    {**common, "id": "early", "slot": "11:50", "title": "Earlier"},
                    {**common, "id": "current", "slot": "14:20", "title": "Current"},
                    {**common, "id": "later", "slot": "16:00", "title": "Later"},
                ],
                "blocked": [{**common, "id": "blocked", "title": "Blocked"}],
                "personal": [{**common, "id": "personal", "title": "Personal"}],
                "r1": [{**common, "id": "r1", "title": "R1 task"}],
            },
        }
        document = build_report_document(data, date(2026, 7, 28), "14:20")
        self.assertEqual(
            [section.title for section in document.sections],
            ["SLOTI 28.07.2026 14:20", "SLOTI PARAPRAK 28.07.2026 11:50"],
        )
        self.assertEqual(document.task_count, 2)
        self.assertEqual(document.sections[0].employees[0].name, "AT")
        self.assertEqual(document.sections[0].employees[0].tasks[0].title, "Current")
        self.assertEqual(document.sections[1].employees[0].tasks[0].title, "Earlier")
        self.assertNotIn("Later", render_plain_text(document))

    def test_each_later_report_uses_the_immediately_previous_slot(self) -> None:
        common = {"date": "2026-07-28", "person": "Anisa Tërnava", "status": "TODO"}
        tasks = [
            {**common, "id": slot, "slot": slot, "title": f"Task {slot}"}
            for slot in ("10:00", "11:00", "11:50", "14:20", "16:00")
        ]
        data = {"guardrails": {"truncated": {}}, "items": {"oneH": tasks}}
        expected = {
            "11:00": "10:00",
            "11:50": "11:00",
            "14:20": "11:50",
            "16:00": "14:20",
        }
        for current, previous in expected.items():
            with self.subTest(current=current):
                document = build_report_document(data, date(2026, 7, 28), current)
                self.assertEqual(
                    [section.title for section in document.sections],
                    [
                        f"SLOTI 28.07.2026 {current}",
                        f"SLOTI PARAPRAK 28.07.2026 {previous}",
                    ],
                )
                self.assertEqual(document.task_count, 2)

    def test_employee_names_are_uppercase_initials(self) -> None:
        self.assertEqual(employee_initials("Anisa Tërnava"), "AT")
        self.assertEqual(employee_initials("elsa ferati ahmedi"), "EFA")

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
        self.assertIn("<!--[if mso]>", html)
        self.assertIn('width="600"', html)
        self.assertIn("#fef3c7", html)
        with zipfile.ZipFile(io.BytesIO(docx)) as archive:
            xml = archive.read("word/document.xml").decode("utf-8")
        self.assertIn(exact_title, xml)
        self.assertIn("Përshkrim EXACT", xml)
        self.assertIn('w:fill="fef3c7"', xml)
        self.assertTrue(png.startswith(b"\x89PNG\r\n\x1a\n"))
        self.assertGreater(document.task_count, 0)

    def test_checklist_points_are_reported_once_then_hidden_until_reopened(self) -> None:
        struck_at = datetime(2026, 8, 10, 10, 20, tzinfo=timezone.utc)
        description = "[[done]]1. Finished during this hour[[/done]]\n2. Still open"
        struck_event = SimpleNamespace(
            id="strike-1", point_key=point_key("1. Finished during this hour"),
            action="STRUCK", occurred_at=struck_at,
        )
        plain, marked = render_description_for_interval(
            description,
            [struck_event],
            interval_start=datetime(2026, 8, 10, 10, 0, tzinfo=timezone.utc),
            interval_end=datetime(2026, 8, 10, 11, 0, tzinfo=timezone.utc),
        )
        self.assertEqual(plain, "1. Finished during this hour\n2. Still open")
        self.assertIn("[[done]]1. Finished during this hour[[/done]]", marked)

        next_plain, next_marked = render_description_for_interval(
            description,
            [struck_event],
            interval_start=datetime(2026, 8, 10, 11, 0, tzinfo=timezone.utc),
            interval_end=datetime(2026, 8, 10, 11, 50, tzinfo=timezone.utc),
        )
        self.assertEqual(next_plain, "2. Still open")
        self.assertNotIn("Finished during this hour", next_marked)

        reopened_at = datetime(2026, 8, 10, 11, 30, tzinfo=timezone.utc)
        reopened_event = SimpleNamespace(
            id="unstrike-1", point_key=struck_event.point_key, action="UNSTRUCK", occurred_at=reopened_at,
        )
        reopened_plain, reopened_marked = render_description_for_interval(
            "1. Finished during this hour\n2. Still open",
            [struck_event, reopened_event],
            interval_start=datetime(2026, 8, 10, 11, 0, tzinfo=timezone.utc),
            interval_end=datetime(2026, 8, 10, 11, 50, tzinfo=timezone.utc),
        )
        self.assertEqual(reopened_plain, "1. Finished during this hour\n2. Still open")
        self.assertNotIn("[[done]]", reopened_marked)

    def test_task_update_records_each_strike_and_unstrike(self) -> None:
        class FakeSession:
            def __init__(self):
                self.rows = []

            def add(self, row):
                self.rows.append(row)

        session = FakeSession()
        task_id = uuid.uuid4()
        actor_id = uuid.uuid4()
        record_description_strike_events(
            session,
            task_id=task_id,
            actor_user_id=actor_id,
            before_description="1. One\n2. Two",
            after_description="[[done]]1. One\n2. Two[[/done]]",
        )
        self.assertEqual({row.action for row in session.rows}, {"STRUCK"})
        self.assertEqual({row.point_text for row in session.rows}, {"1. One", "2. Two"})

        reopened = FakeSession()
        record_description_strike_events(
            reopened,
            task_id=task_id,
            actor_user_id=actor_id,
            before_description="[[done]]1. One[[/done]]\n2. Two",
            after_description="1. One\n2. Two",
        )
        self.assertEqual([(row.action, row.point_text) for row in reopened.rows], [("UNSTRUCK", "1. One")])


if __name__ == "__main__":
    unittest.main()
