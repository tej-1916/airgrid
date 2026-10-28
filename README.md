# AirGrid

AirGrid records campus network measurements, maps operator Wi-Fi surveys, evaluates spatial RSSI models, and helps operators decide what to measure next. It uses measured values and explicit unavailable states. It does not automatically configure network infrastructure.

The application is a modular monolith: React **18**, TypeScript, Vite and Tailwind in `apps/web`; Python 3.12+, FastAPI, Pydantic, SQLAlchemy and Alembic in `apps/api`; PostgreSQL for application data. Shared TypeScript contracts live in `packages/shared-contracts`; the operator-run collector CLI lives in `packages/collector`.

## Current capabilities

| Route | Implemented behavior |
|---|---|
| `/` | Existing premium landing page |
| `/auth/login` | Argon2 passwords, server-side sessions, HttpOnly session cookies and CSRF protection |
| `/dashboard` | Database inventory counts and audit activity |
| `/campuses` | Campus/building/floor hierarchy, protected plan uploads and calibration |
| `/speed-test` | Operator-started Cloudflare browser throughput, latency and jitter tests; persisted history |
| `/heatmaps` | Survey sessions, manual observations, **placement of fresh instrument observations at an operator-chosen calibrated position**, history/comparison and IDW interpolation with spatial support masks |
| `/ml-lab` | Readiness with counts by source, KNN/Random Forest/HistGradientBoosting training, held-out evaluation, mean/IDW baselines, model history, prediction maps bound to the floor-plan version they were trained on |
| `/diagnostics` | Opt-in backend-host collector, **registered collectors with signed ingestion**, server-owned snapshot analysis, persisted trend charts, operator-applied retention, bounded gateway checks, allowlisted iperf, deterministic findings |
| `/ai-analyst` | Saved-report explanations, **evidence-cited answers to six question types**, same-source window comparisons, analysis history, consented and grounding-checked optional AI rephrasing with payload preview |
| `/optimization` | Network-specific survey opportunities, **saved versioned candidate plans**, **manual AP inventory**, nearest-registered-AP distance review, **measured before/after session comparison**, JSON/print export |

`/network-tools` and `/network-diagnostics` redirect to `/diagnostics`; `/ap-optimization` uses the optimization workspace. Other existing routes remain, including placeholder device, monitor, model-control, alert and report pages. Their navigation does not imply implemented monitoring or SLA reporting. See [route status](docs/architecture/FRONTEND_ROUTES.md).

## Measurement integrity and limitations

- Manual observations remain `operator_reported`. Controlled imports, estimates and predictions never become training or optimization evidence. `field_instrument_verified` survey points are created **only** by placing a fresh (≤ 15 min), complete, server-owned instrument snapshot at an operator-chosen position on a calibrated plan. Position is never inferred from signal strength or browser APIs.
- The application database currently has **zero instrument-verified survey observations** and no registered collectors. Operational ML training is therefore correctly unavailable; test models use isolated fixtures.
- ML evaluation holds out sessions or spatial blocks; ML, mean and IDW are compared on the same supported held-out points. Models record a floor-plan signature (floor, building, plan file, size, scale, calibration). Any change returns 409 and requires retraining; legacy models without a signature must be retrained.
- Backend-host measurements describe the **backend server**; registered-collector measurements describe the **collector host**; browser speed tests describe the **browser device**. Comparisons never pool sources, devices or methods.
- Browser-supplied telemetry is still accepted but always downgraded to `operator_reported`. The UI now analyzes server-owned snapshots by ID, so its reports keep instrument provenance.
- Diagnostics use documented heuristic thresholds and do not establish congestion, AP faults, WAN bottlenecks or causes from a single sample. The Analyst states missing evidence instead of guessing.
- Candidate AP markers are speculative annotations stored with versions and authors. No wall attenuation, transmit power, physical accessibility or numerical gain is inferred; registered APs are entered manually and unknown transmit power stays unknown.
- Retention never runs automatically. Administrators set a policy, preview the count and apply it with that count; snapshots linked to saved reports or survey points are protected.
- There is no per-user campus membership model: any authenticated user can read all campuses. Mutations are role-restricted (administrator / network_engineer) and CSRF-protected.
- Rate limits (login, AI gateway, iperf, collector ingest) are per process. A shared store is needed before running multiple API workers.
- Dedicated automation product routes/navigation are removed. Internal webhook signing remains for application infrastructure; no scheduled network actions are enabled.

## Local startup

Use the existing root `.env` as appropriate; never commit it. Configuration is read relative to the process working directory, so export required values when starting commands in a subdirectory. Keep the API on loopback for local development. `AIRGRID_SECRET_KEY` must be unique and ≥ 32 characters for collector credentials to be issued.

```bash
# Backend dependencies (existing uv.lock)
cd apps/api
uv sync --extra dev
# Inspect before applying migrations to a database with genuine data:
uv run alembic current
uv run alembic heads
uv run uvicorn airgrid.main:app --host 127.0.0.1 --port 8000
```

