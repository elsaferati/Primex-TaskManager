from __future__ import annotations

import unittest
import uuid
from datetime import date, datetime, time
from types import SimpleNamespace
from unittest.mock import AsyncMock, Mock, patch
from zoneinfo import ZoneInfo

from fastapi import HTTPException

from app.api.deps import require_admin
from app.api.routers.meetings_report import DraftUpdate, RecipientsPayload, SectionPayload, router, update_draft
from app.models.enums import UserRole
from app.models.meetings_report_draft import MeetingsReportDraft
from app.services import meetings_report_scheduler
from app.services.meeting_point_manual_sync import is_known_report_title, is_manual_section_title
from app.services.meetings_report import (
    SECTION_TITLES,
    normalize_meetings_report_sections,
)


class FakeDraftDb:
    def __init__(self, draft: MeetingsReportDraft) -> None:
        self.draft = draft

    async def get(self, _model, _draft_id):
        return self.draft

    async def commit(self) -> None:
        return None

    async def refresh(self, _row) -> None:
        return None


class ScalarResult:
    def __init__(self, value) -> None:
        self.value = value

    def scalars(self):
        return self

    def first(self):
        return self.value

    def scalar_one_or_none(self):
        return self.value


class SchedulerDb:
    def __init__(self, settings, draft) -> None:
        self.results = iter((ScalarResult(settings), ScalarResult(draft)))

    async def __aenter__(self):
        return self

    async def __aexit__(self, _exc_type, _exc, _traceback) -> None:
        return None

    async def execute(self, _query):
        return next(self.results)

    async def commit(self) -> None:
        return None


def make_draft() -> MeetingsReportDraft:
    return MeetingsReportDraft(
        id=uuid.uuid4(),
        report_date=date(2026, 8, 5),
        tomorrow_date=date(2026, 8, 6),
        subject="Saved subject",
        recipients={"to": ["old@example.com"], "cc": [], "bcc": []},
        sections=[{"title": "Section", "body": "Saved user edit"}],
        generated_snapshot={},
        status="DRAFT",
    )


class MeetingsReportWorkflowTests(unittest.IsolatedAsyncioTestCase):
    def test_settings_routes_require_admin(self) -> None:
        settings_routes = [route for route in router.routes if route.path == "/settings"]
        self.assertEqual(len(settings_routes), 2)
        for route in settings_routes:
            dependencies = [dependency.call for dependency in route.dependant.dependencies]
            self.assertIn(require_admin, dependencies)

    async def test_staff_can_edit_report_content_but_not_recipients(self) -> None:
        draft = make_draft()
        db = FakeDraftDb(draft)
        staff = SimpleNamespace(id=uuid.uuid4(), role=UserRole.STAFF, full_name="Staff User")

        result = await update_draft(
            draft.id,
            DraftUpdate(
                subject="Edited subject",
                sections=[
                    SectionPayload(
                        title="Section",
                        body="+---+---+---+\n| NR | WHO | TITLE |\n+---+---+---+\n| 1 | AB | Added task |\n+---+---+---+",
                    )
                ],
            ),
            db,
            staff,
        )

        self.assertEqual(result["subject"], "Edited subject")
        self.assertEqual(result["sections"][0]["title"], "Section")
        self.assertIn("Added task", result["sections"][0]["body"])

        with self.assertRaises(HTTPException) as raised:
            await update_draft(
                draft.id,
                DraftUpdate(recipients=RecipientsPayload(to=["changed@example.com"])),
                db,
                staff,
            )
        self.assertEqual(raised.exception.status_code, 403)

    async def test_scheduler_regenerates_sections_before_sending(self) -> None:
        timezone = ZoneInfo("Europe/Tirane")
        draft = make_draft()
        settings = SimpleNamespace(
            is_active=True,
            timezone="Europe/Tirane",
            weekdays=[2],
            send_time=time(16, 30),
            recipients={"to": ["report@example.com"], "cc": [], "bcc": []},
            updated_at=datetime(2026, 8, 5, 12, 0, tzinfo=timezone),
            last_run_date=None,
        )
        db = SchedulerDb(settings, draft)
        regenerated = [{"title": "Section", "body": "Fresh auto content"}]
        build = AsyncMock(return_value=(date(2026, 8, 6), regenerated, {"counts": {}}))
        send = AsyncMock(return_value={"id": "gmail-id", "threadId": "thread-id"})
        render_plain = Mock(return_value="plain")
        render_html = Mock(return_value="html")

        with (
            patch.object(meetings_report_scheduler, "SessionLocal", return_value=db),
            patch.object(meetings_report_scheduler, "build_meetings_report_sections", build),
            patch.object(meetings_report_scheduler, "send_meetings_report", send),
            patch.object(meetings_report_scheduler, "render_plain_text", render_plain),
            patch.object(meetings_report_scheduler, "render_html", render_html),
        ):
            sent = await meetings_report_scheduler.run_meetings_report_scheduler_once(
                datetime(2026, 8, 5, 17, 0, tzinfo=timezone)
            )

        self.assertTrue(sent)
        build.assert_awaited_once()
        self.assertEqual(draft.sections, regenerated)
        self.assertEqual(render_plain.call_args.args[3], regenerated)
        self.assertEqual(draft.recipients["to"], ["report@example.com"])
        self.assertEqual(draft.gmail_message_id, "gmail-id")


