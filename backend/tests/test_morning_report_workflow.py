from __future__ import annotations

import unittest
import uuid
from datetime import date, datetime, time
from types import SimpleNamespace
from unittest.mock import AsyncMock, Mock, patch
from zoneinfo import ZoneInfo

from app.api.deps import require_admin
from app.api.routers.morning_report import DraftUpdate, SectionPayload, router, update_draft
from app.models.common_entry import CommonEntry
from app.models.enums import CommonApprovalStatus, CommonCategory, UserRole
from app.models.morning_report_draft import MorningReportDraft
from app.models.task import Task
from app.services import morning_report_scheduler
from app.services.after_break_report import _personal_section
from app.services.meetings_report import PERSONAL_GA_KA
from app.services.morning_report import (
    SECTION_TITLES,
    _attendance_section,
    normalize_morning_report_sections,
    render_html,
    subject_for,
)


class FakeDraftDb:
    def __init__(self, draft: MorningReportDraft) -> None:
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


def make_draft() -> MorningReportDraft:
    return MorningReportDraft(
        id=uuid.uuid4(),
        report_date=date(2026, 8, 5),
        subject="Saved M1 subject",
        recipients={"to": ["old@example.com"], "cc": [], "bcc": []},
        sections=[{"title": SECTION_TITLES[0], "body": "Saved manual plan change"}],
        generated_snapshot={},
        status="DRAFT",
    )


class MorningReportWorkflowTests(unittest.IsolatedAsyncioTestCase):
    def test_normalization_keeps_all_five_m1_questions_and_saved_edits(self) -> None:
        sections = normalize_morning_report_sections(
            [{"title": SECTION_TITLES[2], "body": "GA replied at 07:55"}]
        )

        self.assertEqual([section["title"] for section in sections], SECTION_TITLES)
        self.assertEqual(sections[2]["body"], "GA replied at 07:55")
        self.assertIn("NDRYSHON PLANI", sections[0]["body"])

    def test_attendance_section_formats_delays_absences_and_manual_plan_decision(self) -> None:
        user_id = uuid.uuid4()
        entries = [
            CommonEntry(
                id=uuid.uuid4(),
                category=CommonCategory.delays,
                title="Delay",
                description="Date: 2026-08-05 Start: 08:00 Until: 08:25 Traffic",
                entry_date=date(2026, 8, 5),
                created_by_user_id=user_id,
                assigned_to_user_id=user_id,
                approval_status=CommonApprovalStatus.approved,
            ),
            CommonEntry(
                id=uuid.uuid4(),
                category=CommonCategory.absences,
                title="Absent",
                description="Date: 2026-08-05 From: 08:00 - To: 12:00 Doctor",
                entry_date=date(2026, 8, 5),
                created_by_user_id=user_id,
                assigned_to_user_id=user_id,
                approval_status=CommonApprovalStatus.approved,
            ),
        ]

        body = _attendance_section(entries, {user_id: "Drita Vela"}, date(2026, 8, 5))

        self.assertIn("08:00-08:25", body)
        self.assertIn("08:00-12:00", body)
        self.assertIn("NDRYSHON PLANI: (Ploteso manualisht)", body)

    def test_email_html_is_mobile_safe_and_contains_m1_heading(self) -> None:
        subject = subject_for(date(2026, 8, 5))
        html = render_html(subject, date(2026, 8, 5), [{"title": SECTION_TITLES[0], "body": "VONESA: 0"}])

        self.assertIn("Hapja e dites M1", html)
        self.assertIn("max-width:600px", html)
        self.assertIn("@media only screen and (max-width:600px)", html)

    def test_settings_routes_require_admin(self) -> None:
        settings_routes = [route for route in router.routes if route.path == "/settings"]
        self.assertEqual(len(settings_routes), 2)
        for route in settings_routes:
            dependencies = [dependency.call for dependency in route.dependant.dependencies]
            self.assertIn(require_admin, dependencies)

    async def test_saved_m1_content_can_be_edited(self) -> None:
        draft = make_draft()
        staff = SimpleNamespace(id=uuid.uuid4(), role=UserRole.STAFF, full_name="Staff User")

        result = await update_draft(
            draft.id,
            DraftUpdate(
                sections=[SectionPayload(title=SECTION_TITLES[0], body="Plan changes after 10:00")]
            ),
            FakeDraftDb(draft),
            staff,
        )

        self.assertEqual(result["sections"][0]["body"], "Plan changes after 10:00")

    async def test_m1_personal_section_includes_ka_tasks(self) -> None:
        assignee_id = uuid.uuid4()
        task = Task(
            id=uuid.uuid4(),
            title="AT/KA: DET PERSONALISHT",
            status="TODO",
            phase="MEETINGS",
            is_personal=True,
            is_active=True,
            assigned_to=assignee_id,
            start_date=datetime(2026, 8, 5, 8, 0, tzinfo=ZoneInfo("Europe/Tirane")),
            due_date=datetime(2026, 8, 5, 10, 0, tzinfo=ZoneInfo("Europe/Tirane")),
        )

        lines = await _personal_section(
            SimpleNamespace(),
            [task],
            {assignee_id: "Arta Test"},
            {task.id: {assignee_id}},
            date(2026, 8, 5),
            title_pattern=PERSONAL_GA_KA,
        )

        self.assertIn("AT/KA: DET PERSONALISHT", "\n".join(lines))

    async def test_scheduler_sends_saved_manual_fields_without_regenerating(self) -> None:
        timezone = ZoneInfo("Europe/Tirane")
        draft = make_draft()
        settings = SimpleNamespace(
            is_active=True,
            timezone="Europe/Tirane",
            weekdays=[2],
            send_time=time(8, 0),
            recipients={"to": ["report@example.com"], "cc": [], "bcc": []},
            updated_at=datetime(2026, 8, 5, 7, 0, tzinfo=timezone),
            last_run_date=None,
        )
        db = SchedulerDb(settings, draft)
        build = AsyncMock()
        send = AsyncMock(return_value={"id": "gmail-id", "threadId": "thread-id"})
        render_plain = Mock(return_value="plain")
        render_html_mock = Mock(return_value="html")

        with (
            patch.object(morning_report_scheduler, "SessionLocal", return_value=db),
            patch.object(morning_report_scheduler, "build_morning_report_sections", build),
            patch.object(morning_report_scheduler, "send_morning_report", send),
            patch.object(morning_report_scheduler, "render_plain_text", render_plain),
            patch.object(morning_report_scheduler, "render_html", render_html_mock),
        ):
            sent = await morning_report_scheduler.run_morning_report_scheduler_once(
                datetime(2026, 8, 5, 8, 5, tzinfo=timezone)
            )

        self.assertTrue(sent)
        build.assert_not_awaited()
        self.assertEqual(render_plain.call_args.args[2], draft.sections)
        self.assertEqual(draft.recipients["to"], ["report@example.com"])
        self.assertEqual(draft.gmail_message_id, "gmail-id")


if __name__ == "__main__":
    unittest.main()
