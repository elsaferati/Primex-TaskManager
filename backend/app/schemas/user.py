from __future__ import annotations

import re
import uuid

from pydantic import BaseModel, EmailStr, Field, field_validator

from app.models.enums import UserRole


class UserOut(BaseModel):
    id: uuid.UUID
    email: EmailStr
    username: str | None = None
    full_name: str
    role: UserRole
    department_id: uuid.UUID | None = None
    is_active: bool


class UserLookup(BaseModel):
    id: uuid.UUID
    username: str | None = None
    full_name: str | None = None
    role: UserRole
    department_id: uuid.UUID | None = None
    is_active: bool


def _validate_password(value: str) -> str:
    if not re.search(r"[a-z]", value):
        raise ValueError("Must contain 1 lowercase letter")
    if not re.search(r"[A-Z]", value):
        raise ValueError("Must contain 1 uppercase letter")
    if not re.search(r"\d", value):
        raise ValueError("Must contain 1 number")
    return value


class UserCreate(BaseModel):
    email: EmailStr
    username: str | None = Field(default=None, min_length=3, max_length=64)
    full_name: str = Field(min_length=2, max_length=100)
    role: UserRole = UserRole.STAFF
    department_id: uuid.UUID | None = None
    password: str = Field(min_length=8, max_length=128)

    @field_validator("password")
    @classmethod
    def validate_password(cls, value: str) -> str:
        return _validate_password(value)


class UserUpdate(BaseModel):
    email: EmailStr | None = None
    username: str | None = Field(default=None, min_length=3, max_length=64)
    full_name: str | None = Field(default=None, min_length=2, max_length=100)
    role: UserRole | None = None
    department_id: uuid.UUID | None = None
    is_active: bool | None = None
    password: str | None = Field(default=None, min_length=8, max_length=128)

    @field_validator("password")
    @classmethod
    def validate_password(cls, value: str | None) -> str | None:
        if value is None:
            return value
        return _validate_password(value)

