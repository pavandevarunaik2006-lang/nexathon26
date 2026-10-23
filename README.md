# RoadAlert — Intelligent Traffic Incident Verification & Response Platform (Nexathon 26)

RoadAlert is a full-stack TypeScript civic-technology and traffic intelligence platform engineered for **Mangaluru, Udupi, and the coastal Karnataka NH-66 / NH-75 corridors**.

Unlike ordinary navigation apps that display an unexplained red line, RoadAlert answers four critical operational questions:
1. **What is happening on the road?** (15 structured incident categories with geo-pinned coordinates across Pumpwell, Thokkottu, Nanthoor, Surathkal, Mulki, Padubidri, Kaup, Udupi, and Manipal)
2. **Why is it happening?** (Distinguishes monsoon waterlogging, multi-axle breakdowns, NHAI culvert road closures, signal failures, and cultural processions)
3. **How trustworthy is the information?** (Explainable 6-level verification engine computing a transparent 0–100 confidence score with duplicate-report deduplication)
4. **What action should commuters, employers, or authorities take?** (Incident-avoidance bypass routing, consent-first employee commute delay proof, and SQL-aggregated permanent infrastructure problem reports)

---

## 1. Architecture Summary

```
Nexathon26/
├── apps/
│   ├── api/                  # Node.js + Express + TypeScript REST API (/api/v1) + OpenAPI/Swagger
│   │   ├── src/
│   │   │   ├── db/           # Dual-mode PostgreSQL manager (pg.Pool TCP + embedded PGlite Postgres)
│   │   │   ├── middleware/   # JWT auth, RBAC role guards, Zod & Multer centralized error handling
│   │   │   ├── routes/       # Auth, Incidents, Map/Routes, Journeys/Consents, Employer, Authority, Admin
│   │   │   └── services/     # Explainable Verification Engine, OSRM/Corridor Routing Adapter, AI Assist
│   │   └── tests/            # Vitest + Supertest automated test suite (15 acceptance & security tests)
│   └── web/                  # React 18 + Vite + TypeScript + Tailwind CSS + React Leaflet + Recharts
├── packages/
│   └── shared/               # Shared Zod validation schemas, confidence interfaces, regional landmarks
├── prisma/
│   ├── schema.prisma         # Normalized relational PostgreSQL schema
│   └── migrations/001_init/  # Version-controlled SQL migration
├── docker-compose.yml        # PostgreSQL 16 + PostGIS container configuration
└── .env.example              # Complete environment variable reference
```

### Key Differentiators Implemented
- **Explainable 6-Level Verification Engine (`0–100` Confidence Score):**
  - Independent, distinct reports: up to **30 pts** (same-user duplicate corroborations are automatically ignored so a single user cannot inflate scores)
  - Location & timestamp proximity compatibility: up to **20 pts**
  - Consented GPS speed-drop telemetry: up to **20 pts**
  - Validated photo/video evidence: up to **15 pts**
  - Authorized Traffic Authority confirmation: up to **15 pts**
  - Clearly labeled as a product confidence heuristic, never a statistically guaranteed probability.
- **Privacy-First Employee Commute Verification:**
  - Zero 24/7 background tracking. Tracking never starts silently.
  - Requires an active, unrevoked `TrackingConsent` record before starting a session.
  - Displays a persistent green tracking indicator in the top navigation bar while active.
  - Stopping a session or revoking consent halts checkpoint collection immediately.
  - Employers are strictly isolated to their own organization (`ORGANIZATION_ISOLATION_VIOLATION` enforced server-side) and precise GPS coordinates are redacted by default.
- **Honest Demo Data vs. Live Service Labeling:**
  - All 18 pre-populated coastal Karnataka incidents, evidence records, and journeys carry `demoData = true` in PostgreSQL and render a visible **Demo Seed Data** badge in the UI.

---

## 2. Exact Local Setup & Reproduction Commands

### Prerequisites
- **Node.js** `>= 20.x` and **npm** `>= 10.x`
- **Database:** Works out-of-the-box with **zero external setup** using embedded persistent PostgreSQL (`@electric-sql/pglite` stored in `./data/pglite`), OR connects to a managed/Docker PostgreSQL instance when `DATABASE_URL` is set.

### Step-by-Step Commands

```bash
# 1. Install all monorepo workspace dependencies
npm install

# 2. (Optional) Copy environment configuration
cp .env.example .env

# 3. Run PostgreSQL schema migrations
npm run db:migrate

# 4. Seed demo roles, organizations, and 18 coastal Karnataka incidents
npm run db:seed

# 5. Run TypeScript typechecks and automated API integration tests (15/15 passing)
npm run lint
npm test

# 6. Start both Backend API (port 4000) and Frontend Web App (port 5173)
npm run dev
```

### Local URLs
- **Frontend Web Application:** `http://localhost:5173`
- **Backend REST API Base:** `http://localhost:4000/api/v1`
- **API Health Check:** `http://localhost:4000/api/v1/health`
- **Interactive Swagger / OpenAPI Docs:** `http://localhost:4000/api/v1/docs`

---

## 3. Seeded Demo Accounts (Local Evaluation Only)