class MeetingsReportAliasDedupTests(unittest.TestCase):
    def test_normalize_collapses_common_view_aliases_into_auto_sections(self) -> None:
        auto_hv = "GA TASKS:\n- done item"
        auto_tickets = "STD TICKETS: 2"
        normalized = normalize_meetings_report_sections(
            [
                {"title": "A JEMI BRENDA MESATARES ME PROJEKTE/", "body": "(Ploteso manualisht)"},
                {"title": "(GA) M3 DET GA MBYLLJA ME HV/OH?", "body": "(Ploteso manualisht)"},
                {"title": "(GA) TIKETAT E STD DHE TONAT? RAPORTOHEN NE M3", "body": "(Ploteso manualisht)"},
                {"title": SECTION_TITLES[1], "body": auto_hv},
                {"title": SECTION_TITLES[2], "body": auto_tickets},
                {"title": "Brand new Common View pike", "body": "(Ploteso manualisht)"},
            ]
        )
        titles = [section["title"] for section in normalized]
        self.assertEqual(titles[0], SECTION_TITLES[2])
        self.assertEqual(titles.count(SECTION_TITLES[1]), 1)
        self.assertEqual(titles.count(SECTION_TITLES[2]), 1)
        self.assertNotIn("(GA) M3 DET GA MBYLLJA ME HV/OH?", titles)
        self.assertNotIn("(GA) TIKETAT E STD DHE TONAT? RAPORTOHEN NE M3", titles)
        self.assertIn("Brand new Common View pike", titles)
        by_title = {section["title"]: section["body"] for section in normalized}
        self.assertEqual(by_title[SECTION_TITLES[1]], auto_hv)
        self.assertEqual(by_title[SECTION_TITLES[2]], auto_tickets)

    def test_ticket_wording_variant_alone_maps_to_auto_title(self) -> None:
        normalized = normalize_meetings_report_sections(
            [
                {"title": "A JEMI BRENDA MESATARES ME PROJEKTE/", "body": "(Ploteso manualisht)"},
                {"title": "(GA) TIKETAT E STD DHE TONAT? RAPORTOHEN NE M3", "body": "(Ploteso manualisht)"},
            ]
        )
        titles = [section["title"] for section in normalized]
        self.assertNotIn("(GA) TIKETAT E STD DHE TONAT? RAPORTOHEN NE M3", titles)
        self.assertIn(SECTION_TITLES[2], titles)

    def test_common_view_aliases_are_known_auto_not_manual(self) -> None:
        self.assertTrue(is_known_report_title("meetings", "(GA) M3 DET GA MBYLLJA ME HV/OH?"))
        self.assertTrue(is_known_report_title("meetings", "(GA) TIKETAT E STD DHE TONAT? RAPORTOHEN NE M3"))
        self.assertFalse(is_manual_section_title("meetings", "(GA) M3 DET GA MBYLLJA ME HV/OH?"))
        self.assertFalse(is_manual_section_title("meetings", "(GA) TIKETAT E STD DHE TONAT? RAPORTOHEN NE M3"))
        self.assertTrue(is_manual_section_title("meetings", "Brand new Common View pike"))


if __name__ == "__main__":
    unittest.main()
