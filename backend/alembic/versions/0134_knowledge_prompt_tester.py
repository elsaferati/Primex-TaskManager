"""Knowledge PX: prompt tester (chosen on the note's task) + automatic test task.

Revision ID: 0134_knowledge_prompt_tester
Revises: 0133_knowledge_px_prompts
"""

from alembic import op
import sqlalchemy as sa
from sqlalchemy.dialects import postgresql

revision = "0134_knowledge_prompt_tester"
down_revision = "0133_knowledge_px_prompts"
branch_labels = None
depends_on = None


def upgrade() -> None:
    op.add_column(
        "ga_notes",
        sa.Column("knowledge_tester_id", postgresql.UUID(as_uuid=True), sa.ForeignKey("users.id"), nullable=True),
    )
    op.add_column(
        "knowledge_prompts",
        sa.Column("tester_id", postgresql.UUID(as_uuid=True), sa.ForeignKey("users.id"), nullable=True),
    )
    op.add_column(
        "knowledge_prompts",
        sa.Column(
            "test_task_id",
            postgresql.UUID(as_uuid=True),
            sa.ForeignKey("tasks.id", ondelete="SET NULL"),
            nullable=True,
        ),
    )


def downgrade() -> None:
    op.drop_column("knowledge_prompts", "test_task_id")
    op.drop_column("knowledge_prompts", "tester_id")
    op.drop_column("ga_notes", "knowledge_tester_id")
