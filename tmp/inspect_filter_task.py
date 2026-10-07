"""Read-only diagnosis of the heating-filter task."""
import asyncio
import json
import sys
from pathlib import Path

sys.path.insert(0, str(Path(__file__).resolve().parents[1] / 'backend'))
from sqlalchemy import text
from app.db import SessionLocal, engine

async def main():
    try:
        async with SessionLocal() as db:
            await db.execute(text('SET TRANSACTION READ ONLY'))
            rows = (await db.execute(text("""
                SELECT t.id, t.title, t.status, t.is_active, t.start_date, t.due_date,
                       t.completed_at, t.department_id, d.name AS department,
                       t.assigned_to, u.username AS assigned_username,
                       t.system_template_origin_id, t.system_task_slot_id,
                       t.ga_note_origin_id, t.plan_note_origin_id, t.project_id,
                       t.dependency_task_id, t.daily_products, t.internal_notes,
                       t.is_1h_report, t.is_r1, t.is_bllok, t.is_personal,
                       t.created_at, t.updated_at
                FROM tasks t LEFT JOIN users u ON u.id=t.assigned_to
                LEFT JOIN departments d ON d.id=t.department_id
                WHERE t.title ILIKE '%PASTRIMI%FILTER%'
                ORDER BY t.is_active DESC, t.due_date DESC NULLS LAST LIMIT 60
            """))).mappings().all()
            print('TASKS', json.dumps([dict(r) for r in rows], default=str, ensure_ascii=True))
            for row in rows:
                if 'PASTRIMI' not in row['title'].upper():
                    continue
                for label, query in (
                    ('ASSIGNEES', 'SELECT a.user_id, u.username, u.role FROM task_assignees a JOIN users u ON u.id=a.user_id WHERE a.task_id=:id'),
                    ('COMMENTS', 'SELECT c.user_id, u.username, c.comment FROM task_user_comments c JOIN users u ON u.id=c.user_id WHERE c.task_id=:id'),
                    ('AUDIT', 'SELECT actor_user_id, action, before, after, created_at FROM audit_logs WHERE entity_id=:id ORDER BY created_at DESC LIMIT 8'),
                ):
                    result = (await db.execute(text(query), {'id': row['id']})).mappings().all()
                    print(label, str(row['id']), json.dumps([dict(r) for r in result], default=str, ensure_ascii=True))
                from sqlalchemy import select
                from fastapi import HTTPException
                from app.models.task import Task
                from app.models.user import User
                from app.api.routers.tasks import _require_rlz_completion_comment, _requires_rlz_completion_comment
                task = (await db.execute(select(Task).where(Task.id == row['id']))).scalar_one()
                user = (await db.execute(select(User).where(User.id == row['assigned_to']))).scalar_one()
                print('REQUIRES_RESULT_COMMENT', _requires_rlz_completion_comment(task))
                try:
                    await _require_rlz_completion_comment(db, task=task, user=user,
                        actor_is_assignee=True, override_reason=None)
                except HTTPException as exc:
                    print('COMPLETION_BLOCK', exc.status_code, json.dumps(exc.detail, ensure_ascii=True))
    finally:
        await engine.dispose()

if __name__ == '__main__':
    asyncio.run(main())
