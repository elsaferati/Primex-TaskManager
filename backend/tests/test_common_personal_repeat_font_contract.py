from pathlib import Path


def test_repeated_personal_ga_font_overrides_purple_card_text_color():
    source = (Path(__file__).resolve().parents[2] / "frontend/src/app/(app)/common/page.tsx").read_text(encoding="utf-8")
    selector = ".week-table-entry.personal-ga-task.repeat-task-muted"
    assert source.index(selector) > source.index("background: #d8b4fe !important")
    rule = source[source.index(selector):].split("}", 1)[0]
    assert "color: #9ca3af !important" in rule
    assert "background:" not in rule
    branch = source.split('} else if (isPersonalRowId(row.id)) {', 1)[1].split('} else if', 1)[0]
    assert "repeatedTaskClassName(e, iso)" in branch
