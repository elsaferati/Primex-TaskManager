import uuid
from types import SimpleNamespace

from app.services.realization_daily import _effective_task_comment_map


def test_daily_rlz_comment_overrides_general_task_comment():
    task_id = uuid.uuid4()
    user_id = uuid.uuid4()
    general = SimpleNamespace(task_id=task_id, user_id=user_id, comment="Koment i vjeter")
    daily = SimpleNamespace(task_id=task_id, user_id=user_id, comment="Arsyeja e sotme")

    comments = _effective_task_comment_map([general], [daily])

    assert comments[(task_id, user_id)] == "Arsyeja e sotme"


def test_general_comment_remains_fallback_when_daily_comment_is_null():
    task_id = uuid.uuid4()
    user_id = uuid.uuid4()
    general = SimpleNamespace(task_id=task_id, user_id=user_id, comment="Koment ekzistues")
    daily = SimpleNamespace(task_id=task_id, user_id=user_id, comment=None)

    comments = _effective_task_comment_map([general], [daily])

    assert comments[(task_id, user_id)] == "Koment ekzistues"


def test_empty_daily_comment_intentionally_counts_as_missing():
    task_id = uuid.uuid4()
    user_id = uuid.uuid4()
    general = SimpleNamespace(task_id=task_id, user_id=user_id, comment="Koment ekzistues")
    daily = SimpleNamespace(task_id=task_id, user_id=user_id, comment="   ")

    comments = _effective_task_comment_map([general], [daily])

    assert comments[(task_id, user_id)] == ""
