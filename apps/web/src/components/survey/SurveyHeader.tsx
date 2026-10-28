import React from 'react';
import {
  Plus,
  CheckCircle2,
  History,
  Flame,
  User as UserIcon,
  RefreshCw,
  Clock,
} from 'lucide-react';
import { SurveySession } from '../../types/survey';

interface SurveyHeaderProps {
  campusName?: string;
  buildingName?: string;
  floorName?: string;
  activeSession: SurveySession | null;
  onNewSurvey: () => void;
  onCompleteSurvey: () => void;
  onOpenHistory: () => void;
  onGenerateHeatmap: () => void;
  canMutate: boolean;
  generatingHeatmap: boolean;
  isHeatmapAvailable?: boolean;
}

export const SurveyHeader: React.FC<SurveyHeaderProps> = ({
  campusName,
  buildingName,
  floorName,
  activeSession,
  onNewSurvey,
  onCompleteSurvey,
  onOpenHistory,
  onGenerateHeatmap,
  canMutate,
  generatingHeatmap,
}) => {
  const isCompleted = activeSession?.status === 'completed';
  const hasMeasurements = (activeSession?.measurement_count || 0) >= 3;

  return (
    <div className="rounded-xl border border-[#D9DBDE] bg-white p-4 shadow-xs space-y-3">
      {/* Top Row: Title, Facility Context & Main Actions */}
      <div className="flex flex-col md:flex-row md:items-center justify-between gap-3">
        <div>
          <div className="flex items-center gap-2">
            <h1 className="text-lg font-bold text-[#0B0B0D] tracking-tight">
              Wi-Fi Survey Studio
            </h1>
            <span className="px-2 py-0.5 rounded-full text-[10px] font-bold font-mono bg-[#BE6B37]/10 text-[#BE6B37] border border-[#BE6B37]/20">
              PHASE 04
            </span>
          </div>
          <p className="text-xs text-[#737373] mt-0.5 flex items-center gap-1.5 flex-wrap">
            <span className="font-semibold text-[#0B0B0D]">{campusName || 'No Campus Selected'}</span>
            <span>›</span>
            <span>{buildingName || 'No Building'}</span>
            <span>›</span>
            <span className="text-[#BE6B37] font-semibold">{floorName || 'No Floor'}</span>
          </p>
        </div>

        {/* Action Controls */}
        <div className="flex items-center gap-2 flex-wrap">
          {canMutate && (
            <button
              onClick={onNewSurvey}
              className="py-1.5 px-3 rounded-lg bg-[#BE6B37] text-white text-xs font-semibold hover:bg-[#9A5226] flex items-center gap-1.5 transition-colors shadow-xs"
            >
              <Plus className="w-3.5 h-3.5" />
              <span>New Survey</span>
            </button>
          )}

          {canMutate && activeSession && !isCompleted && (
            <button
              onClick={onCompleteSurvey}
              className="py-1.5 px-3 rounded-lg border border-emerald-300 bg-emerald-50 text-emerald-800 text-xs font-semibold hover:bg-emerald-100 flex items-center gap-1.5 transition-colors"
              title="Mark active survey session as complete"
            >
              <CheckCircle2 className="w-3.5 h-3.5 text-emerald-600" />
              <span>Complete Survey</span>
            </button>
          )}

          <button
            onClick={onGenerateHeatmap}
            disabled={generatingHeatmap || !hasMeasurements}
            className={`py-1.5 px-3 rounded-lg text-xs font-semibold flex items-center gap-1.5 transition-colors border shadow-xs ${
              hasMeasurements
                ? 'bg-white border-[#BE6B37] text-[#BE6B37] hover:bg-[#BE6B37]/5'
                : 'bg-[#F5F5F3] border-[#D9DBDE] text-[#737373] cursor-not-allowed opacity-60'
            }`}
            title={
              hasMeasurements
                ? 'Generate IDW estimated RF coverage heatmap'
                : 'At least 3 non-collinear survey observations required'
            }
          >
            {generatingHeatmap ? (
              <RefreshCw className="w-3.5 h-3.5 animate-spin text-[#BE6B37]" />
            ) : (
              <Flame className="w-3.5 h-3.5 text-[#BE6B37]" />
            )}
            <span>{generatingHeatmap ? 'Interpolating...' : 'Generate Heatmap'}</span>
          </button>

          <button
            onClick={onOpenHistory}
            className="py-1.5 px-3 rounded-lg border border-[#D9DBDE] bg-white text-xs font-semibold text-[#0B0B0D] hover:bg-[#F5F5F3] flex items-center gap-1.5 transition-colors"
          >
            <History className="w-3.5 h-3.5 text-[#737373]" />
            <span>Survey History</span>
          </button>
        </div>
      </div>

      {/* Bottom Row: Active Survey Session Metadata Strip */}
      {activeSession ? (
        <div className="flex items-center justify-between p-2.5 rounded-lg bg-[#F5F5F3] border border-[#D9DBDE] text-xs flex-wrap gap-2">
          <div className="flex items-center gap-2">
            <span className="font-semibold text-[#0B0B0D] flex items-center gap-1.5">
              <span className="w-2 h-2 rounded-full bg-[#BE6B37]" />
              {activeSession.session_name}
            </span>
            <span
              className={`px-2 py-0.5 rounded-full text-[10px] font-bold uppercase tracking-wider ${
                activeSession.status === 'completed'
                  ? 'bg-emerald-100 text-emerald-800 border border-emerald-200'
                  : 'bg-amber-100 text-amber-800 border border-amber-200'
              }`}
            >
              {activeSession.status === 'completed' ? 'Completed' : 'In Progress'}
            </span>
            <span className="text-[#737373] text-[11px]">
              • {activeSession.measurement_count} measured point{activeSession.measurement_count === 1 ? '' : 's'}
            </span>
          </div>

          <div className="flex items-center gap-4 text-[#737373] text-[11px]">
            {activeSession.operator_name && (
              <span className="flex items-center gap-1">
                <UserIcon className="w-3.5 h-3.5 text-[#737373]" />
                <span>{activeSession.operator_name}</span>
              </span>
            )}
            <span className="flex items-center gap-1">
              <Clock className="w-3.5 h-3.5 text-[#737373]" />
              <span>
                {new Date(activeSession.updated_at || activeSession.created_at).toLocaleDateString([], {
                  month: 'short',
                  day: 'numeric',
                  hour: '2-digit',
                  minute: '2-digit',
                })}
              </span>
            </span>
          </div>
        </div>
      ) : (
        <div className="p-2.5 rounded-lg bg-[#F5F5F3] border border-dashed border-[#D9DBDE] text-xs text-[#737373] flex items-center justify-between">
          <span>No active survey session selected. Click &quot;New Survey&quot; to begin measuring.</span>
          {canMutate && (
            <button
              onClick={onNewSurvey}
              className="text-[#BE6B37] font-semibold hover:underline text-xs"
            >
              + Create Session
            </button>
          )}
        </div>
      )}
    </div>
  );
};
