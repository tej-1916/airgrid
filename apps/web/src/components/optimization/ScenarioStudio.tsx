import React, { useCallback, useEffect, useMemo, useRef, useState } from 'react';
import { apiRequest } from '../../services/api';
import {
  BAND_COLOUR, BAND_LABEL, Band, Candidate, Comparison, PlanVersionRow, PredictResponse, SavedScenarioPlan, ScenarioContext, ScenarioResult,
  ScenarioSpec, ZoneChange, ZoneResult,
} from '../../types/scenario';

type Mode = 'band' | 'delta' | 'confidence';
const r1 = (n: number) => Math.round(n * 10) / 10;
const bandOf = (dbm: number): Band => (dbm >= -67 ? 'good' : dbm < -75 ? 'weak' : 'fair');
const fmt = (n: number | null | undefined, unit = '') => (n === null || n === undefined ? 'unknown' : `${n}${unit}`);

interface PlanProps {
  ctx: ScenarioContext; zones: ZoneResult[] | null; mode: Mode; cands: Candidate[]; deltas?: Record<string, ZoneChange>;
  showRecorded: boolean; showExisting: boolean; disabledExisting: string[]; selected: string | null; editable: boolean; title: string; testId: string;
  onPlace?: (x: number, y: number) => void; onMove?: (id: string, x: number, y: number) => void; onSelect?: (id: string | null) => void;
}

