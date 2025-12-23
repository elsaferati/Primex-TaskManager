from fastapi import APIRouter

from app.api.routers.auth import router as auth_router
from app.api.routers.checklist_items import router as checklist_items_router
from app.api.routers.departments import router as departments_router
from app.api.routers.ga_notes import router as ga_notes_router
from app.api.routers.meetings import router as meetings_router
from app.api.routers.notifications import router as notifications_router
from app.api.routers.project_members import router as project_members_router
from app.api.routers.project_prompts import router as project_prompts_router
from app.api.routers.projects import router as projects_router
from app.api.routers.system_tasks import router as system_tasks_router
from app.api.routers.tasks import router as tasks_router
from app.api.routers.users import router as users_router


api_router = APIRouter()
api_router.include_router(auth_router, prefix="/auth", tags=["auth"])
api_router.include_router(checklist_items_router, prefix="/checklist-items", tags=["checklist-items"])
api_router.include_router(departments_router, prefix="/departments", tags=["departments"])
api_router.include_router(ga_notes_router, prefix="/ga-notes", tags=["ga-notes"])
api_router.include_router(meetings_router, prefix="/meetings", tags=["meetings"])
api_router.include_router(projects_router, prefix="/projects", tags=["projects"])
api_router.include_router(project_members_router, prefix="/project-members", tags=["project-members"])
api_router.include_router(project_prompts_router, prefix="/project-prompts", tags=["project-prompts"])
api_router.include_router(tasks_router, prefix="/tasks", tags=["tasks"])
api_router.include_router(notifications_router, prefix="/notifications", tags=["notifications"])
api_router.include_router(system_tasks_router, prefix="/system-tasks", tags=["system-tasks"])
api_router.include_router(users_router, prefix="/users", tags=["users"])

