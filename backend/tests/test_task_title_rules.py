from app.services.task_title_rules import normalize_email_task_title, title_has_eight_am_indicator


def test_em_task_gets_one_0800_prefix() -> None:
    assert normalize_email_task_title("EF: EM TEST") == "08:00 EF: EM TEST"
    assert normalize_email_task_title("08:00 EF: EM TEST") == "08:00 EF: EM TEST"


def test_em_and_literal_time_are_both_0800_indicators() -> None:
    assert title_has_eight_am_indicator("EF: EM TEST")
    assert title_has_eight_am_indicator("EF: 08:00 TEST")
    assert not title_has_eight_am_indicator("EF: EMAIL TEST")
