"""cleanup pre-creation system task occurrences

Revision ID: 0062_cleanup_precreation_system_occurrences
Revises: 0061_add_user_weekly_planner_sort_order
Create Date: 2026-02-24 00:00:00.000000
"""

from alembic import op


# revision identifiers, used by Alembic.
revision = "0062_cleanup_precreation_system_occurrences"
down_revision = "0061_add_user_weekly_planner_sort_order"
branch_labels = None
depends_on = None


def upgrade() -> None:
    # Remove invalid occurrence rows generated before template creation date.
    op.execute(
        """
        DELETE FROM system_task_occurrences AS occ
        USING system_task_templates AS tmpl
        WHERE occ.template_id = tmpl.id
          AND tmpl.created_at IS NOT NULL
          AND occ.occurrence_date < (timezone('Europe/Tirane', tmpl.created_at))::date
        """
    )


def downgrade() -> None:
    # Data cleanup is not reversible.
    pass
