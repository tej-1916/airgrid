"""0011_optimization_plans

Revision ID: 0011_optimization_plans
Revises: 0010_analysis_records
Create Date: 2026-10-28 17:00:00.000000

Additive: persisted optimization plans and manual AP inventory fields.
access_points.tx_power_dbm becomes nullable so an unknown transmit power is
stored as unknown rather than an assumed 20 dBm (existing values are kept).
"""

from alembic import op
import sqlalchemy as sa
from airgrid.models.base import GUID

revision = "0011_optimization_plans"
down_revision = "0010_analysis_records"
branch_labels = None
depends_on = None


def upgrade() -> None:
    op.alter_column("access_points", "tx_power_dbm", existing_type=sa.Float(), nullable=True)
    op.add_column("access_points", sa.Column("notes", sa.Text(), nullable=True))
    op.add_column("access_points", sa.Column(
        "created_by_id", GUID(), sa.ForeignKey("users.id", ondelete="SET NULL"), nullable=True))

    op.create_table(
        "optimization_plans",
        sa.Column("id", GUID(), primary_key=True),
        sa.Column("campus_id", GUID(), sa.ForeignKey("campuses.id", ondelete="SET NULL"), nullable=True),
        sa.Column("building_id", GUID(), sa.ForeignKey("buildings.id", ondelete="SET NULL"), nullable=True),
        sa.Column("floor_id", GUID(), sa.ForeignKey("floors.id", ondelete="CASCADE"), nullable=False),
        sa.Column("network_label", sa.String(64), nullable=True),
        sa.Column("name", sa.String(120), nullable=False),
        sa.Column("notes", sa.Text(), nullable=True),
        sa.Column("status", sa.String(32), nullable=False),
        sa.Column("markers", sa.JSON(), nullable=False),
        sa.Column("evidence_refs", sa.JSON(), nullable=False),
        sa.Column("version", sa.Integer(), nullable=False),
        sa.Column("author_id", GUID(), sa.ForeignKey("users.id", ondelete="SET NULL"), nullable=True),
        sa.Column("updated_by_id", GUID(), sa.ForeignKey("users.id", ondelete="SET NULL"), nullable=True),
        sa.Column("created_at", sa.DateTime(timezone=True), server_default=sa.func.now(), nullable=False),
        sa.Column("updated_at", sa.DateTime(timezone=True), server_default=sa.func.now(), nullable=False),
    )
    op.create_index("ix_optimization_plans_floor_id", "optimization_plans", ["floor_id"])


def downgrade() -> None:
    op.drop_index("ix_optimization_plans_floor_id", table_name="optimization_plans")
    op.drop_table("optimization_plans")
    op.drop_column("access_points", "created_by_id")
    op.drop_column("access_points", "notes")
    # Restoring NOT NULL fails if an operator stored an unknown (NULL) transmit power; resolve those rows first.
    op.alter_column("access_points", "tx_power_dbm", existing_type=sa.Float(), nullable=False)
