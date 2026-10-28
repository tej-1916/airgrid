"""0009_registered_collectors

Revision ID: 0009_registered_collectors
Revises: 0008_schema_index_reconciliation
Create Date: 2026-10-28 13:00:00.000000

Additive only: registered collectors, retention policies, daily aggregates, and
nullable provenance columns on existing telemetry/survey tables. Existing rows
keep their values; collection_status defaults to 'collected' for them.
"""

from alembic import op
import sqlalchemy as sa
from airgrid.models.base import GUID

revision = "0009_registered_collectors"
down_revision = "0008_schema_index_reconciliation"
branch_labels = None
depends_on = None


def upgrade() -> None:
    op.create_table(
        "network_collectors",
        sa.Column("id", GUID(), primary_key=True),
        sa.Column("name", sa.String(100), nullable=False),
        sa.Column("host_label", sa.String(100), nullable=True),
        sa.Column("description", sa.Text(), nullable=True),
        sa.Column("campus_id", GUID(), sa.ForeignKey("campuses.id", ondelete="SET NULL"), nullable=True),
        sa.Column("building_id", GUID(), sa.ForeignKey("buildings.id", ondelete="SET NULL"), nullable=True),
        sa.Column("floor_id", GUID(), sa.ForeignKey("floors.id", ondelete="SET NULL"), nullable=True),
        sa.Column("status", sa.String(20), nullable=False),
        sa.Column("secret_salt", sa.String(64), nullable=False),
        sa.Column("created_by_id", GUID(), sa.ForeignKey("users.id", ondelete="SET NULL"), nullable=True),
        sa.Column("revoked_at", sa.DateTime(timezone=True), nullable=True),
        sa.Column("revoked_by_id", GUID(), sa.ForeignKey("users.id", ondelete="SET NULL"), nullable=True),
        sa.Column("last_seen_at", sa.DateTime(timezone=True), nullable=True),
        sa.Column("last_submission_status", sa.String(32), nullable=True),
        sa.Column("submission_count", sa.Integer(), server_default="0", nullable=False),
        sa.Column("rejected_count", sa.Integer(), server_default="0", nullable=False),
        sa.Column("created_at", sa.DateTime(timezone=True), server_default=sa.func.now(), nullable=False),
        sa.Column("updated_at", sa.DateTime(timezone=True), server_default=sa.func.now(), nullable=False),
    )
    op.create_index("ix_network_collectors_status", "network_collectors", ["status"])

    op.add_column("network_telemetry_snapshots", sa.Column(
        "collector_id", GUID(), sa.ForeignKey("network_collectors.id", ondelete="SET NULL"), nullable=True))
    op.add_column("network_telemetry_snapshots", sa.Column("submission_nonce", sa.String(64), nullable=True))
    op.add_column("network_telemetry_snapshots", sa.Column(
        "collection_status", sa.String(32), server_default="collected", nullable=False))
    op.add_column("network_telemetry_snapshots", sa.Column("collection_error", sa.String(255), nullable=True))
    op.add_column("network_telemetry_snapshots", sa.Column("connection_state", sa.String(32), nullable=True))
    op.create_index("ix_network_telemetry_snapshots_collector_id", "network_telemetry_snapshots", ["collector_id"])
    op.create_unique_constraint("uq_net_tel_snap_collector_nonce", "network_telemetry_snapshots",
                                ["collector_id", "submission_nonce"])

    op.add_column("survey_measurements", sa.Column(
        "source_telemetry_snapshot_id", GUID(),
        sa.ForeignKey("network_telemetry_snapshots.id", ondelete="SET NULL"), nullable=True))
    op.create_unique_constraint("survey_measurements_source_telemetry_snapshot_id_key", "survey_measurements",
                                ["source_telemetry_snapshot_id"])

    op.create_table(
        "data_retention_policies",
        sa.Column("dataset", sa.String(64), primary_key=True),
        sa.Column("retention_days", sa.Integer(), nullable=True),
        sa.Column("aggregate_before_delete", sa.Boolean(), nullable=False),
        sa.Column("updated_by_id", GUID(), sa.ForeignKey("users.id", ondelete="SET NULL"), nullable=True),
        sa.Column("updated_at", sa.DateTime(timezone=True), server_default=sa.func.now(), nullable=False),
    )

    op.create_table(
        "telemetry_daily_aggregates",
        sa.Column("id", GUID(), primary_key=True),
        sa.Column("collector_id", GUID(), sa.ForeignKey("network_collectors.id", ondelete="SET NULL"), nullable=True),
        sa.Column("floor_id", GUID(), sa.ForeignKey("floors.id", ondelete="SET NULL"), nullable=True),
        sa.Column("vantage_point", sa.String(50), nullable=False),
        sa.Column("data_provenance", sa.String(64), nullable=False),
        sa.Column("day", sa.DateTime(timezone=True), nullable=False),
        sa.Column("sample_count", sa.Integer(), nullable=False),
        sa.Column("metrics", sa.JSON(), nullable=False),
        sa.Column("created_at", sa.DateTime(timezone=True), server_default=sa.func.now(), nullable=False),
    )
    op.create_index("ix_telemetry_daily_aggregates_day", "telemetry_daily_aggregates", ["day"])


def downgrade() -> None:
    op.drop_index("ix_telemetry_daily_aggregates_day", table_name="telemetry_daily_aggregates")
    op.drop_table("telemetry_daily_aggregates")
    op.drop_table("data_retention_policies")
    op.drop_constraint("survey_measurements_source_telemetry_snapshot_id_key", "survey_measurements", type_="unique")
    op.drop_column("survey_measurements", "source_telemetry_snapshot_id")
    op.drop_constraint("uq_net_tel_snap_collector_nonce", "network_telemetry_snapshots", type_="unique")
    op.drop_index("ix_network_telemetry_snapshots_collector_id", table_name="network_telemetry_snapshots")
    for column in ("connection_state", "collection_error", "collection_status", "submission_nonce", "collector_id"):
        op.drop_column("network_telemetry_snapshots", column)
    op.drop_index("ix_network_collectors_status", table_name="network_collectors")
    op.drop_table("network_collectors")
