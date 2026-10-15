/**
 * AirGrid Shared Contract Types
 * Source of truth for frontend, backend schemas, and automation payloads.
 */

export type UserRole = 'super_admin' | 'network_admin' | 'field_tech' | 'observer';

export interface UserProfile {
  id: string;
  email: string;
  fullName: string;
  role: UserRole;
  isActive: boolean;
  createdAt: string;
}

export interface AuthResponse {
  accessToken: string;
  tokenType: string;
  expiresInSeconds: number;
  user: UserProfile;
}

export interface SystemHealthResponse {
  status: 'healthy' | 'degraded' | 'unhealthy';
  version: string;
  environment: string;
  uptimeSeconds: number;
  dependencies: {
    database: {
      status: 'connected' | 'error';
      latencyMs?: number;
    };
    aiGateway: {
      status: 'active' | 'configured_unverified' | 'unconfigured';
      activeProvider: string;
      credentialsPresent: boolean;
    };
    automationWebhook: {
      status: 'ready' | 'unconfigured';
      signingKeyConfigured: boolean;
    };
  };
}

// Campus Hierarchy
export interface Campus {
  id: string;
  name: string;
  code: string;
  latitude?: number;
  longitude?: number;
  address?: string;
  buildingsCount: number;
  createdAt: string;
}

export interface Building {
  id: string;
  campusId: string;
  name: string;
  buildingCode: string;
  floorsCount: number;
  createdAt: string;
}

export interface FloorPlanAsset {
  id: string;
  filePath: string;
  fileFormat: 'png' | 'svg' | 'webp';
  pixelWidth: number;
  pixelHeight: number;
  scalePixelsPerMeter: number;
}

export type AccessPointStatus = 'active' | 'degraded' | 'offline' | 'planned';

export interface AccessPoint {
  id: string;
  floorId: string;
  name: string;
  macAddress: string;
  model?: string;
  vendor?: string;
  xCoord: number;
  yCoord: number;
  channel24Ghz?: number;
  channel5Ghz?: number;
  txPowerDbm: number;
  status: AccessPointStatus;
  createdAt: string;
}

export interface FloorDetail {
  id: string;
  buildingId: string;
  floorNumber: number;
  name: string;
  dimensionsWidthM: number;
  dimensionsHeightM: number;
  floorPlan?: FloorPlanAsset;
  accessPoints: AccessPoint[];
}

// Network Measurement
export type VantagePoint = 'client_browser' | 'field_laptop' | 'server_backend';

export interface SpeedTestSubmission {
  vantagePoint: VantagePoint;
  providerEngine: 'cloudflare_speedtest' | 'librespeed' | 'iperf3_wan';
  floorId?: string;
  downloadMbps: number;
  uploadMbps: number;
  latencyMs: number;
  jitterMs: number;
  packetLossPct: number;
  xCoord?: number;
  yCoord?: number;
}

export interface SpeedTestResult extends SpeedTestSubmission {
  id: string;
  executedAt: string;
}

export interface WiFiObservation {
  id?: string;
  bssid: string;
  ssid: string;
  rssiDbm: number;
  frequencyMhz: number;
  channel: number;
  xCoord: number;
  yCoord: number;
  observedAt: string;
}

// AI Gateway
export type PromptCategory = 'diagnostic' | 'optimization_summary' | 'anomaly_analysis';

export interface AIGenerateRequest {
  category: PromptCategory;
  prompt: string;
  requestedModel?: string;
  temperature?: number;
  maxTokens?: number;
}

export interface AIGenerateResponse {
  requestId: string;
  status: 'success' | 'failed' | 'timeout' | 'unconfigured';
  promptCategory: PromptCategory;
  requestedModel: string;
  verifiedModel: string | null;
  isVerifiedExecution: boolean;
  fallbackDetected: boolean;
  durationMs: number;
  outputText: string;
  tokens: {
    prompt: number;
    completion: number;
    total: number;
  };
}

export interface AIExecutionAuditRecord {
  id: string;
  requestId: string;
  promptCategory: PromptCategory;
  requestedModel: string;
  verifiedModel: string | null;
  isVerifiedExecution: boolean;
  fallbackDetected: boolean;
  durationMs: number;
  status: string;
  executedAt: string;
}

// n8n Webhook & Event Integration
export type EventSeverity = 'info' | 'warning' | 'critical';

export type SystemEventType =
  | 'network.degradation'
  | 'deadzone.detected'
  | 'ai.diagnostic_report'
  | 'ml.training_completed'
  | 'report.weekly_summary'
  | 'email.delivery_request'
  | 'automation.failure';

export interface WebhookEventPayload<T = Record<string, unknown>> {
  eventId: string;
  eventType: SystemEventType;
  severity: EventSeverity;
  timestamp: string;
  data: T;
}
