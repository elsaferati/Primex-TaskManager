"""enhance checklist items

Revision ID: 0020_enhance_checklist_items
Revises: 0019_add_common_problems
Create Date: 2025-01-15
"""

from __future__ import annotations

import sqlalchemy as sa
from alembic import op
from sqlalchemy.dialects import postgresql


revision = "0020_enhance_checklist_items"
down_revision = "0019_add_common_problems"
branch_labels = None
depends_on = None


def upgrade() -> None:
    # Create checklist_item_type enum
    checklist_item_type_enum = postgresql.ENUM("TITLE", "COMMENT", "CHECKBOX", name="checklist_item_type", create_type=True)
    checklist_item_type_enum.create(op.get_bind(), checkfirst=True)

    # Add new columns to checklist_items
    op.add_column("checklist_items", sa.Column("item_type", checklist_item_type_enum, nullable=True))
    op.add_column("checklist_items", sa.Column("path", sa.String(), nullable=True))
    op.add_column("checklist_items", sa.Column("title", sa.String(), nullable=True))
    op.add_column("checklist_items", sa.Column("keyword", sa.String(), nullable=True))
    op.add_column("checklist_items", sa.Column("description", sa.String(), nullable=True))
    op.add_column("checklist_items", sa.Column("category", sa.String(), nullable=True))
    op.add_column("checklist_items", sa.Column("comment", sa.String(), nullable=True))
    
    # Make is_checked nullable (it was NOT NULL before)
    op.alter_column("checklist_items", "is_checked", nullable=True)

    # Migrate existing data: set item_type to CHECKBOX, title = content
    op.execute("""
        UPDATE checklist_items 
        SET item_type = 'CHECKBOX',
            title = content
        WHERE item_type IS NULL
    """)

    # Now make item_type NOT NULL
    op.alter_column("checklist_items", "item_type", nullable=False)

    # Create checklist_item_assignees junction table
    op.create_table(
        "checklist_item_assignees",
        sa.Column("checklist_item_id", postgresql.UUID(as_uuid=True), nullable=False),
        sa.Column("user_id", postgresql.UUID(as_uuid=True), nullable=False),
        sa.ForeignKeyConstraint(
            ["checklist_item_id"],
            ["checklist_items.id"],
            ondelete="CASCADE",
        ),
        sa.ForeignKeyConstraint(
            ["user_id"],
            ["users.id"],
            ondelete="CASCADE",
        ),
        sa.PrimaryKeyConstraint("checklist_item_id", "user_id"),
    )
    op.create_index(
        "ix_checklist_item_assignees_checklist_item_id",
        "checklist_item_assignees",
        ["checklist_item_id"],
    )
    op.create_index(
        "ix_checklist_item_assignees_user_id",
        "checklist_item_assignees",
        ["user_id"],
    )

    # Drop the old content column
    op.drop_column("checklist_items", "content")


def downgrade() -> None:
    # Re-add content column
    op.add_column("checklist_items", sa.Column("content", sa.String(), nullable=True))
    
    # Migrate data back: content = title (for CHECKBOX items)
    op.execute("""
        UPDATE checklist_items 
        SET content = title
        WHERE item_type = 'CHECKBOX' AND title IS NOT NULL
    """)
    
    # For other types, use title or comment
    op.execute("""
        UPDATE checklist_items 
        SET content = COALESCE(title, comment, '')
        WHERE content IS NULL
    """)
    
    # Make content NOT NULL
    op.alter_column("checklist_items", "content", nullable=False)
    
    # Make is_checked NOT NULL again
    op.alter_column("checklist_items", "is_checked", nullable=False, server_default="false")

    # Drop junction table
    op.drop_index("ix_checklist_item_assignees_user_id", table_name="checklist_item_assignees")
    op.drop_index("ix_checklist_item_assignees_checklist_item_id", table_name="checklist_item_assignees")
    op.drop_table("checklist_item_assignees")

    # Drop new columns
    op.drop_column("checklist_items", "comment")
    op.drop_column("checklist_items", "category")
    op.drop_column("checklist_items", "description")
    op.drop_column("checklist_items", "keyword")
    op.drop_column("checklist_items", "title")
    op.drop_column("checklist_items", "path")
    op.drop_column("checklist_items", "item_type")

    # Drop enum
    op.execute("DROP TYPE IF EXISTS checklist_item_type")
