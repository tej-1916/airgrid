import React from 'react';
import { Activity, Filter, BarChart3 } from 'lucide-react';
import { MLDatasetExplorer } from '../../types/ml';

interface DatasetExplorerPanelProps {
  explorer: MLDatasetExplorer | null;
  loading: boolean;
}

export const DatasetExplorerPanel: React.FC<DatasetExplorerPanelProps> = ({
  explorer,
  loading,
}) => {
  if (loading) {
    return (
      <div className="bg-white rounded-2xl border border-[#D9DBDE] p-6 shadow-sm animate-pulse space-y-4">
        <div className="h-5 w-40 bg-slate-200 rounded"></div>
        <div className="grid grid-cols-2 md:grid-cols-4 gap-4">
          {[1, 2, 3, 4].map((i) => (
            <div key={i} className="h-16 bg-slate-100 rounded-xl"></div>
          ))}
        </div>
      </div>
    );
  }

  if (!explorer) return null;

  const {
    total_samples,
    eligible_samples,
    session_count,
    min_rssi,
    max_rssi,
    avg_rssi,
    rssi_histogram,
    provenance_breakdown,
    duplicate_locations_count,
    outliers_count,
    spatial_coverage_m2,
  } = explorer;

  const maxBinCount = Math.max(...rssi_histogram.map((b) => b.count), 1);

  return (
    <div className="bg-white rounded-2xl border border-[#D9DBDE] p-6 shadow-sm space-y-5">
      <div className="flex items-center justify-between">
        <div>
          <h3 className="text-sm font-bold text-[#0B0B0D] flex items-center gap-2">
            <Activity className="w-4 h-4 text-[#BE6B37]" />
            Dataset Telemetry & Provenance Breakdown
          </h3>
          <p className="text-xs text-[#737373] mt-0.5">
            Statistical observation distribution across architectural coordinates
          </p>
        </div>
      </div>

      {/* Metric Cards Grid */}
      <div className="grid grid-cols-2 sm:grid-cols-3 lg:grid-cols-5 gap-3">
        <div className="p-3.5 rounded-xl bg-[#F5F5F3] border border-[#D9DBDE] space-y-1">
          <div className="text-[11px] font-medium text-[#737373] uppercase tracking-wider">Total Raw Samples</div>
          <div className="text-xl font-bold font-mono text-[#0B0B0D]">{total_samples}</div>
          <div className="text-[10px] text-[#737373]">{session_count} survey sessions</div>
        </div>

        <div className="p-3.5 rounded-xl bg-[#F5F5F3] border border-[#D9DBDE] space-y-1">
          <div className="text-[11px] font-medium text-[#737373] uppercase tracking-wider">Eligible Field Data</div>
          <div className="text-xl font-bold font-mono text-emerald-700">{eligible_samples}</div>
          <div className="text-[10px] text-[#737373]">Production training set</div>
        </div>

        <div className="p-3.5 rounded-xl bg-[#F5F5F3] border border-[#D9DBDE] space-y-1">
          <div className="text-[11px] font-medium text-[#737373] uppercase tracking-wider">Average RSSI</div>
          <div className="text-xl font-bold font-mono text-[#0B0B0D]">
            {avg_rssi !== null && avg_rssi !== undefined ? `${avg_rssi} dBm` : '—'}
          </div>
          <div className="text-[10px] text-[#737373]">
            {min_rssi !== null ? `Range: ${min_rssi} to ${max_rssi} dBm` : 'No samples'}
          </div>
        </div>

        <div className="p-3.5 rounded-xl bg-[#F5F5F3] border border-[#D9DBDE] space-y-1">
          <div className="text-[11px] font-medium text-[#737373] uppercase tracking-wider">Spatial Planar Span</div>
          <div className="text-xl font-bold font-mono text-[#BE6B37]">{spatial_coverage_m2} m²</div>
          <div className="text-[10px] text-[#737373]">Bounding area extent</div>
        </div>

        <div className="p-3.5 rounded-xl bg-[#F5F5F3] border border-[#D9DBDE] space-y-1">
          <div className="text-[11px] font-medium text-[#737373] uppercase tracking-wider">Excluded Test Imports</div>
          <div className="text-xl font-bold font-mono text-amber-700">
            {provenance_breakdown['controlled_test_import'] || 0}
          </div>
          <div className="text-[10px] text-[#737373]">Non-production fixtures</div>
        </div>
      </div>

      {/* Provenance Distribution Tags */}
      <div className="p-3.5 rounded-xl bg-[#F5F5F3]/60 border border-[#D9DBDE] space-y-2">
        <div className="text-xs font-semibold text-[#0B0B0D] flex items-center gap-1.5">
          <Filter className="w-3.5 h-3.5 text-[#BE6B37]" />
          <span>Data Provenance Breakdown:</span>
        </div>
        <div className="flex flex-wrap gap-2 text-xs">
          {Object.entries(provenance_breakdown).length === 0 ? (
            <span className="text-xs text-[#737373]">No measurements found for this floor.</span>
          ) : (
            Object.entries(provenance_breakdown).map(([prov, count]) => {
              const isExcluded = prov === 'controlled_test_import';
              return (
                <div
                  key={prov}
                  className={`px-3 py-1 rounded-lg border font-mono text-[11px] flex items-center gap-2 ${
                    isExcluded
                      ? 'bg-amber-50 text-amber-900 border-amber-300'
                      : 'bg-white text-[#0B0B0D] border-[#D9DBDE]'
                  }`}
                >
                  <span className="font-semibold">{prov}:</span>
                  <span>{count} samples</span>
                  {isExcluded && (
                    <span className="text-[9px] uppercase px-1.5 py-0.2 bg-amber-200 text-amber-900 rounded font-bold">
                      Excluded from Prod
                    </span>
                  )}
                </div>
              );
            })
          )}
        </div>
      </div>

      {/* RSSI Signal Distribution Histogram */}
      {rssi_histogram.length > 0 && (
        <div className="space-y-2 pt-1">
          <div className="text-xs font-semibold text-[#0B0B0D] flex items-center justify-between">
            <span className="flex items-center gap-1.5">
              <BarChart3 className="w-3.5 h-3.5 text-[#BE6B37]" />
              Signal Strength Distribution (dBm)
            </span>
            <span className="text-[11px] text-[#737373] font-normal">
              {duplicate_locations_count > 0 && `${duplicate_locations_count} co-located points`}
              {outliers_count > 0 && ` • ${outliers_count} outliers`}
            </span>
          </div>

          <div className="grid grid-cols-7 gap-1.5 h-20 items-end bg-[#F5F5F3] p-3 rounded-xl border border-[#D9DBDE]">
            {rssi_histogram.map((bin, i) => {
              const heightPct = bin.count > 0 ? Math.max((bin.count / maxBinCount) * 100, 10) : 0;
              return (
                <div key={i} className="flex flex-col items-center h-full justify-end group relative">
                  <div
                    style={{ height: `${heightPct}%` }}
                    className={`w-full rounded-t transition-all ${
                      bin.count > 0 ? 'bg-[#BE6B37] hover:bg-[#A3592A]' : 'bg-transparent'
                    }`}
                  />
                  <div className="text-[9px] font-mono text-[#737373] mt-1 truncate w-full text-center">
                    {bin.range_label.split(' ')[0]}
                  </div>
                  {/* Tooltip */}
                  <div className="absolute -top-7 hidden group-hover:block bg-[#0B0B0D] text-white text-[10px] px-2 py-0.5 rounded shadow z-10 whitespace-nowrap">
                    {bin.range_label}: {bin.count} pts
                  </div>
                </div>
              );
            })}
          </div>
        </div>
      )}
    </div>
  );
};
