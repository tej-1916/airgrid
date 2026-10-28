"""0006_ml_prediction_lab

Revision ID: 0006_ml_prediction_lab
Revises: 0005_survey_studio_enhancements
Create Date: 2026-10-15 07:30:00.000000
"""

from alembic import op
import sqlalchemy as sa
from airgrid.models.base import GUID

# revision identifiers, used by Alembic.
revision = "0006_ml_prediction_lab"
down_revision = "0005_survey_studio_enhancements"
branch_labels = None
depends_on = None


def upgrade() -> None:
    # 1. Create ml_dataset_snapshots table
    op.create_table(
        "ml_dataset_snapshots",
        sa.Column("id", GUID(), primary_key=True),
        sa.Column("floor_id", GUID(), sa.ForeignKey("floors.id", ondelete="CASCADE"), nullable=False),
        sa.Column("campus_id", GUID(), sa.ForeignKey("campuses.id", ondelete="SET NULL"), nullable=True),
        sa.Column("building_id", GUID(), sa.ForeignKey("buildings.id", ondelete="SET NULL"), nullable=True),
        sa.Column("network_label", sa.String(100), nullable=True),
        sa.Column("snapshot_name", sa.String(255), nullable=False),
        sa.Column("dataset_fingerprint", sa.String(64), nullable=False),
        sa.Column("sample_count", sa.Integer(), nullable=False),
        sa.Column("session_count", sa.Integer(), nullable=False),
        sa.Column("provenance_summary", sa.JSON(), nullable=False, server_default="{}"),
        sa.Column("feature_schema_version", sa.String(50), nullable=False, server_default="v1.0"),
        sa.Column("created_at", sa.DateTime(timezone=True), server_default=sa.func.now(), nullable=False),
    )
    op.create_index("ix_ml_dataset_snapshots_floor_id", "ml_dataset_snapshots", ["floor_id"])
    op.create_index("ix_ml_dataset_snapshots_dataset_fingerprint", "ml_dataset_snapshots", ["dataset_fingerprint"])

    # 2. Enhance ml_models table with MLOps metadata
    op.add_column("ml_models", sa.Column("floor_id", GUID(), sa.ForeignKey("floors.id", ondelete="CASCADE"), nullable=True))
    op.add_column("ml_models", sa.Column("campus_id", GUID(), sa.ForeignKey("campuses.id", ondelete="SET NULL"), nullable=True))
    op.add_column("ml_models", sa.Column("building_id", GUID(), sa.ForeignKey("buildings.id", ondelete="SET NULL"), nullable=True))
    op.add_column("ml_models", sa.Column("dataset_snapshot_id", GUID(), sa.ForeignKey("ml_dataset_snapshots.id", ondelete="SET NULL"), nullable=True))
    op.add_column("ml_models", sa.Column("network_label", sa.String(100), nullable=True))
    op.add_column("ml_models", sa.Column("status", sa.String(50), nullable=False, server_default="trained"))
    op.add_column("ml_models", sa.Column("hyperparameters", sa.JSON(), nullable=False, server_default="{}"))
    op.add_column("ml_models", sa.Column("training_sample_count", sa.Integer(), nullable=False, server_default="0"))
    op.add_column("ml_models", sa.Column("validation_sample_count", sa.Integer(), nullable=False, server_default="0"))
    op.add_column("ml_models", sa.Column("validation_strategy", sa.String(100), nullable=False, server_default="session_group_kfold"))
    op.add_column("ml_models", sa.Column("created_by_id", GUID(), sa.ForeignKey("users.id", ondelete="SET NULL"), nullable=True))
    op.add_column("ml_models", sa.Column("error_message", sa.Text(), nullable=True))

    op.create_index("ix_ml_models_floor_id", "ml_models", ["floor_id"])
    op.create_index("ix_ml_models_status", "ml_models", ["status"])

    # 3. Create ml_evaluations table
    op.create_table(
        "ml_evaluations",
        sa.Column("id", GUID(), primary_key=True),
        sa.Column("model_id", GUID(), sa.ForeignKey("ml_models.id", ondelete="CASCADE"), nullable=False),
        sa.Column("mae_db", sa.Float(), nullable=False),
        sa.Column("rmse_db", sa.Float(), nullable=False),
        sa.Column("baseline_mean_mae_db", sa.Float(), nullable=False),
        sa.Column("baseline_mean_rmse_db", sa.Float(), nullable=False),
        sa.Column("baseline_idw_mae_db", sa.Float(), nullable=True),
        sa.Column("baseline_idw_rmse_db", sa.Float(), nullable=True),
        sa.Column("evaluation_sample_count", sa.Integer(), nullable=False),
        sa.Column("spatial_coverage_pct", sa.Float(), nullable=False),
        sa.Column("validation_method", sa.String(100), nullable=False),
        sa.Column("residuals_distribution", sa.JSON(), nullable=False, server_default="{}"),
        sa.Column("is_statistically_sound", sa.Boolean(), nullable=False, server_default="true"),
        sa.Column("evaluated_at", sa.DateTime(timezone=True), server_default=sa.func.now(), nullable=False),
    )
    op.create_index("ix_ml_evaluations_model_id", "ml_evaluations", ["model_id"], unique=True)


def downgrade() -> None:
    op.drop_table("ml_evaluations")

    op.drop_index("ix_ml_models_status", table_name="ml_models")
    op.drop_index("ix_ml_models_floor_id", table_name="ml_models")
    op.drop_column("ml_models", "error_message")
    op.drop_column("ml_models", "created_by_id")
    op.drop_column("ml_models", "validation_strategy")
    op.drop_column("ml_models", "validation_sample_count")
    op.drop_column("ml_models", "training_sample_count")
    op.drop_column("ml_models", "hyperparameters")
    op.drop_column("ml_models", "status")
    op.drop_column("ml_models", "network_label")
    op.drop_column("ml_models", "dataset_snapshot_id")
    op.drop_column("ml_models", "building_id")
    op.drop_column("ml_models", "campus_id")
    op.drop_column("ml_models", "floor_id")

    op.drop_table("ml_dataset_snapshots")
