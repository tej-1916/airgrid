# Claude completion checkpoint — 2026-10-28

Branch `feat/airgrid-real-network-intelligence`, continuing from Codex checkpoints `86468c7` and `b85f08c` (both preserved; no reset, rebase or force-push). No Git remote is configured; nothing was pushed or merged.

## Commits in this session

| Commit | Scope |
|---|---|
| `bc7e7e8` | Schema drift reconciliation (ORM names the indexes migrations created; additive `0008`), drift regression test, flaky login test fix |
| `42f824b` | Registered collectors, HMAC-signed ingestion, server-owned snapshots, trends, retention (`0009`), collector CLI `--submit` |
| `a5fe4d9` | Instrument observations placed on calibrated survey points; ML models bound to floor-plan version; security-review fixes (rate-limit keying, atomic snapshot claim) |
| `36603ed` | Analyst: grounded questions, window comparison, session comparison, analysis history (`0010`) |
| `bd3f537` | Optimization: persisted versioned plans, manual AP inventory (`0011`), AP-distance and repeated-change review, measured before/after |
| `bf05dcf` | Collector hardening: fail closed on default signing key; single pre-auth flood gate |
| `445a922` | Fixture browser verification of all new workflows; collectors-panel selection fix |
| docs checkpoint | This file, handoffs, README, routes, database design (see `git log -1`) |

## Baseline reproduced

- Backend: 138 tests; one **intermittent** failure (`test_login_invalid_credentials_safe_message`) because a fixed email accumulated persistent audit-log failures across back-to-back runs and tripped the DB-backed login limiter. The limiter was correct; the test now uses a unique email.
- Frontend build passed. Application and test DB at `0007_network_diagnostics`; `alembic check` failed with the reported 5/24/27 index/constraint drift.

## Schema drift — resolved

Cause: migrations 0001–0007 created short custom index names (`ix_wifi_obs_floor_id`) and separate `UNIQUE` constraints plus plain indexes, while models used `index=True`/`unique=True` (auto names). Both databases had identical layouts. Resolution: models now declare the existing names (metadata only); `0008` adds the five indexes no migration had created. **No drops.** The redundant plain indexes that duplicate UNIQUE constraints (`ix_users_email`, `ix_campuses_code`, `ix_measurement_devices_fingerprint`, `ix_access_points_mac`, `ix_ai_records_request_id`) remain; removing them is an optional, operator-approved cleanup. `test_orm_metadata_matches_migrated_test_database` guards against regression.

## Migrations and application data

`0008`–`0011` are additive (new tables, nullable columns, indexes; `access_points.tx_power_dbm` made nullable on an empty table). Each was upgraded, downgraded and re-upgraded on `airgrid_test_db`. They were then applied to `airgrid_db` after a custom-format backup at `~/Projects/airgrid-backups/airgrid_db_before_0008_20261028T131821Z.dump` (mode 0600, outside the repository; 28 table-data entries verified). Row counts of all 28 pre-existing tables were identical before and after; five new empty tables were added. `alembic check` is clean on both databases. Read-only smoke checks of reports, trends and retention against `airgrid_db` succeeded.

