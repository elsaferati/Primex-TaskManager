from __future__ import annotations

import unittest
import uuid
from datetime import date, datetime, timezone
from io import StringIO
from types import SimpleNamespace
from unittest.mock import AsyncMock, MagicMock, patch

from alembic.migration import MigrationContext
from alembic.operations import Operations
from pydantic import ValidationError

from app.api.routers import m3_reporting_points as api
from app.services import m3_reporting_points as service
from app.services import m3_reporting_points_scheduler as scheduler
from tests.test_migration_graph import migration_scripts

DAY = date(2026, 10, 5)


def task(**changes):
    values = dict(id=uuid.uuid4(), title="Detyre", status="TODO", progress_percentage=0,
                  created_at=datetime(2026, 10, 5, 6, tzinfo=timezone.utc),
                  start_date=datetime(2026, 10, 5, 7, tzinfo=timezone.utc),
                  due_date=datetime(2026, 10, 5, 14, tzinfo=timezone.utc),
                  is_deadline_important=False, completed_at=None)
    return SimpleNamespace(**{**values, **changes})


def event(item, field="due_date", before="2026-10-05", after="2026-10-06", **changes):
    values = dict(id=uuid.uuid4(), entity_id=item.id, action=f"task.{field}_changed",
                  before={"value": before}, after={"value": after},
                  created_at=datetime(2026, 10, 5, 8, tzinfo=timezone.utc))
    return SimpleNamespace(**{**values, **changes})


class SelectionTests(unittest.TestCase):
    def test_all_todo_includes_progressed_overdue_and_future_planned_tasks(self):
        rows = [task(title="Me progres", progress_percentage=65),
                task(title="E vjeter", due_date=datetime(2026, 9, 1, tzinfo=timezone.utc)),
                task(title="Per te ardhmen", start_date=datetime(2026, 11, 1, tzinfo=timezone.utc)),
                task(title="DONE", status="DONE"), task(title="IN_PROGRESS", status="IN_PROGRESS")]
        sections = service.select_task_sections(rows, [], DAY)
        self.assertEqual([row["title"] for row in sections["untouched"]], ["Me progres", "E vjeter", "Per te ardhmen"])

    def test_risk_distinguishes_within_week_friday_and_next_week(self):
        for target, expected in ((date(2026, 10, 6), "OK"), (date(2026, 10, 9), "RREZIK"),
                                 (date(2026, 10, 12), "RREZIK"), (date(2026, 10, 20), "RREZIK")):
            with self.subTest(target=target):
                row = task(due_date=target)
                result = service.select_task_sections([row], [event(row, after=target.isoformat())], DAY)
                self.assertEqual(result["postponed"][0]["risk"], expected)
                self.assertEqual(result["postponed"][0]["risk_color"], "#dcfce7" if expected == "OK" else "#fee2e2")

    def test_same_day_requires_all_three_dates_and_reports_each_status(self):
        rows = [task(status=status, progress_percentage=percent) for status, percent in (
            ("TODO", 0), ("IN_PROGRESS", 35), ("DONE", 100), ("WAITING_CLIENT", 15),
        )]
        rows += [task(created_at=date(2026, 10, 4)), task(start_date=date(2026, 10, 4)), task(due_date=date(2026, 10, 6))]
        result = service.select_task_sections(rows, [], DAY)["same_day"]
        self.assertEqual([(row["status"], row["progress"]) for row in result],
                         [("TODO", 0), ("IN_PROGRESS", 35), ("DONE", 100), ("WAITING_CLIENT", 15)])

    def test_ga_uses_deadline_important_and_not_merely_a_due_date(self):
        plain = task(created_at=date(2026, 9, 1), due_date=date(2026, 10, 6))
        deadline = task(created_at=date(2026, 9, 1), due_date=date(2026, 10, 6), is_deadline_important=True)
        same_day = task(start_date=date(2026, 10, 6), due_date=date(2026, 10, 6))
        both = task(due_date=date(2026, 10, 6), is_deadline_important=True)
        not_moved = task(is_deadline_important=True)
        events = [event(plain), event(deadline), event(same_day),
                  event(same_day, "start_date"), event(both)]
        result = service.select_task_sections([plain, deadline, same_day, both, not_moved], events, DAY)["ga_postponed"]
        self.assertEqual([row["task_id"] for row in result], [str(deadline.id), str(same_day.id), str(both.id)])
        self.assertEqual(result[-1]["category"], "Deadline Important / SOT/SOT")

    def test_creation_uses_the_local_day_and_initial_date_assignment_is_not_a_move(self):
        row = task(created_at=datetime(2026, 10, 4, 22, 30, tzinfo=timezone.utc), due_date=date(2026, 10, 6))
        initial = event(row, before=None, created_at=datetime(2026, 10, 5, 7, tzinfo=timezone.utc))
        moved = event(row)
        result = service.select_task_sections([row], [initial, moved], DAY)
        self.assertEqual(len(result["ga_postponed"]), 1)
        self.assertEqual(result["ga_postponed"][0]["created_date"], "2026-10-05")

    def test_reverted_or_other_day_changes_do_not_count_as_postponed(self):
        row = task(is_deadline_important=True)
        changes = [event(row), event(row, before="2026-10-06", after="2026-10-05")]
        result = service.select_task_sections([row], changes, DAY)
        self.assertEqual(result["postponed"], [])
        self.assertEqual(result["ga_postponed"], [])
        row.due_date = date(2026, 10, 6)
        yesterday = event(row, created_at=datetime(2026, 10, 4, 8, tzinfo=timezone.utc))
        self.assertEqual(service.select_task_sections([row], [yesterday], DAY)["ga_postponed"], [])

    def test_completed_late_date_normalization_is_not_a_postponement(self):
        row = task(status="DONE", is_deadline_important=True, completed_at=datetime(2026, 10, 5, 12, tzinfo=timezone.utc))
        result = service.select_task_sections([row], [event(row, before="2026-10-02", after="2026-10-05")], DAY)
        self.assertEqual(result["ga_postponed"], [])


