import uuid
from datetime import datetime
from typing import Optional, List
from sqlalchemy import (
    String,
    Integer,
    Float,
    Boolean,
    DateTime,
    ForeignKey,
    Text,
    Index,
    JSON,
    UniqueConstraint,
    func,
)
from sqlalchemy.orm import Mapped, mapped_column, relationship
from airgrid.models.base import Base, GUID, TimestampMixin


# 1. Users
class User(Base, TimestampMixin):
    __tablename__ = "users"
    __table_args__ = (
        Index("ix_users_email", "email"),
    )

    id: Mapped[uuid.UUID] = mapped_column(GUID, primary_key=True, default=uuid.uuid4)
    email: Mapped[str] = mapped_column(String(255), unique=True, nullable=False)
    hashed_password: Mapped[str] = mapped_column(String(255), nullable=False)
    full_name: Mapped[str] = mapped_column(String(255), nullable=False)
    role: Mapped[str] = mapped_column(String(50), default="observer", nullable=False)
    is_active: Mapped[bool] = mapped_column(Boolean, default=True, nullable=False)
    updated_at: Mapped[datetime] = mapped_column(
        DateTime(timezone=True), server_default=func.now(), onupdate=func.now(), nullable=False
    )

    audit_logs: Mapped[List["AuditLog"]] = relationship("AuditLog", back_populates="actor")
    survey_sessions: Mapped[List["SurveySession"]] = relationship("SurveySession", back_populates="technician")
    sessions: Mapped[List["UserSession"]] = relationship("UserSession", back_populates="user", cascade="all, delete-orphan")
    speed_tests: Mapped[List["InternetSpeedTest"]] = relationship("InternetSpeedTest", back_populates="user")
    campus_memberships: Mapped[List["CampusMembership"]] = relationship("CampusMembership", back_populates="user", cascade="all, delete-orphan")


# 1.1 User Sessions
class UserSession(Base):
    __tablename__ = "user_sessions"

    id: Mapped[uuid.UUID] = mapped_column(GUID, primary_key=True, default=uuid.uuid4)
    user_id: Mapped[uuid.UUID] = mapped_column(GUID, ForeignKey("users.id", ondelete="CASCADE"), nullable=False, index=True)
    session_token_hash: Mapped[str] = mapped_column(String(64), unique=True, index=True, nullable=False)
    ip_address: Mapped[Optional[str]] = mapped_column(String(45), nullable=True)
    user_agent: Mapped[Optional[str]] = mapped_column(String(512), nullable=True)
    is_revoked: Mapped[bool] = mapped_column(Boolean, default=False, nullable=False)
    expires_at: Mapped[datetime] = mapped_column(DateTime(timezone=True), index=True, nullable=False)
    last_active_at: Mapped[datetime] = mapped_column(
        DateTime(timezone=True), server_default=func.now(), nullable=False
    )
    created_at: Mapped[datetime] = mapped_column(
        DateTime(timezone=True), server_default=func.now(), nullable=False
    )

    user: Mapped["User"] = relationship("User", back_populates="sessions")


# 2. Audit Logs
class AuditLog(Base):
    __tablename__ = "audit_logs"

    id: Mapped[uuid.UUID] = mapped_column(GUID, primary_key=True, default=uuid.uuid4)
    actor_id: Mapped[Optional[uuid.UUID]] = mapped_column(GUID, ForeignKey("users.id", ondelete="SET NULL"), nullable=True)
    action: Mapped[str] = mapped_column(String(100), nullable=False)
    resource_type: Mapped[str] = mapped_column(String(100), nullable=False)
    resource_id: Mapped[Optional[str]] = mapped_column(String(100), nullable=True)
    payload: Mapped[dict] = mapped_column(JSON, default=dict, nullable=False)
    ip_address: Mapped[Optional[str]] = mapped_column(String(45), nullable=True)
    created_at: Mapped[datetime] = mapped_column(
        DateTime(timezone=True), server_default=func.now(), nullable=False, index=True
    )

    actor: Mapped[Optional["User"]] = relationship("User", back_populates="audit_logs")


# 3. Campuses
class Campus(Base, TimestampMixin):
    __tablename__ = "campuses"
    __table_args__ = (
        Index("ix_campuses_code", "code"),
    )

    id: Mapped[uuid.UUID] = mapped_column(GUID, primary_key=True, default=uuid.uuid4)
    name: Mapped[str] = mapped_column(String(255), nullable=False)
    code: Mapped[str] = mapped_column(String(50), unique=True, nullable=False)
    description: Mapped[Optional[str]] = mapped_column(Text, nullable=True)
    status: Mapped[str] = mapped_column(String(50), default="active", nullable=False)
    latitude: Mapped[Optional[float]] = mapped_column(Float, nullable=True)
    longitude: Mapped[Optional[float]] = mapped_column(Float, nullable=True)
    address: Mapped[Optional[str]] = mapped_column(Text, nullable=True)
    updated_at: Mapped[datetime] = mapped_column(
        DateTime(timezone=True), server_default=func.now(), onupdate=func.now(), nullable=False
    )

    buildings: Mapped[List["Building"]] = relationship("Building", back_populates="campus", cascade="all, delete-orphan")
    memberships: Mapped[List["CampusMembership"]] = relationship("CampusMembership", back_populates="campus", cascade="all, delete-orphan")


# 4. Buildings
class Building(Base, TimestampMixin):
    __tablename__ = "buildings"
    __table_args__ = (
        UniqueConstraint("campus_id", "building_code", name="uq_buildings_campus_building_code"),
    )

    id: Mapped[uuid.UUID] = mapped_column(GUID, primary_key=True, default=uuid.uuid4)
    campus_id: Mapped[uuid.UUID] = mapped_column(GUID, ForeignKey("campuses.id", ondelete="CASCADE"), nullable=False, index=True)
    name: Mapped[str] = mapped_column(String(255), nullable=False)
    building_code: Mapped[str] = mapped_column(String(50), nullable=False)
    description: Mapped[Optional[str]] = mapped_column(Text, nullable=True)
    status: Mapped[str] = mapped_column(String(50), default="active", nullable=False)
    floors_count: Mapped[int] = mapped_column(Integer, default=1, nullable=False)
    updated_at: Mapped[datetime] = mapped_column(
        DateTime(timezone=True), server_default=func.now(), onupdate=func.now(), nullable=False
    )

    campus: Mapped["Campus"] = relationship("Campus", back_populates="buildings")
    floors: Mapped[List["Floor"]] = relationship("Floor", back_populates="building", cascade="all, delete-orphan")


