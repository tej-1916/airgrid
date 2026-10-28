/**
 * AirGrid ML Prediction Lab Type Definitions
 */

export interface RequirementCheckItem {
  requirement: string;
  met: boolean;
  current: string | number | boolean;
  target: string | number | boolean;
  detail: string;
}

export interface MLDatasetReadiness {
  floor_id: string;
  network_label?: string | null;
  is_ready: boolean;
  status: 'insufficient_data' | 'ready_to_train' | 'model_available';
  headline: string;
  guidance: string;
  requirements_checklist: RequirementCheckItem[];
  summary: {
    total_measurements: number;
    genuine_measurements: number;
    test_import_measurements: number;
    session_count: number;
    spatial_span_m2: number;
    available_networks_count: number;
    trained_models_count: number;
  };
  available_networks: string[];
}

export interface MLHistogramBin {
  range_label: string;
  min_val: number;
  max_val: number;
  count: number;
}

export interface MLDatasetExplorer {
  floor_id: string;
  network_label?: string | null;
  total_samples: number;
  eligible_samples: number;
  session_count: number;
  min_rssi?: number | null;
  max_rssi?: number | null;
  avg_rssi?: number | null;
  rssi_histogram: MLHistogramBin[];
  provenance_breakdown: Record<string, number>;
  outliers_count: number;
  duplicate_locations_count: number;
  spatial_coverage_m2: number;
}

export interface MLAlgorithmInfo {
  algorithm_id: string;
  name: string;
  description: string;
  family: string;
  default_hyperparameters: Record<string, any>;
  is_supported: boolean;
}

export interface MLTrainRequest {
  floor_id: string;
  network_label?: string | null;
  algorithm: string;
  validation_strategy?: string;
  include_test_imports?: boolean;
}

export interface MLEvaluation {
  mae_db: number;
  rmse_db: number;
  baseline_mean_mae_db: number;
  baseline_mean_rmse_db: number;
  baseline_idw_mae_db?: number | null;
  baseline_idw_rmse_db?: number | null;
  evaluation_sample_count: number;
  spatial_coverage_pct: number;
  validation_method: string;
  residuals_distribution: {
    mean: number;
    std: number;
    min: number;
    max: number;
    p25: number;
    p50: number;
    p75: number;
  };
  is_statistically_sound: boolean;
  ml_vs_idw_verdict: string;
}

export interface MLModel {
  id: string;
  floor_id?: string | null;
  campus_id?: string | null;
  building_id?: string | null;
  network_label?: string | null;
  model_name: string;
  model_version: string;
  algorithm: string;
  status: string;
  hyperparameters: Record<string, any>;
  training_sample_count: number;
  validation_sample_count: number;
  validation_strategy: string;
  rmse_db?: number | null;
  mae_db?: number | null;
  r2_score?: number | null;
  created_at: string;
  evaluation?: MLEvaluation | null;
  is_current_champion: boolean;
}

export interface MLPredictionMap {
  model_id: string;
  model_name: string;
  algorithm: string;
  floor_id: string;
  network_label?: string | null;
  grid_width: number;
  grid_height: number;
  pixel_width: number;
  pixel_height: number;
  scale_pixels_per_meter: number;
  min_pred_rssi?: number | null;
  max_pred_rssi?: number | null;
  avg_pred_rssi?: number | null;
  grid_data: (number | null)[][];
  idw_grid_data: (number | null)[][];
  delta_grid_data: (number | null)[][];
  convex_hull_support: boolean;
  confidence_notice: string;
}
