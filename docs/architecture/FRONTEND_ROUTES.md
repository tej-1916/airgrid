# AIRGRID | Frontend Route Structure & Design System

## 1. Design System & Theme Foundations

AirGrid implements an enterprise dark theme optimized for network operations centers (NOCs) and field engineering:
- **Surface Palette:**
  - Base Background: Deep charcoal / void navy (`#0B0F17`)
  - Elevated Surface: Card & panel dark navy (`#111827`)
  - Border Accents: Subtle border slate (`#1F2937` / `#374151`)
- **Accent Palette:**
  - Primary Electric Cyan: `#06B6D4` / `#22D3EE` (Wi-Fi signal, primary actions, highlights)
  - Secondary Electric Blue: `#3B82F6` / `#60A5FA` (Navigation, active states, metrics)
  - Warning Amber: `#F59E0B` (Degraded status, unverified models)
  - Critical Crimson: `#EF4444` (Dead zones, offline APs, fatal alerts)
  - Success Emerald: `#10B981` (Online APs, verified execution, healthy probes)
- **Typography:** Inter / system monospace for network metrics (MACs, IPs, BSSIDs, RSSI dBm).
- **Layout Shell:** Collapsible navigation sidebar, breadcrumb-driven header bar, real-time connection status pill, and responsive main viewport.

---

## 2. 16 Application Pages Route Table

| No. | Page Title | Route Path | Access / Role | Shell | Phase 00 State |
|---|---|---|---|---|---|
| **01** | Landing Page | `/` | Public | Minimal Hero | Architecture overview, capabilities summary, link to login/dashboard |
| **02** | Login & Authentication | `/auth/login` | Public | Auth Centered | Credentials input, role switcher preview, JWT auth stub |
| **03** | Command Center | `/dashboard` | Authenticated | Standard Shell | High-level campus network status overview placeholder |
| **04** | Campus & Building Manager | `/campuses` | NetworkAdmin | Standard Shell | Hierarchy view (Campuses -> Buildings -> Floors) |
| **05** | Wi-Fi Heatmap Studio | `/heatmaps` | FieldTech+ | Standard Shell | 2D floor-plan canvas placeholder with RF layer selector |
| **06** | Network Speed Test Lab | `/speed-test` | Authenticated | Standard Shell | Client browser speed test trigger interface placeholder |
| **07** | Device & AP Manager | `/devices` | NetworkAdmin | Standard Shell | Access points and survey device registry table |
| **08** | Live Network Monitor | `/monitor` | Authenticated | Standard Shell | Real-time AP status & health telemetry feed placeholder |
| **09** | AI Diagnostics Studio | `/ai-diagnostics` | NetworkAdmin | Standard Shell | Natural language network troubleshooting studio |
| **10** | AI Model Control Center | `/ai-models` | SuperAdmin | Standard Shell | Provider status, requested vs verified audit view |
| **11** | ML Prediction Lab | `/ml-lab` | NetworkAdmin | Standard Shell | RF path-loss model training & evaluation studio |
| **12** | AP Optimization Studio | `/ap-optimization` | NetworkAdmin | Standard Shell | Placement simulation and coverage optimization studio |
| **13** | n8n Automation Center | `/automations` | SuperAdmin | Standard Shell | Webhook trigger configurations & payload inspection |
| **14** | Alerts & Notifications | `/alerts` | Authenticated | Standard Shell | Degradation and dead-zone event inbox placeholder |
| **15** | Analytics & Reports | `/reports` | Authenticated | Standard Shell | Historical performance trends and SLA reporting |
| **16** | Settings & Administration | `/settings` | SuperAdmin | Standard Shell | System configurations, API keys, and audit logs |

---

## 3. Navigation Hierarchy & Sidebar Structure

```
[AIRGRID LOGO & STATUS BADGE]
├── OPERATIONS
│   ├── [03] Command Center (/dashboard)
│   ├── [08] Live Monitor (/monitor)
│   ├── [14] Alerts & Notifications (/alerts)
│   └── [15] Analytics & Reports (/reports)
├── WIRELESS & SURVEYING
│   ├── [04] Campus & Buildings (/campuses)
│   ├── [05] Heatmap Studio (/heatmaps)
│   ├── [06] Speed Test Lab (/speed-test)
│   └── [07] Devices & APs (/devices)
├── AI & INTELLIGENCE
│   ├── [09] AI Diagnostics (/ai-diagnostics)
│   ├── [10] AI Model Control (/ai-models)
│   ├── [11] ML Prediction Lab (/ml-lab)
│   └── [12] AP Optimization (/ap-optimization)
└── SYSTEM & INTEGRATION
    ├── [13] n8n Automations (/automations)
    └── [16] Settings & Admin (/settings)
```

---

## 4. Phase 00 Implementation Rules

1. **Clear Phase 00 Status Badges:** Every page contains an informative, enterprise-styled header pill:
   `Phase 00 Foundation: Route & Component Shell Established`.
2. **No Fabricated Metrics:** Placeholder views do not generate random fake throughput (e.g. "842 Mbps") or fake online AP percentages. They clearly display structural layout containers, schema definitions, and actionable next-phase milestone descriptions.
