import { apiRequest } from './api';
import {
  SpeedTestRecord,
  SpeedTestListResponse,
  SpeedTestSummaryStats,
  SpeedTestCreatePayload,
  SpeedTestConfig,
} from '../types/speedTest';

export const speedTestService = {
  /**
   * Persist a client speed test measurement to the backend.
   */
  async saveSpeedTest(payload: SpeedTestCreatePayload): Promise<SpeedTestRecord> {
    return apiRequest<SpeedTestRecord>('/api/v1/speed-tests', {
      method: 'POST',
      body: JSON.stringify(payload),
    });
  },

  /**
   * List historical speed test measurements with optional filtering.
   */
  async listSpeedTests(params: {
    skip?: number;
    limit?: number;
    campusId?: string;
    buildingId?: string;
    floorId?: string;
    status?: string;
    provider?: string;
  } = {}): Promise<SpeedTestListResponse> {
    const query = new URLSearchParams();
    if (params.skip !== undefined) query.set('skip', params.skip.toString());
    if (params.limit !== undefined) query.set('limit', params.limit.toString());
    if (params.campusId) query.set('campus_id', params.campusId);
    if (params.buildingId) query.set('building_id', params.buildingId);
    if (params.floorId) query.set('floor_id', params.floorId);
    if (params.status) query.set('status', params.status);
    if (params.provider) query.set('provider', params.provider);

    const qs = query.toString();
    return apiRequest<SpeedTestListResponse>(`/api/v1/speed-tests${qs ? `?${qs}` : ''}`);
  },

  /**
   * Get single speed test details.
   */
  async getSpeedTest(testId: string): Promise<SpeedTestRecord> {
    return apiRequest<SpeedTestRecord>(`/api/v1/speed-tests/${testId}`);
  },

  /**
   * Get historical summary statistics across tests.
   */
  async getStatsSummary(campusId?: string): Promise<SpeedTestSummaryStats> {
    const qs = campusId ? `?campus_id=${encodeURIComponent(campusId)}` : '';
    return apiRequest<SpeedTestSummaryStats>(`/api/v1/speed-tests/stats/summary${qs}`);
  },

  /**
   * Get speed test safety limits and server configuration.
   */
  async getConfig(): Promise<SpeedTestConfig> {
    return apiRequest<SpeedTestConfig>('/api/v1/speed-tests/config');
  },
};
