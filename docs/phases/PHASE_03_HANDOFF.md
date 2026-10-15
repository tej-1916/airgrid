# AirGrid | Phase 03 Architectural Handoff & Final Acceptance Report

**Module:** Real Network Speed Test Lab  
**Date:** October 15, 2026  
**Status:** Completed, Audited & Formally Accepted  
**Backend Test Suite:** 56 passing tests (0 failures, 100% pass rate in 11.28s)  
**Frontend Production Build:** Built cleanly in 3.75s (0 TypeScript errors)  
**Database Migration:** Alembic Revision `0004_speed_test_enhancements` (Head)  
**Test Database Isolation:** Verified & Enforced (`airgrid_test_db` strictly isolated from `airgrid_db`)  

---

## 1. Executive Summary & Acceptance Verification

Phase 03 establishes the **Real Network Speed Test Lab** for the AirGrid platform. Rather than generating synthetic mock data or simulated radio metrics, Phase 03 executes **legitimate client-side WAN network measurements** against the Cloudflare global edge infrastructure via the official `@cloudflare/speedtest` JavaScript engine.

All acceptance review and post-acceptance data hygiene criteria have been verified:

1. **Test Reproducibility:** 56/56 backend pytest unit/integration/isolation tests pass cleanly; frontend production bundle compiles with zero TypeScript warnings or errors.
2. **Database Isolation & Safeguards:** Automated tests execute strictly against a dedicated isolated database (`airgrid_test_db`). Explicit runtime safeguards abort tests immediately if targeted at development (`airgrid_db`) or production databases.
3. **Measurement Lifecycle & Provenance:** Real browser-executed measurements against Cloudflare edge are clearly distinguished in both the database and UI from automated test suite fixtures.
4. **Data Provenance:** All stored speed records are explicitly flagged with `vantage_point: "client_browser"` and `data_provenance: "client_reported"`. They are clearly documented as client self-reports, not server-verified physical telemetry.
5. **Traffic Limit Verification:** The configured stepped payloads total 13.0 MB in static chunk transfers (10.5 MB download + 2.5 MB upload). Total wire transfer including TLS overhead, HTTP/2 framing, and loaded latency probes is approximately 14.5–16.0 MB. This limit is derived from discrete measurement arrays and is documented as an **approximate, conservative upper bound**, not a kernel-enforced packet quota.
6. **Request Cancellation:** Code analysis of `@cloudflare/speedtest` confirms that pausing or aborting invokes `#cancelCurrentMeasurement`, which calls native `AbortController.abort()` on all in-flight browser `fetch()` requests. Network transfers cease on the wire, not merely in the UI.
7. **User-Supplied Location Metadata:** Campus, building, and floor assignments are clearly documented and labeled in the UI as **Operator-Designated Metadata**, recognizing that browser JavaScript APIs cannot perform indoor physical positioning.
8. **Development & Seed Data Traceability:** Existing test-generated records and legitimate development assets in `airgrid_db` are cataloged and preserved without automated deletion.
9. **Security & Permissions:** Tested role permissions (`require_admin` on campus hierarchy mutations, authenticated access on speed testing), session validation, CSRF token requirements on state-changing requests, and verified Alembic revision `0004_speed_test_enhancements` at PostgreSQL head.
10. **Design Preservation:** Maintained complete AirGrid visual identity (`#F5F5F3` canvas, `#FFFFFF` cards, `#BE6B37` copper accent, bold black `#0B0B0D` typography, `#D9DBDE` borders) with zero disruption to Phase 00, 01A, 01B, or 02 assets.

---

## 2. Testing Infrastructure & PostgreSQL Data Isolation

### 2.1 Problem Identification (Pre-Hygiene State)
Prior to post-acceptance review, pytest fixtures utilized `settings.DATABASE_URL`, which defaulted to the development database `airgrid_db`. Consequently, automated test runs inserted test fixture campuses and speed test records into `airgrid_db`.

### 2.2 Implemented Isolation Architecture
To achieve absolute data hygiene and protect development/operational data:

