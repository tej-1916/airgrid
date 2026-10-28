export type SurveyStatus = 'in_progress' | 'completed' | 'archived';

export type MeasurementSource = 'manual_observation' | 'host_telemetry' | 'controlled_test_import';

export interface SurveyMeasurement {
  id: string;
  survey_session_id: string;
  floor_id: string;
  position_x: number;
  position_y: number;
  normalized_x: number;
  normalized_y: number;
  rssi_dbm: number;
  measurement_source: MeasurementSource;
  network_label?: string | null;
  ap_reference?: string | null;
  frequency_mhz?: number | null;
  channel?: number | null;
  notes?: string | null;
  data_provenance: string;
  source_telemetry_snapshot_id?: string | null;
  observed_at: string;
  created_at: string;
}

export interface SurveySession {
  id: string;
  campus_id: string | null;
  building_id: string | null;
  floor_id: string;
  technician_id: string | null;
  operator_name: string | null;
  session_name: string;
  description: string | null;
  status: SurveyStatus;
  started_at: string;
  completed_at: string | null;
  created_at: string;
  updated_at: string;
  measurement_count: number;
  measurements?: SurveyMeasurement[];
}

export interface SurveySessionCreatePayload {
  floor_id: string;
  session_name: string;
  description?: string;
  campus_id?: string;
  building_id?: string;
}

export interface SurveySessionUpdatePayload {
  session_name?: string;
  description?: string;
  status?: SurveyStatus;
}

export interface SurveyMeasurementCreatePayload {
  floor_id: string;
  position_x: number;
  position_y: number;
  rssi_dbm: number;
  measurement_source: MeasurementSource;
  network_label?: string;
  ap_reference?: string;
  frequency_mhz?: number;
  channel?: number;
  notes?: string;
  data_provenance?: string;
}

export interface HeatmapGridResponse {
  survey_session_id: string;
  floor_id: string;
  grid_width: number;
  grid_height: number;
  pixel_width: number;
  pixel_height: number;
  scale_pixels_per_meter: number;
  sample_count: number;
  min_rssi: number;
  max_rssi: number;
  avg_rssi: number;
  grid_data: (number | null)[][];
  confidence_notice: string;
  is_sparse_warning: boolean;
  mask_radius_meters: number;
  power_parameter: number;
  network_label?: string | null;
  ap_reference?: string | null;
  convex_hull_support?: boolean;
}

export interface SurveySummaryStats {
  total_surveys: number;
  completed_surveys: number;
  total_measurements: number;
  min_rssi_dbm: number | null;
  max_rssi_dbm: number | null;
  avg_rssi_dbm: number | null;
  source_breakdown: Record<string, number>;
  coverage_availability_pct: number | null;
  unmeasured_areas_noted: boolean;
}

export interface SurveyComparisonResponse {
  session1: SurveySession;
  session2: SurveySession;
  sample_count_delta: number;
  avg_rssi_delta_db: number | null;
  min_rssi_delta_db: number | null;
  max_rssi_delta_db: number | null;
  notes: string;
}

export interface HostTelemetryStatus {
  available: boolean;
  interface?: string | null;
  rssi_dbm?: number | null;
  link_quality?: number | null;
  noise_dbm?: number | null;
  vantage_point: string;
  disclaimer: string;
  message?: string;
}
