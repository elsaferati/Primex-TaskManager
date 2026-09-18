from pathlib import Path


def test_personal_title_keeps_original_initials_and_all_lines():
    source = (Path(__file__).resolve().parents[2] / "frontend/src/app/(app)/common/page.tsx").read_text(encoding="utf-8")
    assert "const commonPrintPersonalTaskTitle = (entry: { title: string }) => getPlainMarkedText(entry.title).trim()" in source
    personal_branch = source.split('} else if (isPersonalRowId(row.id)) {', 1)[1].split('} else if', 1)[0]
    assert "renderWfcText(commonPrintPersonalTaskTitle(e))" in personal_branch
    assert "renderWfcText(commonPrintTaskTitle(e))" not in personal_branch
    assert 'whiteSpace: "pre-wrap"' in personal_branch
