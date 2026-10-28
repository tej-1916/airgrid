# Resume AirGrid — Operational State & Handoff Guide

**Last Updated:** 2026-10-28  
**Current Branch:** `feat/airgrid-real-network-intelligence`  
**Latest Git Commit:** `31cfd12`  
**Test Suite State:** **199 passed, 0 failures, 0 warnings** (100% clean)  
**Database Migration Head:** `0012_campus_access_control` (clean on both `airgrid_test_db` and `airgrid_db`)  

---

## 1. Quick Verification Commands

From the repository root (`~/Projects/airgrid`):

```bash
# 1. Run all backend tests (must report 199 passed, 0 warnings)
apps/api/.venv/bin/python -m pytest

# 2. Check schema synchronization with PostgreSQL test DB
cd apps/api && AIRGRID_DATABASE_URL="postgresql+asyncpg://airgrid:airgrid_dev@127.0.0.1:5432/airgrid_test_db" .venv/bin/alembic check && cd ../..

# 3. Build frontend bundle (TypeScript + Vite)
npm --prefix apps/web run build

# 4. Run full 16-route isolated browser test suite (desktop + mobile viewports)
npm --prefix apps/web run dev -- --host 127.0.0.1 --port 5187 &
VITE_PID=$!
AIRGRID_PLAYWRIGHT_MODULE=~/.npm/_npx/9833c18b2d85bc59/node_modules/playwright node docs/verification/verify_final.cjs
kill $VITE_PID
```

---

## 2. Completed Scope Overview

1. **FreeLLMAPI & AI Gateway Integration:**
   - Provider adapter supports configurable base URL, API key, model selection, latency measurement, and runtime model discovery.
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

4. **Complete Operational Views (Light Theme):**
   - `/devices`: Linux collector management (register, rotate secret, revoke, inspect observations) and access point inventory.
   - `/monitor`: Historical trends (RSSI, bitrates, gateway latency, BSSID roam detection, speed test logs) with 24h/7d/30d filtering.
   - `/ai-models`: Provider status cards, live connection test, runtime model selector, and privacy boundaries.
   - `/alerts`: Deterministic findings inbox with severity/category filters, ground-truth safeguards, and direct links to diagnostic audit reports.
   - `/reports`: Unified archive for diagnostic audits, survey sessions, and optimization plans with printable views and JSON export.
   - `/settings`: Platform settings, PostgreSQL engine telemetry, and measurement guardrails.

---

## 3. Real Provider & Real Hardware Execution (For the Operator)

### A. Live FreeLLMAPI Connection Test
If an active FreeLLMAPI key is available:
1. Set the environment variable in `apps/api/.env`:
   ```bash
   AIRGRID_AI_GATEWAY_URL="https://api.freellmapi.com/v1"
   AIRGRID_AI_API_KEY="your-actual-api-key"
   AIRGRID_AI_DEFAULT_MODEL="deepseek-chat"
   ```
2. Navigate to `http://localhost:5173/ai-models`.
3. Click **Test Connection**. Verify latency and discovered models.
4. Open `/ai-analyst` and ask questions against a recorded diagnostic report with Gateway toggle enabled.

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
