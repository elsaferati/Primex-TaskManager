from app.services.personal_task_owner import personal_task_owner


def test_personal_owner_priority_is_genti_then_ka_then_ga_then_px():
    assert personal_task_owner("EF/GA/KA: Task") == "KA"
    assert personal_task_owner("EF/KA/GA: Task") == "KA"
    assert personal_task_owner("EF/PX/GT: Task") == "GENT"
    assert personal_task_owner("EF/GA/GENTI: Task") == "GENT"
    assert personal_task_owner("EF/GA: Task") == "GA"
    assert personal_task_owner("EF/PX: Task") == "PX"


def test_genti_wins_if_both_genti_and_ka_are_present():
    assert personal_task_owner("EF/GT/KA/GA: Task") == "GENT"
