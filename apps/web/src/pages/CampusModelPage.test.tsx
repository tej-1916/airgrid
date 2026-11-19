import { describe, it, expect, vi, beforeEach } from 'vitest';
import { render, screen, fireEvent, waitFor } from '@testing-library/react';
import { MemoryRouter } from 'react-router-dom';
import CampusModelPage from './CampusModelPage';
import { apiRequest } from '../services/api';
import { campusService } from '../services/campusService';

vi.mock('../services/api', () => ({ apiRequest: vi.fn() }));
vi.mock('../services/campusService', () => ({ campusService: { listCampuses: vi.fn(), listBuildings: vi.fn() } }));
vi.mock('three', async (orig) => {
  const actual = await orig<typeof import('three')>();
  class FakeRenderer { domElement = document.createElement('canvas'); setPixelRatio() {} setSize() {} render() {} dispose() {} }
  return { ...actual, WebGLRenderer: FakeRenderer };
});
vi.mock('three/examples/jsm/controls/OrbitControls.js', () => ({
  OrbitControls: class { target = { set() {} }; maxPolarAngle = 0; addEventListener() {} update() {} dispose() {} },
}));
vi.mock('three/examples/jsm/loaders/GLTFLoader.js', async () => {
  const THREE = await import('three');
  return { GLTFLoader: class { parse(_b: ArrayBuffer, _p: string, ok: (g: { scene: unknown }) => void) { ok({ scene: new THREE.Group() }); } } };
});

const INFO = {
  available: true, glb_url: '/api/v1/campus-model/buildings/b1/model.glb', glb_bytes: 3_200_000,
  levels: [
    { key: 'ground', code: 'GF', title: 'Ground Floor', floor_number: 0, airgrid_floor_id: 'f0', finished_floor_z_m: 0, room_count: 2 },
    { key: 'first', code: 'FF', title: 'First Floor', floor_number: 1, airgrid_floor_id: 'f1', finished_floor_z_m: 4, room_count: 2 },
    { key: 'second', code: 'SF', title: 'Second Floor', floor_number: 2, airgrid_floor_id: null, finished_floor_z_m: 8, room_count: 2 },
  ],
};
const room = (id: string, x0: number, band: string, rssi: number | null) => ({
  id, name: `Room ${id}`, kind: 'room', wing: 'North_Wing', area_m2: 50, polygon_world: [[x0, 0], [x0 + 5, 0], [x0 + 5, 5], [x0, 5]],
  rssi_dbm: rssi, band, basis: 'measured_points_in_room', points_in_room: 3,
});
const COVERAGE = {
  available: true,
  session: { name: 'SYNTHETIC DEMO survey', points: 12, all_synthetic_demo: true, provenance_counts: { controlled_test_import: 12 } },
  method: 'inverse_distance_weighting (not a radio-propagation simulation)',
  rooms: [room('GF-1', 0, 'good', -55), room('GF-2', 10, 'weak', -82)],
};

function mockApi(info: unknown = INFO) {
  vi.mocked(campusService.listCampuses).mockResolvedValue({ total: 1, skip: 0, limit: 100, items: [{ id: 'c1' }] } as never);
  vi.mocked(campusService.listBuildings).mockResolvedValue([{ id: 'b1', building_code: 'MEGA-MAIN' }] as never);
  vi.mocked(apiRequest).mockImplementation((async (url: string) => (url.includes('room-coverage') ? COVERAGE : info)) as never);
  globalThis.fetch = vi.fn().mockResolvedValue({ ok: true, arrayBuffer: async () => new ArrayBuffer(8) }) as never;
}
const renderPage = () => render(<MemoryRouter><CampusModelPage /></MemoryRouter>);

