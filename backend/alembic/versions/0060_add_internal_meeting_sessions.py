"""add internal meeting sessions

Revision ID: 0060_add_internal_meeting_sessions
Revises: 0059_add_meeting_type
Create Date: 2026-02-13 00:00:00.000000

"""
from alembic import op
import sqlalchemy as sa


# revision identifiers, used by Alembic.
revision = "0060_add_internal_meeting_sessions"
down_revision = "0059_add_meeting_type"
branch_labels = None
depends_on = None


def upgrade() -> None:
    op.create_table(
        "internal_meeting_sessions",
        sa.Column("id", sa.dialects.postgresql.UUID(as_uuid=True), primary_key=True, nullable=False),
        sa.Column(
            "checklist_id",
            sa.dialects.postgresql.UUID(as_uuid=True),
            sa.ForeignKey("checklists.id", ondelete="CASCADE"),
            nullable=False,
        ),
        sa.Column("session_date", sa.Date(), nullable=False),
        sa.Column("starts_at", sa.DateTime(timezone=True), nullable=False),
        sa.Column("ends_at", sa.DateTime(timezone=True), nullable=False),
        sa.Column("reset_at", sa.DateTime(timezone=True), nullable=True),
        sa.Column("created_at", sa.DateTime(timezone=True), server_default=sa.text("now()"), nullable=False),
        sa.UniqueConstraint("checklist_id", "session_date", name="uq_internal_meeting_session_checklist_day"),
    )
    op.create_index(
        "ix_internal_meeting_sessions_checklist_id",
        "internal_meeting_sessions",
        ["checklist_id"],
    )


def downgrade() -> None:
    op.drop_index("ix_internal_meeting_sessions_checklist_id", table_name="internal_meeting_sessions")
    op.drop_table("internal_meeting_sessions")