# 5. Floors
class Floor(Base, TimestampMixin):
    __tablename__ = "floors"
    __table_args__ = (
        UniqueConstraint("building_id", "floor_number", name="uq_floors_building_floor_number"),
    )

    id: Mapped[uuid.UUID] = mapped_column(GUID, primary_key=True, default=uuid.uuid4)
    building_id: Mapped[uuid.UUID] = mapped_column(GUID, ForeignKey("buildings.id", ondelete="CASCADE"), nullable=False, index=True)
    floor_number: Mapped[int] = mapped_column(Integer, nullable=False)
    name: Mapped[str] = mapped_column(String(100), nullable=False)
    status: Mapped[str] = mapped_column(String(50), default="active", nullable=False)
    dimensions_width_m: Mapped[float] = mapped_column(Float, default=50.0, nullable=False)
    dimensions_height_m: Mapped[float] = mapped_column(Float, default=30.0, nullable=False)
    updated_at: Mapped[datetime] = mapped_column(
        DateTime(timezone=True), server_default=func.now(), onupdate=func.now(), nullable=False
    )

    building: Mapped["Building"] = relationship("Building", back_populates="floors")
    floor_plan: Mapped[Optional["FloorPlanAsset"]] = relationship("FloorPlanAsset", back_populates="floor", uselist=False, cascade="all, delete-orphan")
    access_points: Mapped[List["AccessPoint"]] = relationship("AccessPoint", back_populates="floor")
    survey_sessions: Mapped[List["SurveySession"]] = relationship("SurveySession", back_populates="floor", cascade="all, delete-orphan")
    survey_measurements: Mapped[List["SurveyMeasurement"]] = relationship("SurveyMeasurement", back_populates="floor", cascade="all, delete-orphan")


# 6. Floor Plan Assets
class FloorPlanAsset(Base, TimestampMixin):
    __tablename__ = "floor_plan_assets"

    id: Mapped[uuid.UUID] = mapped_column(GUID, primary_key=True, default=uuid.uuid4)
    floor_id: Mapped[uuid.UUID] = mapped_column(GUID, ForeignKey("floors.id", ondelete="CASCADE"), unique=True, nullable=False)
    file_path: Mapped[str] = mapped_column(String(512), nullable=False)
    file_format: Mapped[str] = mapped_column(String(20), nullable=False)
    original_filename: Mapped[Optional[str]] = mapped_column(String(255), nullable=True)
    file_size_bytes: Mapped[Optional[int]] = mapped_column(Integer, nullable=True)
    pixel_width: Mapped[int] = mapped_column(Integer, nullable=False)
    pixel_height: Mapped[int] = mapped_column(Integer, nullable=False)
    scale_pixels_per_meter: Mapped[float] = mapped_column(Float, default=20.0, nullable=False)
    is_calibrated: Mapped[bool] = mapped_column(Boolean, default=False, nullable=False)
    calibration_metadata: Mapped[Optional[dict]] = mapped_column(JSON, nullable=True)
    updated_at: Mapped[datetime] = mapped_column(
        DateTime(timezone=True), server_default=func.now(), onupdate=func.now(), nullable=False
    )

    floor: Mapped["Floor"] = relationship("Floor", back_populates="floor_plan")


# 7. Measurement Devices
class MeasurementDevice(Base, TimestampMixin):
    __tablename__ = "measurement_devices"
    __table_args__ = (
        Index("ix_measurement_devices_fingerprint", "device_fingerprint"),
    )

    id: Mapped[uuid.UUID] = mapped_column(GUID, primary_key=True, default=uuid.uuid4)
    device_fingerprint: Mapped[str] = mapped_column(String(64), unique=True, nullable=False)
    device_name: Mapped[str] = mapped_column(String(255), nullable=False)
    device_type: Mapped[str] = mapped_column(String(50), nullable=False)
    os_info: Mapped[Optional[str]] = mapped_column(String(255), nullable=True)
    is_authorized: Mapped[bool] = mapped_column(Boolean, default=False, nullable=False)
    last_seen_at: Mapped[Optional[datetime]] = mapped_column(DateTime(timezone=True), nullable=True)

    survey_sessions: Mapped[List["SurveySession"]] = relationship("SurveySession", back_populates="device")
    speed_tests: Mapped[List["InternetSpeedTest"]] = relationship("InternetSpeedTest", back_populates="device")


# 8. Access Points
class AccessPoint(Base, TimestampMixin):
    __tablename__ = "access_points"
    __table_args__ = (
        Index("ix_access_points_mac", "mac_address"),
    )

    id: Mapped[uuid.UUID] = mapped_column(GUID, primary_key=True, default=uuid.uuid4)
    floor_id: Mapped[Optional[uuid.UUID]] = mapped_column(GUID, ForeignKey("floors.id", ondelete="SET NULL"), nullable=True, index=True)
    name: Mapped[str] = mapped_column(String(255), nullable=False)
    mac_address: Mapped[str] = mapped_column(String(17), unique=True, nullable=False)
    model: Mapped[Optional[str]] = mapped_column(String(100), nullable=True)
    vendor: Mapped[Optional[str]] = mapped_column(String(100), nullable=True)
    # Normalized floor-plan position (0..1), entered manually by an operator; never discovered.
    x_coord: Mapped[Optional[float]] = mapped_column(Float, nullable=True)
    y_coord: Mapped[Optional[float]] = mapped_column(Float, nullable=True)
    channel_24ghz: Mapped[Optional[int]] = mapped_column(Integer, nullable=True)
    channel_5ghz: Mapped[Optional[int]] = mapped_column(Integer, nullable=True)
    # Unknown unless the operator records it; no default transmit power is assumed.
    tx_power_dbm: Mapped[Optional[float]] = mapped_column(Float, nullable=True)
    status: Mapped[str] = mapped_column(String(50), default="active", nullable=False)
    notes: Mapped[Optional[str]] = mapped_column(Text, nullable=True)
    created_by_id: Mapped[Optional[uuid.UUID]] = mapped_column(GUID, ForeignKey("users.id", ondelete="SET NULL"), nullable=True)

    floor: Mapped[Optional["Floor"]] = relationship("Floor", back_populates="access_points")


# 9. Survey Sessions
class SurveySession(Base, TimestampMixin):
    __tablename__ = "survey_sessions"

    id: Mapped[uuid.UUID] = mapped_column(GUID, primary_key=True, default=uuid.uuid4)
    campus_id: Mapped[Optional[uuid.UUID]] = mapped_column(GUID, ForeignKey("campuses.id", ondelete="CASCADE"), nullable=True, index=True)
    building_id: Mapped[Optional[uuid.UUID]] = mapped_column(GUID, ForeignKey("buildings.id", ondelete="CASCADE"), nullable=True, index=True)
    floor_id: Mapped[uuid.UUID] = mapped_column(GUID, ForeignKey("floors.id", ondelete="CASCADE"), nullable=False, index=True)
    technician_id: Mapped[Optional[uuid.UUID]] = mapped_column(GUID, ForeignKey("users.id", ondelete="SET NULL"), nullable=True)
    device_id: Mapped[Optional[uuid.UUID]] = mapped_column(GUID, ForeignKey("measurement_devices.id", ondelete="SET NULL"), nullable=True)
    session_name: Mapped[str] = mapped_column(String(255), nullable=False)
    description: Mapped[Optional[str]] = mapped_column(Text, nullable=True)
    started_at: Mapped[datetime] = mapped_column(DateTime(timezone=True), server_default=func.now(), nullable=False)
    completed_at: Mapped[Optional[datetime]] = mapped_column(DateTime(timezone=True), nullable=True)
    status: Mapped[str] = mapped_column(String(50), default="in_progress", nullable=False, index=True)
    updated_at: Mapped[datetime] = mapped_column(
        DateTime(timezone=True), server_default=func.now(), onupdate=func.now(), nullable=False
    )

    campus: Mapped[Optional["Campus"]] = relationship("Campus")
    building: Mapped[Optional["Building"]] = relationship("Building")
    floor: Mapped["Floor"] = relationship("Floor", back_populates="survey_sessions")
    technician: Mapped[Optional["User"]] = relationship("User", back_populates="survey_sessions")
    device: Mapped[Optional["MeasurementDevice"]] = relationship("MeasurementDevice", back_populates="survey_sessions")
    observations: Mapped[List["WiFiSignalObservation"]] = relationship("WiFiSignalObservation", back_populates="survey_session", cascade="all, delete-orphan")
    measurements: Mapped[List["SurveyMeasurement"]] = relationship("SurveyMeasurement", back_populates="survey_session", cascade="all, delete-orphan")


