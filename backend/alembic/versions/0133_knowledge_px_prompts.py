"""Knowledge PX: prompt library + prompt notes.

Revision ID: 0133_knowledge_px_prompts
Revises: 0132_intelligence_email
"""

from alembic import op
import sqlalchemy as sa
from sqlalchemy.dialects import postgresql

revision = "0133_knowledge_px_prompts"
down_revision = "0132_intelligence_email"
branch_labels = None
depends_on = None


def upgrade() -> None:
    op.add_column("ga_notes", sa.Column("knowledge_type", sa.String(length=32), nullable=True))
    op.create_index("ix_ga_notes_knowledge_type", "ga_notes", ["knowledge_type"])

    op.create_table(
        "knowledge_prompts",
        sa.Column("id", postgresql.UUID(as_uuid=True), primary_key=True),
        sa.Column("title", sa.String(length=300), nullable=False),
        sa.Column("content", sa.Text(), nullable=False, server_default=""),
        sa.Column("keywords", postgresql.ARRAY(sa.String(length=100)), nullable=False, server_default="{}"),
        sa.Column("files_path", sa.String(length=1000), nullable=True),
        sa.Column(
            "source_note_id",
            postgresql.UUID(as_uuid=True),
            sa.ForeignKey("ga_notes.id", ondelete="SET NULL"),
            nullable=True,
        ),
        sa.Column("status", sa.String(length=32), nullable=False, server_default="PENDING_TEST"),
        sa.Column("created_by", postgresql.UUID(as_uuid=True), sa.ForeignKey("users.id"), nullable=True),
        sa.Column("tested_by", postgresql.UUID(as_uuid=True), sa.ForeignKey("users.id"), nullable=True),
        sa.Column("tested_at", sa.DateTime(timezone=True), nullable=True),
        sa.Column("test_comment", sa.Text(), nullable=True),
        sa.Column("approved_by", postgresql.UUID(as_uuid=True), sa.ForeignKey("users.id"), nullable=True),
        sa.Column("approved_at", sa.DateTime(timezone=True), nullable=True),
        sa.Column("rejected_by", postgresql.UUID(as_uuid=True), sa.ForeignKey("users.id"), nullable=True),
        sa.Column("rejected_at", sa.DateTime(timezone=True), nullable=True),
        sa.Column("rejection_reason", sa.Text(), nullable=True),
        sa.Column("file_original_name", sa.String(length=255), nullable=True),
        sa.Column("file_stored_name", sa.String(length=255), nullable=True),
        sa.Column("file_content_type", sa.String(length=255), nullable=True),
        sa.Column("file_size", sa.Integer(), nullable=True),
        sa.Column("created_at", sa.DateTime(timezone=True), server_default=sa.func.now(), nullable=False),
        sa.Column("updated_at", sa.DateTime(timezone=True), server_default=sa.func.now(), nullable=False),
    )
    op.create_index("ix_knowledge_prompts_status", "knowledge_prompts", ["status"])
    op.create_index("ix_knowledge_prompts_source_note_id", "knowledge_prompts", ["source_note_id"])


def downgrade() -> None:
    op.drop_index("ix_knowledge_prompts_source_note_id", table_name="knowledge_prompts")
    op.drop_index("ix_knowledge_prompts_status", table_name="knowledge_prompts")
    op.drop_table("knowledge_prompts")
    op.drop_index("ix_ga_notes_knowledge_type", table_name="ga_notes")
    op.drop_column("ga_notes", "knowledge_type")
