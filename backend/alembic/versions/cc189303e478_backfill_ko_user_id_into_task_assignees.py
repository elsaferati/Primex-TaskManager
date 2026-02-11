"""backfill ko_user_id into task_assignees

Revision ID: cc189303e478
Revises: 0058_add_ga_note_attachments
Create Date: 2026-02-11
"""

from __future__ import annotations

from alembic import op


revision = "cc189303e478"
down_revision = "0058_add_ga_note_attachments"
branch_labels = None
depends_on = None


def upgrade() -> None:
    # For PCM department tasks in CONTROL phase on TT/MST projects, KO ownership is stored in
    # tasks.internal_notes as `ko_user_id=<uuid>`. Backfill that KO into task_assignees so the KO
    # user is treated like an assignee across the app (lists/planner/permissions) without changing schema.
    op.execute(
        """
        INSERT INTO task_assignees (task_id, user_id)
        SELECT
          t.id AS task_id,
          (substring(
            t.internal_notes
            from 'ko_user_id[:=]\\s*([0-9a-f]{8}-[0-9a-f]{4}-[0-9a-f]{4}-[0-9a-f]{4}-[0-9a-f]{12})'
          ))::uuid AS user_id
        FROM tasks t
        JOIN projects p ON p.id = t.project_id
        JOIN departments d ON d.id = p.department_id
        WHERE d.code = 'PCM'
          AND upper(coalesce(t.phase, '')) = 'CONTROL'
          AND (
            upper(coalesce(p.project_type, '')) = 'MST'
            OR upper(coalesce(p.title, '')) = 'TT'
            OR upper(coalesce(p.title, '')) LIKE 'TT %'
            OR upper(coalesce(p.title, '')) LIKE 'TT-%'
            OR upper(coalesce(p.title, '')) LIKE '%MST%'
          )
          AND t.internal_notes ~* 'ko_user_id[:=]\\s*[0-9a-f]{8}-[0-9a-f]{4}-[0-9a-f]{4}-[0-9a-f]{4}-[0-9a-f]{12}'
        ON CONFLICT DO NOTHING;
        """
    )


def downgrade() -> None:
    # No-op: this is a data backfill and is safe to keep on downgrade.
    return
