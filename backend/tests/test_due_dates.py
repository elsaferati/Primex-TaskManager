import unittest
from datetime import date, datetime, timezone

from app.services.due_dates import getMonthlyDueDate, getMonthlyDueDateVanilla


class TestMonthlyDueDate(unittest.TestCase):
    def test_february_non_leap_year(self) -> None:
        due_date = getMonthlyDueDate(date(2023, 2, 10), "UTC")
        self.assertEqual(due_date, date(2023, 2, 28))

    def test_february_leap_year(self) -> None:
        due_date = getMonthlyDueDate(date(2024, 2, 10), "UTC")
        self.assertEqual(due_date, date(2024, 2, 29))

    def test_last_day_sunday_moves_to_friday(self) -> None:
        # April 2023 ends on Sunday (2023-04-30), should move to Friday 2023-04-28.
        due_date = getMonthlyDueDate(date(2023, 4, 1), "UTC")
        self.assertEqual(due_date, date(2023, 4, 28))

    def test_last_day_not_sunday_no_change(self) -> None:
        due_date = getMonthlyDueDate(date(2023, 3, 15), "UTC")
        self.assertEqual(due_date, date(2023, 3, 31))

    def test_timezone_conversion(self) -> None:
        # 2023-03-01 01:00 UTC is 2023-02-28 in America/New_York.
        ref = datetime(2023, 3, 1, 1, 0, tzinfo=timezone.utc)
        due_date = getMonthlyDueDate(ref, "America/New_York")
        self.assertEqual(due_date, date(2023, 2, 28))

    def test_vanilla(self) -> None:
        due_date = getMonthlyDueDateVanilla(date(2023, 5, 20))
        self.assertEqual(due_date, date(2023, 5, 31))


if __name__ == "__main__":
    unittest.main()
