from app.services.tomorrow_print_report import _html_table


def test_html_table_keeps_grid_styles_inline_for_email_clients() -> None:
    report_html = _html_table(
        [("P", [{"title": "DM/GA: A task"}, {"title": "ER: A task"}], True)]
    )

    assert '<table role="presentation" width="100%" border="1"' in report_html
    assert 'style="width:100%;border-collapse:collapse;table-layout:fixed' in report_html
    assert 'style="border:1px solid #000;padding:5px' in report_html
    assert '<col width="4%"><col width="9%"><col width="14.5%" span="6">' in report_html
    assert 'bgcolor="#f3e8ff"' in report_html
    assert report_html.count('background-color:#f3e8ff') == 1
    assert '<style>' not in report_html
