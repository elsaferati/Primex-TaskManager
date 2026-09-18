from pathlib import Path
from datetime import date, datetime, timezone
from types import SimpleNamespace

from app.api.routers.common_view import _get_task_dates


ROOT = Path(__file__).resolve().parents[2]


def test_common_view_keeps_deadline_tasks_red_from_start_date_until_done():
    source = (ROOT / "frontend/src/app/(app)/common/page.tsx").read_text(encoding="utf-8")
    helper = source[
        source.index("const isCommonTaskDeadlineActiveOnDate"):
        source.index("const commonTaskHighlightClassName")
    ]

    assert "if (!entry.isDeadlineImportant) return false" in helper
    assert "if (isCommonTaskDone(entry.status, entry.isDone)) return false" in helper
    assert "targetDate >= startDate" in helper
    assert "dueDate" not in helper


def test_common_view_deadline_red_precedes_new_task_highlighting_and_drives_filtering():
    source = (ROOT / "frontend/src/app/(app)/common/page.tsx").read_text(encoding="utf-8")
    highlighter = source[
        source.index("const commonTaskHighlightClassName"):
        source.index("const commonTaskStateClassName")
    ]
    color_filter = source[
        source.index("const getCommonTaskColor"):
        source.index("const commonTaskSortRank")
    ]

    assert highlighter.index("isCommonTaskDeadlineActiveOnDate") < highlighter.index(
        "getCommonTaskNewCategory"
    )
    assert 'if (isCommonTaskDeadlineActiveOnDate(entry)) return "red"' in color_filter


def _task(*, important: bool, completed_at=None, status="IN_PROGRESS"):
    return SimpleNamespace(
        start_date=datetime(2026, 9, 21, tzinfo=timezone.utc),
        due_date=datetime(2026, 9, 23, tzinfo=timezone.utc),
        created_at=datetime(2026, 9, 18, tzinfo=timezone.utc),
        planned_for=None,
        completed_at=completed_at,
        status=status,
        is_deadline_important=important,
    )


def test_open_deadline_task_is_in_common_view_from_start_and_after_due_date():
    assert _get_task_dates(_task(important=True), False, date(2026, 9, 25)) == [
        date(2026, 9, 21),
        date(2026, 9, 22),
        date(2026, 9, 23),
        date(2026, 9, 24),
        date(2026, 9, 25),
    ]


def test_regular_task_still_stops_on_due_date():
    assert _get_task_dates(_task(important=False), False, date(2026, 9, 25)) == [
        date(2026, 9, 21),
        date(2026, 9, 22),
        date(2026, 9, 23),
    ]


def test_deadline_task_stops_carrying_after_completion():
    completed_at = datetime(2026, 9, 23, tzinfo=timezone.utc)
    assert _get_task_dates(
        _task(important=True, completed_at=completed_at, status="DONE"),
        False,
        date(2026, 9, 25),
    ) == [
        date(2026, 9, 21),
        date(2026, 9, 22),
        date(2026, 9, 23),
    ]
