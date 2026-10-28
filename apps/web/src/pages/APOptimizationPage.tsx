import React, { useEffect, useState } from 'react';
import { useCampus } from '../context/CampusContext';
import { useAuth } from '../context/AuthContext';
import { apiRequest } from '../services/api';

interface SurveyEvidence {
  floor_id: string; network_label: string | null; available_networks: string[];
  generated_at: string; calibrated: boolean; sample_count: number; session_count: number;
  points: { source_id: string; x: number; y: number; rssi_dbm: number; timestamp: string; provenance: string; historical: boolean }[];
  weak_locations: { source_id: string; x: number; y: number; rssi_dbm: number; timestamp: string; provenance: string; historical: boolean }[];
  suggested_measurements: { x: number; y: number }[];
  recommendations: { priority: string; title: string; evidence_ids: string[]; expected_benefit: string; required_evidence: string; validation: string }[];
  limitations: string[];
}
interface Plan { notes: string; markers: { x: number; y: number }[] }

export const APOptimizationPage: React.FC = () => {
  const { campuses } = useCampus();
  const { user } = useAuth();
  const floors = campuses.flatMap(campus => (campus.buildings || []).flatMap(building => (building.floors || []).map(floor => ({ ...floor, label: `${campus.name} / ${building.name} / ${floor.name}` }))));
  const [floorId, setFloorId] = useState('');
  const [network, setNetwork] = useState('');
  const [data, setData] = useState<SurveyEvidence | null>(null);
  const [error, setError] = useState('');
  const [loading, setLoading] = useState(false);
  const [plans, setPlans] = useState<Plan[]>([{ notes: '', markers: [] }, { notes: '', markers: [] }]);
  const [planIndex, setPlanIndex] = useState(0);
  const [x, setX] = useState('50');
  const [y, setY] = useState('50');
  const floor = floors.find(item => item.id === floorId);
  const canPlan = user?.role === 'administrator' || user?.role === 'network_engineer';
  const plan = plans[planIndex];

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

  const resetPlans = () => setPlans([{ notes: '', markers: [] }, { notes: '', markers: [] }]);
  const updatePlan = (next: Plan) => setPlans(current => current.map((item, index) => index === planIndex ? next : item));
  const exportAnalysis = () => {
    const blob = new Blob([JSON.stringify({ evidence: data, candidate_plans: plans, planning_status: 'Speculative; no predicted gain; no configuration changes' }, null, 2)], { type: 'application/json' });
    const url = URL.createObjectURL(blob);
    const link = document.createElement('a'); link.href = url; link.download = 'airgrid-optimization-analysis.json'; link.click(); URL.revokeObjectURL(url);
  };

  return <div className="space-y-6 text-[#0B0B0D]">
    <div><p className="text-xs uppercase tracking-widest text-[#BE6B37]">Measurement-led planning</p><h1 className="text-3xl font-bold mt-2">Network Optimization Studio</h1><p className="text-sm text-neutral-600 mt-2">Review survey evidence, plan the next measurements and compare speculative candidates.</p></div>
    <section className="bg-white p-6 rounded-2xl border border-[#D9DBDE] grid sm:grid-cols-2 gap-4 print:hidden">
      <div className="text-sm font-medium"><label htmlFor="optimization-floor">Floor</label><select id="optimization-floor" className="block w-full rounded-lg border p-3 mt-2 bg-white" value={floorId} onChange={e => { setFloorId(e.target.value); setNetwork(''); resetPlans(); }}><option value="">Select a floor</option>{floors.map(item => <option key={item.id} value={item.id}>{item.label}</option>)}</select></div>
      <div className="text-sm font-medium"><label htmlFor="optimization-network">Network</label><select id="optimization-network" className="block w-full rounded-lg border p-3 mt-2 bg-white" value={network} onChange={e => { setNetwork(e.target.value); resetPlans(); }} disabled={!floorId || loading}><option value="">Select a recorded network</option>{data?.available_networks.map(item => <option key={item} value={item}>{item}</option>)}</select></div>
      <p className="text-xs text-neutral-600 sm:col-span-2">Candidate notes remain in this page only. Export before leaving or changing floor/network.</p>
    </section>
    {error && <p role="alert" className="text-red-800 p-4 bg-red-50 rounded-lg">{error}</p>}
    {loading && <p role="status">Loading recorded survey evidence…</p>}
    {!floorId && <p className="p-6 border rounded-2xl bg-white">Choose a floor with recorded observations. No measurements are simulated.</p>}
    {data && !network && <p className="p-6 border rounded-2xl bg-white">Select a network to keep recommendations isolated. Missing networks need another survey.</p>}
    {data && network && <>
      <section className="bg-white p-6 border rounded-2xl"><h2 className="font-semibold text-xl">Evidence quality</h2><p className="text-sm mt-3">{data.sample_count} qualifying observations · {data.session_count} sessions · Calibration {data.calibrated ? 'available' : 'required'} · {data.weak_locations.length} displayed weak locations</p><p className="text-sm mt-2">{data.suggested_measurements.length} of 16 sampling cells need observations. These are not confirmed coverage gaps.</p><p className="text-xs mt-2 text-neutral-500">Generated {new Date(data.generated_at).toLocaleString()}. Historical observations retain their original timestamps.</p></section>
      {data.recommendations.map(item => <section key={item.title} className="bg-white p-6 rounded-2xl border"><p className="text-xs uppercase text-[#BE6B37]">{item.priority}</p><h2 className="text-lg font-semibold mt-2">{item.title}</h2><p className="text-sm mt-3">{item.required_evidence}</p><p className="text-sm mt-2"><strong>Benefit category:</strong> {item.expected_benefit}</p><p className="text-sm mt-2"><strong>Validation:</strong> {item.validation}</p><details className="text-xs mt-3"><summary>Supporting measurement IDs</summary><p className="break-all mt-2">{item.evidence_ids.join(', ') || 'No observations; recommendation is to collect evidence.'}</p></details></section>)}
      <section className="bg-white rounded-2xl border p-6 space-y-4"><h2 className="text-xl font-semibold">Candidate plans — speculative</h2><p className="text-sm">AP markers are planning notes, not verified hardware or predicted coverage. No gain estimate is available.</p>
        <div className="block text-sm print:hidden"><label htmlFor="optimization-candidate">Candidate</label><select id="optimization-candidate" className="block border rounded-lg p-2 mt-2" value={planIndex} onChange={e => setPlanIndex(Number(e.target.value))}><option value={0}>Plan A</option><option value={1}>Plan B</option></select></div>
        <label className="block text-sm">Operator annotations<textarea className="block border rounded-lg p-3 mt-2 w-full" value={plan.notes} onChange={e => updatePlan({ ...plan, notes: e.target.value })} maxLength={4000} disabled={!canPlan} placeholder="Candidate changes, required evidence and validation steps" /></label>
        <form className="flex flex-wrap gap-3 items-end print:hidden" onSubmit={e => { e.preventDefault(); if (Number.isFinite(Number(x)) && Number.isFinite(Number(y)) && Number(x) >= 0 && Number(x) <= 100 && Number(y) >= 0 && Number(y) <= 100 && plan.markers.length < 30) updatePlan({ ...plan, markers: [...plan.markers, { x: Number(x) / 100, y: Number(y) / 100 }] }); }}>
          <label className="text-sm">X (% from left)<input className="block border rounded-lg p-2 w-28 mt-2" type="number" min="0" max="100" step="0.1" value={x} onChange={e => setX(e.target.value)} required disabled={!canPlan} /></label>
          <label className="text-sm">Y (% from top)<input className="block border rounded-lg p-2 w-28 mt-2" type="number" min="0" max="100" step="0.1" value={y} onChange={e => setY(e.target.value)} required disabled={!canPlan} /></label>
          <button disabled={!canPlan || plan.markers.length >= 30} className="rounded-lg bg-[#BE6B37] text-white px-4 py-2 disabled:opacity-40">Add planned AP marker</button>
        </form>
        {floor?.floor_plan && <div className="relative border rounded-xl overflow-hidden"><img src={floor.floor_plan.image_url} alt="Selected floor plan with speculative candidate AP markers" className="w-full" />{plan.markers.map((marker, i) => <span key={i} className="absolute bg-[#BE6B37] text-white rounded-full px-2 text-xs -translate-x-1/2 -translate-y-1/2" style={{ left: `${marker.x * 100}%`, top: `${marker.y * 100}%` }}>Plan {i + 1}</span>)}</div>}
        {!floor?.floor_plan && <p className="text-sm text-neutral-600">No floor plan image. Coordinate notes can still be exported; placement cannot be verified.</p>}
        <ol className="list-decimal pl-5 text-sm space-y-2">{plan.markers.map((marker, i) => <li key={i}>Planned AP {i + 1}: {(marker.x * 100).toFixed(1)}%, {(marker.y * 100).toFixed(1)}% <button className="underline ml-3 print:hidden" disabled={!canPlan} onClick={() => updatePlan({ ...plan, markers: plan.markers.filter((_, index) => index !== i) })}>Remove marker {i + 1}</button></li>)}</ol>
        <p className="text-sm">Plan A: {plans[0].markers.length} planned markers · Plan B: {plans[1].markers.length} planned markers. Compare assumptions and collect before/after observations; marker counts do not measure coverage.</p>
      </section>
      <section className="bg-white p-6 border rounded-2xl overflow-x-auto"><h2 className="font-semibold mb-3">Observed weak locations</h2>{!data.weak_locations.length && <p className="text-sm">No qualifying weak observations in this selection. This does not prove full coverage.</p>}<table className="text-sm w-full"><thead><tr className="text-left"><th className="p-2">Location (%)</th><th className="p-2">RSSI</th><th className="p-2">Source</th></tr></thead><tbody>{data.weak_locations.map(item => <tr key={item.source_id} className="border-t"><td className="p-2">{(item.x * 100).toFixed(1)}, {(item.y * 100).toFixed(1)}</td><td className="p-2">{item.rssi_dbm} dBm</td><td className="p-2">{item.provenance} · {new Date(item.timestamp).toLocaleString()}<small className="block break-all">{item.source_id}</small></td></tr>)}</tbody></table></section>
      <section className="bg-[#F5F5F3] p-6 border rounded-2xl"><h2 className="font-semibold">Limitations</h2><ul className="list-disc pl-5 text-sm mt-3 space-y-2">{data.limitations.map(item => <li key={item}>{item}</li>)}</ul></section>
      <div className="flex gap-4 print:hidden"><button className="bg-[#BE6B37] text-white rounded-lg px-4 py-3" onClick={exportAnalysis}>Export analysis and plans</button><button className="border rounded-lg px-4 py-3" onClick={() => window.print()}>Print analysis</button></div>
    </>}
  </div>;
};
