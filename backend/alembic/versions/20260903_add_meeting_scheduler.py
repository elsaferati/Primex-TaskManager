"""Add meeting scheduling, validation, and two-person approval workflow.

Revision ID: 20260903_meeting_scheduler
Revises: 20260903_end_week_bz
"""

from alembic import op
import sqlalchemy as sa
from sqlalchemy.dialects import postgresql
import uuid


revision = "20260903_meeting_scheduler"
down_revision = "20260903_end_week_bz"
branch_labels = None
depends_on = None


def upgrade() -> None:
    op.add_column("meetings", sa.Column("ends_at", sa.DateTime(timezone=True)))
    op.add_column("meetings", sa.Column("microsoft_event_id", sa.String(length=500)))
    op.create_index("ix_meetings_microsoft_event_id", "meetings", ["microsoft_event_id"], unique=True)
    op.create_table(
        "meeting_scheduling_standards",
        sa.Column("id", postgresql.UUID(as_uuid=True), primary_key=True),
        sa.Column("name", sa.String(length=120), nullable=False),
        sa.Column("meeting_type", sa.String(length=20), nullable=False),
        sa.Column("title_prefix", sa.String(length=80)),
        sa.Column("default_duration_minutes", sa.Integer(), nullable=False, server_default="60"),
        sa.Column("buffer_minutes", sa.Integer(), nullable=False, server_default="0"),
        sa.Column("workday_start", sa.String(length=5), nullable=False, server_default="08:00"),
        sa.Column("workday_end", sa.String(length=5), nullable=False, server_default="17:00"),
        sa.Column("is_active", sa.Boolean(), nullable=False, server_default=sa.true()),
        sa.Column("created_by_user_id", postgresql.UUID(as_uuid=True), sa.ForeignKey("users.id", ondelete="SET NULL")),
        sa.Column("created_at", sa.DateTime(timezone=True), server_default=sa.func.now()),
        sa.Column("updated_at", sa.DateTime(timezone=True), server_default=sa.func.now()),
    )
    op.create_index("ix_meeting_scheduling_standards_type", "meeting_scheduling_standards", ["meeting_type"])
    standards_table = sa.table(
        "meeting_scheduling_standards",
        sa.column("id", postgresql.UUID(as_uuid=True)),
        sa.column("name", sa.String()),
        sa.column("meeting_type", sa.String()),
        sa.column("title_prefix", sa.String()),
        sa.column("default_duration_minutes", sa.Integer()),
        sa.column("buffer_minutes", sa.Integer()),
        sa.column("workday_start", sa.String()),
        sa.column("workday_end", sa.String()),
        sa.column("is_active", sa.Boolean()),
    )
    op.bulk_insert(
        standards_table,
        [
            {
                "id": uuid.uuid4(), "name": "Takim intern standard", "meeting_type": "internal",
                "title_prefix": "TAK INT", "default_duration_minutes": 30, "buffer_minutes": 0,
                "workday_start": "08:00", "workday_end": "17:00", "is_active": True,
            },
            {
                "id": uuid.uuid4(), "name": "Takim ekstern standard", "meeting_type": "external",
                "title_prefix": "TAK EXT", "default_duration_minutes": 60, "buffer_minutes": 15,
                "workday_start": "08:00", "workday_end": "17:00", "is_active": True,
            },
        ],
    )

    op.create_table(
        "meeting_schedule_requests",
        sa.Column("id", postgresql.UUID(as_uuid=True), primary_key=True),
        sa.Column("title", sa.String(length=200), nullable=False),
        sa.Column("meeting_type", sa.String(length=20), nullable=False),
        sa.Column("platform", sa.String(length=100)),
        sa.Column("starts_at", sa.DateTime(timezone=True), nullable=False),
        sa.Column("ends_at", sa.DateTime(timezone=True), nullable=False),
        sa.Column("client_name", sa.String(length=200)),
        sa.Column("client_email", sa.String(length=320)),
        sa.Column("notes", sa.Text()),
        sa.Column("department_id", postgresql.UUID(as_uuid=True), sa.ForeignKey("departments.id"), nullable=False),
        sa.Column("project_id", postgresql.UUID(as_uuid=True), sa.ForeignKey("projects.id", ondelete="SET NULL")),
        sa.Column("standard_id", postgresql.UUID(as_uuid=True), sa.ForeignKey("meeting_scheduling_standards.id", ondelete="SET NULL")),
        sa.Column("status", sa.String(length=30), nullable=False, server_default="PENDING_APPROVAL"),
        sa.Column("validation_snapshot", postgresql.JSONB(), nullable=False, server_default=sa.text("'{}'::jsonb")),
        sa.Column("microsoft_event_id", sa.String(length=500)),
        sa.Column("teams_url", sa.String(length=1000)),
        sa.Column("final_meeting_id", postgresql.UUID(as_uuid=True), sa.ForeignKey("meetings.id", ondelete="SET NULL")),
        sa.Column("last_error", sa.Text()),
        sa.Column("created_by_user_id", postgresql.UUID(as_uuid=True), sa.ForeignKey("users.id"), nullable=False),
        sa.Column("created_at", sa.DateTime(timezone=True), server_default=sa.func.now()),
        sa.Column("updated_at", sa.DateTime(timezone=True), server_default=sa.func.now()),
    )
    for column in ("meeting_type", "starts_at", "ends_at", "department_id", "project_id", "status", "created_by_user_id"):
        op.create_index(f"ix_meeting_schedule_requests_{column}", "meeting_schedule_requests", [column])

    op.create_table(
        "meeting_schedule_request_participants",
        sa.Column("id", postgresql.UUID(as_uuid=True), primary_key=True),
        sa.Column("request_id", postgresql.UUID(as_uuid=True), sa.ForeignKey("meeting_schedule_requests.id", ondelete="CASCADE"), nullable=False),
        sa.Column("user_id", postgresql.UUID(as_uuid=True), sa.ForeignKey("users.id", ondelete="CASCADE"), nullable=False),
        sa.Column("created_at", sa.DateTime(timezone=True), server_default=sa.func.now()),
        sa.UniqueConstraint("request_id", "user_id", name="uq_meeting_schedule_request_participant"),
    )
    op.create_index("ix_meeting_schedule_request_participants_request", "meeting_schedule_request_participants", ["request_id"])
    op.create_index("ix_meeting_schedule_request_participants_user", "meeting_schedule_request_participants", ["user_id"])

    op.create_table(
        "meeting_schedule_approvals",
        sa.Column("id", postgresql.UUID(as_uuid=True), primary_key=True),
        sa.Column("request_id", postgresql.UUID(as_uuid=True), sa.ForeignKey("meeting_schedule_requests.id", ondelete="CASCADE"), nullable=False),
        sa.Column("approved_by_user_id", postgresql.UUID(as_uuid=True), sa.ForeignKey("users.id"), nullable=False),
        sa.Column("created_at", sa.DateTime(timezone=True), server_default=sa.func.now()),
        sa.UniqueConstraint("request_id", "approved_by_user_id", name="uq_meeting_schedule_approval_user"),
    )
    op.create_index("ix_meeting_schedule_approvals_request", "meeting_schedule_approvals", ["request_id"])
    op.create_index("ix_meeting_schedule_approvals_user", "meeting_schedule_approvals", ["approved_by_user_id"])


def downgrade() -> None:
    op.drop_table("meeting_schedule_approvals")
    op.drop_table("meeting_schedule_request_participants")
    op.drop_table("meeting_schedule_requests")
    op.drop_table("meeting_scheduling_standards")
    op.drop_index("ix_meetings_microsoft_event_id", table_name="meetings")
    op.drop_column("meetings", "microsoft_event_id")
    op.drop_column("meetings", "ends_at")
