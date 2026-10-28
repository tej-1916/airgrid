# AirGrid Final Engineering Completion Implementation Plan

> **For agentic workers:** REQUIRED SUB-SKILL: Use superpowers:executing-plans to implement this plan task-by-task. Steps use checkbox (`- [ ]`) syntax for tracking.

**Goal:** Close all outstanding engineering gaps across AirGrid: connect FreeLLMAPI in the AI Gateway, complete the real Wi-Fi collector/diagnostics UX, implement campus-scoped access control with safe migrations, build the remaining operational pages (/devices, /monitor, /ai-models, /alerts, /reports) in the shared light design system, resolve HTTPX deprecation warnings, and verify full acceptance with backend tests and browser fixture runs.

**Architecture:** 
- Modular FastAPI backend with PostgreSQL persistence, SQLAlchemy ORM, Alembic migrations, and Argon2 session authentication.
- Bounded, OpenAI-compatible AI Gateway adapter supporting model discovery, latency tracking, runtime model selection, secrets redaction, and strict grounding verification.
- Campus-scoped authorization via an additive `campus_memberships` table enforcing RBAC across all campus-linked resources with deliberate global administrator privileges.
- React 18/TypeScript frontend adhering to AirGrid's signature light palette (`#F5F5F3`, cards `#FFFFFF`, text `#0B0B0D`, accent `#BE6B37`, borders `#D9DBDE`).

**Tech Stack:** Python 3.12, FastAPI, SQLAlchemy 2.0, Alembic, Pydantic v2, PostgreSQL, React 18, TypeScript, Vite, Tailwind CSS, Playwright.

---

## Global Constraints
- Target branch: `feat/airgrid-real-network-intelligence`.
- Do not restart the project, discard previous work, or create competing architectures.
- No remote push (no remote configured); maintain local git commits.
- Never reset `airgrid_db`; all tests must target `airgrid_test_db`.
- No fake/simulated operational statistics or fictional model names.
- Explicit operator opt-in required before live network measurements or external data transfers.
- Zero paid dependencies or unapproved external paid API calls.

## Review Focus
1. **Unconfigured vs Configured AI Gateway:** When no API key/endpoint is set, health checks must return `unconfigured` cleanly without exceptions or leaking credentials.
2. **Campus Scoping Boundary:** Unassigned engineers/viewers must receive 403 Forbidden or empty lists when querying campuses they are not assigned to; administrators must retain global access.
3. **IDOR Prevention:** Child resources (floors, surveys, models, plans, diagnostic reports) must check the parent campus authorization.
4. **Collector Signing & Flood Gate:** Valid signed submissions must succeed; replay nonces, expired timestamps, and tampered signatures must fail with 409/401 without crashing or locking out other IPs.
5. **No Data / Empty States:** Every UI view must render an informative empty state instead of crashing or showing fake data when zero measurements exist.

---

### Task 1: AI Gateway & FreeLLMAPI Adapter Enhancement

**Files:**
- Modify: `apps/api/src/airgrid/core/config.py`
- Modify: `apps/api/src/airgrid/services/ai_gateway.py`
- Modify: `apps/api/src/airgrid/schemas/ai.py`
- Modify: `apps/api/src/airgrid/api/v1/endpoints/ai.py`
- Modify: `apps/api/tests/test_ai_gateway.py`

- [ ] Add model discovery, latency measurement, and health check tracking to `AIGatewayService`:
  - `GET /models` request with timeout
  - Parse available models list
  - Record duration in ms
  - Store `last_health_check`, `last_success`, `last_failure`
  - Allow runtime model selection among discovered/configured models
- [ ] Add `POST /api/v1/ai/select-model` endpoint and enhance `GET /api/v1/ai/status` with full status fields
- [ ] Add backend unit tests in `test_ai_gateway.py` for model discovery, model selection, health latency, and error types
- [ ] Run backend tests and verify all pass

---

### Task 2: Campus-Scoped Access Control (Priority 3)

**Files:**
- Modify: `apps/api/src/airgrid/models/all_models.py`
- Create: `apps/api/migrations/versions/0012_campus_access_control.py`
- Modify: `apps/api/src/airgrid/api/deps.py`
- Modify: `apps/api/src/airgrid/services/campus_service.py`
- Modify: `apps/api/src/airgrid/api/v1/endpoints/campuses.py`
- Modify: `apps/api/src/airgrid/api/v1/endpoints/surveys.py`
- Modify: `apps/api/src/airgrid/api/v1/endpoints/diagnostics.py`
- Modify: `apps/api/src/airgrid/api/v1/endpoints/ml.py`
- Modify: `apps/api/src/airgrid/api/v1/endpoints/optimization.py`
- Create: `apps/api/tests/test_campus_access_control.py`

