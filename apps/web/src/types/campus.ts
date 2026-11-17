export interface CalibrationPoint {
  x: number;
  y: number;
}

export interface CalibrationMetadata {
  point1: CalibrationPoint;
  point2: CalibrationPoint;
  pixel_distance: number;
  distance_m: number;
  scale_pixels_per_meter: number;
}

export interface FloorPlanAsset {
  id: string;
  floor_id: string;
  file_format: string;
  original_filename?: string | null;
  file_size_bytes?: number | null;
  pixel_width: number;
  pixel_height: number;
  scale_pixels_per_meter: number;
  is_calibrated: boolean;
  calibration_metadata?: CalibrationMetadata | null;
  image_url: string;
  created_at: string;
  updated_at: string;
}

export interface Floor {
  id: string;
  building_id: string;
  floor_number: number;
  name: string;
  status: string;
  dimensions_width_m: number;
  dimensions_height_m: number;
  has_floor_plan: boolean;
  floor_plan?: FloorPlanAsset | null;
  created_at: string;
  updated_at: string;
}

export interface Building {
  id: string;
  campus_id: string;
  name: string;
  building_code: string;
  description?: string | null;
  status: string;
  floors_count: number;
  actual_floors_count: number;
  floors?: Floor[];
  created_at: string;
  updated_at: string;
}

export interface Campus {
  id: string;
  name: string;
  code: string;
  description?: string | null;
  status: string;
  address?: string | null;
  latitude?: number | null;
  longitude?: number | null;
  buildings_count: number;
  floors_count: number;
  floor_plans_count: number;
  buildings?: Building[];
  created_at: string;
  updated_at: string;
}

export interface CampusCreatePayload {
  name: string;
  code: string;
  description?: string;
  address?: string;
  latitude?: number;
  longitude?: number;
}

export interface CampusUpdatePayload {
  name?: string;
  code?: string;
  description?: string;
  address?: string;
  status?: string;
  latitude?: number;
  longitude?: number;
}

export interface BuildingCreatePayload {
  name: string;
  building_code: string;
  description?: string;
  floors_count?: number;
}

export interface BuildingUpdatePayload {
  name?: string;
  building_code?: string;
  description?: string;
  status?: string;
  floors_count?: number;
}

export interface FloorCreatePayload {
  floor_number: number;
  name: string;
  dimensions_width_m?: number;
  dimensions_height_m?: number;
}

export interface FloorUpdatePayload {
  floor_number?: number;
  name?: string;
  dimensions_width_m?: number;
  dimensions_height_m?: number;
  status?: string;
}

export interface CalibrationPayload {
  point1: CalibrationPoint;
  point2: CalibrationPoint;
  distance_m: number;
}

export interface FloorOutlinePayload {
  width_m: number;
  height_m: number;
  grid_interval_m?: number;
  label?: string;
}

// Dashboard Types
export interface DashboardSummary {
  selected_campus_id?: string | null;
  selected_campus_name?: string | null;
  total_campuses: number;
  total_buildings: number;
  total_floors: number;
  total_floor_plans: number;
  total_access_points: number;
  uncalibrated_floor_plans: number;
  database_connected: boolean;
  backend_version: string;
}

export interface CampusInventoryItem {
  id: string;
  name: string;
  code: string;
  status: string;
  address?: string | null;
  buildings_count: number;
  floors_count: number;
  floor_plans_count: number;
  last_updated: string;
}

export interface DashboardActivityItem {
  id: string;
  action: string;
  resource_type: string;
  resource_id?: string | null;
  actor_id?: string | null;
  actor_name?: string | null;
  actor_role?: string | null;
  payload: Record<string, any>;
  ip_address?: string | null;
  created_at: string;
}

export interface ComponentStatus {
  name: string;
  status: 'healthy' | 'degraded' | 'unconfigured' | 'unavailable';
  description: string;
  latency_ms?: number | null;
  last_checked: string;
}

export interface SystemStatusData {
  overall: 'operational' | 'degraded' | 'issues';
  components: ComponentStatus[];
  timestamp: string;
}
