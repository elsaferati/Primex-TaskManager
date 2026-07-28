import unittest
from types import SimpleNamespace

from app.services.project_classification import (
    has_mst_identity,
    is_mst_or_tt_project,
    is_mst_project,
    is_tt_project,
    is_vs_or_vl_project,
)


def project(title: str, project_type: str | None = None):
    return SimpleNamespace(title=title, project_type=project_type)


class TestProjectClassification(unittest.TestCase):
    def test_existing_cm_mst_names_remain_mst(self):
        for title in (
            "MST LDB FRANKLIN (24)",
            "MST-LDB QUINCY (22)",
            "MST: TARIO STUHLE & ESSTISCH (20)",
        ):
            with self.subTest(title=title):
                item = project(title)
                self.assertTrue(has_mst_identity(item))
                self.assertTrue(is_mst_project(item))
                self.assertTrue(is_mst_or_tt_project(item))

    def test_existing_cm_tt_prefixes_remain_tt(self):
        for title in (
            "TT: PIM (469)",
            "TT - LIVIQUE CH (63)",
            "TT-PIM TOP 20 ARTICLES (20)",
            "TT XXXLUTZ ENNA (28)",
        ):
            with self.subTest(title=title):
                item = project(title)
                self.assertTrue(is_tt_project(item))
                self.assertFalse(is_mst_project(item))
                self.assertTrue(is_mst_or_tt_project(item))

    def test_legacy_tt_marker_not_at_start_keeps_current_behavior(self):
        item = project("H24 TT- LIST OF SELLING IMAGES")
        self.assertFalse(is_tt_project(item))
        self.assertFalse(is_mst_or_tt_project(item))

    def test_existing_vs_vl_names_remain_vs_vl(self):
        self.assertTrue(is_vs_or_vl_project(project("VS/VL- MANZ PROJECT (96)")))
        self.assertTrue(is_vs_or_vl_project(project("VS/VL - WEINKONTOR FREUND PROJECT (370)")))

    def test_explicit_mst_type_still_wins_without_title_marker(self):
        item = project("LDB MR 365 (600)", project_type="MST")
        self.assertTrue(is_mst_project(item))
        self.assertTrue(is_mst_or_tt_project(item))


if __name__ == "__main__":
    unittest.main()
