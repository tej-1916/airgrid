# AirGrid

AirGrid records campus network measurements, maps operator Wi-Fi surveys, evaluates spatial RSSI models, and helps operators decide what to measure next. It uses measured values and explicit unavailable states. It does not automatically configure network infrastructure.

The application is a modular monolith: React **18**, TypeScript, Vite and Tailwind in `apps/web`; Python 3.12+, FastAPI, Pydantic, SQLAlchemy and Alembic in `apps/api`; PostgreSQL for application data. Shared TypeScript contracts live in `packages/shared-contracts`.

## Current capabilities

| Route | Implemented behavior |
|---|---|
| `/` | Existing premium landing page |
| `/auth/login` | Argon2 passwords, server-side sessions, HttpOnly session cookies and CSRF protection |
| `/dashboard` | Database inventory counts and audit activity |
| `/campuses` | Campus/building/floor hierarchy, protected plan uploads and calibration |
| `/speed-test` | Operator-started Cloudflare browser throughput, latency and jitter tests; persisted history |
| `/heatmaps` | Survey sessions, manual observations, history/comparison and IDW interpolation with spatial support masks |
| `/ml-lab` | Readiness checks, KNN/Random Forest/HistGradientBoosting training, held-out evaluation, mean/IDW baselines, model history and prediction maps |
| `/diagnostics` | Opt-in Linux backend collector, bounded gateway checks, allowlisted iperf, persisted reports and deterministic findings |
| `/ai-analyst` | Local explanations of saved diagnostic reports, evidence references, printable report and optional constrained AI prioritization |
| `/optimization` | Floor/network-specific survey opportunities, weak observations, measurement plans, speculative AP markers, two candidate plans and JSON/print export |

`/network-tools` and `/network-diagnostics` redirect to `/diagnostics`; `/ap-optimization` uses the optimization workspace. Other existing routes remain, including placeholder device, monitor, model-control, alert and report pages. Their navigation does not imply implemented monitoring or SLA reporting. See [route status](docs/architecture/FRONTEND_ROUTES.md).

## Measurement integrity and limitations

- Manual observations remain `operator_reported`. Controlled imports and estimates are excluded from operational training and optimization evidence. Instrument-verified survey ingestion still needs an authenticated collector registration/import workflow.
- The inspected development dataset has **zero instrument-verified survey observations**. Operational ML training is correctly unavailable. Test models use isolated fixtures, not campus data.
- ML evaluation holds out sessions or spatial blocks. Comparisons use the same supported held-out points for ML, mean and the Phase 04 physical IDW baseline. Unsupported regions are masked. Small evaluations are not represented as statistically established quality.
- Artifact paths, checksums and scikit-learn versions are checked before loading locally generated model bytes. Legacy artifacts without those checks must be retrained. Artifacts and uploads are excluded from Git.
- Backend wireless measurements describe the **backend server**, not the browser device. Browser-supplied snapshots are downgraded to operator-reported evidence. An authenticated server-owned snapshot workflow remains open.
- Diagnostics use documented heuristic thresholds, timestamps, uncertainty and next checks. They do not establish congestion, AP faults, WAN bottlenecks or full network health from a single sample.
- Candidate AP markers are speculative annotations. No wall attenuation, physical accessibility, optimized placement or numerical gains are inferred. Plans live in the page and must be exported before navigation or changing scope.
- Collector registration, retention controls, telemetry trend charts, persisted candidate plans, broader cross-session/heatmap/ML reports and measured before/after analysis remain unfinished. Phase 05–08 handoffs distinguish these gaps from implemented slices.
- Dedicated automation product routes/navigation are removed. Internal webhook signing remains for application infrastructure; no scheduled network actions are enabled.

## Local startup

Use the existing root `.env` as appropriate; never commit it. Configuration is read relative to the process working directory, so export required values when starting commands in a subdirectory. Keep the API on loopback for local development.

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

The default browser URL is `http://127.0.0.1:5173`. Liveness is `/healthz`; detailed health is `/api/v1/health`. `docker compose up -d` is available for local services; this session did not rebuild or deploy containers. Migration head is `0007_network_diagnostics`; no new migration or destructive database action was run in this session.

## Collector configuration

`AIRGRID_COLLECTOR_ENABLED=false` is the default. An operator must enable it on the authorized Linux host and explicitly initiate each collection. The UI starts consent and gateway probing unchecked. Collection reads connected-interface status; `nmcli --rescan no` avoids surrounding-network scans. No root escalation or passwords are requested.

Gateway probing accepts only the discovered default gateway, with at most five probes. iperf supports bounded TCP tests only to literal IPs explicitly listed in `AIRGRID_AUTHORIZED_IPERF_TARGETS` (empty by default). Tests are not scheduled or automatically repeated. Missing tools/permission errors do not become fabricated packet loss.

The CLI reuses the API collector and its dependencies:

```bash
# Only the returning operator should enable and invoke real collection:
AIRGRID_COLLECTOR_ENABLED=true apps/api/.venv/bin/python packages/collector/airgrid_collector.py --collect --json
# --ping is an additional explicit opt-in; omitted by default.
```

## AI Gateway configuration

The default is disabled with no endpoint, approved model or key. Configure `AIRGRID_AI_ENABLED`, `AIRGRID_AI_API_BASE_URL`, `AIRGRID_AI_DEFAULT_MODEL` and, when required, `AIRGRID_AI_API_KEY` server-side. HTTPS endpoints and credential-free loopback local providers are supported. No paid model is required.

Every generation requires explicit per-request approval. The Analyst sends only minimized metric values, severities and source IDs, never labels, addresses, user notes or plans. Provider output can only select existing finding IDs; added claims and unknown references are rejected. Local findings remain available on failure. Model identity is provider-reported, not independently verified. Requests have a timeout, zero retries, a completion cap of 1024 tokens and a per-process cap of ten generation requests per minute. Multiple API workers need a shared limiter before wider deployment.

## Verification

```bash
# Repository root: pytest forces airgrid_test_db before importing the app.
apps/api/.venv/bin/python -m pytest
npm --prefix apps/web run build
# Uses an installed/cached Playwright package and Chromium; no production API calls:
AIRGRID_PLAYWRIGHT_MODULE=/path/to/playwright node docs/verification/verify_phase_06.cjs
```

The browser script expects a frontend at `http://127.0.0.1:5187` (override `AIRGRID_BROWSER_URL`), intercepts API calls with labeled fixtures, and blocks external requests. Start it with `npm --prefix apps/web run dev -- --port 5187`. It never logs in with production credentials, runs live probes, trains campus models or invokes external AI.

See [baseline evidence](docs/verification/AUTONOMOUS_BUILD_BASELINE.md), [current progress](docs/development/AUTONOMOUS_PROGRESS.md), [recovery instructions](docs/development/RESUME_FROM_HERE.md), and [system architecture](docs/architecture/SYSTEM_ARCHITECTURE.md). Current verification results and phase acceptance limits are recorded there; historical completion claims are not a substitute for these results.
