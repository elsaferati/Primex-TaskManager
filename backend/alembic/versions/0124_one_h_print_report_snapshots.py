"""Persist manually generated 1H Shtypi previews.

Revision ID: 0124_one_h_print_snapshots
Revises: 0123_persistent_task_symbols
"""

from alembic import op
import sqlalchemy as sa
from sqlalchemy.dialects import postgresql


revision = "0124_one_h_print_snapshots"
down_revision = "0123_persistent_task_symbols"
branch_labels = None
depends_on = None


def upgrade() -> None:
    op.create_table(
        "one_h_print_report_snapshots",
        sa.Column(
            "id",
            postgresql.UUID(as_uuid=True),
            primary_key=True,
            server_default=sa.text("gen_random_uuid()"),
        ),
        sa.Column("report_kind", sa.String(length=16), nullable=False),
        sa.Column("report_date", sa.Date(), nullable=False),
        sa.Column("target_date", sa.Date(), nullable=False),
        sa.Column("report_payload", postgresql.JSONB(astext_type=sa.Text()), nullable=False),
        sa.Column(
            "generated_by_user_id",
            postgresql.UUID(as_uuid=True),
            sa.ForeignKey("users.id", ondelete="SET NULL"),
            nullable=True,
        ),
        sa.Column("created_at", sa.DateTime(timezone=True), server_default=sa.func.now(), nullable=False),
        sa.Column("updated_at", sa.DateTime(timezone=True), server_default=sa.func.now(), nullable=False),
        sa.UniqueConstraint(
            "report_kind",
            "report_date",
            name="uq_one_h_print_report_snapshot_kind_date",
        ),
    )
    op.create_index(
        "ix_one_h_print_report_snapshots_report_kind",
        "one_h_print_report_snapshots",
        ["report_kind"],
    )
    op.create_index(
        "ix_one_h_print_report_snapshots_report_date",
        "one_h_print_report_snapshots",
        ["report_date"],
    )
    op.create_index(
        "ix_one_h_print_report_snapshots_target_date",
        "one_h_print_report_snapshots",
        ["target_date"],
    )


def downgrade() -> None:
    op.drop_index("ix_one_h_print_report_snapshots_target_date", table_name="one_h_print_report_snapshots")
    op.drop_index("ix_one_h_print_report_snapshots_report_date", table_name="one_h_print_report_snapshots")
    op.drop_index("ix_one_h_print_report_snapshots_report_kind", table_name="one_h_print_report_snapshots")
    op.drop_table("one_h_print_report_snapshots")
