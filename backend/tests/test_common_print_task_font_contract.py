from pathlib import Path


ROOT = Path(__file__).resolve().parents[2]


def test_common_view_print_makes_only_task_titles_larger():
    source = (ROOT / "frontend/src/app/(app)/common/page.tsx").read_text(encoding="utf-8")

    assert '<span class="print-task-title">${taskNumber}. ${commonPrintTitleHtml(title)}</span>' in source
    assert ".print-task-title { font-size:17px; line-height:1.25; }" in source
    assert "table { width: 100%; border-collapse: collapse; table-layout: fixed; font-size: 9px;" in source
    assert ".print-task-cell { position:relative; padding-bottom:27px; }" in source
