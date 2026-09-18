from datetime import date, datetime

from app.services.one_h_slots import effective_slot_date
from app.services.task_marker import active_one_h_marker, effective_marker_date
from types import SimpleNamespace


# Mon 2026-07-06 .. Sun 2026-07-12
MON = date(2026, 7, 6)
TUE = date(2026, 7, 7)
FRI = date(2026, 7, 10)
SAT = date(2026, 7, 11)
SUN = date(2026, 7, 12)


def at(day: date, hour: int, minute: int = 0) -> datetime:
    return datetime(day.year, day.month, day.day, hour, minute)


def test_today_before_1600_stays_today():
    assert effective_slot_date(MON, at(MON, 15, 58)) == MON


def test_today_at_1559_stays_today():
    assert effective_slot_date(MON, at(MON, 15, 59)) == MON


def test_today_after_1559_rolls_to_next_working_day():
    assert effective_slot_date(MON, at(MON, 16, 0)) == TUE


def test_friday_at_1600_rolls_to_monday():
    assert effective_slot_date(FRI, at(FRI, 16, 0)) == date(2026, 7, 13)


def test_saturday_at_1600_rolls_to_monday():
    assert effective_slot_date(SAT, at(SAT, 16, 0)) == date(2026, 7, 13)


def test_sunday_after_1530_rolls_to_monday():
    assert effective_slot_date(SUN, at(SUN, 17, 0)) == date(2026, 7, 13)


def test_past_date_is_unchanged_even_after_1530():
    assert effective_slot_date(MON, at(TUE, 17, 0)) == MON


def test_future_date_is_unchanged():
    assert effective_slot_date(FRI, at(MON, 17, 0)) == FRI


def test_symbol_refreshes_with_the_1600_workday_rollover():
    task = SimpleNamespace(one_h_marker="M2", one_h_marker_date=TUE)
    assert active_one_h_marker(task, now=at(TUE, 15, 59)) == "M2"
    assert active_one_h_marker(task, now=at(TUE, 16, 0)) is None


def test_symbol_saved_for_next_workday_appears_after_1600():
    wednesday = date(2026, 7, 8)
    task = SimpleNamespace(one_h_marker="M3", one_h_marker_date=wednesday)
    assert active_one_h_marker(task, now=at(TUE, 15, 59)) is None
    assert active_one_h_marker(task, now=at(TUE, 16, 0)) == "M3"


def test_friday_symbols_do_not_refresh_at_1600():
    task = SimpleNamespace(one_h_marker="QUESTION", one_h_marker_date=FRI)
    assert active_one_h_marker(task, now=at(FRI, 15, 59)) == "QUESTION"
    assert active_one_h_marker(task, now=at(FRI, 16, 0)) == "QUESTION"
    assert active_one_h_marker(task, now=at(FRI, 23, 59)) == "QUESTION"


def test_friday_symbols_remain_active_during_weekend():
    task = SimpleNamespace(one_h_marker="EXCLAMATION", one_h_marker_date=FRI)
    assert active_one_h_marker(task, now=at(SAT, 12, 0)) == "EXCLAMATION"
    assert active_one_h_marker(task, now=at(SUN, 20, 0)) == "EXCLAMATION"


def test_friday_symbols_remain_active_until_monday_1600():
    monday = date(2026, 7, 13)
    task = SimpleNamespace(one_h_marker="FLAG", one_h_marker_date=FRI)
    assert active_one_h_marker(task, now=at(monday, 15, 59)) == "FLAG"
    assert active_one_h_marker(task, now=at(monday, 16, 0)) is None


def test_monday_1600_activates_tuesday_symbols():
    monday = date(2026, 7, 13)
    tuesday = date(2026, 7, 14)
    task = SimpleNamespace(one_h_marker="M2", one_h_marker_date=tuesday)
    assert active_one_h_marker(task, now=at(monday, 15, 59)) is None
    assert active_one_h_marker(task, now=at(monday, 16, 0)) == "M2"


def test_manual_marker_changes_before_monday_1600_use_friday_date():
    monday = date(2026, 7, 13)
    assert effective_marker_date(monday, at(monday, 10, 0)) == FRI


def test_slot_rollover_on_friday_is_unchanged():
    assert effective_slot_date(FRI, at(FRI, 16, 0)) == date(2026, 7, 13)
