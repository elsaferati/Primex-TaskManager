"""Make KO the sole assignee of PCM MST/TT CONTROL tasks.

Revision ID: 20260903_control_ko_owner
Revises: 20260903_ga_icloud_sync
"""

from alembic import op


revision = "20260903_control_ko_owner"
down_revision = "20260903_ga_icloud_sync"
branch_labels = None
depends_on = None


CONTROL_TASKS_WITH_KO = """
    SELECT
      t.id AS task_id,
      (substring(
        t.internal_notes
        from 'ko_user_id[:=]\\s*([0-9a-f]{8}-[0-9a-f]{4}-[0-9a-f]{4}-[0-9a-f]{4}-[0-9a-f]{12})'
      ))::uuid AS ko_user_id
    FROM tasks t
    JOIN projects p ON p.id = t.project_id
    JOIN departments d ON d.id = p.department_id
    WHERE upper(coalesce(d.code, '')) = 'PCM'
      AND upper(coalesce(t.phase, '')) = 'CONTROL'
      AND (
        upper(coalesce(p.project_type, '')) = 'MST'
        OR upper(coalesce(p.title, '')) = 'TT'
        OR upper(coalesce(p.title, '')) LIKE 'TT %'
        OR upper(coalesce(p.title, '')) LIKE 'TT-%'
        OR upper(coalesce(p.title, '')) LIKE 'TT:%'
        OR upper(coalesce(p.title, '')) LIKE '%MST%'
      )
      AND t.internal_notes ~* 'ko_user_id[:=]\\s*[0-9a-f]{8}-[0-9a-f]{4}-[0-9a-f]{4}-[0-9a-f]{4}-[0-9a-f]{12}'
"""


def upgrade() -> None:
    op.execute(
        f"""
        WITH control_tasks AS ({CONTROL_TASKS_WITH_KO})
        DELETE FROM task_assignees ta
        USING control_tasks c
        WHERE ta.task_id = c.task_id;

        WITH control_tasks AS ({CONTROL_TASKS_WITH_KO})
        UPDATE tasks t
        SET assigned_to = c.ko_user_id,
            updated_at = now()
        FROM control_tasks c
        WHERE t.id = c.task_id;

        WITH control_tasks AS ({CONTROL_TASKS_WITH_KO})
        INSERT INTO task_assignees (task_id, user_id)
        SELECT task_id, ko_user_id
        FROM control_tasks
        WHERE ko_user_id IS NOT NULL
        ON CONFLICT DO NOTHING;
        """
    )


def downgrade() -> None:
    # Restore the legacy representation where CONTROL carried both the
    # PRODUCT executor and KO. Only rows with a valid origin can be restored.
    op.execute(
        f"""
        WITH control_tasks AS ({CONTROL_TASKS_WITH_KO}),
        linked AS (
          SELECT c.task_id, c.ko_user_id, product.assigned_to AS product_user_id
          FROM control_tasks c
          JOIN tasks control ON control.id = c.task_id
          JOIN tasks product ON product.id = (
            substring(
              control.internal_notes
              from 'origin_task_id[:=]\\s*([0-9a-f]{{8}}-[0-9a-f]{{4}}-[0-9a-f]{{4}}-[0-9a-f]{{4}}-[0-9a-f]{{12}})'
            )
          )::uuid
          WHERE product.assigned_to IS NOT NULL
        )
        UPDATE tasks t
        SET assigned_to = linked.product_user_id,
            updated_at = now()
        FROM linked
        WHERE t.id = linked.task_id;

        WITH control_tasks AS ({CONTROL_TASKS_WITH_KO}),
        linked AS (
          SELECT c.task_id, c.ko_user_id, product.assigned_to AS product_user_id
          FROM control_tasks c
          JOIN tasks control ON control.id = c.task_id
          JOIN tasks product ON product.id = (
            substring(
              control.internal_notes
              from 'origin_task_id[:=]\\s*([0-9a-f]{{8}}-[0-9a-f]{{4}}-[0-9a-f]{{4}}-[0-9a-f]{{4}}-[0-9a-f]{{12}})'
            )
          )::uuid
          WHERE product.assigned_to IS NOT NULL
        )
        INSERT INTO task_assignees (task_id, user_id)
        SELECT task_id, product_user_id FROM linked
        ON CONFLICT DO NOTHING;
        """
    )
