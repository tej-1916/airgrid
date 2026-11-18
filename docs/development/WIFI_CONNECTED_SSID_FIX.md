# AirGrid Wi-Fi Connected SSID & Freshness Separation Report

## Executive Summary
This document provides full technical documentation for the resolution of the Wi-Fi connected SSID discrepancy on AirGrid's Network Diagnostics page (`/diagnostics`).

The operator is connected to the institutional Wi-Fi network **`Synthetic_Campus_WiFi`** on Arch Linux (KDE NetworkManager, interface `wlp0s20f3`), but AirGrid was displaying **`Synthetic_Other_AP`** (-62.0 dBm, 5 GHz, 960.7 Mbps RX, 864.6 Mbps TX, captured on October 28, 2026).

---

## 1. Root Cause Analysis

### 1.1 The Stored Historical Audit Data
Investigation into `airgrid_db` confirmed four historical `NetworkDiagnosticReport` and `NetworkTelemetrySnapshot` records created on October 28, 2026 at 05:03:22 UTC (10:33 AM IST) for SSID `Synthetic_Other_AP`. These records were legitimate, non-fabricated diagnostic audit records previously captured and stored by an operator.

### 1.2 Data Presentation Defect
In `apps/web/src/pages/NetworkDiagnosticsPage.tsx`:
On component mount, `fetchReports()` retrieved the latest report (`res.reports[0]`) from `/api/v1/diagnostics/reports` and executed:
```typescript
if (!activeReport && res.reports.length > 0) {
  setActiveReport(res.reports[0]);
  if (res.reports[0].telemetry) {
    setTelemetry(res.reports[0].telemetry);
  }
}
```
This historical telemetry snapshot (`Synthetic_Other_AP`) was then directly passed to `TelemetryLiveCard.tsx` as if it were the active wireless telemetry of the operator's current session.

Furthermore:
- `TelemetryLiveCard.tsx` lacked any concept or display of the genuine active Linux network link.
- `TelemetryLiveCard.tsx` did not display freshness badges or age indicators (such as `Stale (>5m)`).
- The system did not compare the historical observation against the currently connected network link or warn the operator of network mismatches.

---

## 2. Implemented Architecture & Solution

### 2.1 Backend Enhancements

