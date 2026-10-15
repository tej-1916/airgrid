# AirGrid Phase 03: Real Network Speed Test Lab Implementation Plan

> **For agentic workers:** REQUIRED SUB-SKILL: Use superpowers:subagent-driven-development (recommended) or superpowers:executing-plans to implement this plan task-by-task. Steps use checkbox (`- [ ]`) syntax for tracking.

**Goal:** Build and verify a production-grade Network Speed Test Lab that executes legitimate client-side bandwidth measurements via `@cloudflare/speedtest`, persists authenticated records to PostgreSQL, integrates with the campus spatial hierarchy, and adheres to strict safety, privacy, and visual guidelines.

**Architecture:** A provider-agnostic measurement engine in React (`SpeedTestProvider` adapter pattern) executes browser-direct speed tests against Cloudflare's edge with conservative payloads and `autoStart: false`. Completed results are validated by Pydantic schemas and persisted to PostgreSQL with user provenance and optional campus/building/floor associations. The UI renders in AirGrid's Premium Light Theme (`#F5F5F3` canvas, `#FFFFFF` cards, `#BE6B37` copper accent, `#0B0B0D` typography) with clear safety disclosures and historical analytics.

**Tech Stack:** React 18, TypeScript, `@cloudflare/speedtest`, Lucide React, FastAPI, SQLAlchemy 2 (asyncpg), Alembic, PostgreSQL 16, Pytest, Playwright CLI.

**Spec:** User prompt requirements in `docs/phases/PHASE_03_HANDOFF.md` & `AIRGRID_PHASE_03_PROMPT`.

## Global Constraints

- **Scope Boundary:** Implement Phase 03 only. Zero code for Phase 04 wireless surveying, Phase 05 ML, Phase 06 AI Gateway, Phase 07 n8n, or Phase 08 optimization.
- **Visual Identity:** Strict adherence to AirGrid Premium Light Theme (`#F5F5F3` primary, `#0B0B0D` typography, `#BE6B37` copper accents, `#FFFFFF` cards, `#D9DBDE` borders).
- **No Simulation:** No fake speed numbers, simulated progress ticks, synthetic RSSI/BSSID radio inference, or mock data presented as live telemetry.
- **Provider Transparency:** Clear disclosure that WAN measurement traffic flows between browser and Cloudflare edge; no backend secrets or user credentials sent to measurement endpoints.
- **Privacy Enforcement:** No public IP addresses or identifying network telemetry persisted in the database; client IP is omitted or hashed.
- **Safety Controls:** Conservative traffic caps, `autoStart: false`, pause/cancel support, single-active-test lock, and 10-second test cooldown.
- **RBAC & Data Provenance:** All speed test submissions marked as `client_reported`. Network Engineers and Viewers can measure; Campus & Building deletion/creation remains strictly restricted to Administrators.

## Review Focus

1. **Concurrent Test Collisions:** User or script triggers multiple tests simultaneously. Must be blocked by single-test state lock and disable action buttons during active runs.
2. **Aborted / Cancelled Measurements:** User cancels mid-test during download or upload phase. Must cancel active network requests, update status to `aborted`, and avoid hanging promises or zombie callbacks.
3. **Hierarchy Mismatch Rejection:** Client submits `floor_id` belonging to Building B while specifying Building A. Backend validator must detect mismatch and return HTTP 422 Unprocessable Content.
4. **Unsupported Metric Transparency:** Packet loss or loaded jitter may be unavailable or excluded (WebRTC TURN relay disabled for privacy). Interface must clearly display "Not measured" rather than inventing zero or default values.
5. **Session Expiry During Test:** User's cookie session expires while a 15-second test runs. Submission to backend returns HTTP 401; frontend must display friendly error and prompt re-login without crashing.

---

## Tasks

### Task 1: Audit Role Permissions & Database Schema Migration

**Files:**
- Modify: `apps/api/src/airgrid/models/all_models.py:246-268`
- Create: `apps/api/migrations/versions/0004_speed_test_enhancements.py`
- Modify: `apps/api/src/airgrid/models/__init__.py`
- Test: `apps/api/tests/test_database_schema.py`

**Steps:**
- [ ] Step 1.1: Document the audit of Phase 02 role-permission discrepancy (confirming `create_campus`, `create_building`, `delete_campus`, `delete_building` are restricted to `Administrator` via `require_admin`).
- [ ] Step 1.2: Extend `InternetSpeedTest` model in `all_models.py` with `user_id`, `campus_id`, `building_id`, `status`, `data_provenance`, `started_at`, `completed_at`, `duration_seconds`, `loaded_latency_ms`, `quality_metadata`, `client_user_agent`, `error_code`, `error_message`.
- [ ] Step 1.3: Create Alembic migration `0004_speed_test_enhancements.py` with forward and rollback DDL and apply with `alembic upgrade head`.
- [ ] Step 1.4: Update `test_database_schema.py` and run pytest to verify clean database migration.

### Task 2: Backend Speed Test Schemas, Service & API Endpoints

**Files:**
- Create: `apps/api/src/airgrid/schemas/speed_test.py`
- Modify: `apps/api/src/airgrid/schemas/__init__.py`
- Create: `apps/api/src/airgrid/services/speed_test_service.py`
- Create: `apps/api/src/airgrid/api/v1/endpoints/speed_tests.py`
- Modify: `apps/api/src/airgrid/api/v1/router.py`
- Create: `apps/api/tests/test_speed_test_endpoints.py`

