import React, { useState } from 'react';
import {
  ShieldAlert,
  AlertOctagon,
  Info,
  CheckCircle2,
  Sparkles,
  ArrowRight,
  Filter,
} from 'lucide-react';
import { DiagnosticReport } from '../../types/diagnostics';

interface DiagnosticFindingsPanelProps {
  report: DiagnosticReport | null;
  loading: boolean;
  onRunAnalysis: () => void;
  canRun: boolean;
}

export const DiagnosticFindingsPanel: React.FC<DiagnosticFindingsPanelProps> = ({
  report,
  loading,
  onRunAnalysis,
  canRun,
}) => {
  const [filterSeverity, setFilterSeverity] = useState<string>('all');

  if (loading) {
    return (
      <div className="bg-white rounded-2xl border border-[#D9DBDE] p-6 shadow-sm animate-pulse space-y-4">
        <div className="h-6 w-48 bg-slate-200 rounded"></div>
        <div className="h-20 bg-slate-100 rounded-xl"></div>
        <div className="space-y-3">
          {[1, 2, 3].map((i) => (
            <div key={i} className="h-28 bg-slate-50 rounded-xl"></div>
          ))}
        </div>
      </div>
    );
  }

  if (!report) {
    return (
      <div className="bg-white rounded-2xl border border-[#D9DBDE] p-8 shadow-sm text-center space-y-4">
        <div className="w-14 h-14 rounded-2xl bg-[#F5F5F3] border border-[#D9DBDE] flex items-center justify-center mx-auto text-[#BE6B37]">
          <Sparkles className="w-7 h-7" />
        </div>
        <div className="max-w-md mx-auto space-y-1.5">
          <h3 className="text-base font-bold text-[#0B0B0D]">Deterministic Diagnostic Engine Ready</h3>
          <p className="text-xs text-[#737373]">
            Press <strong>Analyze Results</strong> to evaluate real recorded telemetry using documented heuristic thresholds and receive evidence-linked next checks. A single sample cannot establish a fault or its cause.
          </p>
        </div>
        <button
          onClick={onRunAnalysis}
          disabled={!canRun}
          className="inline-flex items-center gap-2 px-5 py-2.5 rounded-xl bg-[#BE6B37] hover:bg-[#A3592A] disabled:opacity-50 text-white text-xs font-semibold shadow-sm transition-all"
        >
          <Sparkles className="w-4 h-4" />
          <span>Analyze Results</span>
        </button>
      </div>
    );
  }

  const { overall_score, summary_headline, findings, critical_count, warning_count, good_count } = report;

  let scoreColor = 'text-emerald-700 bg-emerald-50 border-emerald-300';
  let scoreLabel = 'Network Healthy';
  if (overall_score < 70) {
    scoreColor = 'text-rose-700 bg-rose-50 border-rose-300';
    scoreLabel = 'Critical Attention Required';
  } else if (overall_score < 85) {
    scoreColor = 'text-amber-700 bg-amber-50 border-amber-300';
    scoreLabel = 'Sub-Optimal Network';
  }

  const filteredFindings = findings.filter((f) => {
    if (filterSeverity === 'all') return true;
    return f.severity === filterSeverity;
  });

  return (
    <div className="bg-white rounded-2xl border border-[#D9DBDE] p-6 shadow-sm space-y-6">
      {/* Top Banner: Score & Headline */}
      <div className="flex flex-col md:flex-row md:items-center justify-between gap-4 p-4 sm:p-5 rounded-2xl bg-[#F5F5F3] border border-[#D9DBDE]">
        <div className="flex flex-col sm:flex-row sm:items-center gap-4">
          <div className={`px-4 py-3 rounded-2xl border flex flex-col items-center justify-center self-start sm:self-auto ${scoreColor}`}>
            <span className="text-2xl font-bold font-mono">{overall_score}</span>
            <span className="text-[10px] font-semibold uppercase tracking-wider">Score</span>
          </div>
          <div className="space-y-1">
            <div className="flex flex-wrap items-center gap-2">
              <span className={`text-xs font-bold px-2 py-0.5 rounded-md border ${scoreColor}`}>
                {scoreLabel}
              </span>
              <span className="text-xs text-[#737373]">•</span>
              <span className="text-xs font-semibold text-[#0B0B0D]">{report.title}</span>
            </div>
            <p className="text-xs text-[#0B0B0D] font-medium leading-relaxed">{summary_headline}</p>
          </div>
        </div>

        {/* Re-Analyze Button */}
        <button
          onClick={onRunAnalysis}
          disabled={!canRun}
          className="self-start md:self-auto inline-flex items-center gap-2 px-4 py-2 rounded-xl bg-[#BE6B37] hover:bg-[#A3592A] disabled:opacity-50 text-white text-xs font-semibold shadow-sm transition-all"
        >
          <Sparkles className="w-3.5 h-3.5" />
          <span>Re-Analyze</span>
        </button>
      </div>

      {/* Filter Tabs & Counters */}
      <div className="flex flex-col sm:flex-row sm:items-center justify-between gap-3 border-b border-[#D9DBDE] pb-3">
        <div className="flex flex-wrap items-center gap-1.5 text-xs">
          <Filter className="w-3.5 h-3.5 text-[#737373] mr-1" />
          <button
            onClick={() => setFilterSeverity('all')}
            className={`px-3 py-1.5 rounded-lg font-medium transition-colors ${
              filterSeverity === 'all'
                ? 'bg-[#0B0B0D] text-white'
                : 'bg-[#F5F5F3] text-[#737373] hover:text-[#0B0B0D]'
            }`}
          >
            All ({findings.length})
          </button>
          <button
            onClick={() => setFilterSeverity('critical')}
            className={`px-3 py-1.5 rounded-lg font-medium transition-colors ${
              filterSeverity === 'critical'
                ? 'bg-rose-600 text-white'
                : 'bg-rose-50 text-rose-800 border border-rose-200'
            }`}
          >
            Critical ({critical_count})
          </button>
          <button
            onClick={() => setFilterSeverity('warning')}
            className={`px-3 py-1.5 rounded-lg font-medium transition-colors ${
              filterSeverity === 'warning'
                ? 'bg-amber-600 text-white'
                : 'bg-amber-50 text-amber-800 border border-amber-200'
            }`}
          >
            Warning ({warning_count})
          </button>
          <button
            onClick={() => setFilterSeverity('good')}
            className={`px-3 py-1.5 rounded-lg font-medium transition-colors ${
              filterSeverity === 'good'
                ? 'bg-emerald-600 text-white'
                : 'bg-emerald-50 text-emerald-800 border border-emerald-200'
            }`}
          >
            Good ({good_count})
          </button>
        </div>

        <span className="text-[11px] text-[#737373]">
          Showing {filteredFindings.length} of {findings.length} findings
        </span>
      </div>

      {/* Finding Cards List */}
      <div className="space-y-4">
        {filteredFindings.map((finding, idx) => {
          let sevBg = 'bg-emerald-50 text-emerald-800 border-emerald-200';
          let SevIcon = CheckCircle2;
          if (finding.severity === 'critical') {
            sevBg = 'bg-rose-50 text-rose-800 border-rose-200';
            SevIcon = AlertOctagon;
          } else if (finding.severity === 'warning') {
            sevBg = 'bg-amber-50 text-amber-800 border-amber-200';
            SevIcon = ShieldAlert;
          } else if (finding.severity === 'info') {
            sevBg = 'bg-slate-50 text-slate-800 border-slate-200';
            SevIcon = Info;
          }

          return (
            <div
              key={idx}
              className="p-5 rounded-2xl border border-[#D9DBDE] bg-white hover:border-[#BE6B37]/40 transition-all space-y-3"
            >
              {/* Finding Title & Badges */}
              <div className="flex flex-col sm:flex-row sm:items-center justify-between gap-2">
                <div className="flex items-center gap-2.5">
                  <span className={`inline-flex items-center gap-1 px-2.5 py-0.5 rounded-full text-[11px] font-bold uppercase border ${sevBg}`}>
                    <SevIcon className="w-3.5 h-3.5" />
                    {finding.severity}
                  </span>
                  <h4 className="text-sm font-bold text-[#0B0B0D]">{finding.title}</h4>
                </div>
                <span className="text-[10px] font-mono text-[#737373] bg-[#F5F5F3] px-2 py-0.5 rounded border border-[#D9DBDE] self-start sm:self-auto">
                  {(finding.category || 'general').replace(/_/g, ' ').toUpperCase()}
                </span>
              </div>

              {/* Description */}
              <p className="text-xs text-[#737373] leading-relaxed">{finding.description}</p>

              {/* Measured Evidence Box */}
              <div className="p-3 rounded-xl bg-[#F5F5F3] border border-[#D9DBDE] space-y-1">
                <div className="text-[10px] font-semibold uppercase tracking-wider text-[#737373]">
                  Empirical Evidence:
                </div>
                <div className="text-xs font-mono text-[#0B0B0D] break-words">
                  {finding.measured_evidence}
                </div>
              </div>

              {/* Recommendation Box */}
              <div className="p-3 rounded-xl bg-[#BE6B37]/5 border border-[#BE6B37]/20 flex items-start gap-2.5">
                <ArrowRight className="w-4 h-4 text-[#BE6B37] flex-shrink-0 mt-0.5" />
                <div className="text-xs leading-relaxed text-[#0B0B0D] break-words">
                  <strong className="text-[#BE6B37]">Actionable Recommendation:</strong>{' '}
                  {finding.recommendation}
                </div>
              </div>
            </div>
          );
        })}
      </div>
    </div>
  );
};
