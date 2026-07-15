from datetime import date, datetime

from app.services.one_h_slots import effective_slot_date


# Mon 2026-07-06 .. Sun 2026-07-12
MON = date(2026, 7, 6)
TUE = date(2026, 7, 7)
FRI = date(2026, 7, 10)
SAT = date(2026, 7, 11)
SUN = date(2026, 7, 12)


def at(day: date, hour: int, minute: int = 0) -> datetime:
    return datetime(day.year, day.month, day.day, hour, minute)


def test_today_before_1600_stays_today():
    assert effective_slot_date(MON, at(MON, 15, 59)) == MON


def test_today_at_1600_rolls_to_next_working_day():
    assert effective_slot_date(MON, at(MON, 16, 0)) == TUE


def test_today_after_1600_rolls_to_next_working_day():
    assert effective_slot_date(MON, at(MON, 18, 30)) == TUE


def test_friday_after_1600_rolls_to_monday():
    assert effective_slot_date(FRI, at(FRI, 16, 0)) == date(2026, 7, 13)


def test_saturday_after_1600_rolls_to_monday():
    assert effective_slot_date(SAT, at(SAT, 16, 0)) == date(2026, 7, 13)


def test_sunday_after_1600_rolls_to_monday():
    assert effective_slot_date(SUN, at(SUN, 17, 0)) == date(2026, 7, 13)


def test_past_date_is_unchanged_even_after_1600():
    assert effective_slot_date(MON, at(TUE, 17, 0)) == MON


def test_future_date_is_unchanged():
    assert effective_slot_date(FRI, at(MON, 17, 0)) == FRI
