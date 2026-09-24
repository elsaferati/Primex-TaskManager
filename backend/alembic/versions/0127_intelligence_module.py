"""Create isolated News Intelligence storage.

Revision ID: 0127_intelligence_module
Revises: 0126_meeting_participant_source_unique
"""

from alembic import op
import sqlalchemy as sa
from sqlalchemy.dialects import postgresql

revision = "0127_intelligence_module"
down_revision = "0126_meeting_participant_source_unique"
branch_labels = None
depends_on = None


def upgrade() -> None:
    op.create_table(
        "intelligence_sources",
        sa.Column("id", postgresql.UUID(as_uuid=True), primary_key=True),
        sa.Column("name", sa.String(160), nullable=False),
        sa.Column("url", sa.String(2000), nullable=False),
        sa.Column("type", sa.String(24), nullable=False),
        sa.Column("status", sa.String(12), nullable=False, server_default="ACTIVE"),
        sa.Column("priority", sa.String(12), nullable=False, server_default="NORMAL"),
        sa.Column("categories", postgresql.JSONB(), nullable=False, server_default=sa.text("'[]'::jsonb")),
        sa.Column("ai_instructions", sa.Text()),
        sa.Column("fetch_interval_minutes", sa.Integer(), nullable=False, server_default="60"),
        sa.Column("last_checked_at", sa.DateTime(timezone=True)),
        sa.Column("created_at", sa.DateTime(timezone=True), nullable=False, server_default=sa.func.now()),
        sa.Column("updated_at", sa.DateTime(timezone=True), nullable=False, server_default=sa.func.now()),
    )
    op.create_table(
        "intelligence_items",
        sa.Column("id", postgresql.UUID(as_uuid=True), primary_key=True),
        sa.Column("source_id", postgresql.UUID(as_uuid=True), sa.ForeignKey("intelligence_sources.id", ondelete="CASCADE"), nullable=False),
        sa.Column("external_id", sa.String(500)),
        sa.Column("url", sa.String(2000), nullable=False),
        sa.Column("title", sa.String(500), nullable=False),
        sa.Column("original_text", sa.Text()),
        sa.Column("published_at", sa.DateTime(timezone=True)),
        sa.Column("image_url", sa.String(2000)),
        sa.Column("content_hash", sa.String(64)),
        sa.Column("created_at", sa.DateTime(timezone=True), nullable=False, server_default=sa.func.now()),
        sa.UniqueConstraint("source_id", "external_id", name="uq_intelligence_items_source_external"),
        sa.UniqueConstraint("source_id", "content_hash", name="uq_intelligence_items_source_hash"),
    )
    op.create_index("ix_intelligence_items_source_id", "intelligence_items", ["source_id"])
    op.create_index("ix_intelligence_items_published_at", "intelligence_items", ["published_at"])
    op.create_table(
        "intelligence_analyses",
        sa.Column("news_item_id", postgresql.UUID(as_uuid=True), sa.ForeignKey("intelligence_items.id", ondelete="CASCADE"), primary_key=True),
        sa.Column("summary", sa.Text(), nullable=False),
        sa.Column("category", sa.String(32), nullable=False),
        sa.Column("importance_score", sa.Integer(), nullable=False),
        sa.Column("relevance_score", sa.Integer(), nullable=False),
        sa.Column("why_it_matters", sa.Text()),
        sa.Column("deadline", sa.Date()),
        sa.Column("funding_amount", sa.String(160)),
        sa.Column("eligibility", sa.Text()),
        sa.Column("opportunity_type", sa.String(40)),
        sa.Column("tags", postgresql.JSONB(), nullable=False, server_default=sa.text("'[]'::jsonb")),
        sa.Column("analyzed_at", sa.DateTime(timezone=True), nullable=False, server_default=sa.func.now()),
    )
    op.create_table(
        "intelligence_user_states",
        sa.Column("user_id", postgresql.UUID(as_uuid=True), sa.ForeignKey("users.id", ondelete="CASCADE"), primary_key=True),
        sa.Column("news_item_id", postgresql.UUID(as_uuid=True), sa.ForeignKey("intelligence_items.id", ondelete="CASCADE"), primary_key=True),
        sa.Column("read_at", sa.DateTime(timezone=True)),
        sa.Column("saved_at", sa.DateTime(timezone=True)),
        sa.Column("hidden_at", sa.DateTime(timezone=True)),
    )
    op.create_index("ix_intelligence_user_states_saved", "intelligence_user_states", ["user_id", "saved_at"])


def downgrade() -> None:
    op.drop_index("ix_intelligence_user_states_saved", table_name="intelligence_user_states")
    op.drop_table("intelligence_user_states")
    op.drop_table("intelligence_analyses")
    op.drop_index("ix_intelligence_items_published_at", table_name="intelligence_items")
    op.drop_index("ix_intelligence_items_source_id", table_name="intelligence_items")
    op.drop_table("intelligence_items")
    op.drop_table("intelligence_sources")
