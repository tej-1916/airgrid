# AirGrid Version 1.0: Submission Evidence

Prepared 17 November 2026 for the college project submission. Everything below was checked on the release commit; nothing is carried over from earlier claims. The exact commit is the one tagged **`v1.0-submission`** (`git rev-parse v1.0-submission`). Changes made after the submission deadline are separate, later commits and are not part of this checkpoint.

## 1. Version 1.0 scope

**Implemented and verified (code + automated tests + working demonstration)**

| Module | Evidence |
|---|---|
| Authentication and authorization (sessions, CSRF, roles, campus membership, owner-only records) | `test_auth_endpoints`, `test_auth_security`, `test_admin_bootstrap`, `test_campus_access_control`, `test_authz_remediation`, `test_copilot_tenant_isolation` |
| Campus management (hierarchy, plans, calibration) | `test_campus_endpoints`; real-backend screenshot |
| Dashboard (scoped counts, inventory, activity) | `test_dashboard_endpoints`, `test_authz_remediation` |
| Internet speed testing | `test_speed_test_endpoints`; consent script `docs/verification/open_speed_test_consent.cjs` |
| Wi-Fi heatmaps (IDW, support mask, LOOCV) | `test_survey_endpoints`, `test_survey_interpolation` |
| Network diagnostics and collectors | `test_network_diagnostics`, `test_collectors` |
| AI intelligence (Analyst) | `test_analyst`, `test_analyst_evidence`, `test_ai_gateway` |
| AI Copilot (FreeLLM API) | `test_copilot`, `test_copilot_provider_resilience`, `test_copilot_tenant_isolation`; live-provider screenshots |

**Implemented with known limitations**

- *Wi-Fi monitoring*: on-demand collection only; no continuous monitor. The "Live Network Monitor" page makes no API calls.
- *Network intelligence (ML Lab, AP optimization)*: implemented and tested on synthetic fixtures; the application database holds no instrument-verified survey points, so operational training is unavailable and **no field accuracy is claimed**.
- *Heatmaps/collectors on hardware*: workflow verified in software and on one Linux Wi-Fi interface; no formal physical field acceptance survey.
- *Rate limits* are per process.

**Planned, not claimed**: continuous monitoring and alerts; API-backed Devices, Alerts and Reports pages (currently UI shells); a 3D campus (the Blender Mega Campus is separate local work, not in this repository or release); CI and deployment (no deployment exists); field validation of model accuracy.

## 2. Test and build results (release code)

| Check | Result |
|---|---|
| Backend: `pytest` from `apps/api` against isolated `airgrid_test_db`, Python 3.12, upgraded dependencies (Pillow 13.0.0, certifi 2026.10.23, dnspython 2.9.2, opentelemetry-api 1.45.2) | **242 passed, 1 skipped, 0 failed** (243 collected from 223 test functions) |
| Skipped test | `tests/test_freellmapi_integration.py:48`: live-provider test, skipped because no `.env` exists in the clean checkout |
| Authorization regression tests | `tests/test_authz_remediation.py`: 8 tests, each failed on the unfixed code and passes now |
| Frontend: `npm run build` (tsc + Vite) | succeeded (chunk-size warning only) |
| Browser: `docs/verification/verify_phase_06.cjs` | passed: 10 routes, widths 1440 and 390, 0 page errors, 15 external requests blocked, 0 live probes |

Reproduce: see "Testing and verification evidence" in the README.

**What these do not show**: they do not show accuracy on real campus data, behaviour under load, behaviour on other operating systems, or a security certification.

## 3. Security findings

The automated review said it found 8 issues but itemized only some of them. Findings below are those demonstrated by a failing test; the rest were searched for by looking for the same pattern. If a finding from the original report is not listed here, please re-send it.

| Finding | Status |
|---|---|
| Diagnostics reports/snapshots with no campus accessible to any user | Confirmed, fixed (owner-or-admin) |
| Survey comparison without access checks | Confirmed, fixed |
| ML prediction map, champion promotion, deletion, listing | Confirmed, fixed (floor-campus access; checked before touching artifacts) |
| Analyst history, report analysis, ask/preview/compare evidence | Confirmed, fixed |
| Collector observations; speed-test list/stats/get; campus attribution on speed-test create | Confirmed, fixed |
| Dashboard inventory, counts and audit feed (found in the final audit, not in the review) | Confirmed, fixed |
| Optimization endpoints, Copilot owner guards | Checked: already enforce access; no change |

Design rule: access is denied when ownership cannot be established; administrators keep full access. Existing database records were not modified.

## 4. Remaining risks (not hidden)

- **Dependency advisories.** At the audit GitHub listed 58 open Dependabot alerts on the default branch (6 critical, 26 high, 25 medium, 1 low). Pillow, certifi, dnspython and opentelemetry-api were upgraded and the suite re-run (above). Still open: Vite and esbuild (development server only; fixes require a major upgrade), and React Router (the advisory concerns server-side-rendering hydration, which this client-side app does not use; the fix is a breaking v7 upgrade). GitHub will recompute alerts after this lockfile reaches the default branch. The developer's local `.venv` still has the old packages until `uv sync` is run.
- **Earlier documentation may expose local details (history only).** On 19 November 2026 the nine screenshots that showed a real Wi-Fi name, a neighbouring access point, a host name, a device address, a gateway address and an interface name were replaced in the current branch by redacted versions (grey boxes over the identifiers), and the same strings were replaced by synthetic values in tests and notes. The original images and text remain in earlier Git history, which was deliberately not rewritten; whether to rewrite it is a decision for the repository owner. Absolute local file links in the notes were converted to relative links.
- No penetration test was performed; session, rate-limit and file-upload hardening beyond the tested behaviours is unverified.
- Rate limits are per process; no multi-worker deployment is supported yet.
- AI model identity is provider-reported; the free provider's availability varies.
- The report's reference list contains standard published works cited from the author's knowledge; the student should verify bibliographic details against the sources and follow any additional citation rules before submission. The report header has placeholders for student name, roll number and department that must be filled in.

## 5. Roadmap after Version 1.0

1. Physical field acceptance survey; publish measured model accuracy against baselines.
2. Continuous monitoring and alerting backed by the API; replace shell pages.
3. Shared rate-limit store; multi-worker deployment.
4. CI with tests, dependency and secret scanning; upgrade Vite and React Router.
5. Optional 3D campus view (separate Blender work).

## 6. Where things are

| Item | Location |
|---|---|
| README | `README.md` |
| Project report | `docs/submission/PROJECT_REPORT.pdf` and `.docx` (source `.html`); Times New Roman, 24 pt title, 10 pt justified body per the college instructions PDF |
| Architecture figures | `docs/submission/figures/` |
| Screenshots | `docs/verification/screenshots/` (real-backend and labelled-fixture images are distinguished in the README) |
| Earlier acceptance notes | `docs/development/` (historical; this file supersedes claims in them) |
