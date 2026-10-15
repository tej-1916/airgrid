import re
import uuid
from datetime import datetime
from enum import Enum
from typing import Optional
from pydantic import BaseModel, ConfigDict, Field, field_validator

EMAIL_REGEX = re.compile(r"^[a-zA-Z0-9_.+-]+@[a-zA-Z0-9-]+\.[a-zA-Z0-9-.]+$")


class UserRole(str, Enum):
    ADMINISTRATOR = "administrator"
    NETWORK_ENGINEER = "network_engineer"
    VIEWER = "viewer"

    @classmethod
    def normalize(cls, v: str) -> "UserRole":
        val = str(v).lower().strip()
        mapping = {
            "administrator": cls.ADMINISTRATOR,
            "admin": cls.ADMINISTRATOR,
            "super_admin": cls.ADMINISTRATOR,
            "network_engineer": cls.NETWORK_ENGINEER,
            "network_admin": cls.NETWORK_ENGINEER,
            "engineer": cls.NETWORK_ENGINEER,
            "viewer": cls.VIEWER,
            "observer": cls.VIEWER,
        }
        if val in mapping:
            return mapping[val]
        raise ValueError(f"Invalid user role: {v}. Allowed: administrator, network_engineer, viewer")


class LoginRequest(BaseModel):
    email: str = Field(..., min_length=3, max_length=255)
    password: str = Field(..., min_length=1)

    @field_validator("email")
    @classmethod
    def validate_email(cls, v: str) -> str:
        clean = v.strip().lower()
        if not EMAIL_REGEX.match(clean):
            raise ValueError("Invalid email address format.")
        return clean


class UserResponse(BaseModel):
    model_config = ConfigDict(from_attributes=True)

    id: uuid.UUID
    email: str
    full_name: str
    role: str
    is_active: bool
    created_at: datetime


class SessionStatusResponse(BaseModel):
    authenticated: bool
    user: Optional[UserResponse] = None
    expires_at: Optional[datetime] = None
    csrf_token: Optional[str] = None


class LoginResponse(BaseModel):
    user: UserResponse
    csrf_token: str
    message: str = "Authentication successful"


class CreateUserRequest(BaseModel):
    email: str = Field(..., min_length=3, max_length=255)
    password: str = Field(..., min_length=8, description="Minimum 8 characters")
    full_name: str = Field(..., min_length=1, max_length=255)
    role: str = Field(default="viewer")

    @field_validator("email")
    @classmethod
    def validate_email(cls, v: str) -> str:
        clean = v.strip().lower()
        if not EMAIL_REGEX.match(clean):
            raise ValueError("Invalid email address format.")
        return clean

    @field_validator("role")
    @classmethod
    def validate_role(cls, v: str) -> str:
        return UserRole.normalize(v).value


class UpdateUserStatusRequest(BaseModel):
    is_active: Optional[bool] = None
    role: Optional[str] = None

    @field_validator("role")
    @classmethod
    def validate_role(cls, v: Optional[str]) -> Optional[str]:
        if v is None:
            return None
        return UserRole.normalize(v).value


class CSRFResponse(BaseModel):
    csrf_token: str
