from typing import Literal
import uuid
from datetime import datetime
from typing import Optional, List, Dict, Any
from pydantic import BaseModel, Field, ConfigDict, field_validator


class SurveySessionCreate(BaseModel):
    floor_id: uuid.UUID
    session_name: str = Field(..., min_length=1, max_length=255, description="Name for the survey session")
    description: Optional[str] = Field(None, max_length=1000)
    campus_id: Optional[uuid.UUID] = None
    building_id: Optional[uuid.UUID] = None


class SurveySessionUpdate(BaseModel):
    session_name: Optional[str] = Field(None, min_length=1, max_length=255)
    description: Optional[str] = Field(None, max_length=1000)
    status: Optional[str] = Field(None, pattern="^(in_progress|completed|archived)$")


class SurveyMeasurementCreate(BaseModel):
    floor_id: uuid.UUID
    position_x: float = Field(..., ge=0.0, description="X pixel position on original floor plan")
    position_y: float = Field(..., ge=0.0, description="Y pixel position on original floor plan")
    rssi_dbm: float = Field(..., ge=-100.0, le=-20.0, description="Plausible RSSI in dBm (-100 to -20)")
    measurement_source: str = Field(
        default="manual_observation",
        pattern="^(manual_observation|host_telemetry|controlled_test_import)$",
        description="Source provenance of the measurement",
    )
    network_label: Optional[str] = Field(None, max_length=64, description="Optional SSID / network name")
    ap_reference: Optional[str] = Field(None, max_length=100, description="Optional AP name or identifier")
    frequency_mhz: Optional[int] = Field(None, ge=2000, le=7200, description="Channel center frequency in MHz")
    channel: Optional[int] = Field(None, ge=1, le=200, description="Wi-Fi channel number")
    notes: Optional[str] = Field(None, max_length=500)
    data_provenance: Literal["operator_reported", "controlled_test_import"] = "operator_reported"


class SurveyMeasurementResponse(BaseModel):
    id: uuid.UUID
    survey_session_id: uuid.UUID
    floor_id: uuid.UUID
    position_x: float
    position_y: float
    normalized_x: float
    normalized_y: float
    rssi_dbm: float
    measurement_source: str
    network_label: Optional[str] = None
    ap_reference: Optional[str] = None
    frequency_mhz: Optional[int] = None
    channel: Optional[int] = None
    notes: Optional[str] = None
    data_provenance: str
    source_telemetry_snapshot_id: Optional[uuid.UUID] = None
    observed_at: datetime
    created_at: datetime

    model_config = ConfigDict(from_attributes=True)


class SnapshotPlacementCreate(BaseModel):
    """Operator places a stored instrument observation at the location where it was collected."""
    model_config = ConfigDict(extra="forbid")
    telemetry_snapshot_id: uuid.UUID
    position_x: float = Field(..., ge=0)
    position_y: float = Field(..., ge=0)
    notes: Optional[str] = Field(default=None, max_length=1000)


class SurveySessionResponse(BaseModel):
    id: uuid.UUID
    campus_id: Optional[uuid.UUID] = None
    building_id: Optional[uuid.UUID] = None
    floor_id: uuid.UUID
    technician_id: Optional[uuid.UUID] = None
    operator_name: Optional[str] = None
    session_name: str
    description: Optional[str] = None
    status: str
    started_at: datetime
    completed_at: Optional[datetime] = None
    created_at: datetime
    updated_at: datetime
    measurement_count: int = 0
    measurements: Optional[List[SurveyMeasurementResponse]] = None

    model_config = ConfigDict(from_attributes=True)


class SurveySessionListResponse(BaseModel):
    total: int
    items: List[SurveySessionResponse]


class SurveySummaryStats(BaseModel):
    total_surveys: int
    completed_surveys: int
    total_measurements: int
    min_rssi_dbm: Optional[float] = None
    max_rssi_dbm: Optional[float] = None
    avg_rssi_dbm: Optional[float] = None
    source_breakdown: Dict[str, int] = Field(default_factory=dict)
    coverage_availability_pct: Optional[float] = None
    unmeasured_areas_noted: bool = True


class HeatmapGridResponse(BaseModel):
    survey_session_id: uuid.UUID
    floor_id: uuid.UUID
    grid_width: int
    grid_height: int
    pixel_width: int
    pixel_height: int
    scale_pixels_per_meter: float
    sample_count: int
    min_rssi: float
    max_rssi: float
    avg_rssi: float
    grid_data: List[List[Optional[float]]]
    confidence_notice: str
    is_sparse_warning: bool
    mask_radius_meters: float
    power_parameter: float
    network_label: Optional[str] = None
    ap_reference: Optional[str] = None
    convex_hull_support: bool = True


class SurveyComparisonResponse(BaseModel):
    session1: SurveySessionResponse
    session2: SurveySessionResponse
    sample_count_delta: int
    avg_rssi_delta_db: Optional[float]
    min_rssi_delta_db: Optional[float]
    max_rssi_delta_db: Optional[float]
    notes: str