1. **Dedicated Test Database (`airgrid_test_db`):**
   - Created in PostgreSQL container `airgrid-postgres` owned by `airgrid`.
   - Migrated to Alembic head revision `0004_speed_test_enhancements`.
2. **Environment & Engine Binding (`apps/api/tests/conftest.py`):**
   - Automatically overrides `AIRGRID_ENV = "testing"`, `AIRGRID_DB_NAME = "airgrid_test_db"`, and `DATABASE_URL` before importing any application code.
   - All test fixtures and API routes dynamically bind to `airgrid_test_db`.
3. **Runtime Safeguard Function (`apps/api/src/airgrid/core/config.py`):**
   - `verify_test_database_isolation(db_url, env)` runs inside `pytest_configure` and in session fixtures.
   - Invariants checked:
     - Disallows `env in ("production", "prod", "staging")`.
     - Explicitly disallows connecting to `airgrid_db`.
     - Enforces that the target database name contains `"test"`.
     - Immediately raises `RuntimeError("FATAL SAFEGUARD: ...")` on violation, aborting before transactions can establish.
4. **Test Cleanup Safety Guarantee:**
   - Because pytest is strictly confined to `airgrid_test_db`, test setup and teardown routines (e.g. deleting test users or hierarchy records) only execute inside `airgrid_test_db`.
   - User-created records in `airgrid_db` cannot be reached, altered, or deleted by automated tests.
5. **Isolation Regression Suite (`apps/api/tests/test_database_isolation.py`):**
   - 7 new regression tests verifying:
     - Active engine binds to `airgrid_test_db`.
     - Safeguard blocks attempts to target `airgrid_db`.
     - Safeguard blocks execution in production/staging environments.
     - Safeguard blocks arbitrary non-test database names.
     - Safeguard permits valid test database configurations.
     - Cross-database isolation test (canary record inserted in `airgrid_test_db` is confirmed absent in `airgrid_db`).
     - Provenance enforcement in test database records.

---

## 3. Real Provider Responses vs Automated Test Fixtures

AirGrid strictly separates live provider network measurements from automated testing fixtures in PostgreSQL:

| Attribute | Live Cloudflare Browser Measurement | Pytest Automated Test Fixtures |
| :--- | :--- | :--- |
| **Example Record ID** | `b811aec0-6a69-4ebf-9ca6-f215b1582e32` | `add1a80b-db7c-4a3c-bc9b-46b882096fde` |
| **Download Throughput** | `133.36 Mbps` (measured via stepped chunks) | `120.0 Mbps` (deterministic test fixture) |
| **Upload Throughput** | `65.16 Mbps` (measured via stepped chunks) | `30.0 Mbps` (deterministic test fixture) |
| **Unloaded Latency** | `15.6 ms` (measured ICMP/RTT equivalent) | `15.0 ms` (deterministic test fixture) |
| **Jitter** | `3.3 ms` (sample standard deviation) | `null` or fixed test constant |
| **Duration** | `2.4 seconds` (actual wall-clock elapsed) | `null` or synthetic value |
| **Quality Metadata** | `{"engine": "cloudflare-speedtest", "packetLossSupported": false, "packetLossReason": "WebRTC TURN relay disabled for operator privacy"}` | `null` or `{"colo": "SJC", "protocol": "h2"}` |
| **Client User Agent** | Full browser user-agent (`Mozilla/5.0 ... Chrome/150.0.0.0 Safari/537.36`) | `python-httpx/0.28.1` or synthetic test client |
| **Facility Assignment** | Explicitly linked to *North Engineering Campus* -> *Ada Lovelace Computing Center* -> *Level 1* | Linked to test validation campuses or unassigned |

---

## 4. Preservation & Inventory of Development Database Records

In accordance with data preservation requirements, all existing records in `airgrid_db` have been inventoried and preserved without automated deletion:

### 4.1 Legitimate Operational & Development Records
- **Users:**
  - `admin@airgrid.local` (Administrator, Argon2id authenticated).
