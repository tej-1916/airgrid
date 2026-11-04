import { TelemetrySnapshot } from '../types/diagnostics';
import { apiRequest } from './api';
import {
  SurveySession,
  SurveyMeasurement,
  SurveySessionCreatePayload,
  SurveySessionUpdatePayload,
  SurveyMeasurementCreatePayload,
  LiveMeasurementCreatePayload,
  MeasurementRepositionPayload,
  SurveyValidationResponse,
  HeatmapGridResponse,
  SurveySummaryStats,
  SurveyComparisonResponse,
  HostTelemetryStatus,
} from '../types/survey';

export interface SurveyListResponse {
  total: number;
  items: SurveySession[];
}

export const surveyService = {
  /**
   * Create a new survey session.
   */
  async createSurvey(payload: SurveySessionCreatePayload): Promise<SurveySession> {
    return apiRequest<SurveySession>('/api/v1/surveys', {
      method: 'POST',
      body: JSON.stringify(payload),
    });
  },

  /**
   * List survey sessions with optional filtering.
   */
  async listSurveys(params: {
    campusId?: string;
    buildingId?: string;
    floorId?: string;
    status?: string;
    limit?: number;
    offset?: number;
  } = {}): Promise<SurveyListResponse> {
    const query = new URLSearchParams();
    if (params.campusId) query.set('campus_id', params.campusId);
    if (params.buildingId) query.set('building_id', params.buildingId);
    if (params.floorId) query.set('floor_id', params.floorId);
    if (params.status) query.set('status', params.status);
    if (params.limit !== undefined) query.set('limit', params.limit.toString());
    if (params.offset !== undefined) query.set('offset', params.offset.toString());

    const qs = query.toString();
    return apiRequest<SurveyListResponse>(`/api/v1/surveys${qs ? `?${qs}` : ''}`);
  },

  /**
   * Get single survey session with measurements.
   */
  async getSurvey(surveyId: string): Promise<SurveySession> {
    return apiRequest<SurveySession>(`/api/v1/surveys/${surveyId}`);
  },

  /**
   * Update survey metadata.
   */
  async updateSurvey(surveyId: string, payload: SurveySessionUpdatePayload): Promise<SurveySession> {
    return apiRequest<SurveySession>(`/api/v1/surveys/${surveyId}`, {
      method: 'PATCH',
      body: JSON.stringify(payload),
    });
  },

  /**
   * Complete a survey session.
   */
  async completeSurvey(surveyId: string): Promise<SurveySession> {
    return apiRequest<SurveySession>(`/api/v1/surveys/${surveyId}/complete`, {
      method: 'POST',
    });
  },

  /**
   * Record a new measurement in a survey session.
   */
  async placeableSnapshots(surveyId: string): Promise<TelemetrySnapshot[]> {
    return apiRequest<TelemetrySnapshot[]>(`/api/v1/surveys/${surveyId}/placeable-snapshots`);
  },

  async placeSnapshot(surveyId: string, body: { telemetry_snapshot_id: string; position_x: number; position_y: number; notes?: string }): Promise<SurveyMeasurement> {
    return apiRequest<SurveyMeasurement>(`/api/v1/surveys/${surveyId}/measurements/from-snapshot`, {
      method: 'POST',
      body: JSON.stringify(body),
    });
  },

  async addMeasurement(surveyId: string, payload: SurveyMeasurementCreatePayload): Promise<SurveyMeasurement> {
    return apiRequest<SurveyMeasurement>(`/api/v1/surveys/${surveyId}/measurements`, {
      method: 'POST',
      body: JSON.stringify(payload),
    });
  },

  /**
   * Capture a live Wi-Fi observation directly at specified coordinates.
   */
  async collectLiveMeasurement(
    surveyId: string,
    payload: LiveMeasurementCreatePayload
  ): Promise<SurveyMeasurement> {
    return apiRequest<SurveyMeasurement>(`/api/v1/surveys/${surveyId}/measurements/collect-live`, {
      method: 'POST',
      body: JSON.stringify(payload),
    });
  },

  /**
   * Correct the coordinates of an existing measurement with audit history.
   */
  async repositionMeasurement(
    surveyId: string,
    measurementId: string,
    payload: MeasurementRepositionPayload
  ): Promise<SurveyMeasurement> {
    return apiRequest<SurveyMeasurement>(
      `/api/v1/surveys/${surveyId}/measurements/${measurementId}/reposition`,
      {
        method: 'PATCH',
        body: JSON.stringify(payload),
      }
    );
  },

  /**
   * Run Leave-One-Out Cross-Validation (LOOCV) to empirically validate heatmap accuracy.
   */
  async getSurveyValidation(
    surveyId: string,
    params: { networkLabel?: string; power?: number } = {}
  ): Promise<SurveyValidationResponse> {
    const query = new URLSearchParams();
    if (params.networkLabel) query.set('network_label', params.networkLabel);
    if (params.power) query.set('power', params.power.toString());
    const qs = query.toString();
    return apiRequest<SurveyValidationResponse>(`/api/v1/surveys/${surveyId}/validation${qs ? `?${qs}` : ''}`);
  },

  /**
   * List all measurements for a survey session.
   */
  async listMeasurements(surveyId: string): Promise<SurveyMeasurement[]> {
    return apiRequest<SurveyMeasurement[]>(`/api/v1/surveys/${surveyId}/measurements`);
  },

  /**
   * Delete a measurement.
   */
  async deleteMeasurement(surveyId: string, measurementId: string): Promise<void> {
    return apiRequest<void>(`/api/v1/surveys/${surveyId}/measurements/${measurementId}`, {
      method: 'DELETE',
    });
  },

  /**
   * Calculate or retrieve the IDW estimated heatmap grid.
   */
  async getHeatmap(
    surveyId: string,
    params: { gridCols?: number; gridRows?: number; power?: number; networkLabel?: string; apReference?: string } = {}
  ): Promise<HeatmapGridResponse> {
    const query = new URLSearchParams();
    if (params.gridCols) query.set('grid_cols', params.gridCols.toString());
    if (params.gridRows) query.set('grid_rows', params.gridRows.toString());
    if (params.power) query.set('power', params.power.toString());
    if (params.networkLabel) query.set('network_label', params.networkLabel);
    if (params.apReference) query.set('ap_reference', params.apReference);

    const qs = query.toString();
    return apiRequest<HeatmapGridResponse>(`/api/v1/surveys/${surveyId}/heatmap${qs ? `?${qs}` : ''}`);
  },

  /**
   * Get aggregate survey metrics and analysis.
   */
  async getSurveyAnalysis(surveyId: string): Promise<SurveySummaryStats> {
    return apiRequest<SurveySummaryStats>(`/api/v1/surveys/${surveyId}/analysis`);
  },

  /**
   * Compare two survey sessions on the same floor.
   */
  async compareSurveys(session1Id: string, session2Id: string): Promise<SurveyComparisonResponse> {
    return apiRequest<SurveyComparisonResponse>(
      `/api/v1/surveys/compare?session1=${encodeURIComponent(session1Id)}&session2=${encodeURIComponent(session2Id)}`
    );
  },

  /**
   * Query server-host telemetry status.
   */
  async getHostTelemetry(): Promise<HostTelemetryStatus> {
    return apiRequest<HostTelemetryStatus>('/api/v1/surveys/client-telemetry/status');
  },
};
