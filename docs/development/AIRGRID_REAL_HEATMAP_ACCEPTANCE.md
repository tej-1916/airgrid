# AirGrid Milestone 3B: Real Wi-Fi Heatmaps Acceptance Report

**Date:** November 17, 2026  
**Branch:** `feat/airgrid-real-network-intelligence`  
**Checkpoint Commit:** `6740003`  
**Milestone:** Milestone 3B: Real Wi-Fi Heatmaps (Full-Stack Spatial Architecture, Genuine Read-Only Telemetry Integration, Inverse-Distance Weighting, Radial & Convex-Hull Masking, Leave-One-Out Cross-Validation, In-Studio Plan Setup & Outline Generation, Scale Calibration, and Operator Survey Workflow)  

### Status Breakdown:
* **Software Implementation:** **COMPLETED** (Full-stack API, IDW engine, LOOCV harness, canvas viewer, live telemetry probe, repositioning with audit trail, in-studio plan upload & dimensioned outline generation, in-studio scale calibration, point model prediction residual inspection, composite PNG export, 4-step workflow stepper).
* **Automated Verification:** **COMPLETED** (213 backend tests passed, TypeScript build clean, Playwright E2E passed on 1440×900 and 390×844 with 0 console errors, Alembic schema clean, operational `airgrid_db` preserved).
* **Physical Survey Workflow:** **PREPARED & VERIFIED READY** (Operator walk-through protocol, calibration prerequisites, live read-only telemetry capture from interface `wlp0s20f3` on `Synthetic_Other_AP`, LOOCV validation harness).
* **Genuine Spatial Validation:** **PENDING OPERATOR FIELD SURVEY** (Awaiting physical walk-through with real site floor plan and genuine physical measurements).
* **Overall Status:** **SOFTWARE & AUTOMATION VERIFIED (PHYSICAL FIELD SURVEY PENDING)**

---

## 1. Executive Summary

Milestone 3B establishes AirGrid's genuine spatial Wi-Fi heatmap and site-survey capability. It delivers an end-to-end workflow transforming authentic, authorized, spatially located physical wireless measurements into scientifically grounded floor-plan coverage maps without synthetic fabrication, packet capturing, credential interception, or unwarranted spatial extrapolation.

### Completed & Automated Quality Gates:
1. **Calibrated Coordinate & Spatial Scaling System:** Real-world dimensions (meters) mapped to floor plan pixels with strict coordinate boundary enforcement in [`FloorPlanSurveyCanvas.tsx`](../../apps/web/src/components/survey/FloorPlanSurveyCanvas.tsx) and [`survey_service.py`](../../apps/api/src/airgrid/services/survey_service.py).
2. **In-Studio Floor Plan Setup & Dimensioned Outline Generation:** Direct upload of authorized blueprints (PNG, JPEG, WebP) or instant generation of dimensioned calibrated floor outlines (`POST /api/v1/floors/{floor_id}/outline-plan`) using Pillow without requiring external graphic software.
3. **In-Studio Scale Calibration Tool:** Direct entry of known total floor width (meters) or 2-point reference line measurement right from the Survey Studio canvas.
4. **Read-Only Live Wireless Telemetry Capture:** Manually initiated capture (`POST /api/v1/surveys/{id}/measurements/collect-live`) querying active wireless interface (`wlp0s20f3`) via Linux `iw` and `NetworkManager`. Records genuine RSSI (dBm), channel, frequency (MHz), band, BSSID, and negotiated PHY bitrates (`rx_bitrate_mbps`, `tx_bitrate_mbps`) linked to a persistent `NetworkTelemetrySnapshot` with provenance `field_instrument_verified`.
5. **Rigorous Spatial Interpolation (IDW + Radial Cutoff + Convex Hull):** Inverse-distance weighting with power $p=2.0$, smoothing parameter $\epsilon=0.5$ m, an 18.0 m maximum influence radius, and Andrew's Monotone Chain 2D convex hull with a 4.0 m buffer. Areas beyond measured support are strictly masked (`null`) and rendered transparent on the canvas ("Unknown / Unmeasured Area") rather than colored as fake weak signal.
6. **Point Inspector Model Comparison:** Live side-by-side inspection of observed RSSI vs IDW interpolated prediction at selected stations with signed model residuals ($\Delta$ in dBm) and freshness timestamps.
7. **Interactive Repositioning with Immutable Audit Trail:** Enables operators to correct mistaken coordinate placements (`PATCH /api/v1/surveys/{id}/measurements/{id}/reposition`) with boundary validation and mandatory audit logging (`action="survey.measurement_repositioned"`).
8. **Leave-One-Out Cross-Validation (LOOCV):** Statistical model evaluation (`GET /api/v1/surveys/{id}/validation`) that systematically holds out individual observations, calculates interpolated predictions from remaining points, and reports empirical Mean Absolute Error (MAE in dBm), RMSE, signed error bounds, error distribution histograms, and sparsity alerts.
9. **Export Composite Heatmap PNG:** Direct client-side generation and download of complete high-resolution survey maps with floor plan, heatmap overlay, markers, and title block.
10. **4-Step Survey Workflow Stepper:** Clear visual progress indicators tracking Floor Plan readiness, Survey Session initialization, Point count thresholds (3 minimum for IDW, 8+ recommended for LOOCV), and Heatmap calculation status.
11. **Per-SSID Network Isolation:** Heatmaps segregate measurements by SSID to prevent mixing disparate networks.
12. **Production Verification & Test Baseline:** Full backend test suite passing with **213 tests** (0 failures, up from baseline 212), frontend TypeScript build passing with 0 errors, full-spectrum Playwright E2E browser verification at Desktop (1440 × 900) and Mobile (390 × 844) with 0 console errors, Alembic schema cleanly in sync, and operational database `airgrid_db` completely preserved.

