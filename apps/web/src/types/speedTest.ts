export type SpeedTestPhase =
  | 'idle'
  | 'preparing'
  | 'latency'
  | 'download'
  | 'upload'
  | 'completed'
  | 'paused'
  | 'aborted'
  | 'failed';

export interface SpeedTestMetrics {
  downloadMbps?: number;
  uploadMbps?: number;
  latencyMs?: number;
  jitterMs?: number;
  loadedLatencyMs?: number;
  packetLossPct?: number | null; // null represents unsupported / excluded
  durationSeconds?: number;
  serverLocation?: string;
  qualityMetadata?: Record<string, any>;
}

export interface SpeedTestState {
  phase: SpeedTestPhase;
  progressPercent: number; // 0 to 100
  isRunning: boolean;
  isPaused: boolean;
  currentPhaseName: string;
  metrics: SpeedTestMetrics;
  error?: string;
  startedAt?: string;
  completedAt?: string;
}

export interface SpeedTestRecord {
  id: string;
  user_id?: string;
  user_email?: string;
  user_name?: string;
  campus_id?: string;
  campus_name?: string;
  campus_code?: string;
  building_id?: string;
  building_name?: string;
  building_code?: string;
  floor_id?: string;
  floor_name?: string;
  floor_number?: number;
  vantage_point: string;
  provider_engine: string;
  status: 'completed' | 'aborted' | 'failed' | 'in_progress';
  data_provenance: string;
  download_mbps?: number;
  upload_mbps?: number;
  latency_ms?: number;
  jitter_ms?: number;
  loaded_latency_ms?: number;
  packet_loss_pct?: number | null;
  server_location?: string;
  quality_metadata?: Record<string, any>;
  error_code?: string;
  error_message?: string;
  started_at?: string;
  completed_at?: string;
  duration_seconds?: number;
  executed_at: string;
}

export interface SpeedTestListResponse {
  total: number;
  skip: number;
  limit: number;
  items: SpeedTestRecord[];
}

export interface SpeedTestSummaryStats {
  total_tests: number;
  completed_count: number;
  aborted_count: number;
  failed_count: number;
  avg_download_mbps?: number;
  avg_upload_mbps?: number;
  avg_latency_ms?: number;
  avg_jitter_ms?: number;
  max_download_mbps?: number;
  max_upload_mbps?: number;
  min_latency_ms?: number;
}

export interface SpeedTestConfig {
  max_mb: number;
  duration_seconds: number;
  default_provider: string;
  supported_providers: string[];
}

export interface SpeedTestCreatePayload {
  provider_engine: string;
  vantage_point?: string;
  status?: string;
  download_mbps?: number;
  upload_mbps?: number;
  latency_ms?: number;
  jitter_ms?: number;
  loaded_latency_ms?: number;
  packet_loss_pct?: number | null;
  server_location?: string;
  campus_id?: string;
  building_id?: string;
  floor_id?: string;
  started_at?: string;
  completed_at?: string;
  duration_seconds?: number;
  quality_metadata?: Record<string, any>;
  error_code?: string;
  error_message?: string;
}
