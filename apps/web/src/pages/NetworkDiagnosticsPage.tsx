import { Link } from 'react-router-dom';
import React, { useState, useEffect, useCallback } from 'react';
import {
  Zap,
  Sparkles,
  History,
  Server,
  AlertCircle,
} from 'lucide-react';
import { useAuth } from '../context/AuthContext';
import { useCampus } from '../context/CampusContext';
import { diagnosticsService } from '../services/diagnosticsService';
import {
  TelemetrySnapshot,
  LiveConnectionStatus,
  DiagnosticReport,
  CollectTelemetryParams,
} from '../types/diagnostics';
import { TelemetryLiveCard } from '../components/diagnostics/TelemetryLiveCard';
import { OperatorConsentModal } from '../components/diagnostics/OperatorConsentModal';
import { DiagnosticFindingsPanel } from '../components/diagnostics/DiagnosticFindingsPanel';
import { DiagnosticHistoryDrawer } from '../components/diagnostics/DiagnosticHistoryDrawer';
import { CollectorsPanel, RetentionPanel, TelemetryTrendsPanel } from '../components/diagnostics/CollectorWorkspace';

type Tab = 'live' | 'collectors' | 'history' | 'retention';
const TABS: { id: Tab; label: string }[] = [
  { id: 'live', label: 'Backend host' },
  { id: 'collectors', label: 'Registered collectors' },
  { id: 'history', label: 'Trends & history' },
  { id: 'retention', label: 'Retention' },
];

