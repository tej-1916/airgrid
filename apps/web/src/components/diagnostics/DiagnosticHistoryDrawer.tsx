import React from 'react';
import {
  X,
  History,
  Trash2,
  ChevronRight,
  Calendar,
} from 'lucide-react';
import { DiagnosticReport } from '../../types/diagnostics';

interface DiagnosticHistoryDrawerProps {
  isOpen: boolean;
  onClose: () => void;
  reports: DiagnosticReport[];
  loading: boolean;
  onSelectReport: (report: DiagnosticReport) => void;
  onDeleteReport: (reportId: string) => Promise<void>;
  canDelete: boolean;
}

export const DiagnosticHistoryDrawer: React.FC<DiagnosticHistoryDrawerProps> = ({
  isOpen,
  onClose,
  reports,
  loading,
  onSelectReport,
  onDeleteReport,
  canDelete,
}) => {
  if (!isOpen) return null;

  return (
    <div className="fixed inset-0 z-50 flex items-center justify-end bg-black/40 backdrop-blur-xs animate-fade-in">
      <div className="bg-white h-full max-w-md w-full shadow-2xl border-l border-[#D9DBDE] flex flex-col">
        {/* Header */}
        <div className="flex items-center justify-between p-5 border-b border-[#D9DBDE] bg-[#F5F5F3]">
          <div className="flex items-center gap-2.5">
            <div className="w-9 h-9 rounded-xl bg-[#BE6B37]/10 border border-[#BE6B37]/20 flex items-center justify-center text-[#BE6B37]">
              <History className="w-5 h-5" />
            </div>
            <div>
              <h3 className="text-sm font-bold text-[#0B0B0D]">Diagnostic Audit History</h3>
              <p className="text-[11px] text-[#737373]">{reports.length} historical diagnostic records</p>
            </div>
          </div>
          <button
            onClick={onClose}
            className="p-1.5 rounded-lg text-[#737373] hover:text-[#0B0B0D] hover:bg-slate-200/60 transition-colors"
          >
            <X className="w-5 h-5" />
          </button>
        </div>

        {/* List Body */}
        <div className="flex-1 overflow-y-auto p-4 space-y-3">
          {loading ? (
            <div className="space-y-3 p-2 animate-pulse">
              {[1, 2, 3].map((i) => (
                <div key={i} className="h-20 bg-slate-100 rounded-xl"></div>
              ))}
            </div>
          ) : reports.length === 0 ? (
            <div className="text-center py-12 text-xs text-[#737373] space-y-2">
              <History className="w-8 h-8 mx-auto text-slate-300" />
              <p>No historical diagnostic runs found.</p>
            </div>
          ) : (
            reports.map((r) => {
              let scoreBadge = 'bg-emerald-50 text-emerald-700 border-emerald-200';
              if (r.overall_score < 70) {
                scoreBadge = 'bg-rose-50 text-rose-700 border-rose-200';
              } else if (r.overall_score < 85) {
                scoreBadge = 'bg-amber-50 text-amber-700 border-amber-200';
              }

              return (
                <div
                  key={r.id}
                  onClick={() => {
                    onSelectReport(r);
                    onClose();
                  }}
                  className="p-4 rounded-xl border border-[#D9DBDE] bg-white hover:border-[#BE6B37] hover:shadow-xs transition-all cursor-pointer space-y-2 group"
                >
                  <div className="flex items-center justify-between">
                    <div className="flex items-center gap-2">
                      <span className={`px-2 py-0.5 rounded-md text-[11px] font-bold border font-mono ${scoreBadge}`}>
                        {r.overall_score}/100
                      </span>
                      <h4 className="text-xs font-bold text-[#0B0B0D] group-hover:text-[#BE6B37] transition-colors truncate max-w-[180px]">
                        {r.title}
                      </h4>
                    </div>

                    {canDelete && (
                      <button
                        onClick={(e) => {
                          e.stopPropagation();
                          if (confirm('Delete this diagnostic report?')) {
                            onDeleteReport(r.id);
                          }
                        }}
                        className="p-1 rounded text-slate-400 hover:text-rose-600 transition-colors"
                        title="Delete report"
                      >
                        <Trash2 className="w-3.5 h-3.5" />
                      </button>
                    )}
                  </div>

                  <p className="text-[11px] text-[#737373] line-clamp-1">{r.summary_headline}</p>

                  <div className="flex items-center justify-between text-[10px] text-[#737373] pt-1 border-t border-[#D9DBDE]/60">
                    <span className="flex items-center gap-1 font-mono">
                      <Calendar className="w-3 h-3" />
                      {new Date(r.created_at).toLocaleDateString()} {new Date(r.created_at).toLocaleTimeString([], { hour: '2-digit', minute: '2-digit' })}
                    </span>
                    <span className="flex items-center gap-1 group-hover:text-[#BE6B37] font-medium">
                      <span>{r.findings_count} findings</span>
                      <ChevronRight className="w-3 h-3" />
                    </span>
                  </div>
                </div>
              );
            })
          )}
        </div>
      </div>
    </div>
  );
};
