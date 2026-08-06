import unittest
import uuid

from app.api.routers.tasks import _all_question_assignees_done


class TestQuestionTaskCompletion(unittest.TestCase):
    def test_one_users_done_does_not_complete_shared_task(self) -> None:
        question_id = uuid.uuid4()
        first_user_id = uuid.uuid4()
        second_user_id = uuid.uuid4()

        self.assertFalse(
            _all_question_assignees_done(
                {question_id},
                {first_user_id, second_user_id},
                {(question_id, first_user_id)},
            )
        )

    def test_shared_task_completes_after_every_assignee_is_done(self) -> None:
        question_ids = {uuid.uuid4(), uuid.uuid4()}
        user_ids = {uuid.uuid4(), uuid.uuid4()}
        done_pairs = {
            (question_id, user_id)
            for question_id in question_ids
            for user_id in user_ids
        }

        self.assertTrue(
            _all_question_assignees_done(question_ids, user_ids, done_pairs)
        )

    def test_empty_question_or_assignee_sets_never_complete_task(self) -> None:
        self.assertFalse(_all_question_assignees_done(set(), {uuid.uuid4()}, set()))
        self.assertFalse(_all_question_assignees_done({uuid.uuid4()}, set(), set()))


if __name__ == "__main__":
    unittest.main()
