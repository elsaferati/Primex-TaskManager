from app.api.routers.ga_notes import _ga_note_task_title
from app.api.routers.plan_notes import _plan_note_task_title


def test_ga_note_task_title_uses_first_cleaned_line() -> None:
    assert _ga_note_task_title("  First line\n\nsecond   line  ") == "First line"


def test_ga_note_task_title_falls_back_when_note_is_empty() -> None:
    assert _ga_note_task_title(" \n\t ") == "GA/KA note task"


def test_ga_note_task_title_caps_a_long_first_line() -> None:
    source = "a" * 300

    assert _ga_note_task_title(source) == "a" * 100


def test_plan_note_task_title_uses_first_cleaned_line() -> None:
    assert _plan_note_task_title("  Titulli kryesor\n1. Hapi i parë\n2. Hapi i dytë") == "Titulli kryesor"
