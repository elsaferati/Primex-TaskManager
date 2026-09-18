from datetime import date
import unittest
from datetime import datetime, timezone
from types import SimpleNamespace
from unittest.mock import AsyncMock, patch
import uuid

from app.services.realization_calculator import MANDATORY_MANUAL_QUESTION_KEYS, build_live_questions
from app.services.realization_checklist import aggregate_daily_answers, apply_checklist_answers
from app.services.realization_ai import _safe_input
from app.api.routers.realization import _daily_checklist_summaries, _latest_question_answers


MONDAY = date(2026, 9, 14)
TUESDAY = date(2026, 9, 15)


def answer(key, value, day=MONDAY, comment=None, revision=1):
    return {
        "id": f"{day}:{key}:{revision}", "question_key": key,
        "value": value, "date": day.isoformat(), "comment": comment,
        "answered_at": f"{day}T10:00:0{revision}+00:00",
        "evidence_ids": [f"evidence-{day}-{revision}"],
    }


class TestDailyChecklistRollup(unittest.TestCase):
    def rollup(self, records, days=None):
        return aggregate_daily_answers(records, expected_dates=days if days is not None else {MONDAY, TUESDAY})

    def test_one_missed_meeting_marks_week_negative_and_keeps_date_comment(self):
        result = self.rollup([
            answer("respected_meetings", True),
            answer("respected_meetings", False, TUESDAY, "Nuk mori pjesë në M3"),
        ])["respected_meetings"]
        self.assertFalse(result["value"])
        self.assertTrue(result["complete"])
        self.assertEqual(result["no_days"], 1)
        self.assertIn("2026-09-15: Nuk mori pjesë në M3", result["comment"])
        self.assertEqual(result["history"][1]["date"], "2026-09-15")

    def test_one_positive_help_occurrence_is_preserved_for_the_week(self):
        result = self.rollup([answer("helped_colleague", True), answer("helped_colleague", False, TUESDAY)])["helped_colleague"]
        self.assertTrue(result["value"])
        self.assertEqual(result["yes_days"], 1)
        self.assertEqual(result["no_days"], 1)

    def test_latest_correction_does_not_double_count_an_old_answer(self):
        result = self.rollup([
            answer("respected_meetings", False),
            answer("respected_meetings", True, revision=2),
            answer("respected_meetings", True, TUESDAY),
        ])["respected_meetings"]
        self.assertTrue(result["value"])
        self.assertEqual(result["answered_days"], 2)
        self.assertEqual(result["no_days"], 0)

    def test_missing_day_is_partial_and_does_not_satisfy_weekly_review(self):
        summaries = self.rollup([answer("helped_colleague", False)])
        facts = {"questions": build_live_questions({})}
        apply_checklist_answers(facts, direct_answers={}, daily_summaries=summaries)
        question = next(item for item in facts["questions"] if item["key"] == "helped_colleague")
        self.assertEqual(question["source_status"], "MANUAL_DAILY_PARTIAL")
        self.assertEqual(question["daily_summary"]["missing_dates"], ["2026-09-15"])
        self.assertIn("helped_colleague", facts["manual_question_completeness"]["missing_keys"])
        self.assertNotIn("helped_colleague", facts["manual_answers"])

    def test_empty_value_is_unfilled_and_does_not_count_as_an_answer(self):
        result = self.rollup([answer("respected_meetings", None), answer("respected_meetings", True, TUESDAY)])["respected_meetings"]
        self.assertTrue(result["value"])
        self.assertEqual(result["answered_days"], 1)
        self.assertEqual(result["missing_dates"], ["2026-09-14"])
        empty = self.rollup([answer("respected_meetings", None)], {MONDAY})["respected_meetings"]
        self.assertIsNone(empty["value"])
        self.assertEqual(empty["missing_dates"], ["2026-09-14"])

    def test_leave_or_future_dates_excluded_by_expected_scope(self):
        result = self.rollup([answer("helped_colleague", True), answer("helped_colleague", False, TUESDAY)], {MONDAY})["helped_colleague"]
        self.assertTrue(result["complete"])
        self.assertEqual(result["answered_days"], 1)
        self.assertEqual(result["expected_days"], 1)

    def test_positive_question_counts_yes_days_and_keeps_comments(self):
        result = self.rollup([
            answer("week_positive", True, comment="Ndihmoi Elzën"),
            answer("week_positive", False, TUESDAY),
        ])["week_positive"]
        self.assertTrue(result["value"])
        self.assertEqual(result["yes_days"], 1)
        self.assertEqual(result["no_days"], 1)
        self.assertIn("Ndihmoi Elzën", result["comment"])

    def test_weekly_manager_override_preserves_original_daily_evidence(self):
        facts = {"questions": build_live_questions({})}
        summaries = self.rollup([answer("respected_meetings", False)], {MONDAY})
        apply_checklist_answers(facts, direct_answers={"respected_meetings": {"value": True, "comment": "Mungesa ishte e konfirmuar"}}, daily_summaries=summaries)
        question = next(item for item in facts["questions"] if item["key"] == "respected_meetings")
        self.assertTrue(question["final_value"])
        self.assertEqual(question["source_status"], "MANUAL_ANSWERED")
        self.assertFalse(question["daily_summary"]["value"])

    def test_complete_rollup_of_all_manual_questions_satisfies_weekly_review(self):
        records = [answer(key, False) for key in MANDATORY_MANUAL_QUESTION_KEYS]
        facts = {"questions": build_live_questions({})}
        apply_checklist_answers(facts, direct_answers={}, daily_summaries=self.rollup(records, {MONDAY}))
        self.assertEqual(facts["manual_question_completeness"]["answered"], 9)
        self.assertTrue(facts["manual_question_completeness"]["complete"])

    def test_ai_receives_dates_comments_and_manual_source_even_when_partial(self):
        facts = {"questions": build_live_questions({})}
        apply_checklist_answers(facts, direct_answers={}, daily_summaries=self.rollup([answer("respected_meetings", False, comment="Mungoi M3")]))
        summary = _safe_input("result", facts)["daily_question_summary"]["respected_meetings"]
        self.assertEqual(summary["missing_dates"], ["2026-09-15"])
        self.assertEqual(summary["history"][0]["comment"], "Mungoi M3")
        self.assertIn("MANUAL", summary["source"].replace("MANAGER", "MANUAL"))


