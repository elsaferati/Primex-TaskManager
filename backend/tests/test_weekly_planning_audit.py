from __future__ import annotations

import io
import unittest
import uuid
from datetime import date, datetime
from types import SimpleNamespace
from zoneinfo import ZoneInfo

from openpyxl import load_workbook

from app.services.weekly_planning_audit import (
    AuditError,
    AuditTaskOccurrence,
    PersonAudit,
    WeeklyPlanningAuditReport,
    _is_technical_account,
    clean_technical_markup,
    load_px_abbreviations,
    monday_of_next_working_week,
    partition_users_by_full_week_leave,
    select_weekly_focus,
    suggested_concise_title,
    validate_task_occurrence,
)
from app.models.weekly_planning_audit import WeeklyPlanningAuditRun
from app.models.common_entry import CommonEntry
from app.models.enums import CommonCategory, CommonApprovalStatus
from app.services.common_leave import parse_common_view_annual_leave
from app.services.weekly_planning_audit_delivery import (
    build_delivery_record,
    record_delivery_failure,
    scheduled_idempotency_key,
    stable_smtp_message_id,
)
from app.services.weekly_planning_audit_excel import (
    SHEET_NAMES,
    build_weekly_planning_audit_workbook,
    report_subject,
)


WEEK_START = date(2026, 8, 3)


def occurrence(**overrides) -> AuditTaskOccurrence:
    values = {
        "user_id": uuid.UUID(int=1),
        "employee": "Elsa Ferati",
        "department": "Development",
        "task_id": uuid.UUID(int=2),
        "task_date": WEEK_START,
        "title": "Implementimi i modulit të auditimit",
        "description": None,
        "internal_notes": None,
        "status": "TODO",
        "priority": "NORMAL",
        "finish_period": "AM",
        "start_date": WEEK_START,
        "due_date": WEEK_START,
    }
    values.update(overrides)
    return AuditTaskOccurrence(**values)


