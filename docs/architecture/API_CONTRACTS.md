# AIRGRID | API Contracts & Endpoint Specifications

## 1. Global API Conventions

- **Base Path:** `/api/v1`
- **Content Type:** `application/json; charset=utf-8`
- **Authentication:** Bearer JWT in `Authorization: Bearer <token>` header for protected endpoints.
- **Timestamp Format:** ISO 8601 UTC (`YYYY-MM-DDTHH:MM:SSZ`)
- **Pagination Standard:** Limit and offset query parameters (`?limit=50&offset=0`).
- **Standard Envelope for Errors:**
```json
{
  "error": {
    "code": "RESOURCE_NOT_FOUND",
    "message": "The requested campus ID does not exist.",
    "details": [],
    "request_id": "req_01h7x..."
  }
}
```

---

## 2. System & Health Endpoints

### 2.1 Liveness Probe
- **Endpoint:** `GET /healthz`
- **Auth:** None (Public)
- **Response 200 OK:**
```json
{
  "status": "ok",
  "timestamp": "2026-10-14T08:30:00Z"
}
```

### 2.2 System Health & Dependency Status
- **Endpoint:** `GET /api/v1/health`
- **Auth:** None (Public)
- **Response 200 OK:**
```json
{
  "status": "healthy",
  "version": "0.1.0-phase00",
  "environment": "development",
  "uptime_seconds": 1245.2,
  "dependencies": {
    "database": {
      "status": "connected",
      "latency_ms": 2.4
    },
    "ai_gateway": {
      "status": "configured_unverified",
      "active_provider": "openai_compatible",
      "credentials_present": true
    },
    "automation_webhook": {
      "status": "ready",
      "signing_key_configured": true
    }
  }
}
```

---

## 3. Authentication & User Management

### 3.1 User Login
- **Endpoint:** `POST /api/v1/auth/login`
- **Auth:** None
- **Request Body:**
```json
{
  "email": "admin@airgrid.local",
  "password": "SecurePassword123!"
}
```
- **Response 200 OK:**
```json
{
  "access_token": "eyJhbGciOi...",
  "token_type": "bearer",
  "expires_in_seconds": 28800,
  "user": {
    "id": "c1f7b7f1-...",
    "email": "admin@airgrid.local",
    "full_name": "Campus Network Admin",
    "role": "network_admin"
  }
}
```

### 3.2 Current User Profile
- **Endpoint:** `GET /api/v1/auth/me`
- **Auth:** Bearer Token
- **Response 200 OK:**
```json
{
  "id": "c1f7b7f1-...",
  "email": "admin@airgrid.local",
  "full_name": "Campus Network Admin",
  "role": "network_admin",
  "is_active": true
}
```

---

## 4. Campus & Physical Infrastructure

### 4.1 List Campuses
- **Endpoint:** `GET /api/v1/campuses`
- **Query Params:** `limit` (default 50), `offset` (default 0)
- **Response 200 OK:**
```json
{
  "items": [
    {
      "id": "8a3138b5-...",
      "name": "North Campus Engineering",
      "code": "NC-ENG",
      "latitude": 37.7749,
      "longitude": -122.4194,
      "buildings_count": 4,
      "created_at": "2026-10-14T08:00:00Z"
    }
  ],
  "total": 1,
  "limit": 50,
  "offset": 0
}
```

### 4.2 Get Floor Detail with APs
- **Endpoint:** `GET /api/v1/floors/{floor_id}`
- **Response 200 OK:**
```json
{
  "id": "f47ac10b-...",
  "building_id": "b1a2c3d4-...",
  "floor_number": 2,
  "name": "Floor 2 - Computer Science Labs",
  "dimensions_width_m": 60.0,
  "dimensions_height_m": 40.0,
  "floor_plan": {
    "id": "fp_01...",
    "file_path": "/static/plans/nc_eng_f2.svg",
    "pixel_width": 1200,
    "pixel_height": 800,
    "scale_pixels_per_meter": 20.0
  },
  "access_points": [
    {
      "id": "ap_01...",
      "name": "AP-ENG-201",
      "mac_address": "AA:BB:CC:DD:EE:01",
      "model": "Aruba AP-535",
      "x_coord": 15.2,
      "y_coord": 22.8,
      "channel_5ghz": 36,
      "tx_power_dbm": 18.0,
      "status": "active"
    }
  ]
}
```

---

