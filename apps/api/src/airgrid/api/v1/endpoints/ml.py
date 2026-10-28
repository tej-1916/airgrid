import uuid
from typing import Optional, List
from fastapi import APIRouter, Depends, Query, Path, status
from sqlalchemy.ext.asyncio import AsyncSession

from airgrid.core.database import get_db
from airgrid.api.deps import (
    require_authenticated,
    require_engineer_or_admin,
    verify_csrf,
)
from airgrid.models.all_models import User
from airgrid.schemas.ml import (
    MLDatasetReadinessResponse,
    MLDatasetExplorerResponse,
    MLAlgorithmInfo,
    MLTrainRequest,
    MLModelResponse,
    MLPredictionMapResponse,
)
from airgrid.services.ml_service import MLService
from airgrid.services import campus_service

router = APIRouter(prefix="/ml", tags=["ML Prediction Lab"])


@router.get("/readiness", response_model=MLDatasetReadinessResponse)
async def get_dataset_readiness(
    floor_id: uuid.UUID = Query(..., description="Floor identifier"),
    network_label: Optional[str] = Query(None, description="Optional network/SSID filter"),
    db: AsyncSession = Depends(get_db),
    user: User = Depends(require_authenticated),
):
    """
    Evaluates dataset readiness for spatial ML training against scientific integrity criteria.
    Enforces campus scoping.
    """
    await campus_service.get_floor_by_id(db, floor_id, current_user=user)
    return await MLService.get_dataset_readiness(db, floor_id, network_label)


@router.get("/dataset-explorer", response_model=MLDatasetExplorerResponse)
async def get_dataset_explorer(
    floor_id: uuid.UUID = Query(..., description="Floor identifier"),
    network_label: Optional[str] = Query(None, description="Optional network/SSID filter"),
    db: AsyncSession = Depends(get_db),
    user: User = Depends(require_authenticated),
):
    """Retrieves statistical distribution, RSSI histogram, and provenance breakdown (enforces campus scoping)."""
    await campus_service.get_floor_by_id(db, floor_id, current_user=user)
    return await MLService.get_dataset_explorer(db, floor_id, network_label)


@router.get("/algorithms", response_model=List[MLAlgorithmInfo])
async def get_algorithms(
    user: User = Depends(require_authenticated),
):
    """Returns available CPU-friendly scikit-learn regression algorithms."""
    return MLService.get_supported_algorithms()


@router.post(
    "/train",
    response_model=MLModelResponse,
    status_code=status.HTTP_201_CREATED,
    dependencies=[Depends(verify_csrf)],
)
async def train_model(
    payload: MLTrainRequest,
    db: AsyncSession = Depends(get_db),
    user: User = Depends(require_engineer_or_admin),
):
    """
    Trains a spatial RF path-loss regression model with leakage-safe cross-validation:
    - Enforces dataset readiness criteria for production training
    - Enforces campus scoping
    - Evaluates out-of-fold MAE and RMSE against Mean and IDW baselines
    - Serializes model artifact to secure storage
    - Records model metadata and evaluation in PostgreSQL
    """
    await campus_service.get_floor_by_id(db, payload.floor_id, current_user=user)
    return await MLService.train_model(db, user, payload)


@router.get("/models", response_model=List[MLModelResponse])
async def list_models(
    floor_id: Optional[uuid.UUID] = Query(None, description="Optional floor filter"),
    db: AsyncSession = Depends(get_db),
    user: User = Depends(require_authenticated),
):
    """Lists trained spatial models and their evaluation metrics."""
    if floor_id:
        await campus_service.get_floor_by_id(db, floor_id, current_user=user)
    return await MLService.get_models(db, floor_id)


@router.get("/models/{model_id}", response_model=MLModelResponse)
async def get_model(
    model_id: uuid.UUID = Path(..., description="Model identifier"),
    db: AsyncSession = Depends(get_db),
    user: User = Depends(require_authenticated),
):
    """Retrieves metadata and evaluation results for a single model (enforces campus scoping)."""
    model = await MLService.get_model_detail(db, model_id)
    await campus_service.get_floor_by_id(db, model.floor_id, current_user=user)
    return model


@router.post(
    "/models/{model_id}/champion",
    response_model=MLModelResponse,
    dependencies=[Depends(verify_csrf)],
)
async def promote_champion(
    model_id: uuid.UUID = Path(..., description="Model identifier to promote"),
    db: AsyncSession = Depends(get_db),
    user: User = Depends(require_engineer_or_admin),
):
    """Promotes an existing trained model to active champion status for its floor and network."""
    return await MLService.set_champion_model(db, user, model_id)


@router.delete(
    "/models/{model_id}",
    status_code=status.HTTP_204_NO_CONTENT,
    dependencies=[Depends(verify_csrf)],
)
async def delete_model(
    model_id: uuid.UUID = Path(..., description="Model identifier to delete"),
    db: AsyncSession = Depends(get_db),
    user: User = Depends(require_engineer_or_admin),
):
    """Deletes an ML model, its evaluation records, and unlinks its serialized artifact."""
    await MLService.delete_model(db, user, model_id)
    return None


@router.get("/models/{model_id}/prediction-map", response_model=MLPredictionMapResponse)
async def get_prediction_map(
    model_id: uuid.UUID = Path(..., description="Model identifier"),
    grid_rows: int = Query(30, ge=10, le=100, description="Grid row resolution"),
    grid_cols: int = Query(50, ge=10, le=100, description="Grid column resolution"),
    network_label: Optional[str] = Query(None, description="Network filter for wrong-network verification"),
    db: AsyncSession = Depends(get_db),
    user: User = Depends(require_authenticated),
):
    """
    Generates a 2D spatial prediction grid across the floor plan canvas:
    - Enforces wrong-network model rejection
    - Enforces spatial extrapolation boundaries (convex hull masking)
    - Compares ML predicted RSSI against Phase 04 IDW baseline and computes delta difference
    """
    return await MLService.get_prediction_map(
        db,
        model_id,
        grid_rows=grid_rows,
        grid_cols=grid_cols,
        network_label=network_label,
    )