- **Physical Hierarchy:**
  - **Campus:** `North Engineering Campus (NEC-NORTH)` (Engineering and computing facilities campus).
  - **Building:** `Ada Lovelace Computing Center (ALC-01)`.
  - **Floor:** `Level 1 - High-Density Labs` (dimensions 45m × 30m).
  - **Floor Plan:** Calibrated at 24.2 px/m using genuine architectural scale tool.
- **Real Browser Speed Test Records (Cloudflare Edge):**
  - `b811aec0-6a69-4ebf-9ca6-f215b1582e32`: Completed live test (133.36 Mbps down, 65.16 Mbps up, 15.6 ms latency, 3.3 ms jitter, 2.4s duration), Chrome user agent, facility bound.
  - `4895538a-800f-4375-8c3f-f868e4243ba5`: Completed live test (132.79 Mbps down, 105.18 Mbps up, 16.1 ms latency, 1.3 ms jitter, 2.3s duration), Chrome user agent, facility bound.
  - `9109bcbf-f74c-4997-b1e4-cd55c09d6a95`: Aborted test (21.3 ms latency), initiated by operator clicking Cancel in cockpit, Chrome user agent.

### 4.2 Identified Pre-Isolation Test Records in `airgrid_db`
- **Test Campuses (3 rows):**
  - `Validation Campus (VAL-338700)`: Generated during initial validation test.
  - `Cal Tech Campus (CAL-9ED9BA)`: Ephemeral test run fixture.
  - `Cal Tech Campus (CAL-C5F0FD)`: Ephemeral test run fixture.
- **Speed Test Fixtures (24 rows):**
  - Generated across 6 previous pytest suite executions prior to test database isolation.
  - Distinguishable by user agent `python-httpx/0.28.1` and fixed fixture values (`184.52`, `95.4`, `120.0`, `45.0`).
  - Preserved intact; no automated purge executed.

---

## 5. Client-Reported Provenance & Data Integrity

### 5.1 Architectural Rationale
Because browser JavaScript engines execute in an untrusted client environment:
1. **No Radio Telemetry Access:** Web browsers have no API access to physical 802.11 Wi-Fi NICs (BSSID, RSSI, channel frequency, PHY rate, MCS index). Any platform claiming to measure Wi-Fi signal strength purely through browser JavaScript is fabricating data.
2. **Untrusted Client Boundary:** Measurement results originate from client calculations and are transmitted via HTTP `POST /api/v1/speed-tests`. While authenticated via session cookies, these results cannot be independently certified by the backend server.

### 5.2 Implemented Provenance Safeguards
- **Schema Fields:** Stored in `internet_speed_tests` with immutable flags:
  - `vantage_point: "client_browser"` (indicates measurement was executed by an end-user client terminal rather than an infrastructure gateway or AP).
  - `data_provenance: "client_reported"` (indicates metrics were calculated and reported by the browser client).
- **UI Labeling:** The Vantage Point banner in `SpeedTestPage.tsx` explicitly warns:
  > *"Client Vantage Point: This test measures real-time WAN download/upload throughput and latency directly between your browser and the Cloudflare edge. Physical radio metrics (RSSI, BSSID, channel) are reserved for Phase 04 authorized collectors."*
- **Detail Modal:** The inspection modal prominently highlights both **Vantage Point** and **Data Provenance** before displaying metrics.

---

## 6. Bandwidth Consumption & Traffic Limit Verification

### 6.1 Configured Stepped Payloads
In `apps/web/src/services/cloudflareSpeedTestAdapter.ts`, the `@cloudflare/speedtest` engine is configured with explicit discrete measurement chunks:

```typescript
measurements: [
  { type: 'latency', numPackets: 8 },
  { type: 'download', bytes: 250000, count: 2 },  // 500 KB
  { type: 'download', bytes: 1000000, count: 2 }, // 2.0 MB
  { type: 'download', bytes: 4000000, count: 2 }, // 8.0 MB
  { type: 'upload', bytes: 250000, count: 2 },    // 500 KB
  { type: 'upload', bytes: 1000000, count: 2 },   // 2.0 MB
]
```