## 5. Network Measurement & Telemetry Ingestion

### 5.1 Ingest Wi-Fi Survey Observations
- **Endpoint:** `POST /api/v1/telemetry/observations`
- **Auth:** Bearer Token (FieldTech or NetworkAdmin)
- **Request Body:**
```json
{
  "survey_session_id": "ss_987...",
  "floor_id": "f47ac10b-...",
  "device_fingerprint": "dev_macbook_pro_01",
  "observations": [
    {
      "bssid": "aa:bb:cc:dd:ee:01",
      "ssid": "Campus-Secure",
      "rssi_dbm": -58.5,
      "frequency_mhz": 5180,
      "channel": 36,
      "x_coord": 14.8,
      "y_coord": 21.9,
      "observed_at": "2026-10-14T08:32:00Z"
    }
  ]
}
```
- **Response 202 Accepted:**
```json
{
  "status": "ingested",
  "records_processed": 1,
  "survey_session_id": "ss_987..."
}
```

### 5.2 Submit Client Speed Test Result
- **Endpoint:** `POST /api/v1/telemetry/speed-tests`
- **Auth:** Optional Bearer (Tagged as anonymous client if unauthenticated)
- **Request Body:**
```json
{
  "vantage_point": "client_browser",
  "provider_engine": "cloudflare_speedtest",
  "floor_id": "f47ac10b-...",
  "download_mbps": 184.2,
  "upload_mbps": 42.6,
  "latency_ms": 11.4,
  "jitter_ms": 1.8,
  "packet_loss_pct": 0.0,
  "x_coord": 14.8,
  "y_coord": 21.9
}
```
- **Response 201 Created:**
```json
{
  "id": "st_456...",
  "status": "recorded",
  "vantage_point": "client_browser",
  "download_mbps": 184.2,
  "recorded_at": "2026-10-14T08:33:00Z"
}
```

---

## 6. AI Gateway Endpoints

### 6.1 Execute Diagnostic / Analysis Request
- **Endpoint:** `POST /api/v1/ai/generate`
- **Auth:** Bearer Token (NetworkAdmin or SuperAdmin)
- **Request Body:**
```json
{
  "category": "diagnostic",
  "prompt": "Analyze RF degradation on Floor 2: RSSI dropped to -82 dBm near room 204.",
  "requested_model": "llama-3.3-70b-versatile",
  "temperature": 0.2,
  "max_tokens": 512
}
```
- **Response 200 OK:**
```json
{
  "request_id": "req_ai_102938",
  "status": "success",
  "prompt_category": "diagnostic",
  "requested_model": "llama-3.3-70b-versatile",
  "verified_model": "llama-3.3-70b-versatile",
  "is_verified_execution": true,
  "fallback_detected": false,
  "duration_ms": 412,
  "output_text": "Identified co-channel interference and wall attenuation...",
  "tokens": {
    "prompt": 128,
    "completion": 84,
    "total": 212
  }
}
```

### 6.2 List Model Execution Records
- **Endpoint:** `GET /api/v1/ai/executions`
- **Response 200 OK:** Returns array of historical execution records with verified vs requested model details.

---

## 7. Automation & n8n Webhook Contracts

### 7.1 Dispatch System Event Webhook
- **Endpoint:** `POST /api/v1/automations/dispatch-test`
- **Auth:** Bearer Token (Admin)
- **Request Body:**
```json
{
  "event_type": "network.degradation",
  "severity": "warning",
  "payload": {
    "campus_name": "North Campus Engineering",
    "building_code": "NC-ENG",
    "floor_name": "Floor 2",
    "rssi_drop_dbm": -18.0,
    "affected_clients_count": 14
  }
}
```
- **Outbound HTTP to n8n Webhook URL:**
  - Headers:
    - `X-AirGrid-Signature: sha256=<hex_hmac>`
    - `X-AirGrid-Timestamp: 1728894720`
    - `X-AirGrid-Delivery-ID: f3e7c8a1-...`
    - `Content-Type: application/json`
  - Body:
```json
{
  "event_id": "evt_987...",
  "event_type": "network.degradation",
  "severity": "warning",
  "timestamp": "2026-10-14T08:35:00Z",
  "data": {
    "campus_name": "North Campus Engineering",
    "building_code": "NC-ENG",
    "floor_name": "Floor 2",
    "rssi_drop_dbm": -18.0,
    "affected_clients_count": 14
  }
}
```
