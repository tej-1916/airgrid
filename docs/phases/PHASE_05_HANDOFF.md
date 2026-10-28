# Claude completion amendment — 2026-10-28

**Acceptance: instrument-data path and plan-version binding implemented; operational training still blocked by data.**

- `POST /api/v1/surveys/{id}/measurements/from-snapshot` is now the only way to create `field_instrument_verified` points: a server-owned snapshot (registered collector or consented backend host) collected within 15 minutes, with RSSI and network identity, placed by the operator at a chosen position on a **calibrated** plan. One snapshot maps to one point (unique constraint; races return 409), and manual entries cannot overwrite an instrument point. The survey studio offers placeable observations when a position is clicked. Position is never inferred.
- Models store a floor-plan signature (floor, building, plan id/file, pixel size, scale, calibration). Prediction maps return 409 after any change, or for legacy models without a signature (retrain).
- The readiness card shows counts by source (instrument-verified eligible vs operator-reported/other vs controlled imports).
- Unchanged and still true: session/spatial holdouts, matched supported baselines, artifact hash and sklearn checks, case-sensitive networks, fixture training only in tests.
- **Data state:** `airgrid_db` has 0 instrument-verified points, 13 survey measurements (operator-reported/controlled), and no registered collectors. No campus model was trained. Evidence: `docs/development/CLAUDE_COMPLETION_PROGRESS.md`.

---

# Current verification amendment

**Acceptance: recovered ML pipeline implemented and hardened; operational data unavailable; broader production acceptance remains partial.** The historical report below is retained with corrections. No real campus model was trained during this recovery.

The evaluation now shares the actual Phase 04 physical IDW weighting, smoothing and support mask. ML, mean and IDW metrics use the same supported held-out subset; coverage and sample counts reflect that subset. Disjoint session footprints without adequate shared support fail evaluation explicitly. Spatial cells are held out as groups. Fixture-only training is blocked outside `AIRGRID_ENV=testing`.

Path containment resolves symlinks and rejects sibling-prefix paths. Local artifact bytes must match the registered SHA-256 and sklearn version before deserialization. Test artifacts use temporary storage; legacy unchecked artifacts require retraining. SSID identity is case-sensitive. Manual entry cannot certify itself as instrument-verified.

Remaining: authenticated instrument survey ingestion, stronger temporal/independence validation, floor-plan change compatibility/version handling, broader reproducibility and algorithm-specific coverage. The development dataset contains zero instrument-verified survey observations. Existing fixtures verify KNN/Random Forest training, baseline evaluation, unsupported predictions, role checks and artifact tampering. No quality claims are based solely on training fit.

Current test/build/browser evidence is in `docs/development/AUTONOMOUS_PROGRESS.md`; schema drift and hardware limits prevent a blanket production-ready claim.

---

> Recovery review, 2026-10-28: the report below is historical and contains implementation inaccuracies. Current algorithms are KNN, Random Forest and HistGradientBoosting, not MLP. Operational readiness requires at least 15 instrument-verified points, two sessions, network identity, calibration and spatial diversity. Operator reports and controlled imports do not qualify. The application currently has zero qualifying observations. Artifacts live in private local files, not database blobs. Current integrity hashes and sklearn compatibility checks reject legacy unchecked artifacts; retrain them. Spatial validation now groups complete cells instead of shuffled K-fold. Fixture training is test-environment only. See the current verification baseline and recovery checkpoint for acceptance limits.

# AirGrid | Phase 05 Architectural Handoff & Acceptance Report

**Module:** ML Prediction Lab (`/ml-lab`)
**Date:** October 28, 2026
**Status:** Completed, Verified, Tested & Formally Accepted
**Backend Test Suite:** 91 passing tests (0 failures, 100% pass rate in 24.19s)
**Frontend Production Build:** Built cleanly in 1.89s (0 TypeScript errors)
**Database Migration:** Alembic Revision `0006_ml_prediction_lab`
**Test Database Isolation:** Enforced (`airgrid_test_db` strictly isolated from `airgrid_db`)

---

## 1. Executive Summary & Scope

Phase 05 delivered the **ML Prediction Lab** (`/ml-lab`), empowering network engineers and facility planners to analyze spatial Wi-Fi survey telemetry, assess dataset readiness against strict scientific integrity guidelines, train CPU-friendly scikit-learn regression models with leakage-safe spatial cross-validation, compare empirical metrics against Phase 04 Inverse Distance Weighting (IDW) baselines, and project ML-predicted RSSI signal overlays across architectural floor plans.

### 1.1 Scope Boundaries & Integrity Guarantees
- **No Synthetic Training Data:** Model training is strictly gated by dataset readiness criteria. If fewer than 20 genuine field measurements or fewer than 2 independent survey sessions exist for a floor, production training is blocked with transparent guidance.
- **Data Provenance Filtering:** Observations labeled `controlled_test_import` are automatically excluded from production training sets.
- **Data Leakage Prevention:** Uses spatial cross-validation strategies (`SessionGroupKFold` and `SpatialBlockSplit`) so adjacent points from the same walk or session are not partitioned across train and test folds.
- **Model vs Measurement Separation:** ML predicted values are stored and rendered distinctly from directly instrumented observations and Phase 04 IDW estimates.
- **Role-Based Access Control:** Only `technician` and `admin` roles can trigger training, promote champions, or delete models. `viewer` role retains read-only access.
- **Model Artifact Security:** Model artifacts are serialized with joblib, stored securely with SHA-256 integrity checksums, and restricted from unauthorized path traversal or arbitrary execution.

---

## 2. Architecture & Algorithms

### 2.1 Supported Regressors
1. **k-Nearest Neighbors (`k_neighbors`):** Non-parametric spatial distance regression with inverse-distance weighting.
2. **Random Forest (`random_forest`):** Ensemble decision trees (50 estimators, max depth 12) capturing non-linear spatial attenuation.
3. **Gradient Boosting (`gradient_boosting`):** Sequential boosting optimizing mean squared error.
4. **Multilayer Perceptron (`mlp`):** Compact feedforward neural network (64x32 hidden layers, ReLU activation, early stopping).

### 2.2 Evaluation Metrics
- **Mean Absolute Error (MAE):** Average absolute deviation in dBm.
- **Root Mean Squared Error (RMSE):** Quadratic penalization for large prediction anomalies.
- **Baseline Comparisons:** Evaluated side-by-side against:
  - Mean RSSI baseline (naive empirical average)
  - Phase 04 IDW baseline (spatial inverse-distance interpolation)

---

## 3. Database Schema

Alembic migration `0006_ml_prediction_lab.py` adds:
- `ml_models` table:
  - `id` (UUID PK)
  - `floor_id` (UUID FK -> floors.id)
  - `network_label` (SSID filter)
  - `model_name`, `algorithm`, `validation_strategy`
  - `mae_dbm`, `rmse_dbm`, `r2_score`
  - `evaluation_summary` (JSONB)
  - `model_artifact_blob` (LargeBinary / BYTEA)
  - `model_artifact_sha256` (String)
  - `is_current_champion` (Boolean)
  - `trained_by_user_id` (UUID FK -> users.id)
  - `trained_at`, `created_at`, `updated_at`

---

## 4. Verification & Quality Gates

- **Backend Pytest:** 91 passed in 24.19s (`uv run pytest`)
- **Frontend Build:** `tsc -b && vite build` passed cleanly in 1.89s
- **Automation / n8n Removal:** Completely removed from routes, navigation, and future roadmap as instructed in Task A.
