# Claude completion amendment — 2026-10-28

**Acceptance: persisted planning, AP inventory and measured comparison implemented and tested with fixtures.**

- `optimization_plans` (migration 0011): floor-scoped plans with markers (normalized, ≤ 50), notes, status (`draft`, `proposed`, `accepted_for_trial`, `archived`), evidence refs validated against the floor's survey points, author and version. Edits require `expected_version` (stale edits return 409). Engineers/admins edit; only the author or an admin deletes; viewers read; audited. The UI's in-memory Plan A/B is replaced by the saved plan editor.
- Manual AP inventory (`/api/v1/optimization/access-points`): unique MAC, normalized position, channels, status, notes; `tx_power_dbm` nullable (unknown stays unknown). Nothing is discovered.
- Recommendations add nearest-registered-AP straight-line plan distances for weak observations (calibrated plans only; walls/antenna/power unknown), a prompt to register APs when none are placed, and per-source repeated RSSI change review.
- `POST /api/v1/optimization/compare-sessions`: observed before/after on paired grid cells (≥ 3 dB reported as change) with method/device/coverage caveats; hypothetical plans are never scored. Export includes saved plans and APs.
- No router, channel, power or credential change is implemented.

---

# Phase 08 handoff — survey recommendations and candidate plans

Date: 2026-10-28. **Implemented survey/planning core; full requested Phase 08 scope is partial.**

`GET /api/v1/optimization/survey` is authenticated and read-only. It validates the floor and requires an explicitly selected, case-sensitive network before using observations. It excludes controlled imports, estimates, unknown provenance, invalid coordinates and invalid RSSI. Operator reports remain visibly lower-assurance evidence. Queries are bounded to 10000 observations; a larger dataset returns a clear error rather than silently calculating partial counts.

Recommendations identify RSSI below -75 dBm and insufficient calibration, sampling cells or independent sessions. Each recommendation includes priority, measurement references, a benefit category, required evidence and validation steps. A 4×4 grid suggests cell centers for additional observation; these are neither confirmed dead zones nor verified accessible locations. Historical observations keep timestamps, and no AP placement, wall attenuation or numerical gain is invented. Display limits are explicit.

`/optimization` and `/ap-optimization` use the existing light shell. Operators can choose floor/network, inspect weak measurements, write annotations and compare Plan A/Plan B with normalized coordinate AP markers. Markers overlay a protected floor plan when one is available; missing plans have an honest empty state. Markers are speculative, keyboard-enterable and removable. Engineer/admin may edit plans; viewers retain evidence access.

Plans stay in page memory and are lost when navigating or changing scope; this is displayed before editing. Explicit JSON export includes selected evidence, scope and both candidate plans. Printable analysis is available. No database mutation, router command, credential change, transmit-power change or channel change is implemented.

Verification: unit tests cover empty input, wrong floors, case-sensitive network isolation, invalid measurements, fixture/estimate exclusion, weak points and missing cells. Integration checks verify authentication and real isolated database filtering. Browser fixtures verify floor/network controls, notes, markers, two candidate plans, exported JSON, missing floor-plan state, mobile layout and no live probe calls.

Remaining scope: persisted/versioned plans, measured before/after comparisons, repeated latency/speed trends, measured-vs-predicted map disagreement, verified existing AP inventory and map interaction/overlay verification against uploaded fixture assets. These remain explicit gaps, not simulated features. No new migration added.
