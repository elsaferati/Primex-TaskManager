"""Add independent per-person comments for daily Realization periods.

This migration follows the deployed 0135 marker.
The earlier version of this migration reused the deployed marker's ID. Some
databases may therefore already have the table; preserve those rows on upgrade.
"""
from alembic import op
import sqlalchemy as sa
from sqlalchemy.dialects import postgresql

revision = "0136_person_comments"
down_revision = "0135_realization_daily_comments"
branch_labels = None
depends_on = None


def upgrade() -> None:
    inspector = sa.inspect(op.get_bind())
    table_name = "realization_daily_person_comments"
    existing_indexes = set()
    if inspector.has_table(table_name):
        existing_indexes = {item["name"] for item in inspector.get_indexes(table_name)}
    else:
        op.create_table(
            table_name,
            sa.Column("id", postgresql.UUID(as_uuid=True), primary_key=True, server_default=sa.text("gen_random_uuid()")),
            sa.Column("period_id", postgresql.UUID(as_uuid=True), sa.ForeignKey("realization_periods.id", ondelete="CASCADE"), nullable=False),
            sa.Column("user_id", postgresql.UUID(as_uuid=True), sa.ForeignKey("users.id", ondelete="RESTRICT"), nullable=False),
            sa.Column("comment", sa.Text(), nullable=True),
            sa.Column("updated_by", postgresql.UUID(as_uuid=True), sa.ForeignKey("users.id", ondelete="SET NULL"), nullable=True),
            sa.Column("created_at", sa.DateTime(timezone=True), server_default=sa.func.now(), nullable=False),
            sa.Column("updated_at", sa.DateTime(timezone=True), server_default=sa.func.now(), nullable=False),
            sa.UniqueConstraint("period_id", "user_id", name="uq_realization_daily_person_comment"),
        )
    for column in ("period_id", "user_id"):
        index_name = f"ix_{table_name}_{column}"
        if index_name not in existing_indexes:
            op.create_index(index_name, table_name, [column])


def downgrade() -> None:
    op.drop_table("realization_daily_person_comments")
