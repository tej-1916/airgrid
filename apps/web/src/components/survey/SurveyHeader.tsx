import React from 'react';
import {
  Plus,
  CheckCircle2,
  History,
  Flame,
  User as UserIcon,
  RefreshCw,
  Clock,
  Ruler,
  AlertTriangle,
  Layers,
} from 'lucide-react';
import { SurveySession } from '../../types/survey';
import { FloorPlanAsset } from '../../types/campus';

interface SurveyHeaderProps {
  campusName?: string;
  buildingName?: string;
  floorName?: string;
  floorPlan?: FloorPlanAsset | null;
  activeSession: SurveySession | null;
  onNewSurvey: () => void;
  onCompleteSurvey: () => void;
  onOpenHistory: () => void;
  onGenerateHeatmap: () => void;
  onOpenSetup?: () => void;
  onOpenCalibrate?: () => void;
  canMutate: boolean;
  generatingHeatmap: boolean;
  isHeatmapAvailable?: boolean;
}

export const SurveyHeader: React.FC<SurveyHeaderProps> = ({
  campusName,
  buildingName,
  floorName,
  floorPlan,
  activeSession,
  onNewSurvey,
  onCompleteSurvey,
  onOpenHistory,
  onGenerateHeatmap,
  onOpenSetup,
  onOpenCalibrate,
  canMutate,
  generatingHeatmap,
  isHeatmapAvailable = false,
}) => {
  const isCompleted = activeSession?.status === 'completed';
  const measurementCount = activeSession?.measurement_count || 0;
  const hasMeasurements = measurementCount >= 3;

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
              MILESTONE 3B
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
          {canMutate && onOpenSetup && (
            <button
              onClick={onOpenSetup}
              className="py-1.5 px-3 rounded-lg border border-[#D9DBDE] bg-white text-xs font-semibold text-[#0B0B0D] hover:bg-[#F5F5F3] flex items-center gap-1.5 transition-colors shadow-xs active:scale-[0.98]"
              title="Upload blueprint file or generate dimensioned outline"
            >
              <Layers className="w-3.5 h-3.5 text-[#BE6B37]" />
              <span>{floorPlan ? 'Plan Setup' : 'Add Floor Plan'}</span>
            </button>
          )}

          {canMutate && floorPlan && onOpenCalibrate && (
            <button
              onClick={onOpenCalibrate}
              className={`py-1.5 px-3 rounded-lg border text-xs font-semibold flex items-center gap-1.5 transition-colors shadow-xs active:scale-[0.98] ${
                floorPlan.is_calibrated
                  ? 'border-[#D9DBDE] bg-white text-[#0B0B0D] hover:bg-[#F5F5F3]'
                  : 'border-amber-300 bg-amber-50 text-amber-900 hover:bg-amber-100'
              }`}
              title="Calibrate physical distance scale in meters"
            >
              <Ruler className="w-3.5 h-3.5 text-[#BE6B37]" />
              <span>{floorPlan.is_calibrated ? 'Calibrate Scale' : 'Needs Calibration'}</span>
            </button>
          )}

          {canMutate && (
            <button
              onClick={onNewSurvey}
              className="py-1.5 px-3 rounded-lg bg-[#BE6B37] text-white text-xs font-semibold hover:bg-[#9A5226] flex items-center gap-1.5 transition-colors shadow-xs active:scale-[0.98]"
            >
              <Plus className="w-3.5 h-3.5" />
              <span>New Survey</span>
            </button>
          )}

          {canMutate && activeSession && !isCompleted && (
            <button
              onClick={onCompleteSurvey}
              className="py-1.5 px-3 rounded-lg border border-emerald-300 bg-emerald-50 text-emerald-800 text-xs font-semibold hover:bg-emerald-100 flex items-center gap-1.5 transition-colors active:scale-[0.98]"
              title="Mark active survey session as complete"
            >
              <CheckCircle2 className="w-3.5 h-3.5 text-emerald-600" />
              <span>Complete Survey</span>
            </button>
          )}

          <button
            onClick={onGenerateHeatmap}
            disabled={generatingHeatmap || !hasMeasurements}
            className={`py-1.5 px-3 rounded-lg text-xs font-semibold flex items-center gap-1.5 transition-colors border shadow-xs active:scale-[0.98] ${
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
            className="py-1.5 px-3 rounded-lg border border-[#D9DBDE] bg-white text-xs font-semibold text-[#0B0B0D] hover:bg-[#F5F5F3] flex items-center gap-1.5 transition-colors active:scale-[0.98]"
          >
            <History className="w-3.5 h-3.5 text-[#737373]" />
            <span>Survey History</span>
          </button>
        </div>
      </div>

      {/* Survey Workflow Progress Stepper */}
      <div className="grid grid-cols-2 md:grid-cols-4 gap-2 pt-1 text-[11px]">
        {/* Step 1: Floor Plan */}
        <div
          onClick={() => {
            if (canMutate) {
              if (!floorPlan && onOpenSetup) onOpenSetup();
              else if (onOpenCalibrate) onOpenCalibrate();
            }
          }}
          className={`p-2 rounded-lg border flex items-center gap-2 transition-colors ${
            canMutate ? 'cursor-pointer hover:bg-slate-50' : ''
          } ${
            !floorPlan
              ? 'bg-rose-50/70 border-rose-200 text-rose-800'
              : floorPlan.is_calibrated
              ? 'bg-emerald-50/70 border-emerald-200 text-emerald-800'
              : 'bg-amber-50/70 border-amber-200 text-amber-800'
          }`}
        >
          {floorPlan?.is_calibrated ? (
            <CheckCircle2 className="w-3.5 h-3.5 text-emerald-600 shrink-0" />
          ) : !floorPlan ? (
            <AlertTriangle className="w-3.5 h-3.5 text-rose-600 shrink-0" />
          ) : (
            <Ruler className="w-3.5 h-3.5 text-amber-600 shrink-0" />
          )}
          <div className="truncate">
            <span className="font-bold block leading-tight">1. Floor Plan</span>
            <span className="text-[10px] text-slate-600 truncate block">
              {!floorPlan
                ? 'Missing (Click to add)'
                : floorPlan.is_calibrated
                ? `Calibrated (${floorPlan.scale_pixels_per_meter.toFixed(1)} px/m)`
                : 'Needs calibration'}
            </span>
          </div>
        </div>

        {/* Step 2: Session */}
        <div
          onClick={() => {
            if (canMutate && !activeSession) onNewSurvey();
          }}
          className={`p-2 rounded-lg border flex items-center gap-2 transition-colors ${
            canMutate && !activeSession ? 'cursor-pointer hover:bg-slate-50' : ''
          } ${
            !activeSession
              ? 'bg-slate-50 border-slate-200 text-[#737373]'
              : isCompleted
              ? 'bg-emerald-50/70 border-emerald-200 text-emerald-800'
              : 'bg-[#BE6B37]/10 border-[#BE6B37]/30 text-[#BE6B37]'
          }`}
        >
          {activeSession ? (
            <CheckCircle2 className="w-3.5 h-3.5 text-[#BE6B37] shrink-0" />
          ) : (
            <Clock className="w-3.5 h-3.5 text-slate-400 shrink-0" />
          )}
          <div className="truncate">
            <span className="font-bold block leading-tight">2. Survey Session</span>
            <span className="text-[10px] text-slate-600 truncate block">
              {!activeSession ? 'None (Click New)' : isCompleted ? 'Completed' : 'Active / Ready'}
            </span>
          </div>
        </div>

        {/* Step 3: Observations */}
        <div
          className={`p-2 rounded-lg border flex items-center gap-2 ${
            measurementCount === 0
              ? 'bg-slate-50 border-slate-200 text-[#737373]'
              : measurementCount < 3
              ? 'bg-amber-50/70 border-amber-200 text-amber-800'
              : measurementCount < 8
              ? 'bg-blue-50/70 border-blue-200 text-blue-800'
              : 'bg-emerald-50/70 border-emerald-200 text-emerald-800'
          }`}
        >
          <div className="w-3.5 h-3.5 rounded-full flex items-center justify-center font-bold text-[9px] bg-current text-white shrink-0">
            {measurementCount}
          </div>
          <div className="truncate">
            <span className="font-bold block leading-tight">3. Measurements</span>
            <span className="text-[10px] text-slate-600 truncate block">
              {measurementCount === 0
                ? 'Click canvas to add'
                : measurementCount < 3
                ? `${measurementCount}/3 min for IDW`
                : measurementCount < 8
                ? `${measurementCount} points (Sparse)`
                : `${measurementCount} points (Sound)`}
            </span>
          </div>
        </div>

        {/* Step 4: Coverage & Accuracy */}
        <div
          className={`p-2 rounded-lg border flex items-center gap-2 ${
            !isHeatmapAvailable
              ? 'bg-slate-50 border-slate-200 text-[#737373]'
              : 'bg-emerald-50/70 border-emerald-200 text-emerald-800'
          }`}
        >
          {isHeatmapAvailable ? (
            <CheckCircle2 className="w-3.5 h-3.5 text-emerald-600 shrink-0" />
          ) : (
            <Flame className="w-3.5 h-3.5 text-slate-400 shrink-0" />
          )}
          <div className="truncate">
            <span className="font-bold block leading-tight">4. Heatmap & LOOCV</span>
            <span className="text-[10px] text-slate-600 truncate block">
              {isHeatmapAvailable ? 'Generated & Masked' : hasMeasurements ? 'Ready to calculate' : 'Awaiting points'}
            </span>
          </div>
        </div>
      </div>

      {/* Active Survey Session Metadata Strip */}
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
