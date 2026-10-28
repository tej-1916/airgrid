import React from 'react';
import {
  Trophy,
  BarChart2,
  Trash2,
  Eye,
  Layers,
} from 'lucide-react';
import { MLModel } from '../../types/ml';

interface ModelRegistryTableProps {
  models: MLModel[];
  activeModelId: string | null;
  onSelectModel: (model: MLModel) => void;
  onOpenComparison: (model: MLModel) => void;
  onSetChampion: (modelId: string) => Promise<void>;
  onDeleteModel: (modelId: string) => Promise<void>;
  canManage: boolean;
  loading: boolean;
}

export const ModelRegistryTable: React.FC<ModelRegistryTableProps> = ({
  models,
  activeModelId,
  onSelectModel,
  onOpenComparison,
  onSetChampion,
  onDeleteModel,
  canManage,
  loading,
}) => {
  if (loading) {
    return (
      <div className="bg-white rounded-2xl border border-[#D9DBDE] p-6 shadow-sm animate-pulse space-y-3">
        <div className="h-5 w-48 bg-slate-200 rounded"></div>
        <div className="h-32 bg-slate-100 rounded-xl"></div>
      </div>
    );
  }

  if (models.length === 0) {
    return (
      <div className="bg-white rounded-2xl border border-[#D9DBDE] p-8 text-center shadow-sm space-y-3">
        <div className="w-12 h-12 rounded-2xl bg-[#F5F5F3] border border-[#D9DBDE] flex items-center justify-center mx-auto text-[#737373]">
          <Layers className="w-6 h-6" />
        </div>
        <h4 className="text-sm font-bold text-[#0B0B0D]">No Models Trained Yet</h4>
        <p className="text-xs text-[#737373] max-w-md mx-auto">
          Fulfill dataset readiness requirements and train your first spatial path-loss regression model.
          Model evaluations, baselines, and artifacts will be tracked here.
        </p>
      </div>
    );
  }

  const formatDate = (isoString: string) => {
    try {
      return new Date(isoString).toLocaleDateString('en-US', {
        month: 'short',
        day: 'numeric',
        hour: '2-digit',
        minute: '2-digit',
      });
    } catch {
      return isoString;
    }
  };

  return (
    <div className="bg-white rounded-2xl border border-[#D9DBDE] p-6 shadow-sm space-y-4">
      <div className="flex items-center justify-between">
        <div>
          <h3 className="text-sm font-bold text-[#0B0B0D] flex items-center gap-2">
            <Trophy className="w-4 h-4 text-[#BE6B37]" />
            Model Registry & Spatial Benchmark History
          </h3>
          <p className="text-xs text-[#737373] mt-0.5">
            Compare validated regression models, designate champions, and inspect spatial prediction overlays
          </p>
        </div>
        <span className="text-xs font-mono text-[#737373]">{models.length} model(s) registered</span>
      </div>

      <div className="overflow-x-auto rounded-xl border border-[#D9DBDE]">
        <table className="w-full text-left text-xs">
          <thead className="bg-[#F5F5F3] border-b border-[#D9DBDE] text-[#0B0B0D] font-semibold">
            <tr>
              <th className="py-2.5 px-3">Model / Algorithm</th>
              <th className="py-2.5 px-3">Network</th>
              <th className="py-2.5 px-3 font-mono">RMSE (dBm)</th>
              <th className="py-2.5 px-3 font-mono">MAE (dBm)</th>
              <th className="py-2.5 px-3 font-mono">R² Score</th>
              <th className="py-2.5 px-3">Status / Champion</th>
              <th className="py-2.5 px-3">Trained At</th>
              <th className="py-2.5 px-3 text-right">Actions</th>
            </tr>
          </thead>
          <tbody className="divide-y divide-[#D9DBDE] bg-white">
            {models.map((m) => {
              const isSelected = m.id === activeModelId;
              return (
                <tr
                  key={m.id}
                  className={`transition-colors ${
                    isSelected ? 'bg-amber-50/50' : 'hover:bg-slate-50/70'
                  }`}
                >
                  <td className="py-3 px-3">
                    <div className="font-semibold text-[#0B0B0D]">{m.model_name}</div>
                    <div className="text-[10px] font-mono text-[#737373]">
                      {m.algorithm} • {m.model_version}
                    </div>
                  </td>

                  <td className="py-3 px-3">
                    <span className="px-2 py-0.5 rounded-full text-[10px] font-mono bg-slate-100 text-slate-800 border border-slate-200">
                      {m.network_label || 'All Networks'}
                    </span>
                  </td>

                  <td className="py-3 px-3 font-mono font-bold text-[#0B0B0D]">
                    {m.rmse_db !== null && m.rmse_db !== undefined ? `${m.rmse_db} dBm` : '—'}
                  </td>

                  <td className="py-3 px-3 font-mono text-[#737373]">
                    {m.mae_db !== null && m.mae_db !== undefined ? `${m.mae_db} dBm` : '—'}
                  </td>

                  <td className="py-3 px-3 font-mono text-[#737373]">
                    {m.r2_score !== null && m.r2_score !== undefined ? m.r2_score.toFixed(3) : '—'}
                  </td>

                  <td className="py-3 px-3">
                    {m.is_current_champion ? (
                      <span className="inline-flex items-center gap-1 px-2.5 py-0.5 rounded-full text-[10px] font-bold bg-amber-100 text-amber-900 border border-amber-300">
                        <Trophy className="w-3 h-3 text-amber-600 fill-current" /> Active Champion
                      </span>
                    ) : (
                      <span className="inline-flex items-center gap-1 px-2 py-0.5 rounded-full text-[10px] font-medium bg-slate-100 text-slate-600">
                        Candidate
                      </span>
                    )}
                  </td>

                  <td className="py-3 px-3 text-[#737373] text-[11px] whitespace-nowrap">
                    {formatDate(m.created_at)}
                  </td>

                  <td className="py-3 px-3 text-right">
                    <div className="inline-flex items-center gap-1.5 justify-end">
                      {/* View Prediction Overlay */}
                      <button
                        onClick={() => onSelectModel(m)}
                        title="View ML Prediction Overlay"
                        className={`p-1.5 rounded-lg border text-xs flex items-center gap-1 transition-all ${
                          isSelected
                            ? 'bg-[#BE6B37] text-white border-[#BE6B37]'
                            : 'bg-white hover:bg-slate-100 text-[#0B0B0D] border-[#D9DBDE]'
                        }`}
                      >
                        <Eye className="w-3.5 h-3.5" />
                        <span className="hidden sm:inline">Overlay</span>
                      </button>

                      {/* View Detailed Comparison */}
                      <button
                        onClick={() => onOpenComparison(m)}
                        title="Detailed Baseline Comparison"
                        className="p-1.5 rounded-lg border border-[#D9DBDE] bg-white hover:bg-slate-100 text-[#0B0B0D] text-xs flex items-center gap-1"
                      >
                        <BarChart2 className="w-3.5 h-3.5 text-[#BE6B37]" />
                        <span className="hidden sm:inline">Metrics</span>
                      </button>

                      {/* Promote Champion */}
                      {canManage && !m.is_current_champion && (
                        <button
                          onClick={() => onSetChampion(m.id)}
                          title="Promote to Champion"
                          className="p-1.5 rounded-lg border border-amber-300 bg-amber-50 hover:bg-amber-100 text-amber-800 text-xs flex items-center gap-1"
                        >
                          <Trophy className="w-3.5 h-3.5 text-amber-600" />
                          <span className="hidden sm:inline">Champion</span>
                        </button>
                      )}

                      {/* Delete */}
                      {canManage && (
                        <button
                          onClick={() => {
                            if (window.confirm(`Delete model ${m.model_name}? This will remove its serialized artifact.`)) {
                              onDeleteModel(m.id);
                            }
                          }}
                          title="Delete Model"
                          className="p-1.5 rounded-lg border border-rose-200 bg-white hover:bg-rose-50 text-rose-600"
                        >
                          <Trash2 className="w-3.5 h-3.5" />
                        </button>
                      )}
                    </div>
                  </td>
                </tr>
              );
            })}
          </tbody>
        </table>
      </div>
    </div>
  );
};
