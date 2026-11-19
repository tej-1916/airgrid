# Optimization Studio: prediction model, assumptions and limits

Model id `airgrid-logdistance-walls` v1.0.0 (`apps/api/src/airgrid/services/ap_prediction.py`).
**Status: not calibrated, not validated against any field measurement.** Every number below was produced by this repository's code on its
*synthetic* test fixture (`airgrid.lab_fixtures`: 6 rooms + 1 corridor, 2 existing APs, 24 synthetic recorded points, 1536 m² modelled).
No figure here describes a real building, and none is derived from the private Blender campus files.

## 1. What the model is

For a point `p` and each enabled AP, the predicted mean signal is

    RSSI(p) = P_tx + G_ant − PL_1m − 10·n·log10(max(d3, 1 m)) − walls(p)·L_wall        the strongest AP wins

* `d3` is the straight-line distance including the AP/client height difference (2.7 m − 1.0 m by default).
* `walls(p)` is the number of distinct room-wall crossings on the straight segment AP → p. Room polygon edges are the walls; edges closer
  than 0.3 m along the ray merge (a shared wall counts once); corridors and the open courtyard add no walls and the courtyard is not modelled.
* It is a single-slope log-distance model with a partition term. It is **not** an implementation of ITU-R P.1238 or any other standard
  (the landing page previously claimed "ITU-R indoor path-loss models"; that claim was unsupported and was removed, and a test now guards it).
  It also does not use ray tracing, wall materials or measured antenna patterns.

## 2. Assumptions (all of them are also returned in every API result and report)

1. Strongest-signal AP wins; co-channel interference, channel plan, transmit-power control, client capacity and roaming are not modelled.
2. Only APs on the same floor count; floor-to-floor leakage is ignored.
3. Every interior wall has the same attenuation; doors, glass, furniture and people are not modelled.
4. One frequency (generic indoor 5 GHz); 2.4 GHz and 6 GHz behave differently and are not modelled. Recorded points of any band are compared as if they were comparable.
5. Existing APs use the transmit power registered in the inventory, otherwise the assumed default. Antenna gain is the assumed default.
6. Each zone is sampled on a 2 m grid (`CELL_M`); areas are sums over grid cells inside the polygon, so they are quantised (in this fixture the weak/fair/good areas are multiples of 8 m²).
7. Bands: good ≥ −67 dBm, weak < −75 dBm, fair in between (the same thresholds as the heatmap and the Copilot prompt). A zone's *band* uses the zone's mean prediction; its *weak area* uses the fraction of its sample cells below −75 dBm, so the two can differ for a zone straddling a threshold.
8. Candidate APs are hypothetical. Nothing is written to the AP inventory, no equipment is configured and recorded measurements are never modified.

## 3. Default parameters

Every parameter carries a provenance (`assumed_default`, or `scenario_set` when a scenario overrides it); overrides are bounded and recorded in the report.

| Parameter | Default | Allowed range | Meaning / basis |
|---|---|---|---|
| `pl_ref_db` | 47 dB | 30–70 | Path loss at 1 m. Free-space loss at 5.5 GHz is 47.3 dB (`20·log10(f_MHz) − 27.55`). |
| `path_loss_exponent` n | 3.0 | 1.6–5.0 | Generic indoor value; 2 = free space, 3–4 = obstructed. Not fitted. |
| `wall_loss_db` | 6 dB | 0–25 | One value for every wall (drywall ≈ 3, masonry/concrete 10–15 in the literature). Not fitted. |
| `shadow_sigma_db` | 6 dB | 1–12 | Log-normal shadowing standard deviation (typical indoor 5–8 dB). |
| `wall_sigma_db` | 1.5 dB/wall | 0–5 | Extra uncertainty per wall, added in quadrature. A heuristic. |
| `default_tx_power_dbm` | 17 dBm | 0–30 | Used when an AP has no registered power. |
| `default_antenna_gain_dbi` | 3 dBi | 0–10 | Assumed. |
| `ap_height_m` / `client_height_m` | 2.7 / 1.0 m | 1–6 / 0.3–2 | Assumed. |

## 4. Estimated coverage (how to read the output)

Per zone: predicted mean RSSI, modelled σ, `P(weak)`, `P(good)`, the band, the serving AP and the wall count to it. Per floor: weak / fair / good area in m² and the
*expected* weak area (area × `P(weak)`, which includes uncertainty).

Example on the synthetic fixture with defaults (a model output, not a measurement):

| Layout | Weak m² | Fair m² | Good m² | Expected weak m² | Uncertain zones |
|---|---|---|---|---|---|
| Current: 2 registered APs | 560 | 248 | 728 | 494.1 | 2 |
| + 1 hypothetical AP at (0, −9) m | 0 | 400 | 1136 | 118.6 | 3 |

