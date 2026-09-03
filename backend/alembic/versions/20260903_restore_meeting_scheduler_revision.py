"""Restore the deployed meeting scheduler revision to the migration graph.

Revision ID: 20260903_meeting_scheduler
Revises: 20260903_control_ko_owner

This revision was applied to production from an untracked file and was later
removed by the deployment workspace cleanup.  Keeping this compatibility
anchor lets Alembic recognize the production revision without replaying DDL.
"""

from __future__ import annotations


revision = "20260903_meeting_scheduler"
down_revision = "20260903_control_ko_owner"
branch_labels = None
depends_on = None


def upgrade() -> None:
    pass


def downgrade() -> None:
    pass
