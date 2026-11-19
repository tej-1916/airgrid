import React, { useCallback, useEffect, useState } from 'react';
import { useLocation } from 'react-router-dom';
import { useCampus } from '../context/CampusContext';
import { useAuth } from '../context/AuthContext';
import { apiRequest } from '../services/api';
import { ScenarioStudio } from '../components/optimization/ScenarioStudio';
import { APInventory, PlanEditor, RegisteredAP, SavedPlan, SessionComparison } from '../components/optimization/OptimizationPanels';

interface SurveyEvidence {
  floor_id: string; network_label: string | null; available_networks: string[];
  generated_at: string; calibrated: boolean; sample_count: number; session_count: number;
  points: { source_id: string; x: number; y: number; rssi_dbm: number; timestamp: string; provenance: string; historical: boolean }[];
  weak_locations: { source_id: string; x: number; y: number; rssi_dbm: number; timestamp: string; provenance: string; historical: boolean }[];
  suggested_measurements: { x: number; y: number }[];
  recommendations: { priority: string; title: string; evidence_ids: string[]; expected_benefit: string; required_evidence: string; validation: string;
    nearest_registered_aps?: { source_id: string; rssi_dbm: number; nearest_ap: string; distance_m: number }[] }[];
  limitations: string[];
}

export const APOptimizationPage: React.FC = () => {
  const { campuses } = useCampus();
  const { user } = useAuth();
  const floors = campuses.flatMap(campus => (campus.buildings || []).flatMap(building => (building.floors || []).map(floor => ({ ...floor, label: `${campus.name} / ${building.name} / ${floor.name}` }))));
  const location = useLocation();
  const [floorId, setFloorId] = useState<string>((location.state as { floorId?: string } | null)?.floorId ?? '');
  const [network, setNetwork] = useState('');
  const [data, setData] = useState<SurveyEvidence | null>(null);
  const [error, setError] = useState('');
  const [loading, setLoading] = useState(false);
  const [plans, setPlans] = useState<SavedPlan[]>([]);
  const [aps, setAps] = useState<RegisteredAP[]>([]);
  const floor = floors.find(item => item.id === floorId);
  const canPlan = user?.role === 'administrator' || user?.role === 'network_engineer';
  const onPlansChanged = useCallback((list: SavedPlan[]) => setPlans(list), []);
  const onApsChanged = useCallback((list: RegisteredAP[]) => setAps(list), []);

  useEffect(() => {
    let active = true;
    setData(null); setError('');
    if (!floorId) { setLoading(false); return; }
    setLoading(true);
    const query = new URLSearchParams({ floor_id: floorId });
    if (network) query.set('network_label', network);
    apiRequest<SurveyEvidence>(`/api/v1/optimization/survey?${query}`)
      .then(result => { if (active) setData(result); })
      .catch(err => { if (active) setError(err.message); })
      .finally(() => { if (active) setLoading(false); });
    return () => { active = false; };
  }, [floorId, network]);

  const exportAnalysis = () => {
    const blob = new Blob([JSON.stringify({ evidence: data, saved_plans: plans.filter(p => !p.network_label || p.network_label === network), registered_access_points: aps,
      planning_status: 'Speculative; no predicted gain; no configuration changes' }, null, 2)], { type: 'application/json' });
    const url = URL.createObjectURL(blob);
    const link = document.createElement('a'); link.href = url; link.download = 'airgrid-optimization-analysis.json'; link.click(); URL.revokeObjectURL(url);
  };

  return <div className="space-y-6 text-[#0B0B0D]">
    <div><p className="text-xs uppercase tracking-widest text-[#BE6B37]">Measurement-led planning</p><h1 className="text-3xl font-bold mt-2">Network Optimization Studio</h1><p className="text-sm text-neutral-600 mt-2">Review survey evidence, plan the next measurements and compare speculative candidates.</p></div>
    <section className="bg-white p-6 rounded-2xl border border-[#D9DBDE] grid sm:grid-cols-2 gap-4 print:hidden">
      <div className="text-sm font-medium"><label htmlFor="optimization-floor">Floor</label><select id="optimization-floor" className="block w-full rounded-lg border p-3 mt-2 bg-white" value={floorId} onChange={e => { setFloorId(e.target.value); setNetwork(''); }}><option value="">Select a floor</option>{floors.map(item => <option key={item.id} value={item.id}>{item.label}</option>)}</select></div>
      <div className="text-sm font-medium"><label htmlFor="optimization-network">Network</label><select id="optimization-network" className="block w-full rounded-lg border p-3 mt-2 bg-white" value={network} onChange={e => setNetwork(e.target.value)} disabled={!floorId || loading}><option value="">Select a recorded network</option>{data?.available_networks.map(item => <option key={item} value={item}>{item}</option>)}</select></div>
      <p className="text-xs text-neutral-600 sm:col-span-2">Plans are saved per floor with version history; evidence and recommendations are isolated to the selected network.</p>
    </section>
    {floorId && <ScenarioStudio floorId={floorId} canSave={canPlan} />}
    {error && <p role="alert" className="text-red-800 p-4 bg-red-50 rounded-lg">{error}</p>}
    {loading && <p role="status">Loading recorded survey evidence…</p>}
    {!floorId && <p className="p-6 border rounded-2xl bg-white">Choose a floor with recorded observations. No measurements are simulated.</p>}
    {data && !network && <p className="p-6 border rounded-2xl bg-white">Select a network to keep recommendations isolated. Missing networks need another survey.</p>}
    {data && network && <>
      <section className="bg-white p-6 border rounded-2xl"><h2 className="font-semibold text-xl">Evidence quality</h2><p className="text-sm mt-3">{data.sample_count} qualifying observations · {data.session_count} sessions · Calibration {data.calibrated ? 'available' : 'required'} · {data.weak_locations.length} displayed weak locations</p><p className="text-sm mt-2">{data.suggested_measurements.length} of 16 sampling cells need observations. These are not confirmed coverage gaps.</p><p className="text-xs mt-2 text-neutral-500">Generated {new Date(data.generated_at).toLocaleString()}. Historical observations retain their original timestamps.</p></section>
      {data.recommendations.map(item => <section key={item.title} className="bg-white p-6 rounded-2xl border"><p className="text-xs uppercase text-[#BE6B37]">{item.priority}</p><h2 className="text-lg font-semibold mt-2">{item.title}</h2><p className="text-sm mt-3">{item.required_evidence}</p><p className="text-sm mt-2"><strong>Benefit category:</strong> {item.expected_benefit}</p><p className="text-sm mt-2"><strong>Validation:</strong> {item.validation}</p>{item.nearest_registered_aps && <table className="text-xs mt-3 w-full"><thead><tr className="text-left text-neutral-500"><th className="p-1">Weak observation</th><th className="p-1">RSSI</th><th className="p-1">Nearest registered AP</th><th className="p-1">Plan distance</th></tr></thead><tbody>{item.nearest_registered_aps.slice(0, 10).map(n => <tr key={n.source_id} className="border-t"><td className="p-1 break-all">{n.source_id.slice(0, 8)}</td><td className="p-1">{n.rssi_dbm} dBm</td><td className="p-1">{n.nearest_ap}</td><td className="p-1">{n.distance_m} m</td></tr>)}</tbody></table>}<details className="text-xs mt-3"><summary>Supporting measurement IDs</summary><p className="break-all mt-2">{item.evidence_ids.join(', ') || 'No observations; recommendation is to collect evidence.'}</p></details></section>)}
      <PlanEditor floorId={floorId} network={network} canEdit={canPlan} userId={user?.id} isAdmin={user?.role === 'administrator'}
        weakIds={data.weak_locations.map(w => w.source_id)} floorPlanUrl={floor?.floor_plan?.image_url} aps={aps} onPlansChanged={onPlansChanged} />
      <APInventory floorId={floorId} canEdit={canPlan} onChanged={onApsChanged} />
      <SessionComparison floorId={floorId} network={network} />
      <section className="bg-white p-6 border rounded-2xl overflow-x-auto"><h2 className="font-semibold mb-3">Observed weak locations</h2>{!data.weak_locations.length && <p className="text-sm">No qualifying weak observations in this selection. This does not prove full coverage.</p>}<table className="text-sm w-full"><thead><tr className="text-left"><th className="p-2">Location (%)</th><th className="p-2">RSSI</th><th className="p-2">Source</th></tr></thead><tbody>{data.weak_locations.map(item => <tr key={item.source_id} className="border-t"><td className="p-2">{(item.x * 100).toFixed(1)}, {(item.y * 100).toFixed(1)}</td><td className="p-2">{item.rssi_dbm} dBm</td><td className="p-2">{item.provenance} · {new Date(item.timestamp).toLocaleString()}<small className="block break-all">{item.source_id}</small></td></tr>)}</tbody></table></section>
      <section className="bg-[#F5F5F3] p-6 border rounded-2xl"><h2 className="font-semibold">Limitations</h2><ul className="list-disc pl-5 text-sm mt-3 space-y-2">{data.limitations.map(item => <li key={item}>{item}</li>)}</ul></section>
      <div className="flex gap-4 print:hidden"><button className="bg-[#BE6B37] text-white rounded-lg px-4 py-3" onClick={exportAnalysis}>Export evidence, saved plans and APs (JSON)</button><button className="border rounded-lg px-4 py-3" onClick={() => window.print()}>Print analysis</button></div>
    </>}
  </div>;
};
