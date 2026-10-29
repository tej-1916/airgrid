# AirGrid Real Network Intelligence Acceptance Report
## Phase 1: Local Collector Configuration, Verification & Readiness

**Repository:** `~/Projects/airgrid`  
**Branch:** `feat/airgrid-real-network-intelligence`  
**Timestamp:** `2026-10-29T14:18:00+05:30`  
**Host:** `ostra` (Arch Linux / Linux 6.12 kernel, KDE NetworkManager)

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
- Verified that `GET /api/v1/diagnostics/interfaces` now returns HTTP 200 OK with dynamically discovered wireless interface `wlp0s20f3` on host `ostra`.

### 2.2 Security Controls Verified
- **Authentication Enforcement:** Unauthenticated requests to `/api/v1/diagnostics/interfaces` and `/api/v1/diagnostics/collect` return HTTP 401 Unauthorized (`assert r.status_code == 401`).
- **Role-Based Access Control:** Collector endpoints require engineer or administrator roles (`require_engineer_or_admin`).
- **Operator Consent Enforcement:** Requests to `/api/v1/diagnostics/collect` without `operator_consent: true` return HTTP 400 Bad Request with `"Explicit operator authorization is required to collect live network telemetry."`.
- **Zero Passive Background Probing:** Active ping probes (`include_gateway_ping`) and LAN throughput tests (`iperf_target_host`) default to off. Speed tests are never initiated automatically.
- **Privacy Protections:** Zero network scanning (`nmcli --rescan no`), zero packet capture, zero password access.

---

## 3. UI Collection Workflow & Scope Safeguards

### 3.1 Operator Consent Modal Enhancement
In [`apps/web/src/components/diagnostics/OperatorConsentModal.tsx`](file:///home/teju/Projects/airgrid/apps/web/src/components/diagnostics/OperatorConsentModal.tsx):
- **Measuring Host Identification:** Explicitly displays the target measuring device (`ostra`) and detected Wi-Fi interface (`wlp0s20f3`).
- **Active SSID Transparency:** Displays the active connected network (`Jain_Student`).
- **Target Facility Association Control:** Added facility selection dropdown allowing the operator to select:
  - `None (Standalone Audit)` (prevents erroneous institutional campus tagging)
  - Or an authorized campus from registered facilities.
- **Cal Tech Misassociation Prevention:** If `Cal Tech Campus` is selected while connected to a different wireless network (`Jain_Student`), the modal renders an explicit amber notice warning that the active network does not belong to Cal Tech Campus.

---

## 4. Current Read-Only Linux Hardware Inspection

Direct read-only inspection of the active Wi-Fi interface (`wlp0s20f3`) on `ostra`:
- **Connected SSID:** `Jain_Student`
- **Interface:** `wlp0s20f3`
- **BSSID:** `80:BC:37:8D:63:EC`
- **Frequency:** `5540 MHz` (Channel 108, 5 GHz band, 40 MHz channel width)
- **Signal Strength:** `-51.0 dBm` (Strong)
- **PHY Link Bitrates:** Negotiated dynamic link rate (~54.0–360.0 Mbps RX / 300.0–360.0 Mbps TX)
- **IP Address:** `172.20.193.203` (Default Gateway: `172.20.192.1`)
- **Data Provenance:** `live_system_probe` / `host_local`

---

## 5. Acceptance Verification Summary

| Milestone | Status | Details |
| :--- | :--- | :--- |
| **1. Collector Configuration Fixed** | **PASSED** | `AIRGRID_COLLECTOR_ENABLED=true` in `apps/api/.env`; loaded by running backend; `/interfaces` returns 200 OK |
| **2. Local Connection Verified** | **PASSED** | `wlp0s20f3` dynamically detected; SSID `Jain_Student`, 5540 MHz, Ch 108, 5 GHz |
| **3. Collection Permission Verified** | **PASSED** | Auth enforced (401 on unauthenticated); consent enforced (400 when `operator_consent=false`) |
| **4. New Reading Collected with Approval** | **BLOCKED** | *Awaiting explicit operator authorization before persisting operational measurements* |
| **5. Reading Stored Successfully** | **BLOCKED** | *Awaiting explicit operator authorization to store live measurement to PostgreSQL* |
| **6. Reading Retrieved Correctly** | **PASSED** | Live connection endpoint retrieves verified hardware status; historical reports retrieve with freshness tags |
| **7. History Preserved** | **PASSED** | All 4 historical `MOJO-JAN-C2-F1` reports intact in `airgrid_db`; zero records overwritten or deleted |
| **8. Automated Tests Passed** | **PASSED** | Pytest: **205 passed** (0 failures, 0 warnings); Frontend: built clean in 4.09s; Playwright: **16/16 routes passed** |

---

## 6. Exact Next Safe Action Needed

To collect and store one genuine operational measurement to `airgrid_db` for your currently connected Wi-Fi (`Jain_Student`), please confirm:
1. **Explicit Approval:** Approve executing one authorized collection from interface `wlp0s20f3`.
2. **Campus Association Choice:** Confirm whether you wish to associate this measurement as:
   - **Option A (Recommended):** `None (Standalone Audit)` — does not pollute "Cal Tech Campus" or any other campus with off-campus telemetry.
   - **Option B:** Associate with an existing campus (e.g., `Validation Campus`).
   - **Option C:** Register a new campus first (e.g., `Jain University Campus`).
