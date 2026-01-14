"""add vs_vl_task_templates table

Revision ID: 0030_add_vs_vl_task_templates
Revises: 0029_merge_task_phase_and_checklists
Create Date: 2026-01-13
"""

from __future__ import annotations

import uuid
from datetime import datetime, timezone

from alembic import op
import sqlalchemy as sa
from sqlalchemy.dialects.postgresql import UUID


revision = "0030_add_vs_vl_task_templates"
down_revision = "0029_merge_task_phase_and_checklists"
branch_labels = None
depends_on = None


def upgrade() -> None:
    op.create_table(
        "vs_vl_task_templates",
        sa.Column("id", UUID(as_uuid=True), primary_key=True, default=uuid.uuid4),
        sa.Column("title", sa.String(255), nullable=False),
        sa.Column("description", sa.Text, nullable=True),
        sa.Column("priority", sa.String(50), nullable=False, server_default="NORMAL"),
        sa.Column("day_offset", sa.Integer, nullable=False, server_default="0"),
        sa.Column("duration_days", sa.Integer, nullable=False, server_default="1"),
        sa.Column("sequence_order", sa.Integer, nullable=False, server_default="0"),
        sa.Column("dependency_template_id", UUID(as_uuid=True), sa.ForeignKey("vs_vl_task_templates.id", ondelete="SET NULL"), nullable=True),
        sa.Column("is_active", sa.Boolean, nullable=False, server_default="true"),
        sa.Column("created_at", sa.DateTime(timezone=True), server_default=sa.func.now()),
        sa.Column("updated_at", sa.DateTime(timezone=True), server_default=sa.func.now(), onupdate=sa.func.now()),
    )
    
    # Seed initial templates
    vs_vl_task_templates = sa.table(
        "vs_vl_task_templates",
        sa.column("id", UUID(as_uuid=True)),
        sa.column("title", sa.String),
        sa.column("description", sa.Text),
        sa.column("priority", sa.String),
        sa.column("day_offset", sa.Integer),
        sa.column("duration_days", sa.Integer),
        sa.column("sequence_order", sa.Integer),
        sa.column("dependency_template_id", UUID(as_uuid=True)),
        sa.column("is_active", sa.Boolean),
        sa.column("created_at", sa.DateTime),
    )
    
    # Create UUIDs for templates so we can reference them for dependencies
    template_ids = {
        "base": uuid.uuid4(),
        "template": uuid.uuid4(),
        "prices": uuid.uuid4(),
    }
    
    now = datetime.now(timezone.utc)
    
    # Insert seed data
    op.bulk_insert(
        vs_vl_task_templates,
        [
            {
                "id": template_ids["base"],
                "title": "ANALIZIMI DHE IDENTIFIKIMI I KOLONAVE",
                "description": "Analizo dhe identifiko kolonat e produkteve",
                "priority": "HIGH",
                "day_offset": 0,
                "duration_days": 2,
                "sequence_order": 1,
                "dependency_template_id": None,
                "is_active": True,
                "created_at": now,
            },
            {
                "id": template_ids["template"],
                "title": "PLOTESIMI I TEMPLATE-IT TE AMAZONIT",
                "description": "Ploteso template-in e Amazonit me te dhenat",
                "priority": "NORMAL",
                "day_offset": 2,
                "duration_days": 1,
                "sequence_order": 2,
                "dependency_template_id": template_ids["base"],
                "is_active": True,
                "created_at": now,
            },
            {
                "id": template_ids["prices"],
                "title": "FUTJA E CMIMEVE",
                "description": "Fut cmimet e produkteve",
                "priority": "NORMAL",
                "day_offset": 3,
                "duration_days": 1,
                "sequence_order": 3,
                "dependency_template_id": template_ids["template"],
                "is_active": True,
                "created_at": now,
            },
        ]
    )


def downgrade() -> None:
    op.drop_table("vs_vl_task_templates")
