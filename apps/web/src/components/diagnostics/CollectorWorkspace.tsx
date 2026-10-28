import React, { useCallback, useEffect, useState } from 'react';
import { Link } from 'react-router-dom';
import { KeyRound, RefreshCw, ShieldOff, Activity, Database, Clock } from 'lucide-react';
import { diagnosticsService } from '../../services/diagnosticsService';
import {
  CollectorCredentials, DiagnosticReport, NetworkCollector, RetentionPolicy, RetentionPreview, TelemetrySnapshot,
  TelemetryTrends,
} from '../../types/diagnostics';
import { ChartSeries, SERIES_COLORS, TimeSeriesChart } from './TimeSeriesChart';

const card = 'bg-white rounded-2xl border border-[#D9DBDE] p-5 shadow-sm';
const input = 'text-xs bg-[#F5F5F3] border border-[#D9DBDE] rounded-xl px-3 py-2 text-[#0B0B0D] focus:outline-none focus:ring-1 focus:ring-[#BE6B37]';
const btn = 'inline-flex items-center gap-1.5 px-3 py-2 rounded-xl text-xs font-semibold transition-all disabled:opacity-40';
const primary = `${btn} bg-[#BE6B37] hover:bg-[#A3592A] text-white`;
const secondary = `${btn} bg-white hover:bg-[#F5F5F3] border border-[#D9DBDE] text-[#0B0B0D]`;

export function ago(iso: string | null | undefined): string {
  if (!iso) return 'never';
  const s = Math.max(0, (Date.now() - Date.parse(iso)) / 1000);
  if (s < 90) return `${Math.round(s)} s ago`;
  if (s < 5400) return `${Math.round(s / 60)} min ago`;
  if (s < 172800) return `${Math.round(s / 3600)} h ago`;
  return `${Math.round(s / 86400)} days ago`;
}

const freshnessTone = (iso: string | null | undefined) => {
  if (!iso) return 'bg-slate-100 text-slate-600 border-slate-200';
  const h = (Date.now() - Date.parse(iso)) / 3.6e6;
  return h < 1 ? 'bg-emerald-50 text-emerald-700 border-emerald-200'
    : h < 24 ? 'bg-amber-50 text-amber-700 border-amber-200' : 'bg-slate-100 text-slate-600 border-slate-200';
};

const fmt = (v: number | null | undefined, unit: string, digits = 0) => (v == null ? 'unavailable' : `${v.toFixed(digits)} ${unit}`);

// --- Collectors -------------------------------------------------------------------

interface CollectorsProps {
  canAdmin: boolean;
  canAnalyze: boolean;
  scope: { campusId?: string; buildingId?: string; floorId?: string };
  onAnalyzed: (report: DiagnosticReport) => void;
  onError: (message: string) => void;
}

const SecretNotice: React.FC<{ creds: CollectorCredentials; onDone: () => void }> = ({ creds, onDone }) => {
  const file = JSON.stringify({ collector_id: creds.collector.id, secret: creds.secret });
  return (
    <div className="rounded-xl border border-amber-300 bg-amber-50 p-4 text-xs text-[#0B0B0D] space-y-2" role="alert">
      <p className="font-bold">Credential for “{creds.collector.name}” — shown once</p>
      <p>{creds.notice}</p>
      <pre className="whitespace-pre-wrap break-all rounded-lg bg-white border border-amber-200 p-2 font-mono text-[11px]">{file}</pre>
      <p className="font-semibold">On the collector host (one explicit collection per command, no background loop):</p>
      <pre className="whitespace-pre-wrap break-all rounded-lg bg-white border border-amber-200 p-2 font-mono text-[11px]">{`install -m 600 /dev/null ~/.config/airgrid-collector.json   # paste the JSON above into it
AIRGRID_COLLECTOR_ENABLED=true apps/api/.venv/bin/python packages/collector/airgrid_collector.py \\
  --collect --submit --credentials ~/.config/airgrid-collector.json --api-url http://127.0.0.1:8000
# add --ping to also authorize up to 3 ICMP probes to the default gateway; use an HTTPS URL for remote hosts`}</pre>
      <button className={secondary} onClick={onDone}>I have stored this secret</button>
    </div>
  );
};

