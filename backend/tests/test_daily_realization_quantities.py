from datetime import date, datetime, timezone
from types import SimpleNamespace
import uuid

import pytest

from app.services.daily_realization_metrics import calculate_daily_metrics
from app.services.daily_realization_quantities import daily_task_quantity, title_planned_quantity
from app.services.task_strike_events import record_text_strike_events


DAY = date(2026, 9, 17)


def task(**values):
    defaults = dict(title="EF: FRG: 2/17 SHTO 2 KZH TE REJA", description="", project_id=None,
                    daily_products=None, internal_notes="", phase=None,
                    due_date=datetime(2026, 9, 17, 14, tzinfo=timezone.utc), completed_at=None)
    return SimpleNamespace(**(defaults | values))


@pytest.mark.parametrize("title, planned", [
    ("EF: FRG: 2/17 SHTO 2 KZH TE REJA", 2), ("EF: 2 / 17", 2),
    ("EF: 0/17", None), ("Detyre normale", None), ("Data 17/09/2026", None),
    ("AT: 45[[added]]/9[[/added]] PX/MX", 9),
    ("AT/OH: [[added]]20/117 ASC: KO1/KO2[[/added]]", 20),
    ("PCM: 40/4 produkte", 4),
    ("FRG: 17/4", 4),
])
def test_title_target_uses_first_number(title, planned):
    assert title_planned_quantity(title) == planned


@pytest.mark.parametrize("description, done", [
    ("1. Pika A\n2. Pika B", 0),
    ("[[done]]1. Pika A[[/done]]\n2. Pika B", 1),
    ("[[done]]1. Pika A\n2. Pika B[[/done]]", 2),
    ("[[done]]1. A\n2. B\n3. C[[/done]]", 3),
    ("[[done]]1. Pika e njejte\n2. Pika e njejte[[/done]]", 2),
    ("1. [[done]]Pika A[[/done]]\n2. Pika B", 1),
])
def test_strike_quantity_handles_partial_complete_extra_and_bullets(description, done):
    result = daily_task_quantity(task(description=description), day=DAY)
    assert result == dict(source="title", planned=2, completed=done, delta=done - 2)


def test_whole_heading_strike_means_all_units():
    result = daily_task_quantity(task(title="[[done]]EF: 2/17 SHTO 2 KZH TE REJA[[/done]]"), day=DAY)
    assert result["completed"] == 2


def test_striking_only_the_numeric_marker_does_not_complete_all_units():
    result = daily_task_quantity(task(title="EF: [[done]]2/17[[/done]] SHTO 2 KZH TE REJA"), day=DAY)
    assert result["completed"] == 1


def test_mirrored_title_and_description_count_once():
    text = "EF: 2/17\n[[done]]1. Pika A\n2. Pika B[[/done]]"
    assert daily_task_quantity(task(title=text, description=text), day=DAY)["completed"] == 2


def test_corrected_title_updates_quantity_target():
    result = daily_task_quantity(task(title="EF: 5/17", description="[[done]]1. A[[/done]]"), day=DAY, baseline={"title": "EF: 2/17"})
    assert result["planned"] == 5
    assert result["delta"] == -4


def test_corrected_fraction_uses_daily_first_number_instead_of_old_baseline():
    result = daily_task_quantity(task(title="AT/OH: [[added]]20/117 ASC: KO1/KO2[[/added]]"), day=DAY,
                                 baseline={"title": "AT/OH: 117/20 ASC: KO1/KO2"})
    assert result == dict(source="title", planned=20, completed=0, delta=-20)


def test_removing_fraction_removes_quantity_target():
    assert daily_task_quantity(task(title="Detyre normale"), day=DAY, baseline={"title": "EF: 2/17"}) is None


def test_prior_day_and_future_timestamp_are_excluded():
    description = "[[done]]1. A 12:00 16.09\n2. B 12:00 17.09\n3. C 12:00 18.09[[/done]]"
    assert daily_task_quantity(task(description=description), day=DAY)["completed"] == 1


def test_undated_legacy_strikes_not_credited_to_another_day():
    assert daily_task_quantity(task(description="[[done]]1. A[[/done]]"), day=date(2026, 9, 18))["completed"] == 0


