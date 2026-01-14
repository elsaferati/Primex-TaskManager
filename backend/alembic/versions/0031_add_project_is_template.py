"""add is_template to projects

Revision ID: 0031_add_project_is_template
Revises: 0030_add_vs_vl_task_templates
Create Date: 2026-01-13
"""

from __future__ import annotations

from alembic import op
import sqlalchemy as sa


revision = "0031_add_project_is_template"
down_revision = "0030_add_vs_vl_task_templates"
branch_labels = None
depends_on = None


def upgrade() -> None:
    op.add_column("projects", sa.Column("is_template", sa.Boolean, nullable=False, server_default="false"))
    
    # Drop the vs_vl_task_templates table as we're switching to template project approach
    op.drop_table("vs_vl_task_templates")


def downgrade() -> None:
    op.drop_column("projects", "is_template")
