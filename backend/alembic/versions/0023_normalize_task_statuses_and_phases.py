"""normalize task statuses and phases

Revision ID: 0023_normalize_task_statuses_and_phases
Revises: 0022_expand_checklist_item_text_fields
Create Date: 2025-02-01
"""

from __future__ import annotations

import uuid

import sqlalchemy as sa
from alembic import op


revision = "0023_normalize_task_statuses_and_phases"
down_revision = "0022_expand_checklist_item_text_fields"
branch_labels = None
depends_on = None


def _normalize_status(table: str, column: str) -> None:
    op.execute(
        sa.text(
            f"""
            UPDATE {table}
            SET {column} = CASE
                WHEN upper(btrim({column})) IN ('TODO', 'TO DO', 'TO-DO') THEN 'TODO'
                WHEN upper(btrim({column})) IN (
                    'IN_PROGRESS',
                    'IN PROGRESS',
                    'IN-PROGRESS',
                    'INPROGRESS',
                    'REVIEW',
                    'IN REVIEW'
                ) THEN 'IN_PROGRESS'
                WHEN upper(btrim({column})) IN (
                    'DONE',
                    'COMPLETED',
                    'FINISHED',
                    'CLOSED',
                    'CANCELLED',
                    'CANCELED'
                ) THEN 'DONE'
                ELSE 'TODO'
            END
            """
        )
    )


def _normalize_phase(table: str, column: str) -> None:
    op.execute(
        sa.text(
            f"""
            UPDATE {table}
            SET {column} = CASE
                WHEN upper(btrim({column})) IN ('TAKIMET', 'MEETING', 'MEETINGS') THEN 'MEETINGS'
                WHEN upper(btrim({column})) IN ('PLANIFIKIMI', 'PLANIFIKIM', 'PROJECT_ACCEPTANCE', 'PROJECT ACCEPTANCE', 'PLANNING') THEN 'PLANNING'
                WHEN upper(btrim({column})) IN ('ZHVILLIMI', 'DEVELOPMENT') THEN 'DEVELOPMENT'
                WHEN upper(btrim({column})) IN ('TESTIMI', 'TESTING') THEN 'TESTING'
                WHEN upper(btrim({column})) IN ('DOKUMENTIMI', 'DOKUMENTACIONI', 'DOCUMENTATION') THEN 'DOCUMENTATION'
                WHEN upper(btrim({column})) IN ('PRODUKTE', 'PRODUKT', 'PRODUKTI', 'PRODUCT') THEN 'PRODUCT'
                WHEN upper(btrim({column})) IN ('KONTROLLI', 'KONTROLL', 'KONTROL', 'CONTROL') THEN 'CONTROL'
                WHEN upper(btrim({column})) IN ('FINALIZIMI', 'FINALIZIM', 'FINAL') THEN 'FINAL'
                WHEN upper(btrim({column})) IN ('AMAZONE', 'AMAZON') THEN 'AMAZON'
                WHEN upper(btrim({column})) IN ('CHECK') THEN 'CHECK'
                WHEN upper(btrim({column})) IN ('DREAMROBOT', 'DREAM ROBOT', 'DREAM-ROBOT', 'DREAM_ROBOT') THEN 'DREAMROBOT'
                WHEN upper(btrim({column})) IN ('MBYLLUR', 'CLOSED') THEN 'CLOSED'
                WHEN upper(btrim({column})) IN (
                    'MEETINGS',
                    'PLANNING',
                    'DEVELOPMENT',
                    'TESTING',
                    'DOCUMENTATION',
                    'PRODUCT',
                    'CONTROL',
                    'FINAL',
                    'AMAZON',
                    'CHECK',
                    'DREAMROBOT',
                    'CLOSED'
                ) THEN upper(btrim({column}))
                ELSE 'PLANNING'
            END
            """
        )
    )


def upgrade() -> None:
    _normalize_status("tasks", "status")
    _normalize_status("projects", "status")
    _normalize_phase("tasks", "phase")
    _normalize_phase("projects", "current_phase")

    op.execute(
        sa.text(
            """
            UPDATE task_statuses
            SET name = CASE
                WHEN upper(btrim(name)) IN ('TODO', 'TO DO', 'TO-DO') THEN 'TODO'
                WHEN upper(btrim(name)) IN (
                    'IN_PROGRESS',
                    'IN PROGRESS',
                    'IN-PROGRESS',
                    'INPROGRESS',
                    'REVIEW',
                    'IN REVIEW'
                ) THEN 'IN_PROGRESS'
                WHEN upper(btrim(name)) IN (
                    'DONE',
                    'COMPLETED',
                    'FINISHED',
                    'CLOSED',
                    'CANCELLED',
                    'CANCELED'
                ) THEN 'DONE'
                ELSE 'TODO'
            END
            """
        )
    )
    op.execute("UPDATE task_statuses SET is_done = (name = 'DONE')")

    op.execute(
        sa.text(
            """
            WITH ranked AS (
                SELECT id, department_id, name,
                       row_number() OVER (
                           PARTITION BY department_id, name
                           ORDER BY position, created_at, id
                       ) AS rn
                FROM task_statuses
            ),
            keepers AS (
                SELECT id, department_id, name
                FROM ranked
                WHERE rn = 1
            ),
            dupes AS (
                SELECT id, department_id, name
                FROM ranked
                WHERE rn > 1
            ),
            map AS (
                SELECT d.id AS old_id, k.id AS new_id
                FROM dupes d
                JOIN keepers k
                  ON k.department_id = d.department_id
                 AND k.name = d.name
            )
            UPDATE task_templates
            SET default_status_id = map.new_id
            FROM map
            WHERE task_templates.default_status_id = map.old_id
            """
        )
    )
    op.execute(
        sa.text(
            """
            DELETE FROM task_statuses
            USING (
                SELECT id
                FROM (
                    SELECT id,
                           row_number() OVER (
                               PARTITION BY department_id, name
                               ORDER BY position, created_at, id
                           ) AS rn
                    FROM task_statuses
                ) ranked
                WHERE rn > 1
            ) dupes
            WHERE task_statuses.id = dupes.id
            """
        )
    )

    conn = op.get_bind()
    department_rows = conn.execute(sa.text("SELECT id FROM departments")).fetchall()
    statuses = [
        ("TODO", 0, False),
        ("IN_PROGRESS", 1, False),
        ("DONE", 2, True),
    ]
    for row in department_rows:
        dept_id = row[0]
        for name, position, is_done in statuses:
            exists = conn.execute(
                sa.text(
                    "SELECT 1 FROM task_statuses WHERE department_id = :dept_id AND name = :name"
                ),
                {"dept_id": dept_id, "name": name},
            ).first()
            if exists:
                continue
            conn.execute(
                sa.text(
                    """
                    INSERT INTO task_statuses (id, department_id, name, position, is_done, created_at)
                    VALUES (:id, :dept_id, :name, :position, :is_done, now())
                    """
                ),
                {
                    "id": str(uuid.uuid4()),
                    "dept_id": dept_id,
                    "name": name,
                    "position": position,
                    "is_done": is_done,
                },
            )


def downgrade() -> None:
    # No downgrade for normalization/cleanup.
    pass
