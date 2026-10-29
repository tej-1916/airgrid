# AirGrid Full-Stack System Debugging & Repair Report
**Date:** 2026-10-29  
**Branch:** `feat/airgrid-real-network-intelligence`  
**Latest Git Commit:** `7756e94`  
**Harness / Assistant:** Antigravity CLI (`agy`)  
**Overall System State:** Healthy · 202 Backend Tests Passed · 16 of 16 Browser Routes Operational · FreeLLMAPI Connected

---

## 1. Executive Summary

This investigation conducted an exhaustive audit of the AirGrid codebase across backend processes, environment configuration, FreeLLMAPI routing, UI state synchronization, and browser test automation. All reproducible defects were systematically investigated to identify root causes, safely repaired, validated against live endpoints, and regression-tested without introducing mock implementations or deleting existing functionality.

---

## 2. Issues Discovered & Confirmed Root Causes

| Issue | Observation | Root Cause | Resolution |
| :--- | :--- | :--- | :--- |
| **1. Stale Process on Port 8000** | Port 8000 occupied; second uvicorn startup failed with `[Errno 98] address already in use`. | Uvicorn process (PID 1421605) was started at 10:20:37 from an earlier session before `apps/api/.env` was saved at 10:33. The process was running with empty/stale environment variables. | Gracefully stopped PID 1421605 via SIGTERM; started a clean AirGrid API daemon loading `apps/api/.env`. |
| **2. AI Gateway Displayed "Unconfigured"** | `/ai-models` and `GET /api/v1/health` reported AI Gateway unconfigured despite valid `.env`. | Process PID 1421605 was launched prior to `.env` update. The running backend had `AIRGRID_AI_ENABLED=False` and empty API URL/Key in memory. | Backend restarted with current `.env`; `detailed_health()` updated to report actual gateway probe status. |
| **3. Config Key Discrepancy** | `AIRGRID_AI_GATEWAY_URL` was referenced in documentation, but backend only looked for `AIRGRID_AI_API_BASE_URL`. | Pydantic `Settings` was missing `validation_alias` / alias choices for `AIRGRID_AI_GATEWAY_URL`, ignoring it when set under that name. | Configured `AIRGRID_AI_API_BASE_URL` with `AliasChoices("AIRGRID_AI_API_BASE_URL", "AIRGRID_AI_GATEWAY_URL", ...)` in `airgrid.core.config`. |
| **4. Rogue JSX in Model Discovery List** | AI Models page rendered corrupted state in list if loading state fluctuated. | `apps/web/src/pages/AIModelsPage.tsx` contained an accidental duplicate `if (loading) return (...)` block nested inside the `status.available_models.map(...)` JSX callback. | Removed the duplicate loading block from the map callback, restoring clean model list rendering. |
| **5. Stale Phase 02 / 03 Labels in Dashboard** | Dashboard showed "Phase 02 Focus" and "Phase 03 Upcoming" even though Phases 03 through 07 are implemented. | Static roadmap widget in `DashboardPage.tsx` had not been promoted to reflect current audited project capabilities. | Updated roadmap widget with accurate status categories: *Verified with automated tests* (Core, Campus, ML, AP Opt), *Requires real-device validation* (Speed Test, Linux Collector), and *Implemented & Verified* (AI Gateway). |
| **6. Hardcoded Phase Badges Across UI** | Badges in `Header.tsx`, `SpeedTestPage.tsx`, `NetworkDiagnosticsPage.tsx`, `CampusesPage.tsx`, `LoginPage.tsx`, and `LandingPage.tsx` displayed legacy phase numbers. | Legacy milestone badges from early implementation stages remained hardcoded in template markup. | Updated to descriptive capability badges: `Operational · 16 Routes Active`, `Throughput & Latency Engine`, `HMAC Telemetry Ingestion`, and `Production Access Control`. |
| **7. Health Endpoint Out of Sync with Probes** | `GET /api/v1/health` always reported `"configured_unchecked"` even after successful `/models` probe. | `detailed_health()` checked only `is_configured()` and did not inspect `ai_gateway.last_health_check`. | Updated `detailed_health()` to reflect `ai_gateway.last_health_check["status"]` (e.g. `available`). Added initial non-blocking gateway health probe during application `lifespan` startup. |
| **8. Gateway Model Selection Rejection** | Switching models required model ID to be present in advertised discovery list or match default. | By design, `select_model()` rejects unadvertised identifiers. Because initial health check had not run, `available_models` was empty until explicitly probed. | Lifespan probe populates 288 discovered models at boot, enabling immediate model selection without pre-probe requirement. |

---

## 3. Backend Process & Port Status

- **Port 8000 (`airgrid-api`):** Running clean daemon process. Single uvicorn server on `127.0.0.1:8000`.
- **Port 5173 (`airgrid-web`):** Running Vite development server on `127.0.0.1:5173`, proxying `/api` and `/healthz` to `http://127.0.0.1:8000`.
- **Port 3001 (`FreeLLMAPI`):** Unified LLM router listening on `127.0.0.1:3001`.
- **Port 5432 (`PostgreSQL`):** PostgreSQL database engine active, serving `airgrid_db` and `airgrid_test_db`.

---

