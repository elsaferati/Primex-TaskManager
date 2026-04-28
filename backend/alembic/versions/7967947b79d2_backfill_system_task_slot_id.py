"""backfill system_task_slot_id

Revision ID: 7967947b79d2
Revises: 0072_add_task_deadline_important
Create Date: 2026-04-28 14:41:54.339286

"""
from alembic import op
import sqlalchemy as sa


# revision identifiers, used by Alembic.
revision = '7967947b79d2'
down_revision = '0072_add_task_deadline_important'
branch_labels = None
depends_on = None


def upgrade():
    # Backfill legacy system tasks missing `system_task_slot_id`.
    # DB check constraint requires:
    #   system_template_origin_id IS NULL OR (origin_run_at IS NOT NULL AND system_task_slot_id IS NOT NULL)
    #
    # Prefer an active slot when multiple exist.
    op.execute(
        """
        WITH slot_pick AS (
            SELECT DISTINCT ON (template_id, primary_user_id)
                id,
                template_id,
                primary_user_id
            FROM system_task_template_assignee_slots
            ORDER BY template_id, primary_user_id, is_active DESC, created_at ASC
        )
        UPDATE tasks t
        SET system_task_slot_id = sp.id
        FROM slot_pick sp
        WHERE t.system_template_origin_id IS NOT NULL
          AND t.system_task_slot_id IS NULL
          AND t.assigned_to IS NOT NULL
          AND t.system_template_origin_id = sp.template_id
          AND t.assigned_to = sp.primary_user_id
        """
    )


def downgrade():
    # No safe downgrade; keep backfilled references.
    return None