# 10. Wi-Fi Signal Observations
class WiFiSignalObservation(Base):
    __tablename__ = "wifi_signal_observations"

    id: Mapped[uuid.UUID] = mapped_column(GUID, primary_key=True, default=uuid.uuid4)
    survey_session_id: Mapped[uuid.UUID] = mapped_column(GUID, ForeignKey("survey_sessions.id", ondelete="CASCADE"), nullable=False, index=True)
    floor_id: Mapped[uuid.UUID] = mapped_column(GUID, ForeignKey("floors.id", ondelete="CASCADE"), nullable=False)
    bssid: Mapped[str] = mapped_column(String(17), nullable=False)
    ssid: Mapped[str] = mapped_column(String(64), nullable=False)
    rssi_dbm: Mapped[float] = mapped_column(Float, nullable=False)
    frequency_mhz: Mapped[int] = mapped_column(Integer, nullable=False)
    channel: Mapped[int] = mapped_column(Integer, nullable=False)
    noise_dbm: Mapped[Optional[float]] = mapped_column(Float, nullable=True)
    snr_db: Mapped[Optional[float]] = mapped_column(Float, nullable=True)
    x_coord: Mapped[float] = mapped_column(Float, nullable=False)
    y_coord: Mapped[float] = mapped_column(Float, nullable=False)
    observed_at: Mapped[datetime] = mapped_column(DateTime(timezone=True), server_default=func.now(), nullable=False)

    survey_session: Mapped["SurveySession"] = relationship("SurveySession", back_populates="observations")

    __table_args__ = (
        Index("ix_wifi_obs_bssid", "bssid"),
        Index("ix_wifi_obs_floor_id", "floor_id"),
        Index("ix_wifi_obs_observed_at", "observed_at"),
        Index("ix_obs_floor_time", "floor_id", "observed_at"),
    )


# 10.1 Survey Measurements (Phase 04 Wi-Fi Survey Studio)
class SurveyMeasurement(Base):
    __tablename__ = "survey_measurements"
    __table_args__ = (
        Index("ix_survey_measurements_session_id", "survey_session_id"),
    )

    id: Mapped[uuid.UUID] = mapped_column(GUID, primary_key=True, default=uuid.uuid4)
    survey_session_id: Mapped[uuid.UUID] = mapped_column(GUID, ForeignKey("survey_sessions.id", ondelete="CASCADE"), nullable=False)
    floor_id: Mapped[uuid.UUID] = mapped_column(GUID, ForeignKey("floors.id", ondelete="CASCADE"), nullable=False, index=True)
    position_x: Mapped[float] = mapped_column(Float, nullable=False)
    position_y: Mapped[float] = mapped_column(Float, nullable=False)
    normalized_x: Mapped[float] = mapped_column(Float, nullable=False)
    normalized_y: Mapped[float] = mapped_column(Float, nullable=False)
    rssi_dbm: Mapped[float] = mapped_column(Float, nullable=False)
    measurement_source: Mapped[str] = mapped_column(String(50), default="manual_observation", nullable=False)
    network_label: Mapped[Optional[str]] = mapped_column(String(64), nullable=True)
    ap_reference: Mapped[Optional[str]] = mapped_column(String(100), nullable=True)
    frequency_mhz: Mapped[Optional[int]] = mapped_column(Integer, nullable=True)
    channel: Mapped[Optional[int]] = mapped_column(Integer, nullable=True)
    notes: Mapped[Optional[str]] = mapped_column(Text, nullable=True)
    data_provenance: Mapped[str] = mapped_column(String(50), default="operator_reported", nullable=False)
    # Instrument evidence the operator explicitly placed at this location (one snapshot -> one point).
    source_telemetry_snapshot_id: Mapped[Optional[uuid.UUID]] = mapped_column(
        GUID, ForeignKey("network_telemetry_snapshots.id", ondelete="SET NULL"), nullable=True, unique=True)
    observed_at: Mapped[datetime] = mapped_column(DateTime(timezone=True), server_default=func.now(), nullable=False, index=True)
    created_at: Mapped[datetime] = mapped_column(DateTime(timezone=True), server_default=func.now(), nullable=False)

    survey_session: Mapped["SurveySession"] = relationship("SurveySession", back_populates="measurements")
    floor: Mapped["Floor"] = relationship("Floor", back_populates="survey_measurements")
    source_telemetry_snapshot: Mapped[Optional["NetworkTelemetrySnapshot"]] = relationship("NetworkTelemetrySnapshot", lazy="selectin")


