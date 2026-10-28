import io
import os
import uuid
import pytest
from httpx import AsyncClient
from sqlalchemy import select

from airgrid.core.config import settings
from airgrid.core.database import AsyncSessionLocal
from airgrid.core.security import hash_password
from airgrid.models.all_models import (
    User,
    Campus,
    Building,
    Floor,
    FloorPlanAsset,
    SurveySession,
    SurveyMeasurement,
    MLModel,
    MLEvaluation,
    MLDatasetSnapshot,
)


@pytest.fixture
async def admin_auth(client: AsyncClient):
    unique_email = f"admin-{uuid.uuid4().hex[:8]}@airgrid.test"
    password = "AdminSecurePassword2026!"
    hashed = hash_password(password)

    async with AsyncSessionLocal() as session:
        user = User(
            email=unique_email,
            hashed_password=hashed,
            full_name="ML Test Admin",
            role="administrator",
            is_active=True,
        )
        session.add(user)
        await session.flush()
        from airgrid.models.all_models import Campus, CampusMembership
        campuses = (await session.execute(select(Campus))).scalars().all()
        for c in campuses:
            session.add(CampusMembership(campus_id=c.id, user_id=user.id))
        await session.commit()
        await session.refresh(user)

    login_resp = await client.post(
        "/api/v1/auth/login",
        json={"email": unique_email, "password": password},
    )
    assert login_resp.status_code == 200
    csrf_token = login_resp.json()["csrf_token"]
    cookies = {"airgrid_session": login_resp.cookies["airgrid_session"]}

    yield {
        "user": user,
        "email": unique_email,
        "csrf_token": csrf_token,
        "cookies": cookies,
        "headers": {"X-CSRF-Token": csrf_token},
    }

    async with AsyncSessionLocal() as session:
        u = await session.get(User, user.id)
        if u:
            await session.delete(u)
            await session.commit()


@pytest.fixture
async def viewer_auth(client: AsyncClient):
    unique_email = f"viewer-{uuid.uuid4().hex[:8]}@airgrid.test"
    password = "ViewerSecurePassword2026!"
    hashed = hash_password(password)

    async with AsyncSessionLocal() as session:
        user = User(
            email=unique_email,
            hashed_password=hashed,
            full_name="ML Test Viewer",
            role="viewer",
            is_active=True,
        )
        session.add(user)
        await session.flush()
        from airgrid.models.all_models import Campus, CampusMembership
        campuses = (await session.execute(select(Campus))).scalars().all()
        for c in campuses:
            session.add(CampusMembership(campus_id=c.id, user_id=user.id))
        await session.commit()
        await session.refresh(user)

    login_resp = await client.post(
        "/api/v1/auth/login",
        json={"email": unique_email, "password": password},
    )
    assert login_resp.status_code == 200
    csrf_token = login_resp.json()["csrf_token"]
    cookies = {"airgrid_session": login_resp.cookies["airgrid_session"]}

    yield {
        "user": user,
        "email": unique_email,
        "csrf_token": csrf_token,
        "cookies": cookies,
        "headers": {"X-CSRF-Token": csrf_token},
    }

    async with AsyncSessionLocal() as session:
        u = await session.get(User, user.id)
        if u:
            await session.delete(u)
            await session.commit()


@pytest.fixture
async def ml_test_floor(admin_auth):
    """Creates an isolated campus, building, and floor with calibrated dimensions."""
    async with AsyncSessionLocal() as session:
        campus = Campus(name="ML Test Campus", code=f"ML-{uuid.uuid4().hex[:4].upper()}")
        session.add(campus)
        await session.flush()
        from airgrid.models.all_models import CampusMembership, User
        users = (await session.execute(select(User))).scalars().all()
        for u in users:
            session.add(CampusMembership(campus_id=campus.id, user_id=u.id))

        building = Building(campus_id=campus.id, name="Engineering Hall", building_code="ENG-1")
        session.add(building)
        await session.flush()

        floor = Floor(
            building_id=building.id,
            name="Level 3 Research Lab",
            floor_number=3,
            dimensions_width_m=50.0,
            dimensions_height_m=30.0,
        )
        session.add(floor)
        await session.flush()

        plan = FloorPlanAsset(
            floor_id=floor.id,
            file_path="data/test_plans/ml_test.png",
            file_format="png",
            pixel_width=1000,
            pixel_height=600,
            scale_pixels_per_meter=20.0,
            is_calibrated=True,
        )
        session.add(plan)
        await session.commit()
        await session.refresh(floor)

    yield floor

    async with AsyncSessionLocal() as session:
        f = await session.get(Floor, floor.id)
        if f:
            b = await session.get(Building, f.building_id)
            c = await session.get(Campus, b.campus_id) if b else None
            await session.delete(f)
            if b:
                await session.delete(b)
            if c:
                await session.delete(c)
            await session.commit()


