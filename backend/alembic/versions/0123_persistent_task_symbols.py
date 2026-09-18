"""Keep task symbols active until a manual change.

Revision ID: 0123_persistent_task_symbols
Revises: 0122_task_marker_history
"""

from alembic import op


revision = "0123_persistent_task_symbols"
down_revision = "0122_task_marker_history"
branch_labels = None
depends_on = None


def upgrade() -> None:
    # A NULL marker is a history tombstone recording a deliberate manual clear.
    op.alter_column("task_one_h_marker_history", "one_h_marker", nullable=True)
    op.execute("DROP TRIGGER IF EXISTS trg_sync_task_one_h_marker_history ON tasks")
    op.execute("DROP FUNCTION IF EXISTS sync_task_one_h_marker_history()")
    op.execute(
        """
        CREATE FUNCTION sync_task_one_h_marker_history() RETURNS trigger AS $$
        BEGIN
            IF NEW.one_h_marker_date IS NOT NULL THEN
                INSERT INTO task_one_h_marker_history (
                    task_id, marker_date, one_h_marker, one_h_marker_by_ga,
                    one_h_marker_comment, created_at, updated_at
                ) VALUES (
                    NEW.id, NEW.one_h_marker_date, NEW.one_h_marker,
                    CASE WHEN NEW.one_h_marker IS NULL THEN false ELSE NEW.one_h_marker_by_ga END,
                    CASE WHEN NEW.one_h_marker IS NULL THEN NULL ELSE NEW.one_h_marker_comment END,
                    now(), now()
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
    op.execute("DELETE FROM task_one_h_marker_history WHERE one_h_marker IS NULL")
    op.alter_column("task_one_h_marker_history", "one_h_marker", nullable=False)
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
