"""Add secure iPhone Calendar/Reminders sync for the GA timetable.

Revision ID: 20260903_ga_icloud_sync
Revises: 20260902_system_task_zv
"""

from alembic import op
import sqlalchemy as sa
from sqlalchemy.dialects import postgresql


revision = "20260903_ga_icloud_sync"
down_revision = "20260902_system_task_zv"
branch_labels = None
depends_on = None


def upgrade() -> None:
    op.create_table(
        "ga_icloud_sync_connections",
        sa.Column("id", postgresql.UUID(as_uuid=True), nullable=False),
        sa.Column("ga_user_id", postgresql.UUID(as_uuid=True), nullable=False),
        sa.Column("created_by_id", postgresql.UUID(as_uuid=True), nullable=True),
        sa.Column("device_name", sa.String(length=120), server_default="iPhone GA", nullable=False),
        sa.Column("calendar_name", sa.String(length=320), nullable=False),
        sa.Column("reminder_list_name", sa.String(length=320), nullable=False),
        sa.Column("token_hash", sa.String(length=64), nullable=False),
        sa.Column("last_synced_at", sa.DateTime(timezone=True), nullable=True),
        sa.Column("last_imported_count", sa.Integer(), server_default="0", nullable=False),
        sa.Column("revoked_at", sa.DateTime(timezone=True), nullable=True),
        sa.Column("created_at", sa.DateTime(timezone=True), server_default=sa.text("now()"), nullable=False),
        sa.Column("updated_at", sa.DateTime(timezone=True), server_default=sa.text("now()"), nullable=False),
        sa.ForeignKeyConstraint(["created_by_id"], ["users.id"], ondelete="SET NULL"),
        sa.ForeignKeyConstraint(["ga_user_id"], ["users.id"], ondelete="CASCADE"),
        sa.PrimaryKeyConstraint("id"),
    )
    op.create_index(
        op.f("ix_ga_icloud_sync_connections_ga_user_id"),
        "ga_icloud_sync_connections",
        ["ga_user_id"],
        unique=False,
    )
    op.add_column(
        "ga_time_slot_entries",
        sa.Column("sync_connection_id", postgresql.UUID(as_uuid=True), nullable=True),
    )
    op.add_column("ga_time_slot_entries", sa.Column("source_type", sa.String(length=20), nullable=True))
    op.add_column(
        "ga_time_slot_entries", sa.Column("source_external_id", sa.String(length=700), nullable=True)
    )
    op.add_column("ga_time_slot_entries", sa.Column("source_name", sa.String(length=320), nullable=True))
    op.create_foreign_key(
        "fk_ga_time_slot_entries_sync_connection_id",
        "ga_time_slot_entries",
        "ga_icloud_sync_connections",
        ["sync_connection_id"],
        ["id"],
        ondelete="CASCADE",
    )
    op.create_index(
        op.f("ix_ga_time_slot_entries_sync_connection_id"),
        "ga_time_slot_entries",
        ["sync_connection_id"],
        unique=False,
    )
    op.create_index(
        "ix_ga_time_slot_entries_sync_source",
        "ga_time_slot_entries",
        ["sync_connection_id", "source_type", "source_external_id"],
        unique=False,
    )


def downgrade() -> None:
    op.drop_index("ix_ga_time_slot_entries_sync_source", table_name="ga_time_slot_entries")
    op.drop_index(
        op.f("ix_ga_time_slot_entries_sync_connection_id"), table_name="ga_time_slot_entries"
    )
    op.drop_constraint(
        "fk_ga_time_slot_entries_sync_connection_id",
        "ga_time_slot_entries",
        type_="foreignkey",
    )
    op.drop_column("ga_time_slot_entries", "source_name")
    op.drop_column("ga_time_slot_entries", "source_external_id")
    op.drop_column("ga_time_slot_entries", "source_type")
    op.drop_column("ga_time_slot_entries", "sync_connection_id")
    op.drop_index(
        op.f("ix_ga_icloud_sync_connections_ga_user_id"),
        table_name="ga_icloud_sync_connections",
    )
    op.drop_table("ga_icloud_sync_connections")