---

## 2. Architecture & Data Flow

```mermaid
flowchart TD
    subgraph Host["Measuring Host (Arch Linux x86_64)"]
        NIC["Wi-Fi Interface: wlp0s20f3\nConnected: Synthetic_Other_AP / 5 GHz Ch 40\nPHY Link: 576.4 Mbps RX / 244.9 Mbps TX / -59 dBm"]
        Browser["AirGrid Survey Studio Client (Port 5173)\n/heatmaps route"]
        Canvas["FloorPlanSurveyCanvas\nCalibrated Scaling (px/m) & Zoom/Pan"]
        TelemetryPanel["SignalMeasurementPanel\nLive Telemetry Card & Capture Button"]
        AnalysisPanel["SurveyAnalysisPanel\nLOOCV Accuracy & MAE (dBm)"]
    end

    subgraph Backend["FastAPI Backend (Port 8000)"]
        SurveyAPI["Surveys Router (/api/v1/surveys)\ncollect-live / reposition / heatmap / validation"]
        Collector["TelemetryCollector\nRead-only 'iw dev wlp0s20f3 link' query"]
        IDWEngine["IDW Engine\np=2.0, epsilon=0.5m, 18m radial mask\nConvex Hull Perimeter Masking"]
        ValidationEngine["LOOCV Engine\nHoldout Prediction & MAE/RMSE"]
    end

    subgraph Storage["PostgreSQL airgrid_db / airgrid_test_db"]
        SnapTable[("network_telemetry_snapshots\n(field_instrument_verified)")]
        MeasTable[("survey_measurements\n(x, y, rssi, phy_rates, ap_ref)")]
        AuditTable[("audit_logs\n(live_recorded, repositioned, generated)")]
    end

    NIC <-->|"Read-Only Link Telemetry"| Collector
    Browser -->|"Operator places point"| Canvas
    Canvas -->|"Coordinates (X, Y)"| TelemetryPanel
    TelemetryPanel -->|"Operator triggers live capture"| SurveyAPI
    SurveyAPI --> Collector
    SurveyAPI --> SnapTable
    SurveyAPI --> MeasTable
    SurveyAPI --> AuditTable
    Browser -->|"Requests IDW Grid"| SurveyAPI
    SurveyAPI --> IDWEngine
    IDWEngine -->|"2D Grid with Masked Nulls"| Canvas
    Browser -->|"Run Validation"| SurveyAPI
    SurveyAPI --> ValidationEngine
    ValidationEngine -->|"MAE dBm & Error Buckets"| AnalysisPanel
```

---

## 3. Existing Operational Database & Floor-Plan Audit

An audit of the operational database (`airgrid_db`) reveals:

### Existing Campuses & Floor Plans:
1. **Cal Tech Campus** (`CAL-9ED9BA`):
   - Building: `Robotics Lab` (`ROB-1`)
   - Floor: `Upper Lab` (Level 2, ID: `fdfc9b0c-43dc-450d-a47e-6830013b3b4c`, 50×30 m)
   - Floor Plan Asset: `c9f75276-c3e7-4908-9092-b237b7360173` (1000×600 px, scale: 20.0 px/m, Calibrated: True)
   - Status: **Synthetic / Demo Fixture** (Created during early multi-tenant development).
2. **Cal Tech Campus** (`CAL-C5F0FD`):
   - Duplicate demo fixture from isolated test suite runs.
3. **North Engineering Campus** (`NEC-NORTH`):
   - Building: `Ada Lovelace Computing Center` (`ALC-01`)
   - Floor: `Level 1 - High-Density Labs` (Level 1, ID: `1fac63ec-befc-42d4-9862-a65018f002bf`, 60×40 m)
   - Floor Plan Asset: `7fe993f3-7199-4422-9afd-682dcc668237` (1200×800 px, scale: 20.0 px/m, Calibrated: True)
   - Status: **Synthetic / Demo Fixture** (Created for initial UI mockups).
