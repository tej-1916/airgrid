"""0005_survey_studio_enhancements

Revision ID: 0005_survey_studio_enhancements
Revises: 0004_speed_test_enhancements
Create Date: 2026-10-15 02:00:00.000000
"""

from alembic import op
import sqlalchemy as sa
from airgrid.models.base import GUID

# revision identifiers, used by Alembic.
revision = "0005_survey_studio_enhancements"
down_revision = "0004_speed_test_enhancements"
branch_labels = None
depends_on = None


def upgrade() -> None:
    # 1. Enhance survey_sessions table
    op.add_column(
        "survey_sessions",
        sa.Column("campus_id", GUID(), sa.ForeignKey("campuses.id", ondelete="CASCADE"), nullable=True),
    )
    op.create_index("ix_survey_sessions_campus_id", "survey_sessions", ["campus_id"])

    op.add_column(
        "survey_sessions",
        sa.Column("building_id", GUID(), sa.ForeignKey("buildings.id", ondelete="CASCADE"), nullable=True),
    )
    op.create_index("ix_survey_sessions_building_id", "survey_sessions", ["building_id"])

    op.add_column(
        "survey_sessions",
        sa.Column("description", sa.Text(), nullable=True),
    )

    op.add_column(
        "survey_sessions",
        sa.Column(
            "updated_at",
            sa.DateTime(timezone=True),
            server_default=sa.func.now(),
            nullable=False,
        ),
    )

    op.create_index("ix_survey_sessions_status", "survey_sessions", ["status"])

    # 2. Create survey_measurements table
    op.create_table(
        "survey_measurements",
        sa.Column("id", GUID(), primary_key=True),
        sa.Column("survey_session_id", GUID(), sa.ForeignKey("survey_sessions.id", ondelete="CASCADE"), nullable=False),
        sa.Column("floor_id", GUID(), sa.ForeignKey("floors.id", ondelete="CASCADE"), nullable=False),
        sa.Column("position_x", sa.Float(), nullable=False),
        sa.Column("position_y", sa.Float(), nullable=False),
        sa.Column("normalized_x", sa.Float(), nullable=False),
        sa.Column("normalized_y", sa.Float(), nullable=False),
        sa.Column("rssi_dbm", sa.Float(), nullable=False),
        sa.Column("measurement_source", sa.String(50), nullable=False, server_default="manual_observation"),
        sa.Column("network_label", sa.String(64), nullable=True),
        sa.Column("ap_reference", sa.String(100), nullable=True),
        sa.Column("frequency_mhz", sa.Integer(), nullable=True),
        sa.Column("channel", sa.Integer(), nullable=True),
        sa.Column("notes", sa.Text(), nullable=True),
        sa.Column("data_provenance", sa.String(50), nullable=False, server_default="operator_reported"),
        sa.Column("observed_at", sa.DateTime(timezone=True), server_default=sa.func.now(), nullable=False),
        sa.Column("created_at", sa.DateTime(timezone=True), server_default=sa.func.now(), nullable=False),
    )

    op.create_index("ix_survey_measurements_session_id", "survey_measurements", ["survey_session_id"])
    op.create_index("ix_survey_measurements_floor_id", "survey_measurements", ["floor_id"])
    op.create_index("ix_survey_measurements_observed_at", "survey_measurements", ["observed_at"])


def downgrade() -> None:
    # 1. Drop survey_measurements
    op.drop_index("ix_survey_measurements_observed_at", table_name="survey_measurements")
    op.drop_index("ix_survey_measurements_floor_id", table_name="survey_measurements")
    op.drop_index("ix_survey_measurements_session_id", table_name="survey_measurements")
    op.drop_table("survey_measurements")

    # 2. Revert survey_sessions enhancements
    op.drop_index("ix_survey_sessions_status", table_name="survey_sessions")
    op.drop_column("survey_sessions", "updated_at")
    op.drop_column("survey_sessions", "description")
    op.drop_index("ix_survey_sessions_building_id", table_name="survey_sessions")
    op.drop_column("survey_sessions", "building_id")
    op.drop_index("ix_survey_sessions_campus_id", table_name="survey_sessions")
    op.drop_column("survey_sessions", "campus_id")