class WeeklyPlanningAuditLogicTests(unittest.TestCase):
    def setUp(self) -> None:
        self.abbreviations, _ = load_px_abbreviations()

    def test_full_week_leave_user_is_excluded(self) -> None:
        user = SimpleNamespace(id=uuid.UUID(int=1))
        leave = {user.id: {WEEK_START.replace(day=WEEK_START.day + offset) for offset in range(5)}}
        included, excluded = partition_users_by_full_week_leave(
            [user], leave_dates_by_user=leave, week_start=WEEK_START
        )
        self.assertEqual(included, [])
        self.assertEqual(excluded, [user])

    def test_partial_week_leave_user_is_included(self) -> None:
        user = SimpleNamespace(id=uuid.UUID(int=1))
        included, excluded = partition_users_by_full_week_leave(
            [user], leave_dates_by_user={user.id: {date(2026, 8, 5)}}, week_start=WEEK_START
        )
        self.assertEqual(included, [user])
        self.assertEqual(excluded, [])

    def test_task_on_partial_leave_day_creates_one_error(self) -> None:
        task = occurrence(task_date=date(2026, 8, 5))
        errors = validate_task_occurrence(
            task,
            week_start=WEEK_START,
            leave_dates={date(2026, 8, 5)},
            official_abbreviations=self.abbreviations,
        )
        leave_errors = [error for error in errors if error.rule_code == "TASK_ON_ANNUAL_LEAVE"]
        self.assertEqual(len(leave_errors), 1)
        self.assertEqual(
            leave_errors[0].problem,
            "Detyra është planifikuar në ditën e Pushimit Vjetor.",
        )

    def test_task_outside_leave_days_is_not_flagged(self) -> None:
        errors = validate_task_occurrence(
            occurrence(task_date=date(2026, 8, 4)),
            week_start=WEEK_START,
            leave_dates={date(2026, 8, 5)},
            official_abbreviations=self.abbreviations,
        )
        self.assertNotIn("TASK_ON_ANNUAL_LEAVE", {error.rule_code for error in errors})

    def test_system_tasks_and_templates_are_never_focus(self) -> None:
        system = occurrence(
            title="Important system occurrence",
            is_system=True,
            system_template_origin_id=uuid.UUID(int=9),
            project_id=None,
        )
        real = occurrence(title="Real client launch", task_id=uuid.UUID(int=3), project_id=None)
        self.assertEqual(select_weekly_focus([system, real]).label, "Real client launch")

    def test_routine_tasks_are_not_focus(self) -> None:
        routine = occurrence(title="PLNF JAV routine", project_id=None)
        real = occurrence(title="Ndërtimi i portalit të klientit", task_id=uuid.UUID(int=3), project_id=None)
        self.assertEqual(select_weekly_focus([routine, real]).label, "Ndërtimi i portalit të klientit")

    def test_real_project_with_report_word_is_allowed_and_dominant_project_wins(self) -> None:
        project_id = uuid.UUID(int=10)
        tasks = [
            occurrence(
                task_id=uuid.UUID(int=20 + offset),
                task_date=WEEK_START.replace(day=WEEK_START.day + offset),
                title="Develop GDPR reporting product",
                project_id=project_id,
                project_name="GDPR Reporting Platform",
                priority="HIGH" if offset == 0 else "NORMAL",
            )
            for offset in range(3)
        ]
        tasks.append(occurrence(task_id=uuid.UUID(int=30), title="Single unrelated task", project_id=None))
        decision = select_weekly_focus(tasks)
        self.assertEqual(decision.label, "GDPR Reporting Platform")
        self.assertEqual(decision.source_project_id, str(project_id))

    def test_user_without_non_system_work_has_exact_focus_text(self) -> None:
        decision = select_weekly_focus([occurrence(is_system=True, project_id=None)])
        self.assertEqual(decision.label, "Nuk është përcaktuar fokus jo-sistem")

    def test_markup_is_removed_without_removing_content(self) -> None:
        self.assertEqual(
            clean_technical_markup("AT: P[[added]]X[[/added]] [[done]]WEB[[/done]]"),
            "AT: PX WEB",
        )

    def test_unofficial_abbreviation_is_not_invented(self) -> None:
        proposed = suggested_concise_title("RREG i faqes së klientit")
        self.assertIn("Rregullim", proposed)
        self.assertNotIn("RREG", proposed)
        self.assertNotIn("RREG", self.abbreviations)

    def test_long_title_proposes_shorter_title_and_preserves_original(self) -> None:
        title = "Projekt klienti " + "udhëzim shumë i gjatë " * 12
        task = occurrence(title=title)
        errors = validate_task_occurrence(
            task, week_start=WEEK_START, leave_dates=set(), official_abbreviations=self.abbreviations
        )
        error = next(item for item in errors if item.rule_code == "TITLE_TOO_LONG")
        self.assertEqual(error.current_title, title)
        self.assertLess(len(error.proposed_title), len(title))

    def test_next_week_uses_local_tirana_time_and_next_monday(self) -> None:
        friday = datetime(2026, 7, 31, 9, 0, tzinfo=ZoneInfo("Europe/Tirane"))
        self.assertEqual(monday_of_next_working_week(friday, "Europe/Tirane"), WEEK_START)

    def test_technical_admin_and_service_accounts_are_excluded(self) -> None:
        admin = SimpleNamespace(username="admin", email="admin@example.com", full_name="Admin")
        service = SimpleNamespace(username="report-bot", email="bot@example.com", full_name="Report Bot")
        employee = SimpleNamespace(username="elsa", email="elsa@example.com", full_name="Elsa Ferati")
        self.assertTrue(_is_technical_account(admin))
        self.assertTrue(_is_technical_account(service))
        self.assertFalse(_is_technical_account(employee))

    def test_scheduled_retry_uses_same_idempotency_key(self) -> None:
        first = scheduled_idempotency_key(week_start=WEEK_START, slot="09:00", recipient_config_version=4)
        retry = scheduled_idempotency_key(week_start=WEEK_START, slot="09:00", recipient_config_version=4)
        later_slot = scheduled_idempotency_key(week_start=WEEK_START, slot="09:30", recipient_config_version=4)
        self.assertEqual(first, retry)
        self.assertNotEqual(first, later_slot)

    def test_retry_reuses_same_initial_smtp_message_id(self) -> None:
        run_id = uuid.UUID(int=100)
        first = stable_smtp_message_id(
            run_id=run_id,
            delivery_id=uuid.UUID(int=101),
            resend=False,
            sender_domain="primexeu.com",
        )
        retry = stable_smtp_message_id(
            run_id=run_id,
            delivery_id=uuid.UUID(int=102),
            resend=False,
            sender_domain="primexeu.com",
        )
        self.assertEqual(first, retry)

    def test_manual_resend_builds_new_delivery_audit_record(self) -> None:
        run = WeeklyPlanningAuditRun(
            id=uuid.UUID(int=110),
            week_start=WEEK_START,
            week_end=date(2026, 8, 7),
            slot="09:00",
            recipients_snapshot={"to": ["ga@primexeu.com"], "cc": [], "bcc": []},
            filename="report.xlsx",
            file_checksum="a" * 64,
        )
        delivery = build_delivery_record(
            run,
            requested_by=uuid.UUID(int=111),
            resend=True,
            attempt=2,
        )
        self.assertEqual(delivery.delivery_type, "RESEND")
        self.assertEqual(delivery.attempt_number, 2)
        self.assertEqual(delivery.requested_by, uuid.UUID(int=111))

    def test_smtp_failure_is_recorded_on_run_and_delivery(self) -> None:
        run = WeeklyPlanningAuditRun(
            id=uuid.UUID(int=120),
            week_start=WEEK_START,
            week_end=date(2026, 8, 7),
            slot="09:00",
            recipients_snapshot={"to": ["ga@primexeu.com"], "cc": [], "bcc": []},
            filename="report.xlsx",
            file_checksum="b" * 64,
        )
        delivery = build_delivery_record(run, requested_by=None, resend=False, attempt=1)
        record_delivery_failure(delivery, run, RuntimeError("SMTP unavailable"))
        self.assertEqual(delivery.status, "FAILED")
        self.assertEqual(run.status, "FAILED")
        self.assertEqual(delivery.error_message, "SMTP unavailable")
        self.assertEqual(run.error_message, "SMTP unavailable")

    def test_common_view_leave_parser_handles_full_week_range(self) -> None:
        entry = CommonEntry(
            category=CommonCategory.annual_leave,
            title="PV",
            description="Date range: 2026-08-03 to 2026-08-07 (Full day)",
            entry_date=WEEK_START,
            created_by_user_id=uuid.UUID(int=1),
            approval_status=CommonApprovalStatus.approved,
            created_at=datetime(2026, 7, 20),
        )
        start, end, full_day, _, _, _, all_users = parse_common_view_annual_leave(entry)
        self.assertEqual((start, end), (WEEK_START, date(2026, 8, 7)))
        self.assertTrue(full_day)
        self.assertFalse(all_users)

    def test_common_view_leave_parser_preserves_partial_day_semantics(self) -> None:
        entry = CommonEntry(
            category=CommonCategory.annual_leave,
            title="PV",
            description="Date: 2026-08-05 (10:00 - 12:00)",
            entry_date=date(2026, 8, 5),
            created_by_user_id=uuid.UUID(int=1),
            approval_status=CommonApprovalStatus.approved,
            created_at=datetime(2026, 7, 20),
        )
        _, _, full_day, start_time, end_time, _, _ = parse_common_view_annual_leave(entry)
        self.assertFalse(full_day)
        self.assertEqual((start_time, end_time), ("10:00", "12:00"))

    def test_required_field_validations_are_reported(self) -> None:
        errors = validate_task_occurrence(
            occurrence(status=None, priority=None, finish_period=None, due_date=None),
            week_start=WEEK_START,
            leave_dates=set(),
            official_abbreviations=self.abbreviations,
        )
        codes = {error.rule_code for error in errors}
        self.assertTrue({"STATUS_MISSING", "PRIORITY_MISSING", "FINISH_PERIOD_MISSING", "DUE_DATE_MISSING"} <= codes)

    def test_badged_task_format_validations_are_applicable_only(self) -> None:
        r1_errors = validate_task_occurrence(
            occurrence(title="R1 task without colon", is_r1=True),
            week_start=WEEK_START,
            leave_dates=set(),
            official_abbreviations=self.abbreviations,
        )
        normal_errors = validate_task_occurrence(
            occurrence(title="Normal task", is_r1=False),
            week_start=WEEK_START,
            leave_dates=set(),
            official_abbreviations=self.abbreviations,
        )
        self.assertIn("R1_FORMAT_INVALID", {error.rule_code for error in r1_errors})
        self.assertNotIn("R1_FORMAT_INVALID", {error.rule_code for error in normal_errors})

    def test_official_dictionary_contains_seeded_values_and_not_rreg(self) -> None:
        self.assertEqual(self.abbreviations["PF"], "PRIME FLOW/PLATFORMA")
        self.assertEqual(self.abbreviations["RIORG"], "RIORGANIZIM")
        self.assertGreaterEqual(len(self.abbreviations), 60)
        self.assertNotIn("RREG", self.abbreviations)


