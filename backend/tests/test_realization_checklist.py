from datetime import date
import unittest
from datetime import datetime, timezone
from types import SimpleNamespace
from unittest.mock import AsyncMock, patch
import uuid

from app.services.realization_calculator import (
    MANDATORY_MANUAL_QUESTION_KEYS,
    build_daily_questions_from_live,
    build_live_questions,
)


def test_daily_automatic_questions_use_the_same_metrics_as_the_live_table():
    stored = {
        "daily_planned_count": 7,
        "daily_completed_count": 3,
        "questions": build_live_questions({"date": "2026-09-18"}),
    }
    live_person = {
        "metrics": {
            "original_planned_count": 6,
            "planned_completed_today_count": 2,
            "additional_count": 7,
            "additional_completed_count": 3,
            "additional_in_progress_count": 2,
            "additional_no_progress_count": 2,
            "in_progress_count": 0,
            "no_progress_count": 1,
        },
        "tasks": [
            {"task_id": "planned", "in_original_plan": True, "source_type": "project"},
            {"task_id": "extra", "in_original_plan": False, "source_type": "fast"},
        ],
    }

    questions = {
        question["key"]: question
        for question in build_daily_questions_from_live(stored, live_person)
    }

    assert questions["plan_completed"]["auto_value"] == {
        "answer": False,
        "planned": 6,
        "completed": 2,
        "remaining": 4,
    }
    assert questions["new_tasks_added"]["auto_value"] == {
        "yes": True,
        "total": 7,
        "completed": 3,
        "in_progress": 2,
        "todo": 2,
        "postponed": 0,
    }
    assert questions["approved_postponement"]["source_status"] == "MANUAL_UNANSWERED"
    assert questions["approved_postponement"]["auto_value"] == {
        "approved": 0,
        "unapproved": 0,
    }
    assert questions["extra_engagement"]["source_status"] == "AUTO"
    assert questions["extra_engagement"]["auto_value"] == {
        "answer": True,
        "total": 7,
        "completed": 3,
        "in_progress": 2,
        "no_progress": 2,
    }
from app.models.realization import RealizationPersonResult
from app.services.realization_checklist import apply_checklist_answers
from app.api.routers.realization import (
    _latest_question_answers,
    _weekly_answer_target,
    _weekly_manual_answers,
)


MONDAY = date(2026, 9, 14)
TUESDAY = date(2026, 9, 15)


class TestWeeklyChecklistAnswers(unittest.TestCase):
    def test_one_answer_per_question_drives_the_whole_week(self):
        facts = {"questions": build_live_questions({})}
        apply_checklist_answers(facts, direct_answers={
            "respected_meetings": {"value": False, "comment": "Mungoi M3 të martën"},
        })
        question = next(item for item in facts["questions"] if item["key"] == "respected_meetings")
        self.assertIs(question["final_value"], False)
        self.assertEqual(question["manager_comment"], "Mungoi M3 të martën")
        self.assertEqual(question["source_status"], "MANUAL_ANSWERED")
        self.assertEqual(facts["manual_answers"]["respected_meetings"]["value"], False)

    def test_unanswered_question_blocks_weekly_review(self):
        facts = {"questions": build_live_questions({})}
        apply_checklist_answers(facts, direct_answers={})
        question = next(item for item in facts["questions"] if item["key"] == "helped_colleague")
        self.assertEqual(question["source_status"], "MANUAL_UNANSWERED")
        self.assertIn("helped_colleague", facts["manual_question_completeness"]["missing_keys"])
        self.assertNotIn("helped_colleague", facts["manual_answers"])

    def test_all_manual_answers_satisfy_weekly_review(self):
        facts = {"questions": build_live_questions({})}
        apply_checklist_answers(facts, direct_answers={
            key: {"value": False, "comment": None} for key in MANDATORY_MANUAL_QUESTION_KEYS
        })
        self.assertEqual(facts["manual_question_completeness"]["answered"], 9)
        self.assertTrue(facts["manual_question_completeness"]["complete"])

    def test_automatic_questions_are_never_overwritten_by_manual_answers(self):
        facts = {"questions": build_live_questions({})}
        apply_checklist_answers(facts, direct_answers={"plan_completed": {"value": True}})
        question = next(item for item in facts["questions"] if item["key"] == "plan_completed")
        self.assertNotEqual(question["source_status"], "MANUAL_ANSWERED")
        self.assertNotIn("plan_completed", facts["manual_answers"])


