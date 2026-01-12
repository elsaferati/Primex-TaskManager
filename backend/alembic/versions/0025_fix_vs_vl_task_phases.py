"""fix VS/VL task phases from metadata

Revision ID: 0025_fix_vs_vl_task_phases
Revises: 0024_system_task_templates_to_varchar
Create Date: 2025-02-01
"""

from __future__ import annotations

from alembic import op


revision = "0025_fix_vs_vl_task_phases"
down_revision = "0024_system_task_templates_to_varchar"
branch_labels = None
depends_on = None


def upgrade() -> None:
    op.execute(
        """
        UPDATE tasks
        SET phase = CASE
            WHEN internal_notes ILIKE '%"vs_vl_phase":"AMAZONE"%' THEN 'AMAZON'
            WHEN internal_notes ILIKE '%"vs_vl_phase":"AMAZON"%' THEN 'AMAZON'
            WHEN internal_notes ILIKE '%"vs_vl_phase":"CHECK"%' THEN 'CHECK'
            WHEN internal_notes ILIKE '%"vs_vl_phase":"DREAMROBOT"%' THEN 'DREAMROBOT'
            WHEN internal_notes ILIKE '%"vs_vl_phase":"CONTROL"%' THEN 'CONTROL'
            WHEN internal_notes ILIKE '%"vs_vl_phase":"PLANNING"%' THEN 'PLANNING'
            ELSE phase
        END
        WHERE internal_notes LIKE 'VS_VL_META:%'
        """
    )


def downgrade() -> None:
    pass
