# AirGrid Phase 02 | Visual Direction

## References

- `references/phase02-command-center-reference.png` (Flexora): inspiration for the **Command Center** layout: broad left navigation, compact top bar, segmented overview tabs, lightweight metric cards, generously spaced charts, monochrome icon system, and precise orange accents.
- `references/phase02-campus-manager-reference.png` (OptiSpace): inspiration for the **Campus & Building Manager**: building/floor selector, map-centric workspace, layered contextual information cards, and spatial diagram composition.

These references are **design-study assets**, not AirGrid products or screenshots. Do not use the original screenshots as UI backgrounds, ship them to the public site, copy their names or logos, or reproduce fictional data.

## AirGrid's one design system

The Phase 01A landing page establishes the core visual identity, and these two references shape the inner console's layout only.

- Background: `#F5F5F3` (warm off-white)
- Surface: `#FFFFFF` / `#ECECE8` (warm white / soft neutral)
- Primary text: `#0B0B0D` (near black)
- Copper accent: `#BE6B37`
- Muted text: `#737373`
- Borders: soft neutral grey, light weight
- Control shapes: rounded rectangles, restrained pills
- Icons: consistent Lucide stroke width
- Motion: minimal; reduced-motion accessible
- Dark panels: for network topology, plots, visualization only; keep overall shell light

## Command Center composition

1. Persistent collapsible left sidebar with the AirGrid mark, grouped routes, and active copper indicator.
2. Header with page title, compact breadcrumb/campus selector, backend connection state verified from API, operator menu.
3. Tab/navigation controls (Overview, Activity, Inventory), but only wire tabs that have valid data and behavior; otherwise label their future-phase state.
4. Summary cards **only for actual database counts**: campuses, buildings, floors, uploaded plans. Network measurement panels display clear 'No measurements yet' empty states.
5. Activity timeline based on stored system events, not fabricated charts.
6. Responsive views: sidebar turns into an accessible drawer on smaller screens.

## Campus Manager composition

1. Campus → Building → Floor selectors driven by real DB content and RBAC.
2. Large workspace focusing on a properly scaled **2D floor plan** with zoom/pan and precise selection.
3. Optional isometric *illustrative* preview can be rendered as original SVG/CSS in a distinct visualization mode, never presented as surveyed spatial data.
4. Floating contextual cards display current selections and actual stored metadata, not imported metrics from the reference.
5. Clearly labelled dimension calibration; no assumptions about real-world scale unless user calibrates it.
6. Create/Edit/Archive interactions follow roles and are persisted via API.

## Truthfulness and rights

- The references may belong to third parties. Use them only to study composition and style. Do not redistribute them as website assets.
- Never reuse Flexora or OptiSpace branding or their numbers.
- No invented APs, speeds, live health, attendance, business statistics, or AI activity.
- Phase 02 is campus management and DB-derived summaries, not network performance collection.