# 11. Internet Speed Tests
class InternetSpeedTest(Base):
    __tablename__ = "internet_speed_tests"
    __table_args__ = (
        Index("ix_speed_tests_device_id", "device_id"),
        Index("ix_speed_tests_executed_at", "executed_at"),
    )

    id: Mapped[uuid.UUID] = mapped_column(GUID, primary_key=True, default=uuid.uuid4)
    user_id: Mapped[Optional[uuid.UUID]] = mapped_column(GUID, ForeignKey("users.id", ondelete="SET NULL"), nullable=True, index=True)
    device_id: Mapped[Optional[uuid.UUID]] = mapped_column(GUID, ForeignKey("measurement_devices.id", ondelete="SET NULL"), nullable=True)
    campus_id: Mapped[Optional[uuid.UUID]] = mapped_column(GUID, ForeignKey("campuses.id", ondelete="SET NULL"), nullable=True, index=True)
    building_id: Mapped[Optional[uuid.UUID]] = mapped_column(GUID, ForeignKey("buildings.id", ondelete="SET NULL"), nullable=True, index=True)
    floor_id: Mapped[Optional[uuid.UUID]] = mapped_column(GUID, ForeignKey("floors.id", ondelete="SET NULL"), nullable=True, index=True)
    vantage_point: Mapped[str] = mapped_column(String(50), default="client_browser", nullable=False)
    provider_engine: Mapped[str] = mapped_column(String(50), nullable=False)
    status: Mapped[str] = mapped_column(String(50), default="completed", nullable=False, index=True)
    data_provenance: Mapped[str] = mapped_column(String(50), default="client_reported", nullable=False)
    download_mbps: Mapped[Optional[float]] = mapped_column(Float, nullable=True)
    upload_mbps: Mapped[Optional[float]] = mapped_column(Float, nullable=True)
    latency_ms: Mapped[Optional[float]] = mapped_column(Float, nullable=True)
    jitter_ms: Mapped[Optional[float]] = mapped_column(Float, nullable=True)
    loaded_latency_ms: Mapped[Optional[float]] = mapped_column(Float, nullable=True)
    packet_loss_pct: Mapped[Optional[float]] = mapped_column(Float, nullable=True)
    server_location: Mapped[Optional[str]] = mapped_column(String(100), nullable=True)
    client_ip_hashed: Mapped[Optional[str]] = mapped_column(String(64), nullable=True)
    client_user_agent: Mapped[Optional[str]] = mapped_column(String(512), nullable=True)
    quality_metadata: Mapped[Optional[dict]] = mapped_column(JSON, nullable=True)
    error_code: Mapped[Optional[str]] = mapped_column(String(50), nullable=True)
    error_message: Mapped[Optional[str]] = mapped_column(Text, nullable=True)
    x_coord: Mapped[Optional[float]] = mapped_column(Float, nullable=True)
    y_coord: Mapped[Optional[float]] = mapped_column(Float, nullable=True)
    started_at: Mapped[Optional[datetime]] = mapped_column(DateTime(timezone=True), nullable=True)
    completed_at: Mapped[Optional[datetime]] = mapped_column(DateTime(timezone=True), nullable=True)
    duration_seconds: Mapped[Optional[float]] = mapped_column(Float, nullable=True)
    executed_at: Mapped[datetime] = mapped_column(DateTime(timezone=True), server_default=func.now(), nullable=False)

    user: Mapped[Optional["User"]] = relationship("User", back_populates="speed_tests")
    device: Mapped[Optional["MeasurementDevice"]] = relationship("MeasurementDevice", back_populates="speed_tests")
    campus: Mapped[Optional["Campus"]] = relationship("Campus")
    building: Mapped[Optional["Building"]] = relationship("Building")
    floor: Mapped[Optional["Floor"]] = relationship("Floor")


# 12. LAN Performance Tests
class LANPerformanceTest(Base):
    __tablename__ = "lan_performance_tests"

    id: Mapped[uuid.UUID] = mapped_column(GUID, primary_key=True, default=uuid.uuid4)
    device_id: Mapped[Optional[uuid.UUID]] = mapped_column(GUID, ForeignKey("measurement_devices.id", ondelete="SET NULL"), nullable=True, index=True)
    floor_id: Mapped[Optional[uuid.UUID]] = mapped_column(GUID, ForeignKey("floors.id", ondelete="SET NULL"), nullable=True)
    target_host: Mapped[str] = mapped_column(String(255), nullable=False)
    protocol: Mapped[str] = mapped_column(String(10), default="TCP", nullable=False)
    throughput_mbps: Mapped[float] = mapped_column(Float, nullable=False)
    jitter_ms: Mapped[Optional[float]] = mapped_column(Float, nullable=True)
    retransmits: Mapped[Optional[int]] = mapped_column(Integer, nullable=True)
    executed_at: Mapped[datetime] = mapped_column(DateTime(timezone=True), server_default=func.now(), nullable=False, index=True)


# 12.1 ML Dataset Snapshots
class MLDatasetSnapshot(Base):
    __tablename__ = "ml_dataset_snapshots"

    id: Mapped[uuid.UUID] = mapped_column(GUID, primary_key=True, default=uuid.uuid4)
    floor_id: Mapped[uuid.UUID] = mapped_column(GUID, ForeignKey("floors.id", ondelete="CASCADE"), nullable=False, index=True)
    campus_id: Mapped[Optional[uuid.UUID]] = mapped_column(GUID, ForeignKey("campuses.id", ondelete="SET NULL"), nullable=True)
    building_id: Mapped[Optional[uuid.UUID]] = mapped_column(GUID, ForeignKey("buildings.id", ondelete="SET NULL"), nullable=True)
    network_label: Mapped[Optional[str]] = mapped_column(String(100), nullable=True)
    snapshot_name: Mapped[str] = mapped_column(String(255), nullable=False)
    dataset_fingerprint: Mapped[str] = mapped_column(String(64), nullable=False, index=True)
    sample_count: Mapped[int] = mapped_column(Integer, nullable=False)
    session_count: Mapped[int] = mapped_column(Integer, nullable=False)
    provenance_summary: Mapped[dict] = mapped_column(JSON, default=dict, nullable=False)
    feature_schema_version: Mapped[str] = mapped_column(String(50), default="v1.0", nullable=False)
    created_at: Mapped[datetime] = mapped_column(DateTime(timezone=True), server_default=func.now(), nullable=False)

    floor: Mapped["Floor"] = relationship("Floor")
    models: Mapped[List["MLModel"]] = relationship("MLModel", back_populates="dataset_snapshot")


# 13. ML Models
class MLModel(Base, TimestampMixin):
    __tablename__ = "ml_models"

    id: Mapped[uuid.UUID] = mapped_column(GUID, primary_key=True, default=uuid.uuid4)
    floor_id: Mapped[Optional[uuid.UUID]] = mapped_column(GUID, ForeignKey("floors.id", ondelete="CASCADE"), nullable=True, index=True)
    campus_id: Mapped[Optional[uuid.UUID]] = mapped_column(GUID, ForeignKey("campuses.id", ondelete="SET NULL"), nullable=True)
    building_id: Mapped[Optional[uuid.UUID]] = mapped_column(GUID, ForeignKey("buildings.id", ondelete="SET NULL"), nullable=True)
    dataset_snapshot_id: Mapped[Optional[uuid.UUID]] = mapped_column(GUID, ForeignKey("ml_dataset_snapshots.id", ondelete="SET NULL"), nullable=True)
    network_label: Mapped[Optional[str]] = mapped_column(String(100), nullable=True)
    model_name: Mapped[str] = mapped_column(String(100), nullable=False)
    model_version: Mapped[str] = mapped_column(String(50), nullable=False)
    algorithm: Mapped[str] = mapped_column(String(100), nullable=False)
    status: Mapped[str] = mapped_column(String(50), default="trained", nullable=False, index=True)
    hyperparameters: Mapped[dict] = mapped_column(JSON, default=dict, nullable=False)
    training_sample_count: Mapped[int] = mapped_column(Integer, default=0, nullable=False)
    validation_sample_count: Mapped[int] = mapped_column(Integer, default=0, nullable=False)
    validation_strategy: Mapped[str] = mapped_column(String(100), default="session_group_kfold", nullable=False)
    created_by_id: Mapped[Optional[uuid.UUID]] = mapped_column(GUID, ForeignKey("users.id", ondelete="SET NULL"), nullable=True)
    error_message: Mapped[Optional[str]] = mapped_column(Text, nullable=True)
    artifact_path: Mapped[str] = mapped_column(String(512), nullable=False)
    rmse_db: Mapped[Optional[float]] = mapped_column(Float, nullable=True)
    mae_db: Mapped[Optional[float]] = mapped_column(Float, nullable=True)
    r2_score: Mapped[Optional[float]] = mapped_column(Float, nullable=True)
    is_current_champion: Mapped[bool] = mapped_column(Boolean, default=False, nullable=False)

    floor: Mapped[Optional["Floor"]] = relationship("Floor")
    dataset_snapshot: Mapped[Optional["MLDatasetSnapshot"]] = relationship("MLDatasetSnapshot", back_populates="models")
    evaluation: Mapped[Optional["MLEvaluation"]] = relationship("MLEvaluation", back_populates="model", uselist=False, cascade="all, delete-orphan")
    creator: Mapped[Optional["User"]] = relationship("User")


