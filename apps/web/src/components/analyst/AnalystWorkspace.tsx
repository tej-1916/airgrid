import React, { useEffect, useState } from 'react';
import { apiRequest } from '../../services/api';
import { diagnosticsService } from '../../services/diagnosticsService';
import { useCampus } from '../../context/CampusContext';
import { NetworkCollector } from '../../types/diagnostics';

const card = 'bg-white border border-[#D9DBDE] rounded-2xl p-6';
const input = 'border border-[#D9DBDE] rounded-lg px-3 py-2 text-sm bg-white';
const primary = 'bg-[#BE6B37] hover:bg-[#A3592A] text-white rounded-lg px-4 py-2.5 text-sm font-semibold disabled:opacity-40';
const secondary = 'border border-[#D9DBDE] rounded-lg px-4 py-2.5 text-sm disabled:opacity-40';

export interface Scope { floor_id?: string; collector_id?: string; network_label?: string; days: number }

interface Citation { source_id: string; kind: string; timestamp: string | null; metric: string; value: number | string; unit: string }

interface AskResult {
  intent: string | null;
  answer: string;
  local_answer: string;
  mode: string;
  gateway_status: string;
  provider_reported_model: string | null;
  outcome: string;
  citations: Citation[];
  missing_evidence: string[];
  limitations: string[];
  details: Record<string, any>;
  history_id: string;
}

interface HistoryRow {
  id: string; kind: string; question: string | null; mode: string; gateway_status: string; model_identity: string | null;
  outcome: string; error: string | null; freshness: { oldest: string | null; newest: string | null }; evidence_count: number;
  operator: string | null; created_at: string; result?: any; evidence_refs?: string[];
}

const EXAMPLES = [
  'Why does this Wi-Fi connection appear weak?',
  'Did our connection improve compared with yesterday?',
  'Is latency changing?',
  'Where do we need additional measurements?',
  'What do these survey results mean?',
  'Does the ML model outperform IDW?',
];

const clean = (scope: Scope) => Object.fromEntries(Object.entries(scope).filter(([, v]) => v !== '' && v !== undefined));

export const ScopePicker: React.FC<{ scope: Scope; onChange: (s: Scope) => void }> = ({ scope, onChange }) => {
  const { campuses } = useCampus();
  const [collectors, setCollectors] = useState<NetworkCollector[]>([]);
  useEffect(() => { diagnosticsService.listCollectors().then(setCollectors).catch(() => setCollectors([])); }, []);
  const floors = campuses.flatMap((c) => (c.buildings || []).flatMap((b) => (b.floors || []).map((f) => ({ id: f.id, label: `${c.name} · ${b.name} · ${f.name}` }))));
  return (
    <fieldset className="grid gap-3 sm:grid-cols-2 lg:grid-cols-4">
      <legend className="sr-only">Evidence scope</legend>
      <label className="text-xs text-neutral-600 flex flex-col gap-1">Floor
        <select className={input} value={scope.floor_id || ''} onChange={(e) => onChange({ ...scope, floor_id: e.target.value || undefined })}>
          <option value="">Any floor</option>{floors.map((f) => <option key={f.id} value={f.id}>{f.label}</option>)}
        </select>
      </label>
      <label className="text-xs text-neutral-600 flex flex-col gap-1">Collector
        <select className={input} value={scope.collector_id || ''} onChange={(e) => onChange({ ...scope, collector_id: e.target.value || undefined })}>
          <option value="">Any source</option>{collectors.map((c) => <option key={c.id} value={c.id}>{c.name}</option>)}
        </select>
      </label>
      <label className="text-xs text-neutral-600 flex flex-col gap-1">Exact network name (case-sensitive)
        <input className={input} maxLength={64} value={scope.network_label || ''} onChange={(e) => onChange({ ...scope, network_label: e.target.value || undefined })} />
      </label>
      <label className="text-xs text-neutral-600 flex flex-col gap-1">Window
        <select className={input} value={scope.days} onChange={(e) => onChange({ ...scope, days: Number(e.target.value) })}>
          {[1, 7, 30, 90].map((d) => <option key={d} value={d}>Last {d} day{d > 1 ? 's' : ''}</option>)}
        </select>
      </label>
    </fieldset>
  );
};

