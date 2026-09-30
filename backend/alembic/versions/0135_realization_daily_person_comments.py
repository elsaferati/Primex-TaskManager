"""Add independent per-person comments for daily Realization periods."""
from alembic import op
import sqlalchemy as sa
from sqlalchemy.dialects import postgresql

revision = "0135_realization_daily_comments"
down_revision = "0134_knowledge_prompt_tester"
branch_labels = None
depends_on = None


def upgrade() -> None:
    op.create_table(
        "realization_daily_person_comments",
        sa.Column("id", postgresql.UUID(as_uuid=True), primary_key=True, server_default=sa.text("gen_random_uuid()")),
        sa.Column("period_id", postgresql.UUID(as_uuid=True), sa.ForeignKey("realization_periods.id", ondelete="CASCADE"), nullable=False),
        sa.Column("user_id", postgresql.UUID(as_uuid=True), sa.ForeignKey("users.id", ondelete="RESTRICT"), nullable=False),
        sa.Column("comment", sa.Text(), nullable=True),
        sa.Column("updated_by", postgresql.UUID(as_uuid=True), sa.ForeignKey("users.id", ondelete="SET NULL"), nullable=True),
        sa.Column("created_at", sa.DateTime(timezone=True), server_default=sa.func.now(), nullable=False),
        sa.Column("updated_at", sa.DateTime(timezone=True), server_default=sa.func.now(), nullable=False),
        sa.UniqueConstraint("period_id", "user_id", name="uq_realization_daily_person_comment"),
    )
    op.create_index("ix_realization_daily_person_comments_period_id", "realization_daily_person_comments", ["period_id"])
    op.create_index("ix_realization_daily_person_comments_user_id", "realization_daily_person_comments", ["user_id"])


def downgrade() -> None:
    op.drop_table("realization_daily_person_comments")
