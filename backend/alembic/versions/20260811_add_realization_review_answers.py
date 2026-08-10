"""add audited Realization question answers and AI proposal state

Revision ID: 20260811_add_realization_review_answers
Revises: 20260810_add_realization_pulse
Create Date: 2026-08-11
"""

from alembic import op
import sqlalchemy as sa
from sqlalchemy.dialects import postgresql


revision = "20260811_add_realization_review_answers"
down_revision = "20260810_add_realization_pulse"
branch_labels = None
depends_on = None


def upgrade() -> None:
    op.add_column("realization_person_results", sa.Column("ai_suggested_level", sa.String(2)))
    op.add_column("realization_person_results", sa.Column("ai_generated_at", sa.DateTime(timezone=True)))
    op.add_column(
        "realization_person_results",
        sa.Column("ai_analysis_stale", sa.Boolean(), nullable=False, server_default=sa.text("true")),
    )
    op.create_check_constraint(
        "ck_realization_person_ai_suggested_level",
        "realization_person_results",
        "ai_suggested_level IS NULL OR ai_suggested_level IN ('A+', 'A', 'B', 'C', 'M', 'D', 'E')",
    )
    op.create_table(
        "realization_question_answers",
        sa.Column("id", postgresql.UUID(as_uuid=True), primary_key=True),
        sa.Column("period_id", postgresql.UUID(as_uuid=True), sa.ForeignKey("realization_periods.id", ondelete="RESTRICT"), nullable=False),
        sa.Column("result_id", postgresql.UUID(as_uuid=True), sa.ForeignKey("realization_person_results.id", ondelete="RESTRICT"), nullable=False),
        sa.Column("question_key", sa.String(80), nullable=False),
        sa.Column("value_json", postgresql.JSONB(), nullable=False),
        sa.Column("comment", sa.Text()),
        sa.Column("evidence_ids_json", postgresql.JSONB(), nullable=False, server_default=sa.text("'[]'::jsonb")),
        sa.Column("answered_by", postgresql.UUID(as_uuid=True), sa.ForeignKey("users.id", ondelete="RESTRICT"), nullable=False),
        sa.Column("answered_at", sa.DateTime(timezone=True), nullable=False, server_default=sa.func.now()),
        sa.Column("supersedes_answer_id", postgresql.UUID(as_uuid=True), sa.ForeignKey("realization_question_answers.id", ondelete="RESTRICT")),
        sa.Column("created_at", sa.DateTime(timezone=True), nullable=False, server_default=sa.func.now()),
        sa.Column("updated_at", sa.DateTime(timezone=True), nullable=False, server_default=sa.func.now()),
        sa.CheckConstraint("NULLIF(BTRIM(question_key), '') IS NOT NULL", name="ck_realization_question_answer_key"),
    )
    op.create_index("ix_realization_question_answers_period_id", "realization_question_answers", ["period_id"])
    op.create_index("ix_realization_question_answers_result_id", "realization_question_answers", ["result_id"])
    op.create_index(
        "ix_realization_question_answer_latest",
        "realization_question_answers",
        ["result_id", "question_key", "answered_at"],
    )


def downgrade() -> None:
    op.drop_table("realization_question_answers")
    op.drop_constraint("ck_realization_person_ai_suggested_level", "realization_person_results", type_="check")
    op.drop_column("realization_person_results", "ai_analysis_stale")
    op.drop_column("realization_person_results", "ai_generated_at")
    op.drop_column("realization_person_results", "ai_suggested_level")
