# AirGrid Real Network Intelligence Acceptance Report
## Phase 1: Local Collector Configuration, Verification & Authorized Telemetry Storage

**Repository:** `~/Projects/airgrid`  
**Branch:** `feat/airgrid-real-network-intelligence`  
**Timestamp:** `2026-10-29T14:26:00+05:30`  
**Host:** `test-host` (Arch Linux / Linux 6.12 kernel, KDE NetworkManager)

---

## 1. Executive Summary & Root Cause Analysis

### 1.1 The Original Problem
When attempting to run telemetry collection via the **Collect Network Data** workflow on the Network Diagnostics page (`http://127.0.0.1:5173/diagnostics`), the UI displayed:
> *"Backend collector disabled by host configuration."* (or *"Backend collector disabled. Operator must enable AIRGRID_COLLECTOR_ENABLED on the authorized host."*)

### 1.2 Root Cause
1. **Design Safeguard Default:** In [`apps/api/src/airgrid/core/config.py`](file:///home/teju/Projects/airgrid/apps/api/src/airgrid/core/config.py), `AIRGRID_COLLECTOR_ENABLED: bool = False` is deliberately defaulted to `False` so that unattended test suites and distributed production nodes do not probe local interfaces without explicit host-level operator enablement.
2. **Missing Local Host Configuration:** The local development environment file `apps/api/.env` did not define `AIRGRID_COLLECTOR_ENABLED`.
3. **Endpoint Gate Enforcement:** [`apps/api/src/airgrid/api/v1/endpoints/diagnostics.py`](file:///home/teju/Projects/airgrid/apps/api/src/airgrid/api/v1/endpoints/diagnostics.py) and [`apps/api/src/airgrid/services/diagnostic_service.py`](file:///home/teju/Projects/airgrid/apps/api/src/airgrid/services/diagnostic_service.py) enforce `if not settings.AIRGRID_COLLECTOR_ENABLED: raise HTTPException(status_code=409, detail=...)`. Consequently, `GET /api/v1/diagnostics/interfaces` and `POST /api/v1/diagnostics/collect` returned HTTP 409 Conflict.

---

## 2. Safe Collector Enablement (Host-Level Environment)

### 2.1 Configuration Strategy
Per safety guidelines, the secure code default (`AIRGRID_COLLECTOR_ENABLED: bool = False` in `config.py`) was preserved. Local host enablement was performed via the git-ignored local environment:
- Added `AIRGRID_COLLECTOR_ENABLED=true` to `apps/api/.env`.
- Gracefully restarted the AirGrid API server on `127.0.0.1:8000` (PID 1687273).
- Verified that `GET /api/v1/diagnostics/interfaces` now returns HTTP 200 OK with dynamically discovered wireless interface `wlp0s20f3` on host `test-host`.

### 2.2 Security Controls Verified
- **Authentication Enforcement:** Unauthenticated requests to `/api/v1/diagnostics/interfaces` and `/api/v1/diagnostics/collect` return HTTP 401 Unauthorized (`assert r.status_code == 401`).
- **Role-Based Access Control:** Collector endpoints require engineer or administrator roles (`require_engineer_or_admin`).
- **Operator Consent Enforcement:** Requests to `/api/v1/diagnostics/collect` without `operator_consent: true` return HTTP 400 Bad Request with `"Explicit operator authorization is required to collect live network telemetry."`.
- **Zero Passive Background Probing:** Active ping probes (`include_gateway_ping`) and LAN throughput tests (`iperf_target_host`) default to off. Speed tests are never initiated automatically.
- **Privacy Protections:** Zero network scanning (`nmcli --rescan no`), zero packet capture, zero password access.

---

## 3. UI Collection Workflow & Scope Safeguards

In [`apps/web/src/components/diagnostics/OperatorConsentModal.tsx`](file:///home/teju/Projects/airgrid/apps/web/src/components/diagnostics/OperatorConsentModal.tsx):
- **Measuring Host Identification:** Explicitly displays the target measuring device (`test-host`) and detected Wi-Fi interface (`wlp0s20f3`).
- **Active SSID Transparency:** Displays the active connected network (`Synthetic_Campus_WiFi`).
- **Target Facility Association Control:** Added facility selection dropdown allowing the operator to select:
  - `None (Standalone Audit)` (prevents erroneous institutional campus tagging)
  - Or an authorized campus from registered facilities.
- **Cal Tech Misassociation Prevention:** If `Cal Tech Campus` is selected while connected to a different wireless network (`Synthetic_Campus_WiFi`), the modal renders an explicit amber notice warning that the active network does not belong to Cal Tech Campus.

---

## 4. Authorized Real Measurement Collection & Database Storage

Following explicit operator authorization, one genuine read-only measurement was collected from `wlp0s20f3` using **Option A: None (Standalone Audit)**:

### 4.1 Stored Measurement Attributes (`airgrid_db`)
- **Record ID:** `81c7bcc9-e194-428c-a467-87bcb9487e13`
- **SSID:** `Synthetic_Campus_WiFi`
- **Interface:** `wlp0s20f3`
- **BSSID:** `80:BC:37:8D:63:EC`
- **Signal Strength:** `-53.0 dBm` (Strong)
- **Frequency / Band:** `5540 MHz` (Channel 108, 5 GHz band, 40 MHz channel width)
- **Downlink PHY Bitrate:** `400.0 Mbps` (Negotiated dynamic link rate)
- **Uplink PHY Bitrate:** `360.0 Mbps` (Negotiated dynamic link rate)
- **Timestamp (UTC):** `2026-10-29 08:54:33.672035+00:00`
- **Data Provenance:** `instrumented_linux_telemetry`
- **Vantage Point:** `backend_server`
- **Campus ID:** `None` (Standalone Audit — zero cross-campus pollution)
- **Gateway Probe:** `None` (No ping probe executed)
- **Speed Test Link:** `None` (No speed test executed)

### 4.2 Historical Records Preservation
- Confirmed that all 13 historical `Synthetic_Other_AP` records in PostgreSQL `airgrid_db` remain completely intact, undamaged, and preserved.
- Zero existing reports or snapshots were deleted or overwritten.

---

## 5. Acceptance Verification Summary

| Milestone | Status | Details |
| :--- | :--- | :--- |
| **1. Collector Configuration Fixed** | **PASSED** | `AIRGRID_COLLECTOR_ENABLED=true` in `apps/api/.env`; loaded by running backend; `/interfaces` returns 200 OK |
| **2. Local Connection Verified** | **PASSED** | `wlp0s20f3` dynamically detected; SSID `Synthetic_Campus_WiFi`, 5540 MHz, Ch 108, 5 GHz, -53 dBm |
| **3. Collection Permission Verified** | **PASSED** | Auth enforced (401 on unauthenticated); consent enforced (400 when `operator_consent=false`) |
| **4. New Reading Collected with Approval** | **PASSED** | Authorized read-only collection executed from interface `wlp0s20f3` with Option A (Standalone Audit) |
| **5. Reading Stored Successfully** | **PASSED** | Snapshot `81c7bcc9-e194-428c-a467-87bcb9487e13` persisted to `NetworkTelemetrySnapshot` in `airgrid_db` |
| **6. Reading Retrieved Correctly** | **PASSED** | Querying `/live-connection` and database verifies all physical parameters, bitrates, and timestamps |
| **7. History Preserved** | **PASSED** | All 13 historical `Synthetic_Other_AP` records intact in `airgrid_db`; zero records overwritten or deleted |
| **8. Automated Tests Passed** | **PASSED** | Pytest: **205 passed** (0 failures, 0 warnings); Frontend: built clean in 4.09s; Playwright: **16/16 routes passed** |

---

## 6. Verification Artifacts & Screenshots
- [`live_diagnostics_jain_collected_desktop.png`](file:///home/teju/Projects/airgrid/docs/verification/screenshots/live_diagnostics_jain_collected_desktop.png): Live browser view of `/diagnostics` with active `Synthetic_Campus_WiFi` telemetry.
- [`live_diagnostics_jain_collected_mobile.png`](file:///home/teju/Projects/airgrid/docs/verification/screenshots/live_diagnostics_jain_collected_mobile.png): Mobile 390px viewport view.
- [`operator_consent_modal_verified.png`](file:///home/teju/Projects/airgrid/docs/verification/screenshots/operator_consent_modal_verified.png): Operator consent modal with interface and campus scope controls.
