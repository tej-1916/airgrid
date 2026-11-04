import React, { useState, useEffect, useCallback, useMemo } from 'react';
import {
  MapPin,
  AlertCircle,
  CheckCircle2,
  Building2,
  ShieldCheck,
} from 'lucide-react';
import { useCampus } from '../context/CampusContext';
import { useAuth } from '../context/AuthContext';
import { surveyService } from '../services/surveyService';
import { Campus, Floor, FloorPlanAsset } from '../types/campus';
import {
  SurveySession,
  SurveyMeasurement,
  HeatmapGridResponse,
  SurveySummaryStats,
  SurveyComparisonResponse,
  SurveySessionCreatePayload,
  SurveyMeasurementCreatePayload,
  LiveMeasurementCreatePayload,
  SurveyValidationResponse,
} from '../types/survey';

import { SurveyHeader } from '../components/survey/SurveyHeader';
import { FloorPlanSurveyCanvas } from '../components/survey/FloorPlanSurveyCanvas';
import { SignalMeasurementPanel } from '../components/survey/SignalMeasurementPanel';
import { SurveyAnalysisPanel } from '../components/survey/SurveyAnalysisPanel';
import { SurveyHistoryModal } from '../components/survey/SurveyHistoryModal';
import { SurveyComparisonModal } from '../components/survey/SurveyComparisonModal';
import { SurveyCreateModal } from '../components/survey/SurveyCreateModal';
import { TelemetrySnapshot } from '../types/diagnostics';

