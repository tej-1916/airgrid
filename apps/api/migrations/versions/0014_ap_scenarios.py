"""0014_ap_scenarios

Revision ID: 0014_ap_scenarios
Revises: 0013_ai_copilot_conversations
Create Date: 2026-11-19 12:00:00.000000

Additive: optional hypothetical-AP scenario on optimization plans and an append-only version history.
"""

from alembic import op
import sqlalchemy as sa
from airgrid.models.base import GUID

revision = "0014_ap_scenarios"
down_revision = "0013_ai_copilot_conversations"
branch_labels = None
depends_on = None


def upgrade() -> None:
    op.add_column("optimization_plans", sa.Column("scenario", sa.JSON(), nullable=True))
    op.create_table(
        "optimization_plan_versions",
        sa.Column("id", GUID(), primary_key=True),
        sa.Column("plan_id", GUID(), sa.ForeignKey("optimization_plans.id", ondelete="CASCADE"), nullable=False),
        sa.Column("version", sa.Integer(), nullable=False),
        sa.Column("snapshot", sa.JSON(), nullable=False),
        sa.Column("author_id", GUID(), sa.ForeignKey("users.id", ondelete="SET NULL"), nullable=True),
        sa.Column("created_at", sa.DateTime(timezone=True), server_default=sa.func.now(), nullable=False),
        sa.UniqueConstraint("plan_id", "version", name="uq_optimization_plan_versions_plan_version"),
    )
    op.create_index("ix_optimization_plan_versions_plan_id", "optimization_plan_versions", ["plan_id"])


def downgrade() -> None:
    op.drop_index("ix_optimization_plan_versions_plan_id", table_name="optimization_plan_versions")
    op.drop_table("optimization_plan_versions")
    op.drop_column("optimization_plans", "scenario")
