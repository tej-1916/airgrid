import React, { useCallback, useEffect, useState } from 'react';
import { apiRequest } from '../../services/api';
import { surveyService } from '../../services/surveyService';
import { SurveySession } from '../../types/survey';

const card = 'bg-white rounded-2xl border border-[#D9DBDE] p-6';
const input = 'border border-[#D9DBDE] rounded-lg px-3 py-2 text-sm bg-white';
const primary = 'bg-[#BE6B37] hover:bg-[#A3592A] text-white rounded-lg px-4 py-2 text-sm font-semibold disabled:opacity-40';
const secondary = 'border border-[#D9DBDE] rounded-lg px-4 py-2 text-sm disabled:opacity-40';

export interface Marker { x: number; y: number; label: string; note?: string | null }
export interface SavedPlan {
  id: string; floor_id: string; network_label: string | null; name: string; notes: string | null; status: string;
  markers: Marker[]; evidence_refs: string[]; version: number; author: string | null; author_id: string | null;
  created_at: string; updated_at: string;
}
export interface RegisteredAP {
  id: string; name: string; mac_address: string; model: string | null; vendor: string | null; x_coord: number | null;
  y_coord: number | null; channel_24ghz: number | null; channel_5ghz: number | null; tx_power_dbm: number | null;
  status: string; notes: string | null;
}

type Draft = Pick<SavedPlan, 'name' | 'notes' | 'status' | 'markers' | 'evidence_refs' | 'network_label'>;
const STATUSES = ['draft', 'proposed', 'accepted_for_trial', 'archived'];
const empty = (network: string): Draft => ({ name: '', notes: '', status: 'draft', markers: [], evidence_refs: [], network_label: network || null });

// --- Persisted plan editor -----------------------------------------------------------

