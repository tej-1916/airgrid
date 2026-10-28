import uuid
from datetime import datetime
from typing import Literal, Optional

from pydantic import AwareDatetime, BaseModel, ConfigDict, Field, field_validator, model_validator

IFACE_PATTERN = r"^[a-zA-Z0-9_][a-zA-Z0-9_.-]{0,14}$"
MAC_PATTERN = r"^[0-9A-Fa-f]{2}(:[0-9A-Fa-f]{2}){5}$"


def _no_control_chars(value: Optional[str]) -> Optional[str]:
    if value is not None and any(ord(c) < 32 or ord(c) == 127 for c in value):
        raise ValueError("control characters are not allowed")
    return value


class CollectorCreate(BaseModel):
    model_config = ConfigDict(extra="forbid")
    name: str = Field(min_length=1, max_length=100)
    host_label: Optional[str] = Field(default=None, max_length=100)
    description: Optional[str] = Field(default=None, max_length=1000)
    campus_id: Optional[uuid.UUID] = None
    building_id: Optional[uuid.UUID] = None
    floor_id: Optional[uuid.UUID] = None

    _clean = field_validator("name", "host_label")(_no_control_chars)


class CollectorResponse(BaseModel):
    model_config = ConfigDict(from_attributes=True)
    id: uuid.UUID
    name: str
    host_label: Optional[str] = None
    description: Optional[str] = None
    campus_id: Optional[uuid.UUID] = None
    building_id: Optional[uuid.UUID] = None
    floor_id: Optional[uuid.UUID] = None
    status: str
    created_at: datetime
    revoked_at: Optional[datetime] = None
    last_seen_at: Optional[datetime] = None
    last_submission_status: Optional[str] = None
    submission_count: int
    rejected_count: int


class CollectorCredentials(BaseModel):
    """Returned once at registration/rotation. The secret is never stored or shown again."""
    collector: CollectorResponse
    secret: str
    notice: str = ("Store this secret in a 0600 file on the collector host. AirGrid cannot display it again; "
                   "rotate the credential if it is lost or exposed.")


class GatewayPingSubmission(BaseModel):
    model_config = ConfigDict(extra="forbid", allow_inf_nan=False)
    transmitted: int = Field(ge=1, le=5)
    received: int = Field(ge=0, le=5)
    loss_pct: float = Field(ge=0, le=100)
    rtt_min_ms: Optional[float] = Field(default=None, ge=0, le=10000)
    rtt_avg_ms: Optional[float] = Field(default=None, ge=0, le=10000)
    rtt_max_ms: Optional[float] = Field(default=None, ge=0, le=10000)
    rtt_mdev_ms: Optional[float] = Field(default=None, ge=0, le=10000)

    @model_validator(mode="after")
    def received_not_above_transmitted(self):
        if self.received > self.transmitted:
            raise ValueError("received cannot exceed transmitted")
        return self


MEASUREMENT_FIELDS = (
    "ssid", "bssid", "rssi_dbm", "signal_quality_pct", "frequency_mhz", "channel", "channel_width_mhz",
    "band", "rx_bitrate_mbps", "tx_bitrate_mbps", "security_protocol", "gateway_ping",
)


class CollectorSubmission(BaseModel):
    """Signed observation from a registered collector. Unknown fields are rejected."""
    model_config = ConfigDict(extra="forbid", allow_inf_nan=False)
    schema_version: Literal[1]
    collected_at: AwareDatetime
    collection_status: Literal["collected", "partial", "failed"]
    error: Optional[str] = Field(default=None, max_length=255)
    interface_name: Optional[str] = Field(default=None, pattern=IFACE_PATTERN)
    connection_state: Optional[Literal["connected", "disconnected", "unknown"]] = None
    ssid: Optional[str] = Field(default=None, max_length=64)
    bssid: Optional[str] = Field(default=None, pattern=MAC_PATTERN)
    rssi_dbm: Optional[float] = Field(default=None, ge=-120, le=0)
    signal_quality_pct: Optional[int] = Field(default=None, ge=0, le=100)
    frequency_mhz: Optional[int] = Field(default=None, ge=2400, le=7125)
    channel: Optional[int] = Field(default=None, ge=1, le=233)
    channel_width_mhz: Optional[int] = Field(default=None, ge=5, le=320)
    band: Optional[Literal["2.4 GHz", "5 GHz", "6 GHz"]] = None
    rx_bitrate_mbps: Optional[float] = Field(default=None, ge=0, le=100000)
    tx_bitrate_mbps: Optional[float] = Field(default=None, ge=0, le=100000)
    security_protocol: Optional[str] = Field(default=None, max_length=64)
    gateway_ping: Optional[GatewayPingSubmission] = None
    collector_software: Optional[str] = Field(default=None, max_length=64)

    _clean = field_validator("error", "ssid", "security_protocol", "collector_software")(_no_control_chars)

    @model_validator(mode="after")
    def status_matches_content(self):
        if self.collection_status == "failed":
            if not self.error:
                raise ValueError("failed collections must include an error")
            if any(getattr(self, f) is not None for f in MEASUREMENT_FIELDS):
                raise ValueError("failed collections cannot carry measurements")
        elif not self.interface_name:
            raise ValueError("interface_name is required for collected or partial observations")
        return self


class CollectorIngestResponse(BaseModel):
    snapshot_id: uuid.UUID
    collector_id: uuid.UUID
    collection_status: str
    collected_at: datetime
    received_at: datetime


class RetentionPolicyUpdate(BaseModel):
    model_config = ConfigDict(extra="forbid")
    retention_days: Optional[int] = Field(default=None, ge=7, le=3650)
    aggregate_before_delete: bool = True


class RetentionApplyRequest(BaseModel):
    model_config = ConfigDict(extra="forbid")
    confirm: bool
    expected_count: int = Field(ge=0)