```bash
# Frontend, in another terminal
cd apps/web
npm ci
npm run dev
```

The default browser URL is `http://127.0.0.1:5173`. Liveness is `/healthz`; detailed health is `/api/v1/health`. `docker compose up -d` is available for local services. Migration head is **`0011_optimization_plans`**; migrations 0008–0011 are additive and were applied to the local application database after a `pg_dump` backup (see [completion progress](docs/development/CLAUDE_COMPLETION_PROGRESS.md)). `alembic check` is clean.

## Collector configuration

Two collection paths exist; both are disabled until an operator acts.

**Backend host (existing).** `AIRGRID_COLLECTOR_ENABLED=false` is the default. An operator must enable it on the authorized Linux host and explicitly initiate each collection in `/diagnostics`; consent and gateway probing start unchecked. Collection reads connected-interface status; `nmcli --rescan no` avoids surrounding-network scans. No root escalation or passwords are requested. Each collection is stored as a server-owned snapshot and analyzed by ID.

**Registered collectors (new).** An administrator registers a collector in `/diagnostics → Registered collectors`, optionally attributed to the selected floor, and receives a secret **once**. The secret is `HMAC(AIRGRID_SECRET_KEY, id:salt)` and is never stored, so a database dump does not reveal it. Each submission is signed over collector ID, Unix timestamp (±5 min), a single-use nonce and the SHA-256 of the exact body. Bodies are capped at 16 KiB and validated strictly (unknown fields rejected), replays are rejected with 409, and rate limits apply. Remote collectors must reach the API over HTTPS. Rotation and revocation are audited. A browser session cannot submit collector evidence.

```bash
# On the collector host, once per explicit collection (no background loop):
install -m 600 /dev/null ~/.config/airgrid-collector.json   # paste {"collector_id": "...", "secret": "..."}
AIRGRID_COLLECTOR_ENABLED=true apps/api/.venv/bin/python packages/collector/airgrid_collector.py \
  --collect --submit --credentials ~/.config/airgrid-collector.json --api-url http://127.0.0.1:8000
# --ping additionally authorizes up to 3 ICMP probes to the default gateway. Without --submit the reading is printed only.
```

Gateway probing accepts only the discovered default gateway, with at most five probes. iperf supports bounded TCP tests only to literal IPs explicitly listed in `AIRGRID_AUTHORIZED_IPERF_TARGETS` (empty by default). Tests are not scheduled or automatically repeated. Missing tools/permission errors do not become fabricated packet loss.

To turn a fresh observation into survey evidence, click its position in `/heatmaps` within 15 minutes and choose **Place instrument observation**.

## AI Gateway configuration

The default is disabled with no endpoint, approved model or key. Configure `AIRGRID_AI_ENABLED`, `AIRGRID_AI_API_BASE_URL`, `AIRGRID_AI_DEFAULT_MODEL` and, when required, `AIRGRID_AI_API_KEY` server-side. HTTPS endpoints and credential-free loopback local providers are supported. No paid model is required.

Every generation requires explicit per-request approval. Report prioritization sends only minimized metric values, severities and source IDs; provider output may only select existing finding IDs. For questions, `POST /api/v1/analyst/ask/preview` shows the exact outbound text (question, local answer, cited metric values/IDs/times; never network names, addresses, device names, plans or notes) and sends nothing. The provider may only rephrase. Answers citing unknown records, or stating any number absent from the evidence, local answer or question, are rejected and the local answer is shown. Model identity is provider-reported, not independently verified, and is stored in analysis history. Requests have a timeout, zero retries, a 1024-token completion cap and ten generations per minute per process.

## Verification

```bash
# Repository root: pytest forces airgrid_test_db before importing the app.
apps/api/.venv/bin/python -m pytest
npm --prefix apps/web run build
# Uses an installed/cached Playwright package and Chromium; no production API calls:
AIRGRID_PLAYWRIGHT_MODULE=/path/to/playwright node docs/verification/verify_phase_06.cjs
```

The browser script expects a frontend at `http://127.0.0.1:5187` (override `AIRGRID_BROWSER_URL`), intercepts API calls with labeled fixtures, and blocks external requests. Start it with `npm --prefix apps/web run dev -- --host 127.0.0.1 --port 5187`. It never logs in with production credentials, runs live probes, trains campus models or invokes external AI.

See [completion progress](docs/development/CLAUDE_COMPLETION_PROGRESS.md), [recovery instructions](docs/development/RESUME_FROM_HERE.md), [baseline evidence](docs/verification/AUTONOMOUS_BUILD_BASELINE.md) and [system architecture](docs/architecture/SYSTEM_ARCHITECTURE.md). Phase acceptance limits are in the Phase 05–08 handoffs; historical completion claims are not a substitute for these results.
