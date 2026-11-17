"""0013_ai_copilot_conversations

Revision ID: 0013_ai_copilot_conversations
Revises: 0012_campus_access_control
Create Date: 2026-11-17 17:50:00.000000

Additive: tables for AirGrid AI Copilot multi-turn conversations and messages.
Scoped strictly to authenticated users with cascade deletion on user removal.
"""

from alembic import op
import sqlalchemy as sa
from airgrid.models.base import GUID

revision = "0013_ai_copilot_conversations"
down_revision = "0012_campus_access_control"
branch_labels = None
depends_on = None


def upgrade() -> None:
    op.create_table(
        "ai_chat_conversations",
        sa.Column("id", GUID(), primary_key=True),
        sa.Column("user_id", GUID(), sa.ForeignKey("users.id", ondelete="CASCADE"), nullable=False),
        sa.Column("title", sa.String(150), nullable=False, server_default="New Conversation"),
        sa.Column("model", sa.String(100), nullable=False, server_default="auto"),
        sa.Column("campus_id", GUID(), sa.ForeignKey("campuses.id", ondelete="SET NULL"), nullable=True),
        sa.Column("created_at", sa.DateTime(timezone=True), server_default=sa.func.now(), nullable=False),
        sa.Column("updated_at", sa.DateTime(timezone=True), server_default=sa.func.now(), nullable=False),
    )
    op.create_index("ix_ai_chat_conversations_user_id", "ai_chat_conversations", ["user_id"])
    op.create_index("ix_ai_chat_conversations_updated_at", "ai_chat_conversations", ["updated_at"])

    op.create_table(
        "ai_chat_messages",
        sa.Column("id", GUID(), primary_key=True),
        sa.Column("conversation_id", GUID(), sa.ForeignKey("ai_chat_conversations.id", ondelete="CASCADE"), nullable=False),
        sa.Column("role", sa.String(20), nullable=False),
        sa.Column("content", sa.Text(), nullable=False),
        sa.Column("model_used", sa.String(100), nullable=True),
        sa.Column("tokens_prompt", sa.Integer(), nullable=True),
        sa.Column("tokens_completion", sa.Integer(), nullable=True),
        sa.Column("duration_ms", sa.Integer(), nullable=True),
        sa.Column("citations", sa.JSON(), nullable=True),
        sa.Column("status", sa.String(30), nullable=False, server_default="completed"),
        sa.Column("error_message", sa.Text(), nullable=True),
        sa.Column("created_at", sa.DateTime(timezone=True), server_default=sa.func.now(), nullable=False),
    )
    op.create_index("ix_ai_chat_messages_conversation_id", "ai_chat_messages", ["conversation_id"])
    op.create_index("ix_ai_chat_messages_created_at", "ai_chat_messages", ["created_at"])


def downgrade() -> None:
    op.drop_index("ix_ai_chat_messages_created_at", table_name="ai_chat_messages")
    op.drop_index("ix_ai_chat_messages_conversation_id", table_name="ai_chat_messages")
    op.drop_table("ai_chat_messages")

    op.drop_index("ix_ai_chat_conversations_updated_at", table_name="ai_chat_conversations")
    op.drop_index("ix_ai_chat_conversations_user_id", table_name="ai_chat_conversations")
    op.drop_table("ai_chat_conversations")
