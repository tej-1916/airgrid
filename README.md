# AIRGRID

> **AI-Powered Campus Network Intelligence, Monitoring and Optimization Platform**

AirGrid is an enterprise network intelligence platform designed for large-scale university campuses, corporate headquarters, and multi-tenant facilities. It unifies active Wi-Fi coverage mapping, client-side speed measurement, RF signal prediction via machine learning, simulated AP placement optimization, provider-independent AI diagnostics, and event-driven automation via n8n.

---

## Architecture Overview

AirGrid is structured as a **modular monolith** in an organized monorepo:

```
airgrid/
├── apps/
│   ├── api/                   # FastAPI Backend (Modular Monolith)
│   └── web/                   # React 19 + TypeScript + Vite SPA
├── packages/
│   └── shared-contracts/      # Shared TypeScript types and API schemas
├── infrastructure/
│   ├── docker/                # Production & Development container Dockerfiles
│   └── n8n/                   # Automation workflows & signed webhook integration
├── docs/
│   ├── architecture/          # System specifications & design blueprints
│   │   ├── SYSTEM_ARCHITECTURE.md
│   │   ├── DATABASE_DESIGN.md
│   │   ├── API_CONTRACTS.md
│   │   ├── NETWORK_TESTING_DESIGN.md
│   │   ├── AI_GATEWAY_DESIGN.md
│   │   ├── N8N_AUTOMATION_DESIGN.md
│   │   └── FRONTEND_ROUTES.md
│   └── phases/                # Phase milestone handoffs
├── docker-compose.yml         # Container orchestration for local dev
├── .env.example               # Environment template
└── README.md
```

---

## Technology Stack

- **Frontend:** React 19, TypeScript, Vite, Tailwind CSS, React Router, Lucide Icons
- **Backend:** Python 3.12+, FastAPI, Pydantic v2, SQLAlchemy 2.0, Alembic, Pytest
- **Database:** PostgreSQL 16+
- **Machine Learning:** NumPy, SciPy, scikit-learn, Joblib
- **AI Gateway:** Provider-independent adapter layer (OpenAI-compatible / Groq / Local) with model verification & fallback auditing
- **Automation:** n8n with HMAC-SHA256 signed webhooks and replay defense
- **Tooling:** `uv` (Python package & environment manager), `npm`, Docker & Docker Compose

---

## 16 Application Pages (Route Map)

| No. | Page Title | Route Path | Purpose |
|---|---|---|---|
| 01 | Landing Page | `/` | Platform introduction, architecture overview & sign-in |
| 02 | Login & Authentication | `/auth/login` | Secure role-based operator authentication |
| 03 | Command Center | `/dashboard` | High-level network status, active surveys, and system alerts |
| 04 | Campus & Building Manager | `/campuses` | Physical hierarchy management (Campuses, Buildings, Floors) |
| 05 | Wi-Fi Heatmap Studio | `/heatmaps` | 2D floor plans, RF signal propagation layers, and dead-zones |
| 06 | Network Speed Test Lab | `/speed-test` | Client-side active WAN throughput, latency, and jitter tests |
| 07 | Device & Access Point Manager | `/devices` | Inventory of campus APs and field measurement devices |
| 08 | Live Network Monitor | `/monitor` | Real-time AP telemetry, status alerts, and signal fluctuations |
| 09 | AI Diagnostics Studio | `/ai-diagnostics` | Natural language network diagnostics and root cause analysis |
| 10 | AI Model Control Center | `/ai-models` | Model provider configuration, audit trail, and verification |
| 11 | ML Prediction Lab | `/ml-lab` | RF path-loss model training, evaluations, and champion tracking |
| 12 | AP Optimization Studio | `/ap-optimization` | Coverage simulations and algorithmic AP placement recommendations |
| 13 | n8n Automation Center | `/automations` | Webhook subscription management and delivery audit logs |
| 14 | Alerts & Notifications | `/alerts` | Incident inbox for network degradation and dead-zone alerts |
| 15 | Analytics & Reports | `/reports` | Long-term performance trends and executive SLA summaries |
| 16 | Settings & Administration | `/settings` | Global configurations, API keys, and audit logging |

---

## Quickstart (Local Development)

### Prerequisites
- Node.js (v20+ recommended) & npm
- Python (v3.12+ recommended) & `uv` package manager
- Docker and Docker Compose (optional for local containers)

### 1. Environment Setup
```bash
# Clone and enter directory
cd ~/Projects/airgrid

# Copy environment template
cp .env.example .env
```

### 2. Backend Setup (`apps/api`)
```bash
cd apps/api

# Create virtual environment and install dependencies via uv
uv sync

# Run database migrations
uv run alembic upgrade head

# Run automated tests
uv run pytest -v

# Start FastAPI development server
uv run uvicorn airgrid.main:app --host 127.0.0.1 --port 8000 --reload
```

### 3. Frontend Setup (`apps/web`)
```bash
cd apps/web

# Install dependencies
npm install

# Run build check
npm run build

# Start Vite development server
npm run dev
```

The frontend will be available at `http://localhost:5173` and the backend at `http://localhost:8000`.
Health endpoint: `http://localhost:8000/api/v1/health`

### 4. Running with Docker Compose
```bash
docker compose up -d
```

---

---

## Development Milestones & Phase Status

AirGrid is developed strictly phase by phase with automated tests and real-browser verification gates:

- **Phase 00:** Foundation, modular monolith architecture, base schemas & 16 route shells ([Phase 00 Handoff](docs/phases/PHASE_00_HANDOFF.md)) — **Completed**
- **Phase 01A:** Premium editorial landing page & brand identity ([Phase 01A Handoff](docs/phases/PHASE_01A_HANDOFF.md)) — **Completed**
- **Phase 01B:** Secure role-based authentication, Argon2id, HttpOnly sessions & CSRF protection ([Phase 01B Handoff](docs/phases/PHASE_01B_HANDOFF.md)) — **Completed**
- **Phase 02:** Command Center dashboard, Campus & Building Manager, floor plan upload & architectural scale calibration ([Phase 02 Handoff](docs/phases/PHASE_02_HANDOFF.md)) — **Completed**
- **Phase 03:** Real Network Speed Test Lab, `@cloudflare/speedtest` adapter, client vantage point measurement, spatial facility association & PostgreSQL audit persistence ([Phase 03 Handoff](docs/phases/PHASE_03_HANDOFF.md)) — **Completed**
- **Phase 04:** Wi-Fi Surveying & Active RF Coverage Heatmaps — *Next Phase*

