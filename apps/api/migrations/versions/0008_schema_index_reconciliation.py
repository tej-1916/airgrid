"""0008_schema_index_reconciliation

Revision ID: 0008_schema_index_reconciliation
Revises: 0007_network_diagnostics
Create Date: 2026-10-28 12:00:00.000000

Additive only. The ORM now names the indexes migrations 0001-0007 actually created,
so the remaining drift is five indexes the models declared but no migration created.
No index, constraint or row is dropped. The redundant plain indexes that duplicate
UNIQUE constraints (e.g. ix_users_email next to users_email_key) are intentionally
left in place; removing them is an optional, operator-approved cleanup.
"""

from alembic import op

revision = "0008_schema_index_reconciliation"
down_revision = "0007_network_diagnostics"
branch_labels = None
depends_on = None

INDEXES = [
    ("ix_ai_execution_records_executed_at", "ai_execution_records", ["executed_at"]),
    ("ix_internet_speed_tests_floor_id", "internet_speed_tests", ["floor_id"]),
    ("ix_lan_performance_tests_device_id", "lan_performance_tests", ["device_id"]),
    ("ix_lan_performance_tests_executed_at", "lan_performance_tests", ["executed_at"]),
    ("ix_wifi_signal_observations_survey_session_id", "wifi_signal_observations", ["survey_session_id"]),
]


def upgrade() -> None:
    for name, table, columns in INDEXES:
        op.create_index(name, table, columns)


def downgrade() -> None:
    for name, table, _ in reversed(INDEXES):
        op.drop_index(name, table_name=table)