export const CollectorsPanel: React.FC<CollectorsProps> = ({ canAdmin, canAnalyze, scope, onAnalyzed, onError }) => {
  const [collectors, setCollectors] = useState<NetworkCollector[]>([]);
  const [loading, setLoading] = useState(true);
  const [selected, setSelected] = useState<string>('');
  const [observations, setObservations] = useState<TelemetrySnapshot[]>([]);
  const [creds, setCreds] = useState<CollectorCredentials | null>(null);
  const [form, setForm] = useState({ name: '', host_label: '', scoped: true });
  const [pendingRevoke, setPendingRevoke] = useState<string | null>(null);
  const [consent, setConsent] = useState(false);
  const [busy, setBusy] = useState<string | null>(null);

  const load = useCallback(async () => {
    try {
      setLoading(true);
      const list = await diagnosticsService.listCollectors();
      setCollectors(list);
      setSelected((cur) => (list.some((c) => c.id === cur) ? cur : list[0]?.id || ''));
    } catch (e: any) {
      onError(e.message || 'Failed to load collectors.');
    } finally {
      setLoading(false);
    }
  }, [onError]);

  useEffect(() => { load(); }, [load]);

  useEffect(() => {
    if (!selected) { setObservations([]); return; }
    diagnosticsService.listCollectorObservations(selected, 25).then(setObservations).catch((e) => onError(e.message));
  }, [selected, onError]);

  const register = async (e: React.FormEvent) => {
    e.preventDefault();
    try {
      setBusy('register');
      const result = await diagnosticsService.registerCollector({
        name: form.name.trim(), host_label: form.host_label.trim() || undefined,
        ...(form.scoped ? { campus_id: scope.campusId, building_id: scope.buildingId, floor_id: scope.floorId } : {}),
      });
      setCreds(result);
      setForm({ name: '', host_label: '', scoped: true });
      setSelected(result.collector.id);
      load();
    } catch (err: any) {
      onError(err.message || 'Registration failed.');
    } finally {
      setBusy(null);
    }
  };

  const revoke = async (id: string) => {
    try {
      await diagnosticsService.revokeCollector(id);
      setPendingRevoke(null);
      load();
    } catch (err: any) { onError(err.message); }
  };

  const rotate = async (id: string) => {
    try { setCreds(await diagnosticsService.rotateCollector(id)); } catch (err: any) { onError(err.message); }
  };

  const analyze = async (snapshot: TelemetrySnapshot) => {
    try {
      setBusy(snapshot.id!);
      const report = await diagnosticsService.analyzeDiagnostics({ telemetry_snapshot_id: snapshot.id, operator_consent: true });
      onAnalyzed(report);
      setObservations((obs) => obs.map((o) => (o.id === snapshot.id ? { ...o, report_id: report.id } : o)));
    } catch (err: any) {
      onError(err.message || 'Analysis failed.');
    } finally {
      setBusy(null);
    }
  };

  const active = collectors.find((c) => c.id === selected);

  return (
    <section className={`${card} space-y-4`} aria-labelledby="collectors-heading">
      <div className="flex flex-wrap items-center justify-between gap-2">
        <div>
          <h2 id="collectors-heading" className="text-sm font-bold text-[#0B0B0D]">Registered collectors</h2>
          <p className="text-[11px] text-[#737373]">Signed submissions from registered Linux hosts. Collection starts only when an operator runs the collector with <code>--collect</code>.</p>
        </div>
        <button className={secondary} onClick={load} aria-label="Refresh collectors"><RefreshCw className="w-3.5 h-3.5" />Refresh</button>
      </div>

      {creds && <SecretNotice creds={creds} onDone={() => setCreds(null)} />}

      {canAdmin && (
        <form onSubmit={register} className="flex flex-wrap items-end gap-2 rounded-xl bg-[#F5F5F3] p-3">
          <label className="text-[11px] text-[#525252] flex flex-col gap-1">Collector name
            <input className={input} required maxLength={100} value={form.name} onChange={(e) => setForm({ ...form, name: e.target.value })} />
          </label>
          <label className="text-[11px] text-[#525252] flex flex-col gap-1">Host label (optional)
            <input className={input} maxLength={100} value={form.host_label} onChange={(e) => setForm({ ...form, host_label: e.target.value })} />
          </label>
          <label className="text-[11px] text-[#525252] flex items-center gap-1.5 pb-2">
            <input type="checkbox" checked={form.scoped} disabled={!scope.floorId} onChange={(e) => setForm({ ...form, scoped: e.target.checked })} />
            Attribute observations to the selected floor
          </label>
          <button className={primary} disabled={busy === 'register' || !form.name.trim()}><KeyRound className="w-3.5 h-3.5" />Register collector</button>
        </form>
      )}

      {loading ? (
        <p className="text-xs text-[#737373]">Loading collectors…</p>
      ) : collectors.length === 0 ? (
        <p className="text-xs text-[#737373]">No collectors are registered. {canAdmin ? 'Register one above to receive authenticated observations.' : 'An administrator must register a collector.'}</p>
      ) : (
        <div className="overflow-x-auto">
          <table className="w-full text-xs">
            <thead><tr className="text-left text-[#737373]">
              <th className="py-1.5 pr-3">Collector</th><th className="pr-3">Status</th><th className="pr-3">Last submission</th>
              <th className="pr-3">Accepted / rejected</th><th />
            </tr></thead>
            <tbody>
              {collectors.map((c) => (
                <tr key={c.id} className={`border-t border-[#EDEEF0] ${c.id === selected ? 'bg-[#BE6B37]/5' : ''}`}>
                  <td className="py-2 pr-3">
                    <button className="text-left font-semibold text-[#0B0B0D] hover:underline" onClick={() => setSelected(c.id)} aria-pressed={c.id === selected}>{c.name}</button>
                    <div className="text-[10px] text-[#737373]">{c.host_label || 'no host label'}{c.floor_id ? ' · floor-scoped' : ' · unscoped'}</div>
                  </td>
                  <td className="pr-3"><span className={`rounded-full border px-2 py-0.5 text-[10px] font-semibold ${c.status === 'active' ? 'bg-emerald-50 text-emerald-700 border-emerald-200' : 'bg-rose-50 text-rose-700 border-rose-200'}`}>{c.status}</span></td>
                  <td className="pr-3"><span className={`rounded-full border px-2 py-0.5 text-[10px] ${freshnessTone(c.last_seen_at)}`}>{ago(c.last_seen_at)}</span>
                    {c.last_submission_status && <div className="text-[10px] text-[#737373]">{c.last_submission_status}</div>}</td>
                  <td className="pr-3">{c.submission_count} / {c.rejected_count}</td>
                  <td className="text-right whitespace-nowrap">
                    {canAdmin && c.status === 'active' && (
                      pendingRevoke === c.id ? (
                        <span className="inline-flex gap-1">
                          <button className={`${btn} bg-rose-600 text-white`} onClick={() => revoke(c.id)}>Confirm revoke</button>
                          <button className={secondary} onClick={() => setPendingRevoke(null)}>Cancel</button>
                        </span>
                      ) : (
                        <span className="inline-flex gap-1">
                          <button className={secondary} onClick={() => rotate(c.id)}><KeyRound className="w-3.5 h-3.5" />Rotate</button>
                          <button className={secondary} onClick={() => setPendingRevoke(c.id)}><ShieldOff className="w-3.5 h-3.5" />Revoke</button>
                        </span>
                      )
                    )}
                  </td>
                </tr>
              ))}
            </tbody>
          </table>
        </div>
      )}

      {active && (
        <div className="space-y-2">
          <div className="flex flex-wrap items-center justify-between gap-2">
            <h3 className="text-xs font-bold text-[#0B0B0D]">Recent observations — {active.name}</h3>
            {canAnalyze && (
              <label className="text-[11px] text-[#525252] flex items-center gap-1.5">
                <input type="checkbox" checked={consent} onChange={(e) => setConsent(e.target.checked)} />
                I approve local deterministic analysis of selected stored observations
              </label>
            )}
          </div>
          {observations.length === 0 ? (
            <p className="text-xs text-[#737373]">No observations received from this collector yet.</p>
          ) : (
            <div className="overflow-x-auto">
              <table className="w-full text-xs">
                <thead><tr className="text-left text-[#737373]">
                  <th className="py-1.5 pr-3">Collected</th><th className="pr-3">Result</th><th className="pr-3">RSSI</th>
                  <th className="pr-3">Band / ch.</th><th className="pr-3">Link rate (rx/tx)</th><th className="pr-3">Gateway RTT</th><th />
                </tr></thead>
                <tbody>
                  {observations.map((o) => (
                    <tr key={o.id} className="border-t border-[#EDEEF0]">
                      <td className="py-2 pr-3" title={o.collected_at}>{new Date(o.collected_at).toLocaleString()}<div className="text-[10px] text-[#737373]">{ago(o.collected_at)}</div></td>
                      <td className="pr-3">{o.collection_status}{o.collection_error && <div className="text-[10px] text-rose-700">{o.collection_error}</div>}</td>
                      <td className="pr-3">{fmt(o.rssi_dbm, 'dBm')}</td>
                      <td className="pr-3">{o.band ?? '—'}{o.channel ? ` / ${o.channel}` : ''}</td>
                      <td className="pr-3">{o.rx_bitrate_mbps == null && o.tx_bitrate_mbps == null ? 'unavailable' : `${o.rx_bitrate_mbps ?? '—'} / ${o.tx_bitrate_mbps ?? '—'} Mbps`}</td>
                      <td className="pr-3">{fmt(o.gateway_ping?.rtt_avg_ms, 'ms', 1)}</td>
                      <td className="text-right whitespace-nowrap">
                        {o.report_id ? (
                          <Link className="text-[#BE6B37] font-semibold hover:underline" to={`/ai-analyst?report=${o.report_id}`}>View analysis</Link>
                        ) : canAnalyze && o.collection_status !== 'failed' ? (
                          <button className={secondary} disabled={!consent || busy === o.id} onClick={() => analyze(o)}>
                            <Activity className="w-3.5 h-3.5" />{busy === o.id ? 'Analyzing…' : 'Analyze'}
                          </button>
                        ) : null}
                      </td>
                    </tr>
                  ))}
                </tbody>
              </table>
            </div>
          )}
          <p className="text-[10px] text-[#737373]">Provenance: instrumented Linux telemetry from a signed, registered collector. Observations describe the collector host, not this browser.</p>
        </div>
      )}
    </section>
  );
};

