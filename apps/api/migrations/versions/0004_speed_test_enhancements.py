"""0004_speed_test_enhancements

Revision ID: 0004_speed_test_enhancements
Revises: 0003_campus_enhancements
Create Date: 2026-10-15 01:10:00.000000
"""

from alembic import op
import sqlalchemy as sa
from airgrid.models.base import GUID

# revision identifiers, used by Alembic.
revision = "0004_speed_test_enhancements"
down_revision = "0003_campus_enhancements"
branch_labels = None
depends_on = None


def upgrade() -> None:
    # 1. Enhance internet_speed_tests table
    op.add_column(
        "internet_speed_tests",
        sa.Column("user_id", GUID(), sa.ForeignKey("users.id", ondelete="SET NULL"), nullable=True),
    )
    op.create_index("ix_internet_speed_tests_user_id", "internet_speed_tests", ["user_id"])

    op.add_column(
        "internet_speed_tests",
        sa.Column("campus_id", GUID(), sa.ForeignKey("campuses.id", ondelete="SET NULL"), nullable=True),
    )
    op.create_index("ix_internet_speed_tests_campus_id", "internet_speed_tests", ["campus_id"])

    op.add_column(
        "internet_speed_tests",
        sa.Column("building_id", GUID(), sa.ForeignKey("buildings.id", ondelete="SET NULL"), nullable=True),
    )
    op.create_index("ix_internet_speed_tests_building_id", "internet_speed_tests", ["building_id"])

    op.add_column(
        "internet_speed_tests",
        sa.Column("status", sa.String(50), nullable=False, server_default="completed"),
    )
    op.create_index("ix_internet_speed_tests_status", "internet_speed_tests", ["status"])

    op.add_column(
        "internet_speed_tests",
        sa.Column("data_provenance", sa.String(50), nullable=False, server_default="client_reported"),
    )

    op.add_column(
        "internet_speed_tests",
        sa.Column("loaded_latency_ms", sa.Float(), nullable=True),
    )

    op.add_column(
        "internet_speed_tests",
        sa.Column("client_user_agent", sa.String(512), nullable=True),
    )

    op.add_column(
        "internet_speed_tests",
        sa.Column("quality_metadata", sa.JSON(), nullable=True),
    )

    op.add_column(
        "internet_speed_tests",
        sa.Column("error_code", sa.String(50), nullable=True),
    )

    op.add_column(
        "internet_speed_tests",
        sa.Column("error_message", sa.Text(), nullable=True),
    )

    op.add_column(
        "internet_speed_tests",
        sa.Column("started_at", sa.DateTime(timezone=True), nullable=True),
    )

    op.add_column(
        "internet_speed_tests",
        sa.Column("completed_at", sa.DateTime(timezone=True), nullable=True),
    )

    op.add_column(
        "internet_speed_tests",
        sa.Column("duration_seconds", sa.Float(), nullable=True),
    )


def downgrade() -> None:
    op.drop_column("internet_speed_tests", "duration_seconds")
    op.drop_column("internet_speed_tests", "completed_at")
    op.drop_column("internet_speed_tests", "started_at")
    op.drop_column("internet_speed_tests", "error_message")
    op.drop_column("internet_speed_tests", "error_code")
    op.drop_column("internet_speed_tests", "quality_metadata")
    op.drop_column("internet_speed_tests", "client_user_agent")
    op.drop_column("internet_speed_tests", "loaded_latency_ms")
    op.drop_column("internet_speed_tests", "data_provenance")
    op.drop_index("ix_internet_speed_tests_status", table_name="internet_speed_tests")
    op.drop_column("internet_speed_tests", "status")
    op.drop_index("ix_internet_speed_tests_building_id", table_name="internet_speed_tests")
    op.drop_column("internet_speed_tests", "building_id")
    op.drop_index("ix_internet_speed_tests_campus_id", table_name="internet_speed_tests")
    op.drop_column("internet_speed_tests", "campus_id")
    op.drop_index("ix_internet_speed_tests_user_id", table_name="internet_speed_tests")
    op.drop_column("internet_speed_tests", "user_id")
