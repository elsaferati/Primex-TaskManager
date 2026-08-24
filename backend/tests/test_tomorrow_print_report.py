from io import BytesIO
from datetime import date

from openpyxl import load_workbook

from app.services.tomorrow_print_report import _excel_table_attachment, _html_table, _one_h_checklists_html, _task_rows


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


def test_task_grid_uses_light_dividers_inside_a_slot_and_bold_slot_labels() -> None:
    report_html = _html_table(
        [("BLL", [{"title": f"Task {index}"} for index in range(7)], False)]
    )

    assert "border-top:2px solid #111827" in report_html
    assert "border-top:1px solid #cbd5e1" in report_html
    assert 'style="border:1px solid #000;padding:5px;vertical-align:top;text-align:left;overflow-wrap:anywhere;word-break:break-word;font-weight:700;border-top:2px solid #111827">BLL</th>' in report_html


def test_one_h_checklists_render_side_by_side_before_the_task_grid() -> None:
    checklists_html = _one_h_checklists_html()

    assert 'data-one-h-checklist-columns="true"' in checklists_html
    assert 'width="50%"' in checklists_html
    assert "PYETJET PER 1H - BORD" in checklists_html
    assert "STAFF - HAPAT PER 1H" in checklists_html
    assert "Slotin paraprak/aktual" in checklists_html
    assert 'data-board-checklist-columns="true"' in checklists_html
    assert "7. Done? / Strikes? / Notes te reja?" in checklists_html
    assert "8. Strikes?" not in checklists_html
    assert "Share screen side by side DET/REZULTATIN" in checklists_html

    _, content, _ = _excel_table_attachment([], [], date(2026, 8, 14))
    sheet = load_workbook(BytesIO(content)).active
    assert sheet["A3"].value == "STAFF - HAPAT PER 1H"
    assert sheet["E3"].value == "PYETJET PER 1H - BORD"
    assert sheet["A4"].value == "1. Hap doc dhe det"
    assert sheet["E4"].value == "1. Slotin paraprak/aktual"
    assert sheet["G4"].value == "5. A kryhet kete jave?"
    assert sheet["G6"].value == "7. Done? / Strikes? / Notes te reja?"


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


def test_deadline_and_0800_tasks_are_highlighted_in_email_and_excel() -> None:
    tasks = [
        {"title": "Deadline task", "status": "TODO", "is_deadline_important": True},
        {"title": "08:00 task", "status": "TODO"},
    ]
    report_html = _html_table([("DEADLINE / 08:00", tasks, False)])

    assert 'bgcolor="#DC2626"' in report_html
    assert "border:2px solid #DC2626" in report_html

    _, content, _ = _excel_table_attachment([("DEADLINE / 08:00", tasks, False)], [], date(2026, 8, 14))
    sheet = load_workbook(BytesIO(content)).active
    assert sheet["C11"].fill.fgColor.rgb.endswith("DC2626")
    assert sheet["C11"].font.color.type == "rgb"
    assert sheet["C11"].font.color.rgb.endswith("FFFFFF")
    assert sheet["D11"].border.left.color.rgb.endswith("DC2626")


def test_deadline_and_0800_tasks_have_a_dedicated_printed_row() -> None:
    rows = _task_rows(
        {
            "important": [
                {"title": "Deadline task", "date": "2026-08-14", "is_deadline_important": True},
                {"title": "08:00 task", "date": "2026-08-14"},
            ]
        },
        date(2026, 8, 14),
    )

    important_row = next(row for row in rows if row[0] == "DEADLINE / 08:00")
    assert [item["title"] for item in important_row[1]] == ["Deadline task", "08:00 task"]


def test_personal_row_label_has_a_gap_and_uses_compact_single_line_schedules() -> None:
    rows = _task_rows({}, date(2026, 8, 14))
    personal_row = next(row for row in rows if row[2])

    assert personal_row[0] == "P:\nGA 08:15 / 13:15\n\nDV/LH 10:15 / 14:30"
    report_html = _html_table([personal_row])
    assert "font-size:10px" in report_html
    assert "GA 08:15 / 13:15<br><br>DV/LH 10:15 / 14:30" in report_html


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
    assert sheet["C11"].fill.fgColor.rgb.endswith("FFC4ED")
    assert sheet["D11"].fill.fgColor.rgb.endswith("FFFF00")
    assert sheet["C12"].fill.fgColor.rgb.endswith("D8B4FE")


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
    assert sheet["C13"].border.left.color.rgb.endswith("2563EB")
    assert sheet["D13"].border.left.style == "thin"
