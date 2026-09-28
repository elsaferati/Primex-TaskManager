import unittest
import uuid
from types import SimpleNamespace
from unittest.mock import AsyncMock, MagicMock, patch

from app.api.routers.tasks import _create_pcm_control_for_product, _pcm_control_title


class TestPcmControlTitleCreation(unittest.IsolatedAsyncioTestCase):
    def test_existing_ko_prefix_is_not_duplicated(self) -> None:
        self.assertEqual(_pcm_control_title("KO TAVIA IMAGES"), "KO TAVIA IMAGES")
        self.assertEqual(_pcm_control_title("ko TAVIA IMAGES"), "ko TAVIA IMAGES")

    async def test_new_control_gets_ko_prefix_and_existing_control_stays_unchanged(self) -> None:
        project_id = uuid.uuid4()
        product = SimpleNamespace(
            id=uuid.uuid4(),
            project_id=project_id,
            phase="PRODUCT",
            title="TAVIA IMAGES FSHIRJA E 5-JAHRE LOGO",
            description=None,
            internal_notes=None,
            daily_products=None,
            created_by=uuid.uuid4(),
            priority="NORMAL",
            finish_period=None,
            start_date=None,
            is_deadline_important=False,
        )
        project = SimpleNamespace(id=project_id, department_id=uuid.uuid4())

        department_result = MagicMock()
        department_result.scalar_one_or_none.return_value = "PCM"
        controls_result = MagicMock()
        controls_result.scalars.return_value.all.return_value = []
        db = AsyncMock()
        db.add = MagicMock()
        db.execute.side_effect = [department_result, controls_result]

        with (
            patch("app.api.routers.tasks._is_mst_or_tt_project", return_value=True),
            patch("app.api.routers.tasks.add_audit_log"),
        ):
            created = await _create_pcm_control_for_product(db, product_task=product, project=project)

        self.assertIsNotNone(created)
        self.assertEqual(created.title, "KO TAVIA IMAGES FSHIRJA E 5-JAHRE LOGO")
        self.assertEqual(product.title, "TAVIA IMAGES FSHIRJA E 5-JAHRE LOGO")
        db.add.assert_called_once_with(created)

        existing = SimpleNamespace(title="TAVIA IMAGES FSHIRJA E 5-JAHRE LOGO", internal_notes=f"origin_task_id={product.id}")
        existing_controls_result = MagicMock()
        existing_controls_result.scalars.return_value.all.return_value = [existing]
        db.execute.side_effect = [department_result, existing_controls_result]
        db.add.reset_mock()

        with patch("app.api.routers.tasks._is_mst_or_tt_project", return_value=True):
            result = await _create_pcm_control_for_product(db, product_task=product, project=project)

        self.assertIs(result, existing)
        self.assertEqual(existing.title, "TAVIA IMAGES FSHIRJA E 5-JAHRE LOGO")
        db.add.assert_not_called()


if __name__ == "__main__":
    unittest.main()