class TestDailyChecklistLoading(unittest.IsolatedAsyncioTestCase):
    async def test_latest_clear_marker_restores_unfilled_state(self):
        result_id = uuid.uuid4()
        rows = [
            SimpleNamespace(
                id=uuid.uuid4(), result_id=result_id, question_key="helped_colleague",
                value_json={"value": True}, answered_at=datetime(2026, 9, 14, 9, tzinfo=timezone.utc),
            ),
            SimpleNamespace(
                id=uuid.uuid4(), result_id=result_id, question_key="helped_colleague",
                value_json={"value": None, "cleared": True}, answered_at=datetime(2026, 9, 14, 10, tzinfo=timezone.utc),
            ),
        ]
        db = SimpleNamespace(
            execute=AsyncMock(
                return_value=SimpleNamespace(
                    scalars=lambda: SimpleNamespace(all=lambda: rows)
                )
            )
        )

        latest = await _latest_question_answers(db, [result_id])

        self.assertNotIn("helped_colleague", latest[result_id])

    async def test_rollup_keeps_people_separate_and_excludes_common_leave(self):
        first, second, department = uuid.uuid4(), uuid.uuid4(), uuid.uuid4()
        first_result = SimpleNamespace(id=uuid.uuid4(), user_id=first)
        second_result = SimpleNamespace(id=uuid.uuid4(), user_id=second)
        period = SimpleNamespace(id=uuid.uuid4(), start_date=MONDAY, end_date=TUESDAY, department_id=department)
        daily_period = SimpleNamespace(id=uuid.uuid4(), start_date=MONDAY)
        now = datetime(2026, 9, 14, 10, tzinfo=timezone.utc)

        def stored(value):
            return SimpleNamespace(id=uuid.uuid4(), value_json={"value": value}, comment="M3", evidence_ids_json=[], answered_by=uuid.uuid4(), answered_at=now, updated_at=now, supersedes_answer_id=None)

        db = SimpleNamespace(execute=AsyncMock(return_value=SimpleNamespace(all=lambda: [(first_result, daily_period), (second_result, daily_period)])))
        with patch("app.api.routers.realization._latest_question_answers", new=AsyncMock(return_value={
            first_result.id: {"respected_meetings": stored(False)},
            second_result.id: {"respected_meetings": stored(True)},
        })):
            results = await _daily_checklist_summaries(
                db, period=period, user_ids=[first, second],
                common_leave={first: SimpleNamespace(days={TUESDAY})},
            )
        self.assertFalse(results[first]["respected_meetings"]["value"])
        self.assertTrue(results[first]["respected_meetings"]["complete"])
        self.assertTrue(results[second]["respected_meetings"]["value"])
        self.assertEqual(results[second]["respected_meetings"]["missing_dates"], ["2026-09-15"])
        statement = db.execute.call_args.args[0]
        query = str(statement)
        self.assertIn("realization_periods.department_id =", query)
        self.assertIn("realization_person_results.user_id IN", query)
        self.assertIn(department, statement.compile().params.values())