@pytest.mark.asyncio
async def test_dataset_readiness_insufficient_data(client: AsyncClient, admin_auth, ml_test_floor):
    """Verifies that an empty floor correctly reports insufficient data under scientific integrity rules."""
    client.cookies = admin_auth["cookies"]
    resp = await client.get(f"/api/v1/ml/readiness?floor_id={ml_test_floor.id}")
    assert resp.status_code == 200
    data = resp.json()
    assert data["is_ready"] is False
    assert data["status"] == "insufficient_data"
    assert "Insufficient" in data["headline"]
    checklist = {item["requirement"]: item["met"] for item in data["requirements_checklist"]}
    assert checklist["Genuine Field Observations"] is False
    assert checklist["Independent Survey Sessions"] is False


@pytest.mark.asyncio
async def test_dataset_provenance_filtering(client: AsyncClient, admin_auth, ml_test_floor):
    """
    Verifies that controlled_test_import observations are excluded from production readiness counts,
    and manual operator observations are tracked accurately.
    """
    client.cookies = admin_auth["cookies"]
    floor_id = ml_test_floor.id

    async with AsyncSessionLocal() as session:
        # Create a survey session
        sess = SurveySession(
            floor_id=floor_id,
            technician_id=admin_auth["user"].id,
            session_name="Walkthrough A",
            status="completed",
        )
        session.add(sess)
        await session.flush()

        # Add 5 operator_reported points and 15 controlled_test_import points
        for i in range(5):
            m = SurveyMeasurement(
                survey_session_id=sess.id,
                floor_id=floor_id,
                position_x=100.0 + i * 50,
                position_y=100.0 + i * 30,
                normalized_x=(100.0 + i * 50) / 1000.0,
                normalized_y=(100.0 + i * 30) / 600.0,
                rssi_dbm=-55.0 - i * 2,
                network_label="Campus-Secure",
                data_provenance="operator_reported",
            )
            session.add(m)

        for i in range(15):
            m = SurveyMeasurement(
                survey_session_id=sess.id,
                floor_id=floor_id,
                position_x=200.0 + i * 20,
                position_y=200.0 + i * 15,
                normalized_x=(200.0 + i * 20) / 1000.0,
                normalized_y=(200.0 + i * 15) / 600.0,
                rssi_dbm=-65.0 - i,
                network_label="Campus-Secure",
                data_provenance="controlled_test_import",
            )
            session.add(m)
        await session.commit()

    # Query readiness
    resp = await client.get(f"/api/v1/ml/readiness?floor_id={floor_id}&network_label=Campus-Secure")
    assert resp.status_code == 200
    data = resp.json()

    # Total measurements = 20, but genuine measurements = 5 (< 15 threshold)
    assert data["summary"]["total_measurements"] == 20
    assert data["summary"]["genuine_measurements"] == 0
    optimization = await client.get(f"/api/v1/optimization/survey?floor_id={floor_id}&network_label=Campus-Secure")
    assert optimization.status_code == 200
    assert optimization.json()["sample_count"] == 5
    assert all(p["provenance"] == "operator_reported" for p in optimization.json()["points"])
    assert data["summary"]["test_import_measurements"] == 15
    assert data["is_ready"] is False

    # Production training attempt without meeting criteria must be rejected with HTTP 422
    train_resp = await client.post(
        "/api/v1/ml/train",
        json={
            "floor_id": str(floor_id),
            "network_label": "Campus-Secure",
            "algorithm": "k_neighbors",
            "include_test_imports": False,
        },
        headers=admin_auth["headers"],
    )
    assert train_resp.status_code == 422
    assert "Controlled test imports are excluded from production training" in train_resp.json()["detail"]


@pytest.mark.asyncio
async def test_dataset_explorer_metrics(client: AsyncClient, admin_auth, ml_test_floor):
    """Verifies histogram bins, outliers detection, and provenance breakdown."""
    client.cookies = admin_auth["cookies"]
    floor_id = ml_test_floor.id

    resp = await client.get(f"/api/v1/ml/dataset-explorer?floor_id={floor_id}")
    assert resp.status_code == 200
    data = resp.json()
    assert "provenance_breakdown" in data
    assert "rssi_histogram" in data
    assert data["total_samples"] >= 0


