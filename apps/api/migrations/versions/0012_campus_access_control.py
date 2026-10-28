"""0012_campus_access_control

Revision ID: 0012_campus_access_control
Revises: 0011_optimization_plans
Create Date: 2026-10-28 20:00:00.000000

Additive: campus memberships table for campus-scoped access control.
Enforces that non-administrator users access only their assigned campuses.
Administrators retain global access across all campuses.
"""

from alembic import op
import sqlalchemy as sa
from airgrid.models.base import GUID

revision = "0012_campus_access_control"
down_revision = "0011_optimization_plans"
branch_labels = None
depends_on = None


def upgrade() -> None:
    op.create_table(
        "campus_memberships",
        sa.Column("id", GUID(), primary_key=True),
        sa.Column("campus_id", GUID(), sa.ForeignKey("campuses.id", ondelete="CASCADE"), nullable=False),
        sa.Column("user_id", GUID(), sa.ForeignKey("users.id", ondelete="CASCADE"), nullable=False),
        sa.Column("role", sa.String(50), nullable=True),
        sa.Column("created_at", sa.DateTime(timezone=True), server_default=sa.func.now(), nullable=False),
        sa.UniqueConstraint("user_id", "campus_id", name="uq_campus_memberships_user_campus"),
    )
    op.create_index("ix_campus_memberships_campus_id", "campus_memberships", ["campus_id"])
    op.create_index("ix_campus_memberships_user_id", "campus_memberships", ["user_id"])


def downgrade() -> None:
    op.drop_index("ix_campus_memberships_user_id", table_name="campus_memberships")
    op.drop_index("ix_campus_memberships_campus_id", table_name="campus_memberships")
    op.drop_table("campus_memberships")