export const PlanEditor: React.FC<{
  floorId: string; network: string; canEdit: boolean; userId?: string; isAdmin: boolean; weakIds: string[];
  floorPlanUrl?: string; aps: RegisteredAP[]; onPlansChanged: (plans: SavedPlan[]) => void;
}> = ({ floorId, network, canEdit, userId, isAdmin, weakIds, floorPlanUrl, aps, onPlansChanged }) => {
  const [plans, setPlans] = useState<SavedPlan[]>([]);
  const [selectedId, setSelectedId] = useState<string>('new');
  const [draft, setDraft] = useState<Draft>(empty(network));
  const [marker, setMarker] = useState({ x: '50', y: '50', label: '' });
  const [message, setMessage] = useState<{ kind: 'ok' | 'error'; text: string } | null>(null);
  const [pendingDelete, setPendingDelete] = useState(false);

  const load = useCallback(async () => {
    const list = await apiRequest<SavedPlan[]>(`/api/v1/optimization/plans?floor_id=${floorId}`);
    setPlans(list);
    onPlansChanged(list);
    return list;
  }, [floorId, onPlansChanged]);

  useEffect(() => {
    setSelectedId('new'); setDraft(empty(network));
    load().catch((e) => setMessage({ kind: 'error', text: e.message }));
  }, [floorId, network, load]);

  const selected = plans.find((p) => p.id === selectedId);
  const select = (id: string, list = plans) => {
    setSelectedId(id); setPendingDelete(false);
    const p = list.find((x) => x.id === id);
    setDraft(p ? { name: p.name, notes: p.notes ?? '', status: p.status, markers: p.markers, evidence_refs: p.evidence_refs, network_label: p.network_label } : empty(network));
  };

  const save = async () => {
    try {
      const body = { ...draft, notes: draft.notes || null, network_label: draft.network_label || undefined };
      const saved = selected
        ? await apiRequest<SavedPlan>(`/api/v1/optimization/plans/${selected.id}`, { method: 'PATCH', body: JSON.stringify({ ...body, expected_version: selected.version }) })
        : await apiRequest<SavedPlan>('/api/v1/optimization/plans', { method: 'POST', body: JSON.stringify({ ...body, floor_id: floorId }) });
      select(saved.id, await load());
      setMessage({ kind: 'ok', text: `Saved version ${saved.version} at ${new Date(saved.updated_at).toLocaleString()}.` });
    } catch (e: any) { setMessage({ kind: 'error', text: e.message }); }
  };

  const remove = async () => {
    if (!selected) return;
    try {
      await apiRequest(`/api/v1/optimization/plans/${selected.id}`, { method: 'DELETE' });
      select('new', await load()); setMessage({ kind: 'ok', text: 'Plan deleted.' });
    } catch (e: any) { setMessage({ kind: 'error', text: e.message }); }
  };

  const addMarker = (e: React.FormEvent) => {
    e.preventDefault();
    const x = Number(marker.x) / 100, y = Number(marker.y) / 100;
    if (!(x >= 0 && x <= 1 && y >= 0 && y <= 1) || draft.markers.length >= 50) return;
    setDraft({ ...draft, markers: [...draft.markers, { x, y, label: marker.label.trim() || `Candidate ${draft.markers.length + 1}` }] });
    setMarker({ ...marker, label: '' });
  };

  const canDelete = selected && (isAdmin || selected.author_id === userId);
  const allWeakAttached = weakIds.length > 0 && weakIds.every((id) => draft.evidence_refs.includes(id));

  return (
    <section className={`${card} space-y-4`} aria-labelledby="plans-heading">
      <div>
        <h2 id="plans-heading" className="text-xl font-semibold">Candidate plans — speculative, saved</h2>
        <p className="text-sm text-neutral-600">Markers are planning notes, not verified hardware or predicted coverage. Saving never changes network equipment.</p>
      </div>
      <div className="flex flex-wrap items-end gap-3 print:hidden">
        <label className="text-sm">Plan<select className={`${input} block mt-1`} value={selectedId} onChange={(e) => { setMessage(null); select(e.target.value); }}>
          <option value="new">New plan…</option>
          {plans.map((p) => <option key={p.id} value={p.id}>{p.name} · {p.status.replace(/_/g, ' ')} · v{p.version}</option>)}
        </select></label>
        {selected && <p className="text-xs text-neutral-600">By {selected.author ?? 'unknown'} · updated {new Date(selected.updated_at).toLocaleString()}{selected.network_label ? ` · ${selected.network_label}` : ''}</p>}
      </div>
      {message && <p role={message.kind === 'error' ? 'alert' : 'status'} className={`text-sm p-3 rounded-lg ${message.kind === 'error' ? 'bg-red-50 text-red-800' : 'bg-emerald-50 text-emerald-800'}`}>{message.text}</p>}
      <div className="grid gap-3 sm:grid-cols-2">
        <label className="text-sm">Name<input className={`${input} block w-full mt-1`} maxLength={120} value={draft.name} disabled={!canEdit} onChange={(e) => setDraft({ ...draft, name: e.target.value })} /></label>
        <label className="text-sm">Status<select className={`${input} block w-full mt-1`} value={draft.status} disabled={!canEdit} onChange={(e) => setDraft({ ...draft, status: e.target.value })}>
          {STATUSES.map((s) => <option key={s} value={s}>{s.replace(/_/g, ' ')}</option>)}</select></label>
      </div>
      <label className="block text-sm">Operator notes<textarea className={`${input} block w-full mt-1`} rows={3} maxLength={4000} value={draft.notes ?? ''} disabled={!canEdit}
        onChange={(e) => setDraft({ ...draft, notes: e.target.value })} placeholder="Assumptions, required evidence and validation steps" /></label>
      <label className="flex items-center gap-2 text-sm"><input type="checkbox" disabled={!canEdit || weakIds.length === 0} checked={allWeakAttached}
        onChange={(e) => setDraft({ ...draft, evidence_refs: e.target.checked ? Array.from(new Set([...draft.evidence_refs, ...weakIds])) : draft.evidence_refs.filter((id) => !weakIds.includes(id)) })} />
        Attach the {weakIds.length} displayed weak observations as supporting evidence ({draft.evidence_refs.length} attached)</label>
      {canEdit && (
        <form className="flex flex-wrap gap-3 items-end print:hidden" onSubmit={addMarker}>
          <label className="text-sm">X (% from left)<input className={`${input} block w-24 mt-1`} type="number" min="0" max="100" step="0.1" value={marker.x} onChange={(e) => setMarker({ ...marker, x: e.target.value })} required /></label>
          <label className="text-sm">Y (% from top)<input className={`${input} block w-24 mt-1`} type="number" min="0" max="100" step="0.1" value={marker.y} onChange={(e) => setMarker({ ...marker, y: e.target.value })} required /></label>
          <label className="text-sm">Label<input className={`${input} block w-40 mt-1`} maxLength={60} value={marker.label} onChange={(e) => setMarker({ ...marker, label: e.target.value })} /></label>
          <button className={secondary} disabled={draft.markers.length >= 50}>Add candidate marker</button>
        </form>
      )}
      {floorPlanUrl ? (
        <div className="relative border rounded-xl overflow-hidden">
          <img src={floorPlanUrl} alt="Floor plan with speculative candidate markers and registered access points" className="w-full" />
          {aps.filter((a) => a.x_coord != null && a.y_coord != null).map((a) => (
            <span key={a.id} title={`Registered AP ${a.name}`} className="absolute bg-[#0B0B0D] text-white rounded px-1.5 text-[10px] -translate-x-1/2 -translate-y-1/2" style={{ left: `${a.x_coord! * 100}%`, top: `${a.y_coord! * 100}%` }}>■ {a.name}</span>
          ))}
          {draft.markers.map((m, i) => <span key={i} className="absolute bg-[#BE6B37] text-white rounded-full px-2 text-xs -translate-x-1/2 -translate-y-1/2 border-2 border-dashed border-white" style={{ left: `${m.x * 100}%`, top: `${m.y * 100}%` }}>◌ {m.label}</span>)}
        </div>
      ) : <p className="text-sm text-neutral-600">No floor plan image. Coordinates are still saved; placement cannot be verified visually.</p>}
      <p className="text-xs text-neutral-600">Legend: ■ dark = registered AP (operator-entered) · ◌ dashed copper = speculative candidate.</p>
      <ol className="list-decimal pl-5 text-sm space-y-1">{draft.markers.map((m, i) => <li key={i}>{m.label}: {(m.x * 100).toFixed(1)}%, {(m.y * 100).toFixed(1)}%
        {canEdit && <button className="underline ml-3 print:hidden" onClick={() => setDraft({ ...draft, markers: draft.markers.filter((_, j) => j !== i) })}>Remove</button>}</li>)}</ol>
      {canEdit ? (
        <div className="flex flex-wrap gap-2 print:hidden">
          <button className={primary} disabled={!draft.name.trim()} onClick={save}>{selected ? 'Save new version' : 'Save plan'}</button>
          {canDelete && (pendingDelete
            ? <><button className="bg-rose-600 text-white rounded-lg px-4 py-2 text-sm" onClick={remove}>Confirm delete</button><button className={secondary} onClick={() => setPendingDelete(false)}>Cancel</button></>
            : <button className={secondary} onClick={() => setPendingDelete(true)}>Delete plan</button>)}
        </div>
      ) : <p className="text-sm text-neutral-600">Viewers can review saved plans; editing requires a network engineer or administrator.</p>}
    </section>
  );
};

