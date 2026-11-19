import { useCallback, useEffect, useMemo, useRef, useState } from 'react';
import * as THREE from 'three';
import { OrbitControls } from 'three/examples/jsm/controls/OrbitControls.js';
import { GLTFLoader } from 'three/examples/jsm/loaders/GLTFLoader.js';
import { Box, Layers, Map as MapIcon, RotateCcw, AlertCircle, Sparkles } from 'lucide-react';
import { Link } from 'react-router-dom';
import { apiRequest } from '../services/api';
import { campusService } from '../services/campusService';

/* Blender is Z-up (x east, y north); glTF export maps (x, y, z) -> (x, z, -y), so blender_y = -gltf_z. */

interface Level { key: string; code: string; title: string; floor_number: number; airgrid_floor_id: string | null; finished_floor_z_m: number; room_count: number }
interface ModelInfo { available: boolean; reason?: string; glb_url?: string; glb_bytes?: number; levels?: Level[] }
interface RoomCov { id: string; name: string; kind: string; wing?: string; area_m2?: number; polygon_world: number[][]; rssi_dbm: number | null; band: 'good' | 'fair' | 'weak' | 'unknown'; basis: string; points_in_room?: number }
interface Coverage { available: boolean; reason?: string; session: null | { name: string; points: number; all_synthetic_demo: boolean; provenance_counts: Record<string, number> }; method?: string; rooms: RoomCov[] }

const BAND_COLOUR: Record<string, string> = { good: '#4C8B5A', fair: '#D9A441', weak: '#C0504D', unknown: '#C9CBCF' };
const BAND_LABEL: Record<string, string> = { good: 'Good (≥ −67 dBm)', fair: 'Fair (−67 to −75 dBm)', weak: 'Weak (< −75 dBm)', unknown: 'Unknown (no measured support)' };
const FLOORS = ['ground', 'first', 'second', 'roof'];

function inPoly(x: number, y: number, poly: number[][]) {
  let c = false;
  for (let i = 0, j = poly.length - 1; i < poly.length; j = i++) {
    const [xi, yi] = poly[i], [xj, yj] = poly[j];
    if ((yi > y) !== (yj > y) && x < ((xj - xi) * (y - yi)) / (yj - yi) + xi) c = !c;
  }
  return c;
}

