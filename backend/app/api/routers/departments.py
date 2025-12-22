from __future__ import annotations

from fastapi import APIRouter, Depends
from sqlalchemy import select
from sqlalchemy.ext.asyncio import AsyncSession

from app.api.deps import get_current_user
from app.db import get_db
from app.models.department import Department
from app.schemas.department import DepartmentOut


router = APIRouter()


@router.get("", response_model=list[DepartmentOut])
async def list_departments(db: AsyncSession = Depends(get_db), _=Depends(get_current_user)) -> list[DepartmentOut]:
    departments = (await db.execute(select(Department).order_by(Department.name))).scalars().all()
    return [DepartmentOut(id=d.id, name=d.name, code=d.code) for d in departments]

