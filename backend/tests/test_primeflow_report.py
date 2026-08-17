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
    REMINDER_SECTION_TITLE, ReportUndiscussedNote, UNDISCUSSED_NOTES_SECTION_TITLE,
)
from app.services.task_strike_events import (
    point_key, struck_points,
    record_description_strike_events,
    record_title_strike_events,
    render_description_for_interval,
    render_text_for_interval,
    strike_timestamp_datetime,
    split_strike_timestamp,
)
from app.services.primeflow_report_delivery import (
    _undiscussed_px_notes_statement,
    strike_interval_end,
    strike_interval_start,
)


class PrimeFlowReportTests(unittest.TestCase):
    def test_undiscussed_notes_query_matches_open_px_notes_without_tasks(self) -> None:
        query = str(_undiscussed_px_notes_statement())

        self.assertIn("FROM ga_notes", query)
        self.assertIn("ga_notes.is_discussed IS false", query)
        self.assertIn("ga_notes.is_converted_to_task IS false", query)
        self.assertIn("NOT (EXISTS", query)
        self.assertIn("tasks.ga_note_origin_id = ga_notes.id", query)
        self.assertIn("ga_notes.created_at DESC", query)

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
        self.assertEqual(report_subject(date(2026, 7, 28), "10:00"), "【10:00】 PrimeFlow 1H - 28.07.2026")

    def test_exact_subject_is_not_fuzzy(self) -> None:
        headers = [{"name": "Subject", "value": "【10:00】 PrimeFlow 1H - 28.07.2026"}]
        self.assertTrue(exact_subject(headers, "【10:00】 PrimeFlow 1H - 28.07.2026"))
        self.assertFalse(exact_subject(headers, "【11:00】 PrimeFlow 1H - 28.07.2026"))

    def test_description_removes_only_technical_tags(self) -> None:
        original = "[[added]]1. Çdo Überprüfung\n\nMiSSpelled TEXT[[/added]]\n[[done]]2. Përfundo[[/done]]"
        self.assertEqual(clean_description(original), "1. Çdo Überprüfung\n\nMiSSpelled TEXT\n2. Përfundo")
        self.assertEqual(clean_title("[[added]] [[ADDED]]Exact[[/added]] [[ / added ]]"), "Exact")

    def test_filtering_deduplicates_and_requires_exact_date_slot_and_user(self) -> None:
        base = {"id": "1", "date": "2026-07-28", "slot": "10:00", "employee": "Elsa", "title": "Exact", "status": "TODO"}
        tasks = [base, dict(base), {**base, "id": "2", "date": "2026-07-29"}, {**base, "id": "3", "slot": "11:00"}, {**base, "id": "4", "employee": ""}]
        self.assertEqual(filter_tasks(tasks, date(2026, 7, 28), "10:00"), [base])

    def test_1420_today_report_includes_today_through_1420_but_not_later_tasks(self) -> None:
        report_day = date(2026, 8, 13)
        tasks = [
            {"id": "ten", "date": report_day.isoformat(), "slot": "10:00", "person": "Anisa", "title": "Morning", "status": "TODO"},
            {"id": "eleven", "date": report_day.isoformat(), "slot": "11:00", "person": "Anisa", "title": "Midday", "status": "TODO"},
            {"id": "afternoon", "date": report_day.isoformat(), "slot": "14:20", "person": "Anisa", "title": "Afternoon", "status": "TODO"},
            {"id": "late", "date": report_day.isoformat(), "slot": "15:50", "person": "Anisa", "title": "Late task", "status": "TODO"},
        ]
        document = build_report_document(
            {"guardrails": {"truncated": {}}, "items": {"oneH": tasks}}, report_day, "14:20"
        )
        rendered = render_plain_text(document)

        self.assertEqual(document.report_slot, "14:20")
        self.assertIn("Morning", rendered)
        self.assertIn("Midday", rendered)
        self.assertIn("Afternoon", rendered)
        self.assertNotIn("Late task", rendered)

    def test_1410_report_reads_the_existing_1420_task_bucket(self) -> None:
        report_day = date(2026, 8, 13)
        document = build_report_document(
            {"guardrails": {"truncated": {}}, "items": {"oneH": [{
                "id": "afternoon", "date": report_day.isoformat(), "slot": "14:20", "person": "Anisa",
                "title": "Afternoon bucket task", "status": "TODO",
            }]}},
            report_day,
            "14:10",
        )
        self.assertIn("Afternoon bucket task", render_plain_text(document))

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

    def test_common_view_source_note_title_keeps_numbered_subtasks(self) -> None:
        """The source note is the report content, not the short internal task label."""
        task_id = str(uuid.uuid4())
        full_note = (
            "OH/EF: 5 WFC RREG I WEBIT PX\n"
            "1. Operation Services\n"
            "2. Customer Support\n"
            "3. E-commerce & Product Data\n"
            "4. Design & 3D Visualization\n"
            "5. IT Solutions"
        )
        data = {
            "generated_at": "2026-08-10T09:59:00+02:00",
            "guardrails": {"truncated": {}},
            "items": {"oneH": [{
                # `id` is deliberately the Common View composite display id;
                # title overrides must use the actual task_id.
                "id": f"task:{task_id}:2026-08-10",
                "task_id": task_id,
                "date": "2026-08-10",
                "slot": "10:00",
                "person": "Elsa Ferati",
                "status": "TODO",
                "title": full_note,
                "task_title": "OH/EF: 5 WFC RREG I WEBIT PX",
                "description": None,
            }]},
        }
        document = build_report_document(
            data,
            date(2026, 8, 10),
            "10:00",
            title_overrides={task_id: (full_note, full_note)},
        )
        html = render_html(document)
        self.assertIn("OH/EF: 5 WFC RREG I WEBIT PX", html)
        self.assertIn("1. Operation Services", html)
        self.assertIn("5. IT Solutions", html)
        self.assertNotIn("PÃ«rshkrimi:", html)

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
            ReportReminderQuestion(text="Hap doc dhe det"),
            ReportReminderQuestion(text="Share screen side by side DET/REZULTATIN"),
            ReportReminderQuestion(text="Sqaro slotin paraprak pastaj aktual"),
        ]
        document = build_report_document(data, date(2026, 8, 6), "11:00", reminders=reminders)
        plain = render_plain_text(document)
        html = render_html(document)
        self.assertLess(plain.index(BOARD_REMINDER_SECTION_TITLE), plain.index(REMINDER_SECTION_TITLE))
        self.assertLess(plain.index(REMINDER_SECTION_TITLE), plain.index("11:00 SLOTI 06.08.2026"))
        self.assertIn("1. Slotin paraprak/aktual", plain)
        self.assertIn("6. A arrihet RLZ javor?", plain)
        self.assertIn("1. Hap doc dhe det", plain)
        self.assertIn("2. Share screen side by side DET/REZULTATIN", plain)
        self.assertIn(REMINDER_SECTION_TITLE, html)
        self.assertIn(BOARD_REMINDER_SECTION_TITLE, html)
        self.assertIn('data-reminder-columns="true"', html)
        self.assertIn('width="50%" valign="top"', html)
        self.assertIn("A ke filluar me slotin aktual?", html)
        self.assertIn("Sqaro slotin paraprak pastaj aktual", html)
        self.assertIn("color:#64748b", html)
        self.assertLess(html.index(REMINDER_SECTION_TITLE), html.index("11:00 SLOTI 06.08.2026"))

    def test_undiscussed_notes_table_is_only_rendered_when_notes_exist(self) -> None:
        report_day = date(2026, 8, 13)
        base_data = {"guardrails": {"truncated": {}}, "items": {}}
        without_notes = build_report_document(base_data, report_day, "10:00")
        self.assertNotIn(UNDISCUSSED_NOTES_SECTION_TITLE, render_plain_text(without_notes))
        self.assertNotIn("data-undiscussed-notes-table", render_html(without_notes))

        document = build_report_document(
            base_data,
            report_day,
            "10:00",
            undiscussed_notes=[ReportUndiscussedNote(
                content="Please discuss this PX note", author="Anisa", created_at=datetime(2026, 8, 13, 8, 30, tzinfo=timezone.utc)
            )],
        )
        plain = render_plain_text(document)
        html = render_html(document)
        word_xml = zipfile.ZipFile(io.BytesIO(render_docx(document))).read("word/document.xml").decode("utf-8")
        png = render_png(document)

        self.assertIn(UNDISCUSSED_NOTES_SECTION_TITLE, plain)
        self.assertIn("Please discuss this PX note", plain)
        self.assertIn('data-undiscussed-notes-table="true"', html)
        self.assertIn('bgcolor="#dbeafe"', html)
        self.assertIn("Please discuss this PX note", html)
        self.assertIn(UNDISCUSSED_NOTES_SECTION_TITLE, word_xml)
        self.assertIn("Please discuss this PX note", word_xml)
        self.assertTrue(png.startswith(b"\x89PNG"))

    def test_truncation_blocks_report(self) -> None:
        with self.assertRaisesRegex(ValueError, "truncated"):
            build_report({"guardrails": {"truncated": {"oneH": True}}}, date(2026, 7, 28), "10:00")

    def test_section_order_and_backfill_chain(self) -> None:
        body = build_report({"guardrails": {"truncated": {}}, "items": {}}, date(2026, 7, 28), "10:00")
        headings = ["10:00 SLOTI 28.07.2026", "11:00 SLOTI 28.07.2026", "15:50 SLOTI 28.07.2026", "DETYRA PA SLOT", "P: PERSONALE", "R1 = 1H"]
        positions = [body.index(value) for value in headings]
        self.assertEqual(positions, sorted(positions))
        self.assertNotIn("DETYRAT E BLLOKUT", body)
        self.assertNotIn("SLOTI 27.07.2026", body)
        self.assertEqual(predecessor(date(2026, 7, 28), "10:00"), (date(2026, 7, 27), "15:50"))
        self.assertEqual(predecessor(date(2026, 7, 28), "14:10"), (date(2026, 7, 28), "11:50"))
        self.assertEqual(predecessor(date(2026, 7, 28), "14:20"), (date(2026, 7, 28), "14:10"))

    def test_after_ten_includes_current_then_immediately_previous_slot(self) -> None:
        common = {"date": "2026-07-28", "person": "Anisa Tërnava", "status": "TODO"}
        data = {
            "generated_at": "2026-07-28T13:59:00+02:00",
            "guardrails": {"truncated": {}},
            "departments": [{"id": "pcm", "code": "PCM"}],
            "items": {
                "oneH": [
                    {**common, "id": "early", "slot": "11:50", "title": "Earlier"},
                    {**common, "id": "current", "slot": "14:20", "title": "Current"},
                    {**common, "id": "later", "slot": "15:50", "title": "Later"},
                ],
                "blocked": [{**common, "id": "blocked", "title": "Blocked", "department_id": "pcm"}],
                "personal": [{**common, "id": "personal", "title": "Personal"}],
                "r1": [{**common, "id": "r1", "title": "R1 task"}],
            },
        }
        document = build_report_document(data, date(2026, 7, 28), "14:10")
        self.assertEqual(
            [section.title for section in document.sections],
            [
                "14:10 SLOTI 28.07.2026",
                "11:50 SLOTI PARAPRAK 28.07.2026",
                "BLLOK 14:30-15:30 28.07.2026",
            ],
        )
        self.assertEqual(document.task_count, 3)
        self.assertEqual(document.sections[0].employees[0].name, "AT")
        self.assertEqual(document.sections[0].employees[0].tasks[0].title, "Current")
        self.assertEqual(document.sections[1].employees[0].tasks[0].title, "Earlier")
        self.assertEqual(document.sections[2].employees[0].tasks[0].title, "Blocked")
        html = render_html(document)
        self.assertIn('data-bll-task-table="true"', html)
        self.assertIn(">DEP</th>", html)
        self.assertIn(">PCM</td>", html)
        self.assertNotIn("Later", render_plain_text(document))

    def test_each_later_report_uses_the_immediately_previous_slot(self) -> None:
        common = {"date": "2026-07-28", "person": "Anisa Tërnava", "status": "TODO"}
        tasks = [
            {**common, "id": slot, "slot": slot, "title": f"Task {slot}"}
            for slot in ("10:00", "11:00", "11:50", "14:20", "15:50")
        ]
        data = {"guardrails": {"truncated": {}}, "items": {"oneH": tasks}}
        expected = {
            "11:00": "10:00",
            "11:50": "11:00",
            "14:10": "11:50",
            "15:50": "14:20",
        }
        for current, previous in expected.items():
            with self.subTest(current=current):
                document = build_report_document(data, date(2026, 7, 28), current)
                expected_titles = [
                    f"{current} SLOTI 28.07.2026",
                    f"{previous} SLOTI PARAPRAK 28.07.2026",
                ]
                if current == "14:10":
                    expected_titles.append("BLLOK 14:30-15:30 28.07.2026")
                self.assertEqual([section.title for section in document.sections], expected_titles)
                self.assertEqual(document.task_count, 2)

    def test_html_has_a_clear_separator_between_report_sections(self) -> None:
        data = {
            "generated_at": "2026-07-28T13:59:00+02:00",
            "guardrails": {"truncated": {}},
            "items": {"oneH": [
                {"id": "current", "date": "2026-07-28", "slot": "14:20", "person": "Anisa", "status": "TODO", "title": "Current"},
                {"id": "previous", "date": "2026-07-28", "slot": "11:50", "person": "Anisa", "status": "TODO", "title": "Previous"},
            ]},
        }
        html = render_html(build_report_document(data, date(2026, 7, 28), "14:10"))
        # Current slot, prior slot, and BLL need two unmistakable dividers.
        self.assertEqual(html.count('data-report-section-separator="true"'), 2)

    def test_employee_names_are_uppercase_initials(self) -> None:
        self.assertEqual(employee_initials("Anisa Tërnava"), "AT")
        self.assertEqual(employee_initials("elsa ferati ahmedi"), "EFA")

    def test_1h_uses_common_view_user_order_in_every_output(self) -> None:
        common = {"date": "2026-07-28", "slot": "10:00", "status": "TODO"}
        data = {
            "guardrails": {"truncated": {}},
            "items": {"oneH": [
                {
                    **common,
                    "id": "alphabetical-first", "person": "Adam Dev First", "title": "Adam task",
                    "weekly_planner_sort": [0, "dev", 0, 2, "Adam Dev First"],
                },
                {
                    **common,
                    "id": "planner-first", "person": "Zoe Dev First", "title": "Zoe task",
                    "weekly_planner_sort": [0, "dev", 0, 1, "Zoe Dev First"],
                },
                {
                    **common,
                    "id": "pcm", "person": "Ben Pcm", "title": "Ben task",
                    "weekly_planner_sort": [2, "pcm", 0, 1, "Ben Pcm"],
                },
            ]},
        }
        document = build_report_document(data, date(2026, 7, 28), "10:00")
        employee_names = [employee.name for employee in document.sections[0].employees]
        self.assertEqual(employee_names, ["ZDF", "ADF", "BP"])

        plain_text = render_plain_text(document)
        html = render_html(document)
        word_xml = zipfile.ZipFile(io.BytesIO(render_docx(document))).read("word/document.xml").decode("utf-8")
        self.assertLess(plain_text.index("ZDF"), plain_text.index("ADF"))
        self.assertLess(html.index(">ZDF</div>"), html.index(">ADF</div>"))
        self.assertLess(word_xml.index("ZDF"), word_xml.index("ADF"))

        from PIL import ImageDraw

        original_draw = ImageDraw.Draw
        drawn_text: list[str] = []

        class RecordingDraw:
            def __init__(self, image):
                self._draw = original_draw(image)

            def text(self, xy, text, *args, **kwargs):
                drawn_text.append(str(text))
                return self._draw.text(xy, text, *args, **kwargs)

            def __getattr__(self, name):
                return getattr(self._draw, name)

        with patch("PIL.ImageDraw.Draw", RecordingDraw):
            png = render_png(document)

        self.assertTrue(png.startswith(b"\x89PNG"))
        self.assertLess(drawn_text.index("ZDF"), drawn_text.index("ADF"))

    def test_blocked_table_uses_the_common_view_user_order(self) -> None:
        common = {"date": "2026-07-28", "status": "TODO"}
        data = {
            "guardrails": {"truncated": {}},
            "items": {"blocked": [
                {
                    **common,
                    "id": "adam", "person": "Adam Dev First", "title": "Adam blocked",
                    "weekly_planner_sort": [0, "dev", 0, 2, "Adam Dev First"],
                },
                {
                    **common,
                    "id": "zoe", "person": "Zoe Dev First", "title": "Zoe blocked",
                    "weekly_planner_sort": [0, "dev", 0, 1, "Zoe Dev First"],
                },
                {
                    **common,
                    "id": "ben", "person": "Ben Pcm", "title": "Ben blocked",
                    "weekly_planner_sort": [2, "pcm", 0, 1, "Ben Pcm"],
                },
            ]},
        }

        document = build_report_document(data, date(2026, 7, 28), "14:10")
        blocked_section = document.sections[-1]
        self.assertEqual(blocked_section.title, "BLLOK 14:30-15:30 28.07.2026")
        self.assertEqual([employee.name for employee in blocked_section.employees], ["ZDF", "ADF", "BP"])

        html = render_html(document)
        self.assertIn('data-bll-task-table="true"', html)
        self.assertLess(html.index(">ZDF</td>"), html.index(">ADF</td>"))

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

    def test_checklist_points_keep_their_strike_colour_until_reopened(self) -> None:
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
        self.assertIn("[[done:blue]]1. Finished during this hour[[/done]]", marked)

        next_plain, next_marked = render_description_for_interval(
            description,
            [struck_event],
            interval_start=datetime(2026, 8, 10, 11, 0, tzinfo=timezone.utc),
            interval_end=datetime(2026, 8, 10, 11, 50, tzinfo=timezone.utc),
        )
        self.assertEqual(next_plain, "1. Finished during this hour\n2. Still open")
        self.assertIn("[[done:green]]1. Finished during this hour[[/done]]", next_marked)

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

    def test_title_points_are_reported_once_with_the_heading_kept(self) -> None:
        title = "OH: 14 TT CAT VERS\n[[done]]1. Completed point[[/done]]\n2. Open point"
        event = SimpleNamespace(
            id="title-strike", field_name="TITLE", action="STRUCK",
            point_key=point_key("1. Completed point", field_name="TITLE"),
            occurred_at=datetime(2026, 8, 10, 10, 20, tzinfo=timezone.utc),
        )
        plain, marked = render_text_for_interval(
            title,
            [event],
            interval_start=datetime(2026, 8, 10, 10, 0, tzinfo=timezone.utc),
            interval_end=datetime(2026, 8, 10, 11, 0, tzinfo=timezone.utc),
            field_name="TITLE",
        )
        self.assertEqual(plain, "OH: 14 TT CAT VERS\n1. Completed point\n2. Open point")
        self.assertIn("[[done:blue]]1. Completed point[[/done]]", marked)

        next_plain, next_marked = render_text_for_interval(
            title,
            [event],
            interval_start=datetime(2026, 8, 10, 11, 0, tzinfo=timezone.utc),
            interval_end=datetime(2026, 8, 10, 11, 50, tzinfo=timezone.utc),
            field_name="TITLE",
        )
        self.assertEqual(next_plain, "OH: 14 TT CAT VERS\n1. Completed point\n2. Open point")
        self.assertIn("[[done:green]]1. Completed point[[/done]]", next_marked)

        class FakeSession:
            def __init__(self):
                self.rows = []

            def add(self, row):
                self.rows.append(row)

        session = FakeSession()
        record_title_strike_events(
            session,
            task_id=uuid.uuid4(),
            actor_user_id=uuid.uuid4(),
            before_title="OH: 14 TT CAT VERS\n1. Completed point\n2. Open point",
            after_title=title,
        )
        self.assertEqual(len(session.rows), 1)
        self.assertEqual(session.rows[0].field_name, "TITLE")
        self.assertEqual(session.rows[0].point_text, "1. Completed point")

    def test_partial_note_selection_matches_the_complete_numbered_subtask(self) -> None:
        # The UI may put the done markers around only the text after "1. ".
        # It must still be treated as one complete subtask in the report.
        title = "EF: 1/2 PF: 1H REPORT\n1. [[done]]Me i nda pyetje ne dy tabela[[/done]]\n2. Ende e hapur"
        full_point = "1. Me i nda pyetje ne dy tabela"
        self.assertIn(point_key(full_point, field_name="TITLE"), struck_points(title, field_name="TITLE"))

        event = SimpleNamespace(
            id="partial-strike", field_name="TITLE", action="STRUCK",
            # This represents an event saved before complete-line matching.
            point_key=point_key("Me i nda pyetje ne dy tabela", field_name="TITLE"),
            point_text="Me i nda pyetje ne dy tabela",
            occurred_at=datetime(2026, 8, 10, 11, 20, tzinfo=timezone.utc),
        )
        plain, marked = render_text_for_interval(
            title,
            [event],
            interval_start=datetime(2026, 8, 10, 11, 0, tzinfo=timezone.utc),
            interval_end=datetime(2026, 8, 10, 11, 50, tzinfo=timezone.utc),
            field_name="TITLE",
        )
        self.assertIn(full_point, plain)
        self.assertIn(f"[[done:blue]]{full_point}[[/done]]", marked)

        # A legacy marker without a recorded timestamp is historical and grey.
        legacy_plain, legacy_marked = render_text_for_interval(
            title,
            [],
            interval_start=datetime(2026, 8, 10, 11, 0, tzinfo=timezone.utc),
            interval_end=datetime(2026, 8, 10, 11, 50, tzinfo=timezone.utc),
            field_name="TITLE",
        )
        self.assertIn(full_point, legacy_plain)
        self.assertIn(f"[[done:grey]]{full_point}[[/done]]", legacy_marked)
        self.assertIn("2. Ende e hapur", legacy_plain)

    def test_strikes_are_blue_current_green_earlier_today_and_grey_previous_day(self) -> None:
        interval_start = datetime(2026, 8, 10, 9, 0, tzinfo=timezone.utc)
        interval_end = datetime(2026, 8, 10, 10, 50, tzinfo=timezone.utc)
        description = (
            "[[done]]1. Previous-day point[[/done]]\n"
            "[[done]]2. Earlier today point[[/done]]\n"
            "[[done]]3. Current interval point[[/done]]\n"
            "4. Still open"
        )
        events = [
            SimpleNamespace(id="old", point_key=point_key("1. Previous-day point"), action="STRUCK", occurred_at=datetime(2026, 8, 9, 16, 0, tzinfo=timezone.utc)),
            SimpleNamespace(id="earlier", point_key=point_key("2. Earlier today point"), action="STRUCK", occurred_at=datetime(2026, 8, 10, 8, 30, tzinfo=timezone.utc)),
            SimpleNamespace(id="current", point_key=point_key("3. Current interval point"), action="STRUCK", occurred_at=datetime(2026, 8, 10, 10, 20, tzinfo=timezone.utc)),
        ]
        plain, marked = render_description_for_interval(
            description, events, interval_start=interval_start, interval_end=interval_end
        )
        self.assertIn("1. Previous-day point", plain)
        self.assertIn("4. Still open", plain)
        self.assertIn("[[done:grey]]1. Previous-day point[[/done]]", marked)
        self.assertIn("[[done:green]]2. Earlier today point[[/done]]", marked)
        self.assertIn("[[done:blue]]3. Current interval point[[/done]]", marked)

        document = build_report_document(
            {"guardrails": {"truncated": {}}, "items": {"oneH": [{
                "id": "colours", "date": "2026-08-10", "slot": "11:00", "person": "Anisa",
                "status": "TODO", "title": "Colour task", "description": description,
            }]}},
            date(2026, 8, 10),
            "11:00",
            description_overrides={"colours": (plain, marked)},
        )
        html = render_html(document)
        self.assertIn("color:#6b7280;text-decoration:line-through", html)
        self.assertIn("color:#16a34a;text-decoration:line-through", html)
        self.assertIn("color:#2563eb;text-decoration:line-through", html)

    def test_strike_report_windows_end_before_the_final_email_delivery(self) -> None:
        report_day = date(2026, 8, 10)
        self.assertEqual(strike_interval_start(report_day, "10:00").strftime("%H:%M"), "08:00")
        self.assertEqual(strike_interval_end(report_day, "10:00").strftime("%H:%M"), "09:00")
        self.assertEqual(strike_interval_start(report_day, "11:00").strftime("%H:%M"), "09:00")
        self.assertEqual(strike_interval_end(report_day, "11:00").strftime("%H:%M"), "10:50")
        self.assertEqual(strike_interval_start(report_day, "14:10").strftime("%H:%M"), "11:40")
        self.assertEqual(strike_interval_end(report_day, "14:10").strftime("%H:%M"), "14:10")
        self.assertEqual(strike_interval_start(report_day, "14:20").strftime("%H:%M"), "14:10")
        self.assertEqual(strike_interval_end(report_day, "14:20").strftime("%H:%M"), "14:20")
        self.assertEqual(strike_interval_start(report_day, "15:50").strftime("%H:%M"), "14:20")
        self.assertEqual(strike_interval_end(report_day, "15:50").strftime("%H:%M"), "15:50")

    def test_timestamp_does_not_change_a_struck_point_identity_or_colour(self) -> None:
        text = "[[done]]1. Test1[[/done]] 08:46 13.08\n2. Test2"
        event = SimpleNamespace(
            id="timestamped", point_key="legacy-key-with-timestamp",
            point_text="1. Test1 08:46 13.08", action="STRUCK",
            occurred_at=datetime(2026, 8, 10, 8, 46, tzinfo=timezone.utc),
        )
        plain, marked = render_description_for_interval(
            text,
            [event],
            interval_start=datetime(2026, 8, 10, 9, 0, tzinfo=timezone.utc),
            interval_end=datetime(2026, 8, 10, 10, 50, tzinfo=timezone.utc),
        )
        self.assertEqual(split_strike_timestamp("1. Test1 08:46 13.08"), ("1. Test1", "08:46 13.08"))
        self.assertIn("1. Test1 08:46 13.08", plain)
        self.assertIn("[[done:green]]1. Test1[[/done]] 08:46 13.08", marked)

        document = build_report_document(
            {"guardrails": {"truncated": {}}, "items": {"oneH": [{
                "id": "timestamped", "date": "2026-08-10", "slot": "11:00", "person": "Anisa",
                "status": "TODO", "title": "Task", "description": text,
            }]}},
            date(2026, 8, 10), "11:00", description_overrides={"timestamped": (plain, marked)},
        )
        html = render_html(document)
        self.assertIn("color:#16a34a;text-decoration:line-through;text-decoration-thickness:2px;\">1. Test1</span>", html)
        self.assertNotIn("08:46 13.08", html)

    def test_timestamp_colours_a_strike_that_predates_its_linked_task_event(self) -> None:
        text = "[[done]]1. Test1[[/done]] 08:46 13.08\n[[done]]2. Test2[[/done]] 08:50 13.08"
        interval_start = datetime(2026, 8, 13, 9, 0, tzinfo=timezone.utc)
        interval_end = datetime(2026, 8, 13, 10, 50, tzinfo=timezone.utc)
        plain, marked = render_description_for_interval(
            text, [], interval_start=interval_start, interval_end=interval_end
        )
        self.assertEqual(
            strike_timestamp_datetime("1. Test1 08:46 13.08", report_at=interval_end),
            datetime(2026, 8, 13, 8, 46, tzinfo=timezone.utc),
        )
        self.assertIn("1. Test1 08:46 13.08", plain)
        self.assertIn("[[done:green]]1. Test1[[/done]] 08:46 13.08", marked)
        self.assertIn("[[done:green]]2. Test2[[/done]] 08:50 13.08", marked)

    def test_old_strike_event_does_not_restrike_a_currently_open_point(self) -> None:
        event = SimpleNamespace(
            id="old-strike", point_key=point_key("1. Reopened"), point_text="1. Reopened",
            action="STRUCK", occurred_at=datetime(2026, 8, 12, 10, 0, tzinfo=timezone.utc),
        )
        plain, marked = render_description_for_interval(
            "1. Reopened\n2. Still done",
            [event],
            interval_start=datetime(2026, 8, 13, 9, 0, tzinfo=timezone.utc),
            interval_end=datetime(2026, 8, 13, 10, 50, tzinfo=timezone.utc),
        )
        self.assertEqual(plain, "1. Reopened\n2. Still done")
        self.assertNotIn("[[done", marked)

    def test_closing_done_marker_does_not_strike_the_next_numbered_point(self) -> None:
        text = "[[done]]1. Done point[[/done]]\n2. Open point"
        current = struck_points(text, field_name="TITLE")
        self.assertEqual([point.text for point in current.values()], ["1. Done point"])
        plain, marked = render_text_for_interval(
            text,
            [],
            interval_start=datetime(2026, 8, 13, 9, 0, tzinfo=timezone.utc),
            interval_end=datetime(2026, 8, 13, 10, 50, tzinfo=timezone.utc),
            field_name="TITLE",
        )
        self.assertIn("[[done:grey]]1. Done point[[/done]]", marked)
        self.assertIn("\n2. Open point", marked)
        self.assertNotIn("[[done:grey]]2. Open point", marked)

    def test_1h_report_hides_strike_timestamps_but_keeps_the_coloured_strike(self) -> None:
        marked = "[[done:green]]1. Test1[[/done]] 08:46 13.08\n2. Test2"
        document = build_report_document(
            {"guardrails": {"truncated": {}}, "items": {"oneH": [{
                "id": "hide-time", "date": "2026-08-13", "slot": "11:00", "person": "Anisa",
                "status": "TODO", "title": "Task", "description": marked,
            }]}},
            date(2026, 8, 13), "11:00",
            description_overrides={"hide-time": ("1. Test1 08:46 13.08\n2. Test2", marked)},
        )
        plain = render_plain_text(document)
        html = render_html(document)
        self.assertIn("1. Test1", plain)
        self.assertNotIn("08:46 13.08", plain)
        self.assertIn("color:#16a34a;text-decoration:line-through", html)
        self.assertNotIn("08:46 13.08", html)

    def test_partial_bullet_selection_is_reported_as_the_bullet_subtask(self) -> None:
        title = "EF: TEST TASK\n• [[done]]Test[[/done]]\n• Still open"
        full_point = "• Test"
        self.assertIn(point_key(full_point, field_name="TITLE"), struck_points(title, field_name="TITLE"))
        event = SimpleNamespace(
            id="bullet-strike", field_name="TITLE", action="STRUCK",
            # The original selection contains only the word, without the bullet.
            point_key=point_key("Test", field_name="TITLE"), point_text="Test",
            occurred_at=datetime(2026, 8, 10, 15, 20, tzinfo=timezone.utc),
        )
        plain, marked = render_text_for_interval(
            title,
            [event],
            interval_start=datetime(2026, 8, 10, 14, 20, tzinfo=timezone.utc),
            interval_end=datetime(2026, 8, 10, 16, 0, tzinfo=timezone.utc),
            field_name="TITLE",
        )
        self.assertIn(full_point, plain)
        self.assertIn(f"[[done:blue]]{full_point}[[/done]]", marked)
        self.assertIn("• Still open", plain)
    def test_duplicate_bullets_keep_individual_strike_identity(self) -> None:
        class FakeSession:
            def __init__(self):
                self.rows = []

            def add(self, row):
                self.rows.append(row)

        before = "EF: TEST TASK\n- Repeat\n- Repeat"
        after = "EF: TEST TASK\n- [[done]]Repeat[[/done]]\n- Repeat"
        session = FakeSession()
        record_title_strike_events(
            session,
            task_id=uuid.uuid4(),
            actor_user_id=uuid.uuid4(),
            before_title=before,
            after_title=after,
        )
        self.assertEqual(len(session.rows), 1)

        event = session.rows[0]
        event.id = "duplicate-strike"
        event.occurred_at = datetime(2026, 8, 10, 15, 20, tzinfo=timezone.utc)
        plain, marked = render_text_for_interval(
            after,
            [event],
            interval_start=datetime(2026, 8, 10, 14, 20, tzinfo=timezone.utc),
            interval_end=datetime(2026, 8, 10, 16, 0, tzinfo=timezone.utc),
            field_name="TITLE",
        )
        self.assertEqual(plain.count("- Repeat"), 2)
        self.assertEqual(marked.count("[[done:blue]]- Repeat[[/done]]"), 1)

    def test_plain_multiline_title_strike_is_matched_line_by_line(self) -> None:
        class FakeSession:
            def __init__(self):
                self.rows = []

            def add(self, row):
                self.rows.append(row)

        before = "Task heading\nFirst plain line\nSecond plain line"
        after = "Task heading\n[[done]]First plain line[[/done]]\nSecond plain line"
        session = FakeSession()
        record_title_strike_events(
            session,
            task_id=uuid.uuid4(),
            actor_user_id=uuid.uuid4(),
            before_title=before,
            after_title=after,
        )
        self.assertEqual(len(session.rows), 1)

        event = session.rows[0]
        event.id = "plain-line-strike"
        event.occurred_at = datetime(2026, 8, 10, 15, 20, tzinfo=timezone.utc)
        plain, marked = render_text_for_interval(
            after,
            [event],
            interval_start=datetime(2026, 8, 10, 14, 20, tzinfo=timezone.utc),
            interval_end=datetime(2026, 8, 10, 16, 0, tzinfo=timezone.utc),
            field_name="TITLE",
        )
        self.assertIn("First plain line", plain)
        self.assertIn("Second plain line", plain)
        self.assertIn("[[done:blue]]First plain line[[/done]]", marked)
        self.assertNotIn("[[done:blue]]Second plain line[[/done]]", marked)


if __name__ == "__main__":
    unittest.main()
