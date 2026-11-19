# Network Optimization Studio (post-submission feature)

Branch `feat/network-optimization-studio`, stacked on `feat/campus-3d-wifi-copilot` (PR #2). The `v1.0-submission` checkpoint is untouched.
Private Blender assets (GLB, geometry JSON, renders, `.blend`) are **not** part of this repository; see `AIRGRID_CAMPUS_MODEL_DIR` in the README.

## What it does
1. **3D Campus** (`/campus-3d`): choose a floor; rooms are coloured from the existing IDW room-coverage service. 2D and 3D show the same bands and the same recorded points. Synthetic demo data is labelled.
2. **Optimization Studio** (`/optimization`): for the same floor, place up to 12 *virtual* APs (click to place, drag to move, remove/restore, edit position/Tx/gain), compare the current layout against the scenario, save as a versioned plan (optimistic-concurrency), reopen, and export a deterministic Markdown/JSON report (`GET /optimization/plans/{id}/export`).
3. **Copilot**: a saved scenario is added to the grounded context as `[MODEL_PREDICTION]` (with the "not physically validated" statement, uncertainty and evidence gaps). The Studio links to the Copilot with the question pre-filled.
4. **Lab** (`docker compose --profile lab`, `infrastructure/lab/verify.sh`): isolated container run of the backend tests.

## Prediction model `airgrid-logdistance-walls` v1.0.0
`RSSI = P_tx + G - PL_1m - 10·n·log10(d3) - walls·L_wall`; strongest AP wins; zones (rooms + corridors, courtyard excluded) sampled every 2 m; per-zone sigma gives P(weak)/P(good); evidence support from recorded points is reported next to a prediction but **never changes it**. Defaults (`assumed_default`): PL_1m 47 dB, n = 3, wall loss 6 dB, thresholds good ≥ −67 dBm, weak < −75 dBm. Any override is recorded in the scenario and the report (`scenario_set`). Inputs are hashed, so identical inputs give identical output.

Reused, not duplicated: the IDW heatmap/support mask and validation logic (`campus_model.room_coverage`) produce *current* coverage; moving an AP does **not** edit historical observations — the scenario is a separate, labelled `MODEL_PREDICTION` layer.

## Scientific limits
- Not calibrated or validated against field measurements for this building; improvements are model-vs-model, **not measured gains**.
- Wall count uses room/corridor geometry only; no wall material, doors, furniture, glass, floor-to-floor leakage or co-channel interference.
- Tx power/antenna gain of real APs is unknown unless supplied; defaults are assumptions.
- Changes smaller than the modelled sigma are flagged `within_model_uncertainty`.
- Validate by surveying after any real change (collector `--submit`, explicit user action only).
- The predicted effect is dominated by the assumed parameters: on the synthetic fixture the weak area of the *current* layout ranges from 0 to 1088 m² (of 1536 m²) and the predicted benefit of one added AP from 0 to 664 m² across 16 plausible parameter sets, although its direction never changed. Full assumptions, defaults, uncertainty, the observation-versus-prediction distinction and the missing field validation are in [`OPTIMIZATION_MODEL_NOTES.md`](OPTIMIZATION_MODEL_NOTES.md).
- The model is not an ITU-R implementation (an earlier landing-page claim to that effect was removed).

## Safety boundaries
**User-typed values are data, never instructions.** AP, scenario and room names reach the Copilot context only after `scenario_service.sanitize`: NFKC normalisation (full-width brackets become ASCII and are dropped), control / zero-width / bidi characters removed, MAC (colon, dash and dotted), any IPv4/IPv6-looking address and credentials masked, `[ ] < > { }` removed (a name cannot forge a `[MEASURED]` tag or close the context block), quote characters neutralised, all whitespace flattened to one line and the length capped; each label is then wrapped in double quotes, and the system prompt states that quoted text is user-typed data. NUL bytes in names are rejected with 422 at the API. Tests: `test_scenario_prompt_injection.py`, `test_copilot_scenarios.py` and the browser acceptance step that inspects the exact context a provider receives. This reduces, and cannot eliminate, the risk that a language model follows text inside a name: a plain sentence such as "ignore previous instructions" survives as quoted data.

No router/AP configuration is read or written; no network scans or bandwidth tests are triggered by the Studio. Container simulation proves isolation (non-root, read-only rootfs, `cap_drop: ALL`, `no-new-privileges`, internal network, no published ports, tmpfs DB) and that the code runs reproducibly; it cannot validate RF behaviour.

## Running the acceptance check
`infrastructure/acceptance/` holds a stdlib-only Firefox Marionette driver (no geckodriver) and a loopback **stub** OpenAI-compatible provider (no language model). Start Firefox with `--marionette --headless`, the API/Vite against a throwaway seeded database, set `SCRATCH` to a folder containing `studio_demo_creds.txt` (`email password`), and run `python -I acceptance.py`. Screenshots stay local (they show the private model).
