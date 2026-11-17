import hashlib
import io
from pathlib import Path
import json
import math
import os
import uuid
from datetime import datetime, timezone
from typing import Optional, List, Tuple, Dict, Any

from fastapi import HTTPException, status
from sqlalchemy import select, func, and_, or_, delete
from sqlalchemy.ext.asyncio import AsyncSession
from sqlalchemy.orm import selectinload

import sklearn
import joblib
import numpy as np
from sklearn.ensemble import RandomForestRegressor, HistGradientBoostingRegressor
from sklearn.neighbors import KNeighborsRegressor
from sklearn.model_selection import GroupKFold
from sklearn.metrics import mean_absolute_error, mean_squared_error, r2_score

from airgrid.services.survey_service import SurveyService
from airgrid.core.config import settings
from airgrid.core.logging import logger
from airgrid.models.all_models import (
    Floor,
    FloorPlanAsset,
    Building,
    Campus,
    User,
    AuditLog,
    SurveySession,
    SurveyMeasurement,
    MLDatasetSnapshot,
    MLModel,
    MLEvaluation,
)
from airgrid.schemas.ml import (
    RequirementCheckItem,
    MLDatasetReadinessResponse,
    MLHistogramBin,
    MLDatasetExplorerResponse,
    MLAlgorithmInfo,
    MLTrainRequest,
    MLEvaluationResponse,
    MLModelResponse,
    MLPredictionMapResponse,
)



def floor_plan_signature(floor_id, building_id, plan) -> Optional[str]:
    """Identifies the spatial frame a model was trained in; any plan/calibration change alters it."""
    if plan is None:
        return None
    frame = [str(floor_id), str(building_id), str(plan.id), plan.file_path, plan.pixel_width, plan.pixel_height,
             plan.scale_pixels_per_meter, plan.is_calibrated, plan.calibration_metadata]
    return hashlib.sha256(json.dumps(frame, sort_keys=True, default=str).encode()).hexdigest()

