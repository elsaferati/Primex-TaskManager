"""Add template-level ZV1/ZV2 users to system tasks.

Revision ID: 20260902_system_task_zv
Revises: 20260826_daily_rlz_final_1640
"""

from alembic import op
import sqlalchemy as sa
from sqlalchemy.dialects import postgresql


revision = "20260902_system_task_zv"
down_revision = "20260826_daily_rlz_final_1640"
branch_labels = None
depends_on = None


def upgrade() -> None:
    op.add_column(
        "system_task_templates",
        sa.Column("zv1_user_id", postgresql.UUID(as_uuid=True), nullable=True),
    )
    op.add_column(
        "system_task_templates",
        sa.Column("zv2_user_id", postgresql.UUID(as_uuid=True), nullable=True),
    )
    op.create_foreign_key(
        "fk_system_task_templates_zv1_user_id",
        "system_task_templates",
        "users",
        ["zv1_user_id"],
        ["id"],
        ondelete="SET NULL",
    )
    op.create_foreign_key(
        "fk_system_task_templates_zv2_user_id",
        "system_task_templates",
        "users",
        ["zv2_user_id"],
        ["id"],
        ondelete="SET NULL",
    )


def downgrade() -> None:
    op.drop_constraint(
        "fk_system_task_templates_zv2_user_id",
        "system_task_templates",
        type_="foreignkey",
    )
    op.drop_constraint(
        "fk_system_task_templates_zv1_user_id",
        "system_task_templates",
        type_="foreignkey",
    )
    op.drop_column("system_task_templates", "zv2_user_id")
    op.drop_column("system_task_templates", "zv1_user_id")
