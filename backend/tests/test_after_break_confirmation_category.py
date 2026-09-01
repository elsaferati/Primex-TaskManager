import unittest
from datetime import date, datetime
from types import SimpleNamespace
from zoneinfo import ZoneInfo

from app.services.after_break_report import (
    DISPLAY_SECTION_TITLES,
    SECTION_TITLES,
    _blue_note_rows,
    _format_confirmation_questions,
    _done_am_task_rows,
    _new_system_task_rows,
    _unheld_meeting_section,
    _unfinished_priority_task_rows,
    _waiting_client_task_rows,
    normalize_after_break_report_sections,
)
from app.services.meetings_report import _render_ascii_table_html, _table_tone_from_label
from app.services.meeting_point_manual_sync import section_group_label, with_section_keys


class AfterBreakConfirmationCategoryTests(unittest.TestCase):
    def test_edited_auto_title_keeps_its_original_m2_identity_and_position(self) -> None:
        saved = [{"title": title, "body": str(index)} for index, title in enumerate(SECTION_TITLES)]
        saved[4]["title"] = "DET TE PAKRYERA AM, 08:00/DEADLINE"

        sections = normalize_after_break_report_sections(with_section_keys("after_break", saved))
        affected = next(section for section in sections if section["section_key"] == SECTION_TITLES[4])

        self.assertEqual(affected["title"], "DET TE PAKRYERA AM, 08:00/DEADLINE")
        self.assertEqual(sections.index(affected), DISPLAY_SECTION_TITLES.index(SECTION_TITLES[4]))
        self.assertEqual(
            section_group_label("after_break", affected["title"], affected["section_key"]),
            "AUTO-FILLED FROM PRIMEFLOW",
        )

    def test_undiscussed_notes_are_first_in_the_auto_filled_group(self) -> None:
        sections = normalize_after_break_report_sections([])

        self.assertEqual(
            [section["title"] for section in sections],
            DISPLAY_SECTION_TITLES,
        )
        self.assertEqual(sections[4]["title"], "NOTES TE REJA ( NOT DISSCUSED)")
        self.assertEqual(sections[5]["title"], "TAK INT/EXT TE PAMBAJTURA")
        self.assertEqual(sections[6]["title"], "DET TE PAKRYERA, 08:00/DEADLINE")
        self.assertEqual(sections[7]["title"], "DT WFE")
        self.assertEqual(sections[8]["title"], "DET E KRYERA NE AM")
        self.assertEqual(sections[11]["title"], "GA MBYLLJA E DET")
        self.assertEqual(sections[12]["title"], "HV MBYLLJA E DET")

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


