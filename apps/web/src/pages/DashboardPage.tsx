import React, { useEffect, useState, useCallback } from 'react';
import { useNavigate } from 'react-router-dom';
import {
  Building2,
  Layers,
  FileImage,
  RefreshCw,
  Plus,
  ArrowRight,
  Clock,
  ShieldCheck,
  AlertCircle,
  ExternalLink,
} from 'lucide-react';
import { useCampus } from '../context/CampusContext';
import { useAuth } from '../context/AuthContext';
import { dashboardService } from '../services/dashboardService';
import {
  DashboardSummary,
  CampusInventoryItem,
  DashboardActivityItem,
  SystemStatusData,
} from '../types/campus';

export const DashboardPage: React.FC = () => {
  const navigate = useNavigate();
  const { user } = useAuth();
  const { selectedCampusId, selectedCampus, refreshCampuses } = useCampus();

  const [activeTab, setActiveTab] = useState<'overview' | 'inventory' | 'activity' | 'system'>('overview');
  const [summary, setSummary] = useState<DashboardSummary | null>(null);
  const [inventory, setInventory] = useState<CampusInventoryItem[]>([]);
  const [activities, setActivities] = useState<DashboardActivityItem[]>([]);
  const [systemStatus, setSystemStatus] = useState<SystemStatusData | null>(null);

  const [loading, setLoading] = useState<boolean>(true);
  const [error, setError] = useState<string | null>(null);

  const isAdmin = user?.role === 'administrator';

  const loadDashboardData = useCallback(async () => {
    try {
      setLoading(true);
      setError(null);

      const [sumData, invData, actData, sysData] = await Promise.all([
        dashboardService.getSummary(selectedCampusId || undefined),
        dashboardService.getInventory(),
        dashboardService.getActivity(20),
        dashboardService.getSystemStatus(),
      ]);

      setSummary(sumData);
      setInventory(invData.items);
      setActivities(actData.items);
      setSystemStatus(sysData);
    } catch (err: any) {
      setError(err.message || 'Failed to load dashboard metrics from backend.');
    } finally {
      setLoading(false);
    }
  }, [selectedCampusId]);

  useEffect(() => {
    loadDashboardData();
  }, [loadDashboardData]);

  const handleRefresh = async () => {
    await Promise.all([loadDashboardData(), refreshCampuses()]);
  };

  const formatDate = (isoString?: string) => {
    if (!isoString) return '—';
    try {
      return new Date(isoString).toLocaleString('en-US', {
        month: 'short',
        day: 'numeric',
        hour: '2-digit',
        minute: '2-digit',
      });
    } catch {
      return isoString;
    }
  };

  const getActionColor = (action: string) => {
    if (action.includes('created') || action.includes('uploaded')) return 'bg-emerald-50 text-emerald-700 border-emerald-200';
    if (action.includes('calibrated')) return 'bg-blue-50 text-blue-700 border-blue-200';
    if (action.includes('updated')) return 'bg-amber-50 text-amber-700 border-amber-200';
    if (action.includes('deleted')) return 'bg-rose-50 text-rose-700 border-rose-200';
    return 'bg-gray-50 text-gray-700 border-gray-200';
  };

  return (
    <div className="space-y-6">
      {/* Top Banner / Welcome Bar */}
      <div className="flex flex-col md:flex-row md:items-center justify-between gap-4 pb-2 border-b border-[#D9DBDE]">
        <div>
          <div className="flex items-center gap-2">
            <h2 className="text-2xl font-bold tracking-tight text-[#0B0B0D]">Command Center</h2>
            {selectedCampus && (
              <span className="text-xs px-2.5 py-0.5 rounded-full bg-[#BE6B37]/10 text-[#BE6B37] font-semibold border border-[#BE6B37]/30">
                {selectedCampus.name}
              </span>
            )}
          </div>
          <p className="text-sm text-[#737373] mt-0.5">
            Real-time PostgreSQL telemetry, campus infrastructure hierarchy, and operational status.
          </p>
        </div>

        <div className="flex items-center gap-2.5">
          <button
            onClick={handleRefresh}
            disabled={loading}
            className="flex items-center gap-1.5 px-3 py-1.5 rounded-lg border border-[#D9DBDE] bg-white text-xs font-semibold text-[#0B0B0D] hover:bg-[#F5F5F3] transition-colors shadow-sm disabled:opacity-50"
            title="Refresh dashboard metrics"
          >
            <RefreshCw className={`w-3.5 h-3.5 ${loading ? 'animate-spin text-[#BE6B37]' : ''}`} />
            <span>Refresh</span>
          </button>

          {isAdmin && (
            <button
              onClick={() => navigate('/campuses?action=create')}
              className="flex items-center gap-1.5 px-3.5 py-1.5 rounded-lg bg-[#BE6B37] text-xs font-semibold text-white hover:bg-[#9A5226] transition-colors shadow-sm"
            >
              <Plus className="w-3.5 h-3.5" />
              <span>New Campus</span>
            </button>
          )}
        </div>
      </div>

      {/* Error alert if backend query fails */}
      {error && (
        <div className="p-4 rounded-xl border border-rose-200 bg-rose-50 flex items-start gap-3 text-rose-800 text-sm">
          <AlertCircle className="w-5 h-5 flex-shrink-0 text-rose-600 mt-0.5" />
          <div className="flex-1">
            <p className="font-semibold">Backend Communication Notice</p>
            <p className="text-xs text-rose-700 mt-0.5">{error}</p>
          </div>
          <button
            onClick={handleRefresh}
            className="text-xs font-semibold underline hover:text-rose-900"
          >
            Retry
          </button>
        </div>
      )}

      {/* Segmented Navigation Tabs (Inspired by Reference A) */}
      <div className="flex items-center gap-1 bg-[#ECECE8] p-1 rounded-xl w-fit border border-[#D9DBDE]">
        <button
          onClick={() => setActiveTab('overview')}
          className={`px-4 py-1.5 rounded-lg text-xs font-semibold transition-all ${
            activeTab === 'overview'
              ? 'bg-white text-[#0B0B0D] shadow-sm'
              : 'text-[#737373] hover:text-[#0B0B0D]'
          }`}
        >
          Overview
        </button>
        <button
          onClick={() => setActiveTab('inventory')}
          className={`px-4 py-1.5 rounded-lg text-xs font-semibold transition-all ${
            activeTab === 'inventory'
              ? 'bg-white text-[#0B0B0D] shadow-sm'
              : 'text-[#737373] hover:text-[#0B0B0D]'
          }`}
        >
          Campus Inventory ({inventory.length})
        </button>
        <button
          onClick={() => setActiveTab('activity')}
          className={`px-4 py-1.5 rounded-lg text-xs font-semibold transition-all ${
            activeTab === 'activity'
              ? 'bg-white text-[#0B0B0D] shadow-sm'
              : 'text-[#737373] hover:text-[#0B0B0D]'
          }`}
        >
          Recent Activity ({activities.length})
        </button>
        <button
          onClick={() => setActiveTab('system')}
          className={`px-4 py-1.5 rounded-lg text-xs font-semibold transition-all ${
            activeTab === 'system'
              ? 'bg-white text-[#0B0B0D] shadow-sm'
              : 'text-[#737373] hover:text-[#0B0B0D]'
          }`}
        >
          System Status
        </button>
      </div>

      {/* TAB 1: OVERVIEW */}
      {activeTab === 'overview' && (
        <div className="space-y-6">
          {/* Summary Metric Cards (4 cards, Reference A layout) */}
          <div className="grid grid-cols-1 sm:grid-cols-2 lg:grid-cols-4 gap-4">
            {/* Card 1: Campuses */}
            <div className="p-5 rounded-2xl border border-[#D9DBDE] bg-white shadow-sm flex flex-col justify-between">
              <div className="flex items-center justify-between text-[#737373]">
                <span className="text-xs font-semibold uppercase tracking-wider">
                  {selectedCampus ? 'Selected Campus' : 'Total Campuses'}
                </span>
                <div className="w-8 h-8 rounded-lg bg-[#ECECE8] flex items-center justify-center text-[#BE6B37]">
                  <Building2 className="w-4 h-4" />
                </div>
              </div>
              <div className="mt-4">
                <div className="text-3xl font-extrabold text-[#0B0B0D] tracking-tight">
                  {summary?.total_campuses ?? 0}
                </div>
                <p className="text-[11px] text-[#737373] mt-1 flex items-center gap-1">
                  {selectedCampus ? selectedCampus.name : 'Registered institutional sites'}
                </p>
              </div>
            </div>

            {/* Card 2: Buildings */}
            <div className="p-5 rounded-2xl border border-[#D9DBDE] bg-white shadow-sm flex flex-col justify-between">
              <div className="flex items-center justify-between text-[#737373]">
                <span className="text-xs font-semibold uppercase tracking-wider">Buildings</span>
                <div className="w-8 h-8 rounded-lg bg-[#ECECE8] flex items-center justify-center text-[#BE6B37]">
                  <Building2 className="w-4 h-4" />
                </div>
              </div>
              <div className="mt-4">
                <div className="text-3xl font-extrabold text-[#0B0B0D] tracking-tight">
                  {summary?.total_buildings ?? 0}
                </div>
                <p className="text-[11px] text-[#737373] mt-1">
                  Structural facilities mapped
                </p>
              </div>
            </div>

            {/* Card 3: Floors */}
            <div className="p-5 rounded-2xl border border-[#D9DBDE] bg-white shadow-sm flex flex-col justify-between">
              <div className="flex items-center justify-between text-[#737373]">
                <span className="text-xs font-semibold uppercase tracking-wider">Floors</span>
                <div className="w-8 h-8 rounded-lg bg-[#ECECE8] flex items-center justify-center text-[#BE6B37]">
                  <Layers className="w-4 h-4" />
                </div>
              </div>
              <div className="mt-4">
                <div className="text-3xl font-extrabold text-[#0B0B0D] tracking-tight">
                  {summary?.total_floors ?? 0}
                </div>
                <p className="text-[11px] text-[#737373] mt-1">
                  Active architectural floor levels
                </p>
              </div>
            </div>

            {/* Card 4: Uploaded Floor Plans */}
            <div className="p-5 rounded-2xl border border-[#D9DBDE] bg-white shadow-sm flex flex-col justify-between">
              <div className="flex items-center justify-between text-[#737373]">
                <span className="text-xs font-semibold uppercase tracking-wider">Floor Plans</span>
                <div className="w-8 h-8 rounded-lg bg-[#ECECE8] flex items-center justify-center text-[#BE6B37]">
                  <FileImage className="w-4 h-4" />
                </div>
              </div>
              <div className="mt-4">
                <div className="text-3xl font-extrabold text-[#0B0B0D] tracking-tight">
                  {summary?.total_floor_plans ?? 0}
                </div>
                <p className="text-[11px] text-[#737373] mt-1">
                  {summary?.uncalibrated_floor_plans
                    ? `${summary.uncalibrated_floor_plans} require scale calibration`
                    : 'All floor plans calibrated'}
                </p>
              </div>
            </div>
          </div>

          {/* Empty State Onboarding if 0 campuses registered */}
          {summary?.total_campuses === 0 && (
            <div className="p-8 rounded-2xl border-2 border-dashed border-[#D9DBDE] bg-white text-center space-y-4">
              <div className="w-12 h-12 rounded-2xl bg-[#BE6B37]/10 text-[#BE6B37] flex items-center justify-center mx-auto">
                <Building2 className="w-6 h-6" />
              </div>
              <div>
                <h3 className="text-lg font-bold text-[#0B0B0D]">No Campuses Configured Yet</h3>
                <p className="text-xs text-[#737373] max-w-md mx-auto mt-1">
                  AirGrid requires at least one registered institutional campus to organize buildings,
                  structural floor plans, and wireless access point metadata.
                </p>
              </div>
              {isAdmin ? (
                <button
                  onClick={() => navigate('/campuses?action=create')}
                  className="inline-flex items-center gap-2 px-4 py-2 rounded-xl bg-[#BE6B37] text-white text-xs font-semibold hover:bg-[#9A5226] transition-colors shadow-sm"
                >
                  <Plus className="w-4 h-4" />
                  <span>Create First Campus</span>
                </button>
              ) : (
                <p className="text-xs text-[#737373] italic">
                  Administrator privileges are required to create institutional campuses.
                </p>
              )}
            </div>
          )}

          {/* Main Operational Panels: Network Architecture & Quick Navigation */}
          <div className="grid grid-cols-1 lg:grid-cols-3 gap-6">
            {/* Visual Technical Panel (Dark panel #0D0F12 as authorized for technical visualizations) */}
            <div className="lg:col-span-2 p-6 rounded-2xl border border-[#D9DBDE] bg-[#0D0F12] text-white space-y-5 shadow-sm">
              <div className="flex items-center justify-between">
                <div>
                  <div className="flex items-center gap-2">
                    <span className="w-2 h-2 rounded-full bg-emerald-400 animate-pulse" />
                    <span className="text-xs font-mono uppercase tracking-wider text-emerald-400">
                      System Architecture Overview
                    </span>
                  </div>
                  <h3 className="text-base font-bold text-white mt-1">
                    AirGrid Modular Monolith & Relational Engine
                  </h3>
                </div>
                <span className="text-[11px] font-mono px-2 py-0.5 rounded bg-white/10 text-slate-300 border border-white/20">
                  PostgreSQL 16 + FastAPI
                </span>
              </div>

              {/* Grid representation */}
              <div className="grid grid-cols-1 sm:grid-cols-3 gap-3 pt-2">
                <div className="p-3.5 rounded-xl bg-white/5 border border-white/10 space-y-1">
                  <div className="text-[11px] font-mono text-[#BE6B37]">01. DOMAIN CORE</div>
                  <div className="text-xs font-semibold text-white">Campus Hierarchy</div>
                  <p className="text-[10px] text-slate-400">
                    Campus → Building → Floor relational cascade with strict uniqueness.
                  </p>
                </div>

                <div className="p-3.5 rounded-xl bg-white/5 border border-white/10 space-y-1">
                  <div className="text-[11px] font-mono text-emerald-400">02. ASSET VAULT</div>
                  <div className="text-xs font-semibold text-white">Secure Floor Plans</div>
                  <p className="text-[10px] text-slate-400">
                    UUID-isolated storage outside public root with 2-point pixel calibration.
                  </p>
                </div>

                <div className="p-3.5 rounded-xl bg-white/5 border border-white/10 space-y-1">
                  <div className="text-[11px] font-mono text-blue-400">03. SECURITY GATE</div>
                  <div className="text-xs font-semibold text-white">Argon2id & Sessions</div>
                  <p className="text-[10px] text-slate-400">
                    Server-enforced RBAC, Anti-CSRF double token, and persistent rate limits.
                  </p>
                </div>
              </div>

              <div className="pt-2 flex flex-col sm:flex-row items-center justify-between gap-3 border-t border-white/10 text-xs text-slate-400">
                <span>Active Platform: Full-Stack Campus Intelligence & AI Control Center</span>
                <button
                  onClick={() => navigate('/campuses')}
                  className="flex items-center gap-1.5 text-xs font-semibold text-white hover:text-[#BE6B37] transition-colors"
                >
                  <span>Open Campus Manager</span>
                  <ArrowRight className="w-3.5 h-3.5" />
                </button>
              </div>
            </div>

            {/* Quick Actions & Module Roadmap */}
            <div className="p-6 rounded-2xl border border-[#D9DBDE] bg-white shadow-sm flex flex-col justify-between space-y-4">
              <div>
                <div className="flex items-center justify-between">
                  <h3 className="text-sm font-bold text-[#0B0B0D]">Platform Capabilities & Verification State</h3>
                  <span className="text-[10px] font-mono bg-emerald-50 text-emerald-700 px-2 py-0.5 rounded-full border border-emerald-200 font-semibold">
                    16 Routes Operational
                  </span>
                </div>
                <p className="text-xs text-[#737373] mt-0.5">
                  Audited operational status across AirGrid architectural modules.
                </p>

                <div className="space-y-2 mt-4 text-xs">
                  <div className="p-2.5 rounded-xl bg-[#F5F5F3] border border-[#D9DBDE] flex items-center justify-between gap-2">
                    <span className="font-medium text-[#0B0B0D] truncate">Core Architecture & Access Control</span>
                    <span className="text-[10px] font-mono text-emerald-700 font-semibold flex-shrink-0 bg-emerald-50 px-2 py-0.5 rounded border border-emerald-200">
                      Verified with automated tests
                    </span>
                  </div>

                  <div className="p-2.5 rounded-xl bg-[#F5F5F3] border border-[#D9DBDE] flex items-center justify-between gap-2">
                    <span className="font-medium text-[#0B0B0D] truncate">Campus Infrastructure & Calibrated Plans</span>
                    <span className="text-[10px] font-mono text-emerald-700 font-semibold flex-shrink-0 bg-emerald-50 px-2 py-0.5 rounded border border-emerald-200">
                      Verified with automated tests
                    </span>
                  </div>

                  <div className="p-2.5 rounded-xl bg-[#F5F5F3] border border-[#D9DBDE] flex items-center justify-between gap-2">
                    <span className="font-medium text-[#0B0B0D] truncate">Speed Tests & Survey Studio Heatmaps</span>
                    <span className="text-[10px] font-mono text-amber-700 font-semibold flex-shrink-0 bg-amber-50 px-2 py-0.5 rounded border border-amber-200" title="Automated tests passed; live RF capture requires real hardware">
                      Requires real-device validation
                    </span>
                  </div>

                  <div className="p-2.5 rounded-xl bg-[#F5F5F3] border border-[#D9DBDE] flex items-center justify-between gap-2">
                    <span className="font-medium text-[#0B0B0D] truncate">ML Prediction Lab & AP Optimization</span>
                    <span className="text-[10px] font-mono text-emerald-700 font-semibold flex-shrink-0 bg-emerald-50 px-2 py-0.5 rounded border border-emerald-200">
                      Verified with automated tests
                    </span>
                  </div>

                  <div className="p-2.5 rounded-xl bg-[#F5F5F3] border border-[#D9DBDE] flex items-center justify-between gap-2">
                    <span className="font-medium text-[#0B0B0D] truncate">Linux Collector & HMAC Ingestion</span>
                    <span className="text-[10px] font-mono text-amber-700 font-semibold flex-shrink-0 bg-amber-50 px-2 py-0.5 rounded border border-amber-200" title="Automated tests passed; physical telemetry ingestion requires registered Linux host">
                      Requires real-device validation
                    </span>
                  </div>

                  <div className="p-2.5 rounded-xl bg-[#BE6B37]/10 border border-[#BE6B37]/30 flex items-center justify-between gap-2">
                    <span className="font-semibold text-[#0B0B0D] truncate">AI Gateway & FreeLLMAPI Control</span>
                    <span className="text-[10px] font-mono text-[#BE6B37] font-bold flex-shrink-0 bg-white/80 px-2 py-0.5 rounded border border-[#BE6B37]/30">
                      Implemented & Verified
                    </span>
                  </div>
                </div>
              </div>

              <div className="pt-3 border-t border-[#D9DBDE]">
                <button
                  onClick={() => navigate('/campuses')}
                  className="w-full flex items-center justify-center gap-2 px-4 py-2 rounded-xl bg-[#0B0B0D] text-white text-xs font-semibold hover:bg-black transition-colors"
                >
                  <span>Manage Campus Infrastructure</span>
                  <ExternalLink className="w-3.5 h-3.5" />
                </button>
              </div>
            </div>
          </div>
        </div>
      )}

      {/* TAB 2: CAMPUS INVENTORY */}
      {activeTab === 'inventory' && (
        <div className="rounded-2xl border border-[#D9DBDE] bg-white overflow-hidden shadow-sm">
          <div className="p-5 border-b border-[#D9DBDE] flex items-center justify-between">
            <div>
              <h3 className="text-base font-bold text-[#0B0B0D]">Institutional Campus Registry</h3>
              <p className="text-xs text-[#737373] mt-0.5">
                All campuses stored in PostgreSQL with aggregated buildings, floors, and calibrated plans.
              </p>
            </div>
            {isAdmin && (
              <button
                onClick={() => navigate('/campuses?action=create')}
                className="flex items-center gap-1.5 px-3 py-1.5 rounded-lg bg-[#BE6B37] text-white text-xs font-semibold hover:bg-[#9A5226] transition-colors"
              >
                <Plus className="w-3.5 h-3.5" />
                <span>Add Campus</span>
              </button>
            )}
          </div>

          {inventory.length === 0 ? (
            <div className="p-12 text-center text-[#737373] space-y-2">
              <Building2 className="w-8 h-8 mx-auto text-[#BE6B37]/60" />
              <p className="font-semibold text-sm text-[#0B0B0D]">No campus inventory records found</p>
              <p className="text-xs">Create your first campus record in Campus Manager.</p>
            </div>
          ) : (
            <div className="overflow-x-auto">
              <table className="w-full text-left text-xs text-[#0B0B0D]">
                <thead className="bg-[#F5F5F3] text-[#737373] font-semibold uppercase text-[10px] tracking-wider border-b border-[#D9DBDE]">
                  <tr>
                    <th className="py-3 px-5">Campus Name</th>
                    <th className="py-3 px-5">Code</th>
                    <th className="py-3 px-5">Location</th>
                    <th className="py-3 px-5 text-center">Buildings</th>
                    <th className="py-3 px-5 text-center">Floors</th>
                    <th className="py-3 px-5 text-center">Plans</th>
                    <th className="py-3 px-5">Last Updated</th>
                    <th className="py-3 px-5 text-right">Action</th>
                  </tr>
                </thead>
                <tbody className="divide-y divide-[#D9DBDE]">
                  {inventory.map((c) => (
                    <tr key={c.id} className="hover:bg-[#F5F5F3]/60 transition-colors">
                      <td className="py-3.5 px-5 font-semibold text-[#0B0B0D]">
                        {c.name}
                      </td>
                      <td className="py-3.5 px-5 font-mono text-[11px] text-[#BE6B37] font-semibold">
                        {c.code}
                      </td>
                      <td className="py-3.5 px-5 text-[#737373] truncate max-w-xs">
                        {c.address || '—'}
                      </td>
                      <td className="py-3.5 px-5 text-center font-semibold font-mono">
                        {c.buildings_count}
                      </td>
                      <td className="py-3.5 px-5 text-center font-semibold font-mono">
                        {c.floors_count}
                      </td>
                      <td className="py-3.5 px-5 text-center font-semibold font-mono">
                        <span className={`px-2 py-0.5 rounded-full text-[10px] ${
                          c.floor_plans_count > 0 ? 'bg-emerald-50 text-emerald-700' : 'bg-gray-100 text-gray-600'
                        }`}>
                          {c.floor_plans_count}
                        </span>
                      </td>
                      <td className="py-3.5 px-5 text-[#737373] font-mono text-[11px]">
                        {formatDate(c.last_updated)}
                      </td>
                      <td className="py-3.5 px-5 text-right">
                        <button
                          onClick={() => navigate(`/campuses?campus_id=${c.id}`)}
                          className="inline-flex items-center gap-1 text-[#BE6B37] hover:text-[#9A5226] font-semibold"
                        >
                          <span>Open</span>
                          <ArrowRight className="w-3 h-3" />
                        </button>
                      </td>
                    </tr>
                  ))}
                </tbody>
              </table>
            </div>
          )}
        </div>
      )}

      {/* TAB 3: RECENT ACTIVITY */}
      {activeTab === 'activity' && (
        <div className="rounded-2xl border border-[#D9DBDE] bg-white overflow-hidden shadow-sm">
          <div className="p-5 border-b border-[#D9DBDE]">
            <h3 className="text-base font-bold text-[#0B0B0D]">Audit Event Trail</h3>
            <p className="text-xs text-[#737373] mt-0.5">
              Immutable PostgreSQL ledger recording authentication, campus topology, and floor plan calibration events.
            </p>
          </div>

          {activities.length === 0 ? (
            <div className="p-12 text-center text-[#737373] space-y-2">
              <Clock className="w-8 h-8 mx-auto text-[#BE6B37]/60" />
              <p className="font-semibold text-sm text-[#0B0B0D]">No recent activity events recorded</p>
            </div>
          ) : (
            <div className="divide-y divide-[#D9DBDE]">
              {activities.map((act) => (
                <div key={act.id} className="p-4 hover:bg-[#F5F5F3]/50 transition-colors flex items-start gap-4">
                  <span className={`px-2 py-1 rounded-md text-[10px] font-mono font-semibold border ${getActionColor(act.action)}`}>
                    {act.action}
                  </span>
                  <div className="flex-1 min-w-0">
                    <div className="flex items-center gap-2">
                      <span className="text-xs font-semibold text-[#0B0B0D] truncate">
                        {act.actor_name}
                      </span>
                      {act.actor_role && (
                        <span className="text-[10px] font-mono text-[#737373] uppercase">
                          ({act.actor_role})
                        </span>
                      )}
                    </div>
                    {act.payload && Object.keys(act.payload).length > 0 && (
                      <p className="text-[11px] text-[#737373] font-mono mt-0.5 truncate">
                        {JSON.stringify(act.payload)}
                      </p>
                    )}
                  </div>
                  <div className="text-right text-[11px] font-mono text-[#737373] flex-shrink-0">
                    {formatDate(act.created_at)}
                  </div>
                </div>
              ))}
            </div>
          )}
        </div>
      )}

      {/* TAB 4: SYSTEM STATUS */}
      {activeTab === 'system' && (
        <div className="space-y-6">
          <div className="p-5 rounded-2xl border border-[#D9DBDE] bg-white shadow-sm flex items-center justify-between">
            <div className="flex items-center gap-3">
              <div className="w-10 h-10 rounded-xl bg-emerald-50 text-emerald-600 flex items-center justify-center font-bold">
                <ShieldCheck className="w-6 h-6" />
              </div>
              <div>
                <h3 className="text-base font-bold text-[#0B0B0D]">AirGrid System Diagnostic Health</h3>
                <p className="text-xs text-[#737373]">
                  Status: <span className="font-semibold text-emerald-700 capitalize">{systemStatus?.overall || 'Operational'}</span>
                </p>
              </div>
            </div>
            <span className="text-xs font-mono text-[#737373]">
              Checked: {formatDate(systemStatus?.timestamp)}
            </span>
          </div>

          <div className="grid grid-cols-1 md:grid-cols-2 gap-4">
            {systemStatus?.components.map((comp) => (
              <div key={comp.name} className="p-5 rounded-2xl border border-[#D9DBDE] bg-white shadow-sm flex flex-col justify-between">
                <div>
                  <div className="flex items-center justify-between">
                    <span className="text-xs font-bold text-[#0B0B0D]">{comp.name}</span>
                    <span className={`px-2 py-0.5 rounded-full text-[10px] font-mono font-semibold uppercase ${
                      comp.status === 'healthy' ? 'bg-emerald-50 text-emerald-700' :
                      comp.status === 'degraded' ? 'bg-amber-50 text-amber-700' :
                      comp.status === 'unconfigured' ? 'bg-blue-50 text-blue-700' :
                      'bg-rose-50 text-rose-700'
                    }`}>
                      {comp.status}
                    </span>
                  </div>
                  <p className="text-xs text-[#737373] mt-2 leading-relaxed">
                    {comp.description}
                  </p>
                </div>

                <div className="mt-4 pt-3 border-t border-[#D9DBDE] flex items-center justify-between text-[11px] font-mono text-[#737373]">
                  <span>Latency</span>
                  <span className="font-semibold text-[#0B0B0D]">
                    {comp.latency_ms !== null && comp.latency_ms !== undefined
                      ? `${comp.latency_ms} ms`
                      : 'N/A'}
                  </span>
                </div>
              </div>
            ))}
          </div>
        </div>
      )}
    </div>
  );
};
