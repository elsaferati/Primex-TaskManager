from types import SimpleNamespace

from app.api.routers.projects import DEV_PHASES, MST_PHASES, get_project_sequence
from app.models.enums import ProjectType


def test_gd_development_projects_use_development_sequence():
    project = SimpleNamespace(project_type=ProjectType.GD_DEVELOPMENT.value, title="GD Web Refresh")

    sequence = get_project_sequence(project, department_name="Graphic Design")

    assert sequence == DEV_PHASES


def test_graphic_design_mst_projects_keep_mst_sequence():
    project = SimpleNamespace(project_type=ProjectType.MST.value, title="MST Project")

    sequence = get_project_sequence(project, department_name="Graphic Design")

    assert sequence == MST_PHASES