class UnfinishedPriorityTaskRowsTests(unittest.TestCase):
    def _task(self, title: str, due_hour: int, **overrides):
        values = {
            "id": title,
            "title": title,
            "due_date": datetime(2026, 8, 24, due_hour, 0, tzinfo=ZoneInfo("Europe/Tirane")),
            "created_at": datetime(2026, 8, 24, 7, 0, tzinfo=ZoneInfo("Europe/Tirane")),
            "completed_at": None,
            "status": "TODO",
            "is_deadline_important": False,
            "finish_period": "AM",
            "assigned_to": None,
            "fast_task_order": None,
            "department_id": None,
        }
        values.update(overrides)
        return SimpleNamespace(**values)

    def test_includes_only_tasks_unfinished_at_m2_and_deduplicates_both_types(self) -> None:
        timezone = ZoneInfo("Europe/Tirane")
        cutoff = datetime(2026, 8, 24, 13, 20, tzinfo=timezone)
        tasks = [
            self._task("Open deadline", 15, is_deadline_important=True),
            self._task("Open AM/PM deadline", 15, is_deadline_important=True, finish_period="AM/PM"),
            self._task("Open 08:00 title", 2),
            self._task("Both 08:00", 2, is_deadline_important=True),
            self._task("PM deadline", 15, is_deadline_important=True, finish_period="PM"),
            self._task("PM 08:00", 2, finish_period="PM"),
            self._task("No-period deadline", 15, is_deadline_important=True, finish_period=None),
            self._task("Done before 08:00", 2, completed_at=datetime(2026, 8, 24, 13, 19, tzinfo=timezone), status="DONE"),
            self._task("Done after 08:00", 2, completed_at=datetime(2026, 8, 24, 13, 21, tzinfo=timezone), status="DONE"),
            self._task("Due at eight without marker", 8),
            self._task("Not priority", 15),
            self._task("Wrong day 08:00", 2, due_date=datetime(2026, 8, 25, 2, 0, tzinfo=timezone)),
            self._task("Created after 08:00", 2, created_at=datetime(2026, 8, 24, 13, 21, tzinfo=timezone)),
        ]

        rows = _unfinished_priority_task_rows(tasks, {}, {}, date(2026, 8, 24), cutoff, timezone)
        rows_by_title = {row[4]: row for row in rows}

        self.assertEqual(
            set(rows_by_title),
            {
                "Open deadline", "Open AM/PM deadline", "Open 08:00 title",
                "Both 08:00", "Done after 08:00",
            },
        )
        self.assertEqual(rows_by_title["Open deadline"][3], "DEADLINE")
        self.assertEqual(rows_by_title["Open 08:00 title"][3], "08:00")
        self.assertEqual(rows_by_title["Both 08:00"][3], "DEADLINE / 08:00")
        self.assertEqual(rows_by_title["Done after 08:00"][5], "24.08.2026 02:00")
        self.assertEqual(
            [row[3] for row in rows],
            ["08:00", "08:00", "DEADLINE / 08:00", "DEADLINE", "DEADLINE"],
        )

    def test_08_rows_use_a_border_while_deadlines_keep_the_red_fill(self) -> None:
        html = _render_ascii_table_html(
            [
                "| NR | LLOJI | TITULLI |",
                "| 1 | DEADLINE | Deadline task |",
                "| 2 | DEADLINE / 08:00 | Both task |",
                "| 3 | 08:00 | Eight task |",
            ]
        )

        self.assertEqual(html.count('class="eight-am"'), 2)
        self.assertEqual(html.count('class="deadline"'), 1)
        self.assertLess(html.index("Eight task"), html.index("Both task"))
        self.assertLess(html.index("Both task"), html.index("Deadline task"))


class DoneAmTaskRowsTests(unittest.TestCase):
    def _task(self, title: str, completed_at: datetime, **overrides):
        values = {
            "id": title,
            "title": title,
            "completed_at": completed_at,
            "status": "DONE",
            "assigned_to": "user-1",
            "fast_task_order": None,
            "is_deadline_important": False,
            "created_at": datetime(2026, 8, 24, 7, 0, tzinfo=ZoneInfo("Europe/Tirane")),
            "department_id": "development",
            "finish_period": "AM",
            "system_template_origin_id": None,
            "system_task_slot_id": None,
            "project_id": None,
            "is_bllok": False,
            "is_r1": False,
            "is_1h_report": False,
            "is_personal": False,
        }
        values.update(overrides)
        return SimpleNamespace(**values)

    def test_includes_only_current_done_tasks_completed_before_noon_on_report_day(self) -> None:
        timezone = ZoneInfo("Europe/Tirane")
        tasks = [
            self._task("First done", datetime(2026, 8, 24, 8, 30, tzinfo=timezone)),
            self._task("Last done", datetime(2026, 8, 24, 11, 58, tzinfo=timezone), finish_period="PM"),
            self._task("System done", datetime(2026, 8, 24, 11, 59, tzinfo=timezone), system_template_origin_id="template-1"),
            self._task("Legacy system done", datetime(2026, 8, 24, 11, 57, tzinfo=timezone), system_task_slot_id="slot-1"),
            self._task("At noon", datetime(2026, 8, 24, 12, 0, tzinfo=timezone)),
            self._task("Afternoon", datetime(2026, 8, 24, 15, 0, tzinfo=timezone)),
            self._task("Wrong day", datetime(2026, 8, 23, 10, 0, tzinfo=timezone)),
            self._task("Reopened", datetime(2026, 8, 24, 9, 0, tzinfo=timezone), status="TODO"),
        ]

        rows = _done_am_task_rows(
            tasks,
            {"user-1": "Example User"},
            {},
            date(2026, 8, 24),
            timezone,
            {"development": "DEV"},
        )

        self.assertEqual([row[5] for row in rows], ["First done", "Last done"])
        self.assertEqual(rows[0], ["1", "EU", "DEV", "AM", "FT", "First done"])
        self.assertEqual(rows[1][3:5], ["PM", "FT"])

    def test_completed_am_table_uses_done_green_tone(self) -> None:
        self.assertEqual(_table_tone_from_label("DET E KRYERA NE AM:"), "done")

    def test_completed_am_table_prioritizes_shared_user_order_over_completion_time(self) -> None:
        timezone = ZoneInfo("Europe/Tirane")
        later_but_first_user = self._task(
            "First user",
            datetime(2026, 8, 24, 11, 30, tzinfo=timezone),
            _weekly_planner_report_sort=(0, "dev", 0, 0, "AT"),
        )
        earlier_but_second_user = self._task(
            "Second user",
            datetime(2026, 8, 24, 8, 15, tzinfo=timezone),
            _weekly_planner_report_sort=(0, "dev", 0, 1, "EF"),
        )

        rows = _done_am_task_rows(
            [earlier_but_second_user, later_but_first_user],
            {"user-1": "Example User"},
            {},
            date(2026, 8, 24),
            timezone,
            {"development": "DEV"},
        )

        self.assertEqual([row[5] for row in rows], ["First user", "Second user"])


