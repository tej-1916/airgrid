# Resume AirGrid — Operational State & Handoff Guide

**Last Updated:** 2026-10-29  
**Current Branch:** `feat/airgrid-real-network-intelligence`  
**Latest Git Commit:** `7756e94`  
**Test Suite State:** **202 passed, 0 failures, 0 warnings** (100% clean)  
**Database Migration Head:** `0012_campus_access_control` (clean on both `airgrid_test_db` and `airgrid_db`)  

---

## 1. Quick Verification Commands

From the repository root (`~/Projects/airgrid`):

```bash
# 1. Run all backend tests (must report 202 passed, 0 warnings)
apps/api/.venv/bin/python -m pytest

# 2. Check schema synchronization with PostgreSQL test DB
cd apps/api && AIRGRID_DATABASE_URL="postgresql+asyncpg://airgrid:airgrid_local_dev_secret@127.0.0.1:5432/airgrid_test_db" .venv/bin/alembic check && cd ../..

# 3. Build frontend bundle (TypeScript + Vite)
npm --prefix apps/web run build

# 4. Run full 16-route isolated browser test suite (desktop + mobile viewports)
npm --prefix apps/web run dev -- --host 127.0.0.1 --port 5187 &
VITE_PID=$!
AIRGRID_PLAYWRIGHT_MODULE=~/.npm/_npx/9833c18b2d85bc59/node_modules/playwright node docs/verification/verify_final.cjs
kill $VITE_PID

# 5. Run live browser validation on AI models and dashboard
AIRGRID_PLAYWRIGHT_MODULE=~/.npm/_npx/9833c18b2d85bc59/node_modules/playwright node docs/verification/verify_live_ai_models.cjs
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

1. **FreeLLMAPI & AI Gateway Integration:**
   - Provider adapter supports `AIRGRID_AI_API_BASE_URL` (with backward-compatible alias `AIRGRID_AI_GATEWAY_URL`), API key, model selection, latency measurement, and runtime model discovery.
   - Initial boot probe discovers 288 available models, dynamically advertising `auto` and specific router slots.
   - Operator can test connections and select active models at runtime via `/ai-models` or API `POST /api/v1/ai/select-model`.
   - Local deterministic analysis is preserved as default; unconfigured gateway is safe and non-blocking.
   - Consent modal requires operator confirmation before outbound requests leave AirGrid.

2. **Real Wi-Fi Measurement & Collector Telemetry:**
   - Registered collectors ingest signed Linux network telemetry using HMAC-SHA256 signatures with ±300s window and nonce deduplication.
   - Secrets are shown once upon creation and never stored or logged in plaintext.
   - Operator-controlled Linux CLI tool: `python -m airgrid.cli.collector --collect --submit`.
   - Ground truth segregation: only verified snapshots placed on calibrated floor plans count as `field_instrument_verified` measurements.

3. **Campus-Scoped Authorization (`0012_campus_access_control`):**
   - Non-administrators (`network_engineer`, `viewer`) are strictly scoped to assigned campuses via `CampusMembership`.
   - IDOR protection prevents cross-tenant access to floors, plans, surveys, diagnostic reports, and optimization plans.
   - Administrators retain global governance across all campuses.

4. **Complete Operational Views (16 of 16 Routes Operational):**
   - `/`: Landing page with operational showcase.
   - `/auth/login`: Argon2id authenticated session management with anti-CSRF protection.
   - `/dashboard`: Command Center with live PostgreSQL metrics and verified roadmap status.
   - `/campuses`: Campus, building, and floor plan hierarchy with 2-point pixel calibration.
   - `/speed-test`: Cloudflare Edge throughput and latency measurement.
   - `/heatmaps`: Interactive Wi-Fi Survey Studio and IDW signal propagation heatmap overlay.
   - `/devices`: Linux collector management and access point inventory.
   - `/monitor`: Historical telemetry trends with 24h/7d/30d filtering.
   - `/diagnostics`: Deterministic IEEE 802.11 diagnostics and gateway hop latency reports.
   - `/ai-models`: Provider status cards, live connection probe, runtime model selector, and privacy boundaries.
   - `/ai-analyst`: Grounded evidence analyst with citation checks and explicit outbound consent gate.
   - `/optimization`: Network RF optimization studio with AP placement recommendations.
   - `/ml-lab`: Machine learning prediction lab with multi-campus dataset readiness.
   - `/alerts`: Deterministic findings inbox with severity/category filters.
   - `/reports`: Unified archive with printable views and JSON export.
   - `/settings`: Platform settings, PostgreSQL engine telemetry, and measurement guardrails.

---

## 4. Real Provider & Real Hardware Execution (For the Operator)

### A. Live FreeLLMAPI Connection
The environment in `apps/api/.env` is configured for FreeLLMAPI:
```bash
AIRGRID_AI_ENABLED=true
AIRGRID_AI_PROVIDER=openai_compatible
AIRGRID_AI_API_BASE_URL=http://127.0.0.1:3001/v1
AIRGRID_AI_API_KEY="<unified-api-key>"
AIRGRID_AI_DEFAULT_MODEL=auto
```
1. Navigate to `http://127.0.0.1:5173/ai-models`.
2. Confirm Gateway State is **Configured** and Last Health Check shows **Available** with discovered models.
3. Click **Test Connection** to execute an active probe.

### B. Live Wi-Fi Collector Run
To collect authentic network telemetry from a Linux laptop:
1. Log in as Administrator and navigate to `/devices`.
2. Click **Register Collector**, name it (e.g., `Lab-ThinkPad`), and copy the displayed one-time secret.
3. On the Linux laptop with Wi-Fi enabled, run:
   ```bash
   export AIRGRID_COLLECTOR_ID="<collector-uuid>"
   export AIRGRID_COLLECTOR_SECRET="<one-time-secret>"
   export AIRGRID_API_URL="http://<server-ip>:8000"
   apps/api/.venv/bin/python -m airgrid.cli.collector --collect --submit
   ```
4. Verify the snapshot appears in `/devices` under observations and in `/diagnostics` under **Registered collectors**.