All demo accounts share the development password: **`RoadAlert@2026`**
*(You can also use the **1-Click Instant Evaluation Role Launcher** on the `/` Landing Page or `/login` page).*

| Role | Email | Password | Primary Dashboard Route | Key Capabilities to Test |
| :--- | :--- | :--- | :--- | :--- |
| **PASSENGER** | `passenger@roadalert.in` | `RoadAlert@2026` | `/app/dashboard` | Report incidents, view interactive map, plan NH-66 bypass routes, corroborate/dispute reports |
| **EMPLOYEE** | `employee@roadalert.in` | `RoadAlert@2026` | `/app/dashboard` & `/app/journeys` | Grant/revoke tracking consent, start/stop commute sessions, log checkpoints, inspect verified delay proof |
| **EMPLOYER** | `employer@roadalert.in` | `RoadAlert@2026` | `/employer/dashboard` | View Karavali Tech Park active commutes (with GPS redacted), configure retention policy, export CSV |
| **TRAFFIC_AUTHORITY** | `authority@roadalert.in` | `RoadAlert@2026` | `/authority/dashboard` | Investigate incidents, confirm closures, resolve obstructions, view SQL hotspots & generate problem reports |
| **ADMIN** | `admin@roadalert.in` | `RoadAlert@2026` | `/admin/dashboard` | Manage users/roles with confirmation, manage organizations, review flagged complaints & immutable audit logs |

---

## 4. Demo Walkthrough (Mangaluru → Udupi Journey)

1. **Explore the Live Corridor Control Room (`/app/dashboard` & `/app/map`):**
   - Sign in as `passenger@roadalert.in` (or click the **Passenger** launcher on `/`).
   - Inspect active seeded incidents at **Pumpwell Circle** (Monsoon Waterlogging, Confidence 100/100), **Thokkottu Flyover** (Container Breakdown), **Mulki Junction** (Emergency Culvert Road Closure), and **Nanthoor Circle** (Signal Failure).
2. **Plan a Bypass Route (`/app/routes`):**
   - Select Origin: `Pumpwell Circle, Mangaluru (NH-66)` and Destination: `Udupi Karavali Bypass (NH-66)`.
   - Observe how the primary NH-66 route is flagged with a **Road Closure Warning** at Mulki Junction (+45 min delay), while the **Inland SH-1 / Bajpe–Padubidri Bypass** is recommended with a clear explanation and separate Base Travel Time vs. Incident Delay breakdown.
3. **Report & Corroborate an Incident (`/app/report-incident` & `/app/incidents/:id`):**
   - Submit a new incident, click **Auto-Suggest Category & Evidence**, and pin coordinates on the map.
   - Open the created incident detail page to inspect the 5-pillar confidence score breakdown (`+points` per pillar and what is missing for `100/100`).
4. **Employee Privacy-First Commute Session (`/app/journeys`):**
   - Sign in as `employee@roadalert.in`. Notice the persistent green **Consented Commute Tracking Active** indicator in the top header.
   - Log a checkpoint, inspect the difference between **Estimated Route Delay** and **Incident-Verified Delay**, and click **Stop Session Now** (or **Revoke Consent**) to verify tracking stops immediately.
5. **Employer Commute Verification (`/employer/dashboard` & `/employer/reports`):**
   - Sign in as `employer@roadalert.in`. Inspect authorized employee commutes with `Exact GPS Redacted` enforced, and click **Export Authorized CSV**.
6. **Traffic Authority Investigation & Permanent Problem Reports (`/authority/dashboard`, `/authority/analytics`, `/authority/problem-reports`):**
   - Sign in as `authority@roadalert.in`. Confirm or resolve an incident with a mandatory audited reason, filter historical SQL analytics (`daily`/`weekly`/`monthly`/`quarterly`/`annual`), and generate a printable **Permanent Infrastructure Problem Report** for Pumpwell Circle.

---

## 5. External Integrations & Deployment Guide

- **Map Tiles:** Uses OpenStreetMap standard tiles by default (`VITE_MAP_TILE_URL`). Includes a graceful fallback banner if tile servers are unreachable while keeping incident lists interactive.
- **Routing Provider:** Uses `OSRM` (`OSRM_BASE_URL`) with a 2.5-second timeout and automatic fallback to deterministic coastal Karnataka corridor geometry so demos never fail offline.
- **Database Deployment:** For production on Render/Railway/Supabase/Neon, set `DATABASE_URL=postgresql://user:pass@host:5432/dbname` or run `docker compose up -d` for local PostGIS 16.
- **Frontend & Backend Deployment:**
  - Deploy `apps/web` to Vercel (build command: `npm run build --workspace=apps/web`, output directory: `apps/web/dist`, set `VITE_API_BASE_URL`).
  - Deploy `apps/api` to Render or Railway (start command: `npm run start --workspace=apps/api`).

## 6. Known Limitations
- **Confidence Scoring Heuristic:** Weights (30/20/20/15/15) are transparent product heuristics for decision support and are not calibrated statistical probabilities.
- **Routing Traffic Feed:** OSRM provides base road geometry and travel duration; incident delays are computed separately by intersecting route polylines against active RoadAlert incidents.
- **Push Notifications:** In-app notification center with polling and unread badges is fully implemented; external Web Push / FCM credentials are not required for the MVP.
