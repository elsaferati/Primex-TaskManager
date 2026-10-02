"""Join report migrations with the alternate deployed comments marker."""

revision = "0141_merge_person_comment_ids"
down_revision = ("0140_report_manual_questions", "0136_daily_person_comments")
branch_labels = None
depends_on = None


def upgrade() -> None:
    pass


def downgrade() -> None:
    pass