**Steps:**
- [ ] Step 2.1: Define Pydantic request/response schemas (`SpeedTestCreate`, `SpeedTestResponse`, `SpeedTestListResponse`, `SpeedTestStatsResponse`) with bounds validation and campus hierarchy validation.
- [ ] Step 2.2: Implement `SpeedTestService` with methods for recording test results (`create_speed_test`), paginated history filtering (`list_speed_tests`), single test lookup (`get_speed_test`), and historical summary stats aggregation (`get_stats_summary`).
- [ ] Step 2.3: Implement FastAPI routes in `endpoints/speed_tests.py` with CSRF validation, session authentication, and audit logging.
- [ ] Step 2.4: Mount router in `apps/api/src/airgrid/api/v1/router.py`.
- [ ] Step 2.5: Write comprehensive pytest suite in `tests/test_speed_test_endpoints.py` covering validation bounds, hierarchy mismatch rejection, filtering, pagination, stats, and RBAC. Run `pytest -v` to confirm all pass.

### Task 3: Frontend Provider Adapter & Speed Test Service

**Files:**
- Create: `apps/web/src/types/speedTest.ts`
- Create: `apps/web/src/services/speedTestProvider.ts`
- Create: `apps/web/src/services/cloudflareSpeedTestAdapter.ts`
- Create: `apps/web/src/services/speedTestService.ts`
- Modify: `apps/web/src/services/api.ts`

**Steps:**
- [ ] Step 3.1: Define TypeScript interfaces in `types/speedTest.ts` (`SpeedTestMetrics`, `SpeedTestPhase`, `SpeedTestState`, `SpeedTestRecord`, `SpeedTestSummaryStats`).
- [ ] Step 3.2: Create provider adapter interface `SpeedTestProvider` in `speedTestProvider.ts` allowing pluggable test engines (Cloudflare now, LibreSpeed future).
- [ ] Step 3.3: Implement `CloudflareSpeedTestAdapter` in `cloudflareSpeedTestAdapter.ts` wrapping `@cloudflare/speedtest` with `autoStart: false`, conservative payloads, phase tracking, pause, resume, abort, and metric mapping.
- [ ] Step 3.4: Implement `speedTestService.ts` for API interactions (`saveSpeedTest`, `getSpeedTests`, `getSpeedTestStats`).

### Task 4: Frontend Speed Test Lab UI Implementation

**Files:**
- Rewrite: `apps/web/src/pages/SpeedTestPage.tsx`
- Modify: `apps/web/src/components/layout/Sidebar.tsx` (update badge for Speed Test to active Phase 03)

**Steps:**
- [ ] Step 4.1: Build Speed Test Lab header, provider selector (Cloudflare active, LibreSpeed planned), and client vantage point disclosure banner.
- [ ] Step 4.2: Build location association control reusing `CampusContext` (Campus -> Building -> Floor) with explicit operator acknowledgment checkbox.
- [ ] Step 4.3: Build real-time measurement cockpit: circular progress indicator, phase tracker (`Latency` -> `Download` -> `Upload` -> `Completed`), live throughput gauges (Download, Upload, Latency, Jitter, and explicit "Not measured" for Packet Loss).
- [ ] Step 4.4: Implement test control triggers: Start Test, Pause/Resume, Cancel/Abort, and 10-second cooldown timer.
- [ ] Step 4.5: Implement automated result persistence to `/api/v1/speed-tests` with success toast and persistence ID banner.
- [ ] Step 4.6: Implement historical test results table with campus/status filtering, summary statistics header cards, and detail modal for viewing raw metadata.
- [ ] Step 4.7: Update `Sidebar.tsx` badge for "Network Speed Test" from `P03` planned to active workspace.

### Task 5: Production Build, Testing & Playwright Verification

**Files:**
- Test: Full backend pytest suite (`pytest -v`)
- Build: Frontend production bundle (`npm run build --prefix apps/web`)
- Verify: Playwright CLI browser test script & screenshots in `docs/verification/screenshots/`

**Steps:**
- [ ] Step 5.1: Run full backend pytest suite (all 40 existing + new speed test tests) and verify 100% pass rate.
- [ ] Step 5.2: Run `npm run build --prefix apps/web` and verify clean TypeScript typechecking and Vite build.
- [ ] Step 5.3: Execute browser tests via Playwright CLI:
  - Verify Speed Test Lab loads with disclosures and location selector.
  - Test explicit location assignment (Campus, Building, Floor).
  - Test speed test execution, live metric updates, cancellation/pause, completion, and automatic backend persistence.
  - Verify historical table displays newly created test with client-reported provenance.
  - Verify detail modal inspects measurement metrics and metadata.
  - Verify responsive behavior on desktop and mobile viewports (390x844).
  - Capture verification screenshots for documentation.

### Task 6: Architectural Handoff & README Updates

**Files:**
- Create: `docs/phases/PHASE_03_HANDOFF.md`
- Modify: `README.md`

**Steps:**
- [ ] Step 6.1: Author `docs/phases/PHASE_03_HANDOFF.md` covering architecture, schemas, provider integration, privacy decisions, test evidence, browser screenshots, known limitations, and Phase 04 prerequisites.
- [ ] Step 6.2: Update `README.md` reflecting completed Phase 03 status.
- [ ] Step 6.3: Enforce stop condition (no Phase 04+ surveying or ML code).
