# Frontend routes — current recovery status

React 18, React Router 6, Tailwind and the existing light AirGrid shell. Background `#F5F5F3`, white cards, text `#0B0B0D`, copper `#BE6B37`, borders `#D9DBDE`. The landing page remains in place.

| Route | Access and implementation |
|---|---|
| `/` | Public landing |
| `/auth/login`, `/login` | Public session login; `/login` redirects |
| `/dashboard` | Authenticated real database counts/activity |
| `/campuses` | Authenticated hierarchy and plans; mutations role-protected |
| `/speed-test` | Authenticated operator-started Cloudflare browser tests |
| `/heatmaps` | Authenticated surveys, history, supported IDW maps; engineers/admins may place fresh instrument observations at a chosen calibrated position |
| `/ml-lab` | Authenticated readiness (counts by source)/evaluation/maps bound to the trained floor-plan version; training restricted to engineer/admin |
| `/diagnostics` | Tabs: backend host (engineer/admin, CSRF, host enablement, explicit action), registered collectors (admin registers/rotates/revokes; engineers analyze stored observations), trends & history (all users), retention (admin applies) |
| `/network-tools`, `/network-diagnostics`, `/ai-diagnostics` | Redirect to `/diagnostics` |
| `/ai-analyst` | Tabs: saved report, ask the evidence, compare windows, history. Asking/comparing requires engineer/admin; history readable by all; local default, consented grounded gateway optional |
| `/optimization`, `/ap-optimization` | Survey recommendations, saved versioned plans and manual AP inventory (engineer/admin edit), measured before/after comparison (all users), export |
| `/devices`, `/monitor`, `/ai-models`, `/alerts`, `/reports` | Existing shells, not completed product modules |
| `/settings` | Existing settings view; broader administration scope remains outside this recovery |

Automation navigation and route are removed. Unknown routes redirect to landing. No planned automation milestones are active.

Phase 05 and 06 implementations were recovered and hardened, with further acceptance gaps documented in their handoffs. Phase 07's evidence Analyst/gateway core and Phase 08's survey recommendation/planning core are implemented; broader orchestration, history analysis and persisted planning are not complete.

Fixture browser verification covers landing/login, dashboard, campus manager, speed test, survey studio, ML lab, diagnostics aliases, Analyst and Optimization. The new workspaces were exercised at 1440px and 390px, including local analysis, disabled provider state, candidate export and printable report. Backend authorization and database behavior are verified separately by pytest. Screenshots beginning `fixture_` contain only isolated fixtures and are not production measurements.

2026-10-28 completion: the fixture browser script additionally exercises collector registration, consented snapshot analysis, trends, retention preview, Analyst questions/history, saved plans, AP registration and measured comparison at 1440/390 px.
