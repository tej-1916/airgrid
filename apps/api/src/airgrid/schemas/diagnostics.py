import uuid
from datetime import datetime, timezone
from typing import Optional, List, Dict, Any
from pydantic import BaseModel, ConfigDict, Field, field_validator


class InterfaceInfo(BaseModel):
    name: str
    type: str
    is_wireless: bool
    is_connected: bool
    ip_address: Optional[str] = None
    mac_address: Optional[str] = None
    state: Optional[str] = None
    connection_name: Optional[str] = None
    is_default_gateway_interface: bool = False


class InterfaceListResponse(BaseModel):
    interfaces: List[InterfaceInfo]
    discovered_wireless_interface: Optional[str] = None
    default_gateway: Optional[str] = None
    hostname: str
    os_info: str


class GatewayPingResult(BaseModel):
    target_ip: str
    transmitted: int
    received: int
    loss_pct: Optional[float] = Field(default=None, ge=0, le=100)
    rtt_min_ms: Optional[float] = None
    rtt_avg_ms: Optional[float] = None
    rtt_max_ms: Optional[float] = None
    rtt_mdev_ms: Optional[float] = None
    status: str = "completed"


class IperfResult(BaseModel):
    target_host: str
    port: int
    protocol: str = "TCP"
    throughput_mbps: Optional[float] = None
    jitter_ms: Optional[float] = None
    lost_packets: Optional[int] = None
    status: str = "completed"
    error_message: Optional[str] = None


class TelemetryCollectionRequest(BaseModel):
    interface_name: Optional[str] = Field(default=None, pattern=r"^[a-zA-Z0-9_][a-zA-Z0-9_.-]{0,14}$")
    campus_id: Optional[uuid.UUID] = None
    building_id: Optional[uuid.UUID] = None
    floor_id: Optional[uuid.UUID] = None
    include_gateway_ping: bool = False
    ping_count: int = Field(default=3, ge=1, le=5)
    iperf_target_host: Optional[str] = None
    iperf_port: int = Field(default=5201, ge=1, le=65535)
    link_internet_speed_test_id: Optional[uuid.UUID] = None
    device_fingerprint: Optional[str] = None
    device_name: Optional[str] = "Backend server"
    vantage_point: str = "backend_server"
    operator_consent: bool = False

    @field_validator("campus_id", "building_id", "floor_id", "link_internet_speed_test_id", mode="before")
    @classmethod
    def empty_uuid_to_none(cls, v):
        if v == "" or v is None:
            return None
        return v


class PingGatewayRequest(BaseModel):
    gateway_ip: Optional[str] = None
    ping_count: int = Field(default=3, ge=1, le=5)
    operator_consent: bool = False


class IperfTestRequest(BaseModel):
    target_host: str
    port: int = Field(default=5201, ge=1, le=65535)
    duration_seconds: int = Field(default=5, ge=1, le=10)
    protocol: str = "TCP"
    operator_consent: bool = False


class TelemetrySnapshotResponse(BaseModel):
    model_config = ConfigDict(allow_inf_nan=False)
    id: Optional[uuid.UUID] = None
    interface_name: str
    mac_address: Optional[str] = None
    ssid: Optional[str] = None
    bssid: Optional[str] = None
    rssi_dbm: Optional[float] = Field(default=None, ge=-120, le=0)
    signal_quality_pct: Optional[int] = None
    frequency_mhz: Optional[int] = None
    channel: Optional[int] = None
    channel_width_mhz: Optional[int] = None
    band: Optional[str] = None
    rx_bitrate_mbps: Optional[float] = None
    tx_bitrate_mbps: Optional[float] = None
    security_protocol: Optional[str] = None
    gateway_ip: Optional[str] = None
    gateway_ping: Optional[GatewayPingResult] = None
    iperf: Optional[IperfResult] = None
    internet_speed_test_id: Optional[uuid.UUID] = None
    internet_download_mbps: Optional[float] = None
    internet_upload_mbps: Optional[float] = None
    internet_latency_ms: Optional[float] = None
    vantage_point: str = "backend_server"
    data_provenance: str = "instrumented_linux_telemetry"
    raw_details: Dict[str, Any] = Field(default_factory=dict)
    collected_at: datetime = Field(default_factory=lambda: datetime.now(timezone.utc))
    report_id: Optional[uuid.UUID] = None
    collector_id: Optional[uuid.UUID] = None
    collection_status: str = "collected"
    collection_error: Optional[str] = None
    connection_state: Optional[str] = None

    @field_validator("id", "internet_speed_test_id", mode="before")
    @classmethod
    def empty_uuid_to_none(cls, v):
        if v == "" or v is None:
            return None
        return v


class DiagnosticFindingResponse(BaseModel):
    id: Optional[uuid.UUID] = None
    category: str
    severity: str  # "critical", "warning", "good", "info"
    title: str
    description: str
    measured_evidence: str
    metric_key: Optional[str] = None
    measured_value: Optional[str] = None
    threshold_value: Optional[str] = None
    unit: Optional[str] = None
    recommendation: str


class DiagnosticReportResponse(BaseModel):
    id: uuid.UUID
    title: str
    campus_id: Optional[uuid.UUID] = None
    building_id: Optional[uuid.UUID] = None
    floor_id: Optional[uuid.UUID] = None
    user_id: Optional[uuid.UUID] = None
    user_email: Optional[str] = None
    device_fingerprint: Optional[str] = None
    device_name: str
    interface_name: str
    vantage_point: str
    data_provenance: str
    status: str
    summary_headline: str
    overall_score: int
    findings_count: int
    critical_count: int
    warning_count: int
    good_count: int
    telemetry: Optional[TelemetrySnapshotResponse] = None
    findings: List[DiagnosticFindingResponse] = Field(default_factory=list)
    created_at: datetime
    updated_at: datetime


class DiagnosticReportListResponse(BaseModel):
    reports: List[DiagnosticReportResponse]
    total: int
    skip: int
    limit: int


class AnalyzeDiagnosticsRequest(BaseModel):
    title: Optional[str] = None
    interface_name: Optional[str] = Field(default=None, pattern=r"^[a-zA-Z0-9_][a-zA-Z0-9_.-]{0,14}$")
    campus_id: Optional[uuid.UUID] = None
    building_id: Optional[uuid.UUID] = None
    floor_id: Optional[uuid.UUID] = None
    include_gateway_ping: bool = False
    ping_count: int = Field(default=3, ge=1, le=5)
    iperf_target_host: Optional[str] = None
    iperf_port: int = Field(default=5201, ge=1, le=65535)
    link_internet_speed_test_id: Optional[uuid.UUID] = None
    device_fingerprint: Optional[str] = None
    device_name: Optional[str] = "Backend server"
    vantage_point: str = "backend_server"
    operator_consent: bool = False
    # Server-owned snapshot handle (from /collect or a registered collector); keeps instrument provenance.
    telemetry_snapshot_id: Optional[uuid.UUID] = None
    # Browser-supplied values are accepted but always downgraded to operator_reported.
    telemetry: Optional[TelemetrySnapshotResponse] = None

    @field_validator("campus_id", "building_id", "floor_id", "link_internet_speed_test_id", mode="before")
    @classmethod
    def empty_uuid_to_none(cls, v):
        if v == "" or v is None:
            return None
        return v
