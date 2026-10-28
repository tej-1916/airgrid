import uuid
from datetime import datetime
from typing import Optional, List, Dict, Any, Literal
from pydantic import BaseModel, Field


class RequirementCheckItem(BaseModel):
    requirement: str
    met: bool
    current: Any
    target: Any
    detail: str


class MLDatasetReadinessResponse(BaseModel):
    floor_id: uuid.UUID
    network_label: Optional[str] = None
    is_ready: bool
    status: str  # "insufficient_data" | "ready_to_train" | "model_available"
    headline: str
    guidance: str
    requirements_checklist: List[RequirementCheckItem]
    summary: Dict[str, Any]
    available_networks: List[str] = Field(default_factory=list)


class MLHistogramBin(BaseModel):
    range_label: str
    min_val: float
    max_val: float
    count: int


class MLDatasetExplorerResponse(BaseModel):
    floor_id: uuid.UUID
    network_label: Optional[str] = None
    total_samples: int
    eligible_samples: int
    session_count: int
    min_rssi: Optional[float] = None
    max_rssi: Optional[float] = None
    avg_rssi: Optional[float] = None
    rssi_histogram: List[MLHistogramBin] = Field(default_factory=list)
    provenance_breakdown: Dict[str, int] = Field(default_factory=dict)
    outliers_count: int = 0
    duplicate_locations_count: int = 0
    spatial_coverage_m2: float = 0.0


class MLAlgorithmInfo(BaseModel):
    algorithm_id: str
    name: str
    description: str
    family: str
    default_hyperparameters: Dict[str, Any]
    is_supported: bool = True


class MLTrainRequest(BaseModel):
    floor_id: uuid.UUID
    network_label: Optional[str] = None
    algorithm: str = Field("k_neighbors", description="Algorithm: k_neighbors, random_forest, hist_gradient_boosting")
    validation_strategy: Literal["session_group_kfold", "spatial_block_cv"] = Field("session_group_kfold", description="Validation: session_group_kfold, spatial_block_cv")
    include_test_imports: bool = Field(False, description="Whether to include controlled test imports for test pipelines")


class MLEvaluationResponse(BaseModel):
    mae_db: float
    rmse_db: float
    baseline_mean_mae_db: float
    baseline_mean_rmse_db: float
    baseline_idw_mae_db: Optional[float] = None
    baseline_idw_rmse_db: Optional[float] = None
    evaluation_sample_count: int
    spatial_coverage_pct: float
    validation_method: str
    residuals_distribution: Dict[str, Any] = Field(default_factory=dict)
    is_statistically_sound: bool = True
    ml_vs_idw_verdict: str


class MLModelResponse(BaseModel):
    id: uuid.UUID
    floor_id: Optional[uuid.UUID]
    campus_id: Optional[uuid.UUID] = None
    building_id: Optional[uuid.UUID] = None
    network_label: Optional[str] = None
    model_name: str
    model_version: str
    algorithm: str
    status: str
    hyperparameters: Dict[str, Any] = Field(default_factory=dict)
    training_sample_count: int
    validation_sample_count: int
    validation_strategy: str
    rmse_db: Optional[float] = None
    mae_db: Optional[float] = None
    r2_score: Optional[float] = None
    created_at: datetime
    evaluation: Optional[MLEvaluationResponse] = None
    is_current_champion: bool = False


class MLPredictionMapResponse(BaseModel):
    model_id: uuid.UUID
    model_name: str
    algorithm: str
    floor_id: uuid.UUID
    network_label: Optional[str] = None
    grid_width: int
    grid_height: int
    pixel_width: int
    pixel_height: int
    scale_pixels_per_meter: float
    min_pred_rssi: Optional[float] = None
    max_pred_rssi: Optional[float] = None
    avg_pred_rssi: Optional[float] = None
    grid_data: List[List[Optional[float]]]
    idw_grid_data: List[List[Optional[float]]]
    delta_grid_data: List[List[Optional[float]]]
    convex_hull_support: bool = True
    confidence_notice: str = "Model prediction, not a direct wireless measurement."
