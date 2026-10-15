"""0003_campus_floor_plan_enhancements

Revision ID: 0003_campus_floor_plan_enhancements
Revises: 0002_user_sessions
Create Date: 2026-10-15 00:30:00.000000
"""

from alembic import op
import sqlalchemy as sa
from sqlalchemy.dialects import postgresql

# revision identifiers, used by Alembic.
revision = "0003_campus_enhancements"
down_revision = "0002_user_sessions"
branch_labels = None
depends_on = None


def upgrade() -> None:
    # 1. Enhance campuses table
    op.add_column("campuses", sa.Column("description", sa.Text(), nullable=True))
    op.add_column("campuses", sa.Column("status", sa.String(50), nullable=False, server_default="active"))

    # 2. Enhance buildings table
    op.add_column("buildings", sa.Column("description", sa.Text(), nullable=True))
    op.add_column("buildings", sa.Column("status", sa.String(50), nullable=False, server_default="active"))
    op.add_column("buildings", sa.Column("updated_at", sa.DateTime(timezone=True), nullable=False, server_default=sa.func.now()))
    op.create_unique_constraint("uq_buildings_campus_building_code", "buildings", ["campus_id", "building_code"])

    # 3. Enhance floors table
    op.add_column("floors", sa.Column("status", sa.String(50), nullable=False, server_default="active"))
    op.add_column("floors", sa.Column("updated_at", sa.DateTime(timezone=True), nullable=False, server_default=sa.func.now()))
    op.create_unique_constraint("uq_floors_building_floor_number", "floors", ["building_id", "floor_number"])

    # 4. Enhance floor_plan_assets table
    op.add_column("floor_plan_assets", sa.Column("original_filename", sa.String(255), nullable=True))
    op.add_column("floor_plan_assets", sa.Column("file_size_bytes", sa.Integer(), nullable=True))
    op.add_column("floor_plan_assets", sa.Column("is_calibrated", sa.Boolean(), nullable=False, server_default=sa.false()))
    op.add_column("floor_plan_assets", sa.Column("calibration_metadata", sa.JSON(), nullable=True))
    op.add_column("floor_plan_assets", sa.Column("updated_at", sa.DateTime(timezone=True), nullable=False, server_default=sa.func.now()))


def downgrade() -> None:
    # 4. Revert floor_plan_assets
    op.drop_column("floor_plan_assets", "updated_at")
    op.drop_column("floor_plan_assets", "calibration_metadata")
    op.drop_column("floor_plan_assets", "is_calibrated")
    op.drop_column("floor_plan_assets", "file_size_bytes")
    op.drop_column("floor_plan_assets", "original_filename")

    # 3. Revert floors
    op.drop_constraint("uq_floors_building_floor_number", "floors", type_="unique")
    op.drop_column("floors", "updated_at")
    op.drop_column("floors", "status")

    # 2. Revert buildings
    op.drop_constraint("uq_buildings_campus_building_code", "buildings", type_="unique")
    op.drop_column("buildings", "updated_at")
    op.drop_column("buildings", "status")
    op.drop_column("buildings", "description")

    # 1. Revert campuses
    op.drop_column("campuses", "status")
    op.drop_column("campuses", "description")
