from __future__ import annotations

import uuid
from datetime import datetime

from sqlalchemy import CheckConstraint, DateTime, String, func
from sqlalchemy.dialects.postgresql import UUID
from sqlalchemy.orm import Mapped, mapped_column

from app.db import Base


class Department(Base):
    __tablename__ = "departments"
    __table_args__ = (
        CheckConstraint(
            "realization_mode IN ('AUTO', 'SEMI_MANUAL', 'MANUAL')",
            name="ck_departments_realization_mode",
        ),
    )

    id: Mapped[uuid.UUID] = mapped_column(UUID(as_uuid=True), primary_key=True, default=uuid.uuid4)
    name: Mapped[str] = mapped_column(String(100), nullable=False)
    code: Mapped[str] = mapped_column(String(10), unique=True, nullable=False)
    realization_mode: Mapped[str] = mapped_column(
        String(16), nullable=False, server_default="AUTO", default="AUTO"
    )
    created_at: Mapped[datetime] = mapped_column(DateTime(timezone=True), server_default=func.now())