describe('CampusModelPage', () => {
  beforeEach(() => { vi.clearAllMocks(); });

  it('shows a loading state while the model is being located', () => {
    vi.mocked(campusService.listCampuses).mockReturnValue(new Promise(() => {}));
    renderPage();
    expect(screen.getByRole('status')).toHaveTextContent(/loading campus model/i);
  });

  it('explains clearly when the GLB/model files are not installed', async () => {
    mockApi({ available: false, reason: 'The campus model files are not installed on this server (they are not distributed with the repository).' });
    renderPage();
    expect(await screen.findByRole('alert')).toHaveTextContent(/3D model unavailable/i);
    expect(screen.getByRole('alert')).toHaveTextContent(/not distributed with the repository/i);
    expect(screen.queryByRole('button', { name: 'Ground Floor' })).not.toBeInTheDocument();
  });

  it('shows a recoverable error when the API fails', async () => {
    vi.mocked(campusService.listCampuses).mockRejectedValue(new Error('Network down'));
    renderPage();
    expect(await screen.findByRole('alert')).toHaveTextContent(/could not be loaded/i);
    expect(screen.getByRole('alert')).toHaveTextContent('Network down');
  });

  it('reports a missing building registration instead of an empty page', async () => {
    vi.mocked(campusService.listCampuses).mockResolvedValue({ total: 1, skip: 0, limit: 100, items: [{ id: 'c1' }] } as never);
    vi.mocked(campusService.listBuildings).mockResolvedValue([{ id: 'x', building_code: 'OTHER' }] as never);
    renderPage();
    expect(await screen.findByRole('alert')).toHaveTextContent(/No building with code MEGA-MAIN/i);
  });

  it('renders the viewer, floor controls and camera reset once the model loads', async () => {
    mockApi();
    renderPage();
    expect(await screen.findByRole('button', { name: 'Ground Floor' })).toBeInTheDocument();
    expect(screen.getByRole('img', { name: /interactive 3d model/i })).toBeInTheDocument();
    expect(screen.getByRole('button', { name: /reset camera/i })).toBeInTheDocument();
    expect(screen.getByRole('button', { name: 'Whole building' })).toHaveAttribute('aria-pressed', 'true');
  });

  it('selects a floor, loads its coverage, discloses synthetic data and fills the legend', async () => {
    mockApi();
    renderPage();
    fireEvent.click(await screen.findByRole('button', { name: 'Ground Floor' }));
    expect(await screen.findByText(/Synthetic demo data/)).toBeInTheDocument();
    expect(vi.mocked(apiRequest)).toHaveBeenCalledWith('/api/v1/campus-model/floors/f0/room-coverage');
    expect(screen.getByRole('button', { name: 'Ground Floor' })).toHaveAttribute('aria-pressed', 'true');
    const legend = screen.getByText(/Weak \(< −75 dBm\)/).closest('li')!;
    expect(legend).toHaveTextContent('1');
  });

  it('says coverage is unavailable for a level with no linked AirGrid floor', async () => {
    mockApi();
    renderPage();
    fireEvent.click(await screen.findByRole('button', { name: 'Second Floor' }));
    expect(await screen.findByText(/No AirGrid floor record is linked/i)).toBeInTheDocument();
    expect(screen.queryByText(/Synthetic demo data/)).not.toBeInTheDocument();
  });

  it('draws coloured room overlays in the 2D plan and selects a room', async () => {
    mockApi();
    const { container } = renderPage();
    fireEvent.click(await screen.findByRole('button', { name: 'Ground Floor' }));
    await screen.findByText(/Synthetic demo data/);
    fireEvent.click(screen.getByRole('button', { name: '2D floor plan' }));
    const polys = container.querySelectorAll('svg polygon');
    expect(polys).toHaveLength(2);
    expect(polys[0]).toHaveAttribute('fill', '#4C8B5A'); // good
    expect(polys[1]).toHaveAttribute('fill', '#C0504D'); // weak
    fireEvent.click(polys[1]);
    expect(await screen.findByText(/GF-2 · Room GF-2/)).toBeInTheDocument();
    expect(screen.getByText(/Estimated signal:/)).toHaveTextContent('-82 dBm');
    expect(screen.getByRole('link', { name: /ask the copilot/i })).toHaveAttribute('href', '/ai-copilot');
  });

  it('asks for a floor before the 2D plan can be shown', async () => {
    mockApi();
    renderPage();
    await screen.findByRole('button', { name: 'Ground Floor' });
    fireEvent.click(screen.getByRole('button', { name: '2D floor plan' }));
    expect(screen.getByText(/Select Ground, First or Second floor/i)).toBeInTheDocument();
  });
});

