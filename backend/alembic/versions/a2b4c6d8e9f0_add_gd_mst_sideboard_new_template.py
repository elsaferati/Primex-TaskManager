"""add gd mst sideboard new template

Revision ID: a2b4c6d8e9f0
Revises: f5a2f1c9b8a0
Create Date: 2026-02-11

"""

from __future__ import annotations

from alembic import op


# revision identifiers, used by Alembic.
revision = "a2b4c6d8e9f0"
down_revision = "f5a2f1c9b8a0"
branch_labels = None
depends_on = None


def upgrade() -> None:
    op.execute(
        "\nWITH existing AS (\n"
        "  SELECT id\n"
        "  FROM checklists\n"
        "  WHERE group_key = 'gd_mst_sideboard_new' AND project_id IS NULL\n"
        "  LIMIT 1\n"
        "),\n"
        "ins AS (\n"
        "  INSERT INTO checklists (title, group_key, project_id, task_id, note, default_owner, default_time, position)\n"
        "  SELECT 'GD MST SIDEBOARD NEW', 'gd_mst_sideboard_new', NULL, NULL, NULL, NULL, NULL, NULL\n"
        "  WHERE NOT EXISTS (SELECT 1 FROM existing)\n"
        "  RETURNING id\n"
        "),\n"
        "target AS (\n"
        "  SELECT id FROM ins\n"
        "  UNION ALL\n"
        "  SELECT id FROM existing\n"
        ")\n"
        "INSERT INTO checklist_items (checklist_id, item_type, position, path, title, keyword, description, is_checked)\n"
        "SELECT\n"
        "  (SELECT id FROM target),\n"
        "  'CHECKBOX',\n"
        "  v.position,\n"
        "  'gd_mst_sideboard_new',\n"
        "  v.title,\n"
        "  v.keyword,\n"
        "  v.description,\n"
        "  false\n"
        "FROM (\n"
        "  VALUES\n"
        "    (0, $$PIKAT E SELLING IMAGE$$, $$PIKAT GJENERALE- SELLING IMAGE_1$$,\n"
        "     $$(Teksti nga foto shembull): 1. Front und Oberplatte aus glänzendem Glas. 2. Soft-Close Scharniere. 3. Hochwertige Metallgriffe. 4. ABS-Kanten.$$),\n"
        "    (1, $$PIKAT E SELLING IMAGE$$, $$PIKAT GJENERALE- SELLING IMAGE_2$$,\n"
        "     $$Selling image_2 L/R (Mounting Options). Teksti duhet te jete Front links oder rechts montierbar ose Modernes Sideboard mit drei Varianten ( Kategoria + Nese produkti ka me shume variante ). Produkti duhet te jete ne vij te njejt e majta dhe e djathta jo njera me lart tjetra me posht.$$),\n"
        "    (2, $$PIKAT E SELLING IMAGE$$, $$PIKAT GJENERALE- SELLING IMAGE_3$$,\n"
        "     $$Selling image_3 Varacione. Foto e background duhet te jete gjithmon white background perspektiv. Duhet te I kete 4 katrora me te dhena: 1. Duhet te jete teksti Farbauswahl dhe ngjyra e varacionit te ndryshohet varesisht nga produkti. 2. Nuk ndryshon. Teksti: Metallfüsse: 3 kembet e vitrinet dhe 3 ngjyrat e kembve. 3. Teksti Sockel dhe foto duhet te ndryshohet njejt si ngjyra e produktit, foto duhet te vendoset ne pozicion njejt si ne template jo me lart ose me posht. 4. Teksti Gleiter dhe foto duhet te jete e produktit pa kembe dhe te vendoset njejt si ne template.$$),\n"
        "    (3, $$PIKAT E SELLING IMAGE$$, $$LOGO$$,\n"
        "     $$1. Gjithmone logo e klientit e konfirmuar me email (Set One) ose (MST) vendoset larte majtas fotos. 2. Gjithmone logoja e garancise 5 vite vendoset poshte majtas fotos. Ne baze te ngjyrave te fotos zgjedhen edhe ngjyrat e logos qe do te perdorim. BACKGORUNDED QE KANE NGJYRE TE ERRET PERDORET LOGO E BARDHE. BACKGROUNDET QE KANE NGJYRE TE HAPUR PERDORET LOGO E ZEZE. Në të 3 Selling Images përdoret e njëjta logo e KONF, në pozicion fiks dhe të pandryshueshëm. E njëjta gjë vlen edhe për ikonën e garancisë.$$),\n"
        "    (4, $$PIKAT E SELLING IMAGE$$, $$BACKGROUND$$,\n"
        "     $$Ne Background gjithmon vendoset fotoja e setit. Nese nuk ka foto ne set ateher vendoset foto e type me background. Foto e background nuk duhet të preket me kockat -> duhet të ketë hapësirë mes kockave dhe setit mbrapa.$$),\n"
        "    (5, $$PIKAT E SELLING IMAGE$$, $$EMERTIMI$$,\n"
        "     $$MST: Selling image 1 duhet gjithmone te emertohet kodi i produktit SKU (KODI I MST) dhe _1. MST: Selling image 2 (Dimensionet / L/R ) duhet gjithmone te emertohet kodi i produktit SKU (KODI I MST) dhe _2. MST: Selling image 3 (Variacioni) duhet gjithmone te emertohet kodi i produktit SKU (KODI I MST) dhe _3.$$),\n"
        "    (6, $$PIKAT E SELLING IMAGE$$, $$EMERTIMI$$,\n"
        "     $$OTTO: Selling image 1 duhet gjithmone te emertohet kodi i produktit Article code (KODI I OTTOs) dhe _1. Kur behet emertimi i fotove me kod te OTTOs duhet te kemi shume kujdes dhe patjeter te behen 2 kontrolla.$$)\n"
        ") AS v(position, title, keyword, description)\n"
        "WHERE NOT EXISTS (\n"
        "  SELECT 1 FROM checklist_items ci\n"
        "  WHERE ci.checklist_id = (SELECT id FROM target)\n"
        "    AND lower(trim(coalesce(ci.title, ''))) = lower(trim(coalesce(v.title, '')))\n"
        "    AND lower(trim(coalesce(ci.keyword, ''))) = lower(trim(coalesce(v.keyword, '')))\n"
        "    AND lower(trim(coalesce(ci.description, ''))) = lower(trim(coalesce(v.description, '')))\n"
        ");\n"
    )


def downgrade() -> None:
    pass
