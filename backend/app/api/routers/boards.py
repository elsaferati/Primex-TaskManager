from __future__ import annotations

import uuid

from fastapi import APIRouter, Depends, HTTPException, status
from sqlalchemy import select
from sqlalchemy.ext.asyncio import AsyncSession

from app.api.access import ensure_department_access, ensure_manager_or_admin
from app.api.deps import get_current_user
from app.db import get_db
from app.models.board import Board
from app.models.department import Department
from app.schemas.board import BoardCreate, BoardOut, BoardUpdate


router = APIRouter()


@router.get("", response_model=list[BoardOut])
async def list_boards(
    department_id: uuid.UUID | None = None,
    db: AsyncSession = Depends(get_db),
    user=Depends(get_current_user),
) -> list[BoardOut]:
    stmt = select(Board)
    if user.role.value != "admin":
        if user.department_id is None:
            return []
        stmt = stmt.where(Board.department_id == user.department_id)
    if department_id:
        stmt = stmt.where(Board.department_id == department_id)
    boards = (await db.execute(stmt.order_by(Board.created_at))).scalars().all()
    return [BoardOut(id=b.id, department_id=b.department_id, name=b.name, description=b.description) for b in boards]


@router.post("", response_model=BoardOut)
async def create_board(
    payload: BoardCreate,
    db: AsyncSession = Depends(get_db),
    user=Depends(get_current_user),
) -> BoardOut:
    ensure_manager_or_admin(user)
    ensure_department_access(user, payload.department_id)

    dept = (await db.execute(select(Department).where(Department.id == payload.department_id))).scalar_one_or_none()
    if dept is None:
        raise HTTPException(status_code=status.HTTP_404_NOT_FOUND, detail="Department not found")

    board = Board(department_id=payload.department_id, name=payload.name, description=payload.description)
    db.add(board)
    await db.commit()
    await db.refresh(board)
    return BoardOut(id=board.id, department_id=board.department_id, name=board.name, description=board.description)


@router.get("/{board_id}", response_model=BoardOut)
async def get_board(
    board_id: uuid.UUID,
    db: AsyncSession = Depends(get_db),
    user=Depends(get_current_user),
) -> BoardOut:
    board = (await db.execute(select(Board).where(Board.id == board_id))).scalar_one_or_none()
    if board is None:
        raise HTTPException(status_code=status.HTTP_404_NOT_FOUND, detail="Board not found")
    ensure_department_access(user, board.department_id)
    return BoardOut(id=board.id, department_id=board.department_id, name=board.name, description=board.description)


@router.patch("/{board_id}", response_model=BoardOut)
async def update_board(
    board_id: uuid.UUID,
    payload: BoardUpdate,
    db: AsyncSession = Depends(get_db),
    user=Depends(get_current_user),
) -> BoardOut:
    ensure_manager_or_admin(user)
    board = (await db.execute(select(Board).where(Board.id == board_id))).scalar_one_or_none()
    if board is None:
        raise HTTPException(status_code=status.HTTP_404_NOT_FOUND, detail="Board not found")
    ensure_department_access(user, board.department_id)

    if payload.name is not None:
        board.name = payload.name
    if payload.description is not None:
        board.description = payload.description

    await db.commit()
    await db.refresh(board)
    return BoardOut(id=board.id, department_id=board.department_id, name=board.name, description=board.description)