const CitationTable: React.FC<{ citations: Citation[] }> = ({ citations }) => (
  <div className="overflow-x-auto">
    <table className="w-full text-sm"><thead><tr className="text-left text-neutral-500"><th className="p-2">Record</th><th className="p-2">Metric</th><th className="p-2">Value</th><th className="p-2">Recorded</th></tr></thead>
      <tbody>{citations.map((c, i) => (
        <tr key={`${c.source_id}-${c.metric}-${i}`} className="border-t"><td className="p-2"><small className="break-all">{c.source_id}</small></td><td className="p-2">{c.metric}</td>
          <td className="p-2">{c.value} {c.unit}</td><td className="p-2">{c.timestamp ? new Date(c.timestamp).toLocaleString() : 'unavailable'}</td></tr>
      ))}</tbody></table>
  </div>
);

export const AskPanel: React.FC<{ canAsk: boolean; gatewayConfigured: boolean }> = ({ canAsk, gatewayConfigured }) => {
  const [scope, setScope] = useState<Scope>({ days: 7 });
  const [question, setQuestion] = useState('');
  const [useGateway, setUseGateway] = useState(false);
  const [consent, setConsent] = useState(false);
  const [preview, setPreview] = useState<{ would_send: boolean; prompt: string | null; evidence_count: number; excluded: string[] } | null>(null);
  const [result, setResult] = useState<AskResult | null>(null);
  const [error, setError] = useState('');
  const [busy, setBusy] = useState(false);

  const body = () => JSON.stringify({ question, ...clean(scope), use_gateway: useGateway, allow_external: useGateway && consent });

  const run = async (path: string, setter: (v: any) => void) => {
    setBusy(true); setError('');
    try { setter(await apiRequest(path, { method: 'POST', body: body() })); }
    catch (e: any) { setError(e.message || 'Request failed.'); }
    finally { setBusy(false); }
  };

  return (
    <div className="space-y-4">
      <section className={`${card} space-y-4 print:hidden`} aria-label="Ask about recorded evidence">
        <ScopePicker scope={scope} onChange={(s) => { setScope(s); setPreview(null); }} />
        <label className="block text-sm font-medium">Question
          <input className={`${input} w-full mt-1`} maxLength={500} value={question} onChange={(e) => { setQuestion(e.target.value); setPreview(null); }}
            placeholder="Ask about recorded measurements" />
        </label>
        <div className="flex flex-wrap gap-2">
          {EXAMPLES.map((q) => <button key={q} type="button" className="rounded-full border border-[#D9DBDE] px-3 py-1 text-xs hover:bg-[#F5F5F3]" onClick={() => { setQuestion(q); setPreview(null); }}>{q}</button>)}
        </div>
        <div className="rounded-xl bg-[#F5F5F3] p-4 space-y-2 text-sm">
          <label className="flex items-start gap-2"><input type="checkbox" className="mt-1" disabled={!gatewayConfigured} checked={useGateway} onChange={(e) => { setUseGateway(e.target.checked); setConsent(false); }} />
            Ask the configured AI Gateway to rephrase the local answer {gatewayConfigured ? '' : '(gateway disabled or unconfigured)'}</label>
          {useGateway && <>
            <label className="flex items-start gap-2"><input type="checkbox" className="mt-1" checked={consent} onChange={(e) => setConsent(e.target.checked)} />
              I approve sending this question, the local answer and the cited metric values/IDs shown in the preview. Network names, addresses, device names, floor plans and notes are excluded.</label>
            <button type="button" className={secondary} disabled={busy || question.length < 3} onClick={() => run('/api/v1/analyst/ask/preview', setPreview)}>Preview what would be sent</button>
          </>}
          <p className="text-xs text-neutral-600">The gateway can only rephrase. Answers citing unknown records or introducing new numbers are rejected and the local answer is shown.</p>
        </div>
        {preview && (
          <div className="rounded-xl border border-[#D9DBDE] p-4 text-xs space-y-2">
            <p className="font-semibold">{preview.would_send ? `Would send ${preview.evidence_count} evidence values:` : 'Nothing would be sent: no evidence in scope.'}</p>
            {preview.prompt && <pre className="whitespace-pre-wrap break-all bg-[#F5F5F3] p-3 rounded-lg max-h-64 overflow-auto">{preview.prompt}</pre>}
            <p>Excluded: {preview.excluded.join(', ')}.</p>
          </div>
        )}
        <button className={primary} disabled={!canAsk || busy || question.length < 3 || (useGateway && !consent)} onClick={() => run('/api/v1/analyst/ask', setResult)}>
          {busy ? 'Working…' : 'Answer from evidence'}
        </button>
        {!canAsk && <p className="text-sm">Asking requires a network engineer or administrator; history is readable by all users.</p>}
      </section>
      {error && <p role="alert" className="p-4 bg-red-50 text-red-800 rounded-xl">{error}</p>}
      {result && (
        <article className="space-y-4" aria-label="Evidence answer">
          <section className={card}>
            <div className="flex flex-wrap gap-2 text-xs mb-3">
              <span className="rounded-full bg-[#F5F5F3] border px-2.5 py-1">Topic: {result.intent ?? 'unsupported'}</span>
              <span className="rounded-full bg-[#F5F5F3] border px-2.5 py-1">Mode: {result.mode}</span>
              <span className="rounded-full bg-[#F5F5F3] border px-2.5 py-1">Gateway: {result.gateway_status}</span>
              {result.provider_reported_model && <span className="rounded-full bg-[#F5F5F3] border px-2.5 py-1">Provider-reported model: {result.provider_reported_model}</span>}
              <span className={`rounded-full border px-2.5 py-1 ${result.outcome === 'answered' ? 'bg-emerald-50 border-emerald-200 text-emerald-800' : 'bg-amber-50 border-amber-200 text-amber-800'}`}>{result.outcome.replace('_', ' ')}</span>
            </div>
            <p className="text-base">{result.answer}</p>
            {result.mode === 'gateway_assisted' && <p className="text-xs text-neutral-600 mt-2">Local answer: {result.local_answer}</p>}
            <button onClick={() => window.print()} className="mt-4 underline text-sm print:hidden">Print / Save answer</button>
          </section>
          {result.missing_evidence.length > 0 && <section className="bg-amber-50 border border-amber-200 rounded-2xl p-5"><h2 className="font-semibold text-sm">Missing or limiting evidence</h2><ul className="list-disc pl-5 text-sm mt-2 space-y-1">{result.missing_evidence.map((m) => <li key={m}>{m}</li>)}</ul></section>}
          {result.details?.comparisons && (
            <section className={`${card} overflow-x-auto`}><h2 className="font-semibold mb-2">Comparisons (same source only)</h2>
              <table className="w-full text-sm"><thead><tr className="text-left text-neutral-500"><th className="p-2">Metric</th><th className="p-2">Source</th><th className="p-2">Earlier</th><th className="p-2">Later</th><th className="p-2">Status</th></tr></thead>
                <tbody>{result.details.comparisons.map((c: any, i: number) => <tr key={i} className="border-t"><td className="p-2">{c.metric}</td><td className="p-2 break-all">{c.source}</td>
                  <td className="p-2">{c.earlier_median ?? '—'} {c.unit} (n={c.earlier_n})</td><td className="p-2">{c.later_median ?? '—'} {c.unit} (n={c.later_n})</td><td className="p-2">{c.status.replace(/_/g, ' ')}</td></tr>)}</tbody></table></section>
          )}
          {result.citations.length > 0 && <section className={card}><h2 className="font-semibold mb-2">Cited records ({result.citations.length})</h2><CitationTable citations={result.citations} /></section>}
          <section className="bg-[#F5F5F3] rounded-2xl p-5 border text-sm"><h2 className="font-semibold">Limitations</h2><ul className="list-disc pl-5 mt-2 space-y-1">{result.limitations.map((l) => <li key={l}>{l}</li>)}</ul></section>
        </article>
      )}
    </div>
  );
};

