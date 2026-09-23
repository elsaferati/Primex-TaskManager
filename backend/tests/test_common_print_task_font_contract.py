from pathlib import Path


ROOT = Path(__file__).resolve().parents[2]


def test_common_view_print_lowers_task_text_and_enlarges_meeting_titles():
    source = (ROOT / "frontend/src/app/(app)/common/page.tsx").read_text(encoding="utf-8")

    assert '<span class="print-task-title">${taskNumber}. ${commonPrintTitleHtml(title)}</span>' in source
    assert ".print-task-title { font-size:17px; line-height:1.25; }" in source
    assert '.print-task-cell { position:relative; padding-top:8px; padding-bottom:27px; }' in source
    assert '.print-meeting-cell { padding-top:8px; font-size:13px; line-height:1.3; }' in source
    assert 'padding: 2px 0 0;' in source
    assert "table { width: 100%; border-collapse: collapse; table-layout: fixed; font-size: 9px;" in source
