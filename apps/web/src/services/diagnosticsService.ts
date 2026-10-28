import { apiRequest } from './api';
import {
  InterfaceListResponse,
  TelemetrySnapshot,
  GatewayPingResult,
  IperfResult,
  DiagnosticReport,
  DiagnosticReportListResponse,
  CollectTelemetryParams,
  AnalyzeDiagnosticsParams,
  NetworkCollector,
  CollectorCredentials,
  TelemetryTrends,
  RetentionPolicy,
  RetentionPreview,
} from '../types/diagnostics';

export const diagnosticsService = {
  /**
   * Discovers local network interfaces and wireless capabilities.
   */
  async getInterfaces(): Promise<InterfaceListResponse> {
    return apiRequest<InterfaceListResponse>('/api/v1/diagnostics/interfaces');
  },

  /**
   * Collects live, opt-in network telemetry from connected Linux interface.
   */
  async collectTelemetry(params: CollectTelemetryParams): Promise<TelemetrySnapshot> {
    return apiRequest<TelemetrySnapshot>('/api/v1/diagnostics/collect', {
      method: 'POST',
      body: JSON.stringify(params),
    });
  },

  /**
   * Executes bounded ping to default gateway.
   */
  async pingGateway(gatewayIp?: string, count: number = 3): Promise<GatewayPingResult> {
    return apiRequest<GatewayPingResult>('/api/v1/diagnostics/ping-gateway', {
      method: 'POST',
      body: JSON.stringify({
        gateway_ip: gatewayIp,
        ping_count: count,
        operator_consent: true,
      }),
    });
  },

  /**
   * Executes optional iperf3 LAN benchmark against a designated target host.
   */
  async runIperf(targetHost: string, port: number = 5201, duration: number = 5): Promise<IperfResult> {
    return apiRequest<IperfResult>('/api/v1/diagnostics/iperf', {
      method: 'POST',
      body: JSON.stringify({
        target_host: targetHost,
        port,
        duration_seconds: duration,
        operator_consent: true,
      }),
    });
  },

  /**
   * Executes deterministic rule-based analysis and creates a diagnostic report.
   */
  async analyzeDiagnostics(params: AnalyzeDiagnosticsParams): Promise<DiagnosticReport> {
    return apiRequest<DiagnosticReport>('/api/v1/diagnostics/analyze', {
      method: 'POST',
      body: JSON.stringify(params),
    });
  },

  /**
   * Lists historical diagnostic reports.
   */
  async listReports(
    campusId?: string,
    buildingId?: string,
    floorId?: string,
    skip: number = 0,
    limit: number = 20
  ): Promise<DiagnosticReportListResponse> {
    const params = new URLSearchParams();
    if (campusId) params.set('campus_id', campusId);
    if (buildingId) params.set('building_id', buildingId);
    if (floorId) params.set('floor_id', floorId);
    params.set('skip', String(skip));
    params.set('limit', String(limit));
    return apiRequest<DiagnosticReportListResponse>(`/api/v1/diagnostics/reports?${params.toString()}`);
  },

  /**
   * Fetches full diagnostic report by ID.
   */
  async getReportById(reportId: string): Promise<DiagnosticReport> {
    return apiRequest<DiagnosticReport>(`/api/v1/diagnostics/reports/${reportId}`);
  },

  /**
   * Deletes a diagnostic report (technician/admin only).
   */
  async deleteReport(reportId: string): Promise<{ ok: boolean; message: string }> {
    return apiRequest<{ ok: boolean; message: string }>(`/api/v1/diagnostics/reports/${reportId}`, {
      method: 'DELETE',
    });
  },

  async listCollectors(): Promise<NetworkCollector[]> {
    return apiRequest<NetworkCollector[]>('/api/v1/collectors');
  },

  async registerCollector(body: { name: string; host_label?: string; description?: string; campus_id?: string; building_id?: string; floor_id?: string }): Promise<CollectorCredentials> {
    return apiRequest<CollectorCredentials>('/api/v1/collectors', { method: 'POST', body: JSON.stringify(body) });
  },

  async revokeCollector(id: string): Promise<NetworkCollector> {
    return apiRequest<NetworkCollector>(`/api/v1/collectors/${id}/revoke`, { method: 'POST' });
  },

  async rotateCollector(id: string): Promise<CollectorCredentials> {
    return apiRequest<CollectorCredentials>(`/api/v1/collectors/${id}/rotate`, { method: 'POST' });
  },

  async listCollectorObservations(id: string, limit = 50): Promise<TelemetrySnapshot[]> {
    return apiRequest<TelemetrySnapshot[]>(`/api/v1/collectors/${id}/observations?limit=${limit}`);
  },

  async getTrends(params: { collectorId?: string; floorId?: string; days: number; includeOperatorReported?: boolean }): Promise<TelemetryTrends> {
    const q = new URLSearchParams({ days: String(params.days) });
    if (params.collectorId) q.set('collector_id', params.collectorId);
    if (params.floorId) q.set('floor_id', params.floorId);
    if (params.includeOperatorReported) q.set('include_operator_reported', 'true');
    return apiRequest<TelemetryTrends>(`/api/v1/diagnostics/trends?${q.toString()}`);
  },

  async listRetention(): Promise<RetentionPolicy[]> {
    return apiRequest<RetentionPolicy[]>('/api/v1/retention');
  },

  async updateRetention(dataset: string, retention_days: number | null, aggregate_before_delete: boolean): Promise<RetentionPolicy> {
    return apiRequest<RetentionPolicy>(`/api/v1/retention/${dataset}`, { method: 'PUT', body: JSON.stringify({ retention_days, aggregate_before_delete }) });
  },

  async previewRetention(dataset: string): Promise<RetentionPreview> {
    return apiRequest<RetentionPreview>(`/api/v1/retention/${dataset}/preview`);
  },

  async applyRetention(dataset: string, expected_count: number): Promise<{ deleted: number; aggregated_groups: number; cutoff: string }> {
    return apiRequest(`/api/v1/retention/${dataset}/apply`, { method: 'POST', body: JSON.stringify({ confirm: true, expected_count }) });
  },
};
