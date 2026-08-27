from pathlib import Path

ROOT = Path(__file__).resolve().parents[2]
COMPONENT = ROOT / "frontend/src/components/realization-manager-review.tsx"
DAILY = ROOT / "frontend/src/app/(app)/realization/components/DailyRealizationView.tsx"
WEEKLY = ROOT / "frontend/src/app/(app)/realization/page.tsx"


def test_manager_review_uses_human_labels_and_never_neutral():
    source = COMPONENT.read_text(encoding="utf-8")
    assert "VLERËSIMI I PËRGJEGJËSIT" in source
    assert "Pa vërejtje nga përgjegjësi" in source
    assert "✓ Mirë" in source and "⚠ Duhet përmirësim" in source
    assert "NEUTRAL" not in source


def test_each_dimension_saves_independently_with_required_comment():
    source = COMPONENT.read_text(encoding="utf-8")
    assert 'key: "PLANNING"' in source and 'key: "REALIZATION"' in source
    assert "!comment.trim()" in source
    assert 'method: "PUT"' in source and 'method: "DELETE"' in source


def test_daily_and_weekly_render_shared_period_scoped_component():
    daily, weekly = DAILY.read_text(encoding="utf-8"), WEEKLY.read_text(encoding="utf-8")
    assert "payload.period?.id" in daily
    assert "<RealizationManagerReview periodId={periodId}" in daily
    assert "<RealizationManagerReview periodId={data.period.id}" in weekly


def test_ui_uses_manager_name_not_uuid_as_label():
    source = COMPONENT.read_text(encoding="utf-8")
    assert "created_by_name" in source
    assert "created_by_user_id}" not in source
