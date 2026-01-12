from __future__ import annotations

from fastapi import APIRouter, Depends
from sqlalchemy import nulls_last, select
from sqlalchemy.ext.asyncio import AsyncSession
from sqlalchemy.orm import selectinload

from app.api.deps import get_current_user
from app.db import get_db
from app.models.checklist import Checklist
from app.models.checklist_item import ChecklistItem, ChecklistItemAssignee
from app.schemas.checklist import ChecklistWithItemsOut
from app.schemas.checklist_item import ChecklistItemAssigneeOut, ChecklistItemOut


router = APIRouter()


def _item_to_out(item: ChecklistItem) -> ChecklistItemOut:
    assignees = [
        ChecklistItemAssigneeOut(
            user_id=assignee.user_id,
            user_full_name=assignee.user.full_name if assignee.user else None,
            user_username=assignee.user.username if assignee.user else None,
        )
        for assignee in item.assignees
    ]

    return ChecklistItemOut(
        id=item.id,
        checklist_id=item.checklist_id,
        item_type=item.item_type,
        position=item.position,
        path=item.path,
        keyword=item.keyword,
        description=item.description,
        category=item.category,
        day=item.day,
        owner=item.owner,
        time=item.time,
        title=item.title,
        comment=item.comment,
        is_checked=item.is_checked,
        assignees=assignees,
    )


@router.get("", response_model=list[ChecklistWithItemsOut])
async def list_checklists(
    group_key: str | None = None,
    meeting_only: bool = False,
    include_items: bool = True,
    db: AsyncSession = Depends(get_db),
    user=Depends(get_current_user),
) -> list[ChecklistWithItemsOut]:
    stmt = select(Checklist)
    if meeting_only:
        stmt = stmt.where(Checklist.group_key.isnot(None))
    if group_key is not None:
        stmt = stmt.where(Checklist.group_key == group_key)
    if include_items:
        stmt = stmt.options(
            selectinload(Checklist.items)
            .selectinload(ChecklistItem.assignees)
            .selectinload(ChecklistItemAssignee.user)
        )
    stmt = stmt.order_by(nulls_last(Checklist.position), Checklist.created_at)

    checklists = (await db.execute(stmt)).scalars().all()
    results: list[ChecklistWithItemsOut] = []
    for checklist in checklists:
        items: list[ChecklistItemOut] = []
        if include_items:
            sorted_items = sorted(checklist.items, key=lambda item: (item.position, item.id))
            items = [_item_to_out(item) for item in sorted_items]
        results.append(
            ChecklistWithItemsOut(
                id=checklist.id,
                title=checklist.title,
                task_id=checklist.task_id,
                project_id=checklist.project_id,
                note=checklist.note,
                default_owner=checklist.default_owner,
                default_time=checklist.default_time,
                group_key=checklist.group_key,
                columns=checklist.columns,
                position=checklist.position,
                created_at=checklist.created_at,
                items=items,
            )
        )

    return results
