import React, { useState } from 'react';
import { Play, AlertCircle, Cpu, Shield } from 'lucide-react';
import { MLAlgorithmInfo } from '../../types/ml';

interface MLTrainingControlsProps {
  algorithms: MLAlgorithmInfo[];
  selectedAlgo: string;
  onSelectAlgo: (algoId: string) => void;
  validationStrategy: string;
  onSelectValidationStrategy: (strategy: string) => void;
  isReady: boolean;
  canTrain: boolean;
  onTrain: () => Promise<void>;
  training: boolean;
}

export const MLTrainingControls: React.FC<MLTrainingControlsProps> = ({
  algorithms,
  selectedAlgo,
  onSelectAlgo,
  validationStrategy,
  onSelectValidationStrategy,
  isReady,
  canTrain,
  onTrain,
  training,
}) => {
  const [errorMsg, setErrorMsg] = useState<string | null>(null);

  const handleTrainClick = async () => {
    try {
      setErrorMsg(null);
      await onTrain();
    } catch (err: any) {
      setErrorMsg(err.message || 'Model training failed.');
    }
  };

  const currentAlgo = algorithms.find((a) => a.algorithm_id === selectedAlgo);

  return (
    <div className="bg-white rounded-2xl border border-[#D9DBDE] p-6 shadow-sm space-y-5">
      <div>
        <h3 className="text-sm font-bold text-[#0B0B0D] flex items-center gap-2">
          <Cpu className="w-4 h-4 text-[#BE6B37]" />
          Model Training & Cross-Validation Setup
        </h3>
        <p className="text-xs text-[#737373] mt-0.5">
          Select CPU-friendly scikit-learn regressors and leakage-safe spatial evaluation strategies
        </p>
      </div>

      {errorMsg && (
        <div className="p-3.5 rounded-xl bg-rose-50 border border-rose-200 text-rose-800 text-xs flex items-center gap-2">
          <AlertCircle className="w-4 h-4 flex-shrink-0" />
          <span>{errorMsg}</span>
        </div>
      )}

      {/* Algorithm Selection Grid */}
      <div className="space-y-2">
        <label className="text-xs font-semibold text-[#0B0B0D] block">Regression Algorithm</label>
        <div className="grid grid-cols-1 md:grid-cols-3 gap-3">
          {algorithms.map((algo) => {
            const isSelected = algo.algorithm_id === selectedAlgo;
            return (
              <div
                key={algo.algorithm_id}
                onClick={() => onSelectAlgo(algo.algorithm_id)}
                className={`p-3.5 rounded-xl border text-left cursor-pointer transition-all ${
                  isSelected
                    ? 'border-[#BE6B37] bg-amber-50/30 ring-1 ring-[#BE6B37]'
                    : 'border-[#D9DBDE] bg-[#F5F5F3]/50 hover:bg-[#F5F5F3]'
                }`}
              >
                <div className="flex items-center justify-between">
                  <span className="text-xs font-bold text-[#0B0B0D]">{algo.name}</span>
                  <span className="text-[10px] font-mono px-1.5 py-0.5 rounded bg-slate-200/80 text-slate-700">
                    {algo.family}
                  </span>
                </div>
                <p className="text-[11px] text-[#737373] mt-1.5 line-clamp-2 leading-relaxed">
                  {algo.description}
                </p>
              </div>
            );
          })}
        </div>
      </div>

      {/* Hyperparameters & Validation Controls */}
      <div className="grid grid-cols-1 md:grid-cols-2 gap-4 pt-1">
        <div>
          <label className="text-xs font-semibold text-[#0B0B0D] block mb-1.5">
            Validation Strategy (Leakage-Safe)
          </label>
          <select
            value={validationStrategy}
            onChange={(e) => onSelectValidationStrategy(e.target.value)}
            className="w-full text-xs font-medium bg-[#F5F5F3] border border-[#D9DBDE] rounded-xl px-3 py-2 text-[#0B0B0D] focus:outline-none focus:ring-1 focus:ring-[#BE6B37]"
          >
            <option value="session_group_kfold">Multi-Session GroupKFold (Leakage-Free Cross-Validation)</option>
            <option value="spatial_block_cv">Spatial Block CV (Held-Out Architectural Zones)</option>
          </select>
          <p className="text-[10px] text-[#737373] mt-1">
            Separates independent survey walkthrough sessions into distinct folds to prevent spatial autocorrelation leakage.
          </p>
        </div>

        <div>
          <label className="text-xs font-semibold text-[#0B0B0D] block mb-1.5">
            Default Hyperparameters Preset
          </label>
          <div className="p-2.5 rounded-xl bg-[#F5F5F3] border border-[#D9DBDE] font-mono text-[11px] text-[#0B0B0D] overflow-x-auto truncate">
            {currentAlgo ? JSON.stringify(currentAlgo.default_hyperparameters) : '{}'}
          </div>
          <p className="text-[10px] text-[#737373] mt-1">
            Optimized for low-latency CPU inference without specialized accelerators.
          </p>
        </div>
      </div>

      {/* Train Button & Permission / Readiness Notice */}
      <div className="flex flex-col sm:flex-row items-center justify-between gap-3 pt-3 border-t border-[#D9DBDE]">
        <div className="text-xs text-[#737373]">
          {!canTrain ? (
            <span className="flex items-center gap-1.5 text-amber-800">
              <Shield className="w-4 h-4 text-amber-600" />
              Viewer role has read-only access. Engineering or Admin privileges required to train models.
            </span>
          ) : !isReady ? (
            <span className="text-amber-800">
              Dataset requirements not satisfied. Fulfill checklist to enable production training.
            </span>
          ) : (
            <span className="text-emerald-700 font-medium">
              Dataset verified. Model artifacts will be serialized to secure local storage.
            </span>
          )}
        </div>

        <button
          onClick={handleTrainClick}
          disabled={!canTrain || !isReady || training}
          className={`flex items-center gap-2 px-5 py-2.5 rounded-xl font-bold text-xs shadow-sm transition-all ${
            canTrain && isReady && !training
              ? 'bg-[#BE6B37] hover:bg-[#A3592A] text-white cursor-pointer'
              : 'bg-slate-200 text-slate-400 border border-slate-300 cursor-not-allowed'
          }`}
        >
          {training ? (
            <>
              <div className="w-3.5 h-3.5 border-2 border-white border-t-transparent rounded-full animate-spin" />
              <span>Training Model & Evaluating...</span>
            </>
          ) : (
            <>
              <Play className="w-3.5 h-3.5 fill-current" />
              <span>Train ML Model</span>
            </>
          )}
        </button>
      </div>
    </div>
  );
};