export const HeatmapsPage: React.FC = () => {
  const { user } = useAuth();
  const { campuses, selectedCampusId, setSelectedCampusId } = useCampus();

  const isEngineerOrAdmin = user?.role === 'administrator' || user?.role === 'network_engineer';

  // Facility selection state
  const [selectedCampus, setSelectedCampus] = useState<Campus | null>(null);
  const [selectedBuildingId, setSelectedBuildingId] = useState<string | null>(null);
  const [selectedFloorId, setSelectedFloorId] = useState<string | null>(null);
  const [activeFloor, setActiveFloor] = useState<Floor | null>(null);
  const [floorPlan, setFloorPlan] = useState<FloorPlanAsset | null>(null);

  // Survey session & measurement states
  const [surveySessions, setSurveySessions] = useState<SurveySession[]>([]);
  const [activeSession, setActiveSession] = useState<SurveySession | null>(null);
  const [measurements, setMeasurements] = useState<SurveyMeasurement[]>([]);
  const [selectedMeasurement, setSelectedMeasurement] = useState<SurveyMeasurement | null>(null);
  const [stats, setStats] = useState<SurveySummaryStats | null>(null);
  const [heatmap, setHeatmap] = useState<HeatmapGridResponse | null>(null);
  const [selectedNetwork, setSelectedNetwork] = useState<string>('');
  const [validation, setValidation] = useState<SurveyValidationResponse | null>(null);
  const [validating, setValidating] = useState<boolean>(false);

  // Available distinct network SSIDs in the active survey
  const availableNetworks = useMemo(() => {
    const set = new Set<string>();
    measurements.forEach((m) => {
      if (m.network_label && m.network_label.trim()) {
        set.add(m.network_label.trim());
      }
    });
    return Array.from(set).sort();
  }, [measurements]);

  // Interactive coordinate placement state
  const [pendingClickCoords, setPendingClickCoords] = useState<{ x: number; y: number } | null>(null);
  const [placeable, setPlaceable] = useState<TelemetrySnapshot[]>([]);

  // Fresh instrument observations are offered whenever the operator selects a position.
  useEffect(() => {
    if (!pendingClickCoords || !activeSession) return;
    surveyService.placeableSnapshots(activeSession.id).then(setPlaceable).catch(() => setPlaceable([]));
  }, [pendingClickCoords, activeSession]);

  // Modals state
  const [createModalOpen, setCreateModalOpen] = useState<boolean>(false);
  const [historyModalOpen, setHistoryModalOpen] = useState<boolean>(false);
  const [comparisonResult, setComparisonResult] = useState<SurveyComparisonResponse | null>(null);

  // Loading and feedback states
  const [loading, setLoading] = useState<boolean>(false);
  const [generatingHeatmap, setGeneratingHeatmap] = useState<boolean>(false);
  const [feedbackMsg, setFeedbackMsg] = useState<{ type: 'success' | 'error'; text: string } | null>(null);

  // 1. Sync campus selection with CampusContext
  useEffect(() => {
    if (campuses.length > 0) {
      if (selectedCampusId) {
        const found = campuses.find((c) => c.id === selectedCampusId);
        if (found) {
          setSelectedCampus(found);
          if (!selectedBuildingId && found.buildings && found.buildings.length > 0) {
            setSelectedBuildingId(found.buildings[0].id);
          }
          return;
        }
      }
      // Default to first campus
      setSelectedCampus(campuses[0]);
      setSelectedCampusId(campuses[0].id);
      if (campuses[0].buildings && campuses[0].buildings.length > 0) {
        setSelectedBuildingId(campuses[0].buildings[0].id);
      }
    }
  }, [campuses, selectedCampusId, setSelectedCampusId, selectedBuildingId]);

  // 2. Sync building and floor selection
  const selectedBuilding = selectedCampus?.buildings?.find((b) => b.id === selectedBuildingId) || null;

  useEffect(() => {
    if (selectedBuilding && selectedBuilding.floors && selectedBuilding.floors.length > 0) {
      if (!selectedFloorId || !selectedBuilding.floors.some((f) => f.id === selectedFloorId)) {
        setSelectedFloorId(selectedBuilding.floors[0].id);
      }
    } else {
      setSelectedFloorId(null);
      setActiveFloor(null);
      setFloorPlan(null);
    }
  }, [selectedBuilding, selectedFloorId]);

  // 3. Load active floor plan and surveys whenever floor changes
  const loadFloorSurveys = useCallback(async (floorId: string) => {
    try {
      setLoading(true);
      // Fetch surveys for this floor
      const listResp = await surveyService.listSurveys({ floorId });
      setSurveySessions(listResp.items);

      if (listResp.items.length > 0) {
        // Find most recent in_progress session, or latest
        const inProgress = listResp.items.find((s) => s.status === 'in_progress') || listResp.items[0];
        const fullSurvey = await surveyService.getSurvey(inProgress.id);
        setActiveSession(fullSurvey);
        setMeasurements(fullSurvey.measurements || []);

        // Load stats
        const surveyStats = await surveyService.getSurveyAnalysis(inProgress.id);
        setStats(surveyStats);

        // Auto-load heatmap if 3+ measurements
        if ((fullSurvey.measurements?.length || 0) >= 3) {
          const distinctNets = Array.from(
            new Set(
              (fullSurvey.measurements || [])
                .map((m) => (m.network_label || '').trim())
                .filter(Boolean)
            )
          );
          const targetNet = distinctNets.length > 0 ? distinctNets[0] : undefined;
          if (targetNet) setSelectedNetwork(targetNet);
          try {
            const h = await surveyService.getHeatmap(inProgress.id, {
              networkLabel: targetNet,
            });
            setHeatmap(h);
          } catch {
            setHeatmap(null);
          }
        } else {
          setHeatmap(null);
        }
      } else {
        setActiveSession(null);
        setMeasurements([]);
        setStats(null);
        setHeatmap(null);
      }
    } catch (err: any) {
      setFeedbackMsg({ type: 'error', text: err.message || 'Failed to load survey sessions.' });
    } finally {
      setLoading(false);
    }
  }, []);

  useEffect(() => {
    if (selectedFloorId && selectedBuilding) {
      const fl = selectedBuilding.floors?.find((f) => f.id === selectedFloorId) || null;
      setActiveFloor(fl);
      setFloorPlan(fl?.floor_plan || null);
      loadFloorSurveys(selectedFloorId);
    }
  }, [selectedFloorId, selectedBuilding, loadFloorSurveys]);

  // 4. Create new survey session
  const handleCreateSurvey = async (payload: SurveySessionCreatePayload) => {
    try {
      const created = await surveyService.createSurvey(payload);
      setFeedbackMsg({ type: 'success', text: `Survey session '${created.session_name}' created.` });
      await loadFloorSurveys(payload.floor_id);
    } catch (err: any) {
      setFeedbackMsg({ type: 'error', text: err.message || 'Failed to create survey session.' });
      throw err;
    }
  };

  // 5. Complete active survey session
  const handleCompleteSurvey = async () => {
    if (!activeSession) return;
    try {
      await surveyService.completeSurvey(activeSession.id);
      setFeedbackMsg({
        type: 'success',
        text: `Survey session '${activeSession.session_name}' marked as completed.`,
      });
      if (selectedFloorId) {
        await loadFloorSurveys(selectedFloorId);
      }
    } catch (err: any) {
      setFeedbackMsg({ type: 'error', text: err.message || 'Failed to complete survey session.' });
    }
  };

  // 6. Record measurement
  const handleSaveMeasurement = async (payload: SurveyMeasurementCreatePayload) => {
    if (!activeSession) {
      setFeedbackMsg({
        type: 'error',
        text: 'No active survey session. Please create or select a survey session first.',
      });
      return;
    }

    try {
      await surveyService.addMeasurement(activeSession.id, payload);
      setFeedbackMsg({
        type: 'success',
        text: `Observation (${payload.rssi_dbm} dBm) saved at (${payload.position_x}, ${payload.position_y}) px.`,
      });
      setPendingClickCoords(null);

      // Refresh measurements and analysis
      const updatedSurvey = await surveyService.getSurvey(activeSession.id);
      setActiveSession(updatedSurvey);
      setMeasurements(updatedSurvey.measurements || []);

      const surveyStats = await surveyService.getSurveyAnalysis(activeSession.id);
      setStats(surveyStats);

      // Refresh heatmap if >= 3 measurements
      if ((updatedSurvey.measurements?.length || 0) >= 3) {
        try {
          const targetNet = selectedNetwork || payload.network_label || undefined;
          const h = await surveyService.getHeatmap(activeSession.id, { networkLabel: targetNet });
          setHeatmap(h);
        } catch {
          // Keep prior or null
        }
      }
    } catch (err: any) {
      setFeedbackMsg({ type: 'error', text: err.message || 'Failed to record measurement.' });
      throw err;
    }
  };

  // 6b. Place a stored instrument observation at the clicked position
  const handlePlaceSnapshot = async (snapshotId: string, notes?: string) => {
    if (!activeSession || !pendingClickCoords) return;
    const placed = await surveyService.placeSnapshot(activeSession.id, {
      telemetry_snapshot_id: snapshotId, position_x: pendingClickCoords.x, position_y: pendingClickCoords.y, notes,
    });
    setFeedbackMsg({ type: 'success', text: `Instrument observation (${placed.rssi_dbm} dBm) placed at (${placed.position_x}, ${placed.position_y}) px.` });
    setPendingClickCoords(null);
    const updatedSurvey = await surveyService.getSurvey(activeSession.id);
    setActiveSession(updatedSurvey);
    setMeasurements(updatedSurvey.measurements || []);
    setStats(await surveyService.getSurveyAnalysis(activeSession.id));
  };

  // 6c. Capture live connected Wi-Fi observation directly at the clicked coordinates
  const handleCollectLive = async (payload: LiveMeasurementCreatePayload) => {
    if (!activeSession) return;
    try {
      const obs = await surveyService.collectLiveMeasurement(activeSession.id, payload);
      setFeedbackMsg({
        type: 'success',
        text: `Live observation captured: ${obs.rssi_dbm} dBm (${obs.network_label || 'Connected link'}) at (${obs.position_x}, ${obs.position_y}) px.`,
      });
      setPendingClickCoords(null);

      const updatedSurvey = await surveyService.getSurvey(activeSession.id);
      setActiveSession(updatedSurvey);
      setMeasurements(updatedSurvey.measurements || []);
      setStats(await surveyService.getSurveyAnalysis(activeSession.id));

      if ((updatedSurvey.measurements?.length || 0) >= 3) {
        try {
          const targetNet = selectedNetwork || obs.network_label || undefined;
          const h = await surveyService.getHeatmap(activeSession.id, { networkLabel: targetNet });
          setHeatmap(h);
        } catch {
          // ignore
        }
      }
    } catch (err: any) {
      setFeedbackMsg({ type: 'error', text: err.message || 'Failed to capture live Wi-Fi telemetry.' });
      throw err;
    }
  };

  // 6d. Reposition mistaken measurement point with audit tracking
  const handleRepositionMeasurement = async (m: SurveyMeasurement, newX: number, newY: number, reason?: string) => {
    if (!activeSession) return;
    try {
      const updated = await surveyService.repositionMeasurement(activeSession.id, m.id, {
        position_x: newX,
        position_y: newY,
        reason,
      });
      setFeedbackMsg({
        type: 'success',
        text: `Point repositioned to (${updated.position_x}, ${updated.position_y}) px. Audit logged.`,
      });
      setSelectedMeasurement(updated);

      const updatedSurvey = await surveyService.getSurvey(activeSession.id);
      setActiveSession(updatedSurvey);
      setMeasurements(updatedSurvey.measurements || []);
      setStats(await surveyService.getSurveyAnalysis(activeSession.id));

      if ((updatedSurvey.measurements?.length || 0) >= 3) {
        try {
          const targetNet = selectedNetwork || undefined;
          const h = await surveyService.getHeatmap(activeSession.id, { networkLabel: targetNet });
          setHeatmap(h);
        } catch {
          // ignore
        }
      }
    } catch (err: any) {
      setFeedbackMsg({ type: 'error', text: err.message || 'Failed to reposition point.' });
      throw err;
    }
  };

  // 6e. Run Leave-One-Out Cross-Validation (LOOCV) for prediction accuracy
  const handleRunValidation = async () => {
    if (!activeSession) return;
    try {
      setValidating(true);
      const val = await surveyService.getSurveyValidation(activeSession.id, {
        networkLabel: selectedNetwork || undefined,
      });
      setValidation(val);
      setFeedbackMsg({
        type: 'success',
        text: val.mae_db !== null
          ? `LOOCV validation completed: MAE is ±${val.mae_db} dBm across ${val.valid_predictions_count} points.`
          : 'LOOCV validation completed.',
      });
    } catch (err: any) {
      setFeedbackMsg({ type: 'error', text: err.message || 'Validation evaluation failed.' });
    } finally {
      setValidating(false);
    }
  };

  // 7. Delete measurement
  const handleDeleteMeasurement = async (m: SurveyMeasurement) => {
    if (!activeSession) return;
    try {
      await surveyService.deleteMeasurement(activeSession.id, m.id);
      setFeedbackMsg({ type: 'success', text: `Observation point deleted.` });

      // Refresh
      const updatedSurvey = await surveyService.getSurvey(activeSession.id);
      setActiveSession(updatedSurvey);
      setMeasurements(updatedSurvey.measurements || []);

      const surveyStats = await surveyService.getSurveyAnalysis(activeSession.id);
      setStats(surveyStats);

      if ((updatedSurvey.measurements?.length || 0) >= 3) {
        try {
          const targetNet = selectedNetwork || undefined;
          const h = await surveyService.getHeatmap(activeSession.id, { networkLabel: targetNet });
          setHeatmap(h);
        } catch {
          setHeatmap(null);
        }
      } else {
        setHeatmap(null);
      }
    } catch (err: any) {
      setFeedbackMsg({ type: 'error', text: err.message || 'Failed to delete measurement.' });
    }
  };

  // 8. Generate / Refresh Heatmap manually
  const handleGenerateHeatmap = async () => {
    if (!activeSession) return;
    if (measurements.length < 3) {
      setFeedbackMsg({
        type: 'error',
        text: 'Insufficient survey measurements for coverage estimation. At least 3 non-collinear observations are required.',
      });
      return;
    }

    try {
      setGeneratingHeatmap(true);
      const targetNet = selectedNetwork || (availableNetworks.length > 0 ? availableNetworks[0] : undefined);
      const h = await surveyService.getHeatmap(activeSession.id, { networkLabel: targetNet });
      setHeatmap(h);
      setFeedbackMsg({
        type: 'success',
        text: targetNet
          ? `IDW coverage heatmap generated for network '${targetNet}'.`
          : 'IDW coverage heatmap generated successfully.',
      });
    } catch (err: any) {
      setFeedbackMsg({ type: 'error', text: err.message || 'Heatmap calculation failed.' });
    } finally {
      setGeneratingHeatmap(false);
    }
  };

  // 9. Interactive network selector handler
  const handleSelectNetwork = async (net: string) => {
    setSelectedNetwork(net);
    if (!activeSession) return;
    if (measurements.length < 3) return;

    try {
      setGeneratingHeatmap(true);
      const h = await surveyService.getHeatmap(activeSession.id, {
        networkLabel: net || undefined,
      });
      setHeatmap(h);
      setFeedbackMsg({
        type: 'success',
        text: `Switched heatmap view to network '${net}'.`,
      });
    } catch (err: any) {
      setFeedbackMsg({ type: 'error', text: err.message || 'Heatmap calculation failed.' });
    } finally {
      setGeneratingHeatmap(false);
    }
  };

  // 9. Historical comparison handler
  const handleCompareSessions = async (s1Id: string, s2Id: string) => {
    try {
      const comp = await surveyService.compareSurveys(s1Id, s2Id);
      setComparisonResult(comp);
      setHistoryModalOpen(false);
    } catch (err: any) {
      setFeedbackMsg({ type: 'error', text: err.message || 'Failed to compare sessions.' });
    }
  };

  return (
    <div className="space-y-5">
      {/* Feedback Banner */}
      {feedbackMsg && (
        <div
          className={`p-3 rounded-xl border text-xs flex items-center justify-between shadow-xs ${
            feedbackMsg.type === 'success'
              ? 'bg-emerald-50 border-emerald-200 text-emerald-800'
              : 'bg-rose-50 border-rose-200 text-rose-800'
          }`}
        >
          <div className="flex items-center gap-2">
            {feedbackMsg.type === 'success' ? (
              <CheckCircle2 className="w-4 h-4 text-emerald-600 shrink-0" />
            ) : (
              <AlertCircle className="w-4 h-4 text-rose-600 shrink-0" />
            )}
            <span>{feedbackMsg.text}</span>
          </div>
          <button
            onClick={() => setFeedbackMsg(null)}
            className="text-slate-400 hover:text-black font-semibold ml-3"
          >
            ✕
          </button>
        </div>
      )}

      {/* Facility Selector Bar */}
      <div className="p-3.5 rounded-xl bg-white border border-[#D9DBDE] flex items-center justify-between flex-wrap gap-3 shadow-xs">
        <div className="flex items-center gap-3 flex-wrap">
          <div className="flex items-center gap-1.5 text-xs font-bold text-[#0B0B0D] uppercase tracking-wider">
            <Building2 className="w-4 h-4 text-[#BE6B37]" />
            <span>Facility Target:</span>
          </div>

          {/* Campus Selector */}
          <select
            value={selectedCampus?.id || ''}
            onChange={(e) => {
              setSelectedCampusId(e.target.value);
              setSelectedBuildingId(null);
              setSelectedFloorId(null);
            }}
            className="py-1 px-2.5 rounded-lg bg-[#F5F5F3] border border-[#D9DBDE] text-xs font-semibold text-[#0B0B0D] focus:outline-none focus:border-[#BE6B37] cursor-pointer"
          >
            {campuses.map((c) => (
              <option key={c.id} value={c.id}>
                {c.name} ({c.code})
              </option>
            ))}
          </select>

          {/* Building Selector */}
          <select
            value={selectedBuilding?.id || ''}
            onChange={(e) => {
              setSelectedBuildingId(e.target.value);
              setSelectedFloorId(null);
            }}
            disabled={!selectedCampus?.buildings || selectedCampus.buildings.length === 0}
            className="py-1 px-2.5 rounded-lg bg-[#F5F5F3] border border-[#D9DBDE] text-xs font-semibold text-[#0B0B0D] focus:outline-none focus:border-[#BE6B37] cursor-pointer disabled:opacity-50"
          >
            {selectedCampus?.buildings?.map((b) => (
              <option key={b.id} value={b.id}>
                {b.name} ({b.building_code})
              </option>
            ))}
          </select>

          {/* Floor Level Selector */}
          <select
            value={selectedFloorId || ''}
            onChange={(e) => setSelectedFloorId(e.target.value)}
            disabled={!selectedBuilding?.floors || selectedBuilding.floors.length === 0}
            className="py-1 px-2.5 rounded-lg bg-[#F5F5F3] border border-[#D9DBDE] text-xs font-semibold text-[#0B0B0D] focus:outline-none focus:border-[#BE6B37] cursor-pointer disabled:opacity-50"
          >
            {selectedBuilding?.floors?.map((fl) => (
              <option key={fl.id} value={fl.id}>
                {fl.name} (Level {fl.floor_number})
              </option>
            ))}
          </select>
        </div>

        {/* Viewer Read-Only Tag */}
        {!isEngineerOrAdmin && (
          <div className="flex items-center gap-1.5 px-2.5 py-1 rounded-lg bg-[#F5F5F3] border border-[#D9DBDE] text-[11px] text-[#737373]">
            <ShieldCheck className="w-3.5 h-3.5 text-[#BE6B37]" />
            <span>Viewer Mode (Read-Only)</span>
          </div>
        )}
      </div>

      {/* Survey Header (Area A) */}
      <SurveyHeader
        campusName={selectedCampus?.name}
        buildingName={selectedBuilding?.name}
        floorName={activeFloor?.name}
        activeSession={activeSession}
        onNewSurvey={() => setCreateModalOpen(true)}
        onCompleteSurvey={handleCompleteSurvey}
        onOpenHistory={() => {
          if (selectedFloorId) loadFloorSurveys(selectedFloorId);
          setHistoryModalOpen(true);
        }}
        onGenerateHeatmap={handleGenerateHeatmap}
        canMutate={isEngineerOrAdmin}
        generatingHeatmap={generatingHeatmap}
        isHeatmapAvailable={Boolean(heatmap)}
      />

      {/* Main Studio Grid: Center Workspace (Area B) + Right Panels (Area C & D) */}
      <div className="grid grid-cols-1 lg:grid-cols-3 gap-5">
        {/* Floor Plan Workspace (2 Columns) */}
        <div className="lg:col-span-2 space-y-3">
          <FloorPlanSurveyCanvas
            floor={activeFloor}
            floorPlan={floorPlan}
            measurements={measurements}
            heatmap={heatmap}
            onCanvasClick={(coords) => {
              if (isEngineerOrAdmin && activeSession) {
                setPendingClickCoords(coords);
                setSelectedMeasurement(null);
              }
            }}
            selectedMeasurement={selectedMeasurement}
            onSelectMeasurement={(m) => {
              setSelectedMeasurement(m);
              setPendingClickCoords(null);
            }}
            onDeleteMeasurement={handleDeleteMeasurement}
            onRepositionMeasurement={handleRepositionMeasurement}
            canMutate={isEngineerOrAdmin}
            availableNetworks={availableNetworks}
            selectedNetwork={selectedNetwork}
            onSelectNetwork={handleSelectNetwork}
          />

          {/* Canvas Guide Strip */}
          {floorPlan && isEngineerOrAdmin && (
            <div className="p-2.5 rounded-xl bg-white border border-[#D9DBDE] flex items-center justify-between text-xs text-[#737373]">
              <div className="flex items-center gap-2">
                <MapPin className="w-4 h-4 text-[#BE6B37]" />
                <span>
                  {!activeSession
                    ? 'Create a survey session above to start placing measurement observations.'
                    : 'Click anywhere on the floor plan above to place and record an RF signal observation.'}
                </span>
              </div>
              <span className="text-[11px] font-mono text-[#737373]">
                {measurements.length} sample{measurements.length === 1 ? '' : 's'} recorded
              </span>
            </div>
          )}
        </div>

        {/* Right Sidebar: Signal Measurement Panel (Area C) & Analysis Panel (Area D) */}
        <div className="space-y-4">
          {/* Active Measurement Form (Shows when point is clicked) */}
          {pendingClickCoords && isEngineerOrAdmin && (
            <SignalMeasurementPanel
              floorId={selectedFloorId || ''}
              clickCoords={pendingClickCoords}
              onSave={handleSaveMeasurement}
              onCollectLive={handleCollectLive}
              onCancel={() => setPendingClickCoords(null)}
              scaleRatio={floorPlan?.scale_pixels_per_meter || 20.0}
              isCalibrated={floorPlan?.is_calibrated || false}
              placeable={placeable}
              onPlaceSnapshot={handlePlaceSnapshot}
            />
          )}

          {/* Analysis & Statistical Evidence Panel (Area D) */}
          <SurveyAnalysisPanel
            stats={stats}
            validation={validation}
            loading={loading}
            onRunValidation={handleRunValidation}
            validating={validating}
          />
        </div>
      </div>

      {/* Modals */}
      <SurveyCreateModal
        isOpen={createModalOpen}
        onClose={() => setCreateModalOpen(false)}
        floorId={selectedFloorId || ''}
        floorName={activeFloor?.name || 'Selected Floor'}
        campusId={selectedCampus?.id}
        buildingId={selectedBuilding?.id}
        onCreate={handleCreateSurvey}
      />

      <SurveyHistoryModal
        isOpen={historyModalOpen}
        onClose={() => setHistoryModalOpen(false)}
        sessions={surveySessions}
        activeSessionId={activeSession?.id || null}
        onSelectSession={(sess) => {
          setActiveSession(sess);
          setMeasurements(sess.measurements || []);
          if (sess.id) {
            surveyService.getSurveyAnalysis(sess.id).then(setStats);
            surveyService.getHeatmap(sess.id).then(setHeatmap).catch(() => setHeatmap(null));
          }
        }}
        onCompare={handleCompareSessions}
      />

      <SurveyComparisonModal
        comparison={comparisonResult}
        onClose={() => setComparisonResult(null)}
      />
    </div>
  );
};