export default function CampusModelPage() {
  const mount = useRef<HTMLDivElement>(null);
  const three = useRef<{ camera: THREE.PerspectiveCamera; scene: THREE.Scene; root: THREE.Object3D | null; render: () => void; home: () => void } | null>(null);
  const [info, setInfo] = useState<ModelInfo | null>(null);
  const [state, setState] = useState<'loading' | 'ready' | 'error' | 'unavailable'>('loading');
  const [error, setError] = useState('');
  const [visible, setVisible] = useState<Record<string, boolean>>({ ground: true, first: true, second: true, roof: true });
  const [selected, setSelected] = useState<string | null>(null); // level key, or null for the whole building
  const [view, setView] = useState<'3d' | '2d'>('3d');
  const [coverage, setCoverage] = useState<Coverage | null>(null);
  const [room, setRoom] = useState<RoomCov | null>(null);
  const [sceneReady, setSceneReady] = useState(false);

  const level = useMemo(() => info?.levels?.find((l) => l.key === selected) ?? null, [info, selected]);

  // 1) find the model building, then its model info
  useEffect(() => {
    let dead = false;
    (async () => {
      try {
        const campuses = await campusService.listCampuses({ limit: 100 });
        for (const c of campuses.items) {
          const b = (await campusService.listBuildings(c.id)).find((x) => x.building_code === 'MEGA-MAIN');
          if (b) {
            const m = await apiRequest<ModelInfo>(`/api/v1/campus-model/buildings/${b.id}/model`);
            if (dead) return;
            setInfo(m); setState(m.available ? 'ready' : 'unavailable');
            return;
          }
        }
        if (!dead) { setInfo({ available: false, reason: 'No building with code MEGA-MAIN is registered for a campus you can access.' }); setState('unavailable'); }
      } catch (e) {
        if (!dead) { setError(e instanceof Error ? e.message : 'Failed to load the campus model.'); setState('error'); }
      }
    })();
    return () => { dead = true; };
  }, []);

  // 2) three.js scene, rendered on demand (no animation loop, so an integrated GPU stays idle)
  useEffect(() => {
    if (state !== 'ready' || !info?.glb_url || !mount.current) return;
    const el = mount.current;
    const renderer = new THREE.WebGLRenderer({ antialias: false, powerPreference: 'low-power' });
    renderer.setPixelRatio(Math.min(window.devicePixelRatio, 1.5));
    el.appendChild(renderer.domElement);
    const scene = new THREE.Scene();
    scene.background = new THREE.Color('#EEF0F2');
    scene.add(new THREE.HemisphereLight('#ffffff', '#9a9a92', 1.6));
    const sun = new THREE.DirectionalLight('#ffffff', 1.6); sun.position.set(60, 90, 40); scene.add(sun);
    const camera = new THREE.PerspectiveCamera(40, 1, 0.5, 1200);
    const controls = new OrbitControls(camera, renderer.domElement);
    controls.maxPolarAngle = Math.PI / 2 - 0.02;
    const render = () => renderer.render(scene, camera);
    controls.addEventListener('change', render);
    const home = () => { camera.position.set(95, 80, 110); controls.target.set(0, 4, 0); controls.update(); render(); };
    const resize = () => { const w = el.clientWidth, h = el.clientHeight; if (!w || !h) return; renderer.setSize(w, h); camera.aspect = w / h; camera.updateProjectionMatrix(); render(); };
    const ro = new ResizeObserver(resize); ro.observe(el);
    three.current = { camera, scene, root: null, render, home };

    let dead = false;
    (async () => {
      try {
        const res = await fetch(info.glb_url!, { credentials: 'include' });
        if (!res.ok) throw new Error(`Model download failed (${res.status}).`);
        new GLTFLoader().parse(await res.arrayBuffer(), '', (gltf) => {
          if (dead) return;
          scene.add(gltf.scene); three.current!.root = gltf.scene;
          resize(); home(); setSceneReady(true);
        }, (err) => { if (!dead) { setError(String((err as { message?: string })?.message ?? err)); setState('error'); } });
      } catch (e) { if (!dead) { setError(e instanceof Error ? e.message : 'Model failed to load.'); setState('error'); } }
    })();

    return () => {
      dead = true; ro.disconnect(); controls.dispose(); setSceneReady(false);
      scene.traverse((o) => {
        const m = o as THREE.Mesh; m.geometry?.dispose?.();
        (Array.isArray(m.material) ? m.material : [m.material]).forEach((x) => x?.dispose?.());
      });
      renderer.dispose(); renderer.domElement.remove(); three.current = null;
    };
  }, [state, info]);

  // 3) floor visibility. Every exported node carries extras.airgrid_floor: ground|first|second|roof|site|atrium.
  useEffect(() => {
    const t = three.current; if (!t?.root) return;
    t.root.traverse((o) => {
      const f = o.userData?.airgrid_floor as string | undefined; if (!f) return;
      if (f === 'site') { o.visible = true; return; }
      if (f === 'atrium') { o.visible = selected ? true : visible.ground; return; }
      o.visible = selected ? f === selected : visible[f] ?? true; // a selected floor is shown alone, roof hidden
    });
    t.render();
  }, [visible, selected, sceneReady]);

  // 4) coverage for the selected floor
  useEffect(() => {
    setRoom(null); setCoverage(null);
    if (!level?.airgrid_floor_id) return;
    let dead = false;
    apiRequest<Coverage>(`/api/v1/campus-model/floors/${level.airgrid_floor_id}/room-coverage`)
      .then((c) => !dead && setCoverage(c))
      .catch((e) => !dead && setError(e instanceof Error ? e.message : 'Coverage request failed.'));
    return () => { dead = true; };
  }, [level]);

  // 5) coverage overlay: one flat coloured polygon per room on the selected floor (blender (x, y) -> glTF (x, z = -y))
  useEffect(() => {
    const t = three.current; if (!t || !level || !coverage?.session) return;
    const group = new THREE.Group();
    coverage.rooms.forEach((r) => {
      const shape = new THREE.Shape(r.polygon_world.map(([x, y]) => new THREE.Vector2(x, y)));
      const mesh = new THREE.Mesh(new THREE.ShapeGeometry(shape), new THREE.MeshBasicMaterial({ color: BAND_COLOUR[r.band], transparent: true, opacity: room?.id === r.id ? 0.85 : 0.5, side: THREE.DoubleSide, depthWrite: false }));
      mesh.rotation.x = -Math.PI / 2; mesh.position.y = level.finished_floor_z_m + 0.08; // shape (x, y) -> world (x, 0, -y)
      group.add(mesh);
    });
    t.scene.add(group); t.render();
    return () => { t.scene.remove(group); group.traverse((o) => { const m = o as THREE.Mesh; m.geometry?.dispose(); (m.material as THREE.Material | undefined)?.dispose(); }); t.render(); };
  }, [level, coverage, room, sceneReady]);

  const pick = useCallback((ev: React.MouseEvent) => {
    const t = three.current; if (!t || !level || !coverage) return;
    const r = (ev.currentTarget as HTMLElement).getBoundingClientRect();
    const ndc = new THREE.Vector2(((ev.clientX - r.left) / r.width) * 2 - 1, -((ev.clientY - r.top) / r.height) * 2 + 1);
    const ray = new THREE.Raycaster(); ray.setFromCamera(ndc, t.camera);
    const hit = new THREE.Vector3();
    if (!ray.ray.intersectPlane(new THREE.Plane(new THREE.Vector3(0, 1, 0), -level.finished_floor_z_m), hit)) return;
    setRoom(coverage.rooms.find((rm) => inPoly(hit.x, -hit.z, rm.polygon_world)) ?? null); // glTF (x, z) -> Blender (x, -y)
  }, [level, coverage]);

  const planRooms = coverage?.rooms ?? [];
  const svgPt = (p: number[]) => `${p[0] + 48},${32 - p[1]}`; // plan bounds x -48..48, y -32..32 (north up)
  const synthetic = coverage?.session?.all_synthetic_demo;
  const btn = (on: boolean) => `px-2.5 py-1 rounded-md text-xs border ${on ? 'bg-editorial-copper text-white border-editorial-copper' : 'bg-white border-editorial-border text-editorial-dark hover:bg-editorial-surface'}`;

  return (
    <div className="space-y-4 max-w-7xl mx-auto">
      <header className="flex flex-wrap items-center justify-between gap-3">
        <div>
          <h1 className="text-xl font-semibold text-editorial-dark flex items-center gap-2"><Box className="w-5 h-5 text-editorial-copper" /> 3D Campus</h1>
          <p className="text-xs text-editorial-muted">Interactive Blender model of the Mega Campus main building. Coverage is interpolated from survey points; it is not a radio-propagation simulation.</p>
        </div>
        <div className="flex gap-2" role="group" aria-label="View mode">
          {(['3d', '2d'] as const).map((v) => (
            <button key={v} onClick={() => setView(v)} aria-pressed={view === v}
              className={`px-3 py-1.5 rounded-lg text-xs font-medium border ${view === v ? 'bg-editorial-dark text-white border-editorial-dark' : 'bg-white text-editorial-dark border-editorial-border hover:bg-editorial-surface'}`}>
              {v === '3d' ? '3D model' : '2D floor plan'}
            </button>
          ))}
        </div>
      </header>

      {state === 'loading' && <div className="rounded-xl border border-editorial-border bg-white p-6 text-sm text-editorial-muted" role="status">Loading campus model…</div>}
      {(state === 'error' || state === 'unavailable') && (
        <div className="rounded-xl border border-rose-200 bg-rose-50 p-4 text-sm text-rose-800 flex gap-2" role="alert">
          <AlertCircle className="w-4 h-4 mt-0.5 flex-shrink-0" />
          <div>
            <p className="font-medium">{state === 'error' ? 'The campus model could not be loaded.' : '3D model unavailable.'}</p>
            <p className="text-xs mt-1">{state === 'error' ? error : info?.reason}</p>
          </div>
        </div>
      )}

      {state === 'ready' && info && (
        <div className="grid gap-4 lg:grid-cols-[1fr_320px]">
          <div className="space-y-3 min-w-0">
            <div className="flex flex-wrap items-center gap-2">
              <Layers className="w-4 h-4 text-editorial-muted" aria-hidden />
              <button onClick={() => setSelected(null)} aria-pressed={selected === null} className={btn(selected === null)}>Whole building</button>
              {info.levels?.map((l) => <button key={l.key} onClick={() => setSelected(l.key)} aria-pressed={selected === l.key} className={btn(selected === l.key)}>{l.title}</button>)}
              {!selected && (
                <>
                  <span className="mx-1 text-editorial-border">|</span>
                  {FLOORS.map((k) => (
                    <label key={k} className="flex items-center gap-1 text-xs text-editorial-muted capitalize">
                      <input type="checkbox" checked={visible[k]} onChange={(e) => setVisible((v) => ({ ...v, [k]: e.target.checked }))} /> {k}
                    </label>
                  ))}
                </>
              )}
              {view === '3d' && <button onClick={() => three.current?.home()} className="ml-auto flex items-center gap-1 px-2.5 py-1 rounded-md text-xs border bg-white border-editorial-border hover:bg-editorial-surface"><RotateCcw className="w-3 h-3" /> Reset camera</button>}
            </div>

            <div className={view === '3d' ? '' : 'hidden'}>
              <div ref={mount} onClick={pick} className="w-full h-[56vh] min-h-[320px] rounded-xl border border-editorial-border overflow-hidden bg-[#EEF0F2] touch-none" role="img"
                aria-label="Interactive 3D model of the campus. Drag to orbit, scroll to zoom, right-drag to pan." />
              <p className="text-[11px] text-editorial-muted mt-1">Drag to orbit · scroll or pinch to zoom · right-drag or two-finger drag to pan. {selected ? 'Click the floor to select a room.' : 'Select a floor to pick rooms.'}</p>
            </div>

            {view === '2d' && (
              <div className="rounded-xl border border-editorial-border bg-white p-3">
                {!level ? <p className="text-sm text-editorial-muted p-6">Select Ground, First or Second floor above to show its plan.</p> : (
                  <svg viewBox="0 0 96 64" className="w-full h-auto max-h-[60vh]" role="img" aria-label={`${level.title} plan, rooms coloured by estimated signal band`}>
                    {planRooms.map((r) => (
                      <polygon key={r.id} points={r.polygon_world.map(svgPt).join(' ')} fill={BAND_COLOUR[r.band]} fillOpacity={0.55}
                        stroke={room?.id === r.id ? '#0B0B0D' : '#fff'} strokeWidth={room?.id === r.id ? 0.45 : 0.2} className="cursor-pointer" onClick={() => setRoom(r)}>
                        <title>{`${r.id} ${r.name}: ${r.rssi_dbm ?? 'unknown'} dBm`}</title>
                      </polygon>
                    ))}
                  </svg>
                )}
              </div>
            )}
          </div>

          <aside className="space-y-3">
            <section className="rounded-xl border border-editorial-border bg-white p-3.5 text-xs space-y-2" aria-live="polite">
              <h2 className="text-sm font-semibold text-editorial-dark">{level ? level.title : 'Building'}</h2>
              {!level && <p className="text-editorial-muted">Choose a floor to see its rooms and Wi-Fi coverage estimates.</p>}
              {level && !level.airgrid_floor_id && <p className="text-editorial-muted">No AirGrid floor record is linked to this level, so no coverage is available.</p>}
              {level && coverage && !coverage.session && <p className="text-editorial-muted">{coverage.reason} Coverage is unknown.</p>}
              {coverage?.session && (
                <>
                  {synthetic && <p className="rounded-md bg-amber-50 border border-amber-200 text-amber-900 px-2 py-1.5"><b>Synthetic demo data.</b> These {coverage.session.points} points are deterministic test values, not field measurements.</p>}
                  <p className="text-editorial-muted">Session “{coverage.session.name}” · {Object.entries(coverage.session.provenance_counts).map(([k, v]) => `${k}: ${v}`).join(', ')}</p>
                  <p className="text-editorial-muted">{coverage.method}</p>
                  <ul className="space-y-1">{Object.keys(BAND_COLOUR).map((b) => (
                    <li key={b} className="flex items-center gap-2"><span className="inline-block w-3 h-3 rounded-sm" style={{ background: BAND_COLOUR[b] }} />{BAND_LABEL[b]} <span className="ml-auto text-editorial-muted">{planRooms.filter((r) => r.band === b).length}</span></li>
                  ))}</ul>
                </>
              )}
            </section>

            <section className="rounded-xl border border-editorial-border bg-white p-3.5 text-xs space-y-1.5">
              <h2 className="text-sm font-semibold text-editorial-dark">Room</h2>
              {!room ? <p className="text-editorial-muted">No room selected.</p> : (
                <>
                  <p className="font-medium text-editorial-dark">{room.id} · {room.name}</p>
                  <p className="text-editorial-muted capitalize">{room.kind}{room.wing ? ` · ${room.wing.replace('_', ' ')}` : ''}{room.area_m2 ? ` · ${room.area_m2} m²` : ''}</p>
                  <p>Estimated signal: <b>{room.rssi_dbm === null ? 'unknown' : `${room.rssi_dbm} dBm`}</b> ({BAND_LABEL[room.band]})</p>
                  <p className="text-editorial-muted">Basis: {room.basis.replace(/_/g, ' ')}{room.points_in_room ? ` (${room.points_in_room} points)` : ''}</p>
                  <Link to="/ai-copilot" state={{ floorId: level?.airgrid_floor_id, prompt: `Explain the Wi-Fi coverage in room ${room.id} (${room.name}).` }}
                    className="inline-flex items-center gap-1 text-editorial-copper hover:underline"><Sparkles className="w-3 h-3" /> Ask the Copilot</Link>
                </>
              )}
            </section>
            {level?.airgrid_floor_id && (
              <Link to="/heatmaps" className="flex items-center gap-1.5 text-xs text-editorial-copper hover:underline"><MapIcon className="w-3.5 h-3.5" aria-hidden /> Open Wi-Fi Heatmaps</Link>
            )}
            <p className="text-[10px] text-editorial-muted">Model {(info.glb_bytes! / 1e6).toFixed(1)} MB · glTF Y-up; Blender Z-up mapping (x, y, z) → (x, z, −y)</p>
          </aside>
        </div>
      )}
    </div>
  );
}
