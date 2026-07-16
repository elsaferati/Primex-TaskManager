"""add database-backed question library

Revision ID: 0091_add_question_library
Revises: 0090_add_hot_path_indexes
Create Date: 2026-07-15
"""

from __future__ import annotations

import uuid

import sqlalchemy as sa
from alembic import op
from sqlalchemy.dialects import postgresql


revision = "0091_add_question_library"
down_revision = "0090_add_hot_path_indexes"
branch_labels = None
depends_on = None


SEED_CATEGORIES = [
    (
        "PYETJE PËR DETYRË TË RE",
        [
            ("Kush është përgjegjës?", "Emri i personit ose ekipit që e kryen detyrën"),
            ("Çka duhet të kryhet?", "Përshkrim i qartë i detyrës"),
            ("Kur duhet të kryhet?", "Afati i plotë: data + ora, nëse nevojitet"),
            ("Sa urgjente është?", "E lartë / Mesatare / E ulët"),
            ("Si kryhet detyra?", "Hapat ose metoda e punës"),
            ("Ku duhet të raportohet?", "Sistemi, platforma ose personi"),
            ("Kujt duhet t'i dërgohet?", "Marrësi final i rezultatit"),
            ("A është lexuar komplet detyra?", "Po / Jo - konfirmim i leximit"),
            ("A janë kuptuar të gjitha pikat?", "Po / Jo - konfirmim i kuptimit"),
            ("Nëse diçka nuk dihet?", "Propozimi ose pyetja për sqarim"),
        ],
    ),
    (
        "PYETJE PËR SHUMË PRODUKTE",
        [
            ("Sa produkte janë gjithsej?", "Numri total i produkteve"),
            ("Me cilat produkte fillojmë?", "Produkti ose grupi i parë"),
            ("Cilat kanë prioritet?", "Lista ose kriteret e prioritetit"),
            ("Pse kanë prioritet?", "Arsyeja e prioritetit"),
            ("Sa janë kryer?", "Numri i produkteve të gatshme"),
            ("Sa kanë mbetur?", "Numri i produkteve të papërfunduara"),
            ("A jemi brenda mesatares?", "Po / Jo - krahasim me normen"),
            ("Sa është mesatarja normale?", "Standardi i pritur (p.sh. 20 produkte/ditë)"),
            ("A ka vonesë?", "Po / Jo - nëse po, sa ditë"),
            ("Çka bëjmë për ta përshpejtuar?", "Plani i aksionit për shpejtim"),
        ],
    ),
    (
        "PYETJE PËR KO1/KO2",
        [
            ("A i kemi të gjitha dokumentet, definimet dhe rregulloret e projektit?", "PYETËSOR - KONTROLLA 1 / PARA FILLIMIT TË KONTROLLËS"),
            ("A janë të gjitha dokumentet e printuara?", "PYETËSOR - KONTROLLA 1 / PARA FILLIMIT TË KONTROLLËS"),
            ("A e kam lexuar dhe kuptuar dokumentin nga fillimi deri në fund, jo vetëm sipërfaqësisht?", "PYETËSOR - KONTROLLA 1 / PARA FILLIMIT TË KONTROLLËS"),
            ("A e kam krahasuar çdo rresht me dokumentin origjinal, jo vetëm përmbajtjen?", "KONTROLLA 1 - VETËKONTROLLI I PUNUESIT"),
            ("A janë kontrolluar të gjitha fotot dhe imazhet (numri, pozicioni)?", "KONTROLLA 1 - VETËKONTROLLI I PUNUESIT"),
            ("A janë kontrolluar ikonat (lloji, madhësia, pozicioni)?", "KONTROLLA 1 - VETËKONTROLLI I PUNUESIT"),
            ("A është kontrolluar renditja e elementeve dhe përputhja e tyre me rregullat?", "KONTROLLA 1 - VETËKONTROLLI I PUNUESIT"),
            ("A është kontrolluar struktura e përgjithshme (formatimi, hierarkia)?", "KONTROLLA 1 - VETËKONTROLLI I PUNUESIT"),
            ("A janë kontrolluar vijat dhe ndarjet (borders, spacing, alignment)?", "KONTROLLA 1 - VETËKONTROLLI I PUNUESIT"),
            ("A jam siguruar që nuk kam kontrolluar përmendësh, por kam krahasuar realisht rresht për rresht?", "KONTROLLA 1 - VETËKONTROLLI I PUNUESIT"),
            ("A janë shënuar të gjitha gabimet e gjetura para se të kalohet në Kontrollën 2?", "KONTROLLA 1 - VETËKONTROLLI I PUNUESIT"),
            ("A i kemi të gjitha dokumentet, definimet dhe rregulloret e projektit?", "PYETËSOR - KONTROLLA 2 / PARA FILLIMIT TË KONTROLLËS"),
            ("A janë të gjitha dokumentet e printuara?", "PYETËSOR - KONTROLLA 2 / PARA FILLIMIT TË KONTROLLËS"),
            ("A e kam lexuar dhe kuptuar dokumentin nga fillimi deri në fund, jo vetëm sipërfaqësisht?", "PYETËSOR - KONTROLLA 2 / PARA FILLIMIT TË KONTROLLËS"),
            ("A e kam marrë dokumentin/rregulloren e printuar para se të filloj?", "KONTROLLA 2 - KONTROLL I PAVARUR"),
            ("A e kam lexuar udhëzimin/rregulloren pa e ditur paraprakisht përmbajtjen e punës së bërë?", "KONTROLLA 2 - KONTROLL I PAVARUR"),
            ("A mund ta bëjë këtë kontroll dikush që nuk ka lidhje me projektin, thjesht duke ndjekur këtë pyetësor?", "KONTROLLA 2 - KONTROLL I PAVARUR"),
            ("A janë krahasuar të gjitha detajet (rresht, foto, ikonë, renditje, strukturë, vijë), jo vetëm teksti?", "KONTROLLA 2 - KONTROLL I PAVARUR"),
            ("A janë verifikuar korrigjimet nga Kontrolla 1 si të zbatuara saktë?", "KONTROLLA 2 - KONTROLL I PAVARUR"),
            ("A ka gabime shtesë të gjetura që Kontrolla 1 i ka lëshuar?", "KONTROLLA 2 - KONTROLL I PAVARUR"),
            ("A është produkti/dokumenti gati për dorëzim ose publikim pas kësaj kontrolle?", "KONTROLLA 2 - KONTROLL I PAVARUR"),
        ],
    ),
    (
        "PYETJE PËR PROJEKT TË RI",
        [
            ("A është hapur grupi në Teams?", None),
            ("A është hapur projekti në ChatGPT?", None),
            ("A janë pranuar të gjitha dokumentet e nevojshme (PDF, Stammdaten, Artikelliste)?", None),
            ("A janë analizuar kategoria dhe PDF-i?", None),
            ("A janë identifikuar karakteristikat e programit?", None),
            ("A ka plan se kur pritet të përfundohet projekti?", None),
            ("Cila pjesë ka prioritet me u përfundu?", None),
            ("A duhet të fillohet nga fillimi (top) apo nga sasia më e madhe?", None),
            ("A i kemi caktuar të gjithë punëtorët që kemi mundur në projekt?", None),
            ("A janë shënuar me tik punët që janë bërë done?", None),
            ("A është hapur projekti në PrimeFlow?", None),
        ],
    ),
    (
        "PYETJE PËR BARAZIM",
        [
            ("A është hapur detyra?", "Po / Jo"),
            ("A janë lexuar shënimet?", "Po / Jo"),
            ("A po punohet sipas rendit?", "Po / Jo - nëse jo, arsyeja"),
            ("A ka ndonjë paqartësi?", "Po / Jo - nëse po, çka"),
            ("A duhet sqarim nga përgjegjësi?", "Po / Jo - nëse po, kush sqaron"),
            ("A është kryer çdo pikë?", "Po / Jo - ose % e përfundimit"),
            ("A është raportuar rezultati?", "Po / Jo - ku dhe kur"),
        ],
    ),
    (
        "PYETJE PËR PROBLEME URGJENTE",
        [
            ("Cili është problemi?", "Përshkrim i shkurtër dhe i qartë"),
            ("Kur është vërejtur?", "Data dhe ora e zbulimit"),
            ("Kush e ka vërejtur?", "Emri i personit"),
            ("Sa urgjent është?", "Kritik / I lartë / Mesatar"),
            ("A ndikon te puna / klienti?", "Po / Jo - efekti konkret"),
            ("A rregullohet shpejt?", "Po / Jo - vlerësim fillestar"),
            ("Sa kohë merr zgjidhja?", "Vlerësimi i kohës (min / orë / ditë)"),
            ("Kush po merret me zgjidhjen?", "Emri i personit përgjegjës"),
            ("A është informuar përgjegjësi?", "Po / Jo - kur dhe si"),
        ],
    ),
]


