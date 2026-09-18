from types import SimpleNamespace
from uuid import uuid4

import pytest

from app.schemas.ga_note import GaNoteTaskAssigneeStateUpdate, GaNoteTaskBundleUpdate
from app.models.enums import TaskStatus
from app.services.task_marker import note_bundle_marker_update, one_h_marker_label


def _task(assignee_id, marker):
    return SimpleNamespace(assigned_to=assignee_id, one_h_marker=marker, is_active=True)


def test_top_level_note_symbol_is_the_shared_symbol():
    assignee_id = uuid4()
    payload = GaNoteTaskBundleUpdate(one_h_marker="QUESTION")
    changed, marker = note_bundle_marker_update(
        SimpleNamespace(one_h_marker=None), payload, [_task(assignee_id, None)]
    )
    assert (changed, marker) == (True, "QUESTION")


def test_assignee_symbol_edit_updates_the_shared_symbol():
    assignee_id = uuid4()
    payload = GaNoteTaskBundleUpdate(
        assignee_states=[
            GaNoteTaskAssigneeStateUpdate(
                assignee_id=assignee_id,
                status=TaskStatus.TODO,
                one_h_marker="GENT",
            )
        ]
    )
    changed, marker = note_bundle_marker_update(
        SimpleNamespace(one_h_marker=None), payload, [_task(assignee_id, None)]
    )
    assert (changed, marker) == (True, "GENT")


def test_clearing_symbol_is_a_shared_update():
    assignee_id = uuid4()
    payload = GaNoteTaskBundleUpdate(one_h_marker=None)
    changed, marker = note_bundle_marker_update(
        SimpleNamespace(one_h_marker="KA"), payload, [_task(assignee_id, "KA")]
    )
    assert changed is True
    assert marker is None


def test_changing_only_symbol_comment_updates_the_shared_marker_bundle():
    assignee_id = uuid4()
    payload = GaNoteTaskBundleUpdate(
        one_h_marker="MONITOR",
        one_h_marker_comment="Needs a second check",
    )
    changed, marker = note_bundle_marker_update(
        SimpleNamespace(one_h_marker="MONITOR", one_h_marker_comment="Old comment"),
        payload,
        [_task(assignee_id, "MONITOR")],
    )
    assert (changed, marker) == (True, "MONITOR")


def test_conflicting_assignee_symbols_are_rejected():
    first, second = uuid4(), uuid4()
    payload = GaNoteTaskBundleUpdate(
        assignee_states=[
            GaNoteTaskAssigneeStateUpdate(
                assignee_id=first, status=TaskStatus.TODO, one_h_marker="KA"
            ),
            GaNoteTaskAssigneeStateUpdate(
                assignee_id=second, status=TaskStatus.TODO, one_h_marker="GENT"
            ),
        ]
    )
    with pytest.raises(ValueError, match="one symbol"):
        note_bundle_marker_update(
            SimpleNamespace(one_h_marker=None),
            payload,
            [_task(first, None), _task(second, None)],
        )


def test_weekly_planner_marker_label_preserves_ga_parentheses():
    assert one_h_marker_label("M2_M3") == "M2/M3"
    assert one_h_marker_label("QUESTION", True) == "(?)"
