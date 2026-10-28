# Resume AirGrid without restarting

1. Read `CLAUDE_COMPLETION_PROGRESS.md` (latest), then `AUTONOMOUS_PROGRESS.md` and the Phase 05–08 handoffs. The newest amendment at the top of each handoff supersedes older text.
2. Branch `feat/airgrid-real-network-intelligence`. Inspect `git status --short` before editing. No Git remote is configured; do not guess ownership or push. Pre-existing private screenshots (non-`fixture_` names), `fixture_failure.png` and the old planning document stay local and uncommitted. `apps/web/tsconfig.tsbuildinfo` is a tracked build artifact; leave it unstaged.
3. Backend tests: `apps/api/.venv/bin/python -m pytest` from the repository root (expect 197 passing, 99 HTTPX cookie deprecation warnings). Conftest forces `airgrid_test_db`, disabled AI/collector defaults and temporary model storage; never point pytest at `airgrid_db`. New tests use the `auth_client(role)` fixture in `conftest.py`.
4. Frontend: `npm --prefix apps/web run build` (non-fatal >500 kB chunk warning is known).
5. Browser fixtures: start Vite with `npm --prefix apps/web run dev -- --host 127.0.0.1 --port 5187`, then `AIRGRID_PLAYWRIGHT_MODULE=<cached playwright> node docs/verification/verify_phase_06.cjs`. A cache existed at `~/.npm/_npx/9833c18b2d85bc59/node_modules/playwright`. The script intercepts every API call and blocks external traffic.
6. Database: both databases are at `0011_optimization_plans`; `alembic check` is clean. New migrations must be additive or explicitly approved. A pre-0008 backup of `airgrid_db` is at `~/Projects/airgrid-backups/`. Test any migration with upgrade → downgrade → upgrade on `airgrid_test_db` first (export `DATABASE_URL_SYNC` for the test DB).
7. Collection, probes, speed tests, AI providers and training on real data require the owner. Leave `AIRGRID_COLLECTOR_ENABLED` false and the AI gateway unconfigured unless the owner enables them.
8. Open items: collector rate-limit tradeoff decision; shared limiter store before multi-worker deployment; per-user campus scoping (not modeled); placeholder routes (`/devices`, `/monitor`, `/ai-models`, `/alerts`, `/reports`); optional removal of redundant unique-column indexes; real-hardware and real-provider verification.

Do not begin Phase 09, deploy, modify router settings or run live tests without explicit owner approval.