Rollback: `uv run alembic downgrade 0007_network_diagnostics` (0011's downgrade requires that no AP has a NULL transmit power), or restore the dump with `docker exec -i airgrid-postgres pg_restore -U airgrid -d airgrid_db --clean < <dump>`.

## Completed modules

- **C1–C2 Collector registration/ingestion:** admin-only registration with secret shown once (derived, never stored); signature over id/timestamp/nonce/body hash; ±5 min window; nonce uniqueness (DB constraint); 16 KiB cap; strict schema (unknown fields, control characters, bounds, failed-with-measurements rejected); HTTPS required off-loopback; per-collector accepted quota; per-address flood gate counting only unauthenticated failures; rotation, revocation and audit; fail-closed on a default/short signing key. CLI `--submit` signs one reading; no background loop.
- **C3 Workflow:** register → run collector with `--collect --submit` → observations listed with timestamps/freshness → consented local analysis by snapshot ID (atomic claim) → report keeps `instrumented_linux_telemetry`/`registered_collector` provenance. Backend-host `/collect` now returns a server-owned snapshot handle too.
- **C4 Retention:** `collector_telemetry` and `analysis_records` datasets; default keep-indefinitely; admin policy, preview, confirm with expected count; exact daily aggregates (count/sum/min/max); report- and survey-linked snapshots protected; audited.
- **C5 Trends:** RSSI, link bitrate, gateway RTT and loss, browser throughput/latency, transitions (state changes and BSSID roams), availability and freshness; persisted records only; validated two-series palette; hover, legend/direct labels, table view.
- **D2/D4/D5 ML:** snapshot placement is the only path to `field_instrument_verified` (fresh, complete, calibrated, one point per snapshot, manual overwrite blocked); readiness shows counts by source; models bound to floor-plan signature.
- **E1–E6 Analyst:** six question types answered from records with citations or explicit missing evidence; same-source window comparison; session comparison; consented gateway rephrasing with citation and numeric grounding checks; exact payload preview; history with scope, evidence refs, freshness, mode, provider-reported model, outcome, errors and operator.
- **F1–F4 Optimization:** versioned persisted plans with evidence refs and RBAC; manual AP inventory; nearest-registered-AP plan distances; repeated-change review; measured before/after session comparison with method/device caveats.

## Verification

| Check | Result |
|---|---|
| `apps/api/.venv/bin/python -m pytest` (root) | **197 passed, 99 warnings** (all HTTPX per-request cookie deprecations in pre-existing tests) |
| `npm --prefix apps/web run build` | Passed; 1634 modules; JS 669.64 kB / 167.82 kB gzip (existing >500 kB chunk warning) |
| `alembic check` (test and application DB) | No new upgrade operations detected |
| `node docs/verification/verify_phase_06.cjs` (Vite on 127.0.0.1:5187, cached Playwright) | **Passed**: 10 routes, 1440/390 px, zero page errors, zero live-probe attempts, 15 external requests blocked |

Browser fixtures exercise: login navigation, ML readiness counts, disabled backend collector with unchecked consent, collector registration (secret shown once then hidden), consented analysis by snapshot ID, trend charts and roam transition, retention preview with disabled apply until confirmed, saved-report analysis and printable PDF, evidence answer with citations and missing evidence, history detail, saved plan with marker and evidence, AP registration, measured comparison and JSON export. Session, CSRF, RBAC and database behavior are verified by pytest, not by the mocked browser run. Screenshots prefixed `fixture_` contain fixtures only.

## Not verified / blocked (requires the owner)

- **Real hardware:** no live collection, gateway probe, iperf or speed test was run. Registered-collector signing was exercised only in tests.
- **Instrument dataset / ML training:** zero instrument-verified points exist; no operational model was trained.
- **AI provider:** disabled; gateway behavior (success, rejection, unconfigured) is mocked in tests. No external or paid inference occurred.
- **Remote push:** no remote configured.

## Known issues and decisions for the owner

- **Collector rate limiting is a tradeoff.** Background security reviews alternately asked for "no pre-auth gate that can block a valid collector" and "a gate before any DB access". Signature verification needs the per-collector salt from the DB, so both cannot hold at once. Current design: one per-address gate (100 failed/5 min, only unauthenticated 401s count) before DB access, plus a per-collector accepted quota after authentication. A flood above the threshold from a shared address also delays a valid collector there. Run uvicorn with `--proxy-headers` behind a proxy so addresses are real. Revisit if collectors share NAT with untrusted clients.
- All limiters are per process; add a shared store before multiple workers.
- No per-user campus membership model exists (pre-existing); any authenticated user can read all campuses.
- `AIRGRID_SECRET_KEY` also signs CSRF tokens; rotating it invalidates sessions' CSRF tokens and all collector secrets.
- `/devices`, `/monitor`, `/ai-models`, `/alerts`, `/reports` remain placeholder shells.
- Redundant duplicate indexes on unique columns remain (optional cleanup).
- `apps/web/tsconfig.tsbuildinfo` is tracked and rebuilt locally; left unstaged as before. Pre-existing untracked private screenshots and the old planning document remain uncommitted.

## Next action

Owner: review the collector rate-limit tradeoff, register one collector on an authorized host, run one `--collect --submit`, place that observation on a calibrated survey, and inspect it in `/diagnostics` and `/ai-analyst`. Repeat across two sessions to make ML readiness meaningful.