// --- AP inventory -------------------------------------------------------------------

export const APInventory: React.FC<{ floorId: string; canEdit: boolean; onChanged: (aps: RegisteredAP[]) => void }> = ({ floorId, canEdit, onChanged }) => {
  const blank = { name: '', mac_address: '', x: '', y: '', tx_power_dbm: '', status: 'active' };
  const [aps, setAps] = useState<RegisteredAP[]>([]);
  const [form, setForm] = useState(blank);
  const [error, setError] = useState('');

  const load = useCallback(() => apiRequest<RegisteredAP[]>(`/api/v1/optimization/access-points?floor_id=${floorId}`)
    .then((list) => { setAps(list); onChanged(list); }).catch((e) => setError(e.message)), [floorId, onChanged]);
  useEffect(() => { load(); }, [load]);

  const add = async (e: React.FormEvent) => {
    e.preventDefault(); setError('');
    try {
      await apiRequest('/api/v1/optimization/access-points', { method: 'POST', body: JSON.stringify({
        floor_id: floorId, name: form.name.trim(), mac_address: form.mac_address.trim(), status: form.status,
        x_coord: form.x === '' ? undefined : Number(form.x) / 100, y_coord: form.y === '' ? undefined : Number(form.y) / 100,
        tx_power_dbm: form.tx_power_dbm === '' ? undefined : Number(form.tx_power_dbm) }) });
      setForm(blank);
      load();
    } catch (err: any) { setError(err.message); }
  };

  const remove = async (id: string) => {
    try { await apiRequest(`/api/v1/optimization/access-points/${id}`, { method: 'DELETE' }); load(); } catch (err: any) { setError(err.message); }
  };

  return (
    <section className={`${card} space-y-3`} aria-labelledby="ap-heading">
      <h2 id="ap-heading" className="text-xl font-semibold">Known access points</h2>
      <p className="text-sm text-neutral-600">Entered manually from installation records. AirGrid does not discover APs; unknown transmit power stays unknown.</p>
      {error && <p role="alert" className="text-sm text-red-700">{error}</p>}
      {aps.length === 0 ? <p className="text-sm">No access points registered on this floor.</p> : (
        <div className="overflow-x-auto"><table className="w-full text-sm"><thead><tr className="text-left text-neutral-500"><th className="p-2">Name</th><th className="p-2">MAC / BSSID</th><th className="p-2">Position</th><th className="p-2">Tx power</th><th className="p-2">Status</th><th /></tr></thead>
          <tbody>{aps.map((a) => <tr key={a.id} className="border-t"><td className="p-2">{a.name}</td><td className="p-2 font-mono text-xs">{a.mac_address}</td>
            <td className="p-2">{a.x_coord != null && a.y_coord != null ? `${(a.x_coord * 100).toFixed(1)}%, ${(a.y_coord * 100).toFixed(1)}%` : 'not placed'}</td>
            <td className="p-2">{a.tx_power_dbm != null ? `${a.tx_power_dbm} dBm` : 'unknown'}</td><td className="p-2">{a.status}</td>
            <td className="p-2 text-right">{canEdit && <button className="underline" onClick={() => remove(a.id)}>Remove</button>}</td></tr>)}</tbody></table></div>
      )}
      {canEdit && (
        <form onSubmit={add} className="grid gap-2 sm:grid-cols-4 lg:grid-cols-7 items-end print:hidden">
          <label className="text-xs sm:col-span-2">Name<input className={`${input} block w-full mt-1`} required maxLength={255} value={form.name} onChange={(e) => setForm({ ...form, name: e.target.value })} /></label>
          <label className="text-xs sm:col-span-2">MAC / BSSID<input className={`${input} block w-full mt-1`} required pattern="([0-9A-Fa-f]{2}:){5}[0-9A-Fa-f]{2}" placeholder="aa:bb:cc:dd:ee:ff" value={form.mac_address} onChange={(e) => setForm({ ...form, mac_address: e.target.value })} /></label>
          <label className="text-xs">X %<input className={`${input} block w-full mt-1`} type="number" min="0" max="100" step="0.1" value={form.x} onChange={(e) => setForm({ ...form, x: e.target.value })} /></label>
          <label className="text-xs">Y %<input className={`${input} block w-full mt-1`} type="number" min="0" max="100" step="0.1" value={form.y} onChange={(e) => setForm({ ...form, y: e.target.value })} /></label>
          <label className="text-xs">Tx dBm (if known)<input className={`${input} block w-full mt-1`} type="number" min="-10" max="36" step="0.5" value={form.tx_power_dbm} onChange={(e) => setForm({ ...form, tx_power_dbm: e.target.value })} /></label>
          <button className={`${primary} sm:col-span-4 lg:col-span-7 justify-self-start`}>Register AP</button>
        </form>
      )}
    </section>
  );
};