describe('CampusModelPage unified heatmap studio', () => {
  const POINTS = [{ x_m: -12, y_m: -3, rssi_dbm: -55, provenance: 'controlled_test_import' }, { x_m: 12, y_m: 3, rssi_dbm: -84, provenance: 'controlled_test_import' }];
  const SESSIONS = [{ id: 's2', name: 'follow-up', started_at: null }, { id: 's1', name: 'first walk', started_at: null }];
  const cov = (session: string, synthetic = true, shift = 0) => ({
    ...COVERAGE, session: { id: session, name: session === 's1' ? 'first walk' : 'follow-up', points: 2, all_synthetic_demo: synthetic, provenance_counts: { [synthetic ? 'controlled_test_import' : 'operator_reported']: 2 } },
    sessions: SESSIONS, points: POINTS.map((p) => ({ ...p, provenance: synthetic ? p.provenance : 'operator_reported' })),
    rooms: [{ ...room('GF-1', 0, 'good', -55 + shift), nearest_point_m: 3.1 }, { ...room('GF-2', 10, 'weak', -82 + shift), basis: 'interpolated_at_room_centre', points_in_room: 0, nearest_point_m: 14.2 }],
  });
  const DIFF = { available: true, note: 'Difference between two recorded surveys per room; not a prediction.', rooms: [
    { id: 'GF-1', delta_db: -10, a_band: 'good', b_band: 'fair', comparable: true }, { id: 'GF-2', delta_db: null, a_band: 'weak', b_band: 'unknown', comparable: false }] };

  function mock(synthetic = true) {
    vi.mocked(campusService.listCampuses).mockResolvedValue({ total: 1, skip: 0, limit: 100, items: [{ id: 'c1' }] } as never);
    vi.mocked(campusService.listBuildings).mockResolvedValue([{ id: 'b1', building_code: 'MEGA-MAIN' }] as never);
    vi.mocked(apiRequest).mockImplementation((async (url: string) => {
      if (url.includes('/room-coverage/compare')) return DIFF;
      if (url.includes('session_id=s1')) return cov('s1', synthetic, 0);
      if (url.includes('room-coverage')) return cov('s2', synthetic, -10);
      return INFO;
    }) as never);
    globalThis.fetch = vi.fn().mockResolvedValue({ ok: true, arrayBuffer: async () => new ArrayBuffer(8) }) as never;
  }
  const open = async () => { const r = render(<MemoryRouter><CampusModelPage /></MemoryRouter>); fireEvent.click(await screen.findByRole('button', { name: 'Ground Floor' })); await screen.findByLabelText('Survey session'); return r; };
  const bands2d = (c: HTMLElement) => Object.fromEntries([...c.querySelectorAll('svg polygon[data-room]')].map((p) => [p.getAttribute('data-room'), p.getAttribute('data-band')]));

  beforeEach(() => { vi.clearAllMocks(); });

  it('draws the same room bands and the same recorded points in the 3D overlay and the 2D plan', async () => {
    mock();
    const { container } = await open();
    const host = container.querySelector('[role="img"][aria-label^="Interactive 3D"]') as HTMLElement;
    await waitFor(() => expect(host.dataset.overlayBands).toBeDefined());
    const overlay3d = JSON.parse(host.dataset.overlayBands!);
    fireEvent.click(screen.getByRole('button', { name: '2D floor plan' }));
    expect(bands2d(container)).toEqual(overlay3d);                                  // same survey -> identical bands per room in both views
    expect(overlay3d).toEqual({ 'GF-1': 'good', 'GF-2': 'weak' });
    expect(host.dataset.overlayPoints).toBe('2');
    expect(container.querySelectorAll('svg circle[data-kind="recorded"]')).toHaveLength(2);
    fireEvent.click(screen.getByLabelText(/Show recorded measurement points/));      // hiding points hides them in both views
    expect(container.querySelectorAll('svg circle[data-kind="recorded"]')).toHaveLength(0);
    await waitFor(() => expect(host.dataset.overlayPoints).toBe('0'));
  });

  it('switches survey session and re-reads coverage for that session only', async () => {
    mock();
    const { container } = await open();
    expect(screen.getByLabelText('Survey session')).toHaveValue('s2');
    fireEvent.change(screen.getByLabelText('Survey session'), { target: { value: 's1' } });
    await waitFor(() => expect(vi.mocked(apiRequest)).toHaveBeenCalledWith('/api/v1/campus-model/floors/f0/room-coverage?session_id=s1'));
    await waitFor(() => expect(screen.getByLabelText('Survey session')).toHaveValue('s1'));
    fireEvent.click(screen.getByRole('button', { name: '2D floor plan' }));
    expect(bands2d(container)).toEqual({ 'GF-1': 'good', 'GF-2': 'weak' });
  });

  it('does not send a session id from another floor after the level changes', async () => {
    mock();
    await open();
    fireEvent.change(screen.getByLabelText('Survey session'), { target: { value: 's1' } });
    await waitFor(() => expect(screen.getByLabelText('Survey session')).toHaveValue('s1'));
    vi.mocked(apiRequest).mockClear();
    fireEvent.click(screen.getByRole('button', { name: 'First Floor' }));
    await waitFor(() => expect(vi.mocked(apiRequest)).toHaveBeenCalledWith('/api/v1/campus-model/floors/f1/room-coverage'));
    expect(vi.mocked(apiRequest).mock.calls.some(([u]) => String(u).includes('session_id'))).toBe(false);
  });

  it('compares two surveys per room and can colour the plan by the difference', async () => {
    mock();
    const { container } = await open();
    fireEvent.change(screen.getByLabelText('Compare with session'), { target: { value: 's1' } });
    await waitFor(() => expect(vi.mocked(apiRequest)).toHaveBeenCalledWith('/api/v1/campus-model/floors/f0/room-coverage/compare?a=s2&b=s1'));
    fireEvent.change(await screen.findByLabelText('Colour by'), { target: { value: 'difference' } });
    fireEvent.click(screen.getByRole('button', { name: '2D floor plan' }));
    const polys = container.querySelectorAll('svg polygon[data-room]');
    expect(polys[0]).toHaveAttribute('fill', '#C0504D');                            // GF-1: 10 dB weaker
    expect(polys[1]).toHaveAttribute('fill', '#C9CBCF');                            // GF-2: not comparable -> neutral, never guessed
    expect(polys[0]).toHaveAttribute('data-band', 'good');                           // the band itself is unchanged by the layer choice
    expect(screen.getByText(/not a prediction/)).toBeInTheDocument();
    fireEvent.click(polys[0]);
    expect(await screen.findByText(/Difference between surveys:/)).toHaveTextContent('-10 dB');
  });

  it('labels evidence quality per room and separates real from synthetic data', async () => {
    mock(false);
    const { container } = await open();
    expect(screen.getByText(/Recorded survey points\./)).toBeInTheDocument();
    expect(screen.queryByText(/Synthetic demo data/)).not.toBeInTheDocument();
    fireEvent.click(screen.getByRole('button', { name: '2D floor plan' }));
    fireEvent.click(container.querySelectorAll('svg polygon[data-room]')[1]);
    expect(await screen.findByText(/Evidence: interpolated \(no point inside the room\)/)).toHaveTextContent('nearest recorded point 14.2 m');
  });

  it('links to the Optimization Studio carrying the selected floor', async () => {
    mock();
    await open();
    expect(screen.getByRole('link', { name: /Open Optimization Studio/ })).toHaveAttribute('href', '/optimization');
  });
});
