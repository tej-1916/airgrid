import uuid
from datetime import datetime
from typing import Optional, List
from pydantic import BaseModel, ConfigDict, Field, field_validator


# ==========================================
# Floor Plan Schemas
# ==========================================

class CalibrationPoint(BaseModel):
    x: float = Field(..., ge=0, description="X coordinate in pixels")
    y: float = Field(..., ge=0, description="Y coordinate in pixels")


class CalibrationRequest(BaseModel):
    point1: CalibrationPoint
    point2: CalibrationPoint
    distance_m: float = Field(..., gt=0.01, le=10000.0, description="Real world distance between points in meters")


class FloorOutlineCreateRequest(BaseModel):
    width_m: float = Field(..., gt=1.0, le=1000.0, description="Floor width in meters")
    height_m: float = Field(..., gt=1.0, le=1000.0, description="Floor height / length in meters")
    grid_interval_m: float = Field(5.0, gt=0.5, le=50.0, description="Grid line interval in meters")
    label: Optional[str] = Field(None, max_length=100, description="Optional custom title for the outline")



class FloorPlanResponse(BaseModel):
    model_config = ConfigDict(from_attributes=True)

    id: uuid.UUID
    floor_id: uuid.UUID
    file_format: str
    original_filename: Optional[str] = None
    file_size_bytes: Optional[int] = None
    pixel_width: int
    pixel_height: int
    scale_pixels_per_meter: float
    is_calibrated: bool = False
    calibration_metadata: Optional[dict] = None
    image_url: str
    created_at: datetime
    updated_at: datetime


# ==========================================
# Floor Schemas
# ==========================================

class FloorCreate(BaseModel):
    floor_number: int = Field(..., description="Numerical floor index (e.g. 1, 2, -1)")
    name: str = Field(..., min_length=1, max_length=100, description="Descriptive floor name")
    dimensions_width_m: float = Field(default=50.0, gt=0.1, le=5000.0, description="Estimated floor width in meters")
    dimensions_height_m: float = Field(default=30.0, gt=0.1, le=5000.0, description="Estimated floor height in meters")


class FloorUpdate(BaseModel):
    floor_number: Optional[int] = None
    name: Optional[str] = Field(None, min_length=1, max_length=100)
    dimensions_width_m: Optional[float] = Field(None, gt=0.1, le=5000.0)
    dimensions_height_m: Optional[float] = Field(None, gt=0.1, le=5000.0)
    status: Optional[str] = Field(None, pattern="^(active|archived)$")


class FloorResponse(BaseModel):
    model_config = ConfigDict(from_attributes=True)

    id: uuid.UUID
    building_id: uuid.UUID
    floor_number: int
    name: str
    status: str
    dimensions_width_m: float
    dimensions_height_m: float
    has_floor_plan: bool = False
    floor_plan: Optional[FloorPlanResponse] = None
    created_at: datetime
    updated_at: datetime


# ==========================================
# Building Schemas
# ==========================================

class BuildingCreate(BaseModel):
    name: str = Field(..., min_length=1, max_length=255, description="Building name (e.g. Science Complex)")
    building_code: str = Field(..., min_length=1, max_length=50, description="Short code (e.g. SCI-A)")
    description: Optional[str] = Field(None, max_length=2000)
    floors_count: int = Field(default=1, ge=1, le=200)

    @field_validator("building_code")
    @classmethod
    def normalize_code(cls, v: str) -> str:
        return v.strip().upper()


class BuildingUpdate(BaseModel):
    name: Optional[str] = Field(None, min_length=1, max_length=255)
    building_code: Optional[str] = Field(None, min_length=1, max_length=50)
    description: Optional[str] = Field(None, max_length=2000)
    status: Optional[str] = Field(None, pattern="^(active|archived)$")
    floors_count: Optional[int] = Field(None, ge=1, le=200)

    @field_validator("building_code")
    @classmethod
    def normalize_code(cls, v: Optional[str]) -> Optional[str]:
        return v.strip().upper() if v else None


class BuildingResponse(BaseModel):
    model_config = ConfigDict(from_attributes=True)

    id: uuid.UUID
    campus_id: uuid.UUID
    name: str
    building_code: str
    description: Optional[str] = None
    status: str
    floors_count: int
    actual_floors_count: int = 0
    floors: List[FloorResponse] = []
    created_at: datetime
    updated_at: datetime


# ==========================================
# Campus Schemas
# ==========================================

class CampusCreate(BaseModel):
    name: str = Field(..., min_length=1, max_length=255, description="Official campus name")
    code: str = Field(..., min_length=1, max_length=50, description="Unique short code (e.g. MAIN, NORTH)")
    description: Optional[str] = Field(None, max_length=2000)
    address: Optional[str] = Field(None, max_length=500)
    latitude: Optional[float] = Field(None, ge=-90.0, le=90.0)
    longitude: Optional[float] = Field(None, ge=-180.0, le=180.0)

    @field_validator("code")
    @classmethod
    def normalize_code(cls, v: str) -> str:
        return v.strip().upper()


class CampusUpdate(BaseModel):
    name: Optional[str] = Field(None, min_length=1, max_length=255)
    code: Optional[str] = Field(None, min_length=1, max_length=50)
    description: Optional[str] = Field(None, max_length=2000)
    address: Optional[str] = Field(None, max_length=500)
    status: Optional[str] = Field(None, pattern="^(active|archived)$")
    latitude: Optional[float] = Field(None, ge=-90.0, le=90.0)
    longitude: Optional[float] = Field(None, ge=-180.0, le=180.0)

    @field_validator("code")
    @classmethod
    def normalize_code(cls, v: Optional[str]) -> Optional[str]:
        return v.strip().upper() if v else None


class CampusResponse(BaseModel):
    model_config = ConfigDict(from_attributes=True)

    id: uuid.UUID
    name: str
    code: str
    description: Optional[str] = None
    status: str
    address: Optional[str] = None
    latitude: Optional[float] = None
    longitude: Optional[float] = None
    buildings_count: int = 0
    floors_count: int = 0
    floor_plans_count: int = 0
    buildings: List[BuildingResponse] = []
    created_at: datetime
    updated_at: datetime


class CampusListResponse(BaseModel):
    total: int
    skip: int
    limit: int
    items: List[CampusResponse]


# ==========================================
# Campus Membership Schemas
# ==========================================

class CampusMemberCreate(BaseModel):
    user_id: uuid.UUID
    role: Optional[str] = Field(default=None, max_length=50)


class CampusMemberResponse(BaseModel):
    model_config = ConfigDict(from_attributes=True)

    id: uuid.UUID
    campus_id: uuid.UUID
    user_id: uuid.UUID
    user_email: str
    user_full_name: str
    user_role: str
    membership_role: Optional[str] = None
    created_at: datetime

