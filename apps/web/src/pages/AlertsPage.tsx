import React, { useEffect, useState } from 'react';
import {
  AlertTriangle,
  AlertCircle,
  CheckCircle2,
  Search,
  ShieldCheck,
  FileText,
  ExternalLink,
  RefreshCw,
} from 'lucide-react';
import { Link } from 'react-router-dom';
import { apiRequest } from '../services/api';

interface FindingWithContext {
  id: string;
  report_id: string;
  report_title: string;
  created_at: string;
  category: string;
  severity: 'critical' | 'warning' | 'good' | string;
  title: string;
  description: string;
  measured_evidence: string;
  recommendation: string | null;
}

interface DiagnosticReportItem {
  id: string;
  title: string;
  created_at: string;
  overall_score: number;
  status: string;
  findings: Array<{
    id: string;
    category: string;
    severity: string;
    title: string;
    description: string;
    measured_evidence: string;
    recommendation: string | null;
  }>;
}

export const AlertsPage: React.FC = () => {
  const [findings, setFindings] = useState<FindingWithContext[]>([]);
  const [loading, setLoading] = useState(true);
  const [severityFilter, setSeverityFilter] = useState<string>('all');
  const [categoryFilter, setCategoryFilter] = useState<string>('all');
  const [searchQuery, setSearchQuery] = useState<string>('');

  const loadFindings = async () => {
    setLoading(true);
    try {
      const data = await apiRequest<{ reports?: DiagnosticReportItem[]; items?: DiagnosticReportItem[] }>('/api/v1/diagnostics/reports?limit=50');
      const reportList = data.reports || data.items || [];
      const aggregated: FindingWithContext[] = [];
      for (const report of reportList) {
        for (const f of report.findings || []) {
          aggregated.push({
            id: f.id || `${report.id}-${aggregated.length}`,
            report_id: report.id,
            report_title: report.title,
            created_at: report.created_at,
            category: f.category || 'general',
            severity: f.severity,
            title: f.title,
            description: f.description || '',
            measured_evidence: f.measured_evidence,
            recommendation: f.recommendation,
          });
        }
      }
      setFindings(aggregated);
    } catch {
      setFindings([]);
    } finally {
      setLoading(false);
    }
  };

  useEffect(() => {
    loadFindings();
  }, []);

  const filteredFindings = findings.filter((f) => {
    if (severityFilter !== 'all' && f.severity !== severityFilter) return false;
    if (categoryFilter !== 'all' && f.category !== categoryFilter) return false;
    if (
      searchQuery &&
      !f.title.toLowerCase().includes(searchQuery.toLowerCase()) &&
      !f.description.toLowerCase().includes(searchQuery.toLowerCase()) &&
      !f.measured_evidence.toLowerCase().includes(searchQuery.toLowerCase())
    ) {
      return false;
    }
    return true;
  });

  const criticalCount = findings.filter((f) => f.severity === 'critical').length;
  const warningCount = findings.filter((f) => f.severity === 'warning').length;
  const goodCount = findings.filter((f) => f.severity === 'good').length;

  const categories = Array.from(new Set(findings.map((f) => f.category))).sort();

  return (
    <div className="space-y-6 max-w-7xl mx-auto">
      {/* Top Header */}
      <div className="flex flex-col md:flex-row md:items-center justify-between gap-4 pb-2 border-b border-[#D9DBDE]">
        <div>
          <div className="flex items-center gap-2">
            <span className="text-xs uppercase tracking-wider font-semibold text-[#BE6B37]">Network Health</span>
            <span className="text-xs bg-[#E5E7EB] text-neutral-700 px-2 py-0.5 rounded-full font-mono">Retrospective Evidence</span>
          </div>
          <h1 className="text-2xl font-bold mt-1 text-[#0B0B0D]">Diagnostic Findings & Incident Inbox</h1>
          <p className="text-sm text-neutral-600 mt-1">
            Empirical findings, RF anomalies, and degradation warnings derived from deterministic telemetry evaluation.
          </p>
        </div>

        <button
          onClick={loadFindings}
          disabled={loading}
          className="flex items-center gap-1.5 px-3.5 py-2 bg-white border border-[#D9DBDE] rounded-xl text-xs font-medium text-[#0B0B0D] hover:bg-neutral-50 transition-colors shadow-xs w-fit"
        >
          <RefreshCw className={`w-3.5 h-3.5 ${loading ? 'animate-spin text-[#BE6B37]' : 'text-neutral-600'}`} />
          <span>Refresh Findings</span>
        </button>
      </div>

      {/* Ground Truth Banner */}
      <div className="p-4 rounded-2xl bg-amber-50/70 border border-amber-200/80 flex items-start gap-3.5 text-xs text-amber-900 leading-relaxed shadow-xs">
        <ShieldCheck className="w-5 h-5 text-amber-700 flex-shrink-0 mt-0.5" />
        <div>
          <strong className="font-semibold text-amber-950">Ground Truth Safeguard:</strong> AirGrid findings are strictly
          computed through deterministic rules evaluating stored physical observations. Synthetic alarm triggers, simulated
          alerts, and ungrounded notifications are disabled by design.
        </div>
      </div>

      {/* Metrics Scoreboard */}
      <div className="grid grid-cols-1 sm:grid-cols-4 gap-4">
        <div className="p-5 rounded-2xl bg-white border border-[#D9DBDE] shadow-sm">
          <div className="flex items-center justify-between text-xs text-neutral-500 font-medium mb-1">
            <span>Critical Findings</span>
            <AlertCircle className="w-4 h-4 text-red-600" />
          </div>
          <div className="text-2xl font-bold text-red-700 mt-1 font-mono">{criticalCount}</div>
          <div className="text-[11px] text-neutral-500 mt-1">Immediate attention required</div>
        </div>

        <div className="p-5 rounded-2xl bg-white border border-[#D9DBDE] shadow-sm">
          <div className="flex items-center justify-between text-xs text-neutral-500 font-medium mb-1">
            <span>Warnings</span>
            <AlertTriangle className="w-4 h-4 text-amber-600" />
          </div>
          <div className="text-2xl font-bold text-amber-700 mt-1 font-mono">{warningCount}</div>
          <div className="text-[11px] text-neutral-500 mt-1">Sub-optimal RF performance</div>
        </div>

        <div className="p-5 rounded-2xl bg-white border border-[#D9DBDE] shadow-sm">
          <div className="flex items-center justify-between text-xs text-neutral-500 font-medium mb-1">
            <span>Healthy Checks</span>
            <CheckCircle2 className="w-4 h-4 text-emerald-600" />
          </div>
          <div className="text-2xl font-bold text-emerald-700 mt-1 font-mono">{goodCount}</div>
          <div className="text-[11px] text-neutral-500 mt-1">Passing metrics & benchmarks</div>
        </div>

        <div className="p-5 rounded-2xl bg-white border border-[#D9DBDE] shadow-sm">
          <div className="flex items-center justify-between text-xs text-neutral-500 font-medium mb-1">
            <span>Total Evaluated</span>
            <FileText className="w-4 h-4 text-[#BE6B37]" />
          </div>
          <div className="text-2xl font-bold text-[#0B0B0D] mt-1 font-mono">{findings.length}</div>
          <div className="text-[11px] text-neutral-500 mt-1">Across all historical reports</div>
        </div>
      </div>

      {/* Filter and Search Bar */}
      <div className="flex flex-col sm:flex-row sm:items-center justify-between gap-4">
        <div className="flex flex-wrap items-center gap-2">
          {['all', 'critical', 'warning', 'good'].map((sev) => (
            <button
              key={sev}
              onClick={() => setSeverityFilter(sev)}
              className={`px-3 py-1.5 rounded-lg text-xs font-medium capitalize transition-all ${
                severityFilter === sev
                  ? 'bg-[#BE6B37] text-white shadow-xs'
                  : 'bg-white border border-[#D9DBDE] text-neutral-700 hover:bg-neutral-50'
              }`}
            >
              {sev}
            </button>
          ))}

          {categories.length > 0 && (
            <select
              value={categoryFilter}
              onChange={(e) => setCategoryFilter(e.target.value)}
              className="bg-white border border-[#D9DBDE] rounded-lg px-3 py-1.5 text-xs text-[#0B0B0D] focus:outline-none focus:border-[#BE6B37]"
            >
              <option value="all">All Categories</option>
              {categories.map((c) => (
                <option key={c} value={c}>
                  {c.replace(/_/g, ' ')}
                </option>
              ))}
            </select>
          )}
        </div>

        <div className="relative">
          <Search className="w-3.5 h-3.5 text-neutral-400 absolute left-3 top-2.5" />
          <input
            type="text"
            placeholder="Search findings or evidence…"
            value={searchQuery}
            onChange={(e) => setSearchQuery(e.target.value)}
            className="bg-white border border-[#D9DBDE] rounded-lg pl-8 pr-3 py-1.5 text-xs text-[#0B0B0D] placeholder-neutral-400 focus:outline-none focus:border-[#BE6B37] w-64"
          />
        </div>
      </div>

      {/* Findings List */}
      {loading ? (
        <div className="p-12 text-center text-sm text-neutral-500">Loading diagnostic findings…</div>
      ) : filteredFindings.length === 0 ? (
        <div className="p-12 rounded-2xl bg-white border border-[#D9DBDE] text-center space-y-3">
          <ShieldCheck className="w-10 h-10 text-neutral-400 mx-auto" />
          <h3 className="text-base font-semibold text-[#0B0B0D]">No Findings Match Filter</h3>
          <p className="text-xs text-neutral-500 max-w-md mx-auto">
            {findings.length === 0
              ? 'No diagnostic reports have been executed yet. Run a live network diagnostic audit to generate evidence-backed findings.'
              : 'Try clearing your search or severity filter to see other diagnostic findings.'}
          </p>
          {findings.length === 0 && (
            <Link
              to="/diagnostics"
              className="inline-flex items-center gap-1.5 px-4 py-2 bg-[#BE6B37] text-white rounded-lg text-xs font-medium hover:bg-[#A85B2D] transition-colors"
            >
              Go to Network Diagnostics
            </Link>
          )}
        </div>
      ) : (
        <div className="space-y-3">
          {filteredFindings.map((finding) => (
            <div
              key={finding.id}
              className={`p-5 rounded-2xl bg-white border transition-all shadow-xs ${
                finding.severity === 'critical'
                  ? 'border-red-200 hover:border-red-300'
                  : finding.severity === 'warning'
                  ? 'border-amber-200 hover:border-amber-300'
                  : 'border-[#D9DBDE] hover:border-neutral-400'
              }`}
            >
              <div className="flex flex-col sm:flex-row sm:items-center justify-between gap-2 pb-2 mb-3 border-b border-neutral-100">
                <div className="flex items-center gap-2">
                  <span
                    className={`inline-flex items-center gap-1 px-2.5 py-0.5 rounded-full text-[11px] font-semibold uppercase tracking-wider ${
                      finding.severity === 'critical'
                        ? 'bg-red-50 text-red-800 border border-red-200'
                        : finding.severity === 'warning'
                        ? 'bg-amber-50 text-amber-800 border border-amber-200'
                        : 'bg-emerald-50 text-emerald-800 border border-emerald-200'
                    }`}
                  >
                    {finding.severity === 'critical' && <AlertCircle className="w-3.5 h-3.5" />}
                    {finding.severity === 'warning' && <AlertTriangle className="w-3.5 h-3.5" />}
                    {finding.severity === 'good' && <CheckCircle2 className="w-3.5 h-3.5" />}
                    <span>{finding.severity}</span>
                  </span>

                  <span className="text-xs bg-[#E5E7EB] text-neutral-700 px-2 py-0.5 rounded-full font-mono capitalize">
                    {finding.category.replace(/_/g, ' ')}
                  </span>
                </div>

                <div className="text-[11px] text-neutral-500 font-mono">
                  {new Date(finding.created_at).toLocaleString()}
                </div>
              </div>

              <div className="space-y-2">
                <h3 className="text-sm font-bold text-[#0B0B0D]">{finding.title}</h3>
                <p className="text-xs text-neutral-600 leading-relaxed">{finding.description}</p>

                <div className="p-3 bg-neutral-50 rounded-xl border border-[#D9DBDE]/70 space-y-1">
                  <div className="text-[10px] uppercase tracking-wider font-semibold text-neutral-500">
                    Empirical Evidence
                  </div>
                  <div className="text-xs font-mono text-neutral-900">{finding.measured_evidence}</div>
                </div>

                {finding.recommendation && (
                  <div className="text-xs text-neutral-700 pt-1">
                    <strong className="text-neutral-900">Recommendation:</strong> {finding.recommendation}
                  </div>
                )}
              </div>

              <div className="mt-4 pt-3 border-t border-neutral-100 flex items-center justify-between text-xs text-neutral-500">
                <div className="flex items-center gap-1.5">
                  <FileText className="w-3.5 h-3.5 text-neutral-400" />
                  <span>Report: {finding.report_title}</span>
                </div>
                <Link
                  to="/diagnostics"
                  className="flex items-center gap-1 text-[#BE6B37] hover:text-[#A85B2D] font-medium transition-colors"
                >
                  <span>Open Audit</span>
                  <ExternalLink className="w-3 h-3" />
                </Link>
              </div>
            </div>
          ))}
        </div>
      )}
    </div>
  );
};