Predicted weak area falls by 560 m² (of 1536 m²). **This is a difference between two predictions of the same model, not a measured improvement.**

## 5. Uncertainty

* Per point `σ = √(σ_shadow² + (σ_wall · walls)²)`; `P(weak) = Φ((−75 − mean)/σ)`; a zone is *uncertain* when no band reaches probability 0.6. This is a modelled
  heuristic, **not** a statistically validated confidence interval. It does not include error in the parameters themselves.
* A change between two layouts is flagged `within_model_uncertainty` when `|Δ| < max(σ_a, σ_b)`. That compares a difference to the *marginal* σ of one prediction;
  it does not model how the errors of the two layouts correlate, so it is a rule of thumb, not a test. In the example, 4 of 7 zone changes are inside it.
* **Parameter sensitivity is much larger than the stated σ.** Same fixture, same candidate, 16 plausible parameter sets (n ∈ {2.5, 3, 3.5, 4} × wall loss ∈ {3, 6, 10, 15} dB):

| n | wall dB | Weak m² now | Weak m² with AP | Δ m² | Bias vs synthetic points (dB) |
|---|---|---|---|---|---|
| 2.5 | 3 / 6 / 10 / 15 | 0 / 136 / 664 / 712 | 0 / 0 / 0 / 112 | 0 / −136 / −664 / −600 | +10.7 / +7.2 / +2.5 / −3.3 |
| 3.0 | 3 / 6 / 10 / 15 | 104 / 560 / 712 / 856 | 0 / 0 / 168 / 480 | −104 / −560 / −544 / −376 | +5.3 / +1.8 / −2.9 / −8.7 |
| 3.5 | 3 / 6 / 10 / 15 | 560 / 728 / 872 / 1056 | 96 / 256 / 488 / 816 | −464 / −472 / −384 / −240 | −0.1 / −3.6 / −8.3 / −14.1 |
| 4.0 | 3 / 6 / 10 / 15 | 816 / 928 / 1056 / 1088 | 400 / 592 / 816 / 864 | −416 / −336 / −240 / −224 | −5.5 / −9.0 / −13.7 / −19.5 |

  The *direction* (an extra AP reduces predicted weak area) held in all 16 sets; the *size* ranged from 0 to 664 m² and even the baseline weak area of the current layout
  ranged from 0 to 1088 m². Pinned by `test_parameter_sensitivity_dominates_the_predicted_effect_and_is_the_documented_figure`. Layout rankings with more than one candidate were not tested for stability.
* Results are deterministic: identical inputs give the same `inputs_hash` and output.

## 6. Historical observations versus model predictions

| | Historical / recorded layer | Model-predicted layer |
|---|---|---|
| Source | Survey points actually recorded (or SYNTHETIC demo points, labelled) | Equation above with assumed parameters |
| Method | IDW interpolation with a support mask (`campus_model.room_coverage`) | Log-distance + walls for registered and hypothetical APs |
| Can answer "what if I move an AP?" | No: moving an AP does not change a recorded observation | Yes, as a prediction only |
| Provenance tag | MEASURED / INTERPOLATED_ESTIMATE / SYNTHETIC_DEMO | MODEL_PREDICTION |

The model never changes, and is never fitted to, recorded points. They are used only to show evidence next to a prediction (`recorded_in_zone`, `nearby_recorded` within 10 m, `no_recorded_evidence`)
and to report a residual for the *existing* AP layout. On the synthetic fixture (24 **synthetic** points) the residual with defaults is bias +1.8 dB, MAE 5.5 dB, RMSE 6.4 dB, 62 % of points within
one σ. Those points are synthetic demonstration data, so this is a self-consistency check of the machinery, **not evidence about accuracy**.

## 7. Missing field validation

Not done, and required before any prediction is relied on:

* No survey of the real campus was used to calibrate or test `n`, `L_wall`, σ or the transmit powers.
* No before/after measurement of any real AP change exists; a predicted gain has never been compared with a measured one.
* Real AP transmit powers, antenna patterns, channels and bands are unknown unless entered.
* No test of whether the model ranks alternative layouts correctly.

A suggested validation protocol (not performed): survey each floor with the existing collector after explicit authorisation; fit `n` and `L_wall` on part of the rooms and test on held-out rooms (spatial cross-validation, as the ML Lab does for its regressors);
report bias/MAE/RMSE per floor and per band; then, for one real change, survey before and after and compare the *measured* change with the predicted one.

## 8. Wording rules enforced in the product

Predictions are tagged `[MODEL_PREDICTION]`, carry the statement "Not a measurement and not physically validated", state their uncertainty and the assumptions that drive them, and the Copilot
system prompt forbids calling them measured. The landing page no longer claims ITU-R models, an automatic solver, channel planning, "real-time" interpolation or physics-grounded optimisation.