def test_strike_history_handles_reopening_and_duplicate_points():
    before = "1. A\n2. A"
    after = "[[done]]1. A[[/done]]\n2. A"
    events = []
    record_text_strike_events(SimpleNamespace(add=events.append), task_id=uuid.uuid4(), actor_user_id=None,
                             before_text=before, after_text=after, field_name="DESCRIPTION")
    for event in events:
        event.id = uuid.uuid4()
        event.occurred_at = datetime(2026, 9, 16, 12, tzinfo=timezone.utc)
    assert daily_task_quantity(task(description=after), day=DAY, strike_events=events)["completed"] == 0
    events[0].occurred_at = datetime(2026, 9, 17, 12, tzinfo=timezone.utc)
    assert daily_task_quantity(task(description=after), day=DAY, strike_events=events)["completed"] == 1
    assert daily_task_quantity(task(description=before), day=DAY, strike_events=events)["completed"] == 0


def test_strike_history_uses_local_day_and_includes_exact_midnight():
    events = []
    after = "[[done]]1. A[[/done]]"
    record_text_strike_events(SimpleNamespace(add=events.append), task_id=uuid.uuid4(), actor_user_id=None,
                             before_text="1. A", after_text=after, field_name="DESCRIPTION")
    events[0].id = uuid.uuid4()
    events[0].occurred_at = datetime(2026, 9, 16, 22, tzinfo=timezone.utc)
    assert daily_task_quantity(task(description=after), day=DAY, strike_events=events)["completed"] == 1


def test_future_strike_event_is_not_treated_as_an_undated_legacy_strike():
    events = []
    after = "[[done]]1. A[[/done]]"
    record_text_strike_events(SimpleNamespace(add=events.append), task_id=uuid.uuid4(), actor_user_id=None,
                             before_text="1. A", after_text=after, field_name="DESCRIPTION")
    events[0].id = uuid.uuid4()
    events[0].occurred_at = datetime(2026, 9, 18, 12, tzinfo=timezone.utc)
    assert daily_task_quantity(task(description=after), day=DAY, strike_events=events)["completed"] == 0


@pytest.mark.parametrize("done", [0, 3, 5, 8])
def test_product_quantities_match_m3_and_allow_surplus(done):
    result = daily_task_quantity(task(title="Produkte", project_id=uuid.uuid4(), phase="PRODUCT", daily_products=5,
                                      internal_notes=f"completed_products={done}"), day=DAY)
    assert result == dict(source="products", planned=5, completed=done, delta=done - 5)


def test_selected_daily_product_values_override_current_live_notes():
    result = daily_task_quantity(task(title="Produkte", project_id=uuid.uuid4(), phase="PRODUCT", daily_products=8,
                                      internal_notes="completed_products=99"), day=DAY,
                                 progress=SimpleNamespace(total_value=5, completed_value=3))
    assert result == dict(source="products", planned=5, completed=3, delta=-2)


def test_done_product_task_completes_full_planned_quantity():
    result = daily_task_quantity(
        task(title="Produkte", project_id=uuid.uuid4(), phase="PRODUCT", daily_products=5,
             internal_notes="completed_products=2"),
        day=DAY, done_for_day=True,
    )
    assert result == dict(source="products", planned=5, completed=5, delta=0)


def test_product_control_and_nonproject_tasks_are_excluded():
    assert daily_task_quantity(task(title="Kontroll", phase="CONTROL", daily_products=5, project_id=uuid.uuid4()), day=DAY) is None
    assert daily_task_quantity(task(title="Personal", phase="PRODUCT", daily_products=5), day=DAY) is None


def test_product_live_notes_do_not_leak_to_other_days():
    result = daily_task_quantity(task(title="Produkte", project_id=uuid.uuid4(), phase="PRODUCT", daily_products=5,
                                      internal_notes="completed_products=99"), day=date(2026, 9, 18))
    assert result["completed"] == 0


def test_plain_description_strikes_are_counted():
    result = daily_task_quantity(task(description="[[done]]Pika A[[/done]]\nPika B"), day=DAY)
    assert result["completed"] == 1


def test_done_quantity_task_without_points_completes_all_units():
    result = daily_task_quantity(
        task(title="ESH/DV: 59/59 KL -3", completed_at=datetime(2026, 9, 17, 9, tzinfo=timezone.utc)),
        day=DAY,
    )
    assert result == dict(source="title", planned=59, completed=59, delta=0)


def test_done_quantity_task_overrides_partial_strikes():
    result = daily_task_quantity(
        task(
            title="EF: 9/45 WEB",
            description="[[done]]1. Pika e pare[[/done]]\n2. Pika e dyte",
            completed_at=datetime(2026, 9, 17, 9, tzinfo=timezone.utc),
        ),
        day=DAY,
    )
    assert result == dict(source="title", planned=9, completed=9, delta=0)


