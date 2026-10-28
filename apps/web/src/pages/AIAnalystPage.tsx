import React, { useEffect, useState } from 'react';
import { Link, useSearchParams } from 'react-router-dom';
import { apiRequest } from '../services/api';
import { diagnosticsService } from '../services/diagnosticsService';
import { DiagnosticReport } from '../types/diagnostics';
import { useAuth } from '../context/AuthContext';

interface Analysis {
  report_id: string;
  mode: string;
  summary: string;
  gateway_status: string;
  provider_reported_model: string | null;
  confidence: string;
  limitations: string[];
  evidence: { source_id: string; timestamp: string | null; metric: string; value: string | number; unit: string }[];
  findings: { source_id: string; title: string; severity: string; measured_evidence: string; recommendation: string }[];
}

export const AIAnalystPage: React.FC = () => {
  const [params] = useSearchParams();
  const { user } = useAuth();
  const [reports, setReports] = useState<DiagnosticReport[]>([]);
  const [reportId, setReportId] = useState(params.get('report') || '');
  const [configured, setConfigured] = useState(false);
  const [consent, setConsent] = useState(false);
  const [result, setResult] = useState<Analysis | null>(null);
  const [error, setError] = useState('');
  const [loading, setLoading] = useState(false);
  const canAnalyze = user?.role === 'administrator' || user?.role === 'network_engineer';

  useEffect(() => {
    let active = true;
    Promise.all([diagnosticsService.listReports(undefined, undefined, undefined, 0, 100), apiRequest<{ is_configured: boolean }>('/api/v1/ai/status')])
      .then(([history, gateway]) => { if (active) { setReports(history.reports); setConfigured(gateway.is_configured); } })
      .catch(err => { if (active) setError(err.message); });
    return () => { active = false; };
  }, []);

  const analyze = async (useGateway: boolean) => {
    setLoading(true); setError(''); setResult(null);
    try {
      setResult(await apiRequest<Analysis>('/api/v1/analyst/analyze', {
        method: 'POST', body: JSON.stringify({ report_id: reportId, use_gateway: useGateway, allow_external: useGateway && consent }),
      }));
    } catch (err) { setError(err instanceof Error ? err.message : 'Analysis unavailable.'); }
    finally { setLoading(false); }
  };

  return <div className="space-y-6 text-[#0B0B0D]">
    <div className="flex flex-wrap justify-between gap-4"><div><p className="text-xs uppercase tracking-widest text-[#BE6B37]">Evidence workspace</p><h1 className="text-3xl font-bold mt-2">AirGrid Analyst</h1><p className="text-sm text-neutral-600 mt-2">Explain recorded observations and choose the next measurement. Local analysis is the default.</p></div><Link to="/diagnostics" className="text-sm underline">Network Tools</Link></div>
    <section className="bg-white border border-[#D9DBDE] rounded-2xl p-6 space-y-4 print:hidden" aria-label="Analysis controls">
      <p className="text-sm">AI Gateway: <strong>{configured ? 'Configured; availability not checked' : 'Disabled or unconfigured'}</strong></p>
      <label className="block text-sm font-medium">Source measurement session<select className="block w-full border rounded-lg p-3 mt-2 bg-white" value={reportId} onChange={e => { setReportId(e.target.value); setResult(null); setConsent(false); }}><option value="">Select a saved diagnostic report</option>{reports.map(report => <option key={report.id} value={report.id}>{report.title} — {new Date(report.created_at).toLocaleString()} — {report.data_provenance}</option>)}</select></label>
      {!reports.length && <p className="text-sm text-neutral-600">No saved observations. Record an authorized session in Network Tools first.</p>}
      <button disabled={!reportId || loading || !canAnalyze} onClick={() => analyze(false)} className="bg-[#BE6B37] text-white rounded-lg px-5 py-3 disabled:opacity-40">{loading ? 'Analyzing…' : 'Analyze Current Results'}</button>
      <label className="flex items-start gap-3 text-sm"><input type="checkbox" className="mt-1" checked={consent} disabled={!configured} onChange={e => setConsent(e.target.checked)} />I approve sending minimized metric values and evidence IDs for this session to the configured AI Gateway. Network labels, device addresses, floor plans and user notes are excluded.</label>
      <button disabled={!reportId || loading || !consent || !configured || !canAnalyze} onClick={() => analyze(true)} className="border border-[#D9DBDE] rounded-lg px-5 py-3 disabled:opacity-40">Ask AirGrid to prioritize findings</button>
      {!canAnalyze && <p className="text-sm">Analysis requires a network engineer or administrator.</p>}
    </section>
    {error && <p role="alert" className="p-4 bg-red-50 text-red-800 rounded-xl">{error}</p>}
    {result && <article className="space-y-5" aria-label="Evidence report">
      <section className="p-6 bg-white rounded-2xl border border-[#D9DBDE]"><h2 className="text-xl font-semibold">Evidence report</h2><p className="mt-3">{result.summary}</p><p className="text-sm mt-2">Mode: {result.mode} · Gateway: {result.gateway_status}</p>{result.provider_reported_model && <p className="text-sm">Provider-reported model: {result.provider_reported_model}</p>}<p className="text-sm text-neutral-600 mt-3">{result.confidence}</p><button onClick={() => window.print()} className="mt-4 underline text-sm print:hidden">Print / Save evidence report</button></section>
      <section className="bg-white p-6 border rounded-2xl overflow-x-auto"><h2 className="text-lg font-semibold mb-4">Measurements considered</h2>{!result.evidence.length && <p>No measured numeric values are available.</p>}<table className="w-full text-sm"><thead><tr className="text-left"><th className="p-2">Metric</th><th className="p-2">Value</th><th className="p-2">Source timestamp</th></tr></thead><tbody>{result.evidence.map(item => <tr key={item.source_id} id={item.source_id} className="border-t"><td className="p-2">{item.metric}<small className="block text-neutral-500 break-all">{item.source_id}</small></td><td className="p-2">{item.value} {item.unit}</td><td className="p-2">{item.timestamp ? new Date(item.timestamp).toLocaleString() : 'Source timestamp unavailable'}</td></tr>)}</tbody></table></section>
      {result.findings.map(finding => <section key={finding.source_id} className="bg-white p-6 border rounded-2xl"><p className="text-xs uppercase text-[#BE6B37]">{finding.severity}</p><h3 className="font-semibold mt-2">{finding.title}</h3><p className="text-sm mt-2">{finding.measured_evidence}</p><p className="text-sm mt-3"><strong>Next check:</strong> {finding.recommendation}</p><small className="block break-all mt-2 text-neutral-500">{finding.source_id}</small></section>)}
      <section className="bg-[#F5F5F3] rounded-2xl p-6 border"><h2 className="font-semibold">Limitations</h2><ul className="list-disc pl-5 text-sm space-y-2 mt-3">{result.limitations.map(item => <li key={item}>{item}</li>)}</ul></section>
    </article>}
  </div>;
};
