from app.api.routers.ga_notes import _ga_note_task_title


def test_ga_note_task_title_keeps_full_cleaned_text_when_it_fits() -> None:
    assert _ga_note_task_title("  First line\n\nsecond   line  ") == "First line second line"


def test_ga_note_task_title_falls_back_when_note_is_empty() -> None:
    assert _ga_note_task_title(" \n\t ") == "GA/KA note task"


def test_ga_note_task_title_keeps_long_titles_without_truncation() -> None:
    source = "a" * 300

    assert _ga_note_task_title(source) == source