// --- Measured before/after ----------------------------------------------------------------

export const SessionComparison: React.FC<{ floorId: string; network: string }> = ({ floorId, network }) => {
  const [sessions, setSessions] = useState<SurveySession[]>([]);
  const [before, setBefore] = useState('');
  const [after, setAfter] = useState('');
  const [result, setResult] = useState<any>(null);
  const [error, setError] = useState('');

  useEffect(() => {
    setResult(null); setBefore(''); setAfter('');
    surveyService.listSurveys({ floorId, limit: 100 }).then((r) => setSessions(r.items)).catch((e) => setError(e.message));
  }, [floorId]);

  const run = async () => {
    setError('');
    try {
      setResult(await apiRequest('/api/v1/optimization/compare-sessions', { method: 'POST',
        body: JSON.stringify({ before_session_id: before, after_session_id: after, network_label: network }) }));
    } catch (e: any) { setError(e.message); setResult(null); }
  };

  const label = (s: SurveySession) => `${s.session_name} — ${new Date(s.started_at).toLocaleDateString()}`;
  return (
    <section className={`${card} space-y-3`} aria-labelledby="compare-heading">
      <h2 id="compare-heading" className="text-xl font-semibold">Measured before / after</h2>
      <p className="text-sm text-neutral-600">Compares two recorded survey sessions on this floor and network. Observed values only; hypothetical plans are never scored.</p>
      <div className="flex flex-wrap gap-3 items-end">
        <label className="text-sm">Before<select className={`${input} block mt-1`} value={before} onChange={(e) => setBefore(e.target.value)}><option value="">Select session</option>{sessions.map((s) => <option key={s.id} value={s.id}>{label(s)}</option>)}</select></label>
        <label className="text-sm">After<select className={`${input} block mt-1`} value={after} onChange={(e) => setAfter(e.target.value)}><option value="">Select session</option>{sessions.map((s) => <option key={s.id} value={s.id}>{label(s)}</option>)}</select></label>
        <button className={primary} disabled={!before || !after || before === after} onClick={run}>Compare sessions</button>
      </div>
      {sessions.length < 2 && <p className="text-sm text-neutral-600">At least two recorded sessions on this floor are needed.</p>}
      {error && <p role="alert" className="text-sm text-red-700">{error}</p>}
      {result && (
        <div className="space-y-3 text-sm">
          <div className="grid gap-3 sm:grid-cols-2">
            {(['before', 'after'] as const).map((k) => (
              <div key={k} className="rounded-xl bg-[#F5F5F3] p-4"><p className="text-xs uppercase text-[#BE6B37]">{k}</p><p className="font-semibold">{result[k].name}</p>
                {result[k].n ? <p>{result[k].n} observations · median {result[k].median_rssi_dbm} dBm · {Math.round(result[k].weak_share * 100)}% below −75 dBm · {result[k].cells} cells · {result[k].provenance.join(', ')}</p>
                  : <p>No qualifying observations for {network}.</p>}</div>
            ))}
          </div>
          <p><strong>{result.paired_cells}</strong> co-located cells: {result.improved_cells} improved ≥3 dB, {result.degraded_cells} degraded ≥3 dB, {result.unchanged_cells} within ±3 dB
            {result.median_cell_delta_db != null && <> · median change {result.median_cell_delta_db > 0 ? '+' : ''}{result.median_cell_delta_db} dB</>}. {result.cells_only_before} cells only before, {result.cells_only_after} only after.</p>
          <ul className="list-disc pl-5 text-amber-800">{result.caveats.map((c: string) => <li key={c}>{c}</li>)}</ul>
        </div>
      )}
    </section>
  );
};
