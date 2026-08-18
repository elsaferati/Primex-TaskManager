from app.api.routers.ga_notes import _ga_note_task_title
from app.api.routers.plan_notes import _plan_note_task_title


def test_ga_note_task_title_keeps_the_complete_note() -> None:
    assert _ga_note_task_title("  First line\n\nsecond   line  ") == "First line\n\nsecond   line"


def test_ga_note_task_title_falls_back_when_note_is_empty() -> None:
    assert _ga_note_task_title(" \n\t ") == "GA/KA note task"


def test_ga_note_task_title_does_not_truncate_long_content() -> None:
    source = "a" * 300

    assert _ga_note_task_title(source) == source


def test_plan_note_task_title_keeps_the_complete_note() -> None:
    source = "  Titulli kryesor\n1. Hapi i parë\n2. Hapi i dytë"

    assert _plan_note_task_title(source) == source.strip()
