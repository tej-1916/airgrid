import pytest
from sqlalchemy import create_engine
from airgrid.models.base import Base
import airgrid.models  # Ensures all models are loaded


def test_database_models_registration():
    expected_tables = {
        "users",
        "user_sessions",
        "audit_logs",
        "campuses",
        "buildings",
        "floors",
        "floor_plan_assets",
        "measurement_devices",
        "access_points",
        "survey_sessions",
        "wifi_signal_observations",
        "survey_measurements",
        "internet_speed_tests",
        "lan_performance_tests",
        "ml_dataset_snapshots",
        "ml_models",
        "ml_evaluations",
        "ai_providers",
        "ai_execution_records",
        "automation_workflows",
        "system_events",
        "alerts",
        "email_deliveries",
        "ap_optimization_simulations",
        "network_diagnostic_reports",
        "network_telemetry_snapshots",
        "network_diagnostic_findings",
    }
    actual_tables = set(Base.metadata.tables.keys())
    assert expected_tables.issubset(actual_tables), f"Missing tables: {expected_tables - actual_tables}"


def test_schema_ddl_generation():
    """Verify that all table schemas and constraints can compile to DDL without errors."""
    engine = create_engine("sqlite:///:memory:")
    Base.metadata.create_all(bind=engine)
    # If no exception raised, table creation succeeded
    assert True