// --- Trends -----------------------------------------------------------------------

const series = (label: string, color: string, rows: { t: string; v: number | null; id: string; note?: string }[]): ChartSeries => ({
  label, color, points: rows.filter((r) => r.v != null && Number.isFinite(r.v)).map((r) => ({ t: r.t, v: r.v as number, id: r.id, note: r.note })),
});

export const TelemetryTrendsPanel: React.FC<{ floorId?: string; onError: (m: string) => void }> = ({ floorId, onError }) => {
  const [collectors, setCollectors] = useState<NetworkCollector[]>([]);
  const [source, setSource] = useState<string>(floorId ? 'floor' : 'all');
  const [days, setDays] = useState(7);
  const [trends, setTrends] = useState<TelemetryTrends | null>(null);
  const [loading, setLoading] = useState(false);

  useEffect(() => { diagnosticsService.listCollectors().then(setCollectors).catch(() => setCollectors([])); }, []);

  useEffect(() => {
    setLoading(true);
    diagnosticsService.getTrends({
      days,
      collectorId: source !== 'floor' && source !== 'all' ? source : undefined,
      floorId: source === 'floor' ? floorId : undefined,
    }).then(setTrends).catch((e) => onError(e.message || 'Failed to load trends.')).finally(() => setLoading(false));
  }, [source, days, floorId, onError]);

  const s = trends?.series ?? [];
  const sp = trends?.speed_tests ?? [];
  const note = (p: { band: string | null; channel: number | null; vantage_point: string }) =>
    [p.band, p.channel ? `ch ${p.channel}` : null, p.vantage_point].filter(Boolean).join(' · ');

  return (
    <section className={`${card} space-y-4`} aria-labelledby="trends-heading">
      <div className="flex flex-wrap items-center justify-between gap-2">
        <div>
          <h2 id="trends-heading" className="text-sm font-bold text-[#0B0B0D]">Measurement history</h2>
          <p className="text-[11px] text-[#737373]">Persisted instrument observations only (operator-reported values excluded). Gaps mean nothing was recorded.</p>
        </div>
        <div className="flex flex-wrap gap-2">
          <select aria-label="Trend source" className={input} value={source} onChange={(e) => setSource(e.target.value)}>
            <option value="floor" disabled={!floorId}>Selected floor</option>
            <option value="all">All sources</option>
            {collectors.map((c) => <option key={c.id} value={c.id}>Collector: {c.name}</option>)}
          </select>
          <select aria-label="Time window" className={input} value={days} onChange={(e) => setDays(Number(e.target.value))}>
            {[1, 7, 30, 90].map((d) => <option key={d} value={d}>Last {d} day{d > 1 ? 's' : ''}</option>)}
          </select>
        </div>
      </div>

      {loading && !trends ? <p className="text-xs text-[#737373]">Loading history…</p> : trends && (
        <>
          <div className="flex flex-wrap gap-2 text-[11px]">
            <span className={`rounded-full border px-2.5 py-1 ${freshnessTone(trends.freshness.latest_observation_at)}`}>
              <Clock className="inline w-3 h-3 mr-1" />Latest observation: {ago(trends.freshness.latest_observation_at)}
            </span>
            <span className={`rounded-full border px-2.5 py-1 ${freshnessTone(trends.freshness.latest_speed_test_at)}`}>Latest browser speed test: {ago(trends.freshness.latest_speed_test_at)}</span>
            {Object.entries(trends.availability).map(([k, v]) => (
              <span key={k} className="rounded-full border border-[#D9DBDE] bg-[#F5F5F3] px-2.5 py-1 text-[#525252]">{k.replace(/_/g, ' ')}: {v}</span>
            ))}
            {trends.truncated && <span className="rounded-full border border-amber-200 bg-amber-50 px-2.5 py-1 text-amber-700">Showing newest 2000 observations</span>}
          </div>

          <div className="grid gap-3 lg:grid-cols-2">
            <TimeSeriesChart title="Wireless signal (RSSI)" unit="dBm" emptyText="No RSSI observations recorded in this window."
              series={[series('RSSI', SERIES_COLORS[0], s.map((p) => ({ t: p.collected_at, v: p.rssi_dbm, id: p.snapshot_id, note: note(p) })))]} />
            <TimeSeriesChart title="Negotiated link bitrate" unit="Mbps" emptyText="No link bitrate recorded in this window."
              series={[
                series('Receive', SERIES_COLORS[0], s.map((p) => ({ t: p.collected_at, v: p.rx_bitrate_mbps, id: p.snapshot_id }))),
                series('Transmit', SERIES_COLORS[1], s.map((p) => ({ t: p.collected_at, v: p.tx_bitrate_mbps, id: p.snapshot_id }))),
              ]} />
            <TimeSeriesChart title="Gateway round-trip time" unit="ms" emptyText="No gateway latency probes recorded (probes run only when explicitly authorized)."
              series={[series('Average RTT', SERIES_COLORS[0], s.map((p) => ({ t: p.collected_at, v: p.gateway_rtt_avg_ms, id: p.snapshot_id })))]} />
            <TimeSeriesChart title="Gateway probe packet loss" unit="%" yDomain={[0, 100]} emptyText="No packet-loss measurements recorded."
              series={[series('Loss', SERIES_COLORS[0], s.map((p) => ({ t: p.collected_at, v: p.gateway_loss_pct, id: p.snapshot_id })))]} />
            <TimeSeriesChart title="Browser internet throughput" unit="Mbps" emptyText="No completed speed tests in this window."
              series={[
                series('Download', SERIES_COLORS[0], sp.map((p) => ({ t: p.executed_at, v: p.download_mbps, id: p.id }))),
                series('Upload', SERIES_COLORS[1], sp.map((p) => ({ t: p.executed_at, v: p.upload_mbps, id: p.id }))),
              ]} />
            <TimeSeriesChart title="Browser internet latency" unit="ms" emptyText="No completed speed tests in this window."
              series={[series('Latency', SERIES_COLORS[0], sp.map((p) => ({ t: p.executed_at, v: p.latency_ms, id: p.id })))]} />
          </div>

          <div className="grid gap-3 lg:grid-cols-2">
            <div className="rounded-xl border border-[#D9DBDE] p-4">
              <h3 className="text-xs font-semibold text-[#0B0B0D]">Connection status transitions</h3>
              {trends.transitions.length === 0 ? <p className="mt-2 text-xs text-[#737373]">No state changes or roams recorded.</p> : (
                <ul className="mt-2 max-h-48 overflow-auto text-[11px] space-y-1">
                  {trends.transitions.slice().reverse().map((t) => (
                    <li key={t.snapshot_id}>{new Date(t.at).toLocaleString()} — <strong>{t.kind === 'roam' ? 'roamed to another BSSID' : `${t.from} → ${t.to}`}</strong></li>
                  ))}
                </ul>
              )}
            </div>
            <div className="rounded-xl border border-[#D9DBDE] p-4">
              <h3 className="text-xs font-semibold text-[#0B0B0D]">Aggregated history (after retention)</h3>
              {trends.daily_aggregates.length === 0 ? <p className="mt-2 text-xs text-[#737373]">No daily aggregates in this window.</p> : (
                <table className="mt-2 w-full text-[11px]"><thead><tr className="text-left text-[#737373]"><th>Day</th><th>Samples</th><th>RSSI avg (min–max)</th></tr></thead>
                  <tbody>{trends.daily_aggregates.map((a, i) => (
                    <tr key={i}><td>{a.day}</td><td>{a.sample_count}</td>
                      <td>{a.metrics.rssi_dbm ? `${a.metrics.rssi_dbm.avg.toFixed(1)} (${a.metrics.rssi_dbm.min}–${a.metrics.rssi_dbm.max}) dBm` : 'unavailable'}</td></tr>
                  ))}</tbody></table>
              )}
            </div>
          </div>
          <p className="text-[10px] text-[#737373]">{trends.notes.join(' ')}</p>
        </>
      )}
    </section>
  );
};