class TestWeeklyChecklistLoading(unittest.IsolatedAsyncioTestCase):
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

    async def test_a_daily_view_reads_the_weekly_answers_of_each_person(self):
        first, second, department = uuid.uuid4(), uuid.uuid4(), uuid.uuid4()
        first_result = SimpleNamespace(id=uuid.uuid4(), user_id=first)
        second_result = SimpleNamespace(id=uuid.uuid4(), user_id=second)
        daily = SimpleNamespace(id=uuid.uuid4(), period_type="DAILY", start_date=MONDAY, end_date=MONDAY, department_id=department)
        weekly = SimpleNamespace(id=uuid.uuid4(), period_type="WEEKLY", department_id=department)
        now = datetime(2026, 9, 14, 10, tzinfo=timezone.utc)

        def stored(value):
            return SimpleNamespace(id=uuid.uuid4(), value_json={"value": value}, comment="M3", evidence_ids_json=[], answered_by=uuid.uuid4(), answered_at=now, updated_at=now, supersedes_answer_id=None)

        db = SimpleNamespace(execute=AsyncMock(return_value=SimpleNamespace(
            scalars=lambda: SimpleNamespace(all=lambda: [first_result, second_result])
        )))
        with patch("app.api.routers.realization.find_weekly_scope_period", new=AsyncMock(return_value=weekly)), \
             patch("app.api.routers.realization._latest_question_answers", new=AsyncMock(return_value={
                 first_result.id: {"respected_meetings": stored(False)},
                 second_result.id: {"respected_meetings": stored(True)},
             })):
            results = await _weekly_manual_answers(db, period=daily, user_ids=[first, second])
        self.assertFalse((results[first]["respected_meetings"].value_json)["value"])
        self.assertTrue((results[second]["respected_meetings"].value_json)["value"])
        statement = db.execute.call_args.args[0]
        self.assertIn("realization_person_results.user_id IN", str(statement))
        self.assertIn(weekly.id, statement.compile().params.values())

    async def test_answering_from_a_day_creates_and_targets_the_weekly_result(self):
        department, user_id = uuid.uuid4(), uuid.uuid4()
        daily = SimpleNamespace(id=uuid.uuid4(), period_type="DAILY", start_date=TUESDAY, department_id=department)
        weekly = SimpleNamespace(id=uuid.uuid4(), period_type="WEEKLY", department_id=department, status="OPEN")
        daily_result = SimpleNamespace(id=uuid.uuid4(), user_id=user_id, department_id=department)
        added = []
        db = SimpleNamespace(
            execute=AsyncMock(return_value=SimpleNamespace(scalar_one_or_none=lambda: None)),
            add=added.append,
            flush=AsyncMock(),
        )
        with patch("app.api.routers.realization.ensure_weekly_scope_period", new=AsyncMock(return_value=weekly)):
            target_period, target_result = await _weekly_answer_target(
                db, period=daily, result=daily_result, actor_id=uuid.uuid4()
            )
        self.assertIs(target_period, weekly)
        self.assertIsInstance(target_result, RealizationPersonResult)
        self.assertEqual(target_result.period_id, weekly.id)
        self.assertEqual(target_result.user_id, user_id)
        self.assertEqual(added, [target_result])

    async def test_answering_from_the_weekly_view_stays_on_its_own_result(self):
        weekly = SimpleNamespace(id=uuid.uuid4(), period_type="WEEKLY", department_id=uuid.uuid4(), status="OPEN")
        weekly_result = SimpleNamespace(id=uuid.uuid4(), user_id=uuid.uuid4(), department_id=None)
        db = SimpleNamespace(execute=AsyncMock(), add=lambda value: self.fail("no result should be created"), flush=AsyncMock())
        with patch("app.api.routers.realization.ensure_weekly_scope_period", new=AsyncMock(return_value=weekly)):
            target_period, target_result = await _weekly_answer_target(
                db, period=weekly, result=weekly_result, actor_id=uuid.uuid4()
            )
        self.assertIs(target_period, weekly)
        self.assertIs(target_result, weekly_result)
