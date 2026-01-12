"""system task templates to varchar

Revision ID: 0024_system_task_templates_to_varchar
Revises: 0023_normalize_task_statuses_and_phases
Create Date: 2025-02-01
"""

from __future__ import annotations

from alembic import op


revision = "0024_system_task_templates_to_varchar"
down_revision = "0023_normalize_task_statuses_and_phases"
branch_labels = None
depends_on = None


def upgrade() -> None:
    op.execute(
        "DO $$ "
        "DECLARE r record; "
        "BEGIN "
        "FOR r IN "
        "SELECT conname FROM pg_constraint "
        "WHERE conrelid = 'system_task_templates'::regclass AND contype = 'c' "
        "AND ("
        "pg_get_constraintdef(oid) ILIKE '%priority%' OR "
        "pg_get_constraintdef(oid) ILIKE '%frequency%' OR "
        "pg_get_constraintdef(oid) ILIKE '%scope%' OR "
        "pg_get_constraintdef(oid) ILIKE '%finish_period%'"
        ") "
        "LOOP "
        "EXECUTE format('ALTER TABLE system_task_templates DROP CONSTRAINT %I', r.conname); "
        "END LOOP; "
        "END $$;"
    )
    op.execute(
        "ALTER TABLE system_task_templates "
        "ALTER COLUMN scope TYPE VARCHAR(50) USING scope::VARCHAR(50)"
    )
    op.execute(
        "ALTER TABLE system_task_templates "
        "ALTER COLUMN frequency TYPE VARCHAR(50) USING frequency::VARCHAR(50)"
    )
    op.execute(
        "ALTER TABLE system_task_templates "
        "ALTER COLUMN priority TYPE VARCHAR(50) USING priority::VARCHAR(50)"
    )
    op.execute(
        "ALTER TABLE system_task_templates "
        "ALTER COLUMN finish_period TYPE VARCHAR(50) USING finish_period::VARCHAR(50)"
    )


def downgrade() -> None:
    # Keep columns as varchar on downgrade.
    pass
