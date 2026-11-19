import { describe, it, expect, vi, beforeEach } from 'vitest';
import { render, screen, fireEvent, waitFor, within } from '@testing-library/react';
import { ScenarioStudio } from './ScenarioStudio';
import { apiRequest } from '../../services/api';

vi.mock('../../services/api', () => ({ apiRequest: vi.fn() }));

const CTX = {
  floor: { id: 'f1', title: 'Synthetic Floor', floor_number: 0, bounds: { min: [-10, -5], max: [10, 5] } },
  coordinate_system: 'Blender world metres: x east, y north.',
  zones: [
    { id: 'Z-1', name: 'West', kind: 'room', area_m2: 50, polygon_world: [[-10, -5], [0, -5], [0, 5], [-10, 5]] },
    { id: 'Z-2', name: 'East', kind: 'room', area_m2: 50, polygon_world: [[0, -5], [10, -5], [10, 5], [0, 5]] },
  ],
  courtyard_bounds: null,
  existing_access_points: [{ id: 'ap1', name: 'SYN-AP-1', x_m: -5, y_m: 0, tx_power_dbm: 17, status: 'active' }], unplaced_access_points: 0,
  session: { id: 's1', name: 'SYNTHETIC survey', points: 2, provenance_counts: { controlled_test_import: 2 }, all_synthetic_demo: true },
  sessions: [{ id: 's1', name: 'SYNTHETIC survey', status: 'completed', points: 2, started_at: null }],
  recorded_points: [{ x_m: -5, y_m: 1, rssi_dbm: -50 }, { x_m: 5, y_m: 1, rssi_dbm: -80 }],
  model: { id: 'airgrid-logdistance-walls', version: '1.0.0', validated: false, assumptions: ['Assumed defaults are not measured.'], thresholds_dbm: { good_min: -67, weak_below: -75 }, max_candidates: 12,
    parameters: { wall_loss_db: { default: 6, min: 0, max: 20, unit: 'dB', description: 'Loss per wall' } } },
};
const zone = (id: string, band: string, dbm: number) => ({ id, name: id, kind: 'room', area_m2: 50, polygon_world: [], mean_dbm: dbm, band, basis: 'model_prediction', sigma_db: 6, p_weak: 0.1, p_good: 0.5,
  confidence: 0.7, uncertain: false, serving_ap: 'ap1', walls_to_serving_ap: 1, evidence: { support: 'recorded_in_zone', recorded_points: 1, recorded_mean_dbm: -60, nearest_recorded_m: 2 } });
const result = (east: string, hypo: number) => ({ model: CTX.model, labels: { layer: 'model_predicted', physically_validated: false, recorded_data: 'SYNTHETIC', hypothetical_access_points: hypo }, inputs_hash: `h${hypo}`,
  zones: [zone('Z-1', 'good', -55), zone('Z-2', east, east === 'weak' ? -80 : -62)], summary: {}, parameters: {}, model_check: { bias_db: -1, mae_db: 5, rmse_db: 6, points: 2 } });
const cmp = (improved: number) => ({ summary: { weak_area_m2: { a: 50, b: improved ? 0 : 50, delta: improved ? -50 : 0 } }, zones_improved: improved, zones_worsened: 0, changes_within_model_uncertainty: 0, caveat: 'Model-vs-model differences, not measured improvements.',
  zones: [{ id: 'Z-2', name: 'East', a_dbm: -80, b_dbm: improved ? -62 : -80, delta_db: improved ? 18 : 0, a_band: 'weak', b_band: improved ? 'good' : 'weak', change: improved ? 'improved' : 'same_band', within_model_uncertainty: false }] });

type Call = { url: string; method: string; body: any };
let calls: Call[];
let savedPlans: any[];
const SPEC = (x: number) => ({ candidates: [{ id: 'cand-1', name: 'Virtual AP 1', x_m: x, y_m: 0, enabled: true }], parameters: {}, disabled_existing_ap_ids: [], baseline_session_id: 's1' });

function installApi(extra: Record<string, (c: Call) => unknown> = {}) {
  vi.mocked(apiRequest).mockImplementation((async (url: string, opts: RequestInit = {}) => {
    const call = { url, method: (opts.method || 'GET').toUpperCase(), body: opts.body ? JSON.parse(String(opts.body)) : null };
    calls.push(call);
    for (const [frag, fn] of Object.entries(extra)) if (url.includes(frag)) return fn(call);
    if (url.includes('/scenario/context')) return CTX;
    if (url.includes('/scenario/predict')) { const n = call.body.scenario.candidates.filter((c: any) => c.enabled).length; return { baseline: result('weak', 0), scenario: result(n ? 'good' : 'weak', n), comparison: cmp(n ? 1 : 0) }; }
    if (url.includes('/versions')) return [{ version: 1, name: 'x', status: 'draft', candidates: 1, has_scenario: true, created_at: null }];
    if (url.endsWith('/optimization/plans') && call.method === 'POST') { const row = { id: 'p1', name: call.body.name, version: 1, status: 'draft', updated_at: null, scenario: call.body.scenario, author: null }; savedPlans = [row]; return row; }
    if (url.includes('/optimization/plans/p1') && call.method === 'PATCH') { const row = { ...savedPlans[0], version: call.body.expected_version + 1, name: call.body.name, scenario: call.body.scenario }; savedPlans = [row]; return row; }
    if (url.includes('/optimization/plans?floor_id')) return savedPlans;
    if (url.includes('/scenario/compare')) return { a: { descriptor: {}, result: result('weak', 0) }, b: { descriptor: {}, result: result('good', 1) }, comparison: cmp(1) };
    throw new Error(`unexpected ${url}`);
  }) as never);
}
const predicts = () => calls.filter(c => c.url.includes('/scenario/predict'));
const lastPredict = () => predicts().at(-1)!.body.scenario;

