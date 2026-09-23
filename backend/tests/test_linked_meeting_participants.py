from __future__ import annotations

import uuid
import unittest

from app.models.meeting import MeetingParticipant
from app.services.meeting_participants import add_participants_to_linked_internal_meetings


class _Result:
    def __init__(self, values):
        self.values = list(values)

    def scalars(self):
        return self

    def all(self):
        return list(self.values)


class _FakeDb:
    def __init__(self, results):
        self.results = list(results)
        self.added: list[object] = []

    async def execute(self, _statement):
        return _Result(self.results.pop(0))

    def add(self, value):
        self.added.append(value)


class TestLinkedMeetingParticipants(unittest.IsolatedAsyncioTestCase):
    async def test_new_external_participants_are_added_to_before_and_after_internal_meetings(self) -> None:
        external_id = uuid.uuid4()
        before_id = uuid.uuid4()
        after_id = uuid.uuid4()
        existing_user_id = uuid.uuid4()
        new_user_id = uuid.uuid4()
        actor_id = uuid.uuid4()
        db = _FakeDb([
            [before_id, after_id],
            [(before_id, existing_user_id)],
        ])

        linked_ids = await add_participants_to_linked_internal_meetings(
            db,
            external_meeting_id=external_id,
            participant_ids=[existing_user_id, new_user_id],
            actor_user_id=actor_id,
        )

        participants = [value for value in db.added if isinstance(value, MeetingParticipant)]
        self.assertEqual(linked_ids, [before_id, after_id])
        self.assertEqual(
            {(row.meeting_id, row.user_id) for row in participants},
            {
                (before_id, new_user_id),
                (after_id, existing_user_id),
                (after_id, new_user_id),
            },
        )
        self.assertTrue(all(row.assignment_source == "manual" for row in participants))
        self.assertTrue(all(row.assigned_by_user_id == actor_id for row in participants))

    async def test_linked_participant_sync_is_additive_and_does_not_replace_internal_users(self) -> None:
        linked_id = uuid.uuid4()
        external_user_id = uuid.uuid4()
        db = _FakeDb([
            [linked_id],
            [(linked_id, external_user_id)],
        ])

        await add_participants_to_linked_internal_meetings(
            db,
            external_meeting_id=uuid.uuid4(),
            participant_ids=[external_user_id],
            actor_user_id=uuid.uuid4(),
        )

        self.assertEqual(db.added, [])

    async def test_empty_external_participant_delta_does_not_touch_linked_meetings(self) -> None:
        db = _FakeDb([])

        linked_ids = await add_participants_to_linked_internal_meetings(
            db,
            external_meeting_id=uuid.uuid4(),
            participant_ids=[],
            actor_user_id=uuid.uuid4(),
        )

        self.assertEqual(linked_ids, [])
        self.assertEqual(db.added, [])
