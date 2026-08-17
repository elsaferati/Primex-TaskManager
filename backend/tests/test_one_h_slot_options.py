from app.api.routers.tasks import _normalize_one_h_report_slot


def test_1550_is_a_valid_slot():
    assert _normalize_one_h_report_slot("15:50") == "15:50"


def test_retired_1600_slot_is_rejected():
    assert _normalize_one_h_report_slot("16:00") is None


def test_existing_slots_still_valid():
    for slot in ("10:00", "11:00", "11:50", "14:20"):
        assert _normalize_one_h_report_slot(slot) == slot


def test_unknown_slot_rejected():
    assert _normalize_one_h_report_slot("17:00") is None