class RenderingTests(unittest.TestCase):
    def report(self):
        rows = []
        for target in (date(2026, 10, 6), date(2026, 10, 9)):
            row = task(title="<script>alert('x')</script>", due_date=target)
            moved = service.select_task_sections([row], [event(row, after=target.isoformat())], DAY)["postponed"][0]
            moved.update(comment="Klienti kerkoi shtyrjen\nDuhet informacion", assignees="User", department="DEV", project="P")
            rows.append(moved)
        return {"report_date": DAY.isoformat(), "manual_answers": {"underload": "<b>Pergjigje</b>"},
                "data": {"postponed": rows}, "realization": {"percent": 62.0, "comment": service.realization_comment(62)},
                "realization_captured_at": "2026-10-05T16:15:00+02:00"}

    def test_email_retains_comments_colors_manual_answers_and_both_blocks(self):
        report = self.report()
        result = service.render_html(report)
        self.assertIn(service.M3_TITLE, result)
        self.assertIn(service.GA_TITLE, result)
        self.assertIn("background:#fee2e2", result)
        self.assertIn("background:#dcfce7", result)
        self.assertIn("Klienti kerkoi shtyrjen<br>Duhet informacion", result)
        self.assertIn("62%", result)
        self.assertNotIn("<script>", result)
        self.assertIn("&lt;b&gt;Pergjigje&lt;/b&gt;", result)
        self.assertIn("Klienti kerkoi shtyrjen", service.render_plain_text(report))

    def test_threshold_and_missing_data_are_not_invented_zero(self):
        self.assertIn("mbi 50%", service.realization_comment(62))
        self.assertIn("nen 50%", service.realization_comment(42))
        self.assertEqual(service.realization_comment(50), "Jemi ne 50%.")
        self.assertIn("Mungojne", service.realization_comment(None))

    def test_manual_payload_rejects_automatic_fields_and_keeps_newlines(self):
        self.assertEqual(api.ManualAnswersPayload(manual_answers={"reorganization": "Rreshti 1\nRreshti 2"}).manual_answers["reorganization"], "Rreshti 1\nRreshti 2")
        with self.assertRaises(ValidationError):
            api.ManualAnswersPayload(manual_answers={"percent": "100"})
        with self.assertRaises(ValidationError):
            api.ManualAnswersPayload(manual_answers={"underload": "x" * 10001})

    def test_migration_emits_unique_per_date_table_and_no_auto_send_settings(self):
        output = StringIO()
        migration = migration_scripts().get_revision("0142_m3_reporting_points").module
        operations = Operations(MigrationContext.configure(dialect_name="postgresql", opts={"as_sql": True, "output_buffer": output}))
        with patch.object(migration, "op", operations):
            migration.upgrade()
        sql = output.getvalue()
        self.assertIn("CREATE TABLE m3_reporting_points_reports", sql)
        self.assertIn("UNIQUE (report_date)", sql)
        self.assertIn("realization_captured_at TIMESTAMP WITH TIME ZONE", sql)