/** 2D floor plan in Blender world metres (x east, y north). Zones are the model's rooms + corridors. */
export const ScenarioPlan: React.FC<PlanProps> = ({ ctx, zones, mode, cands, deltas, showRecorded, showExisting, disabledExisting, selected, editable, title, testId, onPlace, onMove, onSelect }) => {
  const [[x0, y0], [x1, y1]] = [ctx.floor.bounds.min, ctx.floor.bounds.max];
  const pad = 3, w = x1 - x0 + 2 * pad, h = y1 - y0 + 2 * pad;
  const svgRef = useRef<SVGSVGElement>(null);
  const drag = useRef<{ id: string; moved: boolean } | null>(null);
  const suppressClick = useRef(false);
  const byId = useMemo(() => Object.fromEntries((zones || []).map(z => [z.id, z])), [zones]);
  const toWorld = (e: { clientX: number; clientY: number }): [number, number] => {
    const rect = svgRef.current!.getBoundingClientRect();
    const fx = rect.width ? (e.clientX - rect.left) / rect.width : 0.5, fy = rect.height ? (e.clientY - rect.top) / rect.height : 0.5;
    const x = x0 - pad + fx * w, y = y1 + pad - fy * h;                 // SVG y grows downward; world y grows north
    return [r1(Math.min(x1, Math.max(x0, x))), r1(Math.min(y1, Math.max(y0, y)))];
  };
  const fill = (id: string): { fill: string; opacity: number } => {
    const z = byId[id];
    if (!z) return { fill: BAND_COLOUR.unknown, opacity: 0.35 };
    if (mode === 'delta') {
      const d = deltas?.[id];
      if (!d) return { fill: BAND_COLOUR.unknown, opacity: 0.35 };
      return { fill: d.change === 'improved' ? '#2E7D5B' : d.change === 'worsened' ? '#C0504D' : '#C9CBCF', opacity: d.within_model_uncertainty ? 0.3 : 0.75 };
    }
    if (mode === 'confidence') return { fill: z.band === 'unknown' ? BAND_COLOUR.unknown : '#3B6EA8', opacity: z.band === 'unknown' ? 0.35 : 0.15 + 0.7 * z.confidence };
    return { fill: BAND_COLOUR[z.band], opacity: 0.6 };
  };
  return <figure className="min-w-0">
    <figcaption className="text-sm font-semibold mb-1">{title}</figcaption>
    <svg ref={svgRef} data-testid={testId} viewBox={`${x0 - pad} ${-(y1 + pad)} ${w} ${h}`} style={{ aspectRatio: `${w}/${h}` }}
      className={`w-full rounded-lg border bg-[#F7F7F5] touch-none ${editable ? 'cursor-crosshair' : ''}`} role="img" aria-label={`${title}. ${ctx.floor.title} plan, metres.`}
      onPointerMove={e => { if (drag.current && onMove) { drag.current.moved = true; const [x, y] = toWorld(e); onMove(drag.current.id, x, y); } }}
      onPointerUp={() => { if (drag.current?.moved) suppressClick.current = true; drag.current = null; }}
      onClick={e => { if (suppressClick.current) { suppressClick.current = false; return; } if (editable && onPlace) { const [x, y] = toWorld(e); onPlace(x, y); } else onSelect?.(null); }}>
      {ctx.courtyard_bounds && <rect x={ctx.courtyard_bounds.min[0]} y={-ctx.courtyard_bounds.max[1]} width={ctx.courtyard_bounds.max[0] - ctx.courtyard_bounds.min[0]}
        height={ctx.courtyard_bounds.max[1] - ctx.courtyard_bounds.min[1]} fill="none" stroke="#9AA" strokeDasharray="1 1" strokeWidth={0.2}><title>Courtyard: outdoor, not modelled</title></rect>}
      {ctx.zones.map(z => { const f = fill(z.id), r = byId[z.id]; const [cx, cy] = [z.polygon_world.reduce((s, p) => s + p[0], 0) / z.polygon_world.length, z.polygon_world.reduce((s, p) => s + p[1], 0) / z.polygon_world.length];
        return <g key={z.id}><polygon data-zone={z.id} data-band={r?.band ?? 'unknown'} points={z.polygon_world.map(p => `${p[0]},${-p[1]}`).join(' ')} fill={f.fill} fillOpacity={f.opacity}
          stroke="#fff" strokeWidth={0.25} strokeDasharray={r?.uncertain ? '0.8 0.5' : undefined}><title>{`${z.id} ${z.name}: ${fmt(r?.mean_dbm, ' dBm')} (${r?.band ?? 'unknown'})${r?.uncertain ? ', band uncertain' : ''}`}</title></polygon>
          <text x={cx} y={-cy} fontSize={1.5} textAnchor="middle" fill="#222" pointerEvents="none">{z.id}</text></g>; })}
      {showRecorded && ctx.recorded_points.map((p, i) => <circle key={i} data-kind="recorded" cx={p.x_m} cy={-p.y_m} r={0.4} fill={BAND_COLOUR[bandOf(p.rssi_dbm)]} stroke="#111" strokeWidth={0.12} pointerEvents="none"><title>{`Recorded ${p.rssi_dbm} dBm`}</title></circle>)}
      {showExisting && ctx.existing_access_points.map(a => { const off = disabledExisting.includes(a.id);
        return <g key={a.id} data-kind="existing-ap" opacity={off ? 0.4 : 1} pointerEvents="none"><rect x={a.x_m - 0.9} y={-a.y_m - 0.9} width={1.8} height={1.8} fill="#0B0B0D" strokeDasharray={off ? '0.4 0.3' : undefined} stroke="#fff" strokeWidth={0.15} /><text x={a.x_m} y={-a.y_m - 1.4} fontSize={1.2} textAnchor="middle">{a.name}{off ? ' (virtually removed)' : ''}</text></g>; })}
      {cands.map(c => <g key={c.id} data-testid={`${testId}-candidate-${c.id}`} data-enabled={c.enabled} className={editable ? 'cursor-grab' : ''}
        onPointerDown={e => { if (!editable) return; e.stopPropagation(); drag.current = { id: c.id, moved: false }; onSelect?.(c.id); }}
        onClick={e => { e.stopPropagation(); onSelect?.(c.id); }}>
        <circle cx={c.x_m} cy={-c.y_m} r={selected === c.id ? 1.6 : 1.2} fill={c.enabled ? '#BE6B37' : '#fff'} stroke={c.enabled ? '#fff' : '#BE6B37'} strokeWidth={0.3} strokeDasharray={c.enabled ? undefined : '0.5 0.4'} />
        <text x={c.x_m} y={-c.y_m - 1.8} fontSize={1.2} textAnchor="middle" fontWeight="bold">{c.name} (hypothetical)</text></g>)}
    </svg>
  </figure>;
};

