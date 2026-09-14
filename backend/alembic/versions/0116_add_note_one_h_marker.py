"""Add one-hour symbols to GA and plan notes.

Revision ID: 0116_add_note_one_h_marker
Revises: 0115_add_task_one_h_marker
"""

from alembic import op
import sqlalchemy as sa


revision = "0116_add_note_one_h_marker"
down_revision = "0115_add_task_one_h_marker"
branch_labels = None
depends_on = None


def upgrade() -> None:
    op.add_column("ga_notes", sa.Column("one_h_marker", sa.String(length=16), nullable=True))
    op.add_column("plan_notes", sa.Column("one_h_marker", sa.String(length=16), nullable=True))


def downgrade() -> None:
    op.drop_column("plan_notes", "one_h_marker")
    op.drop_column("ga_notes", "one_h_marker")
