from fastapi import APIRouter

from app.api.routers.auth import router as auth_router
from app.api.routers.audit_logs import router as audit_logs_router
from app.api.routers.boards import router as boards_router
from app.api.routers.common_entries import router as common_entries_router
from app.api.routers.departments import router as departments_router
from app.api.routers.exports import router as exports_router
from app.api.routers.notifications import router as notifications_router
from app.api.routers.planners import router as planners_router
from app.api.routers.projects import router as projects_router
from app.api.routers.search import router as search_router
from app.api.routers.task_statuses import router as task_statuses_router
from app.api.routers.task_templates import router as task_templates_router
from app.api.routers.tasks import router as tasks_router
from app.api.routers.users import router as users_router


api_router = APIRouter()
api_router.include_router(auth_router, prefix="/auth", tags=["auth"])
api_router.include_router(departments_router, prefix="/departments", tags=["departments"])
api_router.include_router(boards_router, prefix="/boards", tags=["boards"])
api_router.include_router(projects_router, prefix="/projects", tags=["projects"])
api_router.include_router(task_statuses_router, prefix="/task-statuses", tags=["task-statuses"])
api_router.include_router(tasks_router, prefix="/tasks", tags=["tasks"])
api_router.include_router(task_templates_router, prefix="/task-templates", tags=["task-templates"])
api_router.include_router(common_entries_router, prefix="/common-entries", tags=["common-entries"])
api_router.include_router(notifications_router, prefix="/notifications", tags=["notifications"])
api_router.include_router(audit_logs_router, prefix="/audit-logs", tags=["audit-logs"])
api_router.include_router(search_router, prefix="/search", tags=["search"])
api_router.include_router(planners_router, prefix="/planners", tags=["planners"])
api_router.include_router(exports_router, prefix="/exports", tags=["exports"])