class MLService:
    SUPPORTED_ALGORITHMS = [
        MLAlgorithmInfo(
            algorithm_id="k_neighbors",
            name="K-Nearest Neighbors Regressor",
            description="Distance-weighted local RF interpolation based on spatial coordinate proximity.",
            family="Instance-based Learning",
            default_hyperparameters={"n_neighbors": 5, "weights": "distance", "metric": "euclidean"},
            is_supported=True,
        ),
        MLAlgorithmInfo(
            algorithm_id="random_forest",
            name="Random Forest Spatial Regressor",
            description="Ensemble of decision trees modeling spatial signal variation; obstacles are not modeled.",
            family="Ensemble / Bagging",
            default_hyperparameters={"n_estimators": 50, "max_depth": 8, "min_samples_split": 2, "random_state": 42},
            is_supported=True,
        ),
        MLAlgorithmInfo(
            algorithm_id="hist_gradient_boosting",
            name="Histogram Gradient Boosting Regressor",
            description="Fast, CPU-efficient gradient boosting tree regressor with native non-linear boundary handling.",
            family="Boosting",
            default_hyperparameters={"max_iter": 50, "max_depth": 5, "min_samples_leaf": 2, "random_state": 42},
            is_supported=True,
        ),
    ]

    @staticmethod
    def _ensure_model_storage_dir() -> str:
        """Ensures the model artifact storage directory exists and returns its absolute path."""
        storage_path = os.path.realpath(settings.AIRGRID_MODEL_STORAGE_DIR)
        os.makedirs(storage_path, mode=0o700, exist_ok=True)
        return storage_path

    @staticmethod
    def _validate_artifact_path(artifact_path: str) -> str:
        """Validates that artifact_path is strictly within the designated storage directory to prevent path traversal."""
        storage_path = MLService._ensure_model_storage_dir()
        abs_path = os.path.realpath(artifact_path)
        if os.path.commonpath([storage_path, abs_path]) != storage_path:
            raise HTTPException(
                status_code=status.HTTP_400_BAD_REQUEST,
                detail="Security violation: Model artifact path outside designated storage directory.",
            )
        return abs_path

    @staticmethod
    def get_supported_algorithms() -> List[MLAlgorithmInfo]:
        """Returns the list of supported CPU-friendly scikit-learn regression algorithms."""
        return MLService.SUPPORTED_ALGORITHMS

    @staticmethod
    async def get_dataset_readiness(
        db: AsyncSession,
        floor_id: uuid.UUID,
        network_label: Optional[str] = None,
    ) -> MLDatasetReadinessResponse:
        """
        Evaluates dataset readiness for production ML training under strict scientific integrity rules:
        - Excludes controlled_test_import observations from production counts.
        - Requires >= 15 genuine field measurements.
        - Requires >= 2 distinct survey sessions for spatial leakage-safe validation.
        - Requires a 2D spatial distribution (non-collinear, bounding area >= 20 m²).
        - Enforces network-specific isolation if multiple networks exist.
        """
        # 1. Verify floor exists
        stmt_f = select(Floor).options(selectinload(Floor.building)).where(Floor.id == floor_id)
        res_f = await db.execute(stmt_f)
        floor = res_f.scalar_one_or_none()
        if not floor:
            raise HTTPException(
                status_code=status.HTTP_404_NOT_FOUND,
                detail=f"Floor with ID '{floor_id}' not found.",
            )

        # 2. Query all measurements for this floor
        stmt = (
            select(SurveyMeasurement)
            .where(SurveyMeasurement.floor_id == floor_id)
        )
        res = await db.execute(stmt)
        all_measurements = list(res.scalars().all())

        # Collect available networks
        available_networks = sorted(list(set(
            (m.network_label or "").strip()
            for m in all_measurements
            if m.network_label and m.network_label.strip()
        )))

        # Filter by network_label if provided
        filtered = all_measurements
        if network_label and network_label.strip():
            target_net = network_label.strip()
            filtered = [
                m for m in filtered
                if (m.network_label or "").strip() == target_net
            ]

        # Filter genuine observations (exclude controlled_test_import for production readiness)
        genuine_measurements = [
            m for m in filtered
            if m.data_provenance == "field_instrument_verified" and m.network_label and m.observed_at and math.isfinite(m.rssi_dbm) and -100 <= m.rssi_dbm <= -20
        ]
        test_import_count = sum(1 for m in filtered if m.data_provenance == "controlled_test_import")

        genuine_count = len(genuine_measurements)
        unique_sessions = set(m.survey_session_id for m in genuine_measurements)
        session_count = len(unique_sessions)

        # Spatial distribution check
        is_2d_distributed = False
        spatial_area_m2 = 0.0
        if genuine_count >= 3:
            coords = [(m.position_x, m.position_y) for m in genuine_measurements]
            # Get floor scale
            stmt_plan = select(FloorPlanAsset).where(FloorPlanAsset.floor_id == floor_id)
            plan_res = await db.execute(stmt_plan)
            plan = plan_res.scalar_one_or_none()
            scale_px_per_m = plan.scale_pixels_per_meter if (plan and plan.is_calibrated) else 20.0

            xs = [c[0] for c in coords]
            ys = [c[1] for c in coords]
            dx_m = (max(xs) - min(xs)) / scale_px_per_m
            dy_m = (max(ys) - min(ys)) / scale_px_per_m
            spatial_area_m2 = round(dx_m * dy_m, 1)

            # Check non-collinearity
            collinear = MLService._is_collinear(coords)
            if not collinear and dx_m >= 4.0 and dy_m >= 4.0 and spatial_area_m2 >= 20.0:
                is_2d_distributed = True

        # Network isolation check
        network_isolation_met = bool(available_networks)
        network_detail = "Single network verified"
        if not network_label or not network_label.strip():
            if len(available_networks) > 1:
                network_isolation_met = False
                network_detail = f"Multiple networks detected ({', '.join(available_networks)}). Specific network_label required."
            elif len(available_networks) == 1:
                network_detail = f"Auto-detected single network: {available_networks[0]}"
            else:
                network_detail = "No network labels recorded in survey"
        else:
            network_detail = f"Filtered to network: {network_label}"

        plan_result = await db.execute(select(FloorPlanAsset).where(FloorPlanAsset.floor_id == floor_id))
        calibrated_plan = plan_result.scalar_one_or_none()
        calibration_valid = bool(calibrated_plan and calibrated_plan.is_calibrated and
                                 calibrated_plan.scale_pixels_per_meter and calibrated_plan.scale_pixels_per_meter > 0)

        # Build Requirements Checklist
        checklist = [
            RequirementCheckItem(requirement="Valid Calibration", met=calibration_valid,
                                 current=calibration_valid, target=True,
                                 detail="A calibrated floor plan with a positive physical scale is required."),
            RequirementCheckItem(
                requirement="Genuine Field Observations",
                met=(genuine_count >= 15),
                current=genuine_count,
                target=15,
                detail="Only instrument-verified observations qualify; operator reports, imports and estimates remain separate.",
            ),
            RequirementCheckItem(
                requirement="Independent Survey Sessions",
                met=(session_count >= 2),
                current=session_count,
                target=2,
                detail="Requires at least 2 distinct survey walkthroughs to enable leakage-safe cross-validation.",
            ),
            RequirementCheckItem(
                requirement="2D Spatial Distribution",
                met=is_2d_distributed,
                current=f"{spatial_area_m2} m² span" if genuine_count >= 3 else f"{genuine_count} points",
                target=">= 20 m² planar span (non-collinear)",
                detail="Observations must span a two-dimensional physical area rather than a single linear hallway.",
            ),
            RequirementCheckItem(
                requirement="Network Isolation",
                met=network_isolation_met,
                current=network_label or ("Unspecified" if len(available_networks) > 1 else (available_networks[0] if available_networks else "None")),
                target="Isolated per-network dataset",
                detail=network_detail,
            ),
        ]

        # Check existing models
        stmt_m = select(func.count(MLModel.id)).where(MLModel.floor_id == floor_id)
        models_res = await db.execute(stmt_m)
        model_count = models_res.scalar() or 0

        is_ready = all(item.met for item in checklist)
        if is_ready:
            status_val = "model_available" if model_count > 0 else "ready_to_train"
            headline = "Dataset Ready for Spatial ML Training"
            guidance = "Sufficient genuine observations and multi-session validation splits are available. Model training is permitted."
        else:
            status_val = "insufficient_data"
            headline = "Insufficient Field Survey Data"
            guidance = (
                "AirGrid requires at least 15 genuine field measurements across 2 distinct survey sessions with 2D spatial distribution. "
                "Controlled test imports are excluded from production training. Please conduct additional physical survey walkthroughs."
            )

        summary = {
            "total_measurements": len(filtered),
            "genuine_measurements": genuine_count,
            "test_import_measurements": test_import_count,
            "session_count": session_count,
            "spatial_span_m2": spatial_area_m2,
            "available_networks_count": len(available_networks),
            "trained_models_count": model_count,
        }

        return MLDatasetReadinessResponse(
            floor_id=floor_id,
            network_label=network_label,
            is_ready=is_ready,
            status=status_val,
            headline=headline,
            guidance=guidance,
            requirements_checklist=checklist,
            summary=summary,
            available_networks=available_networks,
        )

    @staticmethod
    async def get_dataset_explorer(
        db: AsyncSession,
        floor_id: uuid.UUID,
        network_label: Optional[str] = None,
    ) -> MLDatasetExplorerResponse:
        """Computes statistical distribution, histograms, and provenance breakdowns for the floor dataset."""
        floor = await db.get(Floor, floor_id)
        if not floor:
            raise HTTPException(
                status_code=status.HTTP_404_NOT_FOUND,
                detail=f"Floor with ID '{floor_id}' not found.",
            )

        stmt = select(SurveyMeasurement).where(SurveyMeasurement.floor_id == floor_id)
        res = await db.execute(stmt)
        measurements = list(res.scalars().all())

        if network_label and network_label.strip():
            target_net = network_label.strip()
            measurements = [
                m for m in measurements
                if (m.network_label or "").strip() == target_net
            ]

        total_samples = len(measurements)
        eligible = [m for m in measurements if m.data_provenance == "field_instrument_verified" and m.network_label and m.observed_at and math.isfinite(m.rssi_dbm) and -100 <= m.rssi_dbm <= -20]
        eligible_samples = len(eligible)

        unique_sessions = set(m.survey_session_id for m in eligible)
        session_count = len(unique_sessions)

        provenance_breakdown: Dict[str, int] = {}
        for m in measurements:
            p = m.data_provenance or "unknown"
            provenance_breakdown[p] = provenance_breakdown.get(p, 0) + 1

        # Duplicate locations count
        coord_counts: Dict[Tuple[float, float], int] = {}
        for m in eligible:
            key = (round(m.position_x, 1), round(m.position_y, 1))
            coord_counts[key] = coord_counts.get(key, 0) + 1
        duplicate_count = sum(cnt - 1 for cnt in coord_counts.values() if cnt > 1)

        # Outliers count (extreme non-physical values)
        outliers_count = sum(1 for m in eligible if m.rssi_dbm < -100 or m.rssi_dbm > -20)

        # RSSI statistics
        if eligible:
            rssi_vals = [m.rssi_dbm for m in eligible]
            min_rssi = round(min(rssi_vals), 1)
            max_rssi = round(max(rssi_vals), 1)
            avg_rssi = round(sum(rssi_vals) / len(rssi_vals), 1)

            # Histogram bins (-100 to -20 in 10 dB bins)
            bin_defs = [
                ("-100 to -90 dBm", -100.0, -90.0),
                ("-90 to -80 dBm", -90.0, -80.0),
                ("-80 to -70 dBm", -80.0, -70.0),
                ("-70 to -60 dBm", -70.0, -60.0),
                ("-60 to -50 dBm", -50.0, -40.0),
                ("-50 to -40 dBm", -40.0, -30.0),
                ("-40 to -20 dBm", -30.0, -20.0),
            ]
            hist_bins: List[MLHistogramBin] = []
            for label, bmin, bmax in bin_defs:
                cnt = sum(1 for v in rssi_vals if bmin <= v < bmax or (bmax == -20.0 and v == -20.0))
                hist_bins.append(MLHistogramBin(range_label=label, min_val=bmin, max_val=bmax, count=cnt))
        else:
            min_rssi = None
            max_rssi = None
            avg_rssi = None
            hist_bins = []

        # Spatial coverage area
        stmt_plan = select(FloorPlanAsset).where(FloorPlanAsset.floor_id == floor_id)
        plan_res = await db.execute(stmt_plan)
        plan = plan_res.scalar_one_or_none()
        scale = plan.scale_pixels_per_meter if (plan and plan.is_calibrated) else 20.0

        spatial_coverage_m2 = 0.0
        if eligible_samples >= 2:
            xs = [m.position_x for m in eligible]
            ys = [m.position_y for m in eligible]
            dx = (max(xs) - min(xs)) / scale
            dy = (max(ys) - min(ys)) / scale
            spatial_coverage_m2 = round(dx * dy, 1)

        return MLDatasetExplorerResponse(
            floor_id=floor_id,
            network_label=network_label,
            total_samples=total_samples,
            eligible_samples=eligible_samples,
            session_count=session_count,
            min_rssi=min_rssi,
            max_rssi=max_rssi,
            avg_rssi=avg_rssi,
            rssi_histogram=hist_bins,
            provenance_breakdown=provenance_breakdown,
            outliers_count=outliers_count,
            duplicate_locations_count=duplicate_count,
            spatial_coverage_m2=spatial_coverage_m2,
        )

    @staticmethod
    async def train_model(
        db: AsyncSession,
        user: User,
        payload: MLTrainRequest,
    ) -> MLModelResponse:
        """
        Executes ML model training, cross-validation evaluation, and artifact serialization:
        - Rejects production training if dataset readiness conditions are not met.
        - Isolates training by network_label.
        - Computes baseline Mean RSSI and baseline IDW alongside the ML regressor.
        - Evaluates via leakage-safe GroupKFold (or Spatial Block CV).
        - Persists MLDatasetSnapshot, MLModel, and MLEvaluation records.
        - Saves serialised model artifact with SHA-256 fingerprinting.
        """
        floor_id = payload.floor_id
        stmt_f = select(Floor).options(selectinload(Floor.building)).where(Floor.id == floor_id)
        res_f = await db.execute(stmt_f)
        floor = res_f.scalar_one_or_none()
        if not floor:
            raise HTTPException(
                status_code=status.HTTP_404_NOT_FOUND,
                detail=f"Floor with ID '{floor_id}' not found.",
            )

        # 1. Fetch measurements
        stmt = select(SurveyMeasurement).where(SurveyMeasurement.floor_id == floor_id)
        res = await db.execute(stmt)
        all_measurements = list(res.scalars().all())

        # Network label filtering
        target_network = (payload.network_label or "").strip()
        filtered = all_measurements
        if target_network:
            filtered = [
                m for m in filtered
                if (m.network_label or "").strip() == target_network
            ]
        else:
            # Check for multiple networks
            distinct_nets = sorted(list(set(
                (m.network_label or "").strip()
                for m in filtered
                if m.network_label and m.network_label.strip()
            )))
            if len(distinct_nets) > 1:
                raise HTTPException(
                    status_code=status.HTTP_422_UNPROCESSABLE_CONTENT,
                    detail=(
                        f"Floor contains measurements from multiple distinct networks ({', '.join(distinct_nets)}). "
                        "Specify 'network_label' in train request to train a network-isolated model."
                    ),
                )
            if len(distinct_nets) == 1:
                target_network = distinct_nets[0]

        if payload.include_test_imports and settings.AIRGRID_ENV != "testing":
            raise HTTPException(status_code=422, detail="Fixture training is only available in the isolated test environment.")

        # Provenance filtering
        if not payload.include_test_imports:
            eligible = [m for m in filtered if m.data_provenance == "field_instrument_verified" and m.network_label and m.observed_at and math.isfinite(m.rssi_dbm) and -100 <= m.rssi_dbm <= -20]
            # Strict scientific readiness check
            readiness = await MLService.get_dataset_readiness(db, floor_id, target_network)
            if not readiness.is_ready:
                failed_items = [item.requirement for item in readiness.requirements_checklist if not item.met]
                raise HTTPException(
                    status_code=status.HTTP_422_UNPROCESSABLE_CONTENT,
                    detail=(
                        f"Dataset does not meet minimum scientific integrity requirements for production model training. "
                        f"Unmet requirements: {', '.join(failed_items)}. "
                        "Controlled test imports are excluded from production training. "
                        "Conduct further field surveys to fulfill readiness criteria."
                    ),
                )
        else:
            # Controlled test import mode (strictly for automated test fixtures)
            eligible = filtered
            if len(eligible) < 6:
                raise HTTPException(
                    status_code=status.HTTP_422_UNPROCESSABLE_CONTENT,
                    detail=f"Insufficient observations for test pipeline execution (minimum 6 required, found {len(eligible)}).",
                )

        eligible.sort(key=lambda m: str(m.id))
        plan = (await db.execute(select(FloorPlanAsset).where(FloorPlanAsset.floor_id == floor_id))).scalar_one_or_none()
        scale = plan.scale_pixels_per_meter if plan and plan.is_calibrated else 20.0
        physical = [(m.position_x, m.position_y, m.rssi_dbm) for m in eligible]

        # Extract features and targets
        # Feature vector: normalized coordinates [norm_x, norm_y]
        X = np.array([[m.normalized_x, m.normalized_y] for m in eligible], dtype=np.float32)
        y = np.array([m.rssi_dbm for m in eligible], dtype=np.float32)

        # Grouping for leakage-safe CV
        session_ids = [str(m.survey_session_id) for m in eligible]
        unique_sessions = list(dict.fromkeys(session_ids))

        # Select validation strategy
        validation_strategy = payload.validation_strategy
        if validation_strategy == "session_group_kfold" and len(unique_sessions) >= 2:
            n_splits = min(len(unique_sessions), 5)
            session_to_group = {s: idx for idx, s in enumerate(unique_sessions)}
            groups = np.array([session_to_group[s] for s in session_ids])
            cv = GroupKFold(n_splits=n_splits)
            splits = list(cv.split(X, y, groups))
            val_method_str = f"session_group_kfold ({n_splits}-fold)"
        else:
            # Hold out complete spatial cells; duplicate coordinates never cross folds.
            groups = np.floor(X[:, 0] * 4).astype(int) * 5 + np.floor(X[:, 1] * 4).astype(int)
            n_splits = min(len(np.unique(groups)), 3)
            if n_splits < 2:
                raise HTTPException(status_code=422, detail="Insufficient independent spatial blocks for evaluation.")
            splits = list(GroupKFold(n_splits=n_splits).split(X, y, groups))
            val_method_str = f"spatial_block_cv ({n_splits}-fold)"

        # Instantiate algorithm
        algo_id = payload.algorithm.lower().strip()
        hyperparams: Dict[str, Any] = {}
        if algo_id == "k_neighbors":
            target_k = 5
            hyperparams = {"n_neighbors": target_k, "weights": "distance", "metric": "euclidean"}
            model_factory = lambda n_samples=None: KNeighborsRegressor(
                n_neighbors=min(target_k, max(1, n_samples - 1 if n_samples else target_k)),
                weights="distance",
                metric="euclidean",
            )
            algo_name = "K-Nearest Neighbors"
        elif algo_id == "random_forest":
            hyperparams = {"n_estimators": 50, "max_depth": 8, "min_samples_split": 2, "random_state": 42}
            model_factory = lambda n_samples=None: RandomForestRegressor(**hyperparams)
            algo_name = "Random Forest Regressor"
        elif algo_id == "hist_gradient_boosting":
            hyperparams = {"max_iter": 50, "max_depth": 5, "min_samples_leaf": 2, "random_state": 42}
            model_factory = lambda n_samples=None: HistGradientBoostingRegressor(
                max_iter=50,
                max_depth=5,
                min_samples_leaf=min(2, max(1, (n_samples or 10) // 3)),
                random_state=42,
            )
            algo_name = "Hist Gradient Boosting"
        else:
            raise HTTPException(
                status_code=status.HTTP_400_BAD_REQUEST,
                detail=f"Unsupported algorithm '{payload.algorithm}'. Supported algorithms: k_neighbors, random_forest, hist_gradient_boosting.",
            )

        # Cross-validation loop to calculate out-of-fold metrics
        ml_oof_preds = np.zeros(len(y), dtype=np.float32)
        mean_oof_preds = np.zeros(len(y), dtype=np.float32)
        idw_oof_preds = np.full(len(y), np.nan, dtype=np.float32)

        for train_idx, val_idx in splits:
            X_train, y_train = X[train_idx], y[train_idx]
            X_val, y_val = X[val_idx], y[val_idx]

            # 1. Fit ML model
            fold_model = model_factory(len(X_train))
            fold_model.fit(X_train, y_train)
            ml_oof_preds[val_idx] = fold_model.predict(X_val)

            # 2. Baseline Mean RSSI predictor
            mean_train = float(np.mean(y_train))
            mean_oof_preds[val_idx] = mean_train

            # Exactly the Phase 04 support mask, physical distances and smoothing.
            train_samples = [physical[index] for index in train_idx]
            hull = SurveyService._compute_convex_hull([(p[0], p[1]) for p in train_samples])
            for index in val_idx:
                px, py, _ = physical[index]
                prediction = SurveyService._predict_idw(px, py, train_samples, scale, hull)
                if prediction is not None:
                    idw_oof_preds[index] = prediction

        supported = np.isfinite(idw_oof_preds)
        evaluated_count = int(supported.sum())
        if evaluated_count < 2:
            raise HTTPException(status_code=422, detail="Insufficient held-out observations within interpolation support for a fair baseline comparison.")
        evaluated_y = y[supported]
        evaluated_ml = ml_oof_preds[supported]
        evaluated_mean = mean_oof_preds[supported]
        evaluated_idw = idw_oof_preds[supported]
        coverage_pct = round(100 * evaluated_count / len(y), 1)

        # Compute evaluated metrics across out-of-fold predictions
        mae_db = float(mean_absolute_error(evaluated_y, evaluated_ml))
        rmse_db = float(np.sqrt(mean_squared_error(evaluated_y, evaluated_ml)))
        r2 = float(r2_score(evaluated_y, evaluated_ml))

        baseline_mean_mae = float(mean_absolute_error(evaluated_y, evaluated_mean))
        baseline_mean_rmse = float(np.sqrt(mean_squared_error(evaluated_y, evaluated_mean)))

        baseline_idw_mae = float(mean_absolute_error(evaluated_y, evaluated_idw))
        baseline_idw_rmse = float(np.sqrt(mean_squared_error(evaluated_y, evaluated_idw)))

        # Residuals distribution
        residuals = evaluated_y - evaluated_ml
        residuals_dist = {
            "mean": round(float(np.mean(residuals)), 3),
            "std": round(float(np.std(residuals)), 3),
            "min": round(float(np.min(residuals)), 2),
            "max": round(float(np.max(residuals)), 2),
            "p25": round(float(np.percentile(residuals, 25)), 2),
            "p50": round(float(np.percentile(residuals, 50)), 2),
            "p75": round(float(np.percentile(residuals, 75)), 2),
        }

        # Compare ML vs IDW verdict
        rmse_delta = round(baseline_idw_rmse - rmse_db, 2)
        if rmse_delta > 0:
            ml_vs_idw_verdict = f"ML model outperformed IDW baseline by {rmse_delta} dBm RMSE ({round(rmse_db, 2)} dBm vs {round(baseline_idw_rmse, 2)} dBm)."
        elif rmse_delta < 0:
            ml_vs_idw_verdict = f"IDW baseline provided lower RMSE by {abs(rmse_delta)} dBm ({round(baseline_idw_rmse, 2)} dBm vs {round(rmse_db, 2)} dBm)."
        else:
            ml_vs_idw_verdict = f"ML model and IDW baseline achieved equivalent RMSE ({round(rmse_db, 2)} dBm)."

        # Fit final model on all eligible data
        final_model = model_factory(len(X))
        final_model.fit(X, y)

        # Generate dataset fingerprint
        fingerprint_data = json.dumps(
            sorted([[str(m.id), str(m.survey_session_id), str(m.observed_at), m.data_provenance, str(floor_id), target_network, float(m.normalized_x), float(m.normalized_y), float(m.rssi_dbm)] for m in eligible]),
            sort_keys=True,
        ).encode("utf-8")
        dataset_fingerprint = hashlib.sha256(fingerprint_data).hexdigest()

        # Provenance summary for snapshot
        provenance_summary: Dict[str, int] = {}
        for m in eligible:
            p = m.data_provenance or "unknown"
            provenance_summary[p] = provenance_summary.get(p, 0) + 1

        # Create MLDatasetSnapshot record
        snapshot = MLDatasetSnapshot(
            floor_id=floor_id,
            campus_id=floor.building.campus_id if floor.building else None,
            building_id=floor.building_id,
            network_label=target_network or None,
            snapshot_name=f"Dataset Snapshot {datetime.now(timezone.utc).strftime('%Y-%m-%d %H:%M')}",
            dataset_fingerprint=dataset_fingerprint,
            sample_count=len(eligible),
            session_count=len(unique_sessions),
            provenance_summary=provenance_summary,
            feature_schema_version="v1.0",
        )
        db.add(snapshot)
        await db.flush()

        # Model ID & Artifact Path
        model_id = uuid.uuid4()
        storage_dir = MLService._ensure_model_storage_dir()
        artifact_filename = f"{model_id}.joblib"
        artifact_path = os.path.join(storage_dir, artifact_filename)
        MLService._validate_artifact_path(artifact_path)

        # Save artifact with model and training metadata
        artifact_payload = {
            "model_id": str(model_id),
            "algorithm": algo_id,
            "hyperparameters": hyperparams,
            "network_label": target_network or None,
            "floor_id": str(floor_id),
            "training_samples_count": len(eligible),
            "training_data": [
                (float(m.normalized_x), float(m.normalized_y), float(m.position_x), float(m.position_y), float(m.rssi_dbm))
                for m in eligible
            ],
            "model": final_model,
        }
        joblib.dump(artifact_payload, artifact_path)
        os.chmod(artifact_path, 0o600)
        hyperparams["artifact_sha256"] = hashlib.sha256(Path(artifact_path).read_bytes()).hexdigest()
        hyperparams["sklearn_version"] = sklearn.__version__
        hyperparams["floor_plan_signature"] = floor_plan_signature(floor_id, floor.building_id, plan)

        # Determine champion status
        # If no other champion exists on this floor and network, make this the champion.
        # Or if this model has a lower RMSE than the existing champion.
        stmt_champ = (
            select(MLModel)
            .where(
                and_(
                    MLModel.floor_id == floor_id,
                    MLModel.is_current_champion.is_(True),
                    MLModel.network_label == (target_network or None),
                )
            )
        )
        res_champ = await db.execute(stmt_champ)
        existing_champion = res_champ.scalar_one_or_none()

        is_champion = False
        if not existing_champion:
            is_champion = True
        elif existing_champion.rmse_db is not None and rmse_db < existing_champion.rmse_db:
            existing_champion.is_current_champion = False
            is_champion = True

        # Model versioning count
        stmt_count = select(func.count(MLModel.id)).where(MLModel.floor_id == floor_id)
        res_count = await db.execute(stmt_count)
        version_num = (res_count.scalar() or 0) + 1

        ml_model = MLModel(
            id=model_id,
            floor_id=floor_id,
            campus_id=floor.building.campus_id if floor.building else None,
            building_id=floor.building_id,
            dataset_snapshot_id=snapshot.id,
            network_label=target_network or None,
            model_name=f"{algo_name} (Floor {floor.name or floor.id})",
            model_version=f"v{version_num}.0",
            algorithm=algo_id,
            status="trained",
            hyperparameters=hyperparams,
            training_sample_count=len(eligible),
            validation_sample_count=evaluated_count,
            validation_strategy=validation_strategy,
            created_by_id=user.id,
            artifact_path=artifact_path,
            rmse_db=round(rmse_db, 2),
            mae_db=round(mae_db, 2),
            r2_score=round(r2, 4),
            is_current_champion=is_champion,
        )
        db.add(ml_model)
        await db.flush()

        # Create MLEvaluation record
        evaluation = MLEvaluation(
            model_id=ml_model.id,
            mae_db=round(mae_db, 2),
            rmse_db=round(rmse_db, 2),
            baseline_mean_mae_db=round(baseline_mean_mae, 2),
            baseline_mean_rmse_db=round(baseline_mean_rmse, 2),
            baseline_idw_mae_db=round(baseline_idw_mae, 2),
            baseline_idw_rmse_db=round(baseline_idw_rmse, 2),
            evaluation_sample_count=evaluated_count,
            spatial_coverage_pct=coverage_pct,
            validation_method=val_method_str,
            residuals_distribution=residuals_dist,
            is_statistically_sound=(not payload.include_test_imports and evaluated_count >= 30 and len(unique_sessions) >= 3),
        )
        db.add(evaluation)

        # Audit log
        audit = AuditLog(
            actor_id=user.id,
            action="ml_model.trained",
            resource_type="ml_model",
            resource_id=str(ml_model.id),
            payload={
                "floor_id": str(floor_id),
                "algorithm": algo_id,
                "network_label": target_network,
                "samples": len(eligible),
                "rmse_db": round(rmse_db, 2),
                "mae_db": round(mae_db, 2),
                "is_champion": is_champion,
            },
        )
        db.add(audit)
        await db.commit()

        eval_resp = MLEvaluationResponse(
            mae_db=round(mae_db, 2),
            rmse_db=round(rmse_db, 2),
            baseline_mean_mae_db=round(baseline_mean_mae, 2),
            baseline_mean_rmse_db=round(baseline_mean_rmse, 2),
            baseline_idw_mae_db=round(baseline_idw_mae, 2),
            baseline_idw_rmse_db=round(baseline_idw_rmse, 2),
            evaluation_sample_count=evaluated_count,
            spatial_coverage_pct=coverage_pct,
            validation_method=val_method_str,
            residuals_distribution=residuals_dist,
            is_statistically_sound=(not payload.include_test_imports and evaluated_count >= 30 and len(unique_sessions) >= 3),
            ml_vs_idw_verdict=ml_vs_idw_verdict,
        )

        return MLModelResponse(
            id=ml_model.id,
            floor_id=ml_model.floor_id,
            campus_id=ml_model.campus_id,
            building_id=ml_model.building_id,
            network_label=ml_model.network_label,
            model_name=ml_model.model_name,
            model_version=ml_model.model_version,
            algorithm=ml_model.algorithm,
            status=ml_model.status,
            hyperparameters=ml_model.hyperparameters,
            training_sample_count=ml_model.training_sample_count,
            validation_sample_count=ml_model.validation_sample_count,
            validation_strategy=ml_model.validation_strategy,
            rmse_db=ml_model.rmse_db,
            mae_db=ml_model.mae_db,
            r2_score=ml_model.r2_score,
            created_at=ml_model.created_at,
            evaluation=eval_resp,
            is_current_champion=ml_model.is_current_champion,
        )

    @staticmethod
    async def authorize_model_access(db: AsyncSession, user: User, model_id: uuid.UUID) -> MLModel:
        """Loads a model and requires access to its floor's campus (administrators always pass)."""
        from airgrid.services.campus_service import require_floor_access
        m = await db.get(MLModel, model_id)
        if not m:
            raise HTTPException(status_code=status.HTTP_404_NOT_FOUND, detail=f"ML Model with ID '{model_id}' not found.")
        await require_floor_access(db, user, m.floor_id)
        return m

    @staticmethod
    async def get_models(
        db: AsyncSession,
        floor_id: Optional[uuid.UUID] = None,
        user: Optional[User] = None,
    ) -> List[MLModelResponse]:
        """Retrieves list of trained ML models and their evaluation metrics."""
        stmt = (
            select(MLModel)
            .options(selectinload(MLModel.evaluation))
            .order_by(MLModel.created_at.desc())
        )
        if floor_id:
            stmt = stmt.where(MLModel.floor_id == floor_id)
        if user and user.role != "administrator":  # never list models outside the user's campuses
            from airgrid.models.all_models import Building, Floor
            from airgrid.services.campus_service import get_authorized_campus_ids
            allowed = select(Floor.id).join(Building, Floor.building_id == Building.id).where(
                Building.campus_id.in_(await get_authorized_campus_ids(db, user)))
            stmt = stmt.where(MLModel.floor_id.in_(allowed))

        res = await db.execute(stmt)
        models = res.scalars().all()

        responses: List[MLModelResponse] = []
        for m in models:
            eval_resp = None
            if m.evaluation:
                ev = m.evaluation
                # Compute verdict on the fly if needed
                rmse_delta = round((ev.baseline_idw_rmse_db or 0.0) - ev.rmse_db, 2)
                if rmse_delta > 0:
                    verdict = f"ML model outperformed IDW baseline by {rmse_delta} dBm RMSE."
                elif rmse_delta < 0:
                    verdict = f"IDW baseline provided lower RMSE by {abs(rmse_delta)} dBm."
                else:
                    verdict = "ML model and IDW baseline achieved equivalent RMSE."

                eval_resp = MLEvaluationResponse(
                    mae_db=ev.mae_db,
                    rmse_db=ev.rmse_db,
                    baseline_mean_mae_db=ev.baseline_mean_mae_db,
                    baseline_mean_rmse_db=ev.baseline_mean_rmse_db,
                    baseline_idw_mae_db=ev.baseline_idw_mae_db,
                    baseline_idw_rmse_db=ev.baseline_idw_rmse_db,
                    evaluation_sample_count=ev.evaluation_sample_count,
                    spatial_coverage_pct=ev.spatial_coverage_pct,
                    validation_method=ev.validation_method,
                    residuals_distribution=ev.residuals_distribution,
                    is_statistically_sound=ev.is_statistically_sound,
                    ml_vs_idw_verdict=verdict,
                )

            responses.append(
                MLModelResponse(
                    id=m.id,
                    floor_id=m.floor_id,
                    campus_id=m.campus_id,
                    building_id=m.building_id,
                    network_label=m.network_label,
                    model_name=m.model_name,
                    model_version=m.model_version,
                    algorithm=m.algorithm,
                    status=m.status,
                    hyperparameters=m.hyperparameters,
                    training_sample_count=m.training_sample_count,
                    validation_sample_count=m.validation_sample_count,
                    validation_strategy=m.validation_strategy,
                    rmse_db=m.rmse_db,
                    mae_db=m.mae_db,
                    r2_score=m.r2_score,
                    created_at=m.created_at,
                    evaluation=eval_resp,
                    is_current_champion=m.is_current_champion,
                )
            )
        return responses

    @staticmethod
    async def get_model_detail(db: AsyncSession, model_id: uuid.UUID) -> MLModelResponse:
        """Retrieves detail and evaluation records for a single model."""
        stmt = select(MLModel).options(selectinload(MLModel.evaluation)).where(MLModel.id == model_id)
        res = await db.execute(stmt)
        m = res.scalar_one_or_none()
        if not m:
            raise HTTPException(
                status_code=status.HTTP_404_NOT_FOUND,
                detail=f"ML Model with ID '{model_id}' not found.",
            )

        eval_resp = None
        if m.evaluation:
            ev = m.evaluation
            rmse_delta = round((ev.baseline_idw_rmse_db or 0.0) - ev.rmse_db, 2)
            if rmse_delta > 0:
                verdict = f"ML model outperformed IDW baseline by {rmse_delta} dBm RMSE."
            elif rmse_delta < 0:
                verdict = f"IDW baseline provided lower RMSE by {abs(rmse_delta)} dBm."
            else:
                verdict = "ML model and IDW baseline achieved equivalent RMSE."

            eval_resp = MLEvaluationResponse(
                mae_db=ev.mae_db,
                rmse_db=ev.rmse_db,
                baseline_mean_mae_db=ev.baseline_mean_mae_db,
                baseline_mean_rmse_db=ev.baseline_mean_rmse_db,
                baseline_idw_mae_db=ev.baseline_idw_mae_db,
                baseline_idw_rmse_db=ev.baseline_idw_rmse_db,
                evaluation_sample_count=ev.evaluation_sample_count,
                spatial_coverage_pct=ev.spatial_coverage_pct,
                validation_method=ev.validation_method,
                residuals_distribution=ev.residuals_distribution,
                is_statistically_sound=ev.is_statistically_sound,
                ml_vs_idw_verdict=verdict,
            )

        return MLModelResponse(
            id=m.id,
            floor_id=m.floor_id,
            campus_id=m.campus_id,
            building_id=m.building_id,
            network_label=m.network_label,
            model_name=m.model_name,
            model_version=m.model_version,
            algorithm=m.algorithm,
            status=m.status,
            hyperparameters=m.hyperparameters,
            training_sample_count=m.training_sample_count,
            validation_sample_count=m.validation_sample_count,
            validation_strategy=m.validation_strategy,
            rmse_db=m.rmse_db,
            mae_db=m.mae_db,
            r2_score=m.r2_score,
            created_at=m.created_at,
            evaluation=eval_resp,
            is_current_champion=m.is_current_champion,
        )

    @staticmethod
    async def set_champion_model(
        db: AsyncSession,
        user: User,
        model_id: uuid.UUID,
    ) -> MLModelResponse:
        """Promotes a trained model to champion status on its floor and network."""
        m = await MLService.authorize_model_access(db, user, model_id)

        # Demote existing champions on same floor & network
        stmt_demote = (
            select(MLModel)
            .where(
                and_(
                    MLModel.floor_id == m.floor_id,
                    MLModel.network_label == m.network_label,
                    MLModel.is_current_champion.is_(True),
                )
            )
        )
        res_demote = await db.execute(stmt_demote)
        for existing in res_demote.scalars().all():
            existing.is_current_champion = False

        m.is_current_champion = True

        audit = AuditLog(
            actor_id=user.id,
            action="ml_model.champion_promoted",
            resource_type="ml_model",
            resource_id=str(m.id),
            payload={"floor_id": str(m.floor_id), "network_label": m.network_label, "model_id": str(m.id)},
        )
        db.add(audit)
        await db.commit()
        await db.refresh(m)

        return await MLService.get_model_detail(db, model_id)

    @staticmethod
    async def delete_model(
        db: AsyncSession,
        user: User,
        model_id: uuid.UUID,
    ) -> None:
        """Deletes an ML model, its evaluations, and removes its joblib artifact securely."""
        m = await MLService.authorize_model_access(db, user, model_id)

        # Remove artifact file securely
        if m.artifact_path:
            try:
                valid_path = MLService._validate_artifact_path(m.artifact_path)
                if os.path.exists(valid_path):
                    os.remove(valid_path)
            except Exception as e:
                logger.warning(f"Could not remove artifact file {m.artifact_path}: {e}")

        audit = AuditLog(
            actor_id=user.id,
            action="ml_model.deleted",
            resource_type="ml_model",
            resource_id=str(m.id),
            payload={"model_id": str(m.id), "name": m.model_name},
        )
        db.add(audit)
        await db.delete(m)
        await db.commit()

    @staticmethod
    async def get_prediction_map(
        db: AsyncSession,
        model_id: uuid.UUID,
        grid_rows: int = 30,
        grid_cols: int = 50,
        network_label: Optional[str] = None,
        hull_buffer_meters: float = 5.0,
    ) -> MLPredictionMapResponse:
        """
        Generates 2D ML signal prediction overlay, IDW comparison grid, and delta difference:
        - Rejects requests where network_label mismatches model.network_label.
        - Enforces spatial extrapolation boundaries via convex hull masking.
        - Returns clearly disclaimed confidence notices.
        """
        m = await db.get(MLModel, model_id)
        if not m:
            raise HTTPException(
                status_code=status.HTTP_404_NOT_FOUND,
                detail=f"ML Model with ID '{model_id}' not found.",
            )

        # Wrong-network model rejection safeguard
        if network_label and network_label.strip() and m.network_label:
            if network_label.strip() != m.network_label.strip():
                raise HTTPException(
                    status_code=status.HTTP_422_UNPROCESSABLE_CONTENT,
                    detail=(
                        f"Wrong-network model rejection: Model '{m.model_name}' was trained for network "
                        f"'{m.network_label}', but prediction was requested for '{network_label}'. "
                        "Cross-network model inference is prohibited."
                    ),
                )

        # Validate and load artifact securely
        valid_artifact_path = MLService._validate_artifact_path(m.artifact_path)
        if not os.path.exists(valid_artifact_path):
            raise HTTPException(
                status_code=status.HTTP_500_INTERNAL_SERVER_ERROR,
                detail="Model artifact file is missing from local storage.",
            )

        expected_hash = m.hyperparameters.get("artifact_sha256")
        try:
            artifact_bytes = Path(valid_artifact_path).read_bytes()
        except OSError:
            raise HTTPException(status_code=503, detail="Model artifact storage is unavailable.")
        actual_hash = hashlib.sha256(artifact_bytes).hexdigest()
        if not expected_hash or expected_hash != actual_hash or m.hyperparameters.get("sklearn_version") != sklearn.__version__:
            raise HTTPException(status_code=409, detail="Model integrity or library compatibility check failed; retrain this model.")
        try:
            artifact = joblib.load(io.BytesIO(artifact_bytes))
            model_obj = artifact["model"]
            training_data = artifact.get("training_data", [])
        except Exception as e:
            logger.error(f"Failed to deserialize model artifact {valid_artifact_path}: {e}")
            raise HTTPException(
                status_code=status.HTTP_500_INTERNAL_SERVER_ERROR,
                detail=f"Failed to load model artifact: {str(e)}",
            )

        # Get floor plan dimensions and scale
        stmt_plan = select(FloorPlanAsset).where(FloorPlanAsset.floor_id == m.floor_id)
        res_plan = await db.execute(stmt_plan)
        plan = res_plan.scalar_one_or_none()

        expected_signature = m.hyperparameters.get("floor_plan_signature")
        if not expected_signature or expected_signature != floor_plan_signature(m.floor_id, (await db.get(Floor, m.floor_id)).building_id, plan):
            raise HTTPException(
                status_code=409,
                detail="Floor plan, calibration or floor placement changed since this model was trained (or the model predates "
                       "plan versioning); retrain before predicting on this floor.",
            )

        if plan and plan.pixel_width > 0 and plan.pixel_height > 0:
            width_px = plan.pixel_width
            height_px = plan.pixel_height
            scale_px_per_m = plan.scale_pixels_per_meter if plan.is_calibrated else 20.0
        else:
            width_px = 1000
            height_px = 600
            scale_px_per_m = 20.0

        # Convex hull of training points in pixel coordinates
        # training_data item: (norm_x, norm_y, pos_x, pos_y, rssi)
        pixel_coords = [(item[2], item[3]) for item in training_data]
        if not pixel_coords:
            # Fallback to normalized coordinates scaled up
            pixel_coords = [(item[0] * width_px, item[1] * height_px) for item in training_data]

        convex_hull = MLService._compute_convex_hull(pixel_coords)
        hull_buffer_px = hull_buffer_meters * scale_px_per_m
        mask_radius_m = 18.0

        grid_data: List[List[Optional[float]]] = []
        idw_grid_data: List[List[Optional[float]]] = []
        delta_grid_data: List[List[Optional[float]]] = []

        all_ml_preds: List[float] = []

        dx_step = width_px / max(grid_cols - 1, 1)
        dy_step = height_px / max(grid_rows - 1, 1)

        # Prepare IDW samples
        idw_samples = [(item[2], item[3], item[4]) for item in training_data]

        for r in range(grid_rows):
            row_ml: List[Optional[float]] = []
            row_idw: List[Optional[float]] = []
            row_delta: List[Optional[float]] = []

            y_px = r * dy_step
            norm_y = y_px / height_px

            for c in range(grid_cols):
                x_px = c * dx_step
                norm_x = x_px / width_px

                # Spatial boundary enforcement: check distance to convex hull
                dist_to_hull = MLService._dist_to_convex_hull(x_px, y_px, convex_hull)
                if dist_to_hull > hull_buffer_px:
                    row_ml.append(None)
                    row_idw.append(None)
                    row_delta.append(None)
                    continue

                idw_prediction = SurveyService._predict_idw(x_px, y_px, idw_samples, scale_px_per_m,
                                                           convex_hull, hull_buffer_meters=hull_buffer_meters)
                if idw_prediction is None:
                    row_ml.append(None)
                    row_idw.append(None)
                    row_delta.append(None)
                    continue

                # 1. ML Prediction
                feat = np.array([[norm_x, norm_y]], dtype=np.float32)
                pred_raw = float(model_obj.predict(feat)[0])
                pred_clamped = round(max(-100.0, min(-20.0, pred_raw)), 1)
                row_ml.append(pred_clamped)
                all_ml_preds.append(pred_clamped)

                idw_val = round(idw_prediction, 1)
                row_idw.append(idw_val)
                row_delta.append(round(pred_clamped - idw_val, 1))

            grid_data.append(row_ml)
            idw_grid_data.append(row_idw)
            delta_grid_data.append(row_delta)

        min_pred = min(all_ml_preds) if all_ml_preds else None
        max_pred = max(all_ml_preds) if all_ml_preds else None
        avg_pred = round(sum(all_ml_preds) / len(all_ml_preds), 1) if all_ml_preds else None

        return MLPredictionMapResponse(
            model_id=m.id,
            model_name=m.model_name,
            algorithm=m.algorithm,
            floor_id=m.floor_id,
            network_label=m.network_label,
            grid_width=grid_cols,
            grid_height=grid_rows,
            pixel_width=width_px,
            pixel_height=height_px,
            scale_pixels_per_meter=scale_px_per_m,
            min_pred_rssi=min_pred,
            max_pred_rssi=max_pred,
            avg_pred_rssi=avg_pred,
            grid_data=grid_data,
            idw_grid_data=idw_grid_data,
            delta_grid_data=delta_grid_data,
            convex_hull_support=True,
            confidence_notice="Model prediction, not a direct wireless measurement.",
        )

    # -------------------------------------------------------------------------
    # Spatial Geometry Utilities
    # -------------------------------------------------------------------------

    @staticmethod
    def _is_collinear(points: List[Tuple[float, float]], eps: float = 1e-4) -> bool:
        """Determines if all points lie approximately on a single straight line."""
        points = sorted(set(points))
        if len(points) < 3:
            return True
        x0, y0 = points[0]
        x1, y1 = points[1]
        dx1 = x1 - x0
        dy1 = y1 - y0
        for i in range(2, len(points)):
            x2, y2 = points[i]
            cross = dx1 * (y2 - y0) - dy1 * (x2 - x0)
            if abs(cross) > eps:
                return False
        return True

    @staticmethod
    def _compute_convex_hull(points: List[Tuple[float, float]]) -> List[Tuple[float, float]]:
        """Computes the 2D Convex Hull of a set of points using Monotone Chain algorithm."""
        pts = sorted(set(points))
        if len(pts) <= 1:
            return pts

        def cross(o, a, b):
            return (a[0] - o[0]) * (b[1] - o[1]) - (a[1] - o[1]) * (b[0] - o[0])

        lower = []
        for p in pts:
            while len(lower) >= 2 and cross(lower[-2], lower[-1], p) <= 0:
                lower.pop()
            lower.append(p)

        upper = []
        for p in reversed(pts):
            while len(upper) >= 2 and cross(upper[-2], upper[-1], p) <= 0:
                upper.pop()
            upper.append(p)

        return lower[:-1] + upper[:-1]

    @staticmethod
    def _dist_to_convex_hull(x: float, y: float, hull: List[Tuple[float, float]]) -> float:
        """
        Calculates minimum Euclidean distance from (x, y) to the convex hull polygon.
        If the point is inside the polygon, returns 0.0.
        """
        if len(hull) == 0:
            return float("inf")
        if len(hull) == 1:
            return math.hypot(x - hull[0][0], y - hull[0][1])

        # Point in polygon test (Ray casting)
        inside = False
        n = len(hull)
        for i in range(n):
            j = (i + 1) % n
            xi, yi = hull[i]
            xj, yj = hull[j]
            if ((yi > y) != (yj > y)) and (x < (xj - xi) * (y - yi) / (yj - yi + 1e-12) + xi):
                inside = not inside
        if inside:
            return 0.0

        # Distance to boundary segments
        min_dist = float("inf")
        for i in range(n):
            j = (i + 1) % n
            x1, y1 = hull[i]
            x2, y2 = hull[j]
            dx = x2 - x1
            dy = y2 - y1
            l2 = dx * dx + dy * dy
            if l2 == 0:
                d = math.hypot(x - x1, y - y1)
            else:
                t = max(0.0, min(1.0, ((x - x1) * dx + (y - y1) * dy) / l2))
                proj_x = x1 + t * dx
                proj_y = y1 + t * dy
                d = math.hypot(x - proj_x, y - proj_y)
            if d < min_dist:
                min_dist = d
        return min_dist
