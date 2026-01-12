"""refactor phases and status

Revision ID: refactor_phases_and_status
Revises: isolated_vs_items
Create Date: 2026-01-09 12:45:00.000000

"""
from alembic import op
import sqlalchemy as sa
from sqlalchemy.dialects import postgresql

# revision identifiers, used by Alembic.
revision = 'refactor_phases_and_status'
down_revision = 'isolated_vs_items'
branch_labels = None
depends_on = None

def upgrade():
    # 1. Convert Enum columns to String to avoid dependency on Postgres Enum types
    # This makes the system more robust against missing/mismatched Enum types
    
    # Projects table
    op.execute("ALTER TABLE projects ALTER COLUMN current_phase TYPE VARCHAR(50) USING current_phase::VARCHAR(50)")
    op.execute("ALTER TABLE projects ALTER COLUMN status TYPE VARCHAR(50) USING status::VARCHAR(50)")
    
    # Tasks table
    op.execute("ALTER TABLE tasks ALTER COLUMN priority DROP DEFAULT")
    op.execute("ALTER TABLE tasks ALTER COLUMN phase TYPE VARCHAR(50) USING phase::VARCHAR(50)")
    op.execute("ALTER TABLE tasks ALTER COLUMN status TYPE VARCHAR(50) USING status::VARCHAR(50)")
    op.execute("ALTER TABLE tasks ALTER COLUMN priority TYPE VARCHAR(50) USING priority::VARCHAR(50)")
    op.execute("ALTER TABLE tasks ALTER COLUMN finish_period TYPE VARCHAR(50) USING finish_period::VARCHAR(50)")

    # System task templates table
    op.execute("ALTER TABLE system_task_templates ALTER COLUMN priority DROP DEFAULT")
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
    op.execute("ALTER TABLE system_task_templates ALTER COLUMN priority TYPE VARCHAR(50) USING priority::VARCHAR(50)")
    op.execute("ALTER TABLE system_task_templates ALTER COLUMN finish_period TYPE VARCHAR(50) USING finish_period::VARCHAR(50)")
    op.execute("ALTER TABLE system_task_templates ALTER COLUMN scope TYPE VARCHAR(50) USING scope::VARCHAR(50)")
    op.execute("ALTER TABLE system_task_templates ALTER COLUMN frequency TYPE VARCHAR(50) USING frequency::VARCHAR(50)")

    # 2. Migrate existing data names
    # Mapping
    migrations = [
        ('TAKIMET', 'MEETINGS'),
        ('PLANIFIKIMI', 'PLANNING'),
        ('ZHVILLIMI', 'DEVELOPMENT'),
        ('TESTIMI', 'TESTING'),
        ('DOKUMENTIMI', 'DOCUMENTATION'),
        ('PRODUKTE', 'PRODUCT'),
        ('KONTROLLI', 'CONTROL'),
        ('FINALIZIMI', 'FINAL'),
        ('MBYLLUR', 'CLOSED'),
        ('AMAZONE', 'AMAZON'),
        ('PROJECT_ACCEPTANCE', 'PLANNING'),
    ]
    
    for old, new in migrations:
        op.execute(f"UPDATE projects SET current_phase = '{new}' WHERE current_phase = '{old}'")
        op.execute(f"UPDATE tasks SET phase = '{new}' WHERE phase = '{old}'")

    # 3. Update defaults
    op.execute("ALTER TABLE projects ALTER COLUMN current_phase SET DEFAULT 'MEETINGS'")
    op.execute("ALTER TABLE projects ALTER COLUMN status SET DEFAULT 'TODO'")
    op.execute("ALTER TABLE tasks ALTER COLUMN phase SET DEFAULT 'MEETINGS'")
    op.execute("ALTER TABLE tasks ALTER COLUMN status SET DEFAULT 'TODO'")
    op.execute("ALTER TABLE tasks ALTER COLUMN priority SET DEFAULT 'NORMAL'")

    # 4. Cleanup weird statuses
    op.execute("UPDATE projects SET status = 'TODO' WHERE status NOT IN ('TODO', 'IN_PROGRESS', 'DONE')")
    op.execute("UPDATE tasks SET status = 'TODO' WHERE status NOT IN ('TODO', 'IN_PROGRESS', 'DONE')")

def downgrade():
    # Convert back if needed, but we keep them as VARCHAR for simplicity
    op.execute("ALTER TABLE projects ALTER COLUMN current_phase SET DEFAULT 'TAKIMET'")
    op.execute("ALTER TABLE tasks ALTER COLUMN phase SET DEFAULT 'TAKIMET'")