# 13.1 ML Evaluations
class MLEvaluation(Base):
    __tablename__ = "ml_evaluations"

    id: Mapped[uuid.UUID] = mapped_column(GUID, primary_key=True, default=uuid.uuid4)
    model_id: Mapped[uuid.UUID] = mapped_column(GUID, ForeignKey("ml_models.id", ondelete="CASCADE"), unique=True, index=True, nullable=False)
    mae_db: Mapped[float] = mapped_column(Float, nullable=False)
    rmse_db: Mapped[float] = mapped_column(Float, nullable=False)
    baseline_mean_mae_db: Mapped[float] = mapped_column(Float, nullable=False)
    baseline_mean_rmse_db: Mapped[float] = mapped_column(Float, nullable=False)
    baseline_idw_mae_db: Mapped[Optional[float]] = mapped_column(Float, nullable=True)
    baseline_idw_rmse_db: Mapped[Optional[float]] = mapped_column(Float, nullable=True)
    evaluation_sample_count: Mapped[int] = mapped_column(Integer, nullable=False)
    spatial_coverage_pct: Mapped[float] = mapped_column(Float, nullable=False)
    validation_method: Mapped[str] = mapped_column(String(100), nullable=False)
    residuals_distribution: Mapped[dict] = mapped_column(JSON, default=dict, nullable=False)
    is_statistically_sound: Mapped[bool] = mapped_column(Boolean, default=True, nullable=False)
    evaluated_at: Mapped[datetime] = mapped_column(DateTime(timezone=True), server_default=func.now(), nullable=False)

    model: Mapped["MLModel"] = relationship("MLModel", back_populates="evaluation")


# 14. AI Providers
class AIProvider(Base, TimestampMixin):
    __tablename__ = "ai_providers"

    id: Mapped[uuid.UUID] = mapped_column(GUID, primary_key=True, default=uuid.uuid4)
    name: Mapped[str] = mapped_column(String(100), unique=True, nullable=False)
    base_url: Mapped[str] = mapped_column(String(512), nullable=False)
    is_active: Mapped[bool] = mapped_column(Boolean, default=True, nullable=False)

    execution_records: Mapped[List["AIExecutionRecord"]] = relationship("AIExecutionRecord", back_populates="provider")


# 15. AI Execution Records
class AIExecutionRecord(Base):
    __tablename__ = "ai_execution_records"
    __table_args__ = (
        Index("ix_ai_records_request_id", "request_id"),
    )

    id: Mapped[uuid.UUID] = mapped_column(GUID, primary_key=True, default=uuid.uuid4)
    provider_id: Mapped[Optional[uuid.UUID]] = mapped_column(GUID, ForeignKey("ai_providers.id", ondelete="SET NULL"), nullable=True)
    request_id: Mapped[str] = mapped_column(String(100), unique=True, nullable=False)
    prompt_category: Mapped[str] = mapped_column(String(50), nullable=False)
    requested_model: Mapped[str] = mapped_column(String(100), nullable=False)
    verified_model: Mapped[Optional[str]] = mapped_column(String(100), nullable=True)
    is_verified_execution: Mapped[bool] = mapped_column(Boolean, default=False, nullable=False)
    fallback_detected: Mapped[bool] = mapped_column(Boolean, default=False, nullable=False)
    tokens_prompt: Mapped[Optional[int]] = mapped_column(Integer, nullable=True)
    tokens_completion: Mapped[Optional[int]] = mapped_column(Integer, nullable=True)
    duration_ms: Mapped[int] = mapped_column(Integer, nullable=False)
    status: Mapped[str] = mapped_column(String(50), nullable=False)
    error_message: Mapped[Optional[str]] = mapped_column(Text, nullable=True)
    executed_at: Mapped[datetime] = mapped_column(DateTime(timezone=True), server_default=func.now(), nullable=False, index=True)

    provider: Mapped[Optional["AIProvider"]] = relationship("AIProvider", back_populates="execution_records")


# 16. Automation Workflows
class AutomationWorkflow(Base, TimestampMixin):
    __tablename__ = "automation_workflows"
    __table_args__ = (
        Index("ix_auto_workflows_trigger", "event_trigger"),
    )

    id: Mapped[uuid.UUID] = mapped_column(GUID, primary_key=True, default=uuid.uuid4)
    name: Mapped[str] = mapped_column(String(100), nullable=False)
    event_trigger: Mapped[str] = mapped_column(String(100), nullable=False)
    webhook_url: Mapped[str] = mapped_column(String(512), nullable=False)
    is_active: Mapped[bool] = mapped_column(Boolean, default=True, nullable=False)


# 17. System Events
class SystemEvent(Base):
    __tablename__ = "system_events"
    __table_args__ = (
        Index("ix_system_events_type", "event_type"),
    )

    id: Mapped[uuid.UUID] = mapped_column(GUID, primary_key=True, default=uuid.uuid4)
    event_type: Mapped[str] = mapped_column(String(100), nullable=False)
    source: Mapped[str] = mapped_column(String(100), nullable=False)
    payload: Mapped[dict] = mapped_column(JSON, default=dict, nullable=False)
    occurred_at: Mapped[datetime] = mapped_column(DateTime(timezone=True), server_default=func.now(), nullable=False, index=True)

    alerts: Mapped[List["Alert"]] = relationship("Alert", back_populates="event")


# 18. Alerts
class Alert(Base):
    __tablename__ = "alerts"

    id: Mapped[uuid.UUID] = mapped_column(GUID, primary_key=True, default=uuid.uuid4)
    event_id: Mapped[Optional[uuid.UUID]] = mapped_column(GUID, ForeignKey("system_events.id", ondelete="SET NULL"), nullable=True)
    severity: Mapped[str] = mapped_column(String(20), nullable=False, index=True)
    title: Mapped[str] = mapped_column(String(255), nullable=False)
    description: Mapped[str] = mapped_column(Text, nullable=False)
    status: Mapped[str] = mapped_column(String(50), default="open", nullable=False)
    created_at: Mapped[datetime] = mapped_column(DateTime(timezone=True), server_default=func.now(), nullable=False, index=True)
    resolved_at: Mapped[Optional[datetime]] = mapped_column(DateTime(timezone=True), nullable=True)

    event: Mapped[Optional["SystemEvent"]] = relationship("SystemEvent", back_populates="alerts")
    deliveries: Mapped[List["EmailDelivery"]] = relationship("EmailDelivery", back_populates="alert")


