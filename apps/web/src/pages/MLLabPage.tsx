import React, { useState, useEffect, useCallback } from 'react';
import {
  BrainCircuit,
  RefreshCw,
  AlertCircle,
} from 'lucide-react';
import { useAuth } from '../context/AuthContext';
import { useCampus } from '../context/CampusContext';
import { mlService } from '../services/mlService';
import {
  MLDatasetReadiness,
  MLDatasetExplorer,
  MLAlgorithmInfo,
  MLModel,
  MLPredictionMap,
} from '../types/ml';
import { DatasetReadinessCard } from '../components/ml/DatasetReadinessCard';
import { DatasetExplorerPanel } from '../components/ml/DatasetExplorerPanel';
import { MLTrainingControls } from '../components/ml/MLTrainingControls';
import { ModelRegistryTable } from '../components/ml/ModelRegistryTable';
import { ModelComparisonModal } from '../components/ml/ModelComparisonModal';
import { FloorPlanMLOverlay } from '../components/ml/FloorPlanMLOverlay';

export const MLLabPage: React.FC = () => {
  const { user } = useAuth();
  const {
    campuses,
    selectedCampus,
    selectedCampusId,
    setSelectedCampusId,
  } = useCampus();

  // Facility Hierarchy Selection
  const [selectedBuildingId, setSelectedBuildingId] = useState<string>('');
  const [selectedFloorId, setSelectedFloorId] = useState<string>('');
  const [selectedNetwork, setSelectedNetwork] = useState<string>('');

  // ML State
  const [readiness, setReadiness] = useState<MLDatasetReadiness | null>(null);
  const [explorer, setExplorer] = useState<MLDatasetExplorer | null>(null);
  const [algorithms, setAlgorithms] = useState<MLAlgorithmInfo[]>([]);
  const [selectedAlgo, setSelectedAlgo] = useState<string>('k_neighbors');
  const [validationStrategy, setValidationStrategy] = useState<string>('session_group_kfold');
  const [models, setModels] = useState<MLModel[]>([]);
  const [activeModel, setActiveModel] = useState<MLModel | null>(null);
  const [predictionMap, setPredictionMap] = useState<MLPredictionMap | null>(null);
  const [comparisonModel, setComparisonModel] = useState<MLModel | null>(null);

  // Loading States
  const [loadingReadiness, setLoadingReadiness] = useState<boolean>(false);
  const [loadingModels, setLoadingModels] = useState<boolean>(false);
  const [loadingPrediction, setLoadingPrediction] = useState<boolean>(false);
  const [training, setTraining] = useState<boolean>(false);
  const [pageError, setPageError] = useState<string | null>(null);

  const canManage = user?.role === 'administrator' || user?.role === 'network_engineer';

  // Derived building and floor lists from selected campus
  const buildings = selectedCampus?.buildings || [];
  const activeBuilding = buildings.find((b) => b.id === selectedBuildingId) || buildings[0];
  const floors = activeBuilding?.floors || [];
  const activeFloor = floors.find((f) => f.id === selectedFloorId) || floors[0];

  // Auto-select first building and floor when campus changes
  useEffect(() => {
    if (buildings.length > 0 && (!selectedBuildingId || !buildings.some((b) => b.id === selectedBuildingId))) {
      setSelectedBuildingId(buildings[0].id);
    }
  }, [buildings, selectedBuildingId]);

  useEffect(() => {
    if (floors.length > 0 && (!selectedFloorId || !floors.some((f) => f.id === selectedFloorId))) {
      setSelectedFloorId(floors[0].id);
    }
  }, [floors, selectedFloorId]);

  // Load Algorithms on Mount
  useEffect(() => {
    mlService
      .getAlgorithms()
      .then(setAlgorithms)
      .catch((err) => console.error('Failed to load ML algorithms:', err));
  }, []);

  // Load Floor Data (Readiness, Explorer, Models)
  const loadFloorMLData = useCallback(async () => {
    if (!activeFloor?.id) return;
    try {
      setPageError(null);
      setLoadingReadiness(true);
      setLoadingModels(true);

      const [readyData, expData, modelList] = await Promise.all([
        mlService.getReadiness(activeFloor.id, selectedNetwork || undefined),
        mlService.getDatasetExplorer(activeFloor.id, selectedNetwork || undefined),
        mlService.listModels(activeFloor.id),
      ]);

      setReadiness(readyData);
      setExplorer(expData);
      setModels(modelList);

      // If models exist and no prediction map is loaded, auto-select champion or first model
      if (modelList.length > 0 && !activeModel) {
        const champ = modelList.find((m) => m.is_current_champion) || modelList[0];
        setActiveModel(champ);
        loadPredictionMap(champ.id);
      } else if (modelList.length === 0) {
        setActiveModel(null);
        setPredictionMap(null);
      }
    } catch (err: any) {
      setPageError(err.message || 'Failed to load floor ML dataset status.');
    } finally {
      setLoadingReadiness(false);
      setLoadingModels(false);
    }
  }, [activeFloor?.id, selectedNetwork]);

  useEffect(() => {
    loadFloorMLData();
  }, [loadFloorMLData]);

  // Load Prediction Map
  const loadPredictionMap = async (modelId: string) => {
    try {
      setLoadingPrediction(true);
      const map = await mlService.getPredictionMap(modelId, 30, 50, selectedNetwork || undefined);
      setPredictionMap(map);
    } catch (err: any) {
      console.error('Failed to generate ML prediction overlay:', err);
      setPredictionMap(null);
    } finally {
      setLoadingPrediction(false);
    }
  };

  const handleSelectModel = (m: MLModel) => {
    setActiveModel(m);
    loadPredictionMap(m.id);
  };

  // Train Model
  const handleTrain = async () => {
    if (!activeFloor?.id) return;
    try {
      setTraining(true);
      setPageError(null);
      const newModel = await mlService.trainModel({
        floor_id: activeFloor.id,
        network_label: selectedNetwork || undefined,
        algorithm: selectedAlgo,
        validation_strategy: validationStrategy,
      });

      // Reload floor data
      await loadFloorMLData();
      setActiveModel(newModel);
      await loadPredictionMap(newModel.id);
    } catch (err: any) {
      setPageError(err.message || 'Model training failed.');
      throw err;
    } finally {
      setTraining(false);
    }
  };

  // Set Champion
  const handleSetChampion = async (modelId: string) => {
    try {
      await mlService.setChampion(modelId);
      await loadFloorMLData();
    } catch (err: any) {
      setPageError(err.message || 'Failed to promote model to champion.');
    }
  };

  // Delete Model
  const handleDeleteModel = async (modelId: string) => {
    try {
      await mlService.deleteModel(modelId);
      if (activeModel?.id === modelId) {
        setActiveModel(null);
        setPredictionMap(null);
      }
      await loadFloorMLData();
    } catch (err: any) {
      setPageError(err.message || 'Failed to delete model.');
    }
  };

  const floorPlanAsset = activeFloor?.floor_plan;
  const floorPlanUrl = floorPlanAsset ? `/api/v1/campuses/floor-plans/${floorPlanAsset.id}/file` : null;

  return (
    <div className="space-y-6">
      {/* Top Breadcrumb & Facility Selector */}
      <div className="bg-white rounded-2xl border border-[#D9DBDE] p-5 shadow-sm space-y-4">
        <div className="flex flex-col md:flex-row md:items-center justify-between gap-4">
          <div>
            <div className="flex items-center gap-2">
              <span className="p-1.5 rounded-lg bg-amber-50 border border-amber-200 text-[#BE6B37]">
                <BrainCircuit className="w-5 h-5" />
              </span>
              <h2 className="text-xl font-bold tracking-tight text-[#0B0B0D]">
                RF Propagation ML Prediction Lab
              </h2>
            </div>
            <p className="text-xs text-[#737373] mt-1">
              Physics-grounded signal regressors, multi-session spatial validation, and IDW baseline comparison
            </p>
          </div>

          <button
            onClick={loadFloorMLData}
            className="flex items-center gap-1.5 px-3 py-1.5 rounded-xl border border-[#D9DBDE] bg-[#F5F5F3] hover:bg-slate-200/60 text-xs font-semibold text-[#0B0B0D] transition-colors self-start md:self-auto"
          >
            <RefreshCw className="w-3.5 h-3.5 text-[#737373]" />
            <span>Refresh Lab</span>
          </button>
        </div>

        {/* Facility Dropdowns */}
        <div className="grid grid-cols-1 sm:grid-cols-3 gap-3 pt-2 border-t border-[#D9DBDE]">
          <div>
            <label className="text-[11px] font-semibold text-[#737373] block mb-1">Campus</label>
            <select
              value={selectedCampusId || ''}
              onChange={(e) => setSelectedCampusId(e.target.value)}
              className="w-full text-xs font-medium bg-[#F5F5F3] border border-[#D9DBDE] rounded-xl px-3 py-2 text-[#0B0B0D] focus:outline-none focus:ring-1 focus:ring-[#BE6B37]"
            >
              {campuses.map((c) => (
                <option key={c.id} value={c.id}>
                  {c.name} ({c.code})
                </option>
              ))}
            </select>
          </div>

          <div>
            <label className="text-[11px] font-semibold text-[#737373] block mb-1">Building</label>
            <select
              value={activeBuilding?.id || ''}
              onChange={(e) => setSelectedBuildingId(e.target.value)}
              disabled={buildings.length === 0}
              className="w-full text-xs font-medium bg-[#F5F5F3] border border-[#D9DBDE] rounded-xl px-3 py-2 text-[#0B0B0D] focus:outline-none focus:ring-1 focus:ring-[#BE6B37] disabled:opacity-50"
            >
              {buildings.map((b) => (
                <option key={b.id} value={b.id}>
                  {b.name} ({b.building_code})
                </option>
              ))}
            </select>
          </div>

          <div>
            <label className="text-[11px] font-semibold text-[#737373] block mb-1">Floor</label>
            <select
              value={activeFloor?.id || ''}
              onChange={(e) => setSelectedFloorId(e.target.value)}
              disabled={floors.length === 0}
              className="w-full text-xs font-medium bg-[#F5F5F3] border border-[#D9DBDE] rounded-xl px-3 py-2 text-[#0B0B0D] focus:outline-none focus:ring-1 focus:ring-[#BE6B37] disabled:opacity-50"
            >
              {floors.map((f) => (
                <option key={f.id} value={f.id}>
                  Floor {f.floor_number} - {f.name}
                </option>
              ))}
            </select>
          </div>
        </div>
      </div>

      {pageError && (
        <div className="p-4 rounded-2xl bg-rose-50 border border-rose-200 text-rose-800 text-xs flex items-center gap-2">
          <AlertCircle className="w-4 h-4 flex-shrink-0" />
          <span>{pageError}</span>
        </div>
      )}

      {/* 1. Dataset Readiness Card (Scientific Integrity Gate) */}
      <DatasetReadinessCard
        readiness={readiness}
        loading={loadingReadiness}
        selectedNetwork={selectedNetwork}
        onSelectNetwork={setSelectedNetwork}
      />

      {/* 2. Dataset Explorer Panel */}
      <DatasetExplorerPanel
        explorer={explorer}
        loading={loadingReadiness}
      />

      {/* 3. Training & Validation Setup Controls */}
      <MLTrainingControls
        algorithms={algorithms}
        selectedAlgo={selectedAlgo}
        onSelectAlgo={setSelectedAlgo}
        validationStrategy={validationStrategy}
        onSelectValidationStrategy={setValidationStrategy}
        isReady={readiness?.is_ready || false}
        canTrain={canManage}
        onTrain={handleTrain}
        training={training}
      />

      {/* 4. Floor Plan ML Prediction Overlay Workspace */}
      <FloorPlanMLOverlay
        predictionMap={predictionMap}
        floorPlanUrl={floorPlanUrl}
        floorName={activeFloor?.name}
        loading={loadingPrediction}
      />

      {/* 5. Model Registry & Comparison Table */}
      <ModelRegistryTable
        models={models}
        activeModelId={activeModel?.id || null}
        onSelectModel={handleSelectModel}
        onOpenComparison={(m) => setComparisonModel(m)}
        onSetChampion={handleSetChampion}
        onDeleteModel={handleDeleteModel}
        canManage={canManage}
        loading={loadingModels}
      />

      {/* Detailed Comparison Modal */}
      <ModelComparisonModal
        model={comparisonModel}
        onClose={() => setComparisonModel(null)}
      />
    </div>
  );
};
