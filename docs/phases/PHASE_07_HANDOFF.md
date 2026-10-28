# Claude completion amendment — 2026-10-28

**Acceptance: grounded conversational analysis, comparisons and history implemented; real provider unverified.**

- `POST /api/v1/analyst/ask` answers six question types (weak signal with persistence class; 24 h vs previous 24 h; latency halves; measurement gaps; survey session summaries; ML vs IDW held-out RMSE) from persisted records with citations (record ID, metric, value, timestamp), or states missing evidence. Unsupported questions list the supported topics.
- Optional gateway pass requires explicit consent and may only rephrase. Unknown citations or any number absent from evidence/local answer/question → `rejected_ungrounded`, and the local answer is shown. `POST /analyst/ask/preview` returns the exact outbound text and sends/stores nothing. Network names, addresses, device names, plans and notes are excluded. Unconfigured providers report `unconfigured`; success is never fabricated.
- `POST /analyst/compare`: median comparison of two windows per source/device (never pooled). Session comparison is shared with optimization.
- `analysis_records` (migration 0010): kind, question, scope, evidence refs, freshness, mode, gateway status, provider-reported model, outcome, error, operator. All users can read; only admins can delete (audited); included in retention. `/ai-analyst` has tabs: saved report, ask, compare, history.
- **Not done:** verification against a real local or remote model (owner configuration); `/ai-models` remains a shell.

---

# Phase 07 handoff — AI Gateway and evidence Analyst

Date: 2026-10-28. **Implemented core slice; full requested Phase 07 scope is partial.**

The existing gateway was hardened instead of adding another provider abstraction. Configuration defaults disabled/empty; only approved configured models execute. Local loopback providers may omit credentials; remote endpoints require HTTPS and credentials. Requests have bounded input, a timeout, zero retries, at most 1024 completion tokens and ten generations per minute per process. API routes require authentication; generation/provider health require engineer/admin and CSRF. Provider errors never include upstream bodies or exception secrets. Known configured secrets are redacted from successful output too. Provider identity is explicitly self-reported, not attested.

`/ai-analyst` lists up to 100 saved diagnostic sessions. `POST /api/v1/analyst/analyze` reloads a saved report and recomputes deterministic rules, returning observed metrics, source IDs/timestamps, findings, limitations, uncertainty and recommended checks. No model call occurs by default. Browser speed values without an authoritative source timestamp remain timestamp-unavailable. Missing reports return 404; absent telemetry returns a useful empty report.

Explicit approval enables an optional gateway pass. Only minimized metric values/severities and opaque source IDs leave the app. No SSID/BSSID, IP/MAC, device name, floor plan, arbitrary notes or historical finding prose is sent. The model may select existing finding IDs to prioritize review. Unknown IDs, duplicates, empty selections, arbitrary text or extra JSON fields are rejected. All deterministic findings remain visible. The model cannot introduce measurement claims or execute tools.

The workspace provides desktop/mobile layouts and browser printing/Save PDF through printable HTML. React renders text normally, without HTML execution. Network Tools links saved results to the Analyst.

Verification includes mocked success/substitution, missing models, HTTP/auth failures, timeout, rate limits, consent, default-local behavior, secret redaction, minimized prompts, injection-like labels, unsupported output/reference rejection, missing data, API authentication and engineer/viewer checks. No paid/external provider was contacted. Fixture browser checks exercise selection, local analysis, disabled provider actions and printable output at 1440/390 widths.

Remaining scope: unrestricted evidence-grounded conversational explanations, speed-test history analysis, heatmap/ML/floor/campus report aggregation, session comparisons, stored AI execution audit history and a shared multi-worker limiter. Free-text AI diagnoses are intentionally not accepted by the current constrained Analyst. Provider configuration/health remains operator-dependent. The `/ai-models` page remains its earlier shell, not a completed provider administration UI.

No migration added. See current verification and Git checkpoint in `docs/development/AUTONOMOUS_PROGRESS.md`.
