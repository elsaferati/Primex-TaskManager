"""Preserve task symbols by workday for Weekly Planner history.

Revision ID: 0122_task_marker_history
Revises: 0121_add_one_h_marker_comments
"""

from alembic import op
import sqlalchemy as sa
from sqlalchemy.dialects import postgresql


revision = "0122_task_marker_history"
down_revision = "0121_add_one_h_marker_comments"
branch_labels = None
depends_on = None


def upgrade() -> None:
    op.create_table(
        "task_one_h_marker_history",
        sa.Column(
            "id",
            postgresql.UUID(as_uuid=True),
            primary_key=True,
            server_default=sa.text("gen_random_uuid()"),
        ),
        sa.Column(
            "task_id",
            postgresql.UUID(as_uuid=True),
            sa.ForeignKey("tasks.id", ondelete="CASCADE"),
            nullable=False,
        ),
        sa.Column("marker_date", sa.Date(), nullable=False),
        sa.Column("one_h_marker", sa.String(length=16), nullable=False),
        sa.Column("one_h_marker_by_ga", sa.Boolean(), nullable=False, server_default=sa.text("false")),
        sa.Column("one_h_marker_comment", sa.Text(), nullable=True),
        sa.Column("created_at", sa.DateTime(timezone=True), nullable=False, server_default=sa.func.now()),
        sa.Column("updated_at", sa.DateTime(timezone=True), nullable=False, server_default=sa.func.now()),
        sa.UniqueConstraint("task_id", "marker_date", name="uq_task_one_h_marker_history_task_date"),
    )
    op.create_index(
        "ix_task_one_h_marker_history_task_id",
        "task_one_h_marker_history",
        ["task_id"],
    )
    op.create_index(
        "ix_task_one_h_marker_history_marker_date",
        "task_one_h_marker_history",
        ["marker_date"],
    )

    op.execute(
        """
        INSERT INTO task_one_h_marker_history (
            task_id, marker_date, one_h_marker, one_h_marker_by_ga,
            one_h_marker_comment, created_at, updated_at
        )
        SELECT
            id, one_h_marker_date, one_h_marker, one_h_marker_by_ga,
            one_h_marker_comment, now(), now()
        FROM tasks
        WHERE one_h_marker IS NOT NULL AND one_h_marker_date IS NOT NULL
        ON CONFLICT (task_id, marker_date) DO NOTHING
        """
    )

    op.execute(
        """
        CREATE FUNCTION sync_task_one_h_marker_history() RETURNS trigger AS $$
        BEGIN
            IF TG_OP = 'UPDATE'
               AND NEW.one_h_marker IS NULL
               AND OLD.one_h_marker_date IS NOT NULL THEN
                DELETE FROM task_one_h_marker_history
                WHERE task_id = NEW.id AND marker_date = OLD.one_h_marker_date;
            END IF;

            IF NEW.one_h_marker IS NOT NULL AND NEW.one_h_marker_date IS NOT NULL THEN
                INSERT INTO task_one_h_marker_history (
                    task_id, marker_date, one_h_marker, one_h_marker_by_ga,
                    one_h_marker_comment, created_at, updated_at
                ) VALUES (
                    NEW.id, NEW.one_h_marker_date, NEW.one_h_marker,
                    NEW.one_h_marker_by_ga, NEW.one_h_marker_comment, now(), now()
                )
                ON CONFLICT (task_id, marker_date) DO UPDATE SET
                    one_h_marker = EXCLUDED.one_h_marker,
                    one_h_marker_by_ga = EXCLUDED.one_h_marker_by_ga,
                    one_h_marker_comment = EXCLUDED.one_h_marker_comment,
                    updated_at = now();
            END IF;
            RETURN NEW;
        END;
        $$ LANGUAGE plpgsql
        """
    )
    op.execute(
        """
        CREATE TRIGGER trg_sync_task_one_h_marker_history
        AFTER INSERT OR UPDATE OF one_h_marker, one_h_marker_date,
            one_h_marker_by_ga, one_h_marker_comment ON tasks
        FOR EACH ROW EXECUTE FUNCTION sync_task_one_h_marker_history()
        """
    )


def downgrade() -> None:
    op.execute("DROP TRIGGER IF EXISTS trg_sync_task_one_h_marker_history ON tasks")
    op.execute("DROP FUNCTION IF EXISTS sync_task_one_h_marker_history()")
    op.drop_index("ix_task_one_h_marker_history_marker_date", table_name="task_one_h_marker_history")
    op.drop_index("ix_task_one_h_marker_history_task_id", table_name="task_one_h_marker_history")
    op.drop_table("task_one_h_marker_history")
