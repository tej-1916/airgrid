# AIRGRID | PHASE 02: COMMAND CENTER + CAMPUS MANAGER (REFERENCE-DRIVEN)

Act as a principal React/TypeScript engineer, FastAPI engineer, PostgreSQL architect, product designer, and application-security reviewer.

**Repository:** `~/Projects/airgrid`

## MANDATORY REFERENCE INSPECTION

Before planning or touching code, visually inspect both:

1. `docs/design/references/phase02-command-center-reference.png` — Command Center layout inspiration: spacious light SaaS dashboard, broad collapsible sidebar, simple navigation tabs, modular cards, small copper-orange accents.
2. `docs/design/references/phase02-campus-manager-reference.png` — Campus Manager layout inspiration: map-centered architectural work area, building and floor selectors, context cards, careful spatial visualization.

Also read `docs/design/PHASE_02_VISUAL_GUIDE.md`, the Phase 00/01A/01B handoffs and security-audit notes, and inspect the current AirGrid landing and authentication UIs. If visual inspection of reference assets is not possible, state that, do not pretend otherwise, and follow the guide.

**IMPORTANT:** Do not duplicate the reference websites' branding, logos, copyrighted artwork, exact compositions, or illustrative data. Build original AirGrid components. Do not ship the reference screenshots in frontend public assets.

## PRODUCT & DESIGN DIRECTION

Use the **same theme as AirGrid's Phase 01A landing page** throughout the authenticated app:

- Warm off-white background `#F5F5F3`
- Black text `#0B0B0D`
- Copper-orange accent `#BE6B37`
- Light warm-gray cards/borders, crisp black Lucide icons, generous whitespace, precise typography, rounded pills and cards
- Controlled dark panels only where visualization contrast warrants them
- **Replace the legacy full dark admin shell** with the consistent light AirGrid shell, while preserving functionality
- Keep responsive behavior, accessible keyboard/focus states and reduced-motion support

## PHASE 02 FUNCTIONAL SCOPE (ONLY TWO PAGES)

### A. Inspect and baseline

- Check Git status, migrations, actual DB state, tests, frontend build, existing routes and RBAC.
- Verify Phase 01B security gate before changing it; preserve login, cookies, logout, protected routes, images/videos and all existing working functions.
- Confirm test credentials remain out of repository, logs and screenshot artifacts.
- Avoid introducing unnecessary libraries or microservices.

### B. Unified AirGrid console shell

- Implement responsive, collapsible left sidebar with grouped navigation for the planned platform modules.
- Top bar: page title, navigation/breadcrumb, campus context selector if available, actual API service health, profile/role, logout.
- Provide proper routing and role-aware menus; never rely on hidden UI as the only permission check.
- Non-Phase-02 routes remain explicitly marked placeholders, without fabricated values.

### C. Command Center `/dashboard`

- Show actual DB-derived campus, building, floor, and floor-plan counts.
- Campus/building filters must modify relevant summaries, not just visual selection.
- Display real authenticated-user data, meaningful empty states, and recent system activity if the data is present.
- Show live backend/database reachability only from verified backend health endpoints. Do not label unconfigured telemetry systems 'live'.
- No invented AP counts, network speeds, Wi-Fi health scores, customers, or model outputs.
- Add segmented overview/activity/inventory navigation only where each segment has genuine functionality.
- Every CTA must link to implemented behavior or clearly marked 'coming in future phase' routes.

### D. Campus & Building Manager `/campuses`

- Reuse existing PostgreSQL schema where feasible; add safe Alembic migrations only when needed.
- Implement CRUD for campuses, buildings, floors, and floor-plan metadata; hierarchical selection; search/filter; validation; archive where modeled.
- Admin: full management. Network Engineer: only explicitly authorized technical metadata and floor-plan management. Viewer: read-only. Enforce on FastAPI endpoints.
- Provide authenticated PNG/JPG/WebP upload, actual MIME/content verification, configured size limits, safe file names, path-traversal protection, storage outside public assets, and authorized image retrieval.
- Provide an interactive 2D plan viewer: fit-to-view, zoom, pan, preserved aspect ratio, and physical scale calibration metadata in meters. Never silently assume pixels equal meters.
- Create an original **map-focused editorial composition inspired by OptiSpace**, with contextual cards and a spatial workspace. If rendering an isometric sketch, label it 'illustrative' and do not infer real 3D geometry from a 2D uploaded floor plan.
- Empty state when no real campus or plans exist, with functional 'Create Campus' onboarding action.

### E. API contracts and backend

- Versioned FastAPI endpoints with Pydantic validation and SQLAlchemy persistence for campuses, buildings, floors, floor-plan files and dashboard summaries.
- Validate parent-child references and authorization boundaries; return clear 401/403/404/422 errors.
- Add audit events for protected mutations without leaking sensitive locations or credentials.
- Keep development localhost-only; do not probe college networks or configure routers.

### F. Tests and real browser verification

- Re-run prior backend tests; add API/DB integration tests for CRUD, empty states, hierarchy ownership, file upload/retrieval, invalid uploads, RBAC, migrations and real counts.
- Build frontend (`npm --prefix apps/web run build`), run type checks and test navigation/actions.
- In real browser, test at 1440 px, 1024 px, and 390 px, at **100% zoom**. Check sidebar collapse, hierarchy navigation, form errors, floor-plan image aspect ratio, zoom/pan, login redirect and logout.
- Verify no browser console errors and no claims of live telemetry unsupported by backend data.
- Capture screenshots with clear filenames, documenting any tests that were not completed.

### G. Deliverables

- Update README and relevant architecture docs.
- Create `docs/phases/PHASE_02_HANDOFF.md` containing files changed, migration ids, endpoints, actual tests, screenshots, limitations and specific Phase 03 prerequisites.
- Provide final exact commands to run backend and frontend locally.

### Stop condition

**Stop after Phase 02.** Do not implement Phase 03 speed tests, ML prediction, AI model calls, n8n workflow execution, email notifications or AP optimization.

Start by examining the two attached local reference images and making a small component/layout plan. Then reproduce the existing test baseline before coding.