const METRICS = ['rssi_dbm', 'rx_bitrate_mbps', 'tx_bitrate_mbps', 'gateway_ping_avg_ms', 'gateway_ping_loss_pct', 'download_mbps', 'upload_mbps', 'latency_ms'];
const local = (d: Date) => new Date(d.getTime() - d.getTimezoneOffset() * 60000).toISOString().slice(0, 16);

export const ComparePanel: React.FC<{ canAsk: boolean }> = ({ canAsk }) => {
  const now = new Date();
  const [scope, setScope] = useState<Scope>({ days: 7 });
  const [metric, setMetric] = useState('rssi_dbm');
  const [w, setW] = useState({
    earlier_start: local(new Date(now.getTime() - 48 * 3.6e6)), earlier_end: local(new Date(now.getTime() - 24 * 3.6e6)),
    later_start: local(new Date(now.getTime() - 24 * 3.6e6)), later_end: local(now),
  });
  const [result, setResult] = useState<any>(null);
  const [error, setError] = useState('');

  const run = async () => {
    setError('');
    try {
      const { floor_id, collector_id } = clean(scope) as Partial<Scope>;
      setResult(await apiRequest('/api/v1/analyst/compare', { method: 'POST', body: JSON.stringify({
        metric, floor_id, collector_id, ...Object.fromEntries(Object.entries(w).map(([k, v]) => [k, new Date(v).toISOString()])) }) }));
    } catch (e: any) { setError(e.message); }
  };

  return (
    <div className="space-y-4">
      <section className={`${card} space-y-4`} aria-label="Compare time windows">
        <ScopePicker scope={scope} onChange={setScope} />
        <div className="grid gap-3 sm:grid-cols-2 lg:grid-cols-5">
          <label className="text-xs text-neutral-600 flex flex-col gap-1">Metric
            <select className={input} value={metric} onChange={(e) => setMetric(e.target.value)}>{METRICS.map((m) => <option key={m}>{m}</option>)}</select></label>
          {(['earlier_start', 'earlier_end', 'later_start', 'later_end'] as const).map((k) => (
            <label key={k} className="text-xs text-neutral-600 flex flex-col gap-1">{k.replace('_', ' ')}
              <input type="datetime-local" className={input} value={w[k]} onChange={(e) => setW({ ...w, [k]: e.target.value })} /></label>
          ))}
        </div>
        <button className={primary} disabled={!canAsk} onClick={run}>Compare recorded values</button>
        <p className="text-xs text-neutral-600">Each collector, backend host or browser device is compared only with itself. Fewer than 3 samples per window is reported as insufficient.</p>
      </section>
      {error && <p role="alert" className="p-4 bg-red-50 text-red-800 rounded-xl">{error}</p>}
      {result && (
        <section className={`${card} overflow-x-auto`}>
          {result.comparisons.length === 0 ? <p className="text-sm">No recorded values for this metric in either window.</p> : (
            <table className="w-full text-sm"><thead><tr className="text-left text-neutral-500"><th className="p-2">Source</th><th className="p-2">Earlier median</th><th className="p-2">Later median</th><th className="p-2">Change</th><th className="p-2">Status</th></tr></thead>
              <tbody>{result.comparisons.map((c: any, i: number) => <tr key={i} className="border-t"><td className="p-2 break-all">{c.source}</td>
                <td className="p-2">{c.earlier_median ?? '—'} {c.unit} (n={c.earlier_n})</td><td className="p-2">{c.later_median ?? '—'} {c.unit} (n={c.later_n})</td>
                <td className="p-2">{c.delta ?? '—'}</td><td className="p-2">{c.status.replace(/_/g, ' ')}</td></tr>)}</tbody></table>
          )}
          <p className="text-xs text-neutral-600 mt-3">{result.limitations.join(' ')} Saved as history record {result.history_id}.</p>
        </section>
      )}
    </div>
  );
};