# 19. Email Deliveries
class EmailDelivery(Base):
    __tablename__ = "email_deliveries"

    id: Mapped[uuid.UUID] = mapped_column(GUID, primary_key=True, default=uuid.uuid4)
    alert_id: Mapped[Optional[uuid.UUID]] = mapped_column(GUID, ForeignKey("alerts.id", ondelete="SET NULL"), nullable=True)
    recipient_email: Mapped[str] = mapped_column(String(255), nullable=False)
    subject: Mapped[str] = mapped_column(String(255), nullable=False)
    delivery_status: Mapped[str] = mapped_column(String(50), default="simulated", nullable=False)
    provider_response_id: Mapped[Optional[str]] = mapped_column(String(100), nullable=True)
    attempted_at: Mapped[datetime] = mapped_column(DateTime(timezone=True), server_default=func.now(), nullable=False)

    alert: Mapped[Optional["Alert"]] = relationship("Alert", back_populates="deliveries")


# 20. AP Optimization Simulations
class APOptimizationSimulation(Base):
    __tablename__ = "ap_optimization_simulations"
    __table_args__ = (
        Index("ix_ap_sim_floor_id", "floor_id"),
    )

    id: Mapped[uuid.UUID] = mapped_column(GUID, primary_key=True, default=uuid.uuid4)
    floor_id: Mapped[uuid.UUID] = mapped_column(GUID, ForeignKey("floors.id", ondelete="CASCADE"), nullable=False)
    model_id: Mapped[Optional[uuid.UUID]] = mapped_column(GUID, ForeignKey("ml_models.id", ondelete="SET NULL"), nullable=True)
    budget_ap_count: Mapped[int] = mapped_column(Integer, nullable=False)
    optimized_coverage_pct: Mapped[float] = mapped_column(Float, nullable=False)
    weak_zone_reduction_pct: Mapped[float] = mapped_column(Float, nullable=False)
    ap_coordinates_json: Mapped[dict] = mapped_column(JSON, default=dict, nullable=False)
    executed_at: Mapped[datetime] = mapped_column(DateTime(timezone=True), server_default=func.now(), nullable=False)


# 21. Network Diagnostic Reports (Phase 06)
class NetworkDiagnosticReport(Base, TimestampMixin):
    __tablename__ = "network_diagnostic_reports"
    __table_args__ = (
        Index("ix_net_diag_rep_floor", "floor_id"),
        Index("ix_net_diag_rep_user", "user_id"),
        Index("ix_net_diag_rep_created", "created_at"),
    )

    id: Mapped[uuid.UUID] = mapped_column(GUID, primary_key=True, default=uuid.uuid4)
    title: Mapped[str] = mapped_column(String(255), nullable=False)
    campus_id: Mapped[Optional[uuid.UUID]] = mapped_column(GUID, ForeignKey("campuses.id", ondelete="SET NULL"), nullable=True)
    building_id: Mapped[Optional[uuid.UUID]] = mapped_column(GUID, ForeignKey("buildings.id", ondelete="SET NULL"), nullable=True)
    floor_id: Mapped[Optional[uuid.UUID]] = mapped_column(GUID, ForeignKey("floors.id", ondelete="SET NULL"), nullable=True)
    user_id: Mapped[Optional[uuid.UUID]] = mapped_column(GUID, ForeignKey("users.id", ondelete="SET NULL"), nullable=True)
    device_fingerprint: Mapped[Optional[str]] = mapped_column(String(64), nullable=True)
    device_name: Mapped[str] = mapped_column(String(255), default="Operator Workstation", nullable=False)
    interface_name: Mapped[str] = mapped_column(String(64), nullable=False)
    vantage_point: Mapped[str] = mapped_column(String(50), default="local_collector", nullable=False)
    data_provenance: Mapped[str] = mapped_column(String(64), default="instrumented_linux_telemetry", nullable=False)
    status: Mapped[str] = mapped_column(String(50), default="analyzed", nullable=False)
    summary_headline: Mapped[str] = mapped_column(Text, nullable=False)
    overall_score: Mapped[int] = mapped_column(Integer, default=100, nullable=False)
    findings_count: Mapped[int] = mapped_column(Integer, default=0, nullable=False)
    critical_count: Mapped[int] = mapped_column(Integer, default=0, nullable=False)
    warning_count: Mapped[int] = mapped_column(Integer, default=0, nullable=False)
    good_count: Mapped[int] = mapped_column(Integer, default=0, nullable=False)
    updated_at: Mapped[datetime] = mapped_column(
        DateTime(timezone=True), server_default=func.now(), onupdate=func.now(), nullable=False
    )

    user: Mapped[Optional["User"]] = relationship("User")
    campus: Mapped[Optional["Campus"]] = relationship("Campus")
    building: Mapped[Optional["Building"]] = relationship("Building")
    floor: Mapped[Optional["Floor"]] = relationship("Floor")
    telemetry: Mapped[Optional["NetworkTelemetrySnapshot"]] = relationship("NetworkTelemetrySnapshot", back_populates="report", uselist=False, cascade="all, delete-orphan")
    findings: Mapped[List["NetworkDiagnosticFinding"]] = relationship("NetworkDiagnosticFinding", back_populates="report", cascade="all, delete-orphan")


