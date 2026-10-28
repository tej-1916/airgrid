"""0007_network_diagnostics

Revision ID: 0007_network_diagnostics
Revises: 0006_ml_prediction_lab
Create Date: 2026-10-28 10:15:00.000000
"""

from alembic import op
import sqlalchemy as sa
from airgrid.models.base import GUID

# revision identifiers, used by Alembic.
revision = "0007_network_diagnostics"
down_revision = "0006_ml_prediction_lab"
branch_labels = None
depends_on = None


def upgrade() -> None:
    # 1. Create network_diagnostic_reports table
    op.create_table(
        "network_diagnostic_reports",
        sa.Column("id", GUID(), primary_key=True),
        sa.Column("title", sa.String(255), nullable=False),
        sa.Column("campus_id", GUID(), sa.ForeignKey("campuses.id", ondelete="SET NULL"), nullable=True),
        sa.Column("building_id", GUID(), sa.ForeignKey("buildings.id", ondelete="SET NULL"), nullable=True),
        sa.Column("floor_id", GUID(), sa.ForeignKey("floors.id", ondelete="SET NULL"), nullable=True),
        sa.Column("user_id", GUID(), sa.ForeignKey("users.id", ondelete="SET NULL"), nullable=True),
        sa.Column("device_fingerprint", sa.String(64), nullable=True),
        sa.Column("device_name", sa.String(255), nullable=False, server_default="Operator Workstation"),
        sa.Column("interface_name", sa.String(64), nullable=False),
        sa.Column("vantage_point", sa.String(50), nullable=False, server_default="local_collector"),
        sa.Column("data_provenance", sa.String(64), nullable=False, server_default="instrumented_linux_telemetry"),
        sa.Column("status", sa.String(50), nullable=False, server_default="analyzed"),
        sa.Column("summary_headline", sa.Text(), nullable=False),
        sa.Column("overall_score", sa.Integer(), nullable=False, server_default="100"),
        sa.Column("findings_count", sa.Integer(), nullable=False, server_default="0"),
        sa.Column("critical_count", sa.Integer(), nullable=False, server_default="0"),
        sa.Column("warning_count", sa.Integer(), nullable=False, server_default="0"),
        sa.Column("good_count", sa.Integer(), nullable=False, server_default="0"),
        sa.Column("created_at", sa.DateTime(timezone=True), server_default=sa.func.now(), nullable=False),
        sa.Column("updated_at", sa.DateTime(timezone=True), server_default=sa.func.now(), nullable=False),
    )
    op.create_index("ix_net_diag_rep_user", "network_diagnostic_reports", ["user_id"])
    op.create_index("ix_net_diag_rep_created", "network_diagnostic_reports", ["created_at"])
    op.create_index("ix_net_diag_rep_floor", "network_diagnostic_reports", ["floor_id"])

    # 2. Create network_telemetry_snapshots table
    op.create_table(
        "network_telemetry_snapshots",
        sa.Column("id", GUID(), primary_key=True),
        sa.Column("report_id", GUID(), sa.ForeignKey("network_diagnostic_reports.id", ondelete="CASCADE"), nullable=True),
        sa.Column("user_id", GUID(), sa.ForeignKey("users.id", ondelete="SET NULL"), nullable=True),
        sa.Column("campus_id", GUID(), sa.ForeignKey("campuses.id", ondelete="SET NULL"), nullable=True),
        sa.Column("building_id", GUID(), sa.ForeignKey("buildings.id", ondelete="SET NULL"), nullable=True),
        sa.Column("floor_id", GUID(), sa.ForeignKey("floors.id", ondelete="SET NULL"), nullable=True),
        sa.Column("interface_name", sa.String(64), nullable=False),
        sa.Column("mac_address", sa.String(32), nullable=True),
        sa.Column("ssid", sa.String(64), nullable=True),
        sa.Column("bssid", sa.String(32), nullable=True),
        sa.Column("rssi_dbm", sa.Float(), nullable=True),
        sa.Column("signal_quality_pct", sa.Integer(), nullable=True),
        sa.Column("frequency_mhz", sa.Integer(), nullable=True),
        sa.Column("channel", sa.Integer(), nullable=True),
        sa.Column("channel_width_mhz", sa.Integer(), nullable=True),
        sa.Column("band", sa.String(32), nullable=True),
        sa.Column("rx_bitrate_mbps", sa.Float(), nullable=True),
        sa.Column("tx_bitrate_mbps", sa.Float(), nullable=True),
        sa.Column("security_protocol", sa.String(64), nullable=True),
        sa.Column("gateway_ip", sa.String(64), nullable=True),
        sa.Column("gateway_ping_avg_ms", sa.Float(), nullable=True),
        sa.Column("gateway_ping_min_ms", sa.Float(), nullable=True),
        sa.Column("gateway_ping_max_ms", sa.Float(), nullable=True),
        sa.Column("gateway_ping_loss_pct", sa.Float(), nullable=True),
        sa.Column("lan_iperf_throughput_mbps", sa.Float(), nullable=True),
        sa.Column("internet_speed_test_id", GUID(), sa.ForeignKey("internet_speed_tests.id", ondelete="SET NULL"), nullable=True),
        sa.Column("internet_download_mbps", sa.Float(), nullable=True),
        sa.Column("internet_upload_mbps", sa.Float(), nullable=True),
        sa.Column("internet_latency_ms", sa.Float(), nullable=True),
        sa.Column("vantage_point", sa.String(50), nullable=False, server_default="local_collector"),
        sa.Column("data_provenance", sa.String(64), nullable=False, server_default="instrumented_linux_telemetry"),
        sa.Column("raw_details", sa.JSON(), nullable=False, server_default="{}"),
        sa.Column("collected_at", sa.DateTime(timezone=True), server_default=sa.func.now(), nullable=False),
    )
    op.create_index("ix_net_tel_snap_report", "network_telemetry_snapshots", ["report_id"])
    op.create_index("ix_net_tel_snap_collected", "network_telemetry_snapshots", ["collected_at"])
    op.create_index("ix_net_tel_snap_user", "network_telemetry_snapshots", ["user_id"])

    # 3. Create network_diagnostic_findings table
    op.create_table(
        "network_diagnostic_findings",
        sa.Column("id", GUID(), primary_key=True),
        sa.Column("report_id", GUID(), sa.ForeignKey("network_diagnostic_reports.id", ondelete="CASCADE"), nullable=False),
        sa.Column("category", sa.String(64), nullable=False),
        sa.Column("severity", sa.String(32), nullable=False),
        sa.Column("title", sa.String(255), nullable=False),
        sa.Column("description", sa.Text(), nullable=False),
        sa.Column("measured_evidence", sa.Text(), nullable=False),
        sa.Column("metric_key", sa.String(64), nullable=True),
        sa.Column("measured_value", sa.String(128), nullable=True),
        sa.Column("threshold_value", sa.String(128), nullable=True),
        sa.Column("unit", sa.String(32), nullable=True),
        sa.Column("recommendation", sa.Text(), nullable=False),
        sa.Column("created_at", sa.DateTime(timezone=True), server_default=sa.func.now(), nullable=False),
    )
    op.create_index("ix_net_diag_find_report", "network_diagnostic_findings", ["report_id"])
    op.create_index("ix_net_diag_find_severity", "network_diagnostic_findings", ["severity"])
    op.create_index("ix_net_diag_find_category", "network_diagnostic_findings", ["category"])


def downgrade() -> None:
    op.drop_table("network_diagnostic_findings")
    op.drop_table("network_telemetry_snapshots")
    op.drop_table("network_diagnostic_reports")
