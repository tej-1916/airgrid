# AirGrid Phase 00 Foundation Implementation Plan

> **For agentic workers:** REQUIRED SUB-SKILL: Use superpowers:subagent-driven-development (recommended) or superpowers:executing-plans to implement this plan task-by-task. Steps use checkbox (`- [ ]`) syntax for tracking.

**Goal:** Establish a production-grade, modular, maintainable foundation for AirGrid, including architecture specifications, enterprise dark design system, 16 frontend routes, FastAPI modular monolith, PostgreSQL schema and Alembic migrations, AI Gateway abstraction, n8n signed webhook contracts, Docker compose configuration, and verification suite.

**Architecture:** AirGrid is structured as a clean modular monolith within a monorepo (`apps/web`, `apps/api`, `packages/shared-contracts`). The backend uses FastAPI + Pydantic v2 + SQLAlchemy 2.0 with PostgreSQL, featuring provider-agnostic AI Gateway and signed webhook dispatchers. The frontend uses React 19 + TypeScript + Vite + Tailwind CSS with a unified enterprise dark theme application shell.

**Tech Stack:** Python 3.12+, FastAPI, Pydantic, SQLAlchemy 2.0, Alembic, Pytest; React, TypeScript, Vite, Tailwind CSS, Lucide React; PostgreSQL, Docker Compose, uv.

**Spec:** USER_REQUEST specification for AIRGRID | PHASE 00: SYSTEM ARCHITECTURE & FOUNDATION.

## Global Constraints

- Root project path: `/home/teju/Projects/airgrid`
- Never install system-wide packages or run `sudo`. Use project-isolated tooling (`uv`, local `node_modules`).
- Do not clash with running host services (port 5678/5679 occupied by existing containers; n8n mapped to port 5680 in docker-compose).
- Missing AI credentials or optional external services must not crash startup (graceful degradation with unverified/degraded states).
- Client measurements must strictly represent client-side vantage points; server measurements must never be misrepresented.
- Strict phase boundary: no fake metric values, no simulated full ML training, no active probing, no live outbound external emails in Phase 00.

## Review Focus

1. Missing database or AI credentials during startup -> Application logs clean warning and operates in degraded/readiness-reported mode without crashing.
2. Port conflicts on developer machine (e.g. 5678 already listening) -> Configurable port mapping in `.env` with safe default (5680).
3. Client vs Server network measurement data isolation -> Schemas strictly separate client device telemetry from backend probes.
4. AI Gateway model verification tracking -> Provider models tracked with `requested_model` and `verified_model` flags, marking identity unverified if provider conceals actual model.
5. Webhook delivery integrity -> HMAC-SHA256 signature header, replay prevention timestamp, and idempotency key specification.

---

### Task 1: Environment & Architecture Specifications Documentation

**Files:**
- Create: `docs/architecture/SYSTEM_ARCHITECTURE.md`
- Create: `docs/architecture/DATABASE_DESIGN.md`
- Create: `docs/architecture/API_CONTRACTS.md`
- Create: `docs/architecture/NETWORK_TESTING_DESIGN.md`
- Create: `docs/architecture/AI_GATEWAY_DESIGN.md`
- Create: `docs/architecture/N8N_AUTOMATION_DESIGN.md`
- Create: `docs/architecture/FRONTEND_ROUTES.md`
- Create: `README.md`

**Interfaces:**
- Produces: Standard architecture blueprints, database entity definitions, REST and WebSocket endpoint specifications, AI gateway contracts, and route mappings.

- [ ] **Step 1: Write `SYSTEM_ARCHITECTURE.md` covering system topology, component boundaries, modular monolith design, security boundaries, and data flows.**
- [ ] **Step 2: Write `DATABASE_DESIGN.md` detailing entities, ER diagrams, foreign keys, indexes, partitioning/retention, and audit trails.**
- [ ] **Step 3: Write `API_CONTRACTS.md` specifying REST routes, request/response JSON schemas, health endpoints, error models.**
- [ ] **Step 4: Write `NETWORK_TESTING_DESIGN.md` defining client-side vs server-side measurement pipelines, safety bounds, and privacy rules.**
- [ ] **Step 5: Write `AI_GATEWAY_DESIGN.md` specifying provider-independent gateway, model verification, fallback detection, and audit logging.**
- [ ] **Step 6: Write `N8N_AUTOMATION_DESIGN.md` specifying HMAC webhook security, event schemas, replay defense, and idempotency.**
- [ ] **Step 7: Write `FRONTEND_ROUTES.md` specifying all 16 page routes, view states, navigation hierarchy, and access boundaries.**
- [ ] **Step 8: Write `README.md` with project overview, architecture diagram, quickstart commands, and directory guide.**

### Task 2: Monorepo Foundation & Shared Contracts

**Files:**
- Create: `.gitignore`
- Create: `.env.example`
- Create: `.python-version`
- Create: `packages/shared-contracts/package.json`
- Create: `packages/shared-contracts/src/index.ts`
- Create: `packages/shared-contracts/src/types.ts`

**Interfaces:**
- Produces: TypeScript types and schema definitions shared between frontend and backend.

- [ ] **Step 1: Create `.gitignore`, `.env.example`, `.python-version` (pinned to 3.12).**
- [ ] **Step 2: Scaffolding `packages/shared-contracts` with TypeScript type declarations for health, telemetry, campus, AI execution, and alerts.**