# 22. Network Telemetry Snapshots (Phase 06)
class NetworkTelemetrySnapshot(Base):
    __tablename__ = "network_telemetry_snapshots"
    __table_args__ = (
        Index("ix_net_tel_snap_report", "report_id"),
        Index("ix_net_tel_snap_user", "user_id"),
        Index("ix_net_tel_snap_collected", "collected_at"),
        UniqueConstraint("collector_id", "submission_nonce", name="uq_net_tel_snap_collector_nonce"),
    )

    id: Mapped[uuid.UUID] = mapped_column(GUID, primary_key=True, default=uuid.uuid4)
    report_id: Mapped[Optional[uuid.UUID]] = mapped_column(GUID, ForeignKey("network_diagnostic_reports.id", ondelete="CASCADE"), nullable=True)
    user_id: Mapped[Optional[uuid.UUID]] = mapped_column(GUID, ForeignKey("users.id", ondelete="SET NULL"), nullable=True)
    campus_id: Mapped[Optional[uuid.UUID]] = mapped_column(GUID, ForeignKey("campuses.id", ondelete="SET NULL"), nullable=True)
    building_id: Mapped[Optional[uuid.UUID]] = mapped_column(GUID, ForeignKey("buildings.id", ondelete="SET NULL"), nullable=True)
    floor_id: Mapped[Optional[uuid.UUID]] = mapped_column(GUID, ForeignKey("floors.id", ondelete="SET NULL"), nullable=True)
    interface_name: Mapped[str] = mapped_column(String(64), nullable=False)
    mac_address: Mapped[Optional[str]] = mapped_column(String(32), nullable=True)
    ssid: Mapped[Optional[str]] = mapped_column(String(64), nullable=True)
    bssid: Mapped[Optional[str]] = mapped_column(String(32), nullable=True)
    rssi_dbm: Mapped[Optional[float]] = mapped_column(Float, nullable=True)
    signal_quality_pct: Mapped[Optional[int]] = mapped_column(Integer, nullable=True)
    frequency_mhz: Mapped[Optional[int]] = mapped_column(Integer, nullable=True)
    channel: Mapped[Optional[int]] = mapped_column(Integer, nullable=True)
    channel_width_mhz: Mapped[Optional[int]] = mapped_column(Integer, nullable=True)
    band: Mapped[Optional[str]] = mapped_column(String(32), nullable=True)
    rx_bitrate_mbps: Mapped[Optional[float]] = mapped_column(Float, nullable=True)
    tx_bitrate_mbps: Mapped[Optional[float]] = mapped_column(Float, nullable=True)
    security_protocol: Mapped[Optional[str]] = mapped_column(String(64), nullable=True)
    gateway_ip: Mapped[Optional[str]] = mapped_column(String(64), nullable=True)
    gateway_ping_avg_ms: Mapped[Optional[float]] = mapped_column(Float, nullable=True)
    gateway_ping_min_ms: Mapped[Optional[float]] = mapped_column(Float, nullable=True)
    gateway_ping_max_ms: Mapped[Optional[float]] = mapped_column(Float, nullable=True)
    gateway_ping_loss_pct: Mapped[Optional[float]] = mapped_column(Float, nullable=True)
    lan_iperf_throughput_mbps: Mapped[Optional[float]] = mapped_column(Float, nullable=True)
    internet_speed_test_id: Mapped[Optional[uuid.UUID]] = mapped_column(GUID, ForeignKey("internet_speed_tests.id", ondelete="SET NULL"), nullable=True)
    internet_download_mbps: Mapped[Optional[float]] = mapped_column(Float, nullable=True)
    internet_upload_mbps: Mapped[Optional[float]] = mapped_column(Float, nullable=True)
    internet_latency_ms: Mapped[Optional[float]] = mapped_column(Float, nullable=True)
    vantage_point: Mapped[str] = mapped_column(String(50), default="local_collector", nullable=False)
    data_provenance: Mapped[str] = mapped_column(String(64), default="instrumented_linux_telemetry", nullable=False)
    raw_details: Mapped[dict] = mapped_column(JSON, default=dict, nullable=False)
    collected_at: Mapped[datetime] = mapped_column(DateTime(timezone=True), server_default=func.now(), nullable=False)
    # Set only for signed submissions from a registered collector; (collector_id, nonce) rejects replays.
    collector_id: Mapped[Optional[uuid.UUID]] = mapped_column(GUID, ForeignKey("network_collectors.id", ondelete="SET NULL"), nullable=True, index=True)
    submission_nonce: Mapped[Optional[str]] = mapped_column(String(64), nullable=True)
    collection_status: Mapped[str] = mapped_column(String(32), default="collected", server_default="collected", nullable=False)
    collection_error: Mapped[Optional[str]] = mapped_column(String(255), nullable=True)
    connection_state: Mapped[Optional[str]] = mapped_column(String(32), nullable=True)

    report: Mapped[Optional["NetworkDiagnosticReport"]] = relationship("NetworkDiagnosticReport", back_populates="telemetry")
    internet_speed_test: Mapped[Optional["InternetSpeedTest"]] = relationship("InternetSpeedTest")
    collector: Mapped[Optional["NetworkCollector"]] = relationship("NetworkCollector")


# 23. Network Diagnostic Findings (Phase 06)
class NetworkDiagnosticFinding(Base):
    __tablename__ = "network_diagnostic_findings"
    __table_args__ = (
        Index("ix_net_diag_find_report", "report_id"),
        Index("ix_net_diag_find_category", "category"),
        Index("ix_net_diag_find_severity", "severity"),
    )

    id: Mapped[uuid.UUID] = mapped_column(GUID, primary_key=True, default=uuid.uuid4)
    report_id: Mapped[uuid.UUID] = mapped_column(GUID, ForeignKey("network_diagnostic_reports.id", ondelete="CASCADE"), nullable=False)
    category: Mapped[str] = mapped_column(String(64), nullable=False)
    severity: Mapped[str] = mapped_column(String(32), nullable=False)
    title: Mapped[str] = mapped_column(String(255), nullable=False)
    description: Mapped[str] = mapped_column(Text, nullable=False)
    measured_evidence: Mapped[str] = mapped_column(Text, nullable=False)
    metric_key: Mapped[Optional[str]] = mapped_column(String(64), nullable=True)
    measured_value: Mapped[Optional[str]] = mapped_column(String(128), nullable=True)
    threshold_value: Mapped[Optional[str]] = mapped_column(String(128), nullable=True)
    unit: Mapped[Optional[str]] = mapped_column(String(32), nullable=True)
    recommendation: Mapped[str] = mapped_column(Text, nullable=False)
    created_at: Mapped[datetime] = mapped_column(DateTime(timezone=True), server_default=func.now(), nullable=False)

    report: Mapped["NetworkDiagnosticReport"] = relationship("NetworkDiagnosticReport", back_populates="findings")


# 24. Registered Network Collectors (trusted instruments)
class NetworkCollector(Base, TimestampMixin):
    """An operator-registered telemetry instrument.

    Its signing secret is derived from AIRGRID_SECRET_KEY + id + secret_salt and is
    never stored; rotating the salt invalidates the previous secret.
    """
    __tablename__ = "network_collectors"

    id: Mapped[uuid.UUID] = mapped_column(GUID, primary_key=True, default=uuid.uuid4)
    name: Mapped[str] = mapped_column(String(100), nullable=False)
    host_label: Mapped[Optional[str]] = mapped_column(String(100), nullable=True)
    description: Mapped[Optional[str]] = mapped_column(Text, nullable=True)
    campus_id: Mapped[Optional[uuid.UUID]] = mapped_column(GUID, ForeignKey("campuses.id", ondelete="SET NULL"), nullable=True)
    building_id: Mapped[Optional[uuid.UUID]] = mapped_column(GUID, ForeignKey("buildings.id", ondelete="SET NULL"), nullable=True)
    floor_id: Mapped[Optional[uuid.UUID]] = mapped_column(GUID, ForeignKey("floors.id", ondelete="SET NULL"), nullable=True)
    status: Mapped[str] = mapped_column(String(20), default="active", nullable=False, index=True)
    secret_salt: Mapped[str] = mapped_column(String(64), nullable=False)
    created_by_id: Mapped[Optional[uuid.UUID]] = mapped_column(GUID, ForeignKey("users.id", ondelete="SET NULL"), nullable=True)
    revoked_at: Mapped[Optional[datetime]] = mapped_column(DateTime(timezone=True), nullable=True)
    revoked_by_id: Mapped[Optional[uuid.UUID]] = mapped_column(GUID, ForeignKey("users.id", ondelete="SET NULL"), nullable=True)
    last_seen_at: Mapped[Optional[datetime]] = mapped_column(DateTime(timezone=True), nullable=True)
    last_submission_status: Mapped[Optional[str]] = mapped_column(String(32), nullable=True)
    submission_count: Mapped[int] = mapped_column(Integer, default=0, server_default="0", nullable=False)
    rejected_count: Mapped[int] = mapped_column(Integer, default=0, server_default="0", nullable=False)
    updated_at: Mapped[datetime] = mapped_column(
        DateTime(timezone=True), server_default=func.now(), onupdate=func.now(), nullable=False
    )


