"""Keep M1/M2/M3 custom questions across report dates.

Revision ID: 0140_report_manual_questions
Revises: 0136_person_comments, 20260811_add_realization_review_answers
"""

from alembic import op
import sqlalchemy as sa
from sqlalchemy.dialects.postgresql import JSONB


revision = "0140_report_manual_questions"
down_revision = ("0136_person_comments", "20260811_add_realization_review_answers")
branch_labels = None
depends_on = None


def upgrade():
    for settings_table, drafts_table in (
        ("morning_report_settings", "morning_report_drafts"),
        ("after_break_report_settings", "after_break_report_drafts"),
        ("meetings_report_settings", "meetings_report_drafts"),
    ):
        op.add_column(
            settings_table,
            sa.Column("manual_questions", JSONB, nullable=False, server_default=sa.text("'[]'::jsonb")),
        )
        # Collect every distinct custom question saved before this fix. Newer
        # generated drafts may have omitted questions from previous days.
        op.execute(f"""
            UPDATE {settings_table}
            SET manual_questions = COALESCE((
                SELECT jsonb_agg(jsonb_build_object(
                    'section_key', saved_questions.section_key,
                    'title', saved_questions.title
                ) ORDER BY saved_questions.report_date, saved_questions.ordinality)
                FROM (
                    SELECT DISTINCT ON (question.value->>'section_key')
                        question.value->>'section_key' AS section_key,
                        question.value->>'title' AS title,
                        draft.report_date,
                        question.ordinality
                    FROM {drafts_table} AS draft
                    CROSS JOIN LATERAL jsonb_array_elements(draft.sections)
                        WITH ORDINALITY AS question(value, ordinality)
                    WHERE question.value->>'section_key' LIKE 'manual:custom:%'
                      AND NULLIF(BTRIM(question.value->>'title'), '') IS NOT NULL
                    ORDER BY question.value->>'section_key', draft.report_date DESC,
                        draft.updated_at DESC, question.ordinality DESC
                ) AS saved_questions
            ), '[]'::jsonb)
        """)


def downgrade():
    for settings_table in (
        "morning_report_settings",
        "after_break_report_settings",
        "meetings_report_settings",
    ):
        op.drop_column(settings_table, "manual_questions")
