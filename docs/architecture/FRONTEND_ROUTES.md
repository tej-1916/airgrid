# Frontend routes — current recovery status

React 18, React Router 6, Tailwind and the existing light AirGrid shell. Background `#F5F5F3`, white cards, text `#0B0B0D`, copper `#BE6B37`, borders `#D9DBDE`. The landing page remains in place.

| Route | Access and implementation |
|---|---|
| `/` | Public landing |
| `/auth/login`, `/login` | Public session login; `/login` redirects |
| `/dashboard` | Authenticated real database counts/activity |
| `/campuses` | Authenticated hierarchy and plans; mutations role-protected |
| `/speed-test` | Authenticated operator-started Cloudflare browser tests |
| `/heatmaps` | Authenticated surveys, history and supported IDW maps |
| `/ml-lab` | Authenticated readiness/evaluation/maps; training restricted to engineer/admin |
| `/diagnostics` | Authenticated reports; collector operations require engineer/admin, CSRF, host enablement and explicit action |
| `/network-tools`, `/network-diagnostics`, `/ai-diagnostics` | Redirect to `/diagnostics` |
| `/ai-analyst` | Authenticated evidence workspace; analysis requires engineer/admin; local default |
| `/optimization`, `/ap-optimization` | Authenticated read-only survey recommendations; engineer/admin may edit local speculative plans |
| `/devices`, `/monitor`, `/ai-models`, `/alerts`, `/reports` | Existing shells, not completed product modules |
| `/settings` | Existing settings view; broader administration scope remains outside this recovery |

Automation navigation and route are removed. Unknown routes redirect to landing. No planned automation milestones are active.

Phase 05 and 06 implementations were recovered and hardened, with further acceptance gaps documented in their handoffs. Phase 07's evidence Analyst/gateway core and Phase 08's survey recommendation/planning core are implemented; broader orchestration, history analysis and persisted planning are not complete.

Fixture browser verification covers landing/login, dashboard, campus manager, speed test, survey studio, ML lab, diagnostics aliases, Analyst and Optimization. The new workspaces were exercised at 1440px and 390px, including local analysis, disabled provider state, candidate export and printable report. Backend authorization and database behavior are verified separately by pytest. Screenshots beginning `fixture_` contain only isolated fixtures and are not production measurements.
