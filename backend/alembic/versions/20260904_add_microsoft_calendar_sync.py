"""Add Microsoft calendar synchronization metadata to meetings.

Revision ID: 20260904_calendar_sync
Revises: 20260903_px_jav_brief
"""

from alembic import op
import sqlalchemy as sa


revision = "20260904_calendar_sync"
down_revision = "20260903_px_jav_brief"
branch_labels = None
depends_on = None


def upgrade() -> None:
    inspector = sa.inspect(op.get_bind())
    columns = {column["name"] for column in inspector.get_columns("meetings")}
    if "calendar_imported" not in columns:
        op.add_column(
            "meetings",
            sa.Column("calendar_imported", sa.Boolean(), server_default=sa.false(), nullable=False),
        )
    if "calendar_sync_status" not in columns:
        op.add_column("meetings", sa.Column("calendar_sync_status", sa.String(length=20), nullable=True))
    if "calendar_change_key" not in columns:
        op.add_column("meetings", sa.Column("calendar_change_key", sa.String(length=500), nullable=True))
    if "calendar_last_synced_at" not in columns:
        op.add_column(
            "meetings",
            sa.Column("calendar_last_synced_at", sa.DateTime(timezone=True), nullable=True),
        )


def downgrade() -> None:
    inspector = sa.inspect(op.get_bind())
    columns = {column["name"] for column in inspector.get_columns("meetings")}
    for column_name in (
        "calendar_last_synced_at",
        "calendar_change_key",
        "calendar_sync_status",
        "calendar_imported",
    ):
        if column_name in columns:
            op.drop_column("meetings", column_name)
