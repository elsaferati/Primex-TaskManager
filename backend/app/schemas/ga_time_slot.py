import uuid
import re
from datetime import datetime, time

from pydantic import BaseModel, Field, field_validator


class GaTimeSlotFormatting(BaseModel):
    background_color: str = "#FFFFFF"
    text_color: str = "#0F172A"
    is_bold: bool = False
    is_italic: bool = False

    @field_validator("background_color", "text_color")
    @classmethod
    def validate_hex_color(cls, value: str) -> str:
        normalized = value.strip().upper()
        if not re.fullmatch(r"#[0-9A-F]{6}", normalized):
            raise ValueError("Color must use #RRGGBB format")
        return normalized


class GaTimeSlotEntryIn(GaTimeSlotFormatting):
    day_of_week: int
    start_time: time
    end_time: time
    content: str
    user_id: uuid.UUID | None = None


class GaTimeSlotEntryUpdate(BaseModel):
    content: str
    background_color: str | None = None
    text_color: str | None = None
    is_bold: bool | None = None
    is_italic: bool | None = None

    @field_validator("background_color", "text_color")
    @classmethod
    def validate_optional_hex_color(cls, value: str | None) -> str | None:
        if value is None:
            return None
        normalized = value.strip().upper()
        if not re.fullmatch(r"#[0-9A-F]{6}", normalized):
            raise ValueError("Color must use #RRGGBB format")
        return normalized


class GaTimeSlotEntryOut(GaTimeSlotFormatting):
    id: uuid.UUID
    user_id: uuid.UUID
    day_of_week: int
    start_time: time
    end_time: time
    content: str
    created_at: datetime
    updated_at: datetime


class GaTimeTableRowIn(BaseModel):
    start_time: time
    end_time: time
    comment: str = Field(default="", max_length=2000)


class GaTimeTableRowCommentUpdate(BaseModel):
    start_time: time
    end_time: time
    comment: str = Field(default="", max_length=2000)


class GaTimeTableRowsUpdate(BaseModel):
    rows: list[GaTimeTableRowIn]


class GaTimeTableRowOut(BaseModel):
    id: uuid.UUID | None = None
    sort_order: int
    nr_label: str
    label: str
    start_time: time
    end_time: time
    is_special: bool = False
    comment: str = ""
