"""Initial schema for AirGrid Phase 00

Revision ID: 0001_initial_schema
Revises: 
Create Date: 2026-10-14 14:00:00.000000

"""
from typing import Sequence, Union
from alembic import op
import sqlalchemy as sa
from airgrid.models.base import GUID

# revision identifiers, used by Alembic.
revision: str = "0001_initial_schema"
down_revision: Union[str, None] = None
branch_labels: Union[str, Sequence[str], None] = None
depends_on: Union[str, Sequence[str], None] = None


def upgrade() -> None:
    # 1. users
    op.create_table(
        "users",
        sa.Column("id", GUID(), primary_key=True),
        sa.Column("email", sa.String(255), nullable=False, unique=True),
        sa.Column("hashed_password", sa.String(255), nullable=False),
        sa.Column("full_name", sa.String(255), nullable=False),
        sa.Column("role", sa.String(50), nullable=False, server_default="observer"),
        sa.Column("is_active", sa.Boolean(), nullable=False, server_default=sa.true()),
        sa.Column("created_at", sa.DateTime(timezone=True), server_default=sa.func.now(), nullable=False),
        sa.Column("updated_at", sa.DateTime(timezone=True), server_default=sa.func.now(), nullable=False),
    )
    op.create_index("ix_users_email", "users", ["email"])

    # 2. audit_logs
    op.create_table(
        "audit_logs",
        sa.Column("id", GUID(), primary_key=True),
        sa.Column("actor_id", GUID(), sa.ForeignKey("users.id", ondelete="SET NULL"), nullable=True),
        sa.Column("action", sa.String(100), nullable=False),
        sa.Column("resource_type", sa.String(100), nullable=False),
        sa.Column("resource_id", sa.String(100), nullable=True),
        sa.Column("payload", sa.JSON(), nullable=False),
        sa.Column("ip_address", sa.String(45), nullable=True),
        sa.Column("created_at", sa.DateTime(timezone=True), server_default=sa.func.now(), nullable=False),
    )
    op.create_index("ix_audit_logs_created_at", "audit_logs", ["created_at"])

    # 3. campuses
    op.create_table(
        "campuses",
        sa.Column("id", GUID(), primary_key=True),
        sa.Column("name", sa.String(255), nullable=False),
        sa.Column("code", sa.String(50), nullable=False, unique=True),
        sa.Column("latitude", sa.Float(), nullable=True),
        sa.Column("longitude", sa.Float(), nullable=True),
        sa.Column("address", sa.Text(), nullable=True),
        sa.Column("created_at", sa.DateTime(timezone=True), server_default=sa.func.now(), nullable=False),
        sa.Column("updated_at", sa.DateTime(timezone=True), server_default=sa.func.now(), nullable=False),
    )
    op.create_index("ix_campuses_code", "campuses", ["code"])

    # 4. buildings
    op.create_table(
        "buildings",
        sa.Column("id", GUID(), primary_key=True),
        sa.Column("campus_id", GUID(), sa.ForeignKey("campuses.id", ondelete="CASCADE"), nullable=False),
        sa.Column("name", sa.String(255), nullable=False),
        sa.Column("building_code", sa.String(50), nullable=False),
        sa.Column("floors_count", sa.Integer(), nullable=False, server_default="1"),
        sa.Column("created_at", sa.DateTime(timezone=True), server_default=sa.func.now(), nullable=False),
    )
    op.create_index("ix_buildings_campus_id", "buildings", ["campus_id"])

    # 5. floors
    op.create_table(
        "floors",
        sa.Column("id", GUID(), primary_key=True),
        sa.Column("building_id", GUID(), sa.ForeignKey("buildings.id", ondelete="CASCADE"), nullable=False),
        sa.Column("floor_number", sa.Integer(), nullable=False),
        sa.Column("name", sa.String(100), nullable=False),
        sa.Column("dimensions_width_m", sa.Float(), nullable=False, server_default="50.0"),
        sa.Column("dimensions_height_m", sa.Float(), nullable=False, server_default="30.0"),
        sa.Column("created_at", sa.DateTime(timezone=True), server_default=sa.func.now(), nullable=False),
    )
    op.create_index("ix_floors_building_id", "floors", ["building_id"])

    # 6. floor_plan_assets
    op.create_table(
        "floor_plan_assets",
        sa.Column("id", GUID(), primary_key=True),
        sa.Column("floor_id", GUID(), sa.ForeignKey("floors.id", ondelete="CASCADE"), unique=True, nullable=False),
        sa.Column("file_path", sa.String(512), nullable=False),
        sa.Column("file_format", sa.String(20), nullable=False),
        sa.Column("pixel_width", sa.Integer(), nullable=False),
        sa.Column("pixel_height", sa.Integer(), nullable=False),
        sa.Column("scale_pixels_per_meter", sa.Float(), nullable=False, server_default="20.0"),
        sa.Column("created_at", sa.DateTime(timezone=True), server_default=sa.func.now(), nullable=False),
    )

    # 7. measurement_devices
    op.create_table(
        "measurement_devices",
        sa.Column("id", GUID(), primary_key=True),
        sa.Column("device_fingerprint", sa.String(64), unique=True, nullable=False),
        sa.Column("device_name", sa.String(255), nullable=False),
        sa.Column("device_type", sa.String(50), nullable=False),
        sa.Column("os_info", sa.String(255), nullable=True),
        sa.Column("is_authorized", sa.Boolean(), nullable=False, server_default=sa.false()),
        sa.Column("last_seen_at", sa.DateTime(timezone=True), nullable=True),
        sa.Column("created_at", sa.DateTime(timezone=True), server_default=sa.func.now(), nullable=False),
    )
    op.create_index("ix_measurement_devices_fingerprint", "measurement_devices", ["device_fingerprint"])

    # 8. access_points
    op.create_table(
        "access_points",
        sa.Column("id", GUID(), primary_key=True),
        sa.Column("floor_id", GUID(), sa.ForeignKey("floors.id", ondelete="SET NULL"), nullable=True),
        sa.Column("name", sa.String(255), nullable=False),
        sa.Column("mac_address", sa.String(17), unique=True, nullable=False),
        sa.Column("model", sa.String(100), nullable=True),
        sa.Column("vendor", sa.String(100), nullable=True),
        sa.Column("x_coord", sa.Float(), nullable=True),
        sa.Column("y_coord", sa.Float(), nullable=True),
        sa.Column("channel_24ghz", sa.Integer(), nullable=True),
        sa.Column("channel_5ghz", sa.Integer(), nullable=True),
        sa.Column("tx_power_dbm", sa.Float(), nullable=False, server_default="20.0"),
        sa.Column("status", sa.String(50), nullable=False, server_default="active"),
        sa.Column("created_at", sa.DateTime(timezone=True), server_default=sa.func.now(), nullable=False),
    )
    op.create_index("ix_access_points_mac", "access_points", ["mac_address"])
    op.create_index("ix_access_points_floor_id", "access_points", ["floor_id"])

    # 9. survey_sessions
    op.create_table(
        "survey_sessions",
        sa.Column("id", GUID(), primary_key=True),
        sa.Column("floor_id", GUID(), sa.ForeignKey("floors.id", ondelete="CASCADE"), nullable=False),
        sa.Column("technician_id", GUID(), sa.ForeignKey("users.id", ondelete="SET NULL"), nullable=True),
        sa.Column("device_id", GUID(), sa.ForeignKey("measurement_devices.id", ondelete="SET NULL"), nullable=True),
        sa.Column("session_name", sa.String(255), nullable=False),
        sa.Column("started_at", sa.DateTime(timezone=True), server_default=sa.func.now(), nullable=False),
        sa.Column("completed_at", sa.DateTime(timezone=True), nullable=True),
        sa.Column("status", sa.String(50), nullable=False, server_default="in_progress"),
        sa.Column("created_at", sa.DateTime(timezone=True), server_default=sa.func.now(), nullable=False),
    )
    op.create_index("ix_survey_sessions_floor_id", "survey_sessions", ["floor_id"])

    # 10. wifi_signal_observations
    op.create_table(
        "wifi_signal_observations",
        sa.Column("id", GUID(), primary_key=True),
        sa.Column("survey_session_id", GUID(), sa.ForeignKey("survey_sessions.id", ondelete="CASCADE"), nullable=False),
        sa.Column("floor_id", GUID(), sa.ForeignKey("floors.id", ondelete="CASCADE"), nullable=False),
        sa.Column("bssid", sa.String(17), nullable=False),
        sa.Column("ssid", sa.String(64), nullable=False),
        sa.Column("rssi_dbm", sa.Float(), nullable=False),
        sa.Column("frequency_mhz", sa.Integer(), nullable=False),
        sa.Column("channel", sa.Integer(), nullable=False),
        sa.Column("noise_dbm", sa.Float(), nullable=True),
        sa.Column("snr_db", sa.Float(), nullable=True),
        sa.Column("x_coord", sa.Float(), nullable=False),
        sa.Column("y_coord", sa.Float(), nullable=False),
        sa.Column("observed_at", sa.DateTime(timezone=True), server_default=sa.func.now(), nullable=False),
    )
    op.create_index("ix_wifi_obs_bssid", "wifi_signal_observations", ["bssid"])
    op.create_index("ix_wifi_obs_floor_id", "wifi_signal_observations", ["floor_id"])
    op.create_index("ix_wifi_obs_observed_at", "wifi_signal_observations", ["observed_at"])
    op.create_index("ix_obs_floor_time", "wifi_signal_observations", ["floor_id", "observed_at"])

    # 11. internet_speed_tests
    op.create_table(
        "internet_speed_tests",
        sa.Column("id", GUID(), primary_key=True),
        sa.Column("device_id", GUID(), sa.ForeignKey("measurement_devices.id", ondelete="SET NULL"), nullable=True),
        sa.Column("floor_id", GUID(), sa.ForeignKey("floors.id", ondelete="SET NULL"), nullable=True),
        sa.Column("vantage_point", sa.String(50), nullable=False),
        sa.Column("provider_engine", sa.String(50), nullable=False),
        sa.Column("download_mbps", sa.Float(), nullable=True),
        sa.Column("upload_mbps", sa.Float(), nullable=True),
        sa.Column("latency_ms", sa.Float(), nullable=True),
        sa.Column("jitter_ms", sa.Float(), nullable=True),
        sa.Column("packet_loss_pct", sa.Float(), nullable=True),
        sa.Column("server_location", sa.String(100), nullable=True),
        sa.Column("client_ip_hashed", sa.String(64), nullable=True),
        sa.Column("x_coord", sa.Float(), nullable=True),
        sa.Column("y_coord", sa.Float(), nullable=True),
        sa.Column("executed_at", sa.DateTime(timezone=True), server_default=sa.func.now(), nullable=False),
    )
    op.create_index("ix_speed_tests_device_id", "internet_speed_tests", ["device_id"])
    op.create_index("ix_speed_tests_executed_at", "internet_speed_tests", ["executed_at"])

    # 12. lan_performance_tests
    op.create_table(
        "lan_performance_tests",
        sa.Column("id", GUID(), primary_key=True),
        sa.Column("device_id", GUID(), sa.ForeignKey("measurement_devices.id", ondelete="SET NULL"), nullable=True),
        sa.Column("floor_id", GUID(), sa.ForeignKey("floors.id", ondelete="SET NULL"), nullable=True),
        sa.Column("target_host", sa.String(255), nullable=False),
        sa.Column("protocol", sa.String(10), nullable=False, server_default="TCP"),
        sa.Column("throughput_mbps", sa.Float(), nullable=False),
        sa.Column("jitter_ms", sa.Float(), nullable=True),
        sa.Column("retransmits", sa.Integer(), nullable=True),
        sa.Column("executed_at", sa.DateTime(timezone=True), server_default=sa.func.now(), nullable=False),
    )

    # 13. ml_models
    op.create_table(
        "ml_models",
        sa.Column("id", GUID(), primary_key=True),
        sa.Column("model_name", sa.String(100), nullable=False),
        sa.Column("model_version", sa.String(50), nullable=False),
        sa.Column("algorithm", sa.String(100), nullable=False),
        sa.Column("artifact_path", sa.String(512), nullable=False),
        sa.Column("rmse_db", sa.Float(), nullable=True),
        sa.Column("mae_db", sa.Float(), nullable=True),
        sa.Column("r2_score", sa.Float(), nullable=True),
        sa.Column("is_current_champion", sa.Boolean(), nullable=False, server_default=sa.false()),
        sa.Column("created_at", sa.DateTime(timezone=True), server_default=sa.func.now(), nullable=False),
    )

    # 14. ai_providers
    op.create_table(
        "ai_providers",
        sa.Column("id", GUID(), primary_key=True),
        sa.Column("name", sa.String(100), unique=True, nullable=False),
        sa.Column("base_url", sa.String(512), nullable=False),
        sa.Column("is_active", sa.Boolean(), nullable=False, server_default=sa.true()),
        sa.Column("created_at", sa.DateTime(timezone=True), server_default=sa.func.now(), nullable=False),
    )

    # 15. ai_execution_records
    op.create_table(
        "ai_execution_records",
        sa.Column("id", GUID(), primary_key=True),
        sa.Column("provider_id", GUID(), sa.ForeignKey("ai_providers.id", ondelete="SET NULL"), nullable=True),
        sa.Column("request_id", sa.String(100), unique=True, nullable=False),
        sa.Column("prompt_category", sa.String(50), nullable=False),
        sa.Column("requested_model", sa.String(100), nullable=False),
        sa.Column("verified_model", sa.String(100), nullable=True),
        sa.Column("is_verified_execution", sa.Boolean(), nullable=False, server_default=sa.false()),
        sa.Column("fallback_detected", sa.Boolean(), nullable=False, server_default=sa.false()),
        sa.Column("tokens_prompt", sa.Integer(), nullable=True),
        sa.Column("tokens_completion", sa.Integer(), nullable=True),
        sa.Column("duration_ms", sa.Integer(), nullable=False),
        sa.Column("status", sa.String(50), nullable=False),
        sa.Column("error_message", sa.Text(), nullable=True),
        sa.Column("executed_at", sa.DateTime(timezone=True), server_default=sa.func.now(), nullable=False),
    )
    op.create_index("ix_ai_records_request_id", "ai_execution_records", ["request_id"])

    # 16. automation_workflows
    op.create_table(
        "automation_workflows",
        sa.Column("id", GUID(), primary_key=True),
        sa.Column("name", sa.String(100), nullable=False),
        sa.Column("event_trigger", sa.String(100), nullable=False),
        sa.Column("webhook_url", sa.String(512), nullable=False),
        sa.Column("is_active", sa.Boolean(), nullable=False, server_default=sa.true()),
        sa.Column("created_at", sa.DateTime(timezone=True), server_default=sa.func.now(), nullable=False),
    )
    op.create_index("ix_auto_workflows_trigger", "automation_workflows", ["event_trigger"])

    # 17. system_events
    op.create_table(
        "system_events",
        sa.Column("id", GUID(), primary_key=True),
        sa.Column("event_type", sa.String(100), nullable=False),
        sa.Column("source", sa.String(100), nullable=False),
        sa.Column("payload", sa.JSON(), nullable=False),
        sa.Column("occurred_at", sa.DateTime(timezone=True), server_default=sa.func.now(), nullable=False),
    )
    op.create_index("ix_system_events_type", "system_events", ["event_type"])
    op.create_index("ix_system_events_occurred_at", "system_events", ["occurred_at"])

    # 18. alerts
    op.create_table(
        "alerts",
        sa.Column("id", GUID(), primary_key=True),
        sa.Column("event_id", GUID(), sa.ForeignKey("system_events.id", ondelete="SET NULL"), nullable=True),
        sa.Column("severity", sa.String(20), nullable=False),
        sa.Column("title", sa.String(255), nullable=False),
        sa.Column("description", sa.Text(), nullable=False),
        sa.Column("status", sa.String(50), nullable=False, server_default="open"),
        sa.Column("created_at", sa.DateTime(timezone=True), server_default=sa.func.now(), nullable=False),
        sa.Column("resolved_at", sa.DateTime(timezone=True), nullable=True),
    )
    op.create_index("ix_alerts_severity", "alerts", ["severity"])
    op.create_index("ix_alerts_created_at", "alerts", ["created_at"])

    # 19. email_deliveries
    op.create_table(
        "email_deliveries",
        sa.Column("id", GUID(), primary_key=True),
        sa.Column("alert_id", GUID(), sa.ForeignKey("alerts.id", ondelete="SET NULL"), nullable=True),
        sa.Column("recipient_email", sa.String(255), nullable=False),
        sa.Column("subject", sa.String(255), nullable=False),
        sa.Column("delivery_status", sa.String(50), nullable=False, server_default="simulated"),
        sa.Column("provider_response_id", sa.String(100), nullable=True),
        sa.Column("attempted_at", sa.DateTime(timezone=True), server_default=sa.func.now(), nullable=False),
    )

    # 20. ap_optimization_simulations
    op.create_table(
        "ap_optimization_simulations",
        sa.Column("id", GUID(), primary_key=True),
        sa.Column("floor_id", GUID(), sa.ForeignKey("floors.id", ondelete="CASCADE"), nullable=False),
        sa.Column("model_id", GUID(), sa.ForeignKey("ml_models.id", ondelete="SET NULL"), nullable=True),
        sa.Column("budget_ap_count", sa.Integer(), nullable=False),
        sa.Column("optimized_coverage_pct", sa.Float(), nullable=False),
        sa.Column("weak_zone_reduction_pct", sa.Float(), nullable=False),
        sa.Column("ap_coordinates_json", sa.JSON(), nullable=False),
        sa.Column("executed_at", sa.DateTime(timezone=True), server_default=sa.func.now(), nullable=False),
    )
    op.create_index("ix_ap_sim_floor_id", "ap_optimization_simulations", ["floor_id"])


def downgrade() -> None:
    op.drop_table("ap_optimization_simulations")
    op.drop_table("email_deliveries")
    op.drop_table("alerts")
    op.drop_table("system_events")
    op.drop_table("automation_workflows")
    op.drop_table("ai_execution_records")
    op.drop_table("ai_providers")
    op.drop_table("ml_models")
    op.drop_table("lan_performance_tests")
    op.drop_table("internet_speed_tests")
    op.drop_table("wifi_signal_observations")
    op.drop_table("survey_sessions")
    op.drop_table("access_points")
    op.drop_table("measurement_devices")
    op.drop_table("floor_plan_assets")
    op.drop_table("floors")
    op.drop_table("buildings")
    op.drop_table("campuses")
    op.drop_table("audit_logs")
    op.drop_table("users")
