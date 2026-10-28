import React, { useEffect, useState } from 'react';
import {
  Download,
  Printer,
  Search,
  ExternalLink,
  Layers,
  Activity,
  Compass,
  Trash2,
  RefreshCw,
} from 'lucide-react';
import { Link } from 'react-router-dom';
import { apiRequest } from '../services/api';
import { useAuth } from '../context/AuthContext';

interface DiagnosticReport {
  id: string;
  title: string;
  created_at: string;
  user_email: string;
  device_name: string;
  interface_name: string;
  vantage_point: string;
  data_provenance: string;
  status: string;
  summary_headline: string;
  overall_score: number;
  findings_count: number;
  critical_count: number;
  warning_count: number;
  good_count: number;
}

interface SurveySessionItem {
  id: string;
  session_name: string;
  created_at: string;
  status: string;
  floor_id: string;
  points_count?: number;
}

interface OptimizationPlanItem {
  id: string;
  floor_id: string;
  network_label: string;
  name: string;
  notes: string | null;
  status: string;
  markers: any[];
  evidence_refs: string[];
  version: number;
  author: string | null;
  created_at: string;
  updated_at: string;
}

export const ReportsPage: React.FC = () => {
  const { user } = useAuth();
  const isEngineerOrAdmin = user?.role === 'administrator' || user?.role === 'network_engineer';

  const [activeTab, setActiveTab] = useState<'diagnostics' | 'surveys' | 'plans'>('diagnostics');
  const [diagnosticReports, setDiagnosticReports] = useState<DiagnosticReport[]>([]);
  const [surveySessions, setSurveySessions] = useState<SurveySessionItem[]>([]);
  const [plans, setPlans] = useState<OptimizationPlanItem[]>([]);
  const [loading, setLoading] = useState(true);
  const [searchQuery, setSearchQuery] = useState('');
  const [message, setMessage] = useState<{ type: 'success' | 'error'; text: string } | null>(null);

  const loadAll = async () => {
    setLoading(true);
    setMessage(null);
    try {
      const [diagRes, surveyRes, planRes] = await Promise.all([
        apiRequest<{ reports?: DiagnosticReport[]; items?: DiagnosticReport[] }>('/api/v1/diagnostics/reports?limit=50').catch(() => ({ reports: [] as DiagnosticReport[], items: [] as DiagnosticReport[] })),
        apiRequest<{ items?: SurveySessionItem[]; sessions?: SurveySessionItem[] } | SurveySessionItem[]>('/api/v1/surveys?limit=100').catch(() => []),
        apiRequest<OptimizationPlanItem[]>('/api/v1/optimization/plans').catch(() => []),
      ]);
      setDiagnosticReports(diagRes.reports || diagRes.items || []);
      const sessionList = Array.isArray(surveyRes) ? surveyRes : (surveyRes?.items || surveyRes?.sessions || []);
      setSurveySessions(sessionList);
      setPlans(Array.isArray(planRes) ? planRes : []);
    } catch (err) {
      setMessage({ type: 'error', text: err instanceof Error ? err.message : 'Failed to load report archive.' });
    } finally {
      setLoading(false);
    }
  };

  useEffect(() => {
    loadAll();
  }, []);

  const handleExportJson = (data: any, filename: string) => {
    const blob = new Blob([JSON.stringify(data, null, 2)], { type: 'application/json' });
    const url = URL.createObjectURL(blob);
    const a = document.createElement('a');
    a.href = url;
    a.download = `${filename}.json`;
    document.body.appendChild(a);
    a.click();
    document.body.removeChild(a);
    URL.revokeObjectURL(url);
  };

  const handlePrint = (title: string, summary: string, metadata: Record<string, any>) => {
    const printWindow = window.open('', '_blank');
    if (!printWindow) return;
    printWindow.document.write(`
      <!DOCTYPE html>
      <html>
        <head>
          <title>${title} - AirGrid Audit Export</title>
          <style>
            body { font-family: -apple-system, BlinkMacSystemFont, "Segoe UI", Roboto, sans-serif; padding: 40px; color: #0B0B0D; }
            h1 { font-size: 22px; margin-bottom: 4px; color: #BE6B37; }
            .meta { font-size: 12px; color: #6B7280; margin-bottom: 24px; }
            .box { background: #F5F5F3; border: 1px solid #D9DBDE; border-radius: 8px; padding: 16px; margin-bottom: 24px; font-size: 14px; }
            table { width: 100%; border-collapse: collapse; font-size: 13px; margin-top: 16px; }
            th, td { border: 1px solid #D9DBDE; padding: 8px 12px; text-align: left; }
            th { background: #F9FAFB; font-weight: 600; }
            .footer { margin-top: 40px; font-size: 11px; color: #9CA3AF; border-top: 1px solid #E5E7EB; padding-top: 12px; }
          </style>
        </head>
        <body>
          <h1>${title}</h1>
          <div class="meta">AirGrid Network Intelligence Platform · Exported on ${new Date().toLocaleString()}</div>
          <div class="box"><strong>Summary:</strong> ${summary}</div>
          <table>
            <thead><tr><th>Parameter</th><th>Recorded Value</th></tr></thead>
            <tbody>
              ${Object.entries(metadata)
                .map(([k, v]) => `<tr><td>${k}</td><td><strong>${v ?? '—'}</strong></td></tr>`)
                .join('')}
            </tbody>
          </table>
          <div class="footer">Confidential · Ground truth network telemetry records</div>
          <script>window.onload = function() { window.print(); };</script>
        </body>
      </html>
    `);
    printWindow.document.close();
  };

  const handleDeleteDiagnosticReport = async (id: string, title: string) => {
    if (!window.confirm(`Delete diagnostic report "${title}"?`)) return;
    try {
      await apiRequest(`/api/v1/diagnostics/reports/${id}`, { method: 'DELETE' });
      setDiagnosticReports(diagnosticReports.filter((r) => r.id !== id));
      setMessage({ type: 'success', text: `Diagnostic report "${title}" deleted.` });
    } catch (err) {
      setMessage({ type: 'error', text: err instanceof Error ? err.message : 'Delete failed.' });
    }
  };

  const handleDeletePlan = async (id: string, name: string) => {
    if (!window.confirm(`Delete optimization plan "${name}"?`)) return;
    try {
      await apiRequest(`/api/v1/optimization/plans/${id}`, { method: 'DELETE' });
      setPlans(plans.filter((p) => p.id !== id));
      setMessage({ type: 'success', text: `Optimization plan "${name}" deleted.` });
    } catch (err) {
      setMessage({ type: 'error', text: err instanceof Error ? err.message : 'Delete failed.' });
    }
  };

  return (
    <div className="space-y-6 max-w-7xl mx-auto">
      {/* Top Header */}
      <div className="flex flex-col md:flex-row md:items-center justify-between gap-4 pb-2 border-b border-[#D9DBDE]">
        <div>
          <div className="flex items-center gap-2">
            <span className="text-xs uppercase tracking-wider font-semibold text-[#BE6B37]">Audit Repository</span>
            <span className="text-xs bg-[#E5E7EB] text-neutral-700 px-2 py-0.5 rounded-full font-mono">Persisted Records</span>
          </div>
          <h1 className="text-2xl font-bold mt-1 text-[#0B0B0D]">Analytics & Reports Explorer</h1>
          <p className="text-sm text-neutral-600 mt-1">
            Browse, inspect, and export recorded diagnostic audits, site survey measurements, and optimization plans.
          </p>
        </div>

        <button
          onClick={loadAll}
          disabled={loading}
          className="flex items-center gap-1.5 px-3.5 py-2 bg-white border border-[#D9DBDE] rounded-xl text-xs font-medium text-[#0B0B0D] hover:bg-neutral-50 transition-colors shadow-xs w-fit"
        >
          <RefreshCw className={`w-3.5 h-3.5 ${loading ? 'animate-spin text-[#BE6B37]' : 'text-neutral-600'}`} />
          <span>Refresh Archive</span>
        </button>
      </div>

      {message && (
        <div
          className={`p-4 rounded-xl text-xs border ${
            message.type === 'success' ? 'bg-emerald-50 border-emerald-200 text-emerald-900' : 'bg-red-50 border-red-200 text-red-900'
          }`}
        >
          {message.text}
        </div>
      )}

      {/* Tabs and Search */}
      <div className="flex flex-col sm:flex-row sm:items-center justify-between gap-4">
        <div className="flex items-center gap-2 bg-[#E5E7EB]/60 p-1 rounded-xl w-fit">
          <button
            onClick={() => setActiveTab('diagnostics')}
            className={`flex items-center gap-2 px-4 py-1.5 rounded-lg text-sm font-medium transition-all ${
              activeTab === 'diagnostics' ? 'bg-white text-[#0B0B0D] shadow-sm' : 'text-neutral-600 hover:text-[#0B0B0D]'
            }`}
          >
            <Activity className="w-4 h-4" />
            <span>Diagnostic Audits ({diagnosticReports.length})</span>
          </button>
          <button
            onClick={() => setActiveTab('surveys')}
            className={`flex items-center gap-2 px-4 py-1.5 rounded-lg text-sm font-medium transition-all ${
              activeTab === 'surveys' ? 'bg-white text-[#0B0B0D] shadow-sm' : 'text-neutral-600 hover:text-[#0B0B0D]'
            }`}
          >
            <Compass className="w-4 h-4" />
            <span>Survey Sessions ({surveySessions.length})</span>
          </button>
          <button
            onClick={() => setActiveTab('plans')}
            className={`flex items-center gap-2 px-4 py-1.5 rounded-lg text-sm font-medium transition-all ${
              activeTab === 'plans' ? 'bg-white text-[#0B0B0D] shadow-sm' : 'text-neutral-600 hover:text-[#0B0B0D]'
            }`}
          >
            <Layers className="w-4 h-4" />
            <span>Optimization Plans ({plans.length})</span>
          </button>
        </div>

        <div className="relative">
          <Search className="w-3.5 h-3.5 text-neutral-400 absolute left-3 top-2.5" />
          <input
            type="text"
            placeholder="Search reports by title or author…"
            value={searchQuery}
            onChange={(e) => setSearchQuery(e.target.value)}
            className="bg-white border border-[#D9DBDE] rounded-lg pl-8 pr-3 py-1.5 text-xs text-[#0B0B0D] placeholder-neutral-400 focus:outline-none focus:border-[#BE6B37] w-64"
          />
        </div>
      </div>

      {/* Main Lists */}
      {loading ? (
        <div className="p-12 text-center text-sm text-neutral-500">Loading reports…</div>
      ) : activeTab === 'diagnostics' ? (
        diagnosticReports.length === 0 ? (
          <div className="p-12 rounded-2xl bg-white border border-[#D9DBDE] text-center space-y-3">
            <Activity className="w-10 h-10 text-neutral-400 mx-auto" />
            <h3 className="text-base font-semibold text-[#0B0B0D]">No Diagnostic Reports Found</h3>
            <p className="text-xs text-neutral-500 max-w-md mx-auto">
              Run a live diagnostic audit from Network Diagnostics to generate empirical findings and save reports.
            </p>
            <Link
              to="/diagnostics"
              className="inline-flex items-center gap-1.5 px-4 py-2 bg-[#BE6B37] text-white rounded-lg text-xs font-medium hover:bg-[#A85B2D]"
            >
              Run Network Diagnostic
            </Link>
          </div>
        ) : (
          <div className="grid grid-cols-1 md:grid-cols-2 gap-4">
            {diagnosticReports
              .filter((r) => r.title.toLowerCase().includes(searchQuery.toLowerCase()) || r.user_email?.toLowerCase().includes(searchQuery.toLowerCase()))
              .map((r) => (
                <div key={r.id} className="p-5 rounded-2xl bg-white border border-[#D9DBDE] shadow-xs space-y-3.5 hover:border-neutral-400 transition-colors">
                  <div className="flex items-start justify-between gap-3">
                    <div>
                      <div className="flex items-center gap-2">
                        <span
                          className={`inline-flex items-center gap-1 px-2 py-0.5 rounded-full text-[11px] font-semibold ${
                            r.status === 'healthy'
                              ? 'bg-emerald-50 text-emerald-800 border border-emerald-200'
                              : r.status === 'critical'
                              ? 'bg-red-50 text-red-800 border border-red-200'
                              : 'bg-amber-50 text-amber-800 border border-amber-200'
                          }`}
                        >
                          Score {r.overall_score} / 100 · {r.status}
                        </span>
                        <span className="text-xs bg-[#E5E7EB] text-neutral-700 px-2 py-0.5 rounded-full font-mono">
                          {r.interface_name}
                        </span>
                      </div>
                      <h3 className="text-base font-bold text-[#0B0B0D] mt-1.5">{r.title}</h3>
                      <p className="text-xs text-neutral-600 mt-0.5">{r.summary_headline}</p>
                    </div>

                    <div className="flex items-center gap-1">
                      <button
                        onClick={() =>
                          handlePrint(r.title, r.summary_headline, {
                            'Audit ID': r.id,
                            'Overall Health Score': `${r.overall_score}/100 (${r.status})`,
                            'Interface': r.interface_name,
                            'Device': r.device_name,
                            'Vantage Point': r.vantage_point,
                            'Executed At': new Date(r.created_at).toLocaleString(),
                            'Auditor': r.user_email,
                            'Critical Findings': r.critical_count,
                            'Warnings': r.warning_count,
                            'Good Checks': r.good_count,
                          })
                        }
                        title="Print / PDF Preview"
                        className="p-1.5 rounded-lg border border-[#D9DBDE] hover:bg-neutral-50 text-neutral-600"
                      >
                        <Printer className="w-3.5 h-3.5" />
                      </button>
                      <button
                        onClick={() => handleExportJson(r, `audit-${r.id.slice(0, 8)}`)}
                        title="Export JSON"
                        className="p-1.5 rounded-lg border border-[#D9DBDE] hover:bg-neutral-50 text-neutral-600"
                      >
                        <Download className="w-3.5 h-3.5" />
                      </button>
                      {isEngineerOrAdmin && (
                        <button
                          onClick={() => handleDeleteDiagnosticReport(r.id, r.title)}
                          title="Delete Report"
                          className="p-1.5 rounded-lg border border-[#D9DBDE] hover:bg-red-50 text-red-600"
                        >
                          <Trash2 className="w-3.5 h-3.5" />
                        </button>
                      )}
                    </div>
                  </div>

                  <div className="pt-3 border-t border-neutral-100 flex items-center justify-between text-xs text-neutral-500">
                    <div className="font-mono text-[11px]">{new Date(r.created_at).toLocaleString()}</div>
                    <Link
                      to="/diagnostics"
                      className="flex items-center gap-1 text-[#BE6B37] hover:text-[#A85B2D] font-medium transition-colors"
                    >
                      <span>Open in Diagnostics</span>
                      <ExternalLink className="w-3 h-3" />
                    </Link>
                  </div>
                </div>
              ))}
          </div>
        )
      ) : activeTab === 'surveys' ? (
        surveySessions.length === 0 ? (
          <div className="p-12 rounded-2xl bg-white border border-[#D9DBDE] text-center space-y-3">
            <Compass className="w-10 h-10 text-neutral-400 mx-auto" />
            <h3 className="text-base font-semibold text-[#0B0B0D]">No Survey Sessions Recorded</h3>
            <p className="text-xs text-neutral-500 max-w-md mx-auto">
              Collect site survey points and generate IDW signal heatmaps in the Wi-Fi Survey Studio.
            </p>
            <Link
              to="/survey"
              className="inline-flex items-center gap-1.5 px-4 py-2 bg-[#BE6B37] text-white rounded-lg text-xs font-medium hover:bg-[#A85B2D]"
            >
              Open Survey Studio
            </Link>
          </div>
        ) : (
          <div className="grid grid-cols-1 md:grid-cols-2 gap-4">
            {surveySessions
              .filter((s) => s.session_name.toLowerCase().includes(searchQuery.toLowerCase()))
              .map((s) => (
                <div key={s.id} className="p-5 rounded-2xl bg-white border border-[#D9DBDE] shadow-xs space-y-3.5 hover:border-neutral-400 transition-colors">
                  <div className="flex items-start justify-between gap-3">
                    <div>
                      <span className="inline-flex items-center px-2 py-0.5 rounded-full text-[11px] font-semibold bg-emerald-50 text-emerald-800 border border-emerald-200">
                        {s.status}
                      </span>
                      <h3 className="text-base font-bold text-[#0B0B0D] mt-1.5">{s.session_name}</h3>
                      <div className="text-xs font-mono text-neutral-500 mt-0.5">Floor ID: {s.floor_id}</div>
                    </div>

                    <div className="flex items-center gap-1">
                      <button
                        onClick={() =>
                          handlePrint(s.session_name, 'Wi-Fi physical site survey walk record', {
                            'Session ID': s.id,
                            'Session Name': s.session_name,
                            'Status': s.status,
                            'Floor ID': s.floor_id,
                            'Recorded At': new Date(s.created_at).toLocaleString(),
                          })
                        }
                        title="Print / PDF Preview"
                        className="p-1.5 rounded-lg border border-[#D9DBDE] hover:bg-neutral-50 text-neutral-600"
                      >
                        <Printer className="w-3.5 h-3.5" />
                      </button>
                      <button
                        onClick={() => handleExportJson(s, `survey-${s.id.slice(0, 8)}`)}
                        title="Export JSON"
                        className="p-1.5 rounded-lg border border-[#D9DBDE] hover:bg-neutral-50 text-neutral-600"
                      >
                        <Download className="w-3.5 h-3.5" />
                      </button>
                    </div>
                  </div>

                  <div className="pt-3 border-t border-neutral-100 flex items-center justify-between text-xs text-neutral-500">
                    <div className="font-mono text-[11px]">{new Date(s.created_at).toLocaleString()}</div>
                    <Link
                      to="/survey"
                      className="flex items-center gap-1 text-[#BE6B37] hover:text-[#A85B2D] font-medium transition-colors"
                    >
                      <span>Open in Survey Studio</span>
                      <ExternalLink className="w-3 h-3" />
                    </Link>
                  </div>
                </div>
              ))}
          </div>
        )
      ) : (
        plans.length === 0 ? (
          <div className="p-12 rounded-2xl bg-white border border-[#D9DBDE] text-center space-y-3">
            <Layers className="w-10 h-10 text-neutral-400 mx-auto" />
            <h3 className="text-base font-semibold text-[#0B0B0D]">No Optimization Plans Persisted</h3>
            <p className="text-xs text-neutral-500 max-w-md mx-auto">
              Formulate speculative AP candidate placement plans and compare before/after survey sessions in Network Optimization.
            </p>
            <Link
              to="/optimization"
              className="inline-flex items-center gap-1.5 px-4 py-2 bg-[#BE6B37] text-white rounded-lg text-xs font-medium hover:bg-[#A85B2D]"
            >
              Open Network Optimization
            </Link>
          </div>
        ) : (
          <div className="grid grid-cols-1 md:grid-cols-2 gap-4">
            {plans
              .filter((p) => p.name.toLowerCase().includes(searchQuery.toLowerCase()) || p.network_label.toLowerCase().includes(searchQuery.toLowerCase()))
              .map((p) => (
                <div key={p.id} className="p-5 rounded-2xl bg-white border border-[#D9DBDE] shadow-xs space-y-3.5 hover:border-neutral-400 transition-colors">
                  <div className="flex items-start justify-between gap-3">
                    <div>
                      <div className="flex items-center gap-2">
                        <span className="inline-flex items-center px-2 py-0.5 rounded-full text-[11px] font-semibold bg-purple-50 text-purple-800 border border-purple-200">
                          {p.status} · v{p.version}
                        </span>
                        <span className="text-xs bg-[#E5E7EB] text-neutral-700 px-2 py-0.5 rounded-full font-mono">
                          {p.network_label}
                        </span>
                      </div>
                      <h3 className="text-base font-bold text-[#0B0B0D] mt-1.5">{p.name}</h3>
                      {p.notes && <p className="text-xs text-neutral-600 mt-0.5 line-clamp-2">{p.notes}</p>}
                    </div>

                    <div className="flex items-center gap-1">
                      <button
                        onClick={() =>
                          handlePrint(p.name, p.notes || 'Speculative AP relocation and placement plan', {
                            'Plan ID': p.id,
                            'Network Label': p.network_label,
                            'Version': p.version,
                            'Status': p.status,
                            'Candidate AP Markers': p.markers.length,
                            'Evidence References': p.evidence_refs.length,
                            'Author': p.author ?? 'Unassigned',
                            'Created At': new Date(p.created_at).toLocaleString(),
                          })
                        }
                        title="Print / PDF Preview"
                        className="p-1.5 rounded-lg border border-[#D9DBDE] hover:bg-neutral-50 text-neutral-600"
                      >
                        <Printer className="w-3.5 h-3.5" />
                      </button>
                      <button
                        onClick={() => handleExportJson(p, `plan-${p.id.slice(0, 8)}`)}
                        title="Export JSON"
                        className="p-1.5 rounded-lg border border-[#D9DBDE] hover:bg-neutral-50 text-neutral-600"
                      >
                        <Download className="w-3.5 h-3.5" />
                      </button>
                      {isEngineerOrAdmin && (
                        <button
                          onClick={() => handleDeletePlan(p.id, p.name)}
                          title="Delete Plan"
                          className="p-1.5 rounded-lg border border-[#D9DBDE] hover:bg-red-50 text-red-600"
                        >
                          <Trash2 className="w-3.5 h-3.5" />
                        </button>
                      )}
                    </div>
                  </div>

                  <div className="pt-3 border-t border-neutral-100 flex items-center justify-between text-xs text-neutral-500">
                    <div className="font-mono text-[11px]">{new Date(p.created_at).toLocaleString()}</div>
                    <Link
                      to="/optimization"
                      className="flex items-center gap-1 text-[#BE6B37] hover:text-[#A85B2D] font-medium transition-colors"
                    >
                      <span>Open in Optimization</span>
                      <ExternalLink className="w-3 h-3" />
                    </Link>
                  </div>
                </div>
              ))}
          </div>
        )
      )}
    </div>
  );
};
