import unittest
import uuid
from types import SimpleNamespace
from unittest.mock import AsyncMock, MagicMock, patch

from app.api.routers.tasks import _create_pcm_control_for_product
from app.models.enums import ProjectPhaseStatus, TaskPriority


class TestPcmControlAutoCreation(unittest.IsolatedAsyncioTestCase):
    async def test_creates_control_linked_by_product_id(self) -> None:
        product_id = uuid.uuid4()
        project_id = uuid.uuid4()
        department_id = uuid.uuid4()
        creator_id = uuid.uuid4()
        product = SimpleNamespace(
            id=product_id,
            title="Same title is allowed",
            description=None,
            internal_notes="total_products=15; completed_products=0",
            daily_products=15,
            project_id=project_id,
            department_id=department_id,
            assigned_to=uuid.uuid4(),
            created_by=creator_id,
            status="TODO",
            priority=TaskPriority.NORMAL,
            finish_period=None,
            phase=ProjectPhaseStatus.PRODUCT,
            start_date=None,
            is_deadline_important=False,
        )
        project = SimpleNamespace(id=project_id, department_id=department_id)
        department_result = MagicMock()
        department_result.scalar_one_or_none.return_value = "PCM"
        controls_result = MagicMock()
        controls_result.scalars.return_value.all.return_value = []
        db = AsyncMock()
        db.add = MagicMock()
        db.execute.side_effect = [department_result, controls_result]

        with (
            patch("app.api.routers.tasks._is_mst_or_tt_project", return_value=True),
            patch("app.api.routers.tasks.add_audit_log") as audit,
        ):
            control = await _create_pcm_control_for_product(db, product_task=product, project=project)

        self.assertIsNotNone(control)
        self.assertEqual(control.phase, "CONTROL")
        self.assertIsNone(control.assigned_to)
        self.assertIn(f"origin_task_id={product_id}", control.internal_notes)
        self.assertIn("total_products=15", control.internal_notes)
        db.add.assert_called_once_with(control)
        db.flush.assert_awaited_once()
        audit.assert_called_once()

    async def test_returns_existing_control_for_same_origin(self) -> None:
        product_id = uuid.uuid4()
        project_id = uuid.uuid4()
        department_id = uuid.uuid4()
        product = SimpleNamespace(
            id=product_id,
            project_id=project_id,
            phase="PRODUCT",
        )
        project = SimpleNamespace(id=project_id, department_id=department_id)
        existing = SimpleNamespace(internal_notes=f"origin_task_id={product_id}")
        department_result = MagicMock()
        department_result.scalar_one_or_none.return_value = "PCM"
        controls_result = MagicMock()
        controls_result.scalars.return_value.all.return_value = [existing]
        db = AsyncMock()
        db.add = MagicMock()
        db.execute.side_effect = [department_result, controls_result]

        with patch("app.api.routers.tasks._is_mst_or_tt_project", return_value=True):
            result = await _create_pcm_control_for_product(db, product_task=product, project=project)

        self.assertIs(result, existing)
        db.add.assert_not_called()


if __name__ == "__main__":
    unittest.main()
