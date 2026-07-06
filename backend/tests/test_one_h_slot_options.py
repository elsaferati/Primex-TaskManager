from app.api.routers.tasks import _normalize_one_h_report_slot


def test_1600_is_a_valid_slot():
    assert _normalize_one_h_report_slot("16:00") == "16:00"


def test_existing_slots_still_valid():
    for slot in ("10:00", "11:00", "11:50", "14:20"):
        assert _normalize_one_h_report_slot(slot) == slot


def test_unknown_slot_rejected():
    assert _normalize_one_h_report_slot("17:00") is None