const Legend: React.FC<{ mode: Mode }> = ({ mode }) => <ul className="flex flex-wrap gap-x-4 gap-y-1 text-xs" aria-label="Legend">
  {mode === 'band' && (Object.keys(BAND_COLOUR) as Band[]).map(b => <li key={b} className="flex items-center gap-1"><span className="inline-block w-3 h-3 rounded-sm" style={{ background: BAND_COLOUR[b] }} />{BAND_LABEL[b]}</li>)}
  {mode === 'delta' && <><li><span className="inline-block w-3 h-3 rounded-sm mr-1" style={{ background: '#2E7D5B' }} />Predicted to improve a band</li><li><span className="inline-block w-3 h-3 rounded-sm mr-1" style={{ background: '#C0504D' }} />Predicted to worsen</li><li><span className="inline-block w-3 h-3 rounded-sm mr-1" style={{ background: '#C9CBCF' }} />No band change · pale = within modelled uncertainty</li></>}
  {mode === 'confidence' && <li><span className="inline-block w-3 h-3 rounded-sm mr-1" style={{ background: '#3B6EA8' }} />Darker = more confident of the band · grey = no AP modelled</li>}
  <li><span className="inline-block w-3 h-3 rounded-full mr-1 align-middle" style={{ background: '#BE6B37' }} />Hypothetical AP</li><li><span className="inline-block w-3 h-3 mr-1 align-middle bg-[#0B0B0D]" />Registered AP</li><li>Dashed zone outline = band uncertain</li>
</ul>;

const download = (name: string, text: string, type: string) => {
  const url = URL.createObjectURL(new Blob([text], { type })); const a = document.createElement('a'); a.href = url; a.download = name; a.click(); URL.revokeObjectURL(url);
};

const SummaryTable: React.FC<{ cmp: Comparison; aLabel: string; bLabel: string }> = ({ cmp, aLabel, bLabel }) => {
  const rows: [string, string][] = [['weak_area_m2', 'Weak area (m²)'], ['fair_area_m2', 'Fair area (m²)'], ['good_area_m2', 'Good area (m²)'], ['expected_weak_area_m2', 'Expected weak area incl. uncertainty (m²)'], ['weak_zones', 'Weak zones'], ['uncertain_zones', 'Zones with uncertain band']];
  return <table className="text-sm w-full"><thead><tr className="text-left text-neutral-500"><th className="p-1">Model-predicted metric</th><th className="p-1">{aLabel}</th><th className="p-1">{bLabel}</th><th className="p-1">Change</th></tr></thead>
    <tbody>{rows.map(([k, label]) => cmp.summary[k] && <tr key={k} className="border-t"><td className="p-1">{label}</td><td className="p-1">{cmp.summary[k].a}</td><td className="p-1">{cmp.summary[k].b}</td><td className="p-1">{cmp.summary[k].delta > 0 ? '+' : ''}{cmp.summary[k].delta}</td></tr>)}</tbody></table>;
};

