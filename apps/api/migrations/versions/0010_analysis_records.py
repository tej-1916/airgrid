"""0010_analysis_records

Revision ID: 0010_analysis_records
Revises: 0009_registered_collectors
Create Date: 2026-10-28 15:00:00.000000

Additive only: persisted Analyst history.
"""

from alembic import op
import sqlalchemy as sa
from airgrid.models.base import GUID

revision = "0010_analysis_records"
down_revision = "0009_registered_collectors"
branch_labels = None
depends_on = None


def upgrade() -> None:
    op.create_table(
        "analysis_records",
        sa.Column("id", GUID(), primary_key=True),
        sa.Column("kind", sa.String(32), nullable=False),
        sa.Column("question", sa.Text(), nullable=True),
        sa.Column("scope", sa.JSON(), nullable=False),
        sa.Column("evidence_refs", sa.JSON(), nullable=False),
        sa.Column("freshness", sa.JSON(), nullable=False),
        sa.Column("mode", sa.String(32), nullable=False),
        sa.Column("gateway_status", sa.String(64), nullable=False),
        sa.Column("model_identity", sa.String(200), nullable=True),
        sa.Column("outcome", sa.String(64), nullable=False),
        sa.Column("error", sa.String(500), nullable=True),
        sa.Column("result", sa.JSON(), nullable=False),
        sa.Column("user_id", GUID(), sa.ForeignKey("users.id", ondelete="SET NULL"), nullable=True),
        sa.Column("created_at", sa.DateTime(timezone=True), server_default=sa.func.now(), nullable=False),
    )
    op.create_index("ix_analysis_records_created_at", "analysis_records", ["created_at"])


def downgrade() -> None:
    op.drop_index("ix_analysis_records_created_at", table_name="analysis_records")
    op.drop_table("analysis_records")
