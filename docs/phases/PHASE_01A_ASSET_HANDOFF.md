# AirGrid — Phase 01A: User Asset Integration & Visual Refinement Report

**Project:** AirGrid — AI-Powered Campus Network Intelligence, Monitoring and Optimization Platform  
**Document:** `docs/phases/PHASE_01A_ASSET_HANDOFF.md`  
**Phase:** 01A — Visual Refinement & Authentic User Asset Integration  
**Date:** October 14, 2026  
**Status:** Complete & Fully Verified  

---

## 1. Executive Summary & Design Mandate

Following the initial editorial architecture of Phase 01A, this milestone successfully integrated all authentic media assets supplied by the user into the AirGrid landing page, replacing temporary placeholders without modifying working backend APIs or initiating subsequent development phases.

### Key Mandates Upheld:
1. **Preservation of Authentic Media:** All 4 user-supplied assets (`network_lines_original.mp4`, `network_globe_white.png`, `network_lattice_white.png`, `wifi_router_lineart.png`) remain intact in `apps/web/public/assets/airgrid/`. No synthetic AI-generated replacements were used.
2. **True Video Alpha Transparency:** Processed the black background of `network_lines_original.mp4` using calibrated FFmpeg chroma-key filters into an optimized transparent WebM container (`network_lines_alpha.webm`, VP9 `yuva420p`), preserving fine white lines and red coordinate typography.
3. **High-Contrast Editorial Composition:** Positioned white transparent assets against deep obsidian surfaces (`#0B0B0D`) with subtle copper-orange ambient glows (`#BE6B37`), while framing the continuous-line art in its native ivory/cream tone (`#FAF5EE`).
4. **Audit of Misleading Claims:** Eliminated all fabricated metrics, fake 5-star ratings, unverified vendor badges, and invented campus telemetry, replacing them with truthful architectural specifications.

---

## 2. Asset Inspection & Placement Matrix

| User Asset | Format & Dimensions | Intrinsic Characteristics | Placement on Landing Page | Rationale & Contrast Treatment |
| :--- | :--- | :--- | :--- | :--- |
| **`network_lattice_white.png`** | PNG (RGBA), `1179 × 1334` | Pure bone-white organic network lattice with alpha transparency | **Section 01: Hero Centerpiece** (`HeroSculpture.tsx`) | Mounted over an obsidian dark circular lens (`#0B0B0D`) with subtle copper-orange ambient glow and orbital coordinates. Eliminates previous AI placeholder while providing high contrast. |
| **`network_globe_white.png`** | PNG (RGBA), `1254 × 1254` | White geodesic coordinate sphere with alpha transparency | **Section 02: About AirGrid** | Mounted on an obsidian dark pedestal card (`#0B0B0D`) with copper radial aura and labeled `Spatial RF Matrix / Geodesic Model`. Replaces temporary SVG wireframe circle. |
| **`wifi_router_lineart.png`** | PNG (RGBA), `735 × 490` | Continuous line illustration of router, waves, and infrastructure with solid cream background | **Section 04: Physical Layer Spotlight** | Integrated into a custom `#FAF5EE` card with warm editorial borders (`#E8E2D5`), celebrating physical survey realities without claiming transparency. |
| **`network_lines_original.mp4`** | MP4 (H.264/AAC), `720 × 720`, 32.00s, 30fps | Rotating 3D network with white lines and red coordinate labels on black | **Section 05: Platform Showcase** (Fallback source) | Preserved untouched as standard fallback. |
| **`network_lines_alpha.webm`** | WebM (VP9 `yuva420p`), `720 × 720`, 32.00s | True alpha transparent video stream, audio removed | **Section 05: Platform Showcase** (`ShowcaseVideo.tsx`) | Primary transparent playback element embedded in the large black Command Center panel. |
| **`network_lines_fallback.mp4`** | MP4 (H.264), `720 × 720`, 32.00s | Muted, optimized H.264 video stream | **Section 05: Platform Showcase** | Fallback for browsers that do not support WebM alpha. |
| **`network_lines_poster.png`** | PNG (RGB), `720 × 720` | Extracted high-density frame at `00:00:12` | **Section 05: Platform Showcase** | Static poster frame for reduced-motion users and initial load state. |

---

## 3. Video Processing & Transparency Engineering