### Task 3: Backend Core & Modular Monolith Scaffolding (`apps/api`)

**Files:**
- Create: `apps/api/pyproject.toml`
- Create: `apps/api/src/airgrid/__init__.py`
- Create: `apps/api/src/airgrid/main.py`
- Create: `apps/api/src/airgrid/core/config.py`
- Create: `apps/api/src/airgrid/core/logging.py`
- Create: `apps/api/src/airgrid/core/database.py`
- Create: `apps/api/src/airgrid/core/security.py`
- Create: `apps/api/src/airgrid/models/__init__.py`
- Create: `apps/api/src/airgrid/models/base.py`
- Create: `apps/api/src/airgrid/models/all_models.py`
- Create: `apps/api/src/airgrid/schemas/__init__.py`
- Create: `apps/api/src/airgrid/schemas/system.py`
- Create: `apps/api/src/airgrid/schemas/ai.py`
- Create: `apps/api/src/airgrid/schemas/webhook.py`
- Create: `apps/api/src/airgrid/services/ai_gateway.py`
- Create: `apps/api/src/airgrid/services/webhook_dispatcher.py`
- Create: `apps/api/src/airgrid/api/v1/router.py`
- Create: `apps/api/src/airgrid/api/v1/endpoints/health.py`
- Create: `apps/api/src/airgrid/alembic.ini`
- Create: `apps/api/migrations/env.py`
- Create: `apps/api/migrations/script.py.mako`
- Create: `apps/api/migrations/versions/0001_initial_schema.py`
- Test: `apps/api/tests/test_health.py`
- Test: `apps/api/tests/test_ai_gateway.py`
- Test: `apps/api/tests/test_webhook_signer.py`
- Test: `apps/api/tests/test_database_schema.py`

**Interfaces:**
- Consumes: `.env`, Python 3.12 venv via `uv`
- Produces: FastAPI app with `/healthz`, `/api/v1/health`, AI gateway interface, SQLAlchemy ORM models, Alembic migrations.

- [ ] **Step 1: Write pyproject.toml with FastAPI, uvicorn, pydantic, sqlalchemy, alembic, pytest.**
- [ ] **Step 2: Implement core settings (`config.py`) reading environment variables with safe defaults and no crash on missing AI keys.**
- [ ] **Step 3: Define complete SQLAlchemy 2.0 declarative models covering all 20 required entities.**
- [ ] **Step 4: Implement AI Gateway interface with provider contract, model verification flag, and metadata tracking.**
- [ ] **Step 5: Implement HMAC-SHA256 signed webhook dispatcher with replay protection header.**
- [ ] **Step 6: Configure Alembic migrations and verify migration generation.**
- [ ] **Step 7: Implement endpoints and tests in `tests/`. Verify tests pass via `uv run pytest`.**

### Task 4: Frontend Application Foundation (`apps/web`)

**Files:**
- Create: `apps/web/package.json`
- Create: `apps/web/vite.config.ts`
- Create: `apps/web/tsconfig.json`
- Create: `apps/web/tsconfig.node.json`
- Create: `apps/web/index.html`
- Create: `apps/web/src/index.css`
- Create: `apps/web/src/main.tsx`
- Create: `apps/web/src/App.tsx`
- Create: `apps/web/src/router.tsx`
- Create: `apps/web/src/components/layout/AppShell.tsx`
- Create: `apps/web/src/components/layout/Sidebar.tsx`
- Create: `apps/web/src/components/layout/Header.tsx`
- Create: `apps/web/src/components/common/StatusBadge.tsx`
- Create: `apps/web/src/components/common/PhaseNotice.tsx`
- Create: 16 route page components under `apps/web/src/pages/`
- Test: `apps/web/src/App.test.tsx`

**Interfaces:**
- Consumes: React 19 / TypeScript / Vite / Tailwind
- Produces: Web application serving all 16 routes inside an enterprise dark theme shell.

- [ ] **Step 1: Initialize `apps/web/package.json` and build configs.**
- [ ] **Step 2: Implement Tailwind CSS design system with deep navy/charcoal tokens and cyan/blue accents.**
- [ ] **Step 3: Build AppShell, Sidebar, Header, Breadcrumbs, and navigation state.**
- [ ] **Step 4: Implement all 16 distinct page views with clear Phase 00 status markers and architecture context.**
- [ ] **Step 5: Verify build succeeds (`npm run build`).**

### Task 5: Infrastructure & Docker Compose

**Files:**
- Create: `docker-compose.yml`
- Create: `infrastructure/docker/Dockerfile.api`
- Create: `infrastructure/docker/Dockerfile.web`
- Create: `infrastructure/n8n/README.md`

- [ ] **Step 1: Write Dockerfile.api and Dockerfile.web.**
- [ ] **Step 2: Write `docker-compose.yml` defining postgres, api, web, and n8n (on non-conflicting port 5680).**
- [ ] **Step 3: Validate `docker compose config` syntax.**

### Task 6: End-to-End Verification & Handoff Deliverables

**Files:**
- Create: `docs/phases/PHASE_00_HANDOFF.md`
- Run: Complete verification suite.

- [ ] **Step 1: Run pytest suite.**
- [ ] **Step 2: Run frontend build and typecheck.**
- [ ] **Step 3: Run database migration verification.**
- [ ] **Step 4: Check git status for unwanted artifacts or secrets.**
- [ ] **Step 5: Compile `docs/phases/PHASE_00_HANDOFF.md`.**