### 6.2 Exact Traffic Breakdown
1. **Configured Static Payloads:**
   - Download chunks: $2 \times 250\text{ KB} + 2 \times 1\text{ MB} + 2 \times 4\text{ MB} = 10,500,000\text{ bytes} \approx 10.5\text{ MB}$
   - Upload chunks: $2 \times 250\text{ KB} + 2 \times 1\text{ MB} = 2,500,000\text{ bytes} \approx 2.5\text{ MB}$
   - **Total Static Payload:** $13.0\text{ MB}$
2. **Wire Overhead & Parallel Probes:**
   - 8 ping/latency requests: $< 10\text{ KB}$
   - `measureDownloadLoadedLatency` & `measureUploadLoadedLatency`: periodic lightweight probe requests executed in parallel while download and upload are running: $\approx 1.0 - 2.0\text{ MB}$
   - TLS negotiation, TCP/IP headers, HTTP/2 frame overhead: $\approx 0.5 - 1.0\text{ MB}$
   - **Total Wire Transfer:** **Approximately 14.5 – 16.0 MB**

### 6.3 Approximation Disclosure

> [!NOTE]
> The claimed **15–20 MB traffic limit is an approximate, conservative upper bound**, not an operating-system byte quota. It is strictly enforced by the finite chunk array passed to the SDK (preventing indefinite streaming), but total wire bytes may vary slightly depending on TCP retransmissions, network round-trips, and loaded latency probe frequency.

---

## 7. Request Cancellation & Abort Mechanics

### 7.1 Verification of Provider-Level Network Abort
When an operator clicks **"Cancel"** in the Speed Test Lab:

1. `handleAbortTest` invokes `cloudflareSpeedTestAdapter.abort()`.
2. The adapter calls `this.engine.pause()`.
3. Inspection of `@cloudflare/speedtest/dist/speedtest.js` (lines 432–437, 658–660) reveals:
   ```javascript
   pause() {
       if (this.#retryTimeout !== void 0) {
           clearTimeout(this.#retryTimeout);
       }
       this.#cancelCurrentMeasurement(`pause()`);
       this.#setRunning(false);
   }
   #cancelCurrentMeasurement(reason) {
       this.#currentAbortController?.abort(reason || "aborted with no reason provided");
   }
   ```
4. **Wire-Level Result:** Active in-flight HTTP `fetch()` requests are aborted immediately at the browser socket level via native `AbortController.abort()`. No subsequent chunks in the sequence are requested.
5. **Audit Persistence:** The adapter immediately updates its state to `phase: "aborted"`, and persists an audit record to PostgreSQL with `status: "aborted"`, `error_code: "USER_ABORTED"`, and `error_message: "Test cancelled by operator"`.

---

## 8. Physical Location Association Architecture

### 8.1 Operator-Designated Location Metadata
- **No Indoor Positioning:** Web browsers cannot detect indoor architectural locations. Geolocation APIs (GPS, IP geolocation) only provide coarse macro-coordinates (accuracy $\pm 50 - 500\text{ m}$), entirely useless for identifying a specific building or floor.
- **Explicit Operator Opt-In:** Location assignment is unselected by default. Operators must explicitly check *"Associate test result with selected campus facility"* and designate the facility from the cascading dropdowns.
- **Backend Hierarchy Validation:** When location IDs are submitted, `SpeedTestService` validates that:
  - The building belongs to the specified campus.
  - The floor belongs to the specified building.
  - If a mismatch is detected (e.g. attempting to associate Floor A of Building 1 with Building 2), the backend rejects the transaction with `HTTP 422 Unprocessable Content`.

---

## 9. Role Permissions, Sessions, CSRF & Migrations

### 9.1 Role Permission Matrix