def upgrade() -> None:
    op.create_table(
        "question_categories",
        sa.Column("id", postgresql.UUID(as_uuid=True), nullable=False),
        sa.Column("name", sa.String(length=200), nullable=False),
        sa.Column("normalized_name", sa.String(length=200), nullable=False),
        sa.Column("sort_order", sa.Integer(), server_default=sa.text("0"), nullable=False),
        sa.Column("created_by_user_id", postgresql.UUID(as_uuid=True), nullable=True),
        sa.Column("created_at", sa.DateTime(timezone=True), server_default=sa.text("now()"), nullable=False),
        sa.Column("updated_at", sa.DateTime(timezone=True), server_default=sa.text("now()"), nullable=False),
        sa.ForeignKeyConstraint(["created_by_user_id"], ["users.id"], ondelete="SET NULL"),
        sa.PrimaryKeyConstraint("id"),
        sa.UniqueConstraint("normalized_name"),
    )
    op.create_index("ix_question_categories_sort_order", "question_categories", ["sort_order"])

    op.create_table(
        "question_definitions",
        sa.Column("id", postgresql.UUID(as_uuid=True), nullable=False),
        sa.Column("category_id", postgresql.UUID(as_uuid=True), nullable=False),
        sa.Column("text", sa.Text(), nullable=False),
        sa.Column("guidance", sa.Text(), nullable=True),
        sa.Column("sort_order", sa.Integer(), server_default=sa.text("0"), nullable=False),
        sa.Column("created_by_user_id", postgresql.UUID(as_uuid=True), nullable=True),
        sa.Column("created_at", sa.DateTime(timezone=True), server_default=sa.text("now()"), nullable=False),
        sa.Column("updated_at", sa.DateTime(timezone=True), server_default=sa.text("now()"), nullable=False),
        sa.ForeignKeyConstraint(["category_id"], ["question_categories.id"], ondelete="CASCADE"),
        sa.ForeignKeyConstraint(["created_by_user_id"], ["users.id"], ondelete="SET NULL"),
        sa.PrimaryKeyConstraint("id"),
    )
    op.create_index("ix_question_definitions_category_id", "question_definitions", ["category_id"])
    op.create_index("ix_question_definitions_sort_order", "question_definitions", ["sort_order"])

    op.create_table(
        "question_user_statuses",
        sa.Column("id", postgresql.UUID(as_uuid=True), nullable=False),
        sa.Column("question_id", postgresql.UUID(as_uuid=True), nullable=False),
        sa.Column("user_id", postgresql.UUID(as_uuid=True), nullable=False),
        sa.Column("status", sa.String(length=16), nullable=False),
        sa.Column("updated_at", sa.DateTime(timezone=True), server_default=sa.text("now()"), nullable=False),
        sa.CheckConstraint("status IN ('DONE', 'X', 'O')", name="ck_question_user_status_value"),
        sa.ForeignKeyConstraint(["question_id"], ["question_definitions.id"], ondelete="CASCADE"),
        sa.ForeignKeyConstraint(["user_id"], ["users.id"], ondelete="CASCADE"),
        sa.PrimaryKeyConstraint("id"),
        sa.UniqueConstraint("question_id", "user_id", name="uq_question_user_status"),
    )
    op.create_index("ix_question_user_statuses_question_id", "question_user_statuses", ["question_id"])
    op.create_index("ix_question_user_statuses_user_id", "question_user_statuses", ["user_id"])
    op.create_index("ix_question_user_statuses_updated_at", "question_user_statuses", ["updated_at"])

    op.create_table(
        "question_status_events",
        sa.Column("id", postgresql.UUID(as_uuid=True), nullable=False),
        sa.Column("question_id", postgresql.UUID(as_uuid=True), nullable=False),
        sa.Column("user_id", postgresql.UUID(as_uuid=True), nullable=True),
        sa.Column("user_full_name", sa.String(length=100), nullable=False),
        sa.Column("status", sa.String(length=16), nullable=True),
        sa.Column("created_at", sa.DateTime(timezone=True), server_default=sa.text("now()"), nullable=False),
        sa.CheckConstraint("status IS NULL OR status IN ('DONE', 'X', 'O')", name="ck_question_status_event_value"),
        sa.ForeignKeyConstraint(["question_id"], ["question_definitions.id"], ondelete="CASCADE"),
        sa.ForeignKeyConstraint(["user_id"], ["users.id"], ondelete="SET NULL"),
        sa.PrimaryKeyConstraint("id"),
    )
    op.create_index("ix_question_status_events_question_id", "question_status_events", ["question_id"])
    op.create_index("ix_question_status_events_user_id", "question_status_events", ["user_id"])
    op.create_index("ix_question_status_events_created_at", "question_status_events", ["created_at"])

    categories_table = sa.table(
        "question_categories",
        sa.column("id", postgresql.UUID(as_uuid=True)),
        sa.column("name", sa.String(length=200)),
        sa.column("normalized_name", sa.String(length=200)),
        sa.column("sort_order", sa.Integer()),
    )
    questions_table = sa.table(
        "question_definitions",
        sa.column("id", postgresql.UUID(as_uuid=True)),
        sa.column("category_id", postgresql.UUID(as_uuid=True)),
        sa.column("text", sa.Text()),
        sa.column("guidance", sa.Text()),
        sa.column("sort_order", sa.Integer()),
    )
    category_rows = []
    question_rows = []
    for category_order, (name, questions) in enumerate(SEED_CATEGORIES):
        category_id = uuid.uuid4()
        category_rows.append(
            {"id": category_id, "name": name, "normalized_name": name.casefold(), "sort_order": category_order}
        )
        for question_order, (question_text, guidance) in enumerate(questions):
            question_rows.append(
                {
                    "id": uuid.uuid4(),
                    "category_id": category_id,
                    "text": question_text,
                    "guidance": guidance,
                    "sort_order": question_order,
                }
            )
    op.bulk_insert(categories_table, category_rows)
    op.bulk_insert(questions_table, question_rows)


def downgrade() -> None:
    op.drop_table("question_status_events")
    op.drop_table("question_user_statuses")
    op.drop_table("question_definitions")
    op.drop_table("question_categories")
