"""add project prompt title

Revision ID: 0044_add_project_prompt_title
Revises: 0043_add_meeting_url_recurrence_participants
Create Date: 2026-01-30
"""

from __future__ import annotations

import sqlalchemy as sa
from alembic import op


revision = "0044_add_project_prompt_title"
down_revision = "0043_add_meeting_url_recurrence_participants"
branch_labels = None
depends_on = None


def upgrade() -> None:
    # Add title column to project_prompts table (nullable first)
    op.add_column("project_prompts", sa.Column("title", sa.String(), nullable=True))
    
    # Set default title for existing rows based on content or use "Untitled"
    op.execute("""
        UPDATE project_prompts 
        SET title = CASE 
            WHEN LENGTH(content) > 50 THEN SUBSTRING(content, 1, 50) || '...'
            WHEN LENGTH(TRIM(content)) > 0 THEN TRIM(content)
            ELSE 'Untitled'
        END
        WHERE title IS NULL
    """)
    
    # Now make it NOT NULL with a default
    op.alter_column("project_prompts", "title", nullable=False, server_default="Untitled")


def downgrade() -> None:
    op.drop_column("project_prompts", "title")