export const ScenarioStudio: React.FC<{ floorId: string; canSave: boolean }> = ({ floorId, canSave }) => {
  const [ctx, setCtx] = useState<ScenarioContext | null>(null);
  const [error, setError] = useState('');
  const [sessionId, setSessionId] = useState('');
  const [cands, setCands] = useState<Candidate[]>([]);
  const [params, setParams] = useState<Record<string, number>>({});
  const [disabledExisting, setDisabledExisting] = useState<string[]>([]);
  const [result, setResult] = useState<PredictResponse | null>(null);
  const [busy, setBusy] = useState(false);
  const [mode, setMode] = useState<Mode>('band');
  const [showRecorded, setShowRecorded] = useState(true);
  const [showExisting, setShowExisting] = useState(true);
  const [selected, setSelected] = useState<string | null>(null);
  const [name, setName] = useState('Virtual AP scenario');
  const [plan, setPlan] = useState<{ id: string; version: number } | null>(null);
  const [saved, setSaved] = useState<SavedScenarioPlan[]>([]);
  const [versions, setVersions] = useState<PlanVersionRow[]>([]);
  const [status, setStatus] = useState('');
  const [other, setOther] = useState('');
  const [compare, setCompare] = useState<{ a: ScenarioResult; b: ScenarioResult; aName: string; aSpec: ScenarioSpec; cmp: Comparison } | null>(null);
  const seq = useRef(0);

  const spec: ScenarioSpec = useMemo(() => ({ candidates: cands, parameters: params, disabled_existing_ap_ids: disabledExisting, baseline_session_id: sessionId || null }), [cands, params, disabledExisting, sessionId]);

  const refreshSaved = useCallback(() => apiRequest<SavedScenarioPlan[]>(`/api/v1/optimization/plans?floor_id=${floorId}`)
    .then(list => setSaved(list.filter(p => p.scenario))).catch(() => setSaved([])), [floorId]);

  useEffect(() => {                                                       // new floor: reset everything, then load context
    let live = true;
    setCtx(null); setError(''); setResult(null); setCands([]); setParams({}); setDisabledExisting([]); setPlan(null); setVersions([]); setCompare(null); setSessionId(''); setStatus('');
    apiRequest<ScenarioContext>(`/api/v1/optimization/scenario/context?floor_id=${floorId}`).then(c => { if (live) { setCtx(c); setSessionId(c.session?.id ?? ''); } }).catch(e => { if (live) setError(e.message); });
    refreshSaved();
    return () => { live = false; };
  }, [floorId, refreshSaved]);

  useEffect(() => {                                                       // debounced, stale-safe prediction
    if (!ctx) return;
    const mine = ++seq.current;
    const t = setTimeout(() => {
      setBusy(true);
      apiRequest<PredictResponse>('/api/v1/optimization/scenario/predict', { method: 'POST', body: JSON.stringify({ floor_id: floorId, scenario: spec }) })
        .then(r => { if (mine === seq.current) { setResult(r); setError(''); } })
        .catch(e => { if (mine === seq.current) setError(e.message); })
        .finally(() => { if (mine === seq.current) setBusy(false); });
    }, 300);
    return () => clearTimeout(t);
  }, [ctx, floorId, spec]);

  const nextId = () => { let n = 1; while (cands.some(c => c.id === `cand-${n}`)) n++; return n; };
  const place = (x: number, y: number) => {
    if (!ctx || cands.length >= ctx.model.max_candidates) { setStatus(`At most ${ctx?.model.max_candidates ?? 12} virtual APs.`); return; }
    const n = nextId(); setCands(c => [...c, { id: `cand-${n}`, name: `Virtual AP ${n}`, x_m: x, y_m: y, enabled: true }]); setSelected(`cand-${n}`);
  };
  const patch = (id: string, p: Partial<Candidate>) => setCands(list => list.map(c => (c.id === id ? { ...c, ...p } : c)));
  const move = (id: string, x: number, y: number) => patch(id, { x_m: x, y_m: y });
  const bounds = ctx?.floor.bounds;
  const clampX = (v: number) => (bounds ? Math.min(bounds.max[0], Math.max(bounds.min[0], v)) : v);
  const clampY = (v: number) => (bounds ? Math.min(bounds.max[1], Math.max(bounds.min[1], v)) : v);
  const setParam = (k: string, v: number) => setParams(p => { const n = { ...p }; if (Number.isFinite(v) && v !== ctx!.model.parameters[k].default) n[k] = v; else delete n[k]; return n; });
  const body = (extra: object) => JSON.stringify({ name, scenario: spec, ...extra });

  const save = async () => {
    setStatus('');
    try {
      const row = plan
        ? await apiRequest<SavedScenarioPlan>(`/api/v1/optimization/plans/${plan.id}`, { method: 'PATCH', body: body({ expected_version: plan.version }) })
        : await apiRequest<SavedScenarioPlan>('/api/v1/optimization/plans', { method: 'POST', body: body({ floor_id: floorId }) });
      setPlan({ id: row.id, version: row.version }); setStatus(`Saved "${row.name}" as version ${row.version}. Nothing was changed on any real network equipment.`);
      refreshSaved(); apiRequest<PlanVersionRow[]>(`/api/v1/optimization/plans/${row.id}/versions`).then(setVersions).catch(() => setVersions([]));
    } catch (e: any) { setStatus(`Save failed: ${e.message}`); }
  };
  const openSaved = (s: SavedScenarioPlan) => {
    const sc = s.scenario!;
    setCands(sc.candidates); setParams(sc.parameters || {}); setDisabledExisting(sc.disabled_existing_ap_ids || []); if (sc.baseline_session_id) setSessionId(sc.baseline_session_id);
    setPlan({ id: s.id, version: s.version }); setName(s.name); setSelected(null); setCompare(null); setStatus(`Opened "${s.name}" version ${s.version}.`);
    apiRequest<PlanVersionRow[]>(`/api/v1/optimization/plans/${s.id}/versions`).then(setVersions).catch(() => setVersions([]));
  };
  const openVersion = async (v: number) => {
    if (!plan) return;
    const snap = await apiRequest<{ name: string; scenario: ScenarioSpec | null }>(`/api/v1/optimization/plans/${plan.id}/versions/${v}`);
    if (snap.scenario) { setCands(snap.scenario.candidates); setParams(snap.scenario.parameters || {}); setDisabledExisting(snap.scenario.disabled_existing_ap_ids || []); setName(snap.name); setStatus(`Loaded version ${v} into the editor; saving creates a new version.`); }
  };
  const runCompare = async () => {
    const s = saved.find(p => p.id === other); if (!s) return;
    try {
      const r = await apiRequest<{ a: { result: ScenarioResult }; b: { result: ScenarioResult }; comparison: Comparison }>('/api/v1/optimization/scenario/compare',
        { method: 'POST', body: JSON.stringify({ floor_id: floorId, a: { plan_id: s.id, version: s.version }, b: { scenario: spec } }) });
      setCompare({ a: r.a.result, b: r.b.result, aName: `${s.name} v${s.version}`, aSpec: s.scenario!, cmp: r.comparison });
    } catch (e: any) { setStatus(`Compare failed: ${e.message}`); }
  };
  const exportSaved = async (format: 'json' | 'markdown') => {
    if (!plan) return;
    const res = await fetch(`/api/v1/optimization/plans/${plan.id}/export?version=${plan.version}&format=${format}`, { credentials: 'include' });
    if (!res.ok) { setStatus(`Export failed (${res.status}).`); return; }
    download(`airgrid-scenario-v${plan.version}.${format === 'json' ? 'json' : 'md'}`, await res.text(), format === 'json' ? 'application/json' : 'text/markdown');
  };

  if (error && !ctx) return <section className="bg-white p-6 border rounded-2xl" role="alert"><h2 className="font-semibold text-xl">Virtual AP scenario studio</h2><p className="text-sm mt-2 text-red-800">{error}</p></section>;
  if (!ctx) return <section className="bg-white p-6 border rounded-2xl" role="status">Loading floor model…</section>;
  const side = compare ? { a: compare.a, b: compare.b, aName: compare.aName, bName: 'Current editor', cmp: compare.cmp }
    : result ? { a: result.baseline, b: result.scenario, aName: 'Current layout (model)', bName: 'Scenario (model)', cmp: result.comparison } : null;
  const sideDeltas = Object.fromEntries((side?.cmp.zones ?? []).map(z => [z.id, z]));

  return <section className="bg-white p-6 border rounded-2xl space-y-5" aria-labelledby="scenario-h">
    <div><h2 id="scenario-h" className="font-semibold text-xl">Virtual AP scenario studio</h2>
      <p role="note" className="mt-2 text-sm p-3 rounded-lg bg-[#FFF4E8] border border-[#E7C9A8]"><strong>Model prediction for hypothetical access points — not a measurement and not physically validated.</strong> Nothing here configures real equipment or alters recorded data. Recorded data: <strong>{ctx.session ? (ctx.session.all_synthetic_demo ? 'SYNTHETIC demonstration points' : 'recorded survey points') : 'none'}</strong>.</p></div>

    <div className="grid sm:grid-cols-3 gap-3 text-sm">
      <label className="font-medium">Recorded evidence session<select aria-label="Evidence session" className="block w-full rounded-lg border p-2 mt-1 bg-white" value={sessionId} onChange={e => setSessionId(e.target.value)}>
        {!ctx.sessions.length && <option value="">No survey session</option>}{ctx.sessions.map(s => <option key={s.id} value={s.id}>{s.name} ({s.points} pts)</option>)}</select></label>
      <label className="font-medium">Colour by<select aria-label="Layer" className="block w-full rounded-lg border p-2 mt-1 bg-white" value={mode} onChange={e => setMode(e.target.value as Mode)}>
        <option value="band">Predicted signal band</option><option value="delta">Predicted change (scenario − current)</option><option value="confidence">Model confidence</option></select></label>
      <div className="flex gap-4 items-end pb-2"><label><input type="checkbox" checked={showRecorded} onChange={e => setShowRecorded(e.target.checked)} /> Recorded points</label><label><input type="checkbox" checked={showExisting} onChange={e => setShowExisting(e.target.checked)} /> Registered APs</label></div>
    </div>
    <Legend mode={mode} />
    {error && <p role="alert" className="text-sm text-red-800 p-3 bg-red-50 rounded-lg">{error}</p>}

    <div className="grid lg:grid-cols-2 gap-4">
      <ScenarioPlan ctx={ctx} zones={side ? side.a.zones : null} mode={mode} deltas={sideDeltas} cands={compare ? compare.aSpec.candidates : []} showRecorded={showRecorded} showExisting={showExisting}
        disabledExisting={compare ? compare.aSpec.disabled_existing_ap_ids : []} selected={null} editable={false} title={`${side ? side.aName : 'Current layout (model)'} — model prediction`} testId="plan-current" />
      <ScenarioPlan ctx={ctx} zones={side ? side.b.zones : null} mode={mode} deltas={sideDeltas} cands={cands} showRecorded={showRecorded} showExisting={showExisting} disabledExisting={disabledExisting}
        selected={selected} editable title={`${side ? side.bName : 'Scenario (model)'} — click to place, drag to move`} testId="plan-scenario" onPlace={place} onMove={move} onSelect={setSelected} />
    </div>
    <p className="text-xs text-neutral-600" role="status">{busy ? 'Recomputing model prediction…' : result ? `Model ${result.scenario.model.id} v${result.scenario.model.version} · input hash ${result.scenario.inputs_hash}` : ''} {ctx.unplaced_access_points > 0 && `· ${ctx.unplaced_access_points} registered AP(s) without a floor position are ignored.`}</p>

    <div className="grid lg:grid-cols-2 gap-6">
      <div><h3 className="font-semibold">Virtual AP candidates ({cands.length}/{ctx.model.max_candidates})</h3>
        {!cands.length && <p className="text-sm text-neutral-600 mt-2">None yet. Click the scenario plan to place a hypothetical AP.</p>}
        <ul className="space-y-2 mt-2">{cands.map(c => <li key={c.id} className={`border rounded-lg p-2 text-sm ${selected === c.id ? 'border-[#BE6B37]' : ''}`}>
          <div className="flex flex-wrap gap-2 items-center"><input aria-label={`${c.id} name`} className="border rounded p-1 w-32" value={c.name} onChange={e => patch(c.id, { name: e.target.value })} />
            <label>x <input aria-label={`${c.id} x (m)`} type="number" step="0.1" className="border rounded p-1 w-20" value={c.x_m} onChange={e => patch(c.id, { x_m: clampX(r1(Number(e.target.value))) })} /></label>
            <label>y <input aria-label={`${c.id} y (m)`} type="number" step="0.1" className="border rounded p-1 w-20" value={c.y_m} onChange={e => patch(c.id, { y_m: clampY(r1(Number(e.target.value))) })} /></label>
            <label>Tx dBm <input aria-label={`${c.id} Tx power (dBm)`} type="number" min={0} max={30} placeholder="assumed" className="border rounded p-1 w-20" value={c.tx_power_dbm ?? ''} onChange={e => patch(c.id, { tx_power_dbm: e.target.value === '' ? null : Number(e.target.value) })} /></label>
            <button className="border rounded px-2 py-1" onClick={() => patch(c.id, { enabled: !c.enabled })}>{c.enabled ? 'Remove' : 'Restore'}</button>
            <button className="border rounded px-2 py-1" aria-label={`Discard ${c.name}`} onClick={() => { setCands(l => l.filter(x => x.id !== c.id)); if (selected === c.id) setSelected(null); }}>Discard</button></div>
          {!c.enabled && <p className="text-xs text-neutral-500 mt-1">Removed from the prediction; restore to include it again.</p>}</li>)}</ul>
        {!!ctx.existing_access_points.length && <><h3 className="font-semibold mt-4">Registered APs (virtual removal only)</h3><ul className="mt-2 text-sm space-y-1">{ctx.existing_access_points.map(a => <li key={a.id}><label>
          <input type="checkbox" checked={disabledExisting.includes(a.id)} onChange={e => setDisabledExisting(l => (e.target.checked ? [...l, a.id] : l.filter(x => x !== a.id)))} /> Virtually remove {a.name} ({a.x_m}, {a.y_m}) · Tx {a.tx_power_dbm ?? 'assumed default'}</label></li>)}</ul></>}
      </div>
      <div><h3 className="font-semibold">Model parameters</h3><p className="text-xs text-neutral-600">Assumed defaults, not measured for this site. Changing one is recorded in the scenario and the report.</p>
        <table className="text-sm w-full mt-2"><tbody>{Object.entries(ctx.model.parameters).map(([k, p]) => <tr key={k} className="border-t"><td className="p-1"><label htmlFor={`p-${k}`} title={p.description}>{k.replace(/_/g, ' ')}</label></td>
          <td className="p-1"><input id={`p-${k}`} type="number" step="0.1" min={p.min} max={p.max} className="border rounded p-1 w-24" value={params[k] ?? p.default} onChange={e => setParam(k, Number(e.target.value))} /> {p.unit}</td>
          <td className="p-1 text-xs text-neutral-500">{k in params ? 'set in scenario' : 'assumed default'}</td></tr>)}</tbody></table>
        <button className="border rounded px-3 py-1 mt-2 text-sm" onClick={() => setParams({})}>Reset to assumed defaults</button></div>
    </div>

    {side && <div className="overflow-x-auto"><h3 className="font-semibold mb-1">{side.aName} vs {side.bName} (model vs model)</h3><SummaryTable cmp={side.cmp} aLabel={side.aName} bLabel={side.bName} />
      <p className="text-xs mt-2">{side.cmp.zones_improved} zone(s) improve a band, {side.cmp.zones_worsened} worsen; {side.cmp.changes_within_model_uncertainty} of {side.cmp.zones.length} changes are smaller than the modelled uncertainty. {side.cmp.caveat}</p>
      <details className="mt-3"><summary className="cursor-pointer text-sm font-medium">Per-zone detail (prediction, uncertainty and recorded evidence)</summary>
        <table className="text-xs w-full mt-2"><thead><tr className="text-left text-neutral-500"><th className="p-1">Zone</th><th className="p-1">Predicted dBm</th><th className="p-1">± σ</th><th className="p-1">Band</th><th className="p-1">Serving AP / walls</th><th className="p-1">Recorded evidence</th></tr></thead><tbody>
          {side.b.zones.map(z => <tr key={z.id} className="border-t"><td className="p-1">{z.id} {z.name}</td><td className="p-1">{fmt(z.mean_dbm)}</td><td className="p-1">{fmt(z.sigma_db)}</td><td className="p-1">{z.band}{z.uncertain ? ' (uncertain)' : ''}</td><td className="p-1">{z.serving_ap ?? '—'} / {z.walls_to_serving_ap ?? '—'}</td><td className="p-1">{z.evidence.support.replace(/_/g, ' ')}{z.evidence.nearest_recorded_m !== null ? ` · ${z.evidence.recorded_points} pts, nearest ${z.evidence.nearest_recorded_m} m` : ''}</td></tr>)}</tbody></table></details></div>}
    {result?.scenario.model_check && <p className="text-xs text-neutral-600">Model residual against recorded points (existing APs only; the model is not fitted to them): bias {result.scenario.model_check.bias_db} dB, MAE {result.scenario.model_check.mae_db} dB, RMSE {result.scenario.model_check.rmse_db} dB over {result.scenario.model_check.points} points.</p>}

    <div className="border-t pt-4 space-y-3"><h3 className="font-semibold">Save, reopen, compare, export</h3>
      <div className="flex flex-wrap gap-2 items-end"><label className="text-sm">Scenario name<input aria-label="Scenario name" className="block border rounded p-2 mt-1" value={name} maxLength={120} onChange={e => setName(e.target.value)} /></label>
        {canSave ? <button className="bg-[#BE6B37] text-white rounded-lg px-4 py-2" onClick={save}>{plan ? `Save as version ${plan.version + 1}` : 'Save scenario'}</button> : <p className="text-xs text-neutral-600">Saving needs a network engineer or administrator.</p>}
        {plan && <><button className="border rounded-lg px-3 py-2" onClick={() => exportSaved('markdown')}>Export report (Markdown)</button><button className="border rounded-lg px-3 py-2" onClick={() => exportSaved('json')}>Export scenario data (JSON)</button></>}
        <button className="border rounded-lg px-3 py-2" onClick={() => download('airgrid-scenario-unsaved.json', JSON.stringify({ scenario: spec, prediction: result, statement: 'Model prediction for hypothetical access points. Not a measurement and not physically validated.' }, null, 2), 'application/json')}>Export current (unsaved) JSON</button>
        {plan && <button className="border rounded-lg px-3 py-2" onClick={() => { setPlan(null); setVersions([]); setStatus('Next save creates a new scenario.'); }}>Save as new scenario</button>}</div>
      {status && <p role="status" className="text-sm">{status}</p>}
      {!!versions.length && <div><h4 className="text-sm font-medium">Version history of this scenario</h4><ul className="text-sm mt-1">{versions.map(v => <li key={v.version}>v{v.version} · {v.candidates} virtual AP(s) · {v.created_at ? new Date(v.created_at).toLocaleString() : ''} <button className="underline ml-2" onClick={() => openVersion(v.version)}>Open v{v.version}</button></li>)}</ul></div>}
      <div><h4 className="text-sm font-medium">Saved scenarios on this floor</h4>{!saved.length && <p className="text-sm text-neutral-600">None saved yet.</p>}
        <ul className="text-sm mt-1 space-y-1">{saved.map(s => <li key={s.id}>{s.name} · v{s.version} · {s.scenario?.candidates.length ?? 0} virtual AP(s) <button className="underline ml-2" onClick={() => openSaved(s)}>Open {s.name}</button></li>)}</ul>
        {!!saved.length && <div className="flex flex-wrap gap-2 items-center mt-2"><label className="text-sm">Compare the editor with <select aria-label="Compare with saved scenario" className="border rounded p-1" value={other} onChange={e => setOther(e.target.value)}><option value="">choose…</option>{saved.map(s => <option key={s.id} value={s.id}>{s.name} v{s.version}</option>)}</select></label>
          <button className="border rounded px-3 py-1" disabled={!other} onClick={runCompare}>Compare side by side</button>{compare && <button className="underline text-sm" onClick={() => setCompare(null)}>Back to current layout comparison</button>}</div>}</div>
    </div>

    <details><summary className="cursor-pointer text-sm font-medium">Model assumptions and limits ({ctx.model.id} v{ctx.model.version}, not validated)</summary><ul className="list-disc pl-5 text-sm mt-2 space-y-1">{ctx.model.assumptions.map(a => <li key={a}>{a}</li>)}</ul>
      <p className="text-xs mt-2">Coordinates: {ctx.coordinate_system}</p></details>
  </section>;
};
