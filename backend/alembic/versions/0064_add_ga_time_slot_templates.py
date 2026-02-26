"""
Revision ID: 0064_add_ga_time_slot_templates
Revises: 0063_add_ga_time_slot_entries
Create Date: 2026-02-26 00:00:00.000000
"""

from alembic import op
import sqlalchemy as sa
from sqlalchemy.dialects import postgresql


# revision identifiers, used by Alembic.
revision = "0064_add_ga_time_slot_templates"
down_revision = "0063_add_ga_time_slot_entries"
branch_labels = None
depends_on = None


def upgrade() -> None:
    op.create_table(
        "ga_time_slot_templates",
        sa.Column("id", postgresql.UUID(as_uuid=True), nullable=False),
        sa.Column("user_id", postgresql.UUID(as_uuid=True), nullable=False),
        sa.Column("day_of_week", sa.Integer(), nullable=False),
        sa.Column("start_time", sa.Time(), nullable=False),
        sa.Column("end_time", sa.Time(), nullable=False),
        sa.Column("content", sa.String(length=8000), server_default="", nullable=False),
        sa.Column("created_at", sa.DateTime(timezone=True), server_default=sa.text("now()"), nullable=False),
        sa.Column("updated_at", sa.DateTime(timezone=True), server_default=sa.text("now()"), nullable=False),
        sa.ForeignKeyConstraint(["user_id"], ["users.id"], ondelete="CASCADE"),
        sa.PrimaryKeyConstraint("id"),
    )
    op.create_index(
        op.f("ix_ga_time_slot_templates_user_id"),
        "ga_time_slot_templates",
        ["user_id"],
        unique=False,
    )
    op.create_index(
        op.f("ix_ga_time_slot_templates_day_of_week"),
        "ga_time_slot_templates",
        ["day_of_week"],
        unique=False,
    )
    op.create_index(
        "ix_ga_time_slot_templates_user_day_time",
        "ga_time_slot_templates",
        ["user_id", "day_of_week", "start_time", "end_time"],
        unique=False,
    )


def downgrade() -> None:
    op.drop_index("ix_ga_time_slot_templates_user_day_time", table_name="ga_time_slot_templates")
    op.drop_index(op.f("ix_ga_time_slot_templates_day_of_week"), table_name="ga_time_slot_templates")
    op.drop_index(op.f("ix_ga_time_slot_templates_user_id"), table_name="ga_time_slot_templates")
    op.drop_table("ga_time_slot_templates")