class WaitingClientTaskRowsTests(unittest.TestCase):
    @staticmethod
    def _task(title: str, status: str, **overrides):
        values = {
            "id": title,
            "title": title,
            "status": status,
            "assigned_to": "user-1",
            "fast_task_order": None,
            "is_deadline_important": False,
            "created_at": datetime(2026, 8, 24, 7, 0),
            "department_id": "development",
            "finish_period": "AM",
            "system_template_origin_id": None,
            "project_id": None,
            "is_bllok": False,
            "is_r1": False,
            "is_1h_report": False,
            "is_personal": False,
        }
        values.update(overrides)
        return SimpleNamespace(**values)

    def test_dt_wfe_includes_only_waiting_client_tasks(self) -> None:
        rows = _waiting_client_task_rows(
            [
                self._task("Waiting task", "WAITING_CLIENT"),
                self._task("In progress task", "IN_PROGRESS"),
                self._task("Waiting task two", " waiting_client ", finish_period="PM"),
            ],
            {"user-1": "Example User"},
            {},
            {"development": "DEV"},
        )

        self.assertEqual([row[5] for row in rows], ["Waiting task", "Waiting task two"])
        self.assertEqual(rows[0], ["1", "EU", "DEV", "AM", "FT", "Waiting task"])
        self.assertEqual(rows[1][3], "PM")

    def test_dt_wfe_uses_waiting_client_gold_tone(self) -> None:
        self.assertEqual(_table_tone_from_label("DT WFE:"), "waiting-client")


class UnheldMeetingRowsTests(unittest.TestCase):
    def test_includes_unmarked_and_canceled_internal_external_meetings(self) -> None:
        timezone = ZoneInfo("Europe/Tirane")
        meetings = [
            SimpleNamespace(id="held", title="Held", starts_at=datetime(2026, 8, 24, 9, 0, tzinfo=timezone), meeting_type="internal"),
            SimpleNamespace(id="unmarked", title="Unmarked", starts_at=datetime(2026, 8, 24, 10, 0, tzinfo=timezone), meeting_type="external"),
            SimpleNamespace(id="canceled", title="Canceled", starts_at=datetime(2026, 8, 24, 11, 0, tzinfo=timezone), meeting_type="internal"),
            SimpleNamespace(id="afternoon", title="Afternoon", starts_at=datetime(2026, 8, 24, 13, 15, tzinfo=timezone), meeting_type="internal"),
        ]

        lines, count = _unheld_meeting_section(
            meetings,
            {"held": "held", "canceled": "canceled"},
        )

        body = "\n".join(lines)
        self.assertEqual(count, 2)
        self.assertIn("TAK EXTERNE", body)
        self.assertIn("TAK INTERNE", body)
        self.assertIn("MBAJTUR?", body)
        self.assertIn("Unmarked", body)
        self.assertIn("Canceled", body)
        self.assertNotIn("Held", body)
        self.assertNotIn("Afternoon", body)


if __name__ == "__main__":
    unittest.main()