1. **Active Wireless Hardware Probe (`TelemetryCollector`):**
   - Added `get_live_connection_status()` in [`telemetry_collector.py`](file:///home/teju/Projects/airgrid/apps/api/src/airgrid/services/telemetry_collector.py).
   - Dynamically identifies the connected wireless interface (`wlp0s20f3`), uses non-scanning, read-only `iw dev <iface> link` and `nmcli --terse --fields DEVICE,TYPE,STATE,CONNECTION device` without modifying Wi-Fi state or rescanning channels.
   - Extracts genuine live metrics: SSID (`Synthetic_Campus_WiFi`), BSSID, RSSI dBm, frequency, channel, channel width, band, RX/TX negotiated PHY rates, IP address, and default gateway.

2. **Pydantic Schemas (`schemas/diagnostics.py`):**
   - Added `LiveConnectionResponse` model.
   - Augmented `TelemetrySnapshotResponse` with `age_seconds`, `freshness` (`"fresh" | "aging" | "stale" | "unknown"`), and `freshness_label` (e.g., `"Fresh (<2m)"`, `"Aging (3m ago)"`, `"Stale (1d ago)"`).

3. **Freshness Categorization & Service Updates (`diagnostic_service.py`):**
   - Implemented `calculate_freshness(collected_at)`:
     - Age < 120s: `"fresh"`, label `"Fresh (<2m)"`
     - Age 120s–300s: `"aging"`, label `"Aging (Xm ago)"`
     - Age > 300s: `"stale"`, label `"Stale (Xm ago)"`, `"Stale (Xh ago)"`, or `"Stale (Xd ago)"`
   - Integrated freshness calculation into `snapshot_to_response()`.

4. **REST API Endpoint (`api/v1/endpoints/diagnostics.py`):**
   - Added `GET /api/v1/diagnostics/live-connection` returning `LiveConnectionResponse`.

5. **Network Mismatch Disclosure in AirGrid Analyst (`analyst_service.py`):**
   - Updated `AnalystService.analyze()` to check the host's current live Wi-Fi SSID.
   - If the report's telemetry SSID differs from the live connected SSID, Analyst automatically injects a prominent limitation notice disclosing the mismatch:
     > *"Network mismatch: Report describes historical network 'Synthetic_Other_AP', while this host is currently connected to 'Synthetic_Campus_WiFi'. Findings may not reflect the active wireless environment."*

---

### 2.2 Frontend UI Enhancements

1. **Frontend Service & Types (`types/diagnostics.ts`, `services/diagnosticsService.ts`):**
   - Added `LiveConnectionStatus` interface and freshness properties on `TelemetrySnapshot`.
   - Added `diagnosticsService.getLiveConnection()`.

2. **`NetworkDiagnosticsPage.tsx`:**
   - Introduced `liveConnection` and `loadingLive` state.
   - Automatically polls `fetchLiveConnection()` on mount and after running a new diagnostic probe.
   - Explicitly separates the active host connection state from the historical recorded report snapshot.

3. **Redesigned `TelemetryLiveCard.tsx`:**
   - **Section 1: Current Connected Network:**
     - Displays genuine real-time link information: SSID **`Synthetic_Campus_WiFi`**, BSSID, RSSI dBm, band (5 GHz), channel, channel width, RX/TX bitrates, and IP/gateway.
     - Pulsing green indicator with `"Live Active Link"` and `"Fresh (<2m)"` badge.
     - Dedicated `"Re-check Link"` button for quick non-intrusive re-querying of Linux network link status.
   - **Section 2: Network Mismatch Warning Banner:**
     - Displays an amber warning banner when the active Wi-Fi link differs from the loaded historical observation.
     - Features an instant action button: `"Audit Synthetic_Campus_WiFi"`.
   - **Section 3: Last Recorded Observation:**
     - Clearly displays the saved observation (`Synthetic_Other_AP`) with explicit `"Stale (1d ago)"` badge.
     - Prominent stale notice: *"Stale Observation Notice: Captured on 10/28/2026, 10:33:22 AM. Network conditions may have changed since this snapshot was recorded."*

---

## 3. Verification & Validation Evidence

### 3.1 Backend Pytest Suite
- **Total Tests Passing:** 205 (previously 202).
- **New Automated Tests:**
  - `test_calculate_freshness_logic`: unit verification of `<2m`, `2-5m`, and `>5m` thresholds.
  - `test_get_live_connection_endpoint`: verification of `GET /live-connection` schema and live probe output.
  - `test_analyst_network_mismatch_disclosure`: verification of automatic network mismatch disclosure when analyzing reports from a different SSID.
- **Pytest Exit Code:** `0` (Zero failures, zero warnings).

### 3.2 Frontend Compilation & Typecheck
- Executed `npm --prefix apps/web run build` (`tsc -b && vite build`).
- 1,632 modules transformed, built clean in 2.09s.

### 3.3 Live Browser Verification & Playwright Acceptance
- **Live Browser Screenshot:** Captured `/diagnostics` with active session.
  - Verified `Synthetic_Campus_WiFi` rendered in **Current Connected Network** section with `-58.0 dBm`, `5 GHz`, `Ch 132`, `324.0 Mbps` RX.
  - Verified `Network Mismatch Warning` rendered with warning notice.
  - Verified `Synthetic_Other_AP` rendered in **Last Recorded Observation** section with `Stale (1d ago)` badge.
- **Automated Playwright Acceptance (`verify_final.cjs`):**
  - All 16 routes verified across Desktop (`1440x900`) and Mobile (`390x844`) viewports.
  - Result: `passed` (0 errors, 0 overflows, 0 live probe violations, 26 external requests blocked).
- **Automated Playwright Phase 06 Acceptance (`verify_phase_06.cjs`):**
  - Result: `passed` (10 routes verified, 0 errors).

### 3.4 Data Integrity & Preservation
- All 4 historical `Synthetic_Other_AP` snapshots and reports in `airgrid_db` remain completely preserved.
- Alembic schema check: `No new upgrade operations detected`.
