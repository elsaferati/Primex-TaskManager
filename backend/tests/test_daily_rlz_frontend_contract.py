from pathlib import Path


ROOT = Path(__file__).resolve().parents[2]
PANEL = (ROOT / "frontend/src/components/daily-rlz-panel.tsx").read_text(encoding="utf-8")
VIEW = (ROOT / "frontend/src/app/(app)/realization/components/DailyRealizationView.tsx").read_text(encoding="utf-8")
MARKUP = (ROOT / "frontend/src/lib/note-markup.tsx").read_text(encoding="utf-8")


def test_close_day_uses_existing_authoritative_sequence_and_typed_comment():
    assert "/reports/daily-rlz-compliance" in PANEL
    assert "/realization/daily/prepare" in PANEL
    assert "/close-day" in PANEL
    assert "daily_comment: dailyComment.trim()" in PANEL
    assert "Daily Report My View" not in PANEL
    for label in ("Mbyll ditën", "Rimbyll ditën", "Mbyll përsëri ditën", "DITA NUK MUND TË MBYLLET"):
        assert label in PANEL


def test_daily_task_presentation_uses_px_notes_component_without_flattening():
    assert "MarkedTaskBlock" in VIEW
    assert "ordinal={index+1}" in VIEW
    assert '.replace(/\\s+/g, " ")' not in VIEW
    assert "renderParsedMarkedRange" in MARKUP
    assert "getNoteMarkClass" in MARKUP
    assert "whitespace-pre-wrap" in MARKUP


def test_manager_review_is_human_and_backend_authoritative():
    for label in ("SHQYRTO SHTYRJEN", "Shqyrto", "APROVO", "REFUZO", "Arsyeja e stafit", "Komenti i stafit"):
        assert label in VIEW
    assert 'status:adjustmentDecision' in VIEW
    assert 'comment:adjustmentComment.trim()||null' in VIEW
    assert "await load(true)" in VIEW
    assert ">Vendos<" not in VIEW
