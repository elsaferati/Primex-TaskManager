import unittest
import uuid
from datetime import date, datetime, timezone
from types import SimpleNamespace

from app.services.daily_report_logic import (
    completed_on_day,
    daily_report_tyo_label,
    parse_ko_user_id,
    planned_range_for_daily_report,
    task_is_visible_to_user,
)


class TestDailyReportLogic(unittest.TestCase):
    def test_parse_ko_user_id_equals(self) -> None:
        ko = uuid.uuid4()
        self.assertEqual(parse_ko_user_id(f"ko_user_id={ko}"), ko)

    def test_parse_ko_user_id_colon(self) -> None:
        ko = uuid.uuid4()
        self.assertEqual(parse_ko_user_id(f"ko_user_id: {ko}"), ko)

    def test_visibility_mst_control_only_ko(self) -> None:
        ko = uuid.uuid4()
        other = uuid.uuid4()
        project = SimpleNamespace(project_type="MST", title="MST ABC")
        task = SimpleNamespace(
            phase="CONTROL",
            internal_notes=f"ko_user_id={ko}",
            assigned_to=other,
        )
        self.assertTrue(task_is_visible_to_user(task, user_id=ko, assignee_ids=set(), project=project, dept_code="PCM"))
        self.assertFalse(task_is_visible_to_user(task, user_id=other, assignee_ids=set(), project=project, dept_code="PCM"))

    def test_visibility_mst_control_missing_ko_hidden(self) -> None:
        ko = uuid.uuid4()
        project = SimpleNamespace(project_type="MST", title="MST ABC")
        task = SimpleNamespace(
            phase="CONTROL",
            internal_notes=None,
            assigned_to=ko,
        )
        self.assertFalse(task_is_visible_to_user(task, user_id=ko, assignee_ids=set(), project=project, dept_code="PCM"))

    def test_visibility_non_control_assigned_to_or_assignee(self) -> None:
        u1 = uuid.uuid4()
        u2 = uuid.uuid4()
        project = SimpleNamespace(project_type="GENERAL", title="General")
        task = SimpleNamespace(
            phase="PRODUCT",
            internal_notes=None,
            assigned_to=u1,
        )
        self.assertTrue(task_is_visible_to_user(task, user_id=u1, assignee_ids=set(), project=project))
        self.assertTrue(task_is_visible_to_user(task, user_id=u2, assignee_ids={u2}, project=project))
        self.assertFalse(task_is_visible_to_user(task, user_id=u2, assignee_ids=set(), project=project))

    def test_planned_range_dev_project_uses_start_to_due(self) -> None:
        task = SimpleNamespace(
            project_id=uuid.uuid4(),
            start_date=datetime(2026, 2, 1, 0, 0, tzinfo=timezone.utc),
            due_date=datetime(2026, 2, 5, 0, 0, tzinfo=timezone.utc),
        )
        self.assertEqual(planned_range_for_daily_report(task, "DEV"), (date(2026, 2, 1), date(2026, 2, 5)))

    def test_planned_range_pcm_project_due_only(self) -> None:
        task = SimpleNamespace(
            project_id=uuid.uuid4(),
            start_date=datetime(2026, 2, 1, 0, 0, tzinfo=timezone.utc),
            due_date=datetime(2026, 2, 5, 0, 0, tzinfo=timezone.utc),
        )
        self.assertEqual(planned_range_for_daily_report(task, "PCM"), (date(2026, 2, 5), date(2026, 2, 5)))

    def test_planned_range_gd_project_due_only(self) -> None:
        task = SimpleNamespace(
            project_id=uuid.uuid4(),
            start_date=datetime(2026, 2, 1, 0, 0, tzinfo=timezone.utc),
            due_date=datetime(2026, 2, 5, 0, 0, tzinfo=timezone.utc),
        )
        self.assertEqual(planned_range_for_daily_report(task, "GD"), (date(2026, 2, 5), date(2026, 2, 5)))

    def test_planned_range_fast_task_uses_start_to_due(self) -> None:
        task = SimpleNamespace(
            project_id=None,
            start_date=datetime(2026, 2, 1, 0, 0, tzinfo=timezone.utc),
            due_date=datetime(2026, 2, 5, 0, 0, tzinfo=timezone.utc),
        )
        self.assertEqual(planned_range_for_daily_report(task, "PCM"), (date(2026, 2, 1), date(2026, 2, 5)))

    def test_completed_on_day_utc_window(self) -> None:
        dt = datetime(2026, 2, 10, 5, 0, tzinfo=timezone.utc)
        self.assertTrue(completed_on_day(dt, date(2026, 2, 10)))
        self.assertFalse(completed_on_day(dt, date(2026, 2, 11)))

    def test_tyo_late_done_today_shows_late_days(self) -> None:
        self.assertEqual(
            daily_report_tyo_label(
                report_day=date(2026, 2, 10),
                start_day=None,
                due_day=date(2026, 2, 8),
                mode="dueOnly",
            ),
            "2",
        )

    def test_tyo_range_mode(self) -> None:
        self.assertEqual(
            daily_report_tyo_label(
                report_day=date(2026, 2, 8),
                start_day=date(2026, 2, 7),
                due_day=date(2026, 2, 10),
                mode="range",
            ),
            "T",
        )
        self.assertEqual(
            daily_report_tyo_label(
                report_day=date(2026, 2, 11),
                start_day=date(2026, 2, 7),
                due_day=date(2026, 2, 10),
                mode="range",
            ),
            "Y",
        )


if __name__ == "__main__":
    unittest.main()
