"""add task_user_comments table

Revision ID: 0034_add_task_user_comments
Revises: 0033_add_task_is_personal
Create Date: 2026-01-15 10:00:00.000000
"""

from alembic import op
import sqlalchemy as sa
from sqlalchemy.dialects import postgresql

# revision identifiers, used by Alembic.
revision = "0034_add_task_user_comments"
down_revision = "0033_add_task_is_personal"
branch_labels = None
depends_on = None


def upgrade() -> None:
    op.create_table(
        "task_user_comments",
        sa.Column("id", postgresql.UUID(as_uuid=True), primary_key=True),
        sa.Column("task_id", postgresql.UUID(as_uuid=True), nullable=False),
        sa.Column("user_id", postgresql.UUID(as_uuid=True), nullable=False),
        sa.Column("comment", sa.String(), nullable=True),
        sa.Column("created_at", sa.DateTime(timezone=True), server_default=sa.text("now()"), nullable=False),
        sa.Column("updated_at", sa.DateTime(timezone=True), server_default=sa.text("now()"), nullable=False),
        sa.ForeignKeyConstraint(["task_id"], ["tasks.id"], ondelete="CASCADE"),
        sa.ForeignKeyConstraint(["user_id"], ["users.id"], ondelete="CASCADE"),
        sa.UniqueConstraint("task_id", "user_id", name="uq_task_user_comment"),
    )
    op.create_index(op.f("ix_task_user_comments_task_id"), "task_user_comments", ["task_id"], unique=False)
    op.create_index(op.f("ix_task_user_comments_user_id"), "task_user_comments", ["user_id"], unique=False)


def downgrade() -> None:
    op.drop_index(op.f("ix_task_user_comments_user_id"), table_name="task_user_comments")
    op.drop_index(op.f("ix_task_user_comments_task_id"), table_name="task_user_comments")
    op.drop_table("task_user_comments")
