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
  telemetry?: TelemetrySnapshot;
  operator_consent: boolean;
}
