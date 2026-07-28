from __future__ import annotations

import unittest
from datetime import date

from app.services.primeflow_report import (
    STATUS_MARKERS, build_report, clean_description, exact_subject, filter_tasks,
    predecessor, previous_working_day, report_subject,
)


class PrimeFlowReportTests(unittest.TestCase):
    def test_previous_working_day_and_subject(self) -> None:
        self.assertEqual(previous_working_day(date(2026, 7, 27)), date(2026, 7, 24))
        self.assertEqual(previous_working_day(date(2026, 7, 28)), date(2026, 7, 27))
        self.assertEqual(report_subject(date(2026, 7, 28), "10:00"), "PrimeFlow 1H – 28.07.2026 – 10:00")

    def test_exact_subject_is_not_fuzzy(self) -> None:
        headers = [{"name": "Subject", "value": "PrimeFlow 1H – 28.07.2026 – 10:00"}]
        self.assertTrue(exact_subject(headers, "PrimeFlow 1H – 28.07.2026 – 10:00"))
        self.assertFalse(exact_subject(headers, "PrimeFlow 1H – 28.07.2026 – 11:00"))

    def test_description_removes_only_technical_tags(self) -> None:
        original = "[[added]]1. Çdo Überprüfung\n\nMiSSpelled TEXT[[/added]]\n[[done]]2. Përfundo[[/done]]"
        self.assertEqual(clean_description(original), "1. Çdo Überprüfung\n\nMiSSpelled TEXT\n2. Përfundo")

    def test_filtering_deduplicates_and_requires_exact_date_slot_and_user(self) -> None:
        base = {"id": "1", "date": "2026-07-28", "slot": "10:00", "employee": "Elsa", "title": "Exact", "status": "TODO"}
        tasks = [base, dict(base), {**base, "id": "2", "date": "2026-07-29"}, {**base, "id": "3", "slot": "11:00"}, {**base, "id": "4", "employee": ""}]
        self.assertEqual(filter_tasks(tasks, date(2026, 7, 28), "10:00"), [base])

    def test_status_sort_numbering_order_and_description_preservation(self) -> None:
        tasks = [
            {"id": "d", "date": "2026-07-28", "slot": "10:00", "employee": "Besa", "title": "Done EXACT", "description": "Zeile 1\n\nZeile 3", "status": "DONE"},
            {"id": "i", "date": "2026-07-28", "slot": "10:00", "employee": "Besa", "title": "in progress exact", "description": "[[added]]Përshkrim[[/added]]", "status": "IN_PROGRESS"},
            {"id": "t", "date": "2026-07-28", "slot": "10:00", "employee": "Besa", "title": "TODO exact", "description": "1. Erst\n2. Zweit", "status": "TODO"},
        ]
        body = build_report({"generated_at": "2026-07-28T08:59:00+02:00", "guardrails": {"truncated": {}}, "items": {"oneH": tasks}}, date(2026, 7, 28), "10:00")
        self.assertLess(body.index(STATUS_MARKERS["IN_PROGRESS"]), body.index(STATUS_MARKERS["TODO"]))
        self.assertLess(body.index(STATUS_MARKERS["TODO"]), body.index(STATUS_MARKERS["DONE"]))
        self.assertIn("1.1 🟡 IN PROGRESS in progress exact", body)
        self.assertIn("Zeile 1\n\nZeile 3", body)
        self.assertIn("1. Erst\n2. Zweit", body)
        self.assertNotIn("[[added]]", body)

    def test_truncation_blocks_report(self) -> None:
        with self.assertRaisesRegex(ValueError, "truncated"):
            build_report({"guardrails": {"truncated": {"oneH": True}}}, date(2026, 7, 28), "10:00")

    def test_section_order_and_backfill_chain(self) -> None:
        body = build_report({"guardrails": {"truncated": {}}, "items": {}}, date(2026, 7, 28), "10:00")
        headings = ["SLOTI 27.07.2026 16:00", "SLOTI 28.07.2026 10:00", "SLOTI 28.07.2026 11:00", "DETYRA PA SLOT", "DETYRAT E BLLOKUT", "P: PERSONALE", "R1 = 1H"]
        positions = [body.index(value) for value in headings]
        self.assertEqual(positions, sorted(positions))
        self.assertEqual(predecessor(date(2026, 7, 28), "10:00"), (date(2026, 7, 27), "16:00"))
        self.assertEqual(predecessor(date(2026, 7, 28), "14:20"), (date(2026, 7, 28), "11:50"))


if __name__ == "__main__":
    unittest.main()
