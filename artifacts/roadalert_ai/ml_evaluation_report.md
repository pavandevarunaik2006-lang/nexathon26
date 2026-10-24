# RoadAlert AI — Machine Learning (ML) Incident Verification Report

## 1. Project Database & Schema Inspection
- **Source Files Inspected:** `database/schema.prisma` and `backend/src/db/seedData.ts`.
- **Database Model:** `Incident` with associated `IncidentEvidence`, `IncidentCorroboration`, `Journey`, and `JourneyCheckpoint` models.
- **Available Seed Records:** Exactly 18 demo incidents currently seeded across coastal Karnataka (Mangaluru/Udupi corridor).

## 2. Supervised Learning Viability Assessment
> [!CRITICAL]
> **Strict Rule Enforcement: Do Not Fabricate Labels:**
> 1. With only 18 seeded demo records, training a supervised ML model (e.g. Random Forest, XGBoost) will lead to **extreme overfitting** and data leakage.
> 2. **Unverified reports are NOT automatically fake.** A genuine accident often has 0 corroborations in its first 5 minutes. Labelling unverified incidents as fake creates severe bias against early citizen reporting.
> 3. Consequently, RoadAlert uses an **Explainable Calibrated Verification Engine** (Section 10) for production confidence scoring, supplemented by an anomaly detection baseline.

## 3. RoadAlert Section 10 Explainable Heuristic Baseline
Feature point allocation (Normalized 0 to 100 points):
- **Independent, distinct user reports:** up to 30 points (10 pts per distinct user)
- **Spatio-temporal proximity:** up to 20 points (decays with reporting latency)
- **Consented GPS speed drop / telemetry:** up to 20 points (0.8 pts per km/h speed reduction)
- **Validated multimedia evidence (photos/telemetry):** up to 15 points (7.5 pts per validated item)
- **Authorized traffic authority confirmation:** up to 15 points (official stamp)

### Verification Confidence Bands:
- `0 - 39`: **UNVERIFIED** (Initial report; waiting for corroborating evidence)
- `40 - 69`: **CORROBORATED** (Corroborated by independent witnesses or telemetry)
- `70 - 100`: **VERIFIED** (Authority verified or multi-source confirmed)

## 4. Ground-Truth Data Collection Template
To prepare for supervised ML in future versions:
- Created `artifacts\roadalert_ai\incident_data_template.csv` with 19 structured features.
- Once at least 500 audited incident reports (with verified outcomes from police / municipal traffic control) are recorded, a supervised XGBoost / LightGBM classifier can be trained and evaluated with ROC-AUC and PR-AUC.
