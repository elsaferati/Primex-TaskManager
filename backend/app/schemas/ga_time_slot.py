import uuid
from datetime import datetime, time

from pydantic import BaseModel


class GaTimeSlotEntryIn(BaseModel):
    day_of_week: int
    start_time: time
    end_time: time
    content: str
    user_id: uuid.UUID | None = None


class GaTimeSlotEntryUpdate(BaseModel):
    content: str


class GaTimeSlotEntryOut(BaseModel):
    id: uuid.UUID
    user_id: uuid.UUID
    day_of_week: int
    start_time: time
    end_time: time
    content: str
    created_at: datetime
    updated_at: datetime