### 3.1 Background Color Extraction & Alpha Keying
Pixel analysis of `network_lines_original.mp4` revealed background compression noise in the range of `RGB(0, 0, 0)` to `RGB(4, 4, 4)`, fine white lines with luminance `Y > 180`, and red coordinate texts with `R ∈ [61, 215]` and `G, B < 40`.

A naive luminance key (`lumakey`) would key out dark red text. Instead, a tuned `colorkey` filter was deployed in RGB color-distance space:
```bash
-vf "colorkey=0x000000:0.08:0.05,format=yuva420p"
```
- **Similarity (`0.08`):** Keys out all dark compression artifacts up to distance ~20.
- **Blend (`0.05`):** Softens the antialiased line edges, preventing harsh fringing or clipping.

### 3.2 Exact FFmpeg Execution Commands

#### 1. Optimized Transparent WebM (VP9 + Alpha):
```bash
ffmpeg -y -i apps/web/public/assets/airgrid/network_lines_original.mp4 \
  -vf "colorkey=0x000000:0.08:0.05,format=yuva420p" \
  -c:v libvpx-vp9 \
  -b:v 900k -crf 36 -quality good -speed 4 -row-mt 1 \
  -an \
  apps/web/public/assets/airgrid/network_lines_alpha.webm
```
- **Audio:** Completely stripped (`-an`), saving unnecessary bandwidth.
- **Encoding Profile:** VP9 with `TAG:alpha_mode=1` and `yuva420p` pixel format.
- **Output Size:** `10,463,719 bytes` (~10 MB, a 48% reduction compared to the 20 MB original).

#### 2. Static Poster Extraction:
```bash
ffmpeg -y -ss 00:00:12 -i apps/web/public/assets/airgrid/network_lines_original.mp4 \
  -vframes 1 \
  apps/web/public/assets/airgrid/network_lines_poster.png
```

#### 3. Optimized Fallback MP4 (No Audio):
```bash
ffmpeg -y -i apps/web/public/assets/airgrid/network_lines_original.mp4 \
  -c:v libx264 -crf 23 -preset medium \
  -an \
  apps/web/public/assets/airgrid/network_lines_fallback.mp4
```

### 3.3 Browser Compatibility Matrix
- **Chrome / Chromium / Edge / Brave (Blink):** Full hardware-accelerated playback of WebM VP9 with true alpha transparency.
- **Firefox (Gecko):** Native support for WebM VP9 with alpha transparency.
- **Safari / WebKit:** WebKit does not universally support alpha in VP9 WebM. The `<video>` component gracefully falls back to `network_lines_fallback.mp4` / `network_lines_original.mp4` inside the dark showcase container, where the black background naturally blends into the `#0B0B0D` panel.
- **Reduced-Motion Preference:** Automatically halts video playback, displays the static poster `network_lines_poster.png`, and exposes manual Play/Pause toggle buttons.

---

## 4. Truthful Architectural Claims Audit (Requirement 7)

Every misleading or fabricated claim identified on the public landing page was audited and remediated:

| Location | Prior Unverified / Fabricated Claim | Remediated Truthful Specification |
| :--- | :--- | :--- |
| **Header Status** | `Grid Telemetry Active` (fake green pulse) | `Architecture Foundation • Phase 01A Specification Ready` |
| **Hero Trust Badge** | 5 Copper Stars (`Institutional Campus Standard`) | `Campus Airspace Intelligence Specification • 802.11ax / 6GHz` |
| **Hero Floating Card** | `184.2 Mbps • Latency 11ms` | `Client Benchmark Specification • RFC 3550` |
| **Hero Floating Card** | `Llama 3.3 70B • Verified` | `Model Verification Contract • Provider Agnostic` |
| **Hero Vendor Ticker** | `Cisco Catalyst • Aruba Instant • UniFi Enterprise` | `Target Ecosystems: IEEE 802.11k/v/r • Enterprise AP Telemetry • Linux iw/nmcli` |
| **Showcase Header** | `● 100% OPERATIONAL SPEC` | `● CONCEPTUAL PREVIEW (PHASE 00 ARCHITECTURE)` |
| **Showcase Campus** | `North Campus (NC-ENG) • 3 Buildings / 9 Floors` | `Campus Hierarchy Model (Configurable Entity: Campus → Building → Floor)` |
| **Showcase APs** | `38 Managed APs • Aruba AP-535 / Cisco 9130` | `AP Inventory Schema (Relational PostgreSQL AccessPoint ORM Model)` |
| **Section 07 Backend**| `sub-50ms endpoint latencies` | `Async Python 3.12+ ASGI engine with strict domain boundaries and non-blocking I/O` |