def test_credited_done_event_overrides_partial_strikes():
    result = daily_task_quantity(
        task(title="EF: 9/45 WEB", description="[[done]]1. Pika[[/done]]"),
        day=DAY, done_for_day=True,
    )
    assert result == dict(source="title", planned=9, completed=9, delta=0)


def test_daily_done_progress_completes_pointless_quantity_task():
    result = daily_task_quantity(
        task(title="ESH/DV: 6/6 KL -3"), day=DAY,
        progress=SimpleNamespace(daily_status="DONE", total_value=0, completed_value=0),
    )
    assert result == dict(source="title", planned=6, completed=6, delta=0)


def test_old_completion_does_not_complete_quantity_on_selected_day():
    result = daily_task_quantity(
        task(title="ESH/DV: 59/59 KL -3", completed_at=datetime(2026, 9, 16, 9, tzinfo=timezone.utc)),
        day=DAY,
    )
    assert result == dict(source="title", planned=59, completed=0, delta=-59)


def test_live_report_exposes_task_and_person_quantities(monkeypatch):
    import asyncio
    from app.models.daily_planner_snapshot import DailyPlannerSnapshot
    from app.models.task import Task
    from app.models.user import User
    from app.services import daily_realization_live as service

    department_id, user_id, task_id = uuid.uuid4(), uuid.uuid4(), uuid.uuid4()
    person = SimpleNamespace(id=user_id, full_name="Elsa Ferati")
    current = Task(id=task_id, title="EF: 2/17", description="[[done]]1. A[[/done]]\n2. B",
                   assigned_to=user_id, department_id=department_id, status="TODO", is_active=True,
                   created_at=datetime(2026, 9, 1, 12, tzinfo=timezone.utc),
                   updated_at=datetime(2026, 9, 17, 12, tzinfo=timezone.utc),
                   due_date=datetime(2026, 9, 17, 14, tzinfo=timezone.utc))
    baseline = SimpleNamespace(id=uuid.uuid4(), captured_at=current.created_at, payload={"people": [
        {"user_id": str(user_id), "tasks": [{"task_id": str(task_id), "title": current.title,
         "planned_due_date": DAY.isoformat()}]},
    ]})

    async def load_people(*args, **kwargs): return [person], {}
    monkeypatch.setattr(service, "load_active_users_and_common_leave", load_people)

    class Result:
        def __init__(self, rows=(), scalar=None): self.rows, self.scalar = rows, scalar
        def scalar_one_or_none(self): return self.scalar
        def scalars(self): return self
        def all(self): return self.rows

    class Session:
        async def execute(self, statement):
            column = statement.column_descriptions[0]
            if column["entity"] is DailyPlannerSnapshot: return Result(scalar=baseline)
            if column["entity"] is User: return Result([person])
            if column["entity"] is Task: return Result([task_id] if column["name"] == "id" else [current])
            return Result()

    report = asyncio.run(service.build_live_daily_realization(Session(), department_id=department_id, day=DAY))
    task_row = report["people"][0]["tasks"][0]
    assert task_row["quantity"] == dict(source="title", planned=2, completed=1, delta=-1)
    assert task_row["classification"] == "IN_PROGRESS"
    assert report["people"][0]["metrics"]["quantity_completed_count"] == 1
    assert report["metrics"]["quantity_delta"] == -1


def test_metrics_sum_quantities_separately_and_exclude_transferred_obligations():
    metrics = calculate_daily_metrics([
        dict(in_original_plan=True, classification="IN_PROGRESS", quantity=dict(source="title", planned=2, completed=1, delta=-1)),
        dict(in_original_plan=False, classification="ADDED_DURING_DAY", quantity=dict(source="products", planned=5, completed=6, delta=1)),
        dict(in_original_plan=True, classification="REASSIGNED_OUT", quantity=dict(source="products", planned=10, completed=0, delta=-10)),
        dict(in_original_plan=True, classification="NO_PROGRESS", quantity=None),
    ])
    assert metrics["quantity_task_count"] == 2
    assert metrics["quantity_planned_count"] == 7
    assert metrics["quantity_completed_count"] == 7
    assert metrics["quantity_delta"] == 0
    assert metrics["original_planned_count"] == 3
    assert metrics["total_completed_today_count"] == 0
