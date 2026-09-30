"""Preserve the deployed realization daily comments revision.

Revision ID: 0135_realization_daily_comments
Revises: 0134_knowledge_prompt_tester

The production database was stamped with this revision, but its migration file
was missing from the repository. The daily_comment column is already created
by 20260810_add_realization_pulse, so there is no schema change to repeat here.
Keeping this revision in the graph lets Alembic recognize the deployed state.
"""

revision = "0135_realization_daily_comments"
down_revision = "0134_knowledge_prompt_tester"
branch_labels = None
depends_on = None


def upgrade() -> None:
    pass


def downgrade() -> None:
    pass
