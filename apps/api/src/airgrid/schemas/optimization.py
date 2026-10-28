import uuid
from typing import Literal, Optional

from pydantic import BaseModel, ConfigDict, Field

from airgrid.schemas.collectors import MAC_PATTERN

PlanStatus = Literal["draft", "proposed", "accepted_for_trial", "archived"]


class PlanMarker(BaseModel):
    """A speculative AP position in normalized floor-plan coordinates."""
    model_config = ConfigDict(extra="forbid", allow_inf_nan=False)
    x: float = Field(ge=0, le=1)
    y: float = Field(ge=0, le=1)
    label: str = Field(min_length=1, max_length=60)
    note: Optional[str] = Field(default=None, max_length=300)


class PlanCreate(BaseModel):
    model_config = ConfigDict(extra="forbid")
    floor_id: uuid.UUID
    network_label: Optional[str] = Field(default=None, min_length=1, max_length=64)
    name: str = Field(min_length=1, max_length=120)
    notes: Optional[str] = Field(default=None, max_length=4000)
    status: PlanStatus = "draft"
    markers: list[PlanMarker] = Field(default_factory=list, max_length=50)
    evidence_refs: list[uuid.UUID] = Field(default_factory=list, max_length=500)


class PlanUpdate(BaseModel):
    model_config = ConfigDict(extra="forbid")
    expected_version: int = Field(ge=1)
    network_label: Optional[str] = Field(default=None, min_length=1, max_length=64)
    name: Optional[str] = Field(default=None, min_length=1, max_length=120)
    notes: Optional[str] = Field(default=None, max_length=4000)
    status: Optional[PlanStatus] = None
    markers: Optional[list[PlanMarker]] = Field(default=None, max_length=50)
    evidence_refs: Optional[list[uuid.UUID]] = Field(default=None, max_length=500)


class AccessPointCreate(BaseModel):
    """Manually registered, known AP. Nothing here is discovered or inferred."""
    model_config = ConfigDict(extra="forbid", allow_inf_nan=False)
    floor_id: uuid.UUID
    name: str = Field(min_length=1, max_length=255)
    mac_address: str = Field(pattern=MAC_PATTERN)
    model: Optional[str] = Field(default=None, max_length=100)
    vendor: Optional[str] = Field(default=None, max_length=100)
    x_coord: Optional[float] = Field(default=None, ge=0, le=1)
    y_coord: Optional[float] = Field(default=None, ge=0, le=1)
    channel_24ghz: Optional[int] = Field(default=None, ge=1, le=14)
    channel_5ghz: Optional[int] = Field(default=None, ge=32, le=177)
    tx_power_dbm: Optional[float] = Field(default=None, ge=-10, le=36)
    status: Literal["active", "planned", "retired"] = "active"
    notes: Optional[str] = Field(default=None, max_length=1000)


class AccessPointUpdate(BaseModel):
    model_config = ConfigDict(extra="forbid", allow_inf_nan=False)
    name: Optional[str] = Field(default=None, min_length=1, max_length=255)
    model: Optional[str] = Field(default=None, max_length=100)
    vendor: Optional[str] = Field(default=None, max_length=100)
    x_coord: Optional[float] = Field(default=None, ge=0, le=1)
    y_coord: Optional[float] = Field(default=None, ge=0, le=1)
    channel_24ghz: Optional[int] = Field(default=None, ge=1, le=14)
    channel_5ghz: Optional[int] = Field(default=None, ge=32, le=177)
    tx_power_dbm: Optional[float] = Field(default=None, ge=-10, le=36)
    status: Optional[Literal["active", "planned", "retired"]] = None
    notes: Optional[str] = Field(default=None, max_length=1000)


class SessionCompareRequest(BaseModel):
    model_config = ConfigDict(extra="forbid")
    before_session_id: uuid.UUID
    after_session_id: uuid.UUID
    network_label: str = Field(min_length=1, max_length=64)
