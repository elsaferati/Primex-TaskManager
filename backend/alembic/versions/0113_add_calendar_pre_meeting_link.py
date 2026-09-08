"""Link Microsoft TAK EXT meetings to an automatic preparation TAK INT.

Revision ID: 0113_calendar_pre_meeting_link
Revises: 0112_calendar_pre_meeting

The preceding revision was deployed as a schema-neutral compatibility marker.
During development, an earlier copy of this migration also used the 0112
revision ID.  The existence checks below allow both database states to advance
safely: deployments with only the marker receive the new schema, while local
databases that already received the schema are simply stamped at 0113.
"""

from alembic import op
import sqlalchemy as sa
from sqlalchemy.dialects import postgresql


revision = "0113_calendar_pre_meeting_link"
down_revision = "0112_calendar_pre_meeting"
branch_labels = None
depends_on = None


TABLE_NAME = "meetings"
COLUMN_NAME = "pre_external_meeting_id"
FOREIGN_KEY_NAME = "fk_meetings_pre_external_meeting_id_meetings"
INDEX_NAME = "ix_meetings_pre_external_meeting_id"


def _inspector() -> sa.Inspector:
    return sa.inspect(op.get_bind())


def upgrade() -> None:
    inspector = _inspector()
    column_names = {column["name"] for column in inspector.get_columns(TABLE_NAME)}

    if COLUMN_NAME not in column_names:
        op.add_column(
            TABLE_NAME,
            sa.Column(COLUMN_NAME, postgresql.UUID(as_uuid=True), nullable=True),
        )

    inspector = _inspector()
    foreign_keys = inspector.get_foreign_keys(TABLE_NAME)
    has_foreign_key = any(
        foreign_key.get("name") == FOREIGN_KEY_NAME
        or foreign_key.get("constrained_columns") == [COLUMN_NAME]
        for foreign_key in foreign_keys
    )
    if not has_foreign_key:
        op.create_foreign_key(
            FOREIGN_KEY_NAME,
            TABLE_NAME,
            TABLE_NAME,
            [COLUMN_NAME],
            ["id"],
            ondelete="CASCADE",
        )

    inspector = _inspector()
    indexes = inspector.get_indexes(TABLE_NAME)
    has_unique_index = any(
        index.get("name") == INDEX_NAME
        or (
            index.get("column_names") == [COLUMN_NAME]
            and bool(index.get("unique"))
        )
        for index in indexes
    )
    if not has_unique_index:
        op.create_index(
            INDEX_NAME,
            TABLE_NAME,
            [COLUMN_NAME],
            unique=True,
        )


def downgrade() -> None:
    inspector = _inspector()
    index_names = {index.get("name") for index in inspector.get_indexes(TABLE_NAME)}
    if INDEX_NAME in index_names:
        op.drop_index(INDEX_NAME, table_name=TABLE_NAME)

    inspector = _inspector()
    foreign_key_names = {
        foreign_key.get("name")
        for foreign_key in inspector.get_foreign_keys(TABLE_NAME)
    }
    if FOREIGN_KEY_NAME in foreign_key_names:
        op.drop_constraint(FOREIGN_KEY_NAME, TABLE_NAME, type_="foreignkey")

    inspector = _inspector()
    column_names = {column["name"] for column in inspector.get_columns(TABLE_NAME)}
    if COLUMN_NAME in column_names:
        op.drop_column(TABLE_NAME, COLUMN_NAME)