export const NetworkDiagnosticsPage: React.FC = () => {
  const { user } = useAuth();
  const {
    campuses,
    selectedCampus,
    selectedCampusId,
    setSelectedCampusId,
  } = useCampus();

  const [selectedBuildingId, setSelectedBuildingId] = useState<string>('');
  const [selectedFloorId, setSelectedFloorId] = useState<string>('');

  // Diagnostic State
  const [liveConnection, setLiveConnection] = useState<LiveConnectionStatus | null>(null);
  const [telemetry, setTelemetry] = useState<TelemetrySnapshot | null>(null);
  const [activeReport, setActiveReport] = useState<DiagnosticReport | null>(null);
  const [reportsHistory, setReportsHistory] = useState<DiagnosticReport[]>([]);
  const [loadingLive, setLoadingLive] = useState<boolean>(false);
  const [loadingTelemetry, setLoadingTelemetry] = useState<boolean>(false);
  const [loadingAnalysis, setLoadingAnalysis] = useState<boolean>(false);
  const [loadingHistory, setLoadingHistory] = useState<boolean>(false);
  const [errorBanner, setErrorBanner] = useState<string | null>(null);

  // Modals & Drawers
  const [isConsentModalOpen, setIsConsentModalOpen] = useState<boolean>(false);
  const [isHistoryDrawerOpen, setIsHistoryDrawerOpen] = useState<boolean>(false);

  const [tab, setTab] = useState<Tab>('live');
  const isAdmin = user?.role === 'administrator' || user?.role === 'admin';
  const showError = useCallback((m: string) => setErrorBanner(m), []);
  const canManage = user?.role === 'administrator' || user?.role === 'admin' || user?.role === 'network_engineer' || user?.role === 'engineer' || user?.role === 'technician';

  // Load building and floor defaults
  useEffect(() => {
    if (selectedCampus?.buildings && selectedCampus.buildings.length > 0) {
      if (!selectedBuildingId || !selectedCampus.buildings.find((b) => b.id === selectedBuildingId)) {
        setSelectedBuildingId(selectedCampus.buildings[0].id);
      }
    } else {
      setSelectedBuildingId('');
      setSelectedFloorId('');
    }
  }, [selectedCampus, selectedBuildingId]);

  const activeBuilding = selectedCampus?.buildings?.find((b) => b.id === selectedBuildingId);

  useEffect(() => {
    if (activeBuilding?.floors && activeBuilding.floors.length > 0) {
      if (!selectedFloorId || !activeBuilding.floors.find((f) => f.id === selectedFloorId)) {
        setSelectedFloorId(activeBuilding.floors[0].id);
      }
    } else {
      setSelectedFloorId('');
    }
  }, [activeBuilding, selectedFloorId]);

  // Fetch Genuine Live Connection Status
  const fetchLiveConnection = useCallback(async () => {
    try {
      setLoadingLive(true);
      const live = await diagnosticsService.getLiveConnection();
      setLiveConnection(live);
    } catch (err: any) {
      console.warn('Failed to load live connection status:', err);
    } finally {
      setLoadingLive(false);
    }
  }, []);

  useEffect(() => {
    fetchLiveConnection();
  }, [fetchLiveConnection]);

  // Fetch Reports History
  const fetchReports = useCallback(async () => {
    try {
      setLoadingHistory(true);
      const res = await diagnosticsService.listReports(
        selectedCampusId || undefined,
        selectedBuildingId || undefined,
        selectedFloorId || undefined,
        0,
        30
      );
      setReportsHistory(res.reports);
      if (!activeReport && res.reports.length > 0) {
        setActiveReport(res.reports[0]);
        if (res.reports[0].telemetry) {
          setTelemetry(res.reports[0].telemetry);
        }
      }
    } catch (err: any) {
      console.warn('Failed to load reports history:', err);
    } finally {
      setLoadingHistory(false);
    }
  }, [selectedCampusId, selectedBuildingId, selectedFloorId, activeReport]);

  useEffect(() => {
    fetchReports();
  }, [fetchReports]);

  // Initial Telemetry Probe
  const handleCollectTelemetry = async (params: CollectTelemetryParams) => {
    try {
      setLoadingTelemetry(true);
      setErrorBanner(null);
      const snap = await diagnosticsService.collectTelemetry(params);
      setTelemetry(snap);
      fetchLiveConnection();
    } catch (err: any) {
      setErrorBanner(err.message || 'Telemetry collection failed.');
      throw err;
    } finally {
      setLoadingTelemetry(false);
    }
  };

  // Run Deterministic Analysis
  const handleRunAnalysis = async () => {
    try {
      setLoadingAnalysis(true);
      setErrorBanner(null);
      const report = await diagnosticsService.analyzeDiagnostics({
        title: telemetry?.ssid ? `Diagnostic Audit (${telemetry.ssid})` : 'Real Network Diagnostic Audit',
        interface_name: telemetry?.interface_name,
        campus_id: selectedCampusId || undefined,
        building_id: selectedBuildingId || undefined,
        floor_id: selectedFloorId || undefined,
        ...(telemetry?.id && !telemetry.report_id
          ? { telemetry_snapshot_id: telemetry.id }
          : { telemetry: telemetry || undefined }),
        operator_consent: true,
      });
      setActiveReport(report);
      if (report.telemetry) {
        setTelemetry(report.telemetry);
      }
      fetchReports();
    } catch (err: any) {
      setErrorBanner(err.message || 'Analysis failed to execute.');
    } finally {
      setLoadingAnalysis(false);
    }
  };

  // Quick Ping Default Gateway
  const handleQuickPing = async () => {
    try {
      setLoadingTelemetry(true);
      setErrorBanner(null);
      const pingRes = await diagnosticsService.pingGateway(telemetry?.gateway_ip || undefined, 3);
      if (telemetry) {
        setTelemetry({
          ...telemetry,
          gateway_ping: pingRes,
        });
      }
    } catch (err: any) {
      setErrorBanner(err.message || 'Gateway ping probe failed.');
    } finally {
      setLoadingTelemetry(false);
    }
  };

  // Delete Report
  const handleDeleteReport = async (reportId: string) => {
    try {
      await diagnosticsService.deleteReport(reportId);
      if (activeReport?.id === reportId) {
        setActiveReport(null);
      }
      fetchReports();
    } catch (err: any) {
      setErrorBanner(err.message || 'Failed to delete report.');
    }
  };

  return (
    <div className="space-y-6">
      {/* Top Header Card */}
      <div className="bg-white rounded-2xl border border-[#D9DBDE] p-4 sm:p-6 shadow-sm flex flex-col md:flex-row md:items-center justify-between gap-4">
        <div>
          <div className="flex flex-wrap items-center gap-2">
            <h1 className="text-lg sm:text-xl font-bold text-[#0B0B0D]">Real Wi-Fi Tools & Network Diagnostics</h1>
            <span className="px-2.5 py-0.5 rounded-full text-[10px] font-bold bg-[#BE6B37]/10 text-[#BE6B37] border border-[#BE6B37]/20 uppercase">
              HMAC Telemetry Ingestion
            </span>
          </div>
          <p className="text-xs text-[#737373] mt-1">
            Real Linux telemetry collector with IEEE 802.11 deterministic diagnostics and gateway hop isolation
          </p>
        </div>

        {/* Global Facility Context Selector */}
        <div className="flex flex-wrap items-center gap-2">
          {/* Campus */}
          <select
            value={selectedCampusId || ''}
            onChange={(e) => setSelectedCampusId(e.target.value)}
            className="text-xs bg-[#F5F5F3] border border-[#D9DBDE] rounded-xl px-3 py-2 text-[#0B0B0D] focus:outline-none focus:ring-1 focus:ring-[#BE6B37]"
          >
            {campuses.map((c) => (
              <option key={c.id} value={c.id}>
                Campus: {c.name}
              </option>
            ))}
          </select>

          {/* Building */}
          {selectedCampus?.buildings && selectedCampus.buildings.length > 0 && (
            <select
              value={selectedBuildingId}
              onChange={(e) => setSelectedBuildingId(e.target.value)}
              className="text-xs bg-[#F5F5F3] border border-[#D9DBDE] rounded-xl px-3 py-2 text-[#0B0B0D] focus:outline-none focus:ring-1 focus:ring-[#BE6B37]"
            >
              {selectedCampus.buildings.map((b) => (
                <option key={b.id} value={b.id}>
                  Bldg: {b.name}
                </option>
              ))}
            </select>
          )}

          {/* Floor */}
          {activeBuilding?.floors && activeBuilding.floors.length > 0 && (
            <select
              value={selectedFloorId}
              onChange={(e) => setSelectedFloorId(e.target.value)}
              className="text-xs bg-[#F5F5F3] border border-[#D9DBDE] rounded-xl px-3 py-2 text-[#0B0B0D] focus:outline-none focus:ring-1 focus:ring-[#BE6B37]"
            >
              {activeBuilding.floors.map((f) => (
                <option key={f.id} value={f.id}>
                  Floor {f.floor_number}: {f.name}
                </option>
              ))}
            </select>
          )}
        </div>
      </div>

      {/* Error Alert Banner */}
      {errorBanner && (
        <div className="p-4 rounded-2xl bg-rose-50 border border-rose-200 text-xs text-rose-800 flex items-start justify-between gap-3 animate-fade-in">
          <div className="flex items-start gap-2.5">
            <AlertCircle className="w-4 h-4 text-rose-600 flex-shrink-0 mt-0.5" />
            <span>{errorBanner}</span>
          </div>
          <button
            onClick={() => setErrorBanner(null)}
            className="text-rose-600 hover:text-rose-900 font-bold"
          >
            ×
          </button>
        </div>
      )}

      <div role="tablist" aria-label="Diagnostics workspace" className="flex gap-1 overflow-x-auto rounded-xl bg-white border border-[#D9DBDE] p-1">
        {TABS.map((t) => (
          <button key={t.id} role="tab" aria-selected={tab === t.id} onClick={() => setTab(t.id)}
            className={`whitespace-nowrap px-3.5 py-2 rounded-lg text-xs font-semibold transition-all ${tab === t.id ? 'bg-[#0B0B0D] text-white' : 'text-[#525252] hover:bg-[#F5F5F3]'}`}>
            {t.label}
          </button>
        ))}
      </div>

      {tab === 'collectors' && (
        <CollectorsPanel canAdmin={isAdmin} canAnalyze={canManage}
          scope={{ campusId: selectedCampusId || undefined, buildingId: selectedBuildingId || undefined, floorId: selectedFloorId || undefined }}
          onAnalyzed={(report) => { setActiveReport(report); if (report.telemetry) setTelemetry(report.telemetry); fetchReports(); }}
          onError={showError} />
      )}
      {tab === 'history' && <TelemetryTrendsPanel floorId={selectedFloorId || undefined} onError={showError} />}
      {tab === 'retention' && <RetentionPanel canAdmin={isAdmin} onError={showError} />}

      {tab === 'live' && (<>
      {/* Action Bar */}
      <div className="flex flex-wrap items-center justify-between gap-3">
        <div className="flex flex-wrap items-center gap-2">
          <button
            onClick={() => setIsConsentModalOpen(true)}
            className="inline-flex items-center gap-2 px-4 py-2.5 rounded-xl bg-[#BE6B37] hover:bg-[#A3592A] text-white text-xs font-semibold shadow-xs transition-all"
          >
            <Zap className="w-4 h-4" />
            <span>Collect Network Data</span>
          </button>

          <button
            onClick={handleRunAnalysis}
            disabled={!telemetry || loadingAnalysis}
            className="inline-flex items-center gap-2 px-4 py-2.5 rounded-xl bg-[#0B0B0D] hover:bg-slate-800 disabled:opacity-40 text-white text-xs font-semibold shadow-xs transition-all"
          >
            <Sparkles className="w-4 h-4 text-[#BE6B37]" />
            <span>{loadingAnalysis ? 'Analyzing Findings...' : 'Analyze Results'}</span>
          </button>

          {telemetry && (
            <button
              onClick={handleQuickPing}
              disabled={loadingTelemetry}
              className="inline-flex items-center gap-2 px-3.5 py-2.5 rounded-xl bg-white hover:bg-[#F5F5F3] border border-[#D9DBDE] text-[#0B0B0D] text-xs font-semibold transition-all"
            >
              <Server className="w-3.5 h-3.5 text-[#BE6B37]" />
              <span>Ping Gateway Now</span>
            </button>
          )}
        </div>

        <button
          onClick={() => setIsHistoryDrawerOpen(true)}
          className="inline-flex items-center gap-2 px-3.5 py-2.5 rounded-xl bg-white hover:bg-[#F5F5F3] border border-[#D9DBDE] text-[#737373] hover:text-[#0B0B0D] text-xs font-semibold transition-all"
        >
          <History className="w-4 h-4 text-[#BE6B37]" />
          <span>Audit History ({reportsHistory.length})</span>
        </button>
      </div>

      {/* Live Telemetry Display */}
      <TelemetryLiveCard
        liveConnection={liveConnection}
        telemetry={telemetry}
        loadingLive={loadingLive}
        loading={loadingTelemetry}
        onCheckLiveLink={fetchLiveConnection}
        onRefresh={() => setIsConsentModalOpen(true)}
        onCollectNew={() => setIsConsentModalOpen(true)}
      />

      {/* Deterministic Diagnostic Findings Panel */}
      <DiagnosticFindingsPanel
        report={activeReport}
        loading={loadingAnalysis}
        onRunAnalysis={handleRunAnalysis}
        canRun={Boolean(telemetry)}
      />
      </>)}

      {/* Operator Authorization Modal */}
      {activeReport && <Link className="inline-block rounded-lg border border-[#D9DBDE] px-4 py-3 text-sm" to={`/ai-analyst?report=${activeReport.id}`}>Explain saved results with AirGrid Analyst</Link>}
      <OperatorConsentModal
        isOpen={isConsentModalOpen}
        onClose={() => setIsConsentModalOpen(false)}
        onStartCollection={handleCollectTelemetry}
        campusId={selectedCampusId || undefined}
        buildingId={selectedBuildingId || undefined}
        floorId={selectedFloorId || undefined}
        campuses={campuses}
      />

      {/* Historical Reports Drawer */}
      <DiagnosticHistoryDrawer
        isOpen={isHistoryDrawerOpen}
        onClose={() => setIsHistoryDrawerOpen(false)}
        reports={reportsHistory}
        loading={loadingHistory}
        onSelectReport={(r) => {
          setActiveReport(r);
          if (r.telemetry) setTelemetry(r.telemetry);
        }}
        onDeleteReport={handleDeleteReport}
        canDelete={canManage}
      />
    </div>
  );
};
