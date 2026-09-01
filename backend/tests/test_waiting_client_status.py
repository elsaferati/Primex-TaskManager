from app.api.routers.planners import _normalize_task_status, _status_for_day
from app.models.enums import TaskStatus
from app.services.meetings_report import _normalize_report_status


def test_waiting_client_is_a_supported_task_status() -> None:
    assert TaskStatus.WAITING_CLIENT.value == "WAITING_CLIENT"
    assert _normalize_task_status("Waiting for Client") == "WAITING_CLIENT"
    assert _normalize_report_status("Waiting for Client") == "WAITING_CLIENT"


def test_waiting_client_remains_visible_without_daily_override() -> None:
    assert (
        _status_for_day(
            status="WAITING_CLIENT",
            daily_status=None,
            completed_at=None,
            day_date=None,
        )
        == "WAITING_CLIENT"
    )
