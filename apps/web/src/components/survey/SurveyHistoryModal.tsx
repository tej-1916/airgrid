import React, { useState } from 'react';
import {
  X,
  History,
  Clock,
  User as UserIcon,
  GitCompare,
  ArrowRight,
  Layers,
  ChevronRight,
} from 'lucide-react';
import { SurveySession } from '../../types/survey';

interface SurveyHistoryModalProps {
  isOpen: boolean;
  onClose: () => void;
  sessions: SurveySession[];
  activeSessionId: string | null;
  onSelectSession: (session: SurveySession) => void;
  onCompare: (session1Id: string, session2Id: string) => void;
}

export const SurveyHistoryModal: React.FC<SurveyHistoryModalProps> = ({
  isOpen,
  onClose,
  sessions,
  activeSessionId,
  onSelectSession,
  onCompare,
}) => {
  const [selectedForCompare, setSelectedForCompare] = useState<string[]>([]);

  if (!isOpen) return null;

  const toggleCompare = (id: string) => {
    if (selectedForCompare.includes(id)) {
      setSelectedForCompare(selectedForCompare.filter((s) => s !== id));
    } else {
      if (selectedForCompare.length < 2) {
        setSelectedForCompare([...selectedForCompare, id]);
      } else {
        // Replace second selection
        setSelectedForCompare([selectedForCompare[0], id]);
      }
    }
  };

  const handleRunComparison = () => {
    if (selectedForCompare.length === 2) {
      onCompare(selectedForCompare[0], selectedForCompare[1]);
    }
  };

  return (
    <div className="fixed inset-0 z-50 flex items-center justify-center p-4 bg-black/50 backdrop-blur-xs">
      <div className="w-full max-w-2xl rounded-2xl bg-white border border-[#D9DBDE] shadow-2xl overflow-hidden flex flex-col max-h-[85vh]">
        {/* Modal Header */}
        <div className="p-4 px-6 border-b border-[#D9DBDE] flex items-center justify-between bg-white">
          <div className="flex items-center gap-2.5">
            <div className="w-8 h-8 rounded-xl bg-[#BE6B37]/10 flex items-center justify-center text-[#BE6B37]">
              <History className="w-4 h-4" />
            </div>
            <div>
              <h2 className="text-sm font-bold text-[#0B0B0D] tracking-tight">
                Floor Survey History
              </h2>
              <p className="text-xs text-[#737373]">
                {sessions.length} recorded survey session{sessions.length === 1 ? '' : 's'} on this floor
              </p>
            </div>
          </div>
          <button
            onClick={onClose}
            className="p-1.5 rounded-lg text-[#737373] hover:text-[#0B0B0D] hover:bg-[#F5F5F3]"
          >
            <X className="w-5 h-5" />
          </button>
        </div>

        {/* Comparison Action Bar (When 2 selected) */}
        {selectedForCompare.length > 0 && (
          <div className="p-3 px-6 bg-[#BE6B37]/5 border-b border-[#BE6B37]/20 flex items-center justify-between text-xs">
            <span className="font-semibold text-[#0B0B0D] flex items-center gap-1.5">
              <GitCompare className="w-4 h-4 text-[#BE6B37]" />
              <span>
                {selectedForCompare.length}/2 sessions selected for comparison
              </span>
            </span>

            <div className="flex items-center gap-2">
              <button
                onClick={() => setSelectedForCompare([])}
                className="text-xs text-[#737373] hover:underline"
              >
                Clear
              </button>
              <button
                onClick={handleRunComparison}
                disabled={selectedForCompare.length !== 2}
                className="py-1 px-3 rounded-lg bg-[#BE6B37] text-white text-xs font-semibold hover:bg-[#9A5226] disabled:opacity-40 disabled:cursor-not-allowed flex items-center gap-1"
              >
                <span>Compare Sessions</span>
                <ArrowRight className="w-3 h-3" />
              </button>
            </div>
          </div>
        )}

        {/* Sessions List */}
        <div className="flex-1 overflow-y-auto p-6 space-y-3">
          {sessions.length === 0 ? (
            <div className="p-8 text-center text-[#737373] space-y-2">
              <History className="w-8 h-8 mx-auto text-[#BE6B37]/60" />
              <p className="text-xs">No survey sessions recorded for this floor plan yet.</p>
            </div>
          ) : (
            sessions.map((sess) => {
              const isActive = sess.id === activeSessionId;
              const isChecked = selectedForCompare.includes(sess.id);

              return (
                <div
                  key={sess.id}
                  className={`p-3.5 rounded-xl border transition-all ${
                    isActive
                      ? 'border-[#BE6B37] bg-[#BE6B37]/5 shadow-xs'
                      : 'border-[#D9DBDE] bg-white hover:border-[#737373]'
                  }`}
                >
                  <div className="flex items-start justify-between gap-3">
                    <div className="space-y-1 min-w-0">
                      <div className="flex items-center gap-2">
                        <span className="text-xs font-bold text-[#0B0B0D] truncate">
                          {sess.session_name}
                        </span>
                        <span
                          className={`px-2 py-0.5 rounded-full text-[9px] font-bold uppercase tracking-wider ${
                            sess.status === 'completed'
                              ? 'bg-emerald-100 text-emerald-800'
                              : 'bg-amber-100 text-amber-800'
                          }`}
                        >
                          {sess.status === 'completed' ? 'Completed' : 'In Progress'}
                        </span>
                        {isActive && (
                          <span className="px-1.5 py-0.2 rounded text-[9px] font-mono bg-[#BE6B37] text-white font-bold">
                            ACTIVE
                          </span>
                        )}
                      </div>

                      {sess.description && (
                        <p className="text-xs text-[#737373] line-clamp-1">
                          {sess.description}
                        </p>
                      )}

                      <div className="flex items-center gap-3 text-[11px] text-[#737373] pt-0.5">
                        <span className="flex items-center gap-1 font-mono">
                          <Layers className="w-3 h-3" />
                          <span>{sess.measurement_count} samples</span>
                        </span>
                        {sess.operator_name && (
                          <span className="flex items-center gap-1">
                            <UserIcon className="w-3 h-3" />
                            <span>{sess.operator_name}</span>
                          </span>
                        )}
                        <span className="flex items-center gap-1">
                          <Clock className="w-3 h-3" />
                          <span>
                            {new Date(sess.created_at).toLocaleDateString([], {
                              month: 'short',
                              day: 'numeric',
                              year: 'numeric',
                              hour: '2-digit',
                              minute: '2-digit',
                            })}
                          </span>
                        </span>
                      </div>
                    </div>

                    {/* Action Controls per item */}
                    <div className="flex items-center gap-2 shrink-0">
                      <label
                        className="flex items-center gap-1.5 text-xs text-[#737373] cursor-pointer hover:text-[#0B0B0D]"
                        title="Select for comparison"
                      >
                        <input
                          type="checkbox"
                          checked={isChecked}
                          onChange={() => toggleCompare(sess.id)}
                          className="rounded border-[#D9DBDE] text-[#BE6B37] focus:ring-[#BE6B37]"
                        />
                        <span className="text-[11px]">Compare</span>
                      </label>

                      {!isActive && (
                        <button
                          onClick={() => {
                            onSelectSession(sess);
                            onClose();
                          }}
                          className="py-1 px-2.5 rounded-lg border border-[#D9DBDE] bg-white text-xs font-semibold text-[#0B0B0D] hover:bg-[#F5F5F3] flex items-center gap-1"
                        >
                          <span>Load</span>
                          <ChevronRight className="w-3 h-3" />
                        </button>
                      )}
                    </div>
                  </div>
                </div>
              );
            })
          )}
        </div>

        {/* Modal Footer */}
        <div className="p-3 px-6 bg-[#F5F5F3] border-t border-[#D9DBDE] flex items-center justify-between text-xs text-[#737373]">
          <span>Select two sessions to review signal deltas and coverage changes.</span>
          <button
            onClick={onClose}
            className="py-1.5 px-4 rounded-lg bg-white border border-[#D9DBDE] text-xs font-semibold text-[#0B0B0D] hover:bg-slate-50"
          >
            Close
          </button>
        </div>
      </div>
    </div>
  );
};
