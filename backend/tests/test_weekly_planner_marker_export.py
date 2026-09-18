from app.api.routers.exports import _planner_item_rich_text


def test_weekly_planner_excel_places_daily_symbol_before_task_title_in_red():
    value = _planner_item_rich_text(
        {"number": "1", "marker": "M2/3", "title": "PROJECT", "rest": "Task"}
    )

    assert str(value) == "1. M2/3 PROJECT: Task"
    marker_part = list(value)[1]
    assert marker_part.text == "M2/3 "
    assert marker_part.font.b is True
    assert marker_part.font.color.rgb == "00FF0000"