class WeeklyPlanningAuditWorkbookTests(unittest.TestCase):
    def _report(self) -> WeeklyPlanningAuditReport:
        abbreviations, metadata = load_px_abbreviations()
        return WeeklyPlanningAuditReport(
            week_start=WEEK_START,
            week_end=date(2026, 8, 7),
            generated_at=datetime(2026, 7, 31, 9, 0, tzinfo=ZoneInfo("Europe/Tirane")),
            timezone="Europe/Tirane",
            slot="09:00",
            people=[
                PersonAudit(
                    user_id=str(uuid.UUID(int=1)),
                    employee="Elsa Ferati",
                    department="Development",
                    leave_status="Jo",
                    focus="Audit Platform",
                    focus_source="Project 1",
                    focus_source_task_id=str(uuid.UUID(int=2)),
                    focus_source_project_id=str(uuid.UUID(int=3)),
                    task_count=2,
                    error_count=1,
                    critical_count=0,
                    high_count=1,
                    assessment="Kërkon korrigjim",
                    required_action="Korrigjo gabimet para fillimit të javës.",
                ),
                PersonAudit(
                    user_id=str(uuid.UUID(int=4)),
                    employee="No Tasks User",
                    department="Finance",
                    leave_status="Jo",
                    focus="Nuk është përcaktuar fokus jo-sistem",
                    focus_source="Nuk ka detyrë/projekt jo-sistem të vlefshëm",
                    focus_source_task_id=None,
                    focus_source_project_id=None,
                    task_count=0,
                    error_count=1,
                    critical_count=0,
                    high_count=1,
                    assessment="Kërkon korrigjim",
                    required_action="Korrigjo gabimet para fillimit të javës.",
                ),
            ],
            errors=[
                AuditError(
                    employee="No Tasks User",
                    department="Finance",
                    task_id=None,
                    task_date=None,
                    current_title="",
                    problem="Planifikimi javor nuk përmban detyra pune.",
                    proposed_title="",
                    correction="Shto detyrat reale të punës për javën e raportuar.",
                    rule_code="NO_MEANINGFUL_WEEKLY_PLAN",
                    severity="HIGH",
                    weekly_focus="Nuk është përcaktuar fokus jo-sistem",
                )
            ],
            abbreviations=abbreviations,
            abbreviation_version=metadata["version"],
            abbreviation_source=metadata["source"],
            abbreviation_updated_at=metadata["updated_at"],
        )

    def test_excel_has_exact_sheets_and_required_headers_and_opens(self) -> None:
        workbook_bytes = build_weekly_planning_audit_workbook(
            self._report(),
            recipients={"to": ["ga@primexeu.com"], "cc": [], "bcc": []},
            run_id=str(uuid.UUID(int=99)),
        )
        workbook = load_workbook(io.BytesIO(workbook_bytes), data_only=False)
        self.assertEqual(workbook.sheetnames, SHEET_NAMES)
        final_headers = [cell.value for cell in workbook["RAPORTI FINAL"][1]]
        detail_headers = [cell.value for cell in workbook["DETAJET E GABIMEVE"][1]]
        self.assertIn("Fokusi kryesor i javës", final_headers)
        self.assertIn("Kodi i rregullit", detail_headers)
        self.assertEqual(workbook["RAPORTI FINAL"].max_row, 3)
        workbook.close()

    def test_0900_subject_is_exact(self) -> None:
        self.assertEqual(
            report_subject(self._report()),
            "Kontrolli 09:00 – Raporti PF PLNF JAV 03–07.08.2026 – 31.07.2026",
        )


if __name__ == "__main__":
    unittest.main()
