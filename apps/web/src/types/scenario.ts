/** Types for the hypothetical-AP scenario studio (see apps/api/src/airgrid/services/ap_prediction.py). */
export type Band = 'good' | 'fair' | 'weak' | 'unknown';

export const BAND_COLOUR: Record<Band, string> = { good: '#4C8B5A', fair: '#D9A441', weak: '#C0504D', unknown: '#C9CBCF' };
export const BAND_LABEL: Record<Band, string> = {
  good: 'Good (≥ −67 dBm)', fair: 'Fair (−67 to −75 dBm)', weak: 'Weak (< −75 dBm)', unknown: 'Unknown (no measured support / no AP)',
};

export interface Candidate {
  id: string; name: string; x_m: number; y_m: number;
  tx_power_dbm?: number | null; antenna_gain_dbi?: number | null; enabled: boolean; note?: string | null;
}

export interface ScenarioSpec {
  candidates: Candidate[]; parameters: Record<string, number>; disabled_existing_ap_ids: string[]; baseline_session_id?: string | null;
}

export interface ExistingAP { id: string; name: string; x_m: number; y_m: number; tx_power_dbm: number | null; status: string }

export interface ParamSpec { default: number; min: number; max: number; unit: string; description: string }

export interface ScenarioContext {
  floor: { id: string; title: string; floor_number: number; bounds: { min: [number, number]; max: [number, number] } };
  coordinate_system: string;
  zones: { id: string; name: string; kind: string; area_m2: number; polygon_world: [number, number][] }[];
  courtyard_bounds: { min: [number, number]; max: [number, number] } | null;
  existing_access_points: ExistingAP[]; unplaced_access_points: number;
  session: { id: string; name: string; points: number; provenance_counts: Record<string, number>; all_synthetic_demo: boolean } | null;
  sessions: { id: string; name: string; status: string; points: number; started_at: string | null }[];
  recorded_points: { x_m: number; y_m: number; rssi_dbm: number }[];
  model: { id: string; version: string; validated: boolean; assumptions: string[]; thresholds_dbm: { good_min: number; weak_below: number };
    max_candidates: number; parameters: Record<string, ParamSpec> };
}

export interface ZoneResult {
  id: string; name: string; kind: string; area_m2: number; polygon_world: [number, number][];
  mean_dbm: number | null; band: Band; basis: string; sigma_db: number | null; p_weak: number; p_good: number; confidence: number; uncertain: boolean;
  serving_ap: string | null; serving_ap_name: string | null; walls_to_serving_ap: number | null;
  evidence: { support: string; recorded_points: number; recorded_mean_dbm: number | null; nearest_recorded_m: number | null };
}

export interface ScenarioResult {
  model: { id: string; version: string; validated: boolean; assumptions: string[] };
  labels: { layer: string; physically_validated: boolean; recorded_data: string; hypothetical_access_points: number };
  inputs_hash: string; zones: ZoneResult[];
  summary: Record<string, number>;
  parameters: Record<string, { value: number; unit: string; provenance: string }>;
  model_check: { bias_db: number; mae_db: number; rmse_db: number; points: number } | null;
}

export interface ZoneChange {
  id: string; name: string; a_dbm: number | null; b_dbm: number | null; delta_db: number | null; a_band: Band; b_band: Band;
  change: string; within_model_uncertainty: boolean;
}

export interface Comparison {
  summary: Record<string, { a: number; b: number; delta: number }>; zones: ZoneChange[];
  zones_improved: number; zones_worsened: number; changes_within_model_uncertainty: number; caveat: string;
}

export interface PredictResponse { baseline: ScenarioResult; scenario: ScenarioResult; comparison: Comparison }

export interface SavedScenarioPlan {
  id: string; name: string; version: number; status: string; updated_at: string | null; scenario: ScenarioSpec | null; author: string | null;
}

export interface PlanVersionRow { version: number; name: string; status: string; candidates: number; has_scenario: boolean; created_at: string | null }
