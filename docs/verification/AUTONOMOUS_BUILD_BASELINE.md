# Autonomous build baseline — 2026-10-28

Branch: `feat/airgrid-real-network-intelligence`. Starting commit: `9c3b457`.
No Git remotes configured. Existing Phase 04–06 work was uncommitted and preserved.

Commands from repository root unless specified:

- `apps/api/.venv/bin/python --version`: Python 3.12.13.
- `apps/api/.venv/bin/python -m pytest`: **104 passed, 103 warnings in 15.16s**.
  Before execution, network diagnostic tests were changed to isolated command/telemetry fixtures because the inherited suite ran host commands and live ping.
- `npm run build` in `apps/web`: TypeScript and Vite passed; 1629 modules; 2.29s. Nonfatal bundle-size warning (~596 kB JS before gzip).
- `.venv/bin/alembic current` and `.venv/bin/alembic heads` in `apps/api`: `0007_network_diagnostics` (head). Read-only; no migrations applied.
- Read-only aggregate SQL confirmed `airgrid_db`: 1 operator-reported survey observation, 12 controlled imports, 1 historical diagnostic report. No instrument-verified survey observations. No network labels or identifiers exported.
- Pytest config forces `airgrid_test_db` and verifies the async engine database name before test execution. PostgreSQL connectivity confirmed by the suite and read-only application query.
- `git diff --check`: passed at baseline.

Warnings: HTTPX per-request cookie deprecations; naive UTC datetime deprecations in diagnostics. No failure warnings hidden. Existing health and route coverage included in the baseline tests/build; browser checks are recorded separately.

Acceptance correction: inherited handoffs claim full acceptance, but inspection found gaps in consent defaults, fixture isolation, provenance, ML spatial splitting and artifact integrity. Those historical claims are not current acceptance evidence.
