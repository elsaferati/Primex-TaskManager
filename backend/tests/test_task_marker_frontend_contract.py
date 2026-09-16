from pathlib import Path


ROOT = Path(__file__).resolve().parents[2]


def test_daily_report_api_returns_the_saved_task_marker():
    source = (ROOT / "backend/app/api/routers/reports.py").read_text(encoding="utf-8")
    assert "one_h_marker=t.one_h_marker" in source


def test_every_department_my_view_renders_the_same_task_marker():
    for department in (
        "development",
        "graphic-design",
        "project-content-manager",
        "finance",
    ):
        source = (
            ROOT
            / f"frontend/src/app/(app)/departments/{department}/department-kanban.tsx"
        ).read_text(encoding="utf-8")
        assert "TaskOneHMarkerEditor" in source, department
        assert "task.one_h_marker" in source, department


def test_symbol_filters_include_all_marked_tasks_in_1h_and_px_notes():
    one_h = (ROOT / "frontend/src/app/(app)/tomorrow-print-report/page.tsx").read_text(encoding="utf-8")
    px_notes = (ROOT / "frontend/src/app/(app)/ga-ka-notes/page.tsx").read_text(encoding="utf-8")
    for source in (one_h, px_notes):
        assert 'value="with"' in source
        assert "All with symbols" in source
        assert '"with" ? Boolean(marker)' in source or 'oneHMarkerFilter === "with"' in source


def test_report_generation_buttons_show_progress():
    report_pages = (
        "frontend/src/app/(app)/tomorrow-print-report/page.tsx",
        "frontend/src/app/(app)/morning-report/page.tsx",
        "frontend/src/app/(app)/after-break-report/page.tsx",
        "frontend/src/app/(app)/meetings-report/page.tsx",
        "frontend/src/app/(app)/end-week-bz-report/page.tsx",
        "frontend/src/app/(app)/reports/weekly-planning-audit/page.tsx",
    )
    for relative_path in report_pages:
        source = (ROOT / relative_path).read_text(encoding="utf-8")
        assert "Generating..." in source, relative_path
        assert "animate-spin" in source, relative_path


def test_primary_task_lists_and_details_render_the_same_task_marker():
    paths = (
        "frontend/src/app/(app)/open-tasks/page.tsx",
        "frontend/src/app/(app)/monthly-planner/page.tsx",
        "frontend/src/app/(app)/weekly-planner/page.tsx",
        "frontend/src/app/(app)/waiting-confirmation-ga/page.tsx",
        "frontend/src/app/(app)/tasks/[id]/page.tsx",
        "frontend/src/app/(app)/projects/[id]/page.tsx",
        "frontend/src/app/(app)/admin-tasks/page.tsx",
        "frontend/src/components/command-palette.tsx",
    )
    for relative_path in paths:
        source = (ROOT / relative_path).read_text(encoding="utf-8")
        assert "TaskOneHMarker" in source, relative_path
        assert "one_h_marker" in source, relative_path


def test_task_search_returns_the_saved_marker():
    schema = (ROOT / "backend/app/schemas/search.py").read_text(encoding="utf-8")
    router = (ROOT / "backend/app/api/routers/search.py").read_text(encoding="utf-8")
    assert "one_h_marker: str | None = None" in schema
    assert "one_h_marker=t.one_h_marker" in router


def test_m1_m2_m3_task_tables_render_the_saved_marker():
    source = (ROOT / "backend/app/services/meetings_report.py").read_text(encoding="utf-8")
    assert "one_h_marker_symbol(getattr(task, \"one_h_marker\", None))" in source


def test_common_view_personal_owner_priority_is_genti_then_ka_then_ga():
    source = (ROOT / "frontend/src/app/(app)/common/page.tsx").read_text(encoding="utf-8")
    function = source[source.index("const getPersonalTaskGroup"):source.index("const getPersonalRowGroup")]
    assert function.index('["GENT", "GENTI", "GT"]') < function.index('participants.includes("KA")')
    assert function.index('participants.includes("KA")') < function.index('participants.includes("GA")')


def test_symbol_views_refresh_when_the_user_returns_to_them():
    paths = (
        "frontend/src/app/(app)/common/page.tsx",
        "frontend/src/app/(app)/ga-ka-notes/page.tsx",
        "frontend/src/app/(app)/tomorrow-print-report/page.tsx",
        "frontend/src/app/(app)/departments/development/department-kanban.tsx",
        "frontend/src/app/(app)/departments/graphic-design/department-kanban.tsx",
        "frontend/src/app/(app)/departments/project-content-manager/department-kanban.tsx",
        "frontend/src/app/(app)/departments/finance/department-kanban.tsx",
    )
    for relative_path in paths:
        source = (ROOT / relative_path).read_text(encoding="utf-8")
        assert "useVisibleRefresh" in source, relative_path