/** Make the scenario plan report a 260x160 box: its viewBox is 26x16 m, so 10 px = 1 m and the centre is world (0, 0). */
function sizePlan() {
  const svg = screen.getByTestId('plan-scenario');
  svg.getBoundingClientRect = () => ({ left: 0, top: 0, width: 260, height: 160, right: 260, bottom: 160, x: 0, y: 0, toJSON() {} }) as DOMRect;
  return svg;
}
async function ready() { render(<ScenarioStudio floorId="f1" canSave />); await screen.findByRole('note'); return sizePlan(); }

describe('ScenarioStudio', () => {
  beforeEach(() => { vi.clearAllMocks(); calls = []; savedPlans = []; installApi(); });

  it('always labels predictions as hypothetical, unvalidated and discloses synthetic evidence', async () => {
    await ready();
    const note = screen.getByRole('note');
    expect(note).toHaveTextContent(/not a measurement and not physically validated/i);
    expect(note).toHaveTextContent(/SYNTHETIC demonstration points/);
    expect(screen.getByText(/Model assumptions and limits/)).toBeInTheDocument();
    expect(document.querySelectorAll('[data-kind="recorded"]').length).toBe(2 * 2);          // both plans draw the two recorded points
    expect(document.querySelectorAll('[data-kind="existing-ap"]').length).toBe(2);
  });

  it('shows current vs scenario side by side, coloured by predicted band', async () => {
    await ready();
    await waitFor(() => expect(document.querySelector('[data-testid="plan-current"] [data-zone="Z-2"]')?.getAttribute('data-band')).toBe('weak'));
    expect(document.querySelector('[data-testid="plan-scenario"] [data-zone="Z-2"]')?.getAttribute('data-band')).toBe('weak');
    fireEvent.click(screen.getByTestId('plan-scenario'));                                          // place a virtual AP
    await waitFor(() => expect(document.querySelector('[data-testid="plan-scenario"] [data-zone="Z-2"]')?.getAttribute('data-band')).toBe('good'));
    expect(document.querySelector('[data-testid="plan-current"] [data-zone="Z-2"]')?.getAttribute('data-band')).toBe('weak');   // current layout unchanged
    expect(screen.getByText(/1 zone\(s\) improve a band/)).toBeInTheDocument();
    expect(screen.getByText(/not measured improvements/)).toBeInTheDocument();
  });

  it('places a candidate at the clicked world coordinates, then moves, removes, restores and discards it', async () => {
    const svg = await ready();
    fireEvent.click(svg, { clientX: 130, clientY: 80 });                                           // centre of the plan = world (0, 0)
    await waitFor(() => expect(lastPredict().candidates).toEqual([{ id: 'cand-1', name: 'Virtual AP 1', x_m: 0, y_m: 0, enabled: true }]));
    fireEvent.click(svg, { clientX: 230, clientY: 30 });                                           // +10 m east, +5 m north
    await waitFor(() => expect(lastPredict().candidates.map((c: any) => [c.x_m, c.y_m])).toEqual([[0, 0], [10, 5]]));
    expect(await screen.findByLabelText('cand-1 x (m)')).toHaveValue(0);

    fireEvent.change(screen.getByLabelText('cand-1 x (m)'), { target: { value: '4.26' } });       // accessible alternative to dragging; rounded to 0.1 m
    await waitFor(() => expect(lastPredict().candidates[0].x_m).toBe(4.3));
    fireEvent.change(screen.getByLabelText('cand-1 y (m)'), { target: { value: '999' } });         // clamped to the floor
    await waitFor(() => expect(lastPredict().candidates[0].y_m).toBe(5));

    const first = screen.getByLabelText('cand-1 name').closest('li')!;
    fireEvent.click(within(first).getByRole('button', { name: 'Remove' }));
    await waitFor(() => expect(lastPredict().candidates[0].enabled).toBe(false));
    expect(within(first).getByText(/restore to include it again/i)).toBeInTheDocument();
    fireEvent.click(within(first).getByRole('button', { name: 'Restore' }));
    await waitFor(() => expect(lastPredict().candidates[0].enabled).toBe(true));
    fireEvent.click(screen.getByRole('button', { name: 'Discard Virtual AP 1' }));
    await waitFor(() => expect(lastPredict().candidates.map((c: any) => c.id)).toEqual(['cand-2']));
  });

  it('virtually removes and restores a registered AP without touching the inventory', async () => {
    await ready();
    fireEvent.click(screen.getByLabelText(/Virtually remove SYN-AP-1/));
    await waitFor(() => expect(lastPredict().disabled_existing_ap_ids).toEqual(['ap1']));
    fireEvent.click(screen.getByLabelText(/Virtually remove SYN-AP-1/));
    await waitFor(() => expect(lastPredict().disabled_existing_ap_ids).toEqual([]));
    expect(calls.filter(c => c.url.includes('/access-points')).length).toBe(0);
  });

  it('records a parameter override only when it differs from the assumed default', async () => {
    await ready();
    const input = screen.getByLabelText('wall loss db');
    expect(screen.getByText('assumed default')).toBeInTheDocument();
    fireEvent.change(input, { target: { value: '9' } });
    await waitFor(() => expect(lastPredict().parameters).toEqual({ wall_loss_db: 9 }));
    expect(screen.getByText('set in scenario')).toBeInTheDocument();
    fireEvent.change(input, { target: { value: '6' } });
    await waitFor(() => expect(lastPredict().parameters).toEqual({}));
  });

  it('saves a scenario, then saves the next version with the expected version', async () => {
    const svg = await ready();
    fireEvent.click(svg);
    await screen.findByLabelText('cand-1 x (m)');
    fireEvent.change(screen.getByLabelText('Scenario name'), { target: { value: 'Two APs' } });
    fireEvent.click(screen.getByRole('button', { name: 'Save scenario' }));
    expect(await screen.findByText(/Saved "Two APs" as version 1\. Nothing was changed on any real network equipment/)).toBeInTheDocument();
    const post = calls.find(c => c.method === 'POST' && c.url.endsWith('/optimization/plans'))!;
    expect(post.body.floor_id).toBe('f1');
    expect(post.body.scenario.candidates).toHaveLength(1);
    fireEvent.click(await screen.findByRole('button', { name: 'Save as version 2' }));
    await waitFor(() => expect(calls.some(c => c.method === 'PATCH')).toBe(true));
    expect(calls.find(c => c.method === 'PATCH')!.body.expected_version).toBe(1);
  });

  it('reopens a saved scenario into the editor and compares it side by side', async () => {
    savedPlans = [{ id: 'p1', name: 'North plan', version: 3, status: 'draft', updated_at: null, scenario: SPEC(7), author: null }];
    await ready();
    fireEvent.click(await screen.findByRole('button', { name: 'Open North plan' }));
    expect(await screen.findByLabelText('cand-1 x (m)')).toHaveValue(7);
    expect(screen.getByLabelText('Scenario name')).toHaveValue('North plan');
    expect(screen.getByRole('button', { name: 'Save as version 4' })).toBeInTheDocument();
    fireEvent.change(screen.getByLabelText('Compare with saved scenario'), { target: { value: 'p1' } });
    fireEvent.click(screen.getByRole('button', { name: 'Compare side by side' }));
    await screen.findByText(/North plan v3 vs Current editor/);
    const cmpCall = calls.find(c => c.url.includes('/scenario/compare'))!;
    expect(cmpCall.body.a).toEqual({ plan_id: 'p1', version: 3 });
    expect(cmpCall.body.b.scenario.candidates[0].x_m).toBe(7);
    expect(screen.getByTestId('plan-current-candidate-cand-1')).toBeInTheDocument();             // the saved scenario's own virtual AP is drawn on the left
  });

  it('does not offer saving to viewers but still lets them explore', async () => {
    render(<ScenarioStudio floorId="f1" canSave={false} />);
    await screen.findByRole('note');
    expect(screen.queryByRole('button', { name: /Save scenario/ })).toBeNull();
    expect(screen.getByText(/Saving needs a network engineer or administrator/)).toBeInTheDocument();
    fireEvent.click(sizePlan());
    expect(await screen.findByLabelText('cand-1 x (m)')).toBeInTheDocument();
  });

  it('explains when a floor has no registered geometry instead of inventing one', async () => {
    installApi({ '/scenario/context': () => { throw new Error('No floor geometry is registered for this floor, so AP layouts cannot be modelled.'); } });
    render(<ScenarioStudio floorId="f9" canSave />);
    expect(await screen.findByRole('alert')).toHaveTextContent(/No floor geometry is registered/);
    expect(predicts()).toHaveLength(0);
  });

  it('shows prediction errors from the server and keeps the editor usable', async () => {
    installApi({ '/scenario/predict': () => { throw new Error('Candidate AP(s) [cand-1] lie outside the floor bounds'); } });
    const svg = await ready();
    fireEvent.click(svg);
    expect(await screen.findByText(/lie outside the floor bounds/)).toBeInTheDocument();
    expect(screen.getByLabelText('cand-1 x (m)')).toBeInTheDocument();
  });
});
