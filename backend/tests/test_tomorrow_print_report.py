from io import BytesIO
from datetime import date

from openpyxl import load_workbook

from app.services.tomorrow_print_report import _excel_table_attachment, _html_table, _task_rows


def test_html_table_keeps_grid_styles_inline_for_email_clients() -> None:
    report_html = _html_table(
        [("P", [{"title": "DM/GA: A task"}, {"title": "ER: A task"}], True)]
    )

    assert '<table role="presentation" width="100%" border="1"' in report_html
    assert 'style="width:100%;border-collapse:collapse;table-layout:fixed' in report_html
    assert 'style="border:1px solid #000;padding:5px' in report_html
    assert '<col width="4%"><col width="9%"><col width="14.5%" span="6">' in report_html
    assert 'bgcolor="#D8B4FE"' in report_html
    assert report_html.count('background-color:#D8B4FE') == 1
    assert '<style>' not in report_html


def test_email_table_removes_added_and_done_editor_markers() -> None:
    report_html = _html_table(
        [("1H 10:00", [{"title": "LH: [[added]]New[[/added]] [[done]]completed[[/done]] task"}], False)]
    )

    assert "[[added]]" not in report_html
    assert "[[/added]]" not in report_html
    assert "[[done]]" not in report_html
    assert "[[/done]]" not in report_html
    assert "New completed task" in report_html


def test_downloadable_email_table_uses_clean_task_text() -> None:
    filename, content, mime_type = _excel_table_attachment(
        [("1H 10:00", [{"title": "LH: [[added]]New task[[/added]]"}], False)],
        [("TAK EXT", [{"title": "[[added]]Meeting[[/added]]", "time": "10:00"}], False)],
        date(2026, 8, 14),
    )

    workbook = load_workbook(BytesIO(content))
    values = [str(cell.value or "") for row in workbook.active.iter_rows() for cell in row]
    assert filename == "1H_SHTYPI_2026-08-14.xlsx"
    assert mime_type == "application/vnd.openxmlformats-officedocument.spreadsheetml.sheet"
    assert any("New task" in value for value in values)
    assert any("Meeting 10:00" in value for value in values)
    assert not any("[[added]]" in value or "[[/added]]" in value for value in values)


def test_task_status_colours_apply_to_email_cells_but_ga_personal_stays_purple() -> None:
    report_html = _html_table(
        [
            (
                "1H 10:00",
                [
                    {"title": "TODO task", "status": "TODO"},
                    {"title": "Progress task", "status": "IN_PROGRESS"},
                    {"title": "Waiting task", "status": "WAITING_CONFIRMATION"},
                    {"title": "Done task", "status": "DONE"},
                ],
                False,
            ),
            ("P", [{"title": "GA: Personal task", "status": "TODO"}], True),
        ]
    )

    assert 'bgcolor="#FFC4ED"' in report_html
    assert 'bgcolor="#FFFF00"' in report_html
    assert 'bgcolor="#FFEDD5"' in report_html
    assert 'bgcolor="#C4FDC4"' in report_html
    assert 'bgcolor="#D8B4FE"' in report_html


def test_excel_status_colours_match_email_and_ga_personal_overrides_status() -> None:
    _, content, _ = _excel_table_attachment(
        [
            ("1H 10:00", [{"title": "TODO task", "status": "TODO"}, {"title": "Progress", "status": "IN_PROGRESS"}], False),
            ("P", [{"title": "GA: Personal", "status": "DONE"}], True),
        ],
        [],
        date(2026, 8, 14),
    )

    sheet = load_workbook(BytesIO(content)).active
    assert sheet["C4"].fill.fgColor.rgb.endswith("FFC4ED")
    assert sheet["D4"].fill.fgColor.rgb.endswith("FFFF00")
    assert sheet["C5"].fill.fgColor.rgb.endswith("D8B4FE")


def test_done_tasks_are_last_within_each_printed_row() -> None:
    rows = _task_rows(
        {
            "oneH": [
                {"title": "Done first alphabetically", "date": "2026-08-14", "status": "DONE", "oneHReportSlot": "10:00"},
                {"title": "Todo later alphabetically", "date": "2026-08-14", "status": "TODO", "oneHReportSlot": "10:00"},
            ]
        },
        date(2026, 8, 14),
    )

    first_slot_items = rows[0][1]
    assert [item["title"] for item in first_slot_items] == ["Todo later alphabetically", "Done first alphabetically"]


def test_non_daily_or_weekly_meetings_get_blue_borders_in_email_and_excel() -> None:
    meetings = [
        ("TAK EXT", [
            {"title": "One-off", "time": "10:00", "recurrence_type": "none"},
            {"title": "Weekly", "time": "11:00", "recurrence_type": "weekly"},
        ], False)
    ]

    report_html = _html_table(meetings, meeting=True)
    assert "border:2px solid #2563EB" in report_html
    assert report_html.count("border:2px solid #2563EB") == 1

    _, content, _ = _excel_table_attachment([], meetings, date(2026, 8, 14))
    sheet = load_workbook(BytesIO(content)).active
    assert sheet["C6"].border.left.color.rgb.endswith("2563EB")
    assert sheet["D6"].border.left.style == "thin"