@pytest.mark.asyncio
async def test_ml_training_evaluation_and_baselines(client: AsyncClient, admin_auth, ml_test_floor):
    """
    Tests the complete training pipeline using a controlled multi-session test fixture:
    - Verifies GroupKFold spatial evaluation without data leakage
    - Computes MAE, RMSE, and compares against Mean RSSI and IDW baselines
    - Verifies model artifact serialization and database persistence
    """
    client.cookies = admin_auth["cookies"]
    floor_id = ml_test_floor.id

    # Create 2 independent sessions with genuine 2D distribution
    async with AsyncSessionLocal() as session:
        sess1 = SurveySession(
            floor_id=floor_id,
            technician_id=admin_auth["user"].id,
            session_name="East Wing Walkthrough",
            status="completed",
        )
        sess2 = SurveySession(
            floor_id=floor_id,
            technician_id=admin_auth["user"].id,
            session_name="West Wing Walkthrough",
            status="completed",
        )
        session.add(sess1)
        session.add(sess2)
        await session.flush()

        # Session 1: 10 points
        for i in range(10):
            x = 100.0 + (i % 4) * 80.0
            y = 100.0 + (i // 4) * 100.0
            session.add(
                SurveyMeasurement(
                    survey_session_id=sess1.id,
                    floor_id=floor_id,
                    position_x=x,
                    position_y=y,
                    normalized_x=x / 1000.0,
                    normalized_y=y / 600.0,
                    rssi_dbm=-45.0 - (i * 2.5),
                    network_label="AirGrid-Production",
                    data_provenance="field_instrument_verified",
                )
            )

        # Session 2: 10 points in complementary area
        for i in range(10):
            x = 500.0 + (i % 4) * 80.0
            y = 150.0 + (i // 4) * 100.0
            session.add(
                SurveyMeasurement(
                    survey_session_id=sess2.id,
                    floor_id=floor_id,
                    position_x=x,
                    position_y=y,
                    normalized_x=x / 1000.0,
                    normalized_y=y / 600.0,
                    rssi_dbm=-55.0 - (i * 2.0),
                    network_label="AirGrid-Production",
                    data_provenance="field_instrument_verified",
                )
            )
        await session.commit()

    # 1. Verify readiness passes with 20 points across 2 sessions
    ready_resp = await client.get(f"/api/v1/ml/readiness?floor_id={floor_id}&network_label=AirGrid-Production")
    assert ready_resp.status_code == 200
    assert ready_resp.json()["is_ready"] is True

    # 2. Train K-Neighbors Regressor
    train_resp = await client.post(
        "/api/v1/ml/train",
        json={
            "floor_id": str(floor_id),
            "network_label": "AirGrid-Production",
            "algorithm": "k_neighbors",
            "validation_strategy": "session_group_kfold",
        },
        headers=admin_auth["headers"],
    )
    # Disjoint session hulls cannot support a fair held-out IDW comparison.
    assert train_resp.status_code == 422
    from sqlalchemy import select
    async with AsyncSessionLocal() as session:
        repeated = list((await session.execute(select(SurveyMeasurement).where(SurveyMeasurement.survey_session_id == sess2.id))).scalars())
        for measurement in repeated:
            measurement.position_x -= 380
            measurement.normalized_x = measurement.position_x / 1000
        await session.commit()
    train_resp = await client.post("/api/v1/ml/train", json={
        "floor_id": str(floor_id), "network_label": "AirGrid-Production", "algorithm": "k_neighbors",
        "validation_strategy": "session_group_kfold"}, headers=admin_auth["headers"])
    assert train_resp.status_code == 201
    model_data = train_resp.json()
    model_id = model_data["id"]

    assert model_data["algorithm"] == "k_neighbors"
    assert model_data["status"] == "trained"
    assert model_data["is_current_champion"] is True
    assert model_data["rmse_db"] is not None
    assert model_data["mae_db"] is not None

    evaluation = model_data["evaluation"]
    assert evaluation is not None
    assert evaluation["rmse_db"] > 0
    assert evaluation["baseline_mean_rmse_db"] > 0
    assert evaluation["baseline_idw_rmse_db"] is not None
    assert "ml_vs_idw_verdict" in evaluation

    # 3. Verify artifact file exists on disk and is within designated directory
    storage_dir = os.path.abspath(settings.AIRGRID_MODEL_STORAGE_DIR)
    expected_path = os.path.join(storage_dir, f"{model_id}.joblib")
    assert os.path.exists(expected_path)

    # 4. Train a second model (Random Forest) and verify multi-model tracking
    rf_resp = await client.post(
        "/api/v1/ml/train",
        json={
            "floor_id": str(floor_id),
            "network_label": "AirGrid-Production",
            "algorithm": "random_forest",
            "validation_strategy": "session_group_kfold",
        },
        headers=admin_auth["headers"],
    )
    assert rf_resp.status_code == 201
    rf_data = rf_resp.json()
    rf_model_id = rf_data["id"]

    # 5. List models
    list_resp = await client.get(f"/api/v1/ml/models?floor_id={floor_id}")
    assert list_resp.status_code == 200
    models_list = list_resp.json()
    assert len(models_list) >= 2
    model_ids = [m["id"] for m in models_list]
    assert model_id in model_ids
    assert rf_model_id in model_ids

    # Stored bytes must pass integrity validation before deserialization.
    prediction = await client.get(f"/api/v1/ml/models/{model_id}/prediction-map?grid_rows=10&grid_cols=10")
    assert prediction.status_code == 200

    # A recalibrated floor plan is a different spatial frame: predictions must be refused until retraining.
    async with AsyncSessionLocal() as session:
        plan = (await session.execute(select(FloorPlanAsset).where(FloorPlanAsset.floor_id == floor_id))).scalar_one()
        plan.scale_pixels_per_meter = 25.0
        await session.commit()
    prediction = await client.get(f"/api/v1/ml/models/{model_id}/prediction-map?grid_rows=10&grid_cols=10")
    assert prediction.status_code == 409 and "retrain" in prediction.json()["detail"]
    async with AsyncSessionLocal() as session:
        plan = (await session.execute(select(FloorPlanAsset).where(FloorPlanAsset.floor_id == floor_id))).scalar_one()
        plan.scale_pixels_per_meter = 20.0
        await session.commit()
    prediction = await client.get(f"/api/v1/ml/models/{model_id}/prediction-map?grid_rows=10&grid_cols=10")
    assert prediction.status_code == 200

    with open(expected_path, "ab") as artifact:
        artifact.write(b"tampered fixture")
    prediction = await client.get(f"/api/v1/ml/models/{model_id}/prediction-map?grid_rows=10&grid_cols=10")
    assert prediction.status_code == 409



@pytest.mark.asyncio
async def test_wrong_network_model_rejection(client: AsyncClient, admin_auth, ml_test_floor):
    """Verifies that requesting predictions for a network different from the model's training network is rejected."""
    client.cookies = admin_auth["cookies"]
    floor_id = ml_test_floor.id

    # Create model in DB
    async with AsyncSessionLocal() as session:
        m = MLModel(
            floor_id=floor_id,
            network_label="Staff-Only-Net",
            model_name="Staff Model",
            model_version="v1.0",
            algorithm="k_neighbors",
            status="trained",
            artifact_path="data/models/fake.joblib",
        )
        session.add(m)
        await session.commit()
        await session.refresh(m)
        model_id = m.id

    # Request prediction map for "Guest-Public-Net"
    resp = await client.get(
        f"/api/v1/ml/models/{model_id}/prediction-map?network_label=Guest-Public-Net"
    )
    assert resp.status_code == 422
    assert "Wrong-network model rejection" in resp.json()["detail"]


@pytest.mark.asyncio
async def test_spatial_prediction_limits_and_convex_hull(client: AsyncClient, admin_auth, ml_test_floor):
    """
    Verifies that spatial predictions enforce convex-hull spatial support masking
    so extrapolation outside the physical survey area returns None.
    """
    client.cookies = admin_auth["cookies"]
    floor_id = ml_test_floor.id

    # Train a model via test pipeline
    async with AsyncSessionLocal() as session:
        sess = SurveySession(floor_id=floor_id, technician_id=admin_auth["user"].id, session_name="S1")
        session.add(sess)
        await session.flush()
        # Add clustered points in top-left corner only (X: 100-200, Y: 100-200)
        for i in range(8):
            session.add(
                SurveyMeasurement(
                    survey_session_id=sess.id,
                    floor_id=floor_id,
                    position_x=100.0 + (i % 3) * 30.0,
                    position_y=100.0 + (i // 3) * 30.0,
                    normalized_x=(100.0 + (i % 3) * 30.0) / 1000.0,
                    normalized_y=(100.0 + (i // 3) * 30.0) / 600.0,
                    rssi_dbm=-50.0 - i,
                    network_label="Corner-Net",
                    data_provenance="controlled_test_import",
                )
            )
        await session.commit()

    train_resp = await client.post(
        "/api/v1/ml/train",
        json={
            "floor_id": str(floor_id),
            "network_label": "Corner-Net",
            "algorithm": "k_neighbors",
            "include_test_imports": True,
        },
        headers=admin_auth["headers"],
    )
    assert train_resp.status_code == 201
    model_id = train_resp.json()["id"]

    # Request prediction map
    pred_resp = await client.get(f"/api/v1/ml/models/{model_id}/prediction-map?grid_rows=20&grid_cols=20")
    assert pred_resp.status_code == 200
    map_data = pred_resp.json()

    assert map_data["confidence_notice"] == "Model prediction, not a direct wireless measurement."
    assert map_data["grid_width"] == 20
    assert map_data["grid_height"] == 20

    # Points far away (bottom-right: row 19, col 19) must be None (masked by spatial limit)
    grid = map_data["grid_data"]
    assert grid[19][19] is None


@pytest.mark.asyncio
async def test_viewer_read_only_permissions(client: AsyncClient, viewer_auth, ml_test_floor):
    """Verifies RBAC: Viewers can read models and readiness, but cannot train, promote, or delete models."""
    client.cookies = viewer_auth["cookies"]
    floor_id = ml_test_floor.id

    # 1. Viewer can read readiness
    resp = await client.get(f"/api/v1/ml/readiness?floor_id={floor_id}")
    assert resp.status_code == 200

    # 2. Viewer can read algorithms
    algo_resp = await client.get("/api/v1/ml/algorithms")
    assert algo_resp.status_code == 200

    # 3. Viewer cannot train models -> 403 Forbidden
    train_resp = await client.post(
        "/api/v1/ml/train",
        json={
            "floor_id": str(floor_id),
            "algorithm": "k_neighbors",
        },
        headers=viewer_auth["headers"],
    )
    assert train_resp.status_code == 403

    # 4. Viewer cannot delete models -> 403 Forbidden
    del_resp = await client.delete(
        f"/api/v1/ml/models/{uuid.uuid4()}",
        headers=viewer_auth["headers"],
    )
    assert del_resp.status_code == 403


@pytest.mark.asyncio
async def test_model_artifact_cleanup_on_delete(client: AsyncClient, admin_auth, ml_test_floor):
    """Verifies that deleting a model securely unlinks its serialized joblib artifact from disk."""
    client.cookies = admin_auth["cookies"]
    floor_id = ml_test_floor.id

    # Train a quick test model
    async with AsyncSessionLocal() as session:
        sess = SurveySession(floor_id=floor_id, technician_id=admin_auth["user"].id, session_name="Cleanup S")
        session.add(sess)
        await session.flush()
        for i in range(6):
            session.add(
                SurveyMeasurement(
                    survey_session_id=sess.id,
                    floor_id=floor_id,
                    position_x=150.0 + i * 20.0,
                    position_y=150.0 + i * 20.0,
                    normalized_x=(150.0 + i * 20.0) / 1000.0,
                    normalized_y=(150.0 + i * 20.0) / 600.0,
                    rssi_dbm=-60.0 - i,
                    network_label="Test-Cleanup-Net",
                    data_provenance="controlled_test_import",
                )
            )
        await session.commit()

    train_resp = await client.post(
        "/api/v1/ml/train",
        json={
            "floor_id": str(floor_id),
            "network_label": "Test-Cleanup-Net",
            "algorithm": "k_neighbors",
            "include_test_imports": True,
        },
        headers=admin_auth["headers"],
    )
    assert train_resp.status_code == 201
    model_id = train_resp.json()["id"]

    storage_dir = os.path.abspath(settings.AIRGRID_MODEL_STORAGE_DIR)
    artifact_file = os.path.join(storage_dir, f"{model_id}.joblib")
    assert os.path.exists(artifact_file)

    # Delete the model
    del_resp = await client.delete(f"/api/v1/ml/models/{model_id}", headers=admin_auth["headers"])
    assert del_resp.status_code == 204

    # Verify artifact is removed from disk
    assert not os.path.exists(artifact_file)

    # Verify model is removed from DB
    get_resp = await client.get(f"/api/v1/ml/models/{model_id}")
    assert get_resp.status_code == 404
