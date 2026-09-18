from datetime import date, datetime
from types import SimpleNamespace

import pytest
from sqlalchemy import create_engine, select, text

from app.api.routers.common_view import _get_task_dates
from app.models.task import Task
from app.services.task_date_window import common_view_task_date_window_filter, task_date_window_filter
from app.services.tomorrow_print_report import _personal_task_group


@pytest.mark.parametrize(
    "start,end,phase,created,expected",
    [
        ("2026-09-16", "2026-09-25", None, "2026-09-14", True),
        ("2026-09-07", "2026-09-25", None, "2026-09-07", True),
        ("2026-09-07", "2026-09-14", None, "2026-09-07", True),
        ("2026-09-20", "2026-09-25", None, "2026-09-14", True),
        ("2026-09-21", "2026-09-25", None, "2026-09-14", False),
        ("2026-09-07", "2026-09-13", None, "2026-09-07", False),
        ("2026-09-25", "2026-09-16", None, "2026-09-14", True),
        ("2026-09-16", "2026-09-25", "CHECK", "2026-09-14", False),
        ("2026-09-16", "2026-09-25", "control", "2026-09-14", False),
        ("2026-09-07", "2026-09-16", "CHECK", "2026-09-07", True),
        (None, "2026-09-25", None, "2026-09-14", False),
        (None, "2026-09-16", None, "2026-09-14", True),
        ("2026-09-16", None, None, "2026-09-14", True),
        (None, None, None, "2026-09-16", True),
        (None, None, None, "2026-09-07", False),
    ],
)
def test_week_query_matches_overlapping_task_dates(start, end, phase, created, expected):
    # Execute the actual SQL predicate, without connecting to an application database.
    engine = create_engine("sqlite://")
    with engine.begin() as db:
        db.execute(text("CREATE TABLE tasks (title TEXT, start_date TEXT, due_date TEXT, phase TEXT, created_at TEXT)"))
        db.execute(
            text("INSERT INTO tasks VALUES ('FG/GT: 08:00: SATELITE SIPGATE TEL', :start, :end, :phase, :created)"),
            dict(start=start, end=end, phase=phase, created=created),
        )
        query = select(Task.title).where(task_date_window_filter(date(2026, 9, 14), date(2026, 9, 20)))
        assert bool(db.execute(query).all()) is expected
    engine.dispose()


@pytest.mark.parametrize("window_from,window_to,expected", [
    (date(2026, 9, 14), None, True),
    (date(2026, 9, 26), None, False),
    (None, date(2026, 9, 20), True),
    (None, date(2026, 9, 15), False),
])
def test_open_ended_task_windows(window_from, window_to, expected):
    engine = create_engine("sqlite://")
    with engine.begin() as db:
        db.execute(text("CREATE TABLE tasks (title TEXT, start_date TEXT, due_date TEXT, phase TEXT, created_at TEXT)"))
        db.execute(text("INSERT INTO tasks VALUES ('Personal', '2026-09-16', '2026-09-25', NULL, '2026-09-14')"))
        assert bool(db.execute(select(Task.title).where(task_date_window_filter(window_from, window_to))).all()) is expected
    engine.dispose()


@pytest.mark.parametrize(
    "important,status,completed_at,expected",
    [
        (True, "IN_PROGRESS", None, False),
        (True, "DONE", None, False),
        (True, "DONE", "2026-09-23", False),
        (True, "IN_PROGRESS", "2026-09-19", False),
        (False, "IN_PROGRESS", None, False),
    ],
)
def test_common_view_week_query_excludes_deadline_tasks_after_due_date(
    important, status, completed_at, expected
):
    engine = create_engine("sqlite://")
    with engine.begin() as db:
        db.execute(text(
            "CREATE TABLE tasks (title TEXT, start_date TEXT, due_date TEXT, phase TEXT, "
            "created_at TEXT, is_deadline_important BOOLEAN, status TEXT, completed_at TEXT)"
        ))
        db.execute(
            text(
                "INSERT INTO tasks VALUES ('Deadline', '2026-09-14', '2026-09-18', NULL, "
                "'2026-09-14', :important, :status, :completed_at)"
            ),
            dict(important=important, status=status, completed_at=completed_at),
        )
        query = select(Task.title).where(
            common_view_task_date_window_filter(date(2026, 9, 21), date(2026, 9, 25))
        )
        assert bool(db.execute(query).all()) is expected
    engine.dispose()


@pytest.mark.parametrize("status,completed_at", [
    ("TODO", None), ("IN_PROGRESS", None), ("DONE", datetime(2026, 9, 25)),
])
def test_deadline_important_dates_stop_at_due_date(status, completed_at):
    task = SimpleNamespace(
        start_date=datetime(2026, 9, 14), due_date=datetime(2026, 9, 22),
        created_at=datetime(2026, 9, 14), is_deadline_important=True,
        status=status, completed_at=completed_at,
    )
    dates = _get_task_dates(task, False, range_end=date(2026, 9, 27))
    assert date(2026, 9, 21) in dates
    assert date(2026, 9, 22) in dates
    assert not any(day > date(2026, 9, 22) for day in dates)


def test_reported_personal_task_is_rendered_on_today_and_routed_to_gent():
    task = SimpleNamespace(
        start_date=datetime(2026, 9, 16), due_date=datetime(2026, 9, 25),
        created_at=datetime(2026, 9, 14),
    )
    assert date(2026, 9, 16) in _get_task_dates(task, single_day_only=False)
    assert _personal_task_group({
        "title": "FG[[added]]/GT:  08:00:[[/added]] SATELITE SIPGATE TEL\nme fol me Gent",
    }) == "GENT"


def test_tomorrow_print_personal_priority_prefers_ka_and_gent_over_ga():
    assert _personal_task_group({"title": "EF/GA/KA: Task"}) == "KA"
    assert _personal_task_group({"title": "EF/PX/GT: Task"}) == "GENT"
    assert _personal_task_group({"title": "EF/GA/GT: Task"}) == "GENT"
    assert _personal_task_group({"title": "EF/KA/GT/GA: Task"}) == "GENT"