class CaptureAndWorkflowTests(unittest.IsolatedAsyncioTestCase):
    async def test_capture_runs_only_at_1615_on_weekdays_and_never_late(self):
        with patch.object(scheduler, "SessionLocal") as session:
            for stamp in ("2026-10-05T16:14:59+02:00", "2026-10-05T16:16:00+02:00", "2026-10-03T16:15:00+02:00"):
                self.assertFalse(await scheduler.run_m3_reporting_points_scheduler_once(datetime.fromisoformat(stamp)))
        session.assert_not_called()
        self.assertTrue(scheduler.is_capture_minute(datetime.fromisoformat("2026-10-05T14:15:30+00:00")))

    async def test_capture_is_immutable_preserves_manual_answers_and_sends_no_email(self):
        row = SimpleNamespace(realization_captured_at=None, realization=None, generated_at=datetime.now(timezone.utc),
                              status="DRAFT", manual_answers={"underload": "Pergjigje e ruajtur"})
        db = AsyncMock()
        context = MagicMock()
        context.__aenter__ = AsyncMock(return_value=db)
        context.__aexit__ = AsyncMock(return_value=False)
        with (patch.object(scheduler, "SessionLocal", return_value=context),
              patch.object(scheduler, "locked_report", new=AsyncMock(return_value=row)),
              patch.object(scheduler, "build_realization_capture", new=AsyncMock(return_value={"percent": 62})) as capture,
              patch.object(service, "GmailService") as gmail):
            self.assertTrue(await scheduler.run_m3_reporting_points_scheduler_once(datetime.fromisoformat("2026-10-05T16:15:10+02:00")))
            self.assertFalse(await scheduler.run_m3_reporting_points_scheduler_once(datetime.fromisoformat("2026-10-05T16:15:40+02:00")))
        capture.assert_awaited_once()
        gmail.assert_not_called()
        self.assertEqual(row.manual_answers, {"underload": "Pergjigje e ruajtur"})
        self.assertEqual(row.realization, {"percent": 62})

    async def test_staff_percentage_is_weighted_by_the_existing_realization_metric(self):
        department = uuid.uuid4()
        ids = [uuid.uuid4(), uuid.uuid4()]
        users = [SimpleNamespace(id=user_id, department_id=department) for user_id in ids]
        result = MagicMock()
        result.scalars.return_value.all.return_value = users
        db = AsyncMock()
        db.execute.return_value = result
        # One person realizes 1/1, the other 0/3: staff result must be 25%, not 50%.
        people = [{"user_id": str(ids[0]), "user_name": "A", "tasks": [{"in_original_plan": True, "classification": "REALIZED_AS_PLANNED"}], "metrics": {"raw_plan_realization": 100}},
                  {"user_id": str(ids[1]), "user_name": "B", "tasks": [{"in_original_plan": True, "classification": "NO_PROGRESS"}] * 3, "metrics": {"raw_plan_realization": 0}}]
        with patch.object(service, "build_live_daily_realization", new=AsyncMock(return_value={"baseline_available": True, "people": people})):
            capture = await service.build_realization_capture(db, DAY)
        self.assertEqual(capture["percent"], 25)
        with patch.object(service, "build_live_daily_realization", new=AsyncMock(return_value={"baseline_available": False, "people": people})):
            capture = await service.build_realization_capture(db, DAY)
        self.assertIsNone(capture["percent"])

    async def test_regeneration_preserves_answers_and_realization(self):
        row = SimpleNamespace(report_date=datetime.now(service.report_timezone()).date(),
                              manual_answers={"ga_reorganization": "Jo"}, realization={"percent": 62},
                              realization_captured_at="16:15", data={}, generated_at=None)
        with patch.object(service, "build_task_data", new=AsyncMock(return_value={"untouched": [{"title": "TODO"}]})):
            await service.refresh_report(AsyncMock(), row)
        self.assertEqual(row.manual_answers, {"ga_reorganization": "Jo"})
        self.assertEqual(row.realization, {"percent": 62})
        self.assertEqual(row.realization_captured_at, "16:15")

    async def test_historical_regeneration_never_reads_current_task_status(self):
        row = SimpleNamespace(report_date=date(2026, 1, 1))
        with patch.object(service, "build_task_data", new=AsyncMock()) as builder:
            with self.assertRaises(ValueError):
                await service.refresh_report(AsyncMock(), row)
        builder.assert_not_awaited()

    async def test_sent_report_is_idempotent_and_blank_recipients_do_not_send(self):
        row = SimpleNamespace(status="SENT")
        with patch.object(service, "GmailService") as gmail:
            await service.send_report(AsyncMock(), row, {"to": ["recipient@example.com"]})
            row.status = "DRAFT"
            with self.assertRaises(ValueError):
                await service.send_report(AsyncMock(), row, {"to": []})
        gmail.assert_not_called()


if __name__ == "__main__":
    unittest.main()
