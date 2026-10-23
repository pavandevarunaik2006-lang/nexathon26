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
├── frontend/                       # React 18 + Vite + TypeScript + Tailwind CSS + React Leaflet + Recharts
│   ├── public/
│   ├── src/
│   │   ├── app/                    # Application entry, routing (routes.tsx), and providers (providers.tsx)
│   │   ├── components/             # Reusable UI & motion primitives (Badges, MotionPrimitives, shared/, ui/)
│   │   ├── config/                 # Frontend corridor & API configuration
│   │   ├── context/                # Auth & Toast context providers
│   │   ├── features/               # Feature modules (admin, alerts, analytics, authentication, dashboard, gps, incidents, maps, routes, vehicles, verification)
│   │   ├── hooks/                  # Reusable React hooks (useAuth, useToast)
│   │   ├── layouts/                # Enterprise application shell & navigation (AppShell)
│   │   ├── lib/                    # Formatting utilities & API client compatibility export
│   │   ├── pages/                  # Route page views
│   │   ├── services/               # Typed REST API client (apiClient.ts)
│   │   ├── styles/                 # Global Tailwind styles, map keyframes & design tokens
│   │   └── types/                  # Frontend TypeScript interfaces
│   ├── index.html
│   ├── package.json
│   ├── tsconfig.json
│   └── vite.config.ts
│
├── backend/                        # Node.js + Express + TypeScript REST API (/api/v1) + OpenAPI/Swagger
│   ├── src/
│   │   ├── config/                 # Zod-validated environment configuration (env.ts)
│   │   ├── controllers/            # HTTP request & response handlers (auth, incidents, authority, journeys, employer, mapAndRoutes, admin, notifications)
│   │   ├── db/                     # Dual-mode PostgreSQL manager (pg.Pool + PGlite), migrations & seed
│   │   ├── integrations/           # External API clients (OSRM routing client with timeout fallback)
│   │   ├── middleware/             # JWT auth, RBAC role guards, centralized Zod/Multer error handler
│   │   ├── repositories/           # Data access layer (users, incidents, organizations, audit logs)
│   │   ├── routes/                 # Declarative Express route definitions mounted under /api/v1
│   │   ├── services/               # Domain logic (verificationEngine, gpsTrackingService, routingService, geocodingService, incidentService, authorityService, authService, aiAssistantService)
│   │   ├── types/                  # Backend domain & Express request types
│   │   ├── utils/                  # Anonymization & query helper utilities
│   │   ├── validators/             # Request validation schemas re-exported from @roadalert/shared
│   │   ├── app.ts                  # Express app factory
│   │   ├── server.ts               # HTTP server entry point
│   │   └── swagger.ts              # OpenAPI 3.0 specification
│   ├── tests/                      # Vitest + Supertest automated test suites (api.test.ts, gpsTracking.test.ts, routingAndSimulation.test.ts)
│   ├── data/                       # Local PGlite PostgreSQL storage (gitignored)
│   ├── uploads/                    # Local uploaded incident evidence storage (gitignored)
│   ├── package.json
│   └── tsconfig.json
│
├── database/                       # Database schema, migrations & seed scripts
│   ├── migrations/
│   │   ├── 001_init/               # Core relational tables & indexes
│   │   └── 002_gps_tracking/       # JourneyCheckpoint GPS telemetry & anomaly columns
│   ├── schema.prisma               # Normalized relational PostgreSQL schema
│   └── seed.ts                     # Canonical database seed entrypoint
│
├── shared/                         # Shared TypeScript package (@roadalert/shared)
│   ├── src/
│   │   ├── constants/              # Roles, categories, severities, statuses, GPS validation statuses, landmarks
│   │   ├── schemas/                # Shared Zod validation schemas for API & frontend
│   │   ├── simulation/             # Multi-category corridor vehicle simulation & incident-aware rerouting engine
│   │   ├── types/                  # Shared domain interfaces (ConfidenceScoreBreakdown, ExplicitRouteState, IncidentVerificationState)
│   │   └── index.ts                # Package barrel export
│   ├── package.json
│   └── tsconfig.json
│
├── .env.example                    # Complete environment variable reference
├── .gitignore                      # Excludes node_modules, dist, .env, local pglite data, and uploads
├── docker-compose.yml              # PostgreSQL 16 + PostGIS container configuration
├── package.json                    # Root npm workspace & orchestration scripts
├── package-lock.json
└── README.md
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
- **Database:** Works out-of-the-box with **zero external setup** using embedded persistent PostgreSQL (`@electric-sql/pglite` stored in `backend/data/pglite`), OR connects to a managed/Docker PostgreSQL instance when `DATABASE_URL` is set.

### Step-by-Step Commands

```bash
# 1. Install all monorepo workspace dependencies
npm install

# 2. (Optional) Copy environment configuration
cp .env.example .env

# 3. Validate Prisma schema & run PostgreSQL schema migrations
npm run db:validate
npm run db:migrate

# 4. Seed demo roles, organizations, and 18 coastal Karnataka incidents
npm run db:seed

# 5. Run TypeScript typechecks, build, and automated API integration tests (49/49 passing)
npm run typecheck
npm run build
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

## 4. External Integrations & Deployment Guide

- **Map Tiles:** Uses OpenStreetMap standard tiles by default (`VITE_MAP_TILE_URL`). Includes a graceful fallback banner if tile servers are unreachable while keeping incident lists interactive.
- **Routing Provider:** Uses `OSRM` (`OSRM_BASE_URL`) with a 2.5-second timeout and automatic fallback to deterministic coastal Karnataka corridor geometry so demos never fail offline.
- **Database Deployment:** For production on Render/Railway/Supabase/Neon, set `DATABASE_URL=postgresql://user:pass@host:5432/dbname` or run `docker compose up -d` for local PostGIS 16.
- **Frontend & Backend Deployment:**
  - Deploy `frontend` to Vercel (build command: `npm run build --workspace=frontend`, output directory: `frontend/dist`, set `VITE_API_BASE_URL`).
  - Deploy `backend` to Render or Railway (start command: `npm run start --workspace=backend`).
