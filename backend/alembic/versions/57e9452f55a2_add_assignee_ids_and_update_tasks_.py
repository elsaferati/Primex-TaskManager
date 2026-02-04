"""add_assignee_ids_and_update_tasks_constraint

Revision ID: 57e9452f55a2
Revises: fc9a8516095c
Create Date: 2026-02-04 10:59:31.628527

"""
from __future__ import annotations

from alembic import op
import sqlalchemy as sa
from sqlalchemy.dialects import postgresql


# revision identifiers, used by Alembic.
revision = '57e9452f55a2'
down_revision = 'fc9a8516095c'
branch_labels = None
depends_on = None


def upgrade():
    connection = op.get_bind()
    
    # Step 1: Add assignee_ids array column to system_task_templates (if it doesn't exist)
    result = connection.execute(sa.text("""
        SELECT 1 FROM information_schema.columns 
        WHERE table_name = 'system_task_templates' 
        AND column_name = 'assignee_ids'
    """))
    if result.scalar() is None:
        op.add_column(
            'system_task_templates',
            sa.Column('assignee_ids', postgresql.ARRAY(postgresql.UUID(as_uuid=True)), nullable=True)
        )
    
    # Step 2: Migrate existing assignees from task_assignees to assignee_ids array
    op.execute("""
        UPDATE system_task_templates stt
        SET assignee_ids = subquery.assignee_array
        FROM (
            SELECT 
                t.system_template_origin_id as template_id,
                ARRAY_AGG(DISTINCT ta.user_id ORDER BY ta.user_id) as assignee_array
            FROM tasks t
            JOIN task_assignees ta ON t.id = ta.task_id
            WHERE t.system_template_origin_id IS NOT NULL
            GROUP BY t.system_template_origin_id
        ) subquery
        WHERE stt.id = subquery.template_id
    """)
    
    # Step 3: Also add default_assignee_id to the array if it's not already there
    op.execute("""
        UPDATE system_task_templates stt
        SET assignee_ids = CASE 
            WHEN assignee_ids IS NULL THEN ARRAY[default_assignee_id]
            WHEN default_assignee_id IS NOT NULL AND NOT (default_assignee_id = ANY(assignee_ids)) 
                THEN assignee_ids || ARRAY[default_assignee_id]
            ELSE assignee_ids
        END
        WHERE default_assignee_id IS NOT NULL
    """)
    
    # Step 4: Drop the old unique constraint on tasks table (if it exists)
    result = connection.execute(sa.text("""
        SELECT 1 FROM pg_constraint 
        WHERE conrelid = 'tasks'::regclass 
        AND conname = 'uq_tasks_system_template_origin_id'
    """))
    if result.scalar() is not None:
        op.drop_constraint('uq_tasks_system_template_origin_id', 'tasks', type_='unique')
    
    # Step 5: Create immutable function for date extraction (needed for unique index)
    op.execute("""
        CREATE OR REPLACE FUNCTION immutable_date(timestamp with time zone)
        RETURNS date
        LANGUAGE sql
        IMMUTABLE
        AS $$
            SELECT $1::date;
        $$;
    """)
    
    # Step 5.5: Clean up duplicate tasks (same template, same user, same date)
    # Keep the task with the highest ID (most recent), delete older duplicates
    op.execute("""
        DELETE FROM tasks t1
        WHERE t1.system_template_origin_id IS NOT NULL
        AND EXISTS (
            SELECT 1 FROM tasks t2
            WHERE t2.system_template_origin_id = t1.system_template_origin_id
            AND t2.assigned_to = t1.assigned_to
            AND immutable_date(t2.start_date) = immutable_date(t1.start_date)
            AND t2.id > t1.id
        )
    """)
    
    # Step 6: Create new unique index: one task per template per user per date (if it doesn't exist)
    result = connection.execute(sa.text("""
        SELECT 1 FROM pg_indexes 
        WHERE tablename = 'tasks' 
        AND indexname = 'uq_tasks_system_template_user_date'
    """))
    if result.scalar() is None:
        op.execute("""
            CREATE UNIQUE INDEX uq_tasks_system_template_user_date 
            ON tasks (system_template_origin_id, assigned_to, immutable_date(start_date))
            WHERE system_template_origin_id IS NOT NULL
        """)


def downgrade():
    # Drop the new unique index
    op.drop_index('uq_tasks_system_template_user_date', table_name='tasks')
    
    # Drop the immutable function
    op.execute("DROP FUNCTION IF EXISTS immutable_date(timestamp with time zone)")
    
    # Restore the old unique constraint
    op.create_unique_constraint(
        'uq_tasks_system_template_origin_id',
        'tasks',
        ['system_template_origin_id']
    )
    
    # Remove assignee_ids column
    op.drop_column('system_task_templates', 'assignee_ids')