- [ ] Add `CampusMembership` model to `all_models.py`
- [ ] Create Alembic migration `0012_campus_access_control.py` creating `campus_memberships` table
- [ ] Test migration upgrade -> downgrade -> upgrade on `airgrid_test_db`, verify `alembic check` clean
- [ ] Implement campus authorization helper dependencies:
  - `check_user_campus_access(db, user, campus_id)`
  - `require_campus_access(campus_id, db, user)`
  - `get_authorized_campus_ids(db, user)`
- [ ] Add membership endpoints:
  - `GET /api/v1/campuses/{campus_id}/members`
  - `POST /api/v1/campuses/{campus_id}/members`
  - `DELETE /api/v1/campuses/{campus_id}/members/{user_id}`
- [ ] Apply campus scoping to endpoints:
  - `campuses.py` (list, get, buildings, floors, floor plans)
  - `surveys.py` (sessions, measurements)
  - `diagnostics.py` (reports, trends)
  - `ml.py` (training, models, predictions)
  - `optimization.py` (survey recommendations, plans)
- [ ] Write comprehensive regression tests in `test_campus_access_control.py`
- [ ] Run backend tests and confirm all pass

---

### Task 3: Complete Remaining Operational Views (Priority 4)

**Files:**
- Modify: `apps/web/src/pages/AIModelsPage.tsx`
- Modify: `apps/web/src/pages/DevicesPage.tsx`
- Modify: `apps/web/src/pages/MonitorPage.tsx`
- Modify: `apps/web/src/pages/AlertsPage.tsx`
- Modify: `apps/web/src/pages/ReportsPage.tsx`
- Modify: `apps/api/src/airgrid/api/v1/endpoints/diagnostics.py` (add findings endpoint if needed)

- [ ] Complete `/ai-models` (`AIModelsPage.tsx`):
  - Shared light design system
  - Live gateway status, connection testing with latency display
  - Model discovery and active model selector
  - Privacy policy and consent requirements notice
- [ ] Complete `/devices` (`DevicesPage.tsx`):
  - List registered collectors via `/api/v1/collectors`
  - Show collector ID, host label, status, last seen, submissions/rejections, allowed campus/floor
  - Provide admin revocation and secret rotation controls
  - List manually registered campus APs via `/api/v1/optimization/access-points`
  - Clear provenance badges
- [ ] Complete `/monitor` (`MonitorPage.tsx`):
  - Connect to `/api/v1/diagnostics/trends`
  - Display actual persisted RSSI, link rate, gateway RTT/loss, speed tests, and transitions
  - Display measurement freshness and clear no-data warnings
- [ ] Complete `/alerts` (`AlertsPage.tsx`):
  - Connect to `/api/v1/diagnostics/findings` (retrospective findings history)
  - Clear banner distinguishing retrospective findings from real-time alerting
  - Severity filtering and measured evidence display
- [ ] Complete `/reports` (`ReportsPage.tsx`):
  - Unified report explorer for saved diagnostic reports, survey session data, and optimization plans
  - Export controls for JSON and printable views
- [ ] Verify frontend build passes with zero errors

---

### Task 4: Security Hardening & HTTPX Cookie Warnings Resolution (Priority 5)

**Files:**
- Modify: `apps/api/tests/test_auth_endpoints.py`
- Modify: `apps/api/tests/test_survey_endpoints.py`
- Modify: `apps/api/tests/test_network_diagnostics.py`
- Modify: `apps/api/tests/test_campus_endpoints.py`
- Modify: `apps/api/tests/test_collectors.py`

- [ ] Address HTTPX cookie deprecation warnings by setting cookies directly on client instances
- [ ] Add regression tests in `test_collectors.py` for rate limits (shared-IP behavior, signed quota, replay nonces)
- [ ] Run backend tests and confirm deprecation warnings are resolved and all tests pass

---

### Task 5: End-to-End Verification & Browser Tests (Priority 6)

**Files:**
- Modify/Extend: `docs/verification/verify_phase_06.cjs` or create `docs/verification/verify_final.cjs`

- [ ] Verify backend pytest suite (all tests passing)
- [ ] Verify frontend build (`tsc -b && vite build`)
- [ ] Run browser test script with Playwright across all 15 routes on desktop and mobile viewports
- [ ] Verify zero console errors, zero live-probe calls, zero unmocked network leaks

---

### Task 6: Documentation & Git Checkpoints

**Files:**
- Create/Update: `docs/development/AGY_FINAL_PROGRESS.md`
- Update: `docs/development/RESUME_FROM_HERE.md`
- Create: `docs/development/AIRGRID_FINAL_ACCEPTANCE.md`

- [ ] Commit Task 1: `feat(ai): integrate FreeLLMAPI provider workflow and model control`
- [ ] Commit Task 2: `fix(auth): implement campus-scoped authorization and memberships`
- [ ] Commit Task 3: `feat(ui): complete remaining operational views in light theme`
- [ ] Commit Task 4: `test: expand security, rate limiting and address httpx deprecations`
- [ ] Commit Task 5 & 6: `docs: record final airgrid engineering acceptance and handoff`