4. **Validation Campus** (`VAL-338700`):
   - Minimal test campus with no floor plan image attached.

### Existing Survey Data in `airgrid_db`:
- **Session 1:** `Q3 Baseline Preliminary Survey` (Floor: `1fac63ec-befc-42d4-9862-a65018f002bf`, 5 points)
  - Network: `AirGrid-Legacy`
  - Provenance: `controlled_test_import` (Historical test fixture)
- **Session 2:** `Q4 High-Density Lab Signal Assessment` (Floor: `1fac63ec-befc-42d4-9862-a65018f002bf`, 8 points)
  - Network: `AirGrid-Lab-5G`
  - Provenance: `controlled_test_import` and `operator_reported`

### Finding on Real-World Ground Truth:
**None of the existing records in `airgrid_db` represent the physical building where the measuring device currently resides.** All existing records were preserved untouched as historical development assets.

For authentic physical acceptance, an authorized floor plan representing the actual building housing `Synthetic_Other_AP` must be provided and calibrated.

---

## 4. Live Measuring Host & RF Environment (Read-Only Status)

* **Host Machine:** `test-host` (Linux 6.16 x86_64)
* **Wireless NIC:** `wlp0s20f3` (Intel Wi-Fi 6 AX201, 802.11ax)
* **Connected SSID:** `Synthetic_Other_AP`
* **Access Point BSSID:** `02:00:5E:00:00:02`
* **Frequency & Channel:** 5200 MHz / Channel 40 (5 GHz Band, 160 MHz channel width)
* **Observed RSSI:** `-59.0 dBm` (Good / Commercial Quality)
* **Current Negotiated PHY Link Rates:** `576.4 Mbps RX / 244.9 Mbps TX`
* **Default Gateway:** `172.16.0.1`
* **IP Address:** `172.16.0.110`

*Inspection performed strictly via read-only `iw dev wlp0s20f3 link` and `nmcli`. Zero neighboring networks scanned; zero packets captured.*

---

## 5. Heatmap Reliability & Mathematical Boundaries

### Spatial Inverse-Distance Weighting (IDW) Formulation:
Expected signal $\hat{S}$ at grid cell $(x_c, y_c)$:

$$\hat{S}(x_c, y_c) = \frac{\sum_{i=1}^N \frac{\text{RSSI}_i}{(d_i + 0.5)^2}}{\sum_{i=1}^N \frac{1}{(d_i + 0.5)^2}}$$

* **Distance Decay:** Inverse-square decay ($p=2.0$).
* **Smoothing Factor:** $\epsilon = 0.5$ m (eliminates singular infinity at sample locations).
* **Radial Support Cutoff:** 18.0 meters. Any grid cell whose distance to the nearest physical observation exceeds 18 meters is marked `null` (masked).
* **Convex Hull Enclosure:** Andrew's Monotone Chain 2D algorithm constructs the minimal convex polygon encompassing all survey points, expanded by a $4.0$ m buffer. Cells outside this perimeter are masked.
* **Transparent Rendering:** Masked cells are rendered with alpha channel $=0$ (transparent canvas pixels), clearly communicating "Unknown / Unmeasured Area" to the operator rather than displaying misleading weak coverage.

### Sample Density & Reliability Thresholds:
* **Fewer than 3 points:** Heatmap generation is blocked (`HTTP 422: At least 3 measurements required`).
* **3 to 5 points:** Highly localized coverage; outer perimeter is predominantly masked. Cross-validation will flag high sparsity warnings because held-out points easily lose surrounding spatial support.
* **Recommended Genuine Sampling:** **8 to 15 distributed measurement points** across rooms and corridors. This produces a balanced convex hull with sufficient inner points to enable statistically meaningful Leave-One-Out Cross-Validation.

---

## 6. Real-World Operator Site Survey Protocol

When ready to conduct a physical survey, the operator follows this 10-step procedure:

1. **Select Authorized Floor:** Log in to AirGrid and navigate to `/heatmaps` (Wi-Fi Survey Studio). Select the authorized campus, building, and floor.
2. **Create New Survey Session:** Click **"New Survey Session"**, specify a descriptive session name (e.g., `Site Survey - Wing B Floor 2`), and initialize.
3. **Confirm Floor-Plan Dimensions:** Verify that the floor plan image matches the physical site and has calibrated scaling (pixels per meter). If not calibrated, use Campus Manager to set a known distance (e.g., measuring 15.0 meters between two architectural pillars).
4. **Mark Physical Measurement Position:** Physically walk to the first station (e.g., Northwest Corner Desk) carrying the measuring laptop (`test-host`). Click on the floor plan canvas at that exact position.
5. **Capture Current Connected-Wi-Fi Reading:** The **Signal Measurement Panel** opens, displaying real-time link parameters (`wlp0s20f3`, `Synthetic_Other_AP`, `-59 dBm`, PHY rates). Review and confirm accuracy.
6. **Save Reading with Real Provenance:** Click **"Capture Live Observation"**. AirGrid persists the measurement linked to a `NetworkTelemetrySnapshot` with provenance `field_instrument_verified` and logs an audit entry.
7. **Repeat at Distinct Authorized Positions:** Walk to 8–15 distributed locations across the floor (corridor center, conference rooms, perimeter offices), stationing the laptop at each spot before clicking.
8. **Generate Heatmap:** Once sufficient points are collected, click **"Generate Heatmap"** to compute the 2D IDW signal distribution.
9. **Run Leave-One-Out Validation:** In the Survey Analysis Panel, click **"Run LOOCV"** to calculate empirical holdout prediction accuracy.
10. **Inspect Error & Unsupported Regions:** Examine the reported MAE (dBm), RMSE, and error distribution bins. Verify that unsupported regions outside the walked path remain masked as unmeasured.

---

## 7. Milestone 3B Acceptance Scorecard

| Requirement | Description | Status | Evidence |
| :--- | :--- | :--- | :--- |
| **Coordinate System & Scaling** | Real-world distance scaling (meters) & pixel mapping | **PASS** | Validated in `FloorPlanSurveyCanvas.tsx` & `survey_service.py` |
| **In-Studio Plan Setup & Outlines** | Direct blueprint upload or dimensioned outline creation | **PASS** | Validated in `test_create_floor_outline_plan` & Playwright E2E |
| **In-Studio Scale Calibration** | Fast width-based & 2-point reference line calibration | **PASS** | Validated in `FloorPlanCalibrationModal.tsx` & E2E suite |
| **Real Wi-Fi Survey Workflow** | Read-only wireless link inspection via `iw`/`NetworkManager` | **PASS** | Live telemetry endpoint & `collect_live_measurement` tested |
| **PHY Link Rates in Surveys** | Negotiated RX/TX bitrates captured and displayed | **PASS** | Stored in `SurveyMeasurement` & shown in Point Inspector |
| **Point Inspector Model Comparison** | Side-by-side IDW prediction and signed residual (Δ) | **PASS** | Tested in `FloorPlanSurveyCanvas.tsx` & Playwright E2E |
| **Composite Heatmap Export** | High-res PNG export with floor plan, heatmap & legend | **PASS** | Tested in canvas export handler & Playwright E2E |
| **Workflow Progress Stepper** | 4-step progress tracking for operator site surveys | **PASS** | Verified in `SurveyHeader.tsx` & Playwright E2E |
| **Survey Session Management** | Create, view, point placement, finish, and retrieve | **PASS** | End-to-end flow validated in Playwright E2E |
| **IDW Spatial Interpolation** | $p=2.0$, $\epsilon=0.5$ m, 18m radius cutoff, convex hull | **PASS** | Evaluated in pytest suite and canvas rendering |
| **Masked Unknown Areas** | Transparent rendering for unsupported regions (>18m / hull) | **PASS** | Verified in `HeatmapOverlay.tsx` and Signal Legend |
| **Position Correction** | Reposition misplaced points with audit logging | **PASS** | Tested in `test_reposition_measurement_with_audit_trail` & UI |
| **Empirical Cross-Validation** | LOOCV holdout evaluation with MAE in dBm and RMSE | **PASS** | Tested in `test_leave_one_out_cross_validation` & UI |
| **SSID Segregation** | Per-network filtering to avoid mixing networks | **PASS** | Verified via `network_label` query parameters |
| **Audit & Provenance** | Immutable audit logs and `field_instrument_verified` | **PASS** | Recorded in `audit_logs` table for all mutations |
| **Backend Test Suite** | Full pytest regression suite | **PASS** | **213 passed in 98.99s (100% green)** |
| **Frontend Production Build** | TypeScript verification and Vite bundle | **PASS** | Built in 1.82s with 0 errors |
| **Browser Acceptance** | Desktop (1440x900) & Mobile (390x844) verification | **PASS** | Tested with Playwright, 0 console errors |
| **Data Preservation** | Operational `airgrid_db` completely untouched | **PASS** | 4 campuses, 4 floors, 3 assets, 2 sessions, 13 points, 41 speed tests, 14 snapshots verified |
| **Genuine Spatial Field Validation** | Real physical survey on authorized building floor plan | **PENDING** | **Awaiting operator upload of real floor plan & physical walk-through** |

---

### Final Milestone 3B Engineering Verdict:
**SOFTWARE IMPLEMENTATION & AUTOMATION VERIFIED; GENUINE PHYSICAL FIELD ACCEPTANCE PENDING OPERATOR WALK-THROUGH.**