## 4. FreeLLMAPI Integration & Live Inference Verification

### Authenticated Model Discovery
- **Endpoint:** `GET http://127.0.0.1:3001/v1/models`
- **Authentication:** `Bearer [REDACTED]` (configured in `apps/api/.env`)
- **HTTP Status:** `200 OK`
- **Total Discovered Models:** 288 models
- **Supported Auto Router:** First advertised model is `"auto"` (`Auto (router picks the best available model)`).
- **Latency:** ~100–140 ms

### Live Non-Sensitive Inference Test
- **Prompt:** `"Reply with one word: CONFIRMED"`
- **Category:** `diagnostic`
- **Consent Flag:** `allow_external=True`
- **Requested Model:** `auto`
- **Execution Outcome:** `status: success`
- **Verified Provider Model:** `dots-studio/dots-3-note-preview:free` (and `qwen/qwen3.8-27b`)
- **Response Output:** `CONFIRMED`
- **Redaction Verification:** Validated that configured API keys are never echoed in response payloads or output text.

### Privacy Gate & Consent Enforcement
- **Without Consent (`allow_external=False`):** Immediately rejected with `status: consent_required` and message: `"Explicit approval is required before sending this request to the configured provider."` No outbound network traffic emitted.
- **Citation Enforcement:** `AnalystService` strictly validates that all referenced finding IDs in LLM outputs exist in stored telemetry. Hallucinated finding IDs trigger `rejected_unsupported_output`.

---

## 5. Automated Test Suite & Production Build Results

### Backend (pytest)
- **Suite Command:** `apps/api/.venv/bin/python -m pytest`
- **Total Tests:** **202 passed, 0 failures, 0 warnings**
- **Execution Time:** ~76 seconds
- **New Regression Tests:** Added `apps/api/tests/test_freellmapi_integration.py` (3 tests covering setting alias choices, unavailable provider fallback, and live FreeLLMAPI discovery/inference).

### Database Schema (Alembic)
- **`airgrid_db` (Development):** Migration head `0012_campus_access_control`, `No new upgrade operations detected.`
- **`airgrid_test_db` (Isolated Test):** Migration head `0012_campus_access_control`, `No new upgrade operations detected.`

### Frontend Production Build
- **Build Command:** `npm --prefix apps/web run build`
- **TypeScript (`tsc -b`):** 0 errors.
- **Vite Production Bundler:** 1,632 modules transformed, built in 3.55s.

### Browser Acceptance Tests (Playwright)
- **Script:** `docs/verification/verify_final.cjs`
- **Viewports Tested:** Desktop (`1440x900`), Mobile (`390x844`)
- **Routes Verified (16 of 16):**
  1. `/` (Landing Page)
  2. `/auth/login` (Login View)
  3. `/dashboard` (Command Center)
  4. `/campuses` (Campus & Building Manager)
  5. `/speed-test` (Network Speed Test Lab)
  6. `/heatmaps` (Wi-Fi Heatmap Studio)
  7. `/devices` (Device & Access Point Manager)
  8. `/monitor` (Live Network Monitor)
  9. `/diagnostics` (Network Diagnostics)
  10. `/ai-models` (AI Model Control Center)
  11. `/ai-analyst` (AirGrid Analyst)
  12. `/optimization` (Network Optimization Studio)
  13. `/ml-lab` (ML Prediction Lab)
  14. `/alerts` (Alerts & Notifications)
  15. `/reports` (Analytics & Reports)
  16. `/settings` (Settings & Administration)
- **Page Errors:** 0
- **Live Interaction Script:** `docs/verification/verify_live_ai_models.cjs` successfully logged in, clicked "Test Connection", verified the green success alert banner, and captured desktop/mobile screenshots.

---

## 6. Security & Privacy Audit Findings

1. **Secret Isolation:** API keys, collector secrets, and session hashes are strictly server-side. No `.env` exposure or secret leaks in frontend bundles or API responses.
2. **Access Control:** Verified campus-scoped IDOR protection for non-administrators via `CampusMembership` (`0012_campus_access_control`).
3. **Anti-CSRF:** Double-token pattern enforced on state-changing requests (`POST /api/v1/ai/health`, `POST /api/v1/ai/select-model`, `POST /api/v1/ai/generate`).
4. **Rate Limiting:** Sliding-window login rate limiting and per-process 10 req/min AI gateway limiter active.
5. **Replay Protection:** Linux collector ingestion requires HMAC-SHA256 signatures with timestamp window check and nonce deduplication.

---

## 7. Git Checkpoints

- **Commit `7756e94`:** `fix(system): resolve backend port conflict, verify FreeLLMAPI router, and update roadmap labels`
- **Preserved History:** Clean linear continuation from `3e88504`.

---

## 8. Open Items & Operator Actions Needed

1. **Physical Wi-Fi Hardware Ingestion:** Real Linux collector telemetry ingestion has passed all unit and fixture tests. To ingest genuine hardware measurements, run `python -m airgrid.cli.collector --collect --submit` from an authorized Linux host with a registered collector secret.
2. **Campus Field Calibration:** Floor plans currently use pixel scale calibration; field surveyor placement of physical AP coordinates provides ground-truth RF verification.
