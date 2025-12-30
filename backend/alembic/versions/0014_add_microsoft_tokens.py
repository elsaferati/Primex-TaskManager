"""add microsoft tokens

Revision ID: 0014_add_microsoft_tokens
Revises: 0013_sys_task_notes
Create Date: 2025-12-29
"""

from __future__ import annotations

import sqlalchemy as sa

from alembic import op


revision = "0014_add_microsoft_tokens"
down_revision = "0013_sys_task_notes"
branch_labels = None
depends_on = None


def upgrade() -> None:
    op.create_table(
        "microsoft_tokens",
        sa.Column("id", sa.dialects.postgresql.UUID(as_uuid=True), primary_key=True, nullable=False),
        sa.Column(
            "user_id",
            sa.dialects.postgresql.UUID(as_uuid=True),
            sa.ForeignKey("users.id", ondelete="CASCADE"),
            nullable=False,
        ),
        sa.Column("access_token", sa.Text(), nullable=False),
        sa.Column("refresh_token", sa.Text(), nullable=False),
        sa.Column("scope", sa.Text(), nullable=True),
        sa.Column("expires_at", sa.DateTime(timezone=True), nullable=False),
        sa.Column("created_at", sa.DateTime(timezone=True), server_default=sa.func.now(), nullable=False),
        sa.Column(
            "updated_at",
            sa.DateTime(timezone=True),
            server_default=sa.func.now(),
            onupdate=sa.func.now(),
            nullable=False,
        ),
        sa.UniqueConstraint("user_id", name="uq_microsoft_tokens_user_id"),
    )
    op.create_index("ix_microsoft_tokens_user_id", "microsoft_tokens", ["user_id"])


def downgrade() -> None:
    op.drop_index("ix_microsoft_tokens_user_id", table_name="microsoft_tokens")
    op.drop_table("microsoft_tokens")