export const HistoryPanel: React.FC<{ isAdmin: boolean }> = ({ isAdmin }) => {
  const [rows, setRows] = useState<HistoryRow[]>([]);
  const [selected, setSelected] = useState<HistoryRow | null>(null);
  const [pendingDelete, setPendingDelete] = useState<string | null>(null);
  const [error, setError] = useState('');
  const load = () => apiRequest<HistoryRow[]>('/api/v1/analyst/history?limit=100').then(setRows).catch((e) => setError(e.message));
  useEffect(() => { load(); }, []);

  const open = async (id: string) => {
    try { setSelected(await apiRequest<HistoryRow>(`/api/v1/analyst/history/${id}`)); } catch (e: any) { setError(e.message); }
  };
  const remove = async (id: string) => {
    try { await apiRequest(`/api/v1/analyst/history/${id}`, { method: 'DELETE' }); setPendingDelete(null); setSelected(null); load(); }
    catch (e: any) { setError(e.message); }
  };

  return (
    <div className="grid gap-4 lg:grid-cols-[3fr_2fr]">
      <section className={`${card} overflow-x-auto`} aria-label="Analysis history">
        {error && <p role="alert" className="text-sm text-red-700 mb-2">{error}</p>}
        {rows.length === 0 ? <p className="text-sm text-neutral-600">No analyses recorded yet.</p> : (
          <table className="w-full text-sm"><thead><tr className="text-left text-neutral-500"><th className="p-2">When</th><th className="p-2">Kind</th><th className="p-2">Question / scope</th><th className="p-2">Mode</th><th className="p-2">Outcome</th><th className="p-2">Evidence</th></tr></thead>
            <tbody>{rows.map((r) => (
              <tr key={r.id} tabIndex={0} className={`border-t cursor-pointer hover:bg-[#F5F5F3] ${selected?.id === r.id ? 'bg-[#BE6B37]/5' : ''}`}
                onClick={() => open(r.id)} onKeyDown={(e) => { if (e.key === 'Enter') open(r.id); }}>
                <td className="p-2 whitespace-nowrap">{new Date(r.created_at).toLocaleString()}</td><td className="p-2">{r.kind.replace('_', ' ')}</td>
                <td className="p-2">{r.question ?? '—'}</td><td className="p-2">{r.mode}{r.model_identity ? ` · ${r.model_identity}` : ''}</td>
                <td className="p-2">{r.outcome.replace('_', ' ')}{r.error ? <small className="block text-amber-700">{r.error}</small> : null}</td>
                <td className="p-2">{r.evidence_count}{r.freshness.newest ? <small className="block text-neutral-500">newest {new Date(r.freshness.newest).toLocaleString()}</small> : null}</td>
              </tr>
            ))}</tbody></table>
        )}
      </section>
      {selected && (
        <section className={`${card} space-y-3 text-sm`} aria-label="History record detail">
          <h2 className="font-semibold">Record {selected.id.slice(0, 8)}</h2>
          <p>{selected.result?.answer ?? selected.result?.summary ?? 'Comparison record'}</p>
          <p className="text-xs text-neutral-600">By {selected.operator ?? 'unknown operator'} · gateway {selected.gateway_status} · {selected.evidence_refs?.length ?? 0} evidence references</p>
          {selected.result?.citations?.length > 0 && selected.result.citations[0].metric && <CitationTable citations={selected.result.citations} />}
          {isAdmin && (pendingDelete === selected.id
            ? <span className="inline-flex gap-2"><button className="bg-rose-600 text-white rounded-lg px-3 py-2 text-xs" onClick={() => remove(selected.id)}>Confirm delete</button><button className={secondary} onClick={() => setPendingDelete(null)}>Cancel</button></span>
            : <button className={secondary} onClick={() => setPendingDelete(selected.id)}>Delete record</button>)}
        </section>
      )}
    </div>
  );
};