---

## 5. Modified Files & Components

1. **`apps/web/src/components/landing/HeroSculpture.tsx`**:
   - Replaced artificial SVG/PNG composition with `network_lattice_white.png`.
   - Built obsidian aperture disc (`#0B0B0D`) with subtle copper glow and orbital RF rings.
2. **`apps/web/src/components/landing/ShowcaseVideo.tsx`**:
   - Created dedicated video playback module with WebM alpha, MP4 fallbacks, and static poster.
   - Built `prefers-reduced-motion` detection, play/pause controls, and honest conceptual simulation labeling.
3. **`apps/web/src/pages/LandingPage.tsx`**:
   - Integrated `network_globe_white.png` into Section 02 on dark pedestal card.
   - Added Section 04 spotlight card for `wifi_router_lineart.png` with cream styling.
   - Embedded `ShowcaseVideo` into Section 05 dark showcase grid.
   - Removed `Star` icon import; corrected all claims.
4. **`apps/web/public/assets/airgrid/`**:
   - Preserved original 4 files.
   - Added `network_lines_alpha.webm`, `network_lines_fallback.mp4`, and `network_lines_poster.png`.

---

## 6. Test Results & Verification Evidence

### 6.1 TypeScript & Frontend Production Build
```bash
$ npm run build
> @airgrid/web@0.1.0 build
> tsc -b && vite build

vite v5.4.21 building for production...
✓ 1598 modules transformed.
dist/index.html                   0.90 kB │ gzip:  0.50 kB
dist/assets/index-Bpx77qiB.css   35.39 kB │ gzip:  6.52 kB
dist/assets/index-D_kyzvSI.js   338.21 kB │ gzip: 91.65 kB
✓ built in 6.28s
```
*Result: 0 errors, 0 warnings.*

### 6.2 Backend Test Suite Regression
```bash
$ apps/api/.venv/bin/pytest -v
============================= test session starts ==============================
rootdir: /home/teju/Projects/airgrid
configfile: pytest.ini
testpaths: apps/api/tests
plugins: asyncio-1.4.0, mock-3.16.0, anyio-4.15.1
asyncio: mode=Mode.AUTO
collected 9 items

apps/api/tests/test_ai_gateway.py ...                                    [ 33%]
apps/api/tests/test_database_schema.py ..                                [ 55%]
apps/api/tests/test_health.py ..                                         [ 77%]
apps/api/tests/test_webhook_signer.py ..                                 [100%]

============================== 9 passed in 0.84s ===============================
```
*Result: 100% passing across health, database models, AI Gateway, and HMAC webhooks.*

### 6.3 Screenshot Inspection Records
Captured via headless Chromium (`127.0.0.1:4173`):
- **Desktop Hero View (`1440 × 950`):** [`docs/design/screenshots/landing-desktop-hero-refined.png`](../../docs/design/screenshots/landing-desktop-hero-refined.png)
  *Confirmed: Lattice sculpture mounted on obsidian aperture, truthful framework badges, and clean editorial balance.*
- **Desktop Full Page (`1440 × 5400`):** [`docs/design/screenshots/landing-desktop-full-refined.png`](../../docs/design/screenshots/landing-desktop-full-refined.png)
  *Confirmed: Dark globe pedestal in Section 02, line art card in Section 04, and video playing in Section 05.*
- **Mobile Viewport (`390 × 7000`):** [`docs/design/screenshots/landing-mobile-full-refined.png`](../../docs/design/screenshots/landing-mobile-full-refined.png)
  *Confirmed: Zero horizontal overflow; all four user assets scale cleanly down to mobile screen widths.*

---

## 7. Known Observations & Phase 01B Readiness

1. **Safari WebM Transparency:** In Safari versions where WebM alpha is unsupported, Safari smoothly falls back to `network_lines_fallback.mp4`. Because the showcase background is deep black (`#0B0B0D`), the visual transition is seamless.
2. **Video Traffic Footprint:** The 10 MB WebM video autoplays muted in the showcase. For bandwidth-constrained field surveys, the poster frame provides an immediate low-latency static view.
3. **Stop Condition Enforced:** No backend APIs, database models, authentication routines, or subsequent phases were modified during this visual refinement.
