export interface InterfaceInfo {
  name: string;
  type: string;
  is_wireless: boolean;
  is_connected: boolean;
  ip_address: string | null;
  mac_address: string | null;
  state: string | null;
  connection_name: string | null;
  is_default_gateway_interface: boolean;
}

export interface InterfaceListResponse {
  interfaces: InterfaceInfo[];
  discovered_wireless_interface: string | null;
  default_gateway: string | null;
  hostname: string;
  os_info: string;
}

export interface GatewayPingResult {
  target_ip: string;
  transmitted: number;
  received: number;
  loss_pct: number | null;
  rtt_min_ms: number | null;
  rtt_avg_ms: number | null;
  rtt_max_ms: number | null;
  rtt_mdev_ms: number | null;
  status: string;
}

export interface IperfResult {
  target_host: string;
  port: number;
  protocol: string;
  throughput_mbps: number | null;
  jitter_ms: number | null;
  lost_packets: number | null;
  status: string;
  error_message: string | null;
}

export interface TelemetrySnapshot {
  id?: string;
  interface_name: string;
  mac_address: string | null;
  ssid: string | null;
  bssid: string | null;
  rssi_dbm: number | null;
  signal_quality_pct: number | null;
  frequency_mhz: number | null;
  channel: number | null;
  channel_width_mhz: number | null;
  band: string | null;
  rx_bitrate_mbps: number | null;
  tx_bitrate_mbps: number | null;
  security_protocol: string | null;
  gateway_ip: string | null;
  gateway_ping: GatewayPingResult | null;
  iperf: IperfResult | null;
  internet_speed_test_id: string | null;
  internet_download_mbps: number | null;
  internet_upload_mbps: number | null;
  internet_latency_ms: number | null;
  vantage_point: string;
  data_provenance: string;
  raw_details: Record<string, any>;
  collected_at: string;
  report_id?: string | null;
  collector_id?: string | null;
  collection_status?: 'collected' | 'partial' | 'failed' | string;
  collection_error?: string | null;
  connection_state?: string | null;
}

export interface DiagnosticFinding {
  id?: string;
  category: string;
  severity: 'critical' | 'warning' | 'good' | 'info';
  title: string;
  description: string;
  measured_evidence: string;
  metric_key: string | null;
  measured_value: string | null;
  threshold_value: string | null;
  unit: string | null;
  recommendation: string;
}

export interface DiagnosticReport {
  id: string;
  title: string;
  campus_id: string | null;
  building_id: string | null;
  floor_id: string | null;
  user_id: string | null;
  user_email: string | null;
  device_fingerprint: string | null;
  device_name: string;
  interface_name: string;
  vantage_point: string;
  data_provenance: string;
  status: 'healthy' | 'warning' | 'critical' | 'analyzed';
  summary_headline: string;
  overall_score: number;
  findings_count: number;
  critical_count: number;
  warning_count: number;
  good_count: number;
  telemetry: TelemetrySnapshot | null;
  findings: DiagnosticFinding[];
  created_at: string;
  updated_at: string;
}

export interface DiagnosticReportListResponse {
  reports: DiagnosticReport[];
  total: number;
  skip: number;
  limit: number;
}

export interface CollectTelemetryParams {
  interface_name?: string;
  campus_id?: string;
  building_id?: string;
  floor_id?: string;
  include_gateway_ping?: boolean;
  ping_count?: number;
  iperf_target_host?: string;
  iperf_port?: number;
  link_internet_speed_test_id?: string;
  device_name?: string;
  operator_consent: boolean;
}

export interface AnalyzeDiagnosticsParams {
  title?: string;
  interface_name?: string;
  campus_id?: string;
  building_id?: string;
  floor_id?: string;
  include_gateway_ping?: boolean;
  ping_count?: number;
  iperf_target_host?: string;
  iperf_port?: number;
  link_internet_speed_test_id?: string;
  device_name?: string;
  telemetry_snapshot_id?: string;
  telemetry?: TelemetrySnapshot;
  operator_consent: boolean;
}

export interface NetworkCollector {
  id: string;
  name: string;
  host_label: string | null;
  description: string | null;
  campus_id: string | null;
  building_id: string | null;
  floor_id: string | null;
  status: 'active' | 'revoked' | string;
  created_at: string;
  revoked_at: string | null;
  last_seen_at: string | null;
  last_submission_status: string | null;
  submission_count: number;
  rejected_count: number;
}

export interface CollectorCredentials {
  collector: NetworkCollector;
  secret: string;
  notice: string;
}

export interface TrendPoint {
  snapshot_id: string;
  collected_at: string;
  collector_id: string | null;
  report_id: string | null;
  vantage_point: string;
  data_provenance: string;
  collection_status: string;
  connection_state: string;
  ssid: string | null;
  bssid: string | null;
  band: string | null;
  channel: number | null;
  rssi_dbm: number | null;
  rx_bitrate_mbps: number | null;
  tx_bitrate_mbps: number | null;
  gateway_rtt_avg_ms: number | null;
  gateway_loss_pct: number | null;
}

export interface SpeedTestPoint {
  id: string;
  executed_at: string;
  vantage_point: string;
  data_provenance: string;
  download_mbps: number | null;
  upload_mbps: number | null;
  latency_ms: number | null;
  jitter_ms: number | null;
  packet_loss_pct: number | null;
}

export interface TelemetryTrends {
  window: { since: string; until: string; days: number };
  series: TrendPoint[];
  transitions: { at: string; source: string; kind: string; from: string; to: string; snapshot_id: string }[];
  speed_tests: SpeedTestPoint[];
  daily_aggregates: { day: string; collector_id: string | null; vantage_point: string; sample_count: number;
    metrics: Record<string, { count: number; min: number; max: number; avg: number }> }[];
  truncated: boolean;
  availability: Record<string, number>;
  freshness: { latest_observation_at: string | null; observation_age_seconds: number | null; latest_speed_test_at: string | null };
  notes: string[];
}

export interface RetentionPolicy {
  dataset: string;
  description: string;
  retention_days: number | null;
  aggregate_before_delete: boolean;
  updated_at: string | null;
}

export interface RetentionPreview {
  dataset: string;
  enabled: boolean;
  retention_days: number | null;
  cutoff: string | null;
  eligible_count: number;
  protected_count: number;
  oldest_eligible_at: string | null;
  note: string;
}
