"""merge_heads

Revision ID: fc9a8516095c
Revises: 0051_add_ga_department, 0054_add_internal_note_done_fields
Create Date: 2026-02-04 10:59:12.084472

"""
from alembic import op
import sqlalchemy as sa


# revision identifiers, used by Alembic.
revision = 'fc9a8516095c'
down_revision = ('0051_add_ga_department', '0054_add_internal_note_done_fields')
branch_labels = None
depends_on = None


def upgrade():
    pass


def downgrade():
    pass
