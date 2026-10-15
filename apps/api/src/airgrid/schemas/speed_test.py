from datetime import datetime
from typing import Optional, List, Dict, Any
import uuid
from pydantic import BaseModel, Field, field_validator, ConfigDict


class SpeedTestCreate(BaseModel):
    provider_engine: str = Field(default="cloudflare", max_length=50)
    vantage_point: str = Field(default="client_browser", max_length=50)
    status: str = Field(default="completed", max_length=50)
    download_mbps: Optional[float] = Field(None, ge=0.0, le=100000.0)
    upload_mbps: Optional[float] = Field(None, ge=0.0, le=100000.0)
    latency_ms: Optional[float] = Field(None, ge=0.0, le=60000.0)
    jitter_ms: Optional[float] = Field(None, ge=0.0, le=60000.0)
    loaded_latency_ms: Optional[float] = Field(None, ge=0.0, le=60000.0)
    packet_loss_pct: Optional[float] = Field(None, ge=0.0, le=100.0)
    server_location: Optional[str] = Field(None, max_length=100)
    campus_id: Optional[uuid.UUID] = None
    building_id: Optional[uuid.UUID] = None
    floor_id: Optional[uuid.UUID] = None
    started_at: Optional[datetime] = None
    completed_at: Optional[datetime] = None
    duration_seconds: Optional[float] = Field(None, ge=0.0, le=3600.0)
    quality_metadata: Optional[Dict[str, Any]] = None
    error_code: Optional[str] = Field(None, max_length=50)
    error_message: Optional[str] = None

    @field_validator("status")
    @classmethod
    def validate_status(cls, v: str) -> str:
        allowed = {"completed", "aborted", "failed", "in_progress"}
        if v not in allowed:
            raise ValueError(f"Status must be one of {allowed}")
        return v

    @field_validator("provider_engine")
    @classmethod
    def validate_provider(cls, v: str) -> str:
        allowed = {"cloudflare", "librespeed", "custom"}
        if v.lower() not in allowed:
            raise ValueError(f"Provider engine must be one of {allowed}")
        return v.lower()


class SpeedTestResponse(BaseModel):
    id: uuid.UUID
    user_id: Optional[uuid.UUID] = None
    user_email: Optional[str] = None
    user_name: Optional[str] = None
    campus_id: Optional[uuid.UUID] = None
    campus_name: Optional[str] = None
    campus_code: Optional[str] = None
    building_id: Optional[uuid.UUID] = None
    building_name: Optional[str] = None
    building_code: Optional[str] = None
    floor_id: Optional[uuid.UUID] = None
    floor_name: Optional[str] = None
    floor_number: Optional[int] = None
    vantage_point: str
    provider_engine: str
    status: str
    data_provenance: str
    download_mbps: Optional[float] = None
    upload_mbps: Optional[float] = None
    latency_ms: Optional[float] = None
    jitter_ms: Optional[float] = None
    loaded_latency_ms: Optional[float] = None
    packet_loss_pct: Optional[float] = None
    server_location: Optional[str] = None
    quality_metadata: Optional[Dict[str, Any]] = None
    error_code: Optional[str] = None
    error_message: Optional[str] = None
    started_at: Optional[datetime] = None
    completed_at: Optional[datetime] = None
    duration_seconds: Optional[float] = None
    executed_at: datetime

    model_config = ConfigDict(from_attributes=True)


class SpeedTestListResponse(BaseModel):
    total: int
    skip: int
    limit: int
    items: List[SpeedTestResponse]


class SpeedTestStatsResponse(BaseModel):
    total_tests: int
    completed_count: int
    aborted_count: int
    failed_count: int
    avg_download_mbps: Optional[float] = None
    avg_upload_mbps: Optional[float] = None
    avg_latency_ms: Optional[float] = None
    avg_jitter_ms: Optional[float] = None
    max_download_mbps: Optional[float] = None
    max_upload_mbps: Optional[float] = None
    min_latency_ms: Optional[float] = None