// --- Retention --------------------------------------------------------------------

export const RetentionPanel: React.FC<{ canAdmin: boolean; onError: (m: string) => void }> = ({ canAdmin, onError }) => {
  const [policies, setPolicies] = useState<RetentionPolicy[]>([]);
  const [draft, setDraft] = useState<Record<string, { days: string; aggregate: boolean }>>({});
  const [preview, setPreview] = useState<Record<string, RetentionPreview | undefined>>({});
  const [confirmed, setConfirmed] = useState<Record<string, boolean>>({});
  const [result, setResult] = useState<string | null>(null);

  const load = useCallback(() => diagnosticsService.listRetention().then((p) => {
    setPolicies(p);
    setDraft(Object.fromEntries(p.map((x) => [x.dataset, { days: x.retention_days?.toString() ?? '', aggregate: x.aggregate_before_delete }])));
  }).catch((e) => onError(e.message)), [onError]);

  useEffect(() => { load(); }, [load]);

  const save = async (dataset: string) => {
    const d = draft[dataset];
    try {
      await diagnosticsService.updateRetention(dataset, d.days ? Number(d.days) : null, d.aggregate);
      setPreview((p) => ({ ...p, [dataset]: undefined }));
      load();
    } catch (e: any) { onError(e.message); }
  };

  const runPreview = async (dataset: string) => {
    try {
      const pv = await diagnosticsService.previewRetention(dataset);
      setPreview((p) => ({ ...p, [dataset]: pv }));
    } catch (e: any) { onError(e.message); }
  };

  const apply = async (dataset: string, expected: number) => {
    try {
      const r = await diagnosticsService.applyRetention(dataset, expected);
      setResult(`Removed ${r.deleted} records (${r.aggregated_groups} daily aggregate groups written) older than ${new Date(r.cutoff).toLocaleString()}.`);
      setConfirmed((c) => ({ ...c, [dataset]: false }));
      runPreview(dataset);
    } catch (e: any) { onError(e.message); }
  };

  return (
    <section className={`${card} space-y-3`} aria-labelledby="retention-heading">
      <div>
        <h2 id="retention-heading" className="text-sm font-bold text-[#0B0B0D] flex items-center gap-2"><Database className="w-4 h-4 text-[#BE6B37]" />Data retention</h2>
        <p className="text-[11px] text-[#737373]">Nothing is deleted automatically. Administrators set a policy, preview the affected count and apply it explicitly. Records linked to saved reports or survey points are protected.</p>
      </div>
      {result && <p className="rounded-lg bg-emerald-50 border border-emerald-200 p-2 text-xs text-emerald-800">{result}</p>}
      {policies.map((p) => {
        const d = draft[p.dataset] ?? { days: '', aggregate: true };
        const pv = preview[p.dataset];
        return (
          <div key={p.dataset} className="rounded-xl border border-[#D9DBDE] p-4 space-y-2">
            <div className="text-xs font-semibold text-[#0B0B0D]">{p.dataset.replace(/_/g, ' ')}</div>
            <p className="text-[11px] text-[#737373]">{p.description}</p>
            <p className="text-[11px] text-[#525252]">Current policy: {p.retention_days ? `keep ${p.retention_days} days` : 'keep indefinitely'}{p.updated_at ? ` · updated ${ago(p.updated_at)}` : ''}</p>
            {canAdmin && (
              <div className="flex flex-wrap items-end gap-2">
                <label className="text-[11px] text-[#525252] flex flex-col gap-1">Keep for days (blank = indefinitely, min 7)
                  <input className={input} type="number" min={7} max={3650} value={d.days} onChange={(e) => setDraft({ ...draft, [p.dataset]: { ...d, days: e.target.value } })} />
                </label>
                <label className="text-[11px] text-[#525252] flex items-center gap-1.5 pb-2">
                  <input type="checkbox" checked={d.aggregate} onChange={(e) => setDraft({ ...draft, [p.dataset]: { ...d, aggregate: e.target.checked } })} />
                  Keep daily aggregates
                </label>
                <button className={secondary} onClick={() => save(p.dataset)}>Save policy</button>
                <button className={secondary} onClick={() => runPreview(p.dataset)}>Preview</button>
              </div>
            )}
            {pv && (
              <div className="rounded-lg bg-[#F5F5F3] p-3 text-[11px] text-[#0B0B0D] space-y-1.5">
                {pv.enabled ? (
                  <>
                    <p><strong>{pv.eligible_count}</strong> records older than {new Date(pv.cutoff!).toLocaleString()} would be removed; <strong>{pv.protected_count}</strong> older records are protected.</p>
                    {pv.eligible_count > 0 && (
                      <div className="flex flex-wrap items-center gap-2">
                        <label className="flex items-center gap-1.5"><input type="checkbox" checked={!!confirmed[p.dataset]} onChange={(e) => setConfirmed({ ...confirmed, [p.dataset]: e.target.checked })} />
                          I confirm permanent deletion of these {pv.eligible_count} records</label>
                        <button className={`${btn} bg-rose-600 text-white`} disabled={!confirmed[p.dataset]} onClick={() => apply(p.dataset, pv.eligible_count)}>Apply retention</button>
                      </div>
                    )}
                  </>
                ) : <p>{pv.note}</p>}
              </div>
            )}
          </div>
        );
      })}
    </section>
  );
};
