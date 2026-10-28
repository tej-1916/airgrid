import { apiRequest } from './api';
import {
  MLDatasetReadiness,
  MLDatasetExplorer,
  MLAlgorithmInfo,
  MLTrainRequest,
  MLModel,
  MLPredictionMap,
} from '../types/ml';

export const mlService = {
  /**
   * Retrieves dataset readiness evaluation for spatial ML training.
   */
  async getReadiness(floorId: string, networkLabel?: string | null): Promise<MLDatasetReadiness> {
    const params = new URLSearchParams();
    params.set('floor_id', floorId);
    if (networkLabel) params.set('network_label', networkLabel);
    return apiRequest<MLDatasetReadiness>(`/api/v1/ml/readiness?${params.toString()}`);
  },

  /**
   * Retrieves statistical distributions, RSSI histograms, and provenance breakdowns.
   */
  async getDatasetExplorer(floorId: string, networkLabel?: string | null): Promise<MLDatasetExplorer> {
    const params = new URLSearchParams();
    params.set('floor_id', floorId);
    if (networkLabel) params.set('network_label', networkLabel);
    return apiRequest<MLDatasetExplorer>(`/api/v1/ml/dataset-explorer?${params.toString()}`);
  },

  /**
   * Lists supported scikit-learn regression algorithms.
   */
  async getAlgorithms(): Promise<MLAlgorithmInfo[]> {
    return apiRequest<MLAlgorithmInfo[]>('/api/v1/ml/algorithms');
  },

  /**
   * Triggers model training and cross-validation evaluation.
   */
  async trainModel(payload: MLTrainRequest): Promise<MLModel> {
    return apiRequest<MLModel>('/api/v1/ml/train', {
      method: 'POST',
      body: JSON.stringify(payload),
    });
  },

  /**
   * Lists models for a floor.
   */
  async listModels(floorId?: string): Promise<MLModel[]> {
    const qs = floorId ? `?floor_id=${floorId}` : '';
    return apiRequest<MLModel[]>(`/api/v1/ml/models${qs}`);
  },

  /**
   * Retrieves single model detail and evaluation metrics.
   */
  async getModel(modelId: string): Promise<MLModel> {
    return apiRequest<MLModel>(`/api/v1/ml/models/${modelId}`);
  },

  /**
   * Promotes model to active champion.
   */
  async setChampion(modelId: string): Promise<MLModel> {
    return apiRequest<MLModel>(`/api/v1/ml/models/${modelId}/champion`, {
      method: 'POST',
    });
  },

  /**
   * Deletes model and its artifact.
   */
  async deleteModel(modelId: string): Promise<void> {
    await apiRequest<void>(`/api/v1/ml/models/${modelId}`, {
      method: 'DELETE',
    });
  },

  /**
   * Generates 2D prediction map overlay, IDW baseline, and delta comparison.
   */
  async getPredictionMap(
    modelId: string,
    gridRows: number = 30,
    gridCols: number = 50,
    networkLabel?: string | null
  ): Promise<MLPredictionMap> {
    const params = new URLSearchParams();
    params.set('grid_rows', gridRows.toString());
    params.set('grid_cols', gridCols.toString());
    if (networkLabel) params.set('network_label', networkLabel);
    return apiRequest<MLPredictionMap>(`/api/v1/ml/models/${modelId}/prediction-map?${params.toString()}`);
  },
};
