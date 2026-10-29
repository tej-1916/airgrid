import React, { useState, useEffect, useRef, useCallback } from 'react';
import {
  Gauge,
  Play,
  Pause,
  Square,
  ArrowDown,
  ArrowUp,
  Clock,
  Activity,
  ShieldCheck,
  Building2,
  MapPin,
  RefreshCw,
  Eye,
  X,
  AlertTriangle,
  CheckCircle2,
  Globe2,
  Radio,
} from 'lucide-react';

import { useCampus } from '../context/CampusContext';
import { campusService } from '../services/campusService';
import { speedTestService } from '../services/speedTestService';
import { diagnosticsService } from '../services/diagnosticsService';
import { cloudflareSpeedTestAdapter } from '../services/cloudflareSpeedTestAdapter';
import { SpeedTestConsentModal } from '../components/speedtest/SpeedTestConsentModal';
import {
  SpeedTestState,
  SpeedTestRecord,
  SpeedTestSummaryStats,
  SpeedTestConfig,
} from '../types/speedTest';
import { Campus, Building, Floor } from '../types/campus';
import { LiveConnectionStatus } from '../types/diagnostics';

export const SpeedTestPage: React.FC = () => {
  const { selectedCampusId } = useCampus();

  // Speed test execution state
  const [testState, setTestState] = useState<SpeedTestState>({
    phase: 'idle',
    progressPercent: 0,
    isRunning: false,
    isPaused: false,
    currentPhaseName: 'Ready to Measure',
    metrics: { packetLossPct: null },
  });

  const [cooldownSeconds, setCooldownSeconds] = useState(0);
  const cooldownTimerRef = useRef<number | null>(null);

  // Persistence status
  const [saveStatus, setSaveStatus] = useState<{
    saved: boolean;
    recordId?: string;
    error?: string;
  } | null>(null);

  // Hierarchy state for manual location assignment
  const [campuses, setCampuses] = useState<Campus[]>([]);
  const [selectedCampus, setSelectedCampus] = useState<string>('');
  const [buildings, setBuildings] = useState<Building[]>([]);
  const [selectedBuilding, setSelectedBuilding] = useState<string>('');
  const [floors, setFloors] = useState<Floor[]>([]);
  const [selectedFloor, setSelectedFloor] = useState<string>('');
  const [associateLocation, setAssociateLocation] = useState<boolean>(false);

  // Historical test data
  const [history, setHistory] = useState<SpeedTestRecord[]>([]);
  const [historyTotal, setHistoryTotal] = useState<number>(0);
  const [stats, setStats] = useState<SpeedTestSummaryStats | null>(null);
  const [loadingHistory, setLoadingHistory] = useState(false);
  const [filterCampus, setFilterCampus] = useState<string>('');
  const [filterStatus, setFilterStatus] = useState<string>('');

  // Inspection modal
  const [inspectRecord, setInspectRecord] = useState<SpeedTestRecord | null>(null);

  // Live Wi-Fi connection and config
  const [liveConnection, setLiveConnection] = useState<LiveConnectionStatus | null>(null);
  const [config, setConfig] = useState<SpeedTestConfig | null>(null);
  const [isConsentModalOpen, setIsConsentModalOpen] = useState<boolean>(false);

  // 1. Load campuses, live Wi-Fi link, and speed test config on mount
  useEffect(() => {
    let mounted = true;
    campusService
      .listCampuses({ limit: 100 })
      .then((res) => {
        if (mounted) {
          setCampuses(res.items);
          if (selectedCampusId) {
            setSelectedCampus(selectedCampusId);
          }
        }
      })
      .catch((err) => console.error('Failed to load campuses', err));

    diagnosticsService
      .getLiveConnection()
      .then((status: LiveConnectionStatus) => {
        if (mounted) setLiveConnection(status);
      })
      .catch((err: unknown) => console.warn('Could not load live Wi-Fi connection info', err));

    speedTestService
      .getConfig()
      .then((cfg: SpeedTestConfig) => {
        if (mounted) setConfig(cfg);
      })
      .catch((err: unknown) => console.warn('Could not load speed test safety config', err));

    return () => {
      mounted = false;
    };
  }, [selectedCampusId]);

  // 2. Load buildings when campus changes
  useEffect(() => {
    if (!selectedCampus) {
      setBuildings([]);
      setSelectedBuilding('');
      return;
    }
    let mounted = true;
    campusService
      .listBuildings(selectedCampus)
      .then((bList) => {
        if (mounted) {
          setBuildings(bList);
          if (bList.length > 0) {
            setSelectedBuilding(bList[0].id);
          } else {
            setSelectedBuilding('');
          }
        }
      })
      .catch((err) => console.error('Failed to load buildings', err));
    return () => {
      mounted = false;
    };
  }, [selectedCampus]);

  // 3. Load floors when building changes
  useEffect(() => {
    if (!selectedBuilding) {
      setFloors([]);
      setSelectedFloor('');
      return;
    }
    let mounted = true;
    campusService
      .listFloors(selectedBuilding)
      .then((fList) => {
        if (mounted) {
          setFloors(fList);
          if (fList.length > 0) {
            setSelectedFloor(fList[0].id);
          } else {
            setSelectedFloor('');
          }
        }
      })
      .catch((err) => console.error('Failed to load floors', err));
    return () => {
      mounted = false;
    };
  }, [selectedBuilding]);

  // 4. Load history & stats
  const fetchHistoryAndStats = useCallback(async () => {
    try {
      setLoadingHistory(true);
      const [historyRes, statsRes] = await Promise.all([
        speedTestService.listSpeedTests({
          limit: 25,
          campusId: filterCampus || undefined,
          status: filterStatus || undefined,
        }),
        speedTestService.getStatsSummary(filterCampus || undefined),
      ]);
      setHistory(historyRes.items);
      setHistoryTotal(historyRes.total);
      setStats(statsRes);
    } catch (err) {
      console.error('Failed to load speed test history', err);
    } finally {
      setLoadingHistory(false);
    }
  }, [filterCampus, filterStatus]);

  useEffect(() => {
    fetchHistoryAndStats();
  }, [fetchHistoryAndStats]);

  // Cooldown countdown
  useEffect(() => {
    if (cooldownSeconds > 0) {
      cooldownTimerRef.current = window.setTimeout(() => {
        setCooldownSeconds((s) => s - 1);
      }, 1000);
    }
    return () => {
      if (cooldownTimerRef.current) {
        clearTimeout(cooldownTimerRef.current);
      }
    };
  }, [cooldownSeconds]);

  // Open Speed Test Consent Modal
  const handleStartTestClick = () => {
    if (testState.isRunning || cooldownSeconds > 0) return;
    setIsConsentModalOpen(true);
  };

  // Execute Speed Test after Operator Authorization
  const executeSpeedTest = async () => {
    setIsConsentModalOpen(false);
    if (testState.isRunning || cooldownSeconds > 0) return;

    setSaveStatus(null);

    try {
      const finalMetrics = await cloudflareSpeedTestAdapter.start((state) => {
        setTestState(state);
      });

      // Automatically persist completed measurement
      try {
        const payload = {
          provider_engine: 'cloudflare',
          vantage_point: 'client_browser',
          status: 'completed',
          download_mbps: finalMetrics.downloadMbps,
          upload_mbps: finalMetrics.uploadMbps,
          latency_ms: finalMetrics.latencyMs,
          jitter_ms: finalMetrics.jitterMs,
          loaded_latency_ms: finalMetrics.loadedLatencyMs,
          packet_loss_pct: null,
          server_location: finalMetrics.serverLocation || 'Cloudflare Edge',
          campus_id: associateLocation && selectedCampus ? selectedCampus : undefined,
          building_id: associateLocation && selectedBuilding ? selectedBuilding : undefined,
          floor_id: associateLocation && selectedFloor ? selectedFloor : undefined,
          duration_seconds: finalMetrics.durationSeconds,
          quality_metadata: finalMetrics.qualityMetadata,
        };

        const savedRecord = await speedTestService.saveSpeedTest(payload);
        setSaveStatus({ saved: true, recordId: savedRecord.id });
        fetchHistoryAndStats();
      } catch (err: any) {
        setSaveStatus({ saved: false, error: err.message || 'Failed to persist to database' });
      }

      // Start 10s cooldown
      setCooldownSeconds(10);
    } catch (err: any) {
      // Test aborted or failed
      const currentState = cloudflareSpeedTestAdapter.getState();
      if (currentState.phase === 'aborted' || err.message === 'USER_ABORTED') {
        // Persist aborted state
        try {
          const savedRecord = await speedTestService.saveSpeedTest({
            provider_engine: 'cloudflare',
            vantage_point: 'client_browser',
            status: 'aborted',
            download_mbps: currentState.metrics.downloadMbps,
            upload_mbps: currentState.metrics.uploadMbps,
            latency_ms: currentState.metrics.latencyMs,
            jitter_ms: currentState.metrics.jitterMs,
            error_code: 'USER_ABORTED',
            error_message: 'Test cancelled by operator',
            campus_id: associateLocation && selectedCampus ? selectedCampus : undefined,
            building_id: associateLocation && selectedBuilding ? selectedBuilding : undefined,
            floor_id: associateLocation && selectedFloor ? selectedFloor : undefined,
          });
          setSaveStatus({ saved: true, recordId: savedRecord.id });
          fetchHistoryAndStats();
        } catch (e) {
          // Ignore
        }
      }
      setCooldownSeconds(5);
    }
  };

  const handlePauseTest = () => {
    cloudflareSpeedTestAdapter.pause();
  };

  const handleResumeTest = () => {
    cloudflareSpeedTestAdapter.resume();
  };

  const handleAbortTest = () => {
    cloudflareSpeedTestAdapter.abort();
  };

  return (
    <div className="space-y-6 pb-12">
      {/* 1. Header & Title */}
      <div className="flex flex-col md:flex-row md:items-center justify-between gap-4">
        <div>
          <div className="flex items-center gap-2 mb-1">
            <span className="text-xs font-semibold uppercase tracking-wider text-[#BE6B37]">
              Throughput & Latency Engine
            </span>
            <span className="text-xs text-[#737373]">•</span>
            <span className="text-xs font-medium text-[#737373]">Real Client Vantage Point</span>
          </div>
          <h1 className="text-2xl font-bold tracking-tight text-[#0B0B0D]">Network Speed Test Lab</h1>
          <p className="text-sm text-[#737373] mt-0.5">
            Measure actual WAN download/upload throughput and latency directly from this browser terminal.
          </p>
        </div>

        {/* Provider Switcher */}
        <div className="flex items-center gap-2 bg-[#ECECE8] p-1.5 rounded-xl border border-[#D9DBDE]">
          <div className="flex items-center gap-2 px-3 py-1.5 rounded-lg bg-white shadow-xs border border-[#D9DBDE]">
            <Globe2 className="w-3.5 h-3.5 text-[#BE6B37]" />
            <span className="text-xs font-semibold text-[#0B0B0D]">Cloudflare Edge SDK</span>
            <span className="text-[10px] font-bold px-1.5 py-0.5 rounded-sm bg-[#BE6B37]/10 text-[#BE6B37]">
              ACTIVE
            </span>
          </div>
          <div
            className="flex items-center gap-2 px-3 py-1.5 rounded-lg text-[#737373] cursor-not-allowed opacity-60"
            title="LibreSpeed self-hosted provider adapter planned for future integration."
          >
            <span className="text-xs font-medium">LibreSpeed (Planned)</span>
          </div>
        </div>
      </div>

      {/* 2. Active Wireless Link & Device Context */}
      <div className="p-4 rounded-xl bg-white border border-[#D9DBDE] shadow-xs space-y-3">
        <div className="flex flex-col sm:flex-row sm:items-center justify-between gap-2">
          <div className="flex items-center gap-2">
            <Radio className="w-4 h-4 text-[#BE6B37]" />
            <h2 className="text-xs font-bold uppercase tracking-wider text-[#0B0B0D]">
              Active Wireless Link & Measurement Context
            </h2>
          </div>
          <div className="flex items-center gap-2">
            <span className="text-xs text-[#737373]">Persistence Scope:</span>
            <span
              className={`px-2.5 py-0.5 rounded-full text-[11px] font-semibold border ${
                associateLocation && selectedCampus
                  ? 'bg-blue-50 text-blue-700 border-blue-200'
                  : 'bg-emerald-50 text-emerald-700 border-emerald-200'
              }`}
            >
              {associateLocation && selectedCampus
                ? `Associated: ${campuses.find((c) => c.id === selectedCampus)?.name || 'Campus'}`
                : 'Standalone Audit (Unassociated)'}
            </span>
          </div>
        </div>

        <div className="grid grid-cols-2 sm:grid-cols-4 gap-3 p-3 rounded-lg bg-[#F5F5F3] border border-[#D9DBDE] text-xs">
          <div>
            <span className="text-[10px] text-[#737373] uppercase font-semibold block">Connected SSID</span>
            <span className="font-bold text-[#0B0B0D]">{liveConnection?.ssid || 'Not Detected / Standalone'}</span>
          </div>
          <div>
            <span className="text-[10px] text-[#737373] uppercase font-semibold block">Host Interface</span>
            <span className="font-mono text-[#0B0B0D]">{liveConnection?.interface_name || 'wlp0s20f3'}</span>
          </div>
          <div>
            <span className="text-[10px] text-[#737373] uppercase font-semibold block">Wi-Fi PHY Link Rate</span>
            <span className="font-semibold text-[#0B0B0D]">
              {liveConnection?.rx_bitrate_mbps
                ? `${liveConnection.rx_bitrate_mbps} Mbps RX / ${liveConnection.tx_bitrate_mbps || '—'} Mbps TX`
                : '—'}
            </span>
          </div>
          <div>
            <span className="text-[10px] text-[#737373] uppercase font-semibold block">Signal / Band</span>
            <span className="font-semibold text-[#0B0B0D]">
              {liveConnection?.rssi_dbm !== null && liveConnection?.rssi_dbm !== undefined
                ? `${liveConnection.rssi_dbm} dBm`
                : '—'}{' '}
              {liveConnection?.frequency_mhz ? `(${liveConnection.frequency_mhz > 3000 ? '5 GHz' : '2.4 GHz'})` : ''}
            </span>
          </div>
        </div>

        <div className="p-2.5 rounded-lg bg-amber-50/60 border border-amber-200 text-[11px] text-amber-900 flex items-start gap-2">
          <AlertTriangle className="w-4 h-4 text-amber-600 shrink-0 mt-0.5" />
          <div>
            <strong className="text-amber-950">Architecture Distinction:</strong> The Negotiated Wi-Fi PHY link rate
            reflects local wireless radio modulation speed between this laptop and the local Wi-Fi AP. It is{' '}
            <strong>NOT</strong> measured internet throughput. The tests run below measure real end-to-end WAN HTTP/2 throughput
            to Cloudflare Edge servers.
          </div>
        </div>
      </div>

      {/* 3. Safety & Vantage Point Disclaimer */}
      <div className="p-4 rounded-xl bg-white border border-[#D9DBDE] shadow-xs flex items-start gap-3">
        <div className="p-2 rounded-lg bg-[#BE6B37]/10 text-[#BE6B37] shrink-0 mt-0.5">
          <ShieldCheck className="w-5 h-5" />
        </div>
        <div className="text-xs text-[#737373] space-y-1">
          <div className="font-semibold text-[#0B0B0D] flex items-center gap-2">
            <span>Client Vantage Point Guarantee & Safety Protocol</span>
            <span className="px-2 py-0.5 rounded-full text-[10px] bg-emerald-50 text-emerald-700 border border-emerald-200 font-semibold">
              Client-Reported Provenance
            </span>
          </div>
          <p>
            This speed test runs directly in your browser using the official Cloudflare Speedtest engine. Traffic
            is transferred securely via HTTP/2 to the nearest Cloudflare Edge location. No user credentials, session
            tokens, or backend API keys are sent to third-party measurement endpoints.
          </p>
          <p className="text-[11px] text-[#737373]">
            <strong className="text-[#0B0B0D]">Privacy Note:</strong> IP addresses and personal telemetry are never stored.
            Wireless radio metrics (RSSI, BSSID) are not inferred from internet speed tests.
          </p>
        </div>
      </div>

      {/* 3. Location Association Bar */}
      <div className="p-4 rounded-xl bg-white border border-[#D9DBDE] shadow-xs space-y-3">
        <div className="flex flex-col sm:flex-row sm:items-center justify-between gap-2">
          <div className="flex items-center gap-2">
            <MapPin className="w-4 h-4 text-[#BE6B37]" />
            <h2 className="text-xs font-bold uppercase tracking-wider text-[#0B0B0D]">
              Physical Location Association
            </h2>
          </div>
          <label className="flex items-center gap-2 cursor-pointer text-xs font-medium text-[#0B0B0D]">
            <input
              type="checkbox"
              checked={associateLocation}
              onChange={(e) => setAssociateLocation(e.target.checked)}
              className="rounded border-[#D9DBDE] text-[#BE6B37] focus:ring-[#BE6B37] w-4 h-4 cursor-pointer"
            />
            <span>Associate test result with selected campus facility</span>
          </label>
        </div>

        {associateLocation && (
          <div className="grid grid-cols-1 sm:grid-cols-3 gap-3 pt-2 border-t border-[#ECECE8]">
            {/* Campus Select */}
            <div>
              <label className="block text-[11px] font-semibold text-[#737373] mb-1">
                Institutional Campus
              </label>
              <select
                value={selectedCampus}
                onChange={(e) => setSelectedCampus(e.target.value)}
                className="w-full py-1.5 px-2.5 rounded-lg bg-[#F5F5F3] border border-[#D9DBDE] text-xs font-medium text-[#0B0B0D] focus:outline-none focus:border-[#BE6B37]"
              >
                {campuses.map((c) => (
                  <option key={c.id} value={c.id}>
                    {c.name} ({c.code})
                  </option>
                ))}
              </select>
            </div>

            {/* Building Select */}
            <div>
              <label className="block text-[11px] font-semibold text-[#737373] mb-1">
                Structural Facility
              </label>
              <select
                value={selectedBuilding}
                onChange={(e) => setSelectedBuilding(e.target.value)}
                disabled={buildings.length === 0}
                className="w-full py-1.5 px-2.5 rounded-lg bg-[#F5F5F3] border border-[#D9DBDE] text-xs font-medium text-[#0B0B0D] focus:outline-none focus:border-[#BE6B37] disabled:opacity-50"
              >
                {buildings.length === 0 ? (
                  <option value="">No buildings available</option>
                ) : (
                  buildings.map((b) => (
                    <option key={b.id} value={b.id}>
                      {b.name} ({b.building_code})
                    </option>
                  ))
                )}
              </select>
            </div>

            {/* Floor Select */}
            <div>
              <label className="block text-[11px] font-semibold text-[#737373] mb-1">
                Architectural Floor Level
              </label>
              <select
                value={selectedFloor}
                onChange={(e) => setSelectedFloor(e.target.value)}
                disabled={floors.length === 0}
                className="w-full py-1.5 px-2.5 rounded-lg bg-[#F5F5F3] border border-[#D9DBDE] text-xs font-medium text-[#0B0B0D] focus:outline-none focus:border-[#BE6B37] disabled:opacity-50"
              >
                {floors.length === 0 ? (
                  <option value="">No floors available</option>
                ) : (
                  floors.map((f) => (
                    <option key={f.id} value={f.id}>
                      {f.name} (Level {f.floor_number})
                    </option>
                  ))
                )}
              </select>
            </div>
          </div>
        )}

        <p className="text-[11px] text-[#737373]">
          <em>Explicit Association:</em> Indoor physical coordinates cannot be detected by browser APIs automatically.
          Location assignment is recorded as an operator-designated attribute.
        </p>
      </div>

      {/* 4. Measurement Cockpit */}
      <div className="p-6 rounded-2xl bg-white border border-[#D9DBDE] shadow-xs space-y-6">
        <div className="flex flex-col sm:flex-row sm:items-center justify-between gap-4 pb-4 border-b border-[#ECECE8]">
          <div className="flex items-center gap-3">
            <div
              className={`p-2.5 rounded-xl ${
                testState.isRunning
                  ? 'bg-[#BE6B37]/10 text-[#BE6B37] animate-pulse'
                  : 'bg-[#ECECE8] text-[#0B0B0D]'
              }`}
            >
              <Gauge className="w-6 h-6" />
            </div>
            <div>
              <div className="text-xs font-semibold uppercase tracking-wider text-[#737373]">
                Measurement Status
              </div>
              <div className="text-base font-bold text-[#0B0B0D]">{testState.currentPhaseName}</div>
            </div>
          </div>

          {/* Test Action Controls */}
          <div className="flex items-center gap-2">
            {!testState.isRunning && !testState.isPaused && (
              <button
                onClick={handleStartTestClick}
                disabled={cooldownSeconds > 0}
                className="flex items-center gap-2 px-5 py-2.5 rounded-xl bg-[#BE6B37] text-white font-semibold text-xs hover:bg-[#9A5226] transition-colors disabled:opacity-50 disabled:cursor-not-allowed shadow-xs"
              >
                <Play className="w-4 h-4 fill-current" />
                <span>
                  {cooldownSeconds > 0 ? `Cooldown (${cooldownSeconds}s)` : 'Start Network Speed Test'}
                </span>
              </button>
            )}

            {testState.isRunning && !testState.isPaused && (
              <>
                <button
                  onClick={handlePauseTest}
                  className="flex items-center gap-1.5 px-4 py-2.5 rounded-xl bg-[#ECECE8] text-[#0B0B0D] font-semibold text-xs hover:bg-[#D9DBDE] transition-colors"
                >
                  <Pause className="w-4 h-4" />
                  <span>Pause</span>
                </button>
                <button
                  onClick={handleAbortTest}
                  className="flex items-center gap-1.5 px-4 py-2.5 rounded-xl bg-rose-50 text-rose-700 border border-rose-200 font-semibold text-xs hover:bg-rose-100 transition-colors"
                >
                  <Square className="w-4 h-4 fill-current" />
                  <span>Cancel</span>
                </button>
              </>
            )}

            {testState.isPaused && (
              <>
                <button
                  onClick={handleResumeTest}
                  className="flex items-center gap-1.5 px-4 py-2.5 rounded-xl bg-[#BE6B37] text-white font-semibold text-xs hover:bg-[#9A5226] transition-colors shadow-xs"
                >
                  <Play className="w-4 h-4 fill-current" />
                  <span>Resume</span>
                </button>
                <button
                  onClick={handleAbortTest}
                  className="flex items-center gap-1.5 px-4 py-2.5 rounded-xl bg-rose-50 text-rose-700 border border-rose-200 font-semibold text-xs hover:bg-rose-100 transition-colors"
                >
                  <Square className="w-4 h-4 fill-current" />
                  <span>Cancel</span>
                </button>
              </>
            )}
          </div>
        </div>

        {/* Progress Bar */}
        <div className="space-y-1.5">
          <div className="flex justify-between text-xs font-semibold">
            <span className="text-[#737373]">Progress</span>
            <span className="text-[#0B0B0D]">{testState.progressPercent}%</span>
          </div>
          <div className="w-full h-2 rounded-full bg-[#ECECE8] overflow-hidden">
            <div
              className="h-full bg-[#BE6B37] transition-all duration-300 rounded-full"
              style={{ width: `${testState.progressPercent}%` }}
            />
          </div>
        </div>

        {/* Real-time Metric Cards Grid */}
        <div className="grid grid-cols-1 sm:grid-cols-2 lg:grid-cols-4 gap-4">
          {/* 1. Download Throughput */}
          <div className="p-4 rounded-xl bg-[#F5F5F3] border border-[#D9DBDE] space-y-2">
            <div className="flex items-center justify-between text-xs font-medium text-[#737373]">
              <span className="flex items-center gap-1.5">
                <ArrowDown className="w-4 h-4 text-[#BE6B37]" />
                Download Speed
              </span>
              <span className="text-[10px] font-bold px-1.5 py-0.5 rounded bg-white border border-[#D9DBDE]">
                WAN
              </span>
            </div>
            <div className="flex items-baseline gap-1">
              <span className="text-3xl font-extrabold tracking-tight text-[#0B0B0D]">
                {testState.metrics.downloadMbps !== undefined
                  ? testState.metrics.downloadMbps.toFixed(2)
                  : '—'}
              </span>
              <span className="text-xs font-semibold text-[#737373]">Mbps</span>
            </div>
            <div className="text-[11px] text-[#737373]">
              {testState.phase === 'download'
                ? 'Streaming HTTP/2 payload...'
                : 'Conservative payload cap'}
            </div>
          </div>

          {/* 2. Upload Throughput */}
          <div className="p-4 rounded-xl bg-[#F5F5F3] border border-[#D9DBDE] space-y-2">
            <div className="flex items-center justify-between text-xs font-medium text-[#737373]">
              <span className="flex items-center gap-1.5">
                <ArrowUp className="w-4 h-4 text-[#0B0B0D]" />
                Upload Speed
              </span>
              <span className="text-[10px] font-bold px-1.5 py-0.5 rounded bg-white border border-[#D9DBDE]">
                WAN
              </span>
            </div>
            <div className="flex items-baseline gap-1">
              <span className="text-3xl font-extrabold tracking-tight text-[#0B0B0D]">
                {testState.metrics.uploadMbps !== undefined
                  ? testState.metrics.uploadMbps.toFixed(2)
                  : '—'}
              </span>
              <span className="text-xs font-semibold text-[#737373]">Mbps</span>
            </div>
            <div className="text-[11px] text-[#737373]">
              {testState.phase === 'upload'
                ? 'Transmitting HTTP/2 upload...'
                : 'Buffer bloat monitored'}
            </div>
          </div>

          {/* 3. Latency & Ping */}
          <div className="p-4 rounded-xl bg-[#F5F5F3] border border-[#D9DBDE] space-y-2">
            <div className="flex items-center justify-between text-xs font-medium text-[#737373]">
              <span className="flex items-center gap-1.5">
                <Clock className="w-4 h-4 text-emerald-600" />
                Unloaded Latency
              </span>
              <span className="text-[10px] font-bold px-1.5 py-0.5 rounded bg-white border border-[#D9DBDE]">
                RTT
              </span>
            </div>
            <div className="flex items-baseline gap-1">
              <span className="text-3xl font-extrabold tracking-tight text-[#0B0B0D]">
                {testState.metrics.latencyMs !== undefined ? testState.metrics.latencyMs.toFixed(1) : '—'}
              </span>
              <span className="text-xs font-semibold text-[#737373]">ms</span>
            </div>
            <div className="text-[11px] text-[#737373]">
              {testState.metrics.loadedLatencyMs !== undefined
                ? `Loaded: ${testState.metrics.loadedLatencyMs.toFixed(1)} ms`
                : 'Median round-trip ping'}
            </div>
          </div>

          {/* 4. Jitter & Loss */}
          <div className="p-4 rounded-xl bg-[#F5F5F3] border border-[#D9DBDE] space-y-2">
            <div className="flex items-center justify-between text-xs font-medium text-[#737373]">
              <span className="flex items-center gap-1.5">
                <Activity className="w-4 h-4 text-amber-600" />
                Jitter & Quality
              </span>
              <span className="text-[10px] font-bold px-1.5 py-0.5 rounded bg-white border border-[#D9DBDE]">
                STATS
              </span>
            </div>
            <div className="flex items-baseline gap-1">
              <span className="text-3xl font-extrabold tracking-tight text-[#0B0B0D]">
                {testState.metrics.jitterMs !== undefined ? testState.metrics.jitterMs.toFixed(1) : '—'}
              </span>
              <span className="text-xs font-semibold text-[#737373]">ms</span>
            </div>
            <div className="text-[11px] text-[#737373]">
              Packet Loss: <span className="font-semibold text-slate-500">Not measured</span>
            </div>
          </div>
        </div>

        {/* Persistence Status Toast */}
        {saveStatus?.saved && (
          <div className="p-3 rounded-xl bg-emerald-50 border border-emerald-200 text-emerald-800 text-xs flex items-center justify-between">
            <div className="flex items-center gap-2">
              <CheckCircle2 className="w-4 h-4 text-emerald-600" />
              <span>
                <strong>Measurement Persisted:</strong> Recorded in PostgreSQL database (ID:{' '}
                <code className="font-mono text-[11px]">{saveStatus.recordId}</code>) with{' '}
                <em>client_reported</em> provenance.
              </span>
            </div>
            <button
              onClick={() => setSaveStatus(null)}
              className="p-1 rounded hover:bg-emerald-100 text-emerald-700"
            >
              <X className="w-3.5 h-3.5" />
            </button>
          </div>
        )}

        {saveStatus?.error && (
          <div className="p-3 rounded-xl bg-rose-50 border border-rose-200 text-rose-800 text-xs flex items-center justify-between">
            <div className="flex items-center gap-2">
              <AlertTriangle className="w-4 h-4 text-rose-600" />
              <span>
                <strong>Persistence Warning:</strong> {saveStatus.error}
              </span>
            </div>
            <button
              onClick={() => setSaveStatus(null)}
              className="p-1 rounded hover:bg-rose-100 text-rose-700"
            >
              <X className="w-3.5 h-3.5" />
            </button>
          </div>
        )}
      </div>

      {/* 5. Historical Results & Statistics Section */}
      <div className="space-y-4">
        <div className="flex flex-col sm:flex-row sm:items-center justify-between gap-4">
          <div>
            <h2 className="text-base font-bold text-[#0B0B0D]">Historical Test Records</h2>
            <p className="text-xs text-[#737373]">
              Audit trail of authenticated client bandwidth measurements persisted in PostgreSQL.
            </p>
          </div>

          <div className="flex items-center gap-2">
            {/* Filter by Campus */}
            <select
              value={filterCampus}
              onChange={(e) => setFilterCampus(e.target.value)}
              className="py-1.5 px-2.5 rounded-lg bg-white border border-[#D9DBDE] text-xs font-medium text-[#0B0B0D] focus:outline-none focus:border-[#BE6B37]"
            >
              <option value="">All Campuses</option>
              {campuses.map((c) => (
                <option key={c.id} value={c.id}>
                  {c.name}
                </option>
              ))}
            </select>

            {/* Filter by Status */}
            <select
              value={filterStatus}
              onChange={(e) => setFilterStatus(e.target.value)}
              className="py-1.5 px-2.5 rounded-lg bg-white border border-[#D9DBDE] text-xs font-medium text-[#0B0B0D] focus:outline-none focus:border-[#BE6B37]"
            >
              <option value="">All Statuses</option>
              <option value="completed">Completed</option>
              <option value="aborted">Aborted</option>
              <option value="failed">Failed</option>
            </select>

            <button
              onClick={fetchHistoryAndStats}
              disabled={loadingHistory}
              className="p-1.5 rounded-lg bg-white border border-[#D9DBDE] hover:bg-[#F5F5F3] transition-colors text-[#0B0B0D]"
              title="Refresh History"
            >
              <RefreshCw className={`w-4 h-4 ${loadingHistory ? 'animate-spin' : ''}`} />
            </button>
          </div>
        </div>

        {/* Summary Stats Row */}
        {stats && (
          <div className="grid grid-cols-2 sm:grid-cols-4 gap-3">
            <div className="p-3 rounded-xl bg-white border border-[#D9DBDE] shadow-xs">
              <div className="text-[11px] font-medium text-[#737373]">Total Measurements</div>
              <div className="text-xl font-bold text-[#0B0B0D] mt-0.5">{stats.total_tests}</div>
            </div>
            <div className="p-3 rounded-xl bg-white border border-[#D9DBDE] shadow-xs">
              <div className="text-[11px] font-medium text-[#737373]">Avg Download</div>
              <div className="text-xl font-bold text-[#BE6B37] mt-0.5">
                {stats.avg_download_mbps !== null && stats.avg_download_mbps !== undefined
                  ? `${stats.avg_download_mbps.toFixed(1)} Mbps`
                  : '—'}
              </div>
            </div>
            <div className="p-3 rounded-xl bg-white border border-[#D9DBDE] shadow-xs">
              <div className="text-[11px] font-medium text-[#737373]">Avg Upload</div>
              <div className="text-xl font-bold text-[#0B0B0D] mt-0.5">
                {stats.avg_upload_mbps !== null && stats.avg_upload_mbps !== undefined
                  ? `${stats.avg_upload_mbps.toFixed(1)} Mbps`
                  : '—'}
              </div>
            </div>
            <div className="p-3 rounded-xl bg-white border border-[#D9DBDE] shadow-xs">
              <div className="text-[11px] font-medium text-[#737373]">Avg Latency</div>
              <div className="text-xl font-bold text-emerald-600 mt-0.5">
                {stats.avg_latency_ms !== null && stats.avg_latency_ms !== undefined
                  ? `${stats.avg_latency_ms.toFixed(1)} ms`
                  : '—'}
              </div>
            </div>
          </div>
        )}

        {/* History Data Table */}
        <div className="rounded-xl bg-white border border-[#D9DBDE] shadow-xs overflow-hidden">
          <div className="overflow-x-auto">
            <table className="w-full text-left border-collapse text-xs">
              <thead>
                <tr className="bg-[#F5F5F3] border-b border-[#D9DBDE] text-[#737373] uppercase tracking-wider font-semibold text-[10px]">
                  <th className="py-2.5 px-3">Timestamp</th>
                  <th className="py-2.5 px-3">Location Context</th>
                  <th className="py-2.5 px-3 text-right">Download</th>
                  <th className="py-2.5 px-3 text-right">Upload</th>
                  <th className="py-2.5 px-3 text-right">Latency</th>
                  <th className="py-2.5 px-3">Status</th>
                  <th className="py-2.5 px-3 text-center">Inspect</th>
                </tr>
              </thead>
              <tbody className="divide-y divide-[#ECECE8]">
                {history.length === 0 ? (
                  <tr>
                    <td colSpan={7} className="py-8 text-center text-[#737373]">
                      No network speed tests recorded yet. Click &quot;Start Network Speed Test&quot; above to
                      execute your first client measurement.
                    </td>
                  </tr>
                ) : (
                  history.map((record) => (
                    <tr key={record.id} className="hover:bg-[#F5F5F3]/50 transition-colors">
                      <td className="py-2.5 px-3 whitespace-nowrap">
                        <div className="font-medium text-[#0B0B0D]">
                          {new Date(record.executed_at).toLocaleDateString()}
                        </div>
                        <div className="text-[10px] text-[#737373]">
                          {new Date(record.executed_at).toLocaleTimeString()}
                        </div>
                      </td>
                      <td className="py-2.5 px-3">
                        {record.campus_name ? (
                          <div>
                            <span className="font-semibold text-[#0B0B0D]">{record.campus_name}</span>
                            {record.building_name && (
                              <span className="text-[#737373] block text-[10px]">
                                {record.building_name}
                                {record.floor_name ? ` • ${record.floor_name}` : ''}
                              </span>
                            )}
                          </div>
                        ) : (
                          <span className="text-[#737373] italic">Unassigned facility</span>
                        )}
                      </td>
                      <td className="py-2.5 px-3 text-right font-mono font-bold text-[#0B0B0D] whitespace-nowrap">
                        {record.download_mbps !== undefined && record.download_mbps !== null
                          ? `${record.download_mbps.toFixed(1)} Mbps`
                          : '—'}
                      </td>
                      <td className="py-2.5 px-3 text-right font-mono text-[#0B0B0D] whitespace-nowrap">
                        {record.upload_mbps !== undefined && record.upload_mbps !== null
                          ? `${record.upload_mbps.toFixed(1)} Mbps`
                          : '—'}
                      </td>
                      <td className="py-2.5 px-3 text-right font-mono text-[#737373] whitespace-nowrap">
                        {record.latency_ms !== undefined && record.latency_ms !== null
                          ? `${record.latency_ms.toFixed(1)} ms`
                          : '—'}
                      </td>
                      <td className="py-2.5 px-3 whitespace-nowrap">
                        <span
                          className={`px-2 py-0.5 rounded-full text-[10px] font-bold ${
                            record.status === 'completed'
                              ? 'bg-emerald-50 text-emerald-700 border border-emerald-200'
                              : record.status === 'aborted'
                              ? 'bg-amber-50 text-amber-700 border border-amber-200'
                              : 'bg-rose-50 text-rose-700 border border-rose-200'
                          }`}
                        >
                          {record.status.toUpperCase()}
                        </span>
                      </td>
                      <td className="py-2.5 px-3 text-center whitespace-nowrap">
                        <button
                          onClick={() => setInspectRecord(record)}
                          className="p-1 rounded-md text-[#737373] hover:text-[#0B0B0D] hover:bg-[#ECECE8] transition-colors"
                          title="Inspect Metadata"
                        >
                          <Eye className="w-4 h-4" />
                        </button>
                      </td>
                    </tr>
                  ))
                )}
              </tbody>
            </table>
          </div>
          {historyTotal > 0 && (
            <div className="py-2 px-3 bg-[#F5F5F3] border-t border-[#D9DBDE] text-[11px] text-[#737373] flex justify-between items-center">
              <span>Showing up to {history.length} of {historyTotal} test records</span>
              <span className="font-semibold text-[#0B0B0D]">PostgreSQL Table: internet_speed_tests</span>
            </div>
          )}
        </div>
      </div>

      {/* 6. Inspection Detail Modal */}
      {inspectRecord && (
        <div className="fixed inset-0 z-50 flex items-center justify-center bg-black/40 backdrop-blur-xs p-4">
          <div className="w-full max-w-lg rounded-2xl bg-white border border-[#D9DBDE] shadow-xl overflow-hidden animate-in fade-in zoom-in-95 duration-150">
            <div className="flex items-center justify-between p-4 border-b border-[#ECECE8]">
              <div className="flex items-center gap-2">
                <Gauge className="w-5 h-5 text-[#BE6B37]" />
                <h3 className="text-sm font-bold text-[#0B0B0D]">Measurement Record Details</h3>
              </div>
              <button
                onClick={() => setInspectRecord(null)}
                className="p-1 rounded-lg text-[#737373] hover:text-[#0B0B0D] hover:bg-[#ECECE8] transition-colors"
              >
                <X className="w-4 h-4" />
              </button>
            </div>

            <div className="p-4 space-y-4 max-h-[75vh] overflow-y-auto text-xs">
              {/* General Metadata */}
              <div className="grid grid-cols-2 gap-3 p-3 rounded-xl bg-[#F5F5F3] border border-[#D9DBDE]">
                <div>
                  <div className="text-[10px] text-[#737373] uppercase font-semibold">Measurement ID</div>
                  <div className="font-mono text-[11px] font-bold text-[#0B0B0D] truncate">
                    {inspectRecord.id}
                  </div>
                </div>
                <div>
                  <div className="text-[10px] text-[#737373] uppercase font-semibold">Operator</div>
                  <div className="font-medium text-[#0B0B0D]">
                    {inspectRecord.user_email || 'System Session'}
                  </div>
                </div>
                <div>
                  <div className="text-[10px] text-[#737373] uppercase font-semibold">Vantage Point</div>
                  <div className="font-medium text-[#0B0B0D]">{inspectRecord.vantage_point}</div>
                </div>
                <div>
                  <div className="text-[10px] text-[#737373] uppercase font-semibold">Data Provenance</div>
                  <div className="font-semibold text-emerald-700">{inspectRecord.data_provenance}</div>
                </div>
              </div>

              {/* Location Context */}
              <div className="p-3 rounded-xl bg-[#F5F5F3] border border-[#D9DBDE] space-y-1">
                <div className="text-[10px] text-[#737373] uppercase font-semibold flex items-center gap-1">
                  <Building2 className="w-3.5 h-3.5 text-[#BE6B37]" />
                  <span>Physical Facility Assignment</span>
                </div>
                {inspectRecord.campus_name ? (
                  <div className="space-y-0.5 text-xs text-[#0B0B0D]">
                    <div>
                      <strong>Campus:</strong> {inspectRecord.campus_name} ({inspectRecord.campus_code})
                    </div>
                    {inspectRecord.building_name && (
                      <div>
                        <strong>Building:</strong> {inspectRecord.building_name} ({inspectRecord.building_code})
                      </div>
                    )}
                    {inspectRecord.floor_name && (
                      <div>
                        <strong>Floor:</strong> {inspectRecord.floor_name} (Level {inspectRecord.floor_number})
                      </div>
                    )}
                  </div>
                ) : (
                  <div className="text-xs text-[#737373] italic">No physical location assigned.</div>
                )}
              </div>

              {/* Measurements Breakdown */}
              <div className="grid grid-cols-3 gap-2">
                <div className="p-2.5 rounded-xl bg-white border border-[#D9DBDE] text-center">
                  <div className="text-[10px] text-[#737373]">Download</div>
                  <div className="font-mono font-bold text-[#0B0B0D]">
                    {inspectRecord.download_mbps?.toFixed(2) ?? '—'} Mbps
                  </div>
                </div>
                <div className="p-2.5 rounded-xl bg-white border border-[#D9DBDE] text-center">
                  <div className="text-[10px] text-[#737373]">Upload</div>
                  <div className="font-mono font-bold text-[#0B0B0D]">
                    {inspectRecord.upload_mbps?.toFixed(2) ?? '—'} Mbps
                  </div>
                </div>
                <div className="p-2.5 rounded-xl bg-white border border-[#D9DBDE] text-center">
                  <div className="text-[10px] text-[#737373]">Latency / Ping</div>
                  <div className="font-mono font-bold text-emerald-600">
                    {inspectRecord.latency_ms?.toFixed(1) ?? '—'} ms
                  </div>
                </div>
              </div>

              {/* Raw JSON Quality Metadata */}
              {inspectRecord.quality_metadata && (
                <div className="space-y-1">
                  <div className="text-[10px] text-[#737373] uppercase font-semibold">
                    Measurement Quality Metadata
                  </div>
                  <pre className="p-3 rounded-xl bg-[#0B0B0D] text-emerald-400 font-mono text-[10px] overflow-x-auto">
                    {JSON.stringify(inspectRecord.quality_metadata, null, 2)}
                  </pre>
                </div>
              )}
            </div>

            <div className="p-3 bg-[#F5F5F3] border-t border-[#ECECE8] flex justify-end">
              <button
                onClick={() => setInspectRecord(null)}
                className="px-4 py-1.5 rounded-lg bg-white border border-[#D9DBDE] text-xs font-semibold text-[#0B0B0D] hover:bg-[#ECECE8] transition-colors"
              >
                Close
              </button>
            </div>
          </div>
        </div>
      )}

      {/* 5. Speed Test Operator Authorization Modal */}
      <SpeedTestConsentModal
        isOpen={isConsentModalOpen}
        onClose={() => setIsConsentModalOpen(false)}
        onConfirm={executeSpeedTest}
        connectedSsid={liveConnection?.ssid}
        interfaceName={liveConnection?.interface_name}
        rxBitrateMbps={liveConnection?.rx_bitrate_mbps}
        txBitrateMbps={liveConnection?.tx_bitrate_mbps}
        signalDbm={liveConnection?.rssi_dbm}
        frequencyMhz={liveConnection?.frequency_mhz}
        targetProvider="cloudflare"
        maxMb={config?.max_mb || 150}
        durationSeconds={config?.duration_seconds || 10}
        scopeLabel={
          associateLocation && selectedCampus
            ? `Associated: ${campuses.find((c) => c.id === selectedCampus)?.name || 'Campus'}`
            : 'Standalone Audit (Unassociated)'
        }
      />
    </div>
  );
};
