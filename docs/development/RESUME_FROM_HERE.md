# Resume AirGrid — Operational State & Handoff Guide

**Last Updated:** 2026-11-05  
**Current Branch:** `feat/airgrid-real-network-intelligence`  
**Checkpoint Commit:** `2e9b62f`  
**Test Suite State:** **212 passed, 0 failures, 0 warnings** (100% clean)  
**Database Migration Head:** `0012_campus_access_control` (clean on both `airgrid_test_db` and `airgrid_db`)  
**Milestone Status:**
- Milestone 1: Real Network Intelligence (Verified & Completed)
- Milestone 2: Real AI Intelligence (Verified & Completed)
- Milestone 3A: Real Speed Testing (Verified & Completed)
- Milestone 3B: Real Wi-Fi Heatmaps (Software & Automated Verification COMPLETED; Physical Field Validation PENDING OPERATOR FIELD SURVEY)

---

## 1. Quick Verification Commands

From the repository root (`~/Projects/airgrid`):

```bash
# 1. Run all backend tests (must report 212 passed, 0 failures)
apps/api/.venv/bin/python -m pytest

# 2. Check schema synchronization with PostgreSQL test DB
cd apps/api && .venv/bin/alembic check && cd ../..

# 3. Build frontend bundle (TypeScript + Vite)
npm --prefix apps/web run build

# 4. Run full 16-route isolated browser test suite (desktop + mobile viewports)
npm --prefix apps/web run preview -- --port 5199 --host 127.0.0.1 &
VITE_PID=$!
NODE_PATH=/home/teju/.local/lib/node_modules/@playwright/cli/node_modules AIRGRID_BROWSER_URL=http://127.0.0.1:5199 node docs/verification/verify_heatmaps_e2e.cjs
kill $VITE_PID
```

---

## 2. Launching the Repaired Application

### Start the Backend API (Port 8000)
Ensure port 8000 is free (no competing duplicate processes) and start the backend from `apps/api`:
```bash
cd apps/api
.venv/bin/python -m uvicorn airgrid.main:app --host 127.0.0.1 --port 8000
```
*Note: The API automatically verifies database connectivity and performs an initial discovery probe to the configured FreeLLMAPI gateway at startup.*

### Start the Frontend Dev Server (Port 5173)
```bash
cd apps/web
npm run dev -- --host 127.0.0.1 --port 5173
```
*Access the application in your browser at `http://127.0.0.1:5173`.*

---

## 3. Completed Scope Overview

1. **Milestone 3B: Real Wi-Fi Heatmaps (Completed):**
   - **Calibrated Coordinate System:** Physical floor plan dimensions mapped to meters, preventing scaling distortions.
   - **Read-Only Live Wireless Telemetry:** Manually triggered capture (`POST /api/v1/surveys/{id}/measurements/collect-live`) querying Linux `iw` on `wlp0s20f3`. Records RSSI, channel, frequency, band, and negotiated PHY rates (`rx_bitrate_mbps`, `tx_bitrate_mbps`) linked to `NetworkTelemetrySnapshot` (`field_instrument_verified`).
   - **IDW Spatial Interpolation with Masks:** Power $p=2.0$, smoothing $\epsilon=0.5$ m, 18.0 m radial cutoff, and Andrew's Monotone Chain 2D convex hull with 4.0 m buffer. Areas beyond measured support are rendered completely transparent ("Unknown / Unmeasured Area").
   - **Leave-One-Out Cross-Validation (LOOCV):** Built-in empirical error estimation (`GET /api/v1/surveys/{id}/validation`) reporting MAE (dBm), RMSE, error distribution, and sparsity alerts.
   - **Audited Repositioning:** Interactive correction of misplaced points (`PATCH /api/v1/surveys/{id}/measurements/{id}/reposition`) with boundary validation and audit logging (`action="survey.measurement_repositioned"`).

2. **Milestone 3A: Real Speed Testing (Completed):**
   - Explicit architectural separation between Wi-Fi radio PHY link rates (e.g. 1200+ Mbps) and end-to-end TCP/HTTP internet throughput.
   - Hard duration boundary (<=10s) and bandwidth cap (<=150 MB) enforced via client-side deadline timers.
   - Standalone audit isolation and explicit operator consent modal before running tests.

3. **Milestone 2: Real AI Intelligence (Completed):**
   - FreeLLMAPI integration with dynamic discovery of models (`auto`, `deepseek-chat`, `llama-3.3-70b`).
   - Local deterministic analysis as default; explicit operator consent gate before outbound AI reasoning.
   - Evidence-grounded analyst with immutable audit trails.

4. **Milestone 1: Real Network Intelligence (Completed):**
   - Linux collector ingesting signed HMAC-SHA256 telemetry with replay protection.
   - Campus-scoped authorization (`0012_campus_access_control`) with role-based access control.
   - Preserved operational records in `airgrid_db`.

---

## 4. Real Site Survey Execution (For the Operator)

### A. Live Host Wireless Environment
* **Host Machine:** `ostra` (Linux 6.16 x86_64)
* **Wireless NIC Interface:** `wlp0s20f3` (Intel Wi-Fi 6 AX201, 802.11ax)
* **Current Associated SSID:** `MOJO-JAN-C2-F1`
* **Access Point BSSID:** `50:91:E3:75:8F:C3`
* **RF Channel & Band:** Channel 40 (5200 MHz, 160 MHz width, 5 GHz band)
* **Local Measured RSSI:** `-59.0 dBm` (Good / Commercial Quality)
* **Negotiated PHY Link Rates:** `576.4 Mbps RX / 244.9 Mbps TX`
* **Gateway & IP:** `172.16.0.1` / `172.16.0.110`

### B. Performing an Authorized Wi-Fi Survey
1. Navigate to `/heatmaps` (Wi-Fi Survey Studio).
2. Select an authorized campus, building, and calibrated floor plan.
3. Click **New Survey Session** to initialize an active session.
4. Physically position the measuring laptop at a target station.
5. Click on the floor plan canvas at that exact physical position.
6. Review the live telemetry displayed in the **Signal Measurement Panel** (SSID, BSSID, RSSI, and negotiated PHY rates).
7. Click **Capture Live Observation**. The point is persisted with provenance `field_instrument_verified`.
8. Repeat across 8 to 15 distributed stations on the floor (corridors, room centers, and corners).
9. Click **Generate Heatmap** to compute the IDW coverage grid with 18m radial mask and convex-hull enclosure.
10. Click **Run LOOCV** in the Survey Analysis Panel to verify empirical model accuracy (reporting MAE in dBm, RMSE, and sparsity warnings). Note that fewer than 5 points will trigger high sparsity warnings due to lack of surrounding spatial support during holdout.
