"""add system task occurrence overrides

Revision ID: 0062_add_system_task_occurrence_overrides
Revises: 0061_add_user_weekly_planner_sort_order
Create Date: 2026-02-24 00:00:00.000000
"""

from alembic import op
import sqlalchemy as sa
from sqlalchemy.dialects import postgresql


# revision identifiers, used by Alembic.
revision = "0062_add_system_task_occurrence_overrides"
down_revision = "0061_add_user_weekly_planner_sort_order"
branch_labels = None
depends_on = None


def upgrade() -> None:
    op.create_table(
        "system_task_occurrence_overrides",
        sa.Column("id", postgresql.UUID(as_uuid=True), nullable=False),
        sa.Column("template_id", postgresql.UUID(as_uuid=True), nullable=False),
        sa.Column("user_id", postgresql.UUID(as_uuid=True), nullable=False),
        sa.Column("source_occurrence_date", sa.Date(), nullable=False),
        sa.Column("target_occurrence_date", sa.Date(), nullable=False),
        sa.Column("created_at", sa.DateTime(timezone=True), server_default=sa.text("now()"), nullable=False),
        sa.Column("updated_at", sa.DateTime(timezone=True), server_default=sa.text("now()"), nullable=False),
        sa.ForeignKeyConstraint(["template_id"], ["system_task_templates.id"], ondelete="CASCADE"),
        sa.ForeignKeyConstraint(["user_id"], ["users.id"], ondelete="CASCADE"),
        sa.PrimaryKeyConstraint("id"),
        sa.UniqueConstraint(
            "template_id",
            "user_id",
            "source_occurrence_date",
            name="uq_system_task_occurrence_override",
        ),
    )
    op.create_index(
        op.f("ix_system_task_occurrence_overrides_template_id"),
        "system_task_occurrence_overrides",
        ["template_id"],
        unique=False,
    )
    op.create_index(
        op.f("ix_system_task_occurrence_overrides_user_id"),
        "system_task_occurrence_overrides",
        ["user_id"],
        unique=False,
    )
    op.create_index(
        op.f("ix_system_task_occurrence_overrides_source_occurrence_date"),
        "system_task_occurrence_overrides",
        ["source_occurrence_date"],
        unique=False,
    )


def downgrade() -> None:
    op.drop_index(op.f("ix_system_task_occurrence_overrides_source_occurrence_date"), table_name="system_task_occurrence_overrides")
    op.drop_index(op.f("ix_system_task_occurrence_overrides_user_id"), table_name="system_task_occurrence_overrides")
    op.drop_index(op.f("ix_system_task_occurrence_overrides_template_id"), table_name="system_task_occurrence_overrides")
    op.drop_table("system_task_occurrence_overrides")
