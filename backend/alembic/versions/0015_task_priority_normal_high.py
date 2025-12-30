"""replace task priority with normal/high

Revision ID: 0015_task_priority_normal_high
Revises: 0014_add_microsoft_tokens
Create Date: 2025-12-30
"""

from __future__ import annotations

import sqlalchemy as sa
from alembic import op
from sqlalchemy.dialects import postgresql


revision = "0015_task_priority_normal_high"
down_revision = "0014_add_microsoft_tokens"
branch_labels = None
depends_on = None


def upgrade() -> None:
    new_priority = postgresql.ENUM("NORMAL", "HIGH", name="task_priority_new")
    new_priority.create(op.get_bind(), checkfirst=True)
    new_ga_priority = postgresql.ENUM("NORMAL", "HIGH", name="ga_note_priority_new")
    new_ga_priority.create(op.get_bind(), checkfirst=True)

    op.execute("ALTER TABLE tasks ALTER COLUMN priority DROP DEFAULT")
    op.execute("ALTER TABLE system_task_templates ALTER COLUMN priority DROP DEFAULT")
    op.execute("ALTER TABLE ga_notes ALTER COLUMN priority DROP DEFAULT")
    op.execute(
        "DO $$ "
        "DECLARE r record; "
        "BEGIN "
        "FOR r IN "
        "SELECT conname FROM pg_constraint "
        "WHERE conrelid = 'system_task_templates'::regclass AND contype = 'c' "
        "AND pg_get_constraintdef(oid) ILIKE '%priority%' "
        "LOOP "
        "EXECUTE format('ALTER TABLE system_task_templates DROP CONSTRAINT %I', r.conname); "
        "END LOOP; "
        "END $$;"
    )

    op.execute(
        "ALTER TABLE tasks "
        "ALTER COLUMN priority TYPE task_priority_new "
        "USING (CASE "
        "WHEN priority::text IN ('LOW', 'MEDIUM') THEN 'NORMAL' "
        "WHEN priority::text IN ('HIGH', 'URGENT') THEN 'HIGH' "
        "ELSE 'NORMAL' "
        "END)::task_priority_new"
    )
    op.execute(
        "ALTER TABLE system_task_templates "
        "ALTER COLUMN priority TYPE task_priority_new "
        "USING (CASE "
        "WHEN priority::text IN ('LOW', 'MEDIUM') THEN 'NORMAL' "
        "WHEN priority::text IN ('HIGH', 'URGENT') THEN 'HIGH' "
        "ELSE NULL "
        "END)::task_priority_new"
    )
    op.execute(
        "ALTER TABLE ga_notes "
        "ALTER COLUMN priority TYPE ga_note_priority_new "
        "USING (CASE "
        "WHEN priority::text IN ('LOW', 'MEDIUM') THEN 'NORMAL' "
        "WHEN priority::text IN ('HIGH', 'URGENT') THEN 'HIGH' "
        "ELSE NULL "
        "END)::ga_note_priority_new"
    )

    op.execute("ALTER TABLE tasks ALTER COLUMN priority SET DEFAULT 'NORMAL'")
    op.execute("ALTER TABLE system_task_templates ALTER COLUMN priority SET DEFAULT 'NORMAL'")

    op.execute("DROP TYPE task_priority")
    op.execute("ALTER TYPE task_priority_new RENAME TO task_priority")
    op.execute("DROP TYPE ga_note_priority")
    op.execute("ALTER TYPE ga_note_priority_new RENAME TO ga_note_priority")

    op.create_check_constraint(
        "system_task_templates_priority_check",
        "system_task_templates",
        "priority IN ('NORMAL', 'HIGH')",
    )


def downgrade() -> None:
    old_priority = postgresql.ENUM("LOW", "MEDIUM", "HIGH", "URGENT", name="task_priority_old")
    old_priority.create(op.get_bind(), checkfirst=True)
    old_ga_priority = postgresql.ENUM("LOW", "MEDIUM", "HIGH", "URGENT", name="ga_note_priority_old")
    old_ga_priority.create(op.get_bind(), checkfirst=True)
    op.execute(
        "DO $$ "
        "DECLARE r record; "
        "BEGIN "
        "FOR r IN "
        "SELECT conname FROM pg_constraint "
        "WHERE conrelid = 'system_task_templates'::regclass AND contype = 'c' "
        "AND pg_get_constraintdef(oid) ILIKE '%priority%' "
        "LOOP "
        "EXECUTE format('ALTER TABLE system_task_templates DROP CONSTRAINT %I', r.conname); "
        "END LOOP; "
        "END $$;"
    )

    op.execute(
        "ALTER TABLE tasks "
        "ALTER COLUMN priority TYPE task_priority_old "
        "USING (CASE "
        "WHEN priority::text = 'NORMAL' THEN 'MEDIUM' "
        "WHEN priority::text = 'HIGH' THEN 'HIGH' "
        "ELSE 'MEDIUM' "
        "END)::task_priority_old"
    )
    op.execute(
        "ALTER TABLE system_task_templates "
        "ALTER COLUMN priority TYPE task_priority_old "
        "USING (CASE "
        "WHEN priority::text = 'NORMAL' THEN 'MEDIUM' "
        "WHEN priority::text = 'HIGH' THEN 'HIGH' "
        "ELSE NULL "
        "END)::task_priority_old"
    )
    op.execute(
        "ALTER TABLE ga_notes "
        "ALTER COLUMN priority TYPE ga_note_priority_old "
        "USING (CASE "
        "WHEN priority::text = 'NORMAL' THEN 'MEDIUM' "
        "WHEN priority::text = 'HIGH' THEN 'HIGH' "
        "ELSE NULL "
        "END)::ga_note_priority_old"
    )

    op.execute("ALTER TABLE tasks ALTER COLUMN priority SET DEFAULT 'MEDIUM'")
    op.execute("ALTER TABLE system_task_templates ALTER COLUMN priority SET DEFAULT 'MEDIUM'")

    op.execute("DROP TYPE task_priority")
    op.execute("ALTER TYPE task_priority_old RENAME TO task_priority")
    op.execute("DROP TYPE ga_note_priority")
    op.execute("ALTER TYPE ga_note_priority_old RENAME TO ga_note_priority")

    op.create_check_constraint(
        "system_task_templates_priority_check",
        "system_task_templates",
        "priority IN ('LOW', 'MEDIUM', 'HIGH', 'URGENT')",
    )
