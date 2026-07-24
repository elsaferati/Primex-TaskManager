from app.api.routers.exports import _open_task_wrapped_line_count


def test_open_task_wrapped_line_count_accounts_for_column_width() -> None:
    title = "AT/OH:EF/RA: ASC: DEF KO1/KO2/KOF PER KUZHINA (CLAIMS)"

    assert _open_task_wrapped_line_count(title, 44) == 2


def test_open_task_wrapped_line_count_accounts_for_explicit_newlines() -> None:
    title = "First line\nSecond line\nThird line"

    assert _open_task_wrapped_line_count(title, 44) == 3