# 25. Data Retention Policies (no row = keep indefinitely)
class DataRetentionPolicy(Base):
    __tablename__ = "data_retention_policies"

    dataset: Mapped[str] = mapped_column(String(64), primary_key=True)
    retention_days: Mapped[Optional[int]] = mapped_column(Integer, nullable=True)
    aggregate_before_delete: Mapped[bool] = mapped_column(Boolean, default=True, nullable=False)
    updated_by_id: Mapped[Optional[uuid.UUID]] = mapped_column(GUID, ForeignKey("users.id", ondelete="SET NULL"), nullable=True)
    updated_at: Mapped[datetime] = mapped_column(
        DateTime(timezone=True), server_default=func.now(), onupdate=func.now(), nullable=False
    )


# 26. Telemetry Daily Aggregates (written by retention before raw rows are removed)
class TelemetryDailyAggregate(Base):
    __tablename__ = "telemetry_daily_aggregates"

    id: Mapped[uuid.UUID] = mapped_column(GUID, primary_key=True, default=uuid.uuid4)
    collector_id: Mapped[Optional[uuid.UUID]] = mapped_column(GUID, ForeignKey("network_collectors.id", ondelete="SET NULL"), nullable=True)
    floor_id: Mapped[Optional[uuid.UUID]] = mapped_column(GUID, ForeignKey("floors.id", ondelete="SET NULL"), nullable=True)
    vantage_point: Mapped[str] = mapped_column(String(50), nullable=False)
    data_provenance: Mapped[str] = mapped_column(String(64), nullable=False)
    day: Mapped[datetime] = mapped_column(DateTime(timezone=True), nullable=False, index=True)
    sample_count: Mapped[int] = mapped_column(Integer, nullable=False)
    # {"rssi_dbm": {"count": n, "sum": s, "min": a, "max": b}, ...} so repeated runs merge exactly.
    metrics: Mapped[dict] = mapped_column(JSON, default=dict, nullable=False)
    created_at: Mapped[datetime] = mapped_column(DateTime(timezone=True), server_default=func.now(), nullable=False)


# 27. Analyst history (deterministic or gateway-assisted analyses, questions and comparisons)
class AnalysisRecord(Base):
    __tablename__ = "analysis_records"

    id: Mapped[uuid.UUID] = mapped_column(GUID, primary_key=True, default=uuid.uuid4)
    kind: Mapped[str] = mapped_column(String(32), nullable=False)
    question: Mapped[Optional[str]] = mapped_column(Text, nullable=True)
    scope: Mapped[dict] = mapped_column(JSON, default=dict, nullable=False)
    evidence_refs: Mapped[list] = mapped_column(JSON, default=list, nullable=False)
    freshness: Mapped[dict] = mapped_column(JSON, default=dict, nullable=False)
    mode: Mapped[str] = mapped_column(String(32), nullable=False)
    gateway_status: Mapped[str] = mapped_column(String(64), default="not_requested", nullable=False)
    model_identity: Mapped[Optional[str]] = mapped_column(String(200), nullable=True)
    outcome: Mapped[str] = mapped_column(String(64), nullable=False)
    error: Mapped[Optional[str]] = mapped_column(String(500), nullable=True)
    result: Mapped[dict] = mapped_column(JSON, default=dict, nullable=False)
    user_id: Mapped[Optional[uuid.UUID]] = mapped_column(GUID, ForeignKey("users.id", ondelete="SET NULL"), nullable=True)
    created_at: Mapped[datetime] = mapped_column(DateTime(timezone=True), server_default=func.now(), nullable=False, index=True)

    user: Mapped[Optional["User"]] = relationship("User")


# 28. Persisted optimization plans (speculative AP markers; never applied to equipment)
class OptimizationPlan(Base, TimestampMixin):
    __tablename__ = "optimization_plans"

    id: Mapped[uuid.UUID] = mapped_column(GUID, primary_key=True, default=uuid.uuid4)
    campus_id: Mapped[Optional[uuid.UUID]] = mapped_column(GUID, ForeignKey("campuses.id", ondelete="SET NULL"), nullable=True)
    building_id: Mapped[Optional[uuid.UUID]] = mapped_column(GUID, ForeignKey("buildings.id", ondelete="SET NULL"), nullable=True)
    floor_id: Mapped[uuid.UUID] = mapped_column(GUID, ForeignKey("floors.id", ondelete="CASCADE"), nullable=False, index=True)
    network_label: Mapped[Optional[str]] = mapped_column(String(64), nullable=True)
    name: Mapped[str] = mapped_column(String(120), nullable=False)
    notes: Mapped[Optional[str]] = mapped_column(Text, nullable=True)
    status: Mapped[str] = mapped_column(String(32), default="draft", nullable=False)
    markers: Mapped[list] = mapped_column(JSON, default=list, nullable=False)
    evidence_refs: Mapped[list] = mapped_column(JSON, default=list, nullable=False)
    version: Mapped[int] = mapped_column(Integer, default=1, nullable=False)
    author_id: Mapped[Optional[uuid.UUID]] = mapped_column(GUID, ForeignKey("users.id", ondelete="SET NULL"), nullable=True)
    updated_by_id: Mapped[Optional[uuid.UUID]] = mapped_column(GUID, ForeignKey("users.id", ondelete="SET NULL"), nullable=True)
    updated_at: Mapped[datetime] = mapped_column(
        DateTime(timezone=True), server_default=func.now(), onupdate=func.now(), nullable=False
    )

    author: Mapped[Optional["User"]] = relationship("User", foreign_keys=[author_id])


# 29. Campus Memberships (Campus-Scoped Access Control)
class CampusMembership(Base):
    __tablename__ = "campus_memberships"
    __table_args__ = (
        UniqueConstraint("user_id", "campus_id", name="uq_campus_memberships_user_campus"),
        Index("ix_campus_memberships_campus_id", "campus_id"),
        Index("ix_campus_memberships_user_id", "user_id"),
    )

    id: Mapped[uuid.UUID] = mapped_column(GUID, primary_key=True, default=uuid.uuid4)
    campus_id: Mapped[uuid.UUID] = mapped_column(GUID, ForeignKey("campuses.id", ondelete="CASCADE"), nullable=False)
    user_id: Mapped[uuid.UUID] = mapped_column(GUID, ForeignKey("users.id", ondelete="CASCADE"), nullable=False)
    role: Mapped[Optional[str]] = mapped_column(String(50), nullable=True)
    created_at: Mapped[datetime] = mapped_column(DateTime(timezone=True), server_default=func.now(), nullable=False)

    campus: Mapped["Campus"] = relationship("Campus", back_populates="memberships")
    user: Mapped["User"] = relationship("User", back_populates="campus_memberships")