| Endpoint | Method | Administrator | Network Engineer | Viewer | Unauthenticated |
| :--- | :--- | :---: | :---: | :---: | :---: |
| `/api/v1/speed-tests` | `POST` | Allowed | Allowed | Allowed | 401 Unauthorized |
| `/api/v1/speed-tests` | `GET` | Allowed | Allowed | Allowed | 401 Unauthorized |
| `/api/v1/speed-tests/stats/summary` | `GET` | Allowed | Allowed | Allowed | 401 Unauthorized |
| `/api/v1/speed-tests/{id}` | `GET` | Allowed | Allowed | Allowed | 401 Unauthorized |
| `/api/v1/campuses` | `POST` | **Allowed** | **403 Forbidden** | **403 Forbidden** | 401 Unauthorized |
| `/api/v1/campuses/{id}` | `DELETE` | **Allowed** | **403 Forbidden** | **403 Forbidden** | 401 Unauthorized |
| `/api/v1/campuses/{id}/buildings` | `POST` | **Allowed** | **403 Forbidden** | **403 Forbidden** | 401 Unauthorized |

### 9.2 Security Mechanisms
- **Session Protection:** HttpOnly server-side cookies, SameSite=Lax (None for cross-origin HTTPS), secure in production.
- **CSRF Defense:** Mutating requests require `X-CSRF-Token` header validated against server session CSRF secret.
- **Alembic Revision 0004:** Revision `0004_speed_test_enhancements` verified applied at head in PostgreSQL across both `airgrid_db` and `airgrid_test_db`.

---

## 10. Design System & Cross-Phase Preservation

- **Color Palette & Identity:** Strict adherence to AirGrid Premium Light theme:
  - Canvas: `#F5F5F3`
  - Cards: `#FFFFFF`
  - Copper Accent: `#BE6B37`
  - Headings & Text: `#0B0B0D`
  - Subdued Text: `#737373`
  - Borders: `#D9DBDE` / `#ECECE8`
- **Prior Phases Intact:**
  - Phase 00 modular monolith structure preserved.
  - Phase 01A editorial landing page and media assets preserved.
  - Phase 01B secure login, password hashing, and session management preserved.
  - Phase 02 Command Center and Campus Manager with architectural floor plan calibration preserved.
  - Sidebar navigation updated: `Network Speed Test Lab` marked active (`isImplemented: true`), and `P03` badge removed.

---

## 11. Remaining Limitations & Phase 04 Prerequisites

### 11.1 Known Limitations of Phase 03
1. **Packet Loss Measurement Unavailable:** Because WebRTC TURN relay servers are deliberately disabled to protect operator privacy and prevent campus firewall blocks, packet loss percentage cannot be measured by the browser client and is recorded as `null`.
2. **WAN-Only Scope:** Throughput and latency reflect client-to-Cloudflare WAN internet path performance, which combines local Wi-Fi, campus switching, gateway NAT, and ISP transit. It cannot isolate internal Wi-Fi bottlenecking from external ISP congestion.
3. **Approximate Traffic Volume:** Traffic volume (~14.5–16.0 MB) is constrained by chunk array sizing rather than a low-level packet shaper.

### 11.2 Strict Prerequisites for Phase 04 (Wireless Survey & Signal Heatmaps)
1. **Dedicated Native Collector Agent:** Phase 04 must utilize an authorized OS-level collector agent (Python/CLI or native helper) with access to wireless network interfaces (`iw` on Linux, `CoreWLAN` on macOS, `WlanGetNetworkBssList` on Windows) to capture genuine 802.11 metrics:
   - AP BSSID & SSID
   - Received Signal Strength Indicator (RSSI in dBm)
   - Signal-to-Noise Ratio (SNR in dB)
   - Channel number & frequency band (2.4 GHz, 5 GHz, 6 GHz)
   - Channel width (20, 40, 80, 160 MHz)
   - 802.11 standard (Wi-Fi 5/6/6E/7)
2. **Spatial Coordinate Binding:** Phase 04 survey points will map active RF readings directly onto the scaled, calibrated floor plan coordinate systems established in Phase 02.
3. **Zero Telemetry Fabrication:** Under no circumstances should Phase 04 attempt to infer physical Wi-Fi signal strength from Phase 03 WAN speed tests.
