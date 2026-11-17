import React, { useRef, useState, useMemo } from 'react';
import {
  ZoomIn,
  ZoomOut,
  RotateCcw,
  Layers,
  Eye,
  EyeOff,
  Sliders,
  Ruler,
  Trash2,
  FileImage,
  Download,
  Upload,
  LayoutGrid,
} from 'lucide-react';
import { FloorPlanAsset, Floor } from '../../types/campus';
import { SurveyMeasurement, HeatmapGridResponse } from '../../types/survey';
import { SurveyPointMarker } from './SurveyPointMarker';
import { HeatmapOverlay } from './HeatmapOverlay';
import { getSignalColor } from './SignalLegend';

interface FloorPlanSurveyCanvasProps {
  floor: Floor | null;
  floorPlan: FloorPlanAsset | null;
  measurements: SurveyMeasurement[];
  heatmap: HeatmapGridResponse | null;
  onCanvasClick: (coords: { x: number; y: number }) => void;
  selectedMeasurement: SurveyMeasurement | null;
  onSelectMeasurement: (m: SurveyMeasurement | null) => void;
  onDeleteMeasurement?: (m: SurveyMeasurement) => void;
  onRepositionMeasurement?: (m: SurveyMeasurement, newX: number, newY: number, reason?: string) => Promise<void>;
  onOpenSetupModal?: () => void;
  onOpenCalibrateModal?: () => void;
  canMutate?: boolean;
  availableNetworks?: string[];
  selectedNetwork?: string;
  onSelectNetwork?: (network: string) => void;
}

export const FloorPlanSurveyCanvas: React.FC<FloorPlanSurveyCanvasProps> = ({
  floor,
  floorPlan,
  measurements,
  heatmap,
  onCanvasClick,
  selectedMeasurement,
  onSelectMeasurement,
  onDeleteMeasurement,
  onRepositionMeasurement,
  onOpenSetupModal,
  onOpenCalibrateModal,
  canMutate = false,
  availableNetworks = [],
  selectedNetwork = '',
  onSelectNetwork,
}) => {
  // Pan and Zoom states
  const [zoomLevel, setZoomLevel] = useState<number>(1);
  const [panPosition, setPanPosition] = useState<{ x: number; y: number }>({ x: 0, y: 0 });
  const [isPanning, setIsPanning] = useState<boolean>(false);
  const [panStart, setPanStart] = useState<{ x: number; y: number }>({ x: 0, y: 0 });

  // Reposition mode states
  const [isRepositioning, setIsRepositioning] = useState<boolean>(false);
  const [repositionX, setRepositionX] = useState<number>(0);
  const [repositionY, setRepositionY] = useState<number>(0);
  const [repositionReason, setRepositionReason] = useState<string>('');
  const [repositioningLoading, setRepositioningLoading] = useState<boolean>(false);

  // Sync repositioning inputs when selected measurement changes
  React.useEffect(() => {
    if (selectedMeasurement) {
      setRepositionX(selectedMeasurement.position_x);
      setRepositionY(selectedMeasurement.position_y);
      setRepositionReason('');
      setIsRepositioning(false);
    }
  }, [selectedMeasurement]);

  // Layer visibility toggles
  const [showMarkers, setShowMarkers] = useState<boolean>(true);
  const [showHeatmap, setShowHeatmap] = useState<boolean>(true);
  const [heatmapOpacity, setHeatmapOpacity] = useState<number>(0.65);
  const [exportingPng, setExportingPng] = useState<boolean>(false);

  const containerRef = useRef<HTMLDivElement>(null);
  const imageRef = useRef<HTMLImageElement>(null);

  // Natural dimensions
  const naturalWidth = floorPlan?.pixel_width || imageRef.current?.naturalWidth || 1000;
  const naturalHeight = floorPlan?.pixel_height || imageRef.current?.naturalHeight || 600;

  // Model prediction calculation at selected measurement position
  const selectedPrediction = useMemo(() => {
    if (!selectedMeasurement || !heatmap || !heatmap.grid_data || !heatmap.grid_data.length) return null;
    const nw = naturalWidth || 1;
    const nh = naturalHeight || 1;
    const c = Math.floor((selectedMeasurement.position_x / nw) * heatmap.grid_width);
    const r = Math.floor((selectedMeasurement.position_y / nh) * heatmap.grid_height);
    if (r >= 0 && r < heatmap.grid_height && c >= 0 && c < heatmap.grid_width) {
      const val = heatmap.grid_data[r]?.[c];
      return val !== undefined ? val : null;
    }
    return null;
  }, [selectedMeasurement, heatmap, naturalWidth, naturalHeight]);

  // Zoom handlers
  const handleZoomIn = () => setZoomLevel((z) => Math.min(z + 0.25, 4));
  const handleZoomOut = () => setZoomLevel((z) => Math.max(z - 0.25, 0.5));
  const handleResetZoom = () => {
    setZoomLevel(1);
    setPanPosition({ x: 0, y: 0 });
  };

  // Pan handlers
  const handleMouseDown = (e: React.MouseEvent) => {
    if (e.button !== 0) return; // Primary button only
    setIsPanning(true);
    setPanStart({ x: e.clientX - panPosition.x, y: e.clientY - panPosition.y });
  };

  const handleMouseMove = (e: React.MouseEvent) => {
    if (!isPanning) return;
    setPanPosition({
      x: e.clientX - panStart.x,
      y: e.clientY - panStart.y,
    });
  };

  const handleMouseUp = () => setIsPanning(false);

  // Canvas Image Click: Converts client click offset to natural floor plan pixel coordinates
  const handleImageClick = (e: React.MouseEvent<HTMLImageElement>) => {
    if (!imageRef.current || isPanning) return;
    const rect = imageRef.current.getBoundingClientRect();
    const nw = imageRef.current.naturalWidth || floorPlan?.pixel_width || 1000;
    const nh = imageRef.current.naturalHeight || floorPlan?.pixel_height || 600;

    const clickX = e.clientX - rect.left;
    const clickY = e.clientY - rect.top;

    // Reject clicks outside image bounding box
    if (clickX < 0 || clickY < 0 || clickX > rect.width || clickY > rect.height) return;

    // Convert to unscaled natural image pixel coordinates
    const originalX = Math.round((clickX / rect.width) * nw);
    const originalY = Math.round((clickY / rect.height) * nh);

    onCanvasClick({ x: originalX, y: originalY });
  };

  // Export full composite canvas (floor plan + heatmap + markers + scale) to PNG
  const handleExportPng = () => {
    if (!floorPlan || !imageRef.current) return;
    try {
      setExportingPng(true);
      const canvas = document.createElement('canvas');
      canvas.width = naturalWidth;
      canvas.height = naturalHeight;
      const ctx = canvas.getContext('2d');
      if (!ctx) return;

      // 1. Draw base floor plan image
      ctx.drawImage(imageRef.current, 0, 0, naturalWidth, naturalHeight);

      // 2. Draw heatmap overlay if visible
      if (showHeatmap && heatmap && heatmap.grid_data) {
        const off = document.createElement('canvas');
        off.width = heatmap.grid_width;
        off.height = heatmap.grid_height;
        const offCtx = off.getContext('2d');
        if (offCtx) {
          const imgData = offCtx.createImageData(heatmap.grid_width, heatmap.grid_height);
          for (let r = 0; r < heatmap.grid_height; r++) {
            for (let c = 0; c < heatmap.grid_width; c++) {
              const val = heatmap.grid_data[r]?.[c];
              const idx = (r * heatmap.grid_width + c) * 4;
              if (val !== null && val !== undefined) {
                const cl = Math.max(-90, Math.min(-30, val));
                let rVal = 16, gVal = 185, bVal = 129;
                if (cl < -75) { rVal = 225; gVal = 29; bVal = 72; }
                else if (cl < -67) { rVal = 245; gVal = 158; bVal = 11; }
                else if (cl < -50) { rVal = 13; gVal = 148; bVal = 136; }
                imgData.data[idx] = rVal;
                imgData.data[idx + 1] = gVal;
                imgData.data[idx + 2] = bVal;
                imgData.data[idx + 3] = Math.round(heatmapOpacity * 255);
              }
            }
          }
          offCtx.putImageData(imgData, 0, 0);
          ctx.drawImage(off, 0, 0, naturalWidth, naturalHeight);
        }
      }

      // 3. Draw survey points if visible
      if (showMarkers) {
        measurements.forEach((m) => {
          ctx.beginPath();
          ctx.arc(m.position_x, m.position_y, 7, 0, 2 * Math.PI);
          ctx.fillStyle = m.rssi_dbm >= -50 ? '#10B981' : m.rssi_dbm >= -67 ? '#0D9488' : m.rssi_dbm >= -75 ? '#D97706' : '#E11D48';
          ctx.fill();
          ctx.lineWidth = 2;
          ctx.strokeStyle = '#FFFFFF';
          ctx.stroke();

          ctx.fillStyle = '#0B0B0D';
          ctx.font = 'bold 10px monospace';
          ctx.fillText(`${m.rssi_dbm}dBm`, m.position_x + 10, m.position_y + 4);
        });
      }

      // 4. Stamp title block
      ctx.fillStyle = 'rgba(11, 11, 13, 0.85)';
      ctx.fillRect(10, 10, 320, 50);
      ctx.fillStyle = '#FFFFFF';
      ctx.font = 'bold 13px sans-serif';
      ctx.fillText(`AirGrid RF Survey — ${floor?.name || 'Floor'}`, 20, 30);
      ctx.fillStyle = '#D9DBDE';
      ctx.font = '10px monospace';
      ctx.fillText(
        `Scale: ${floorPlan.scale_pixels_per_meter.toFixed(1)} px/m | ${measurements.length} Points`,
        20,
        48
      );

      // Trigger download
      canvas.toBlob((blob) => {
        if (!blob) return;
        const url = URL.createObjectURL(blob);
        const a = document.createElement('a');
        a.href = url;
        const floorClean = (floor?.name || 'floor').toLowerCase().replace(/\s+/g, '_');
        a.download = `airgrid_heatmap_${floorClean}.png`;
        document.body.appendChild(a);
        a.click();
        document.body.removeChild(a);
        URL.revokeObjectURL(url);
        setExportingPng(false);
      }, 'image/png');
    } catch {
      setExportingPng(false);
    }
  };

  return (
    <div className="rounded-xl border border-[#D9DBDE] bg-white overflow-hidden shadow-xs flex flex-col h-[600px] relative">
      {/* Canvas Top Bar: Calibration status & Layer Controls */}
      <div className="p-2.5 px-4 bg-white border-b border-[#D9DBDE] flex items-center justify-between text-xs flex-wrap gap-2 z-20">
        <div className="flex items-center gap-3">
          <div className="flex items-center gap-1.5 font-semibold text-[#0B0B0D]">
            <Layers className="w-4 h-4 text-[#BE6B37]" />
            <span>Airspace Workspace</span>
          </div>

          {floorPlan && (
            <span
              className={`px-2 py-0.5 rounded-full text-[10px] font-mono font-bold flex items-center gap-1 ${
                floorPlan.is_calibrated
                  ? 'bg-emerald-50 text-emerald-800 border border-emerald-200'
                  : 'bg-amber-50 text-amber-800 border border-amber-200'
              }`}
            >
              <Ruler className="w-3 h-3" />
              <span>
                {floorPlan.is_calibrated
                  ? `Calibrated: ${floorPlan.scale_pixels_per_meter.toFixed(1)} px/m`
                  : 'Uncalibrated (Default 20 px/m)'}
              </span>
            </span>
          )}

          {availableNetworks.length > 1 ? (
            <div className="flex items-center gap-1.5 bg-[#BE6B37]/10 border border-[#BE6B37]/20 rounded-full px-2 py-0.5">
              <span className="text-[10px] font-mono font-bold text-[#BE6B37]">SSID:</span>
              <select
                value={selectedNetwork || availableNetworks[0]}
                onChange={(e) => onSelectNetwork && onSelectNetwork(e.target.value)}
                className="bg-transparent text-[10px] font-mono font-bold text-[#BE6B37] focus:outline-none cursor-pointer"
                title="Select network to view per-network coverage heatmap"
              >
                {availableNetworks.map((net) => (
                  <option key={net} value={net} className="bg-white text-[#0B0B0D]">
                    {net}
                  </option>
                ))}
              </select>
            </div>
          ) : (heatmap?.network_label || (availableNetworks.length === 1 ? availableNetworks[0] : null)) ? (
            <span className="text-[10px] font-mono px-2 py-0.5 rounded-full font-semibold bg-[#BE6B37]/10 text-[#BE6B37] border border-[#BE6B37]/20">
              SSID: {heatmap?.network_label || availableNetworks[0]}
            </span>
          ) : null}

          {heatmap?.convex_hull_support && (
            <span
              className="text-[10px] font-mono px-2 py-0.5 rounded-full font-semibold bg-emerald-50 text-emerald-700 border border-emerald-200"
              title="Spatial extrapolation outside measured perimeter masked"
            >
              Hull Mask Active
            </span>
          )}
        </div>

        {/* Visibility Toggles & Actions */}
        {floorPlan ? (
          <div className="flex items-center gap-2 flex-wrap">
            {canMutate && onOpenCalibrateModal && (
              <button
                onClick={onOpenCalibrateModal}
                className="flex items-center gap-1 px-2 py-1 rounded-lg border border-[#D9DBDE] bg-white text-xs font-semibold text-[#0B0B0D] hover:bg-[#F5F5F3] transition-colors"
                title="Calibrate scale in pixels per meter"
              >
                <Ruler className="w-3.5 h-3.5 text-[#BE6B37]" />
                <span className="hidden sm:inline">Calibrate</span>
              </button>
            )}

            {canMutate && onOpenSetupModal && (
              <button
                onClick={onOpenSetupModal}
                className="flex items-center gap-1 px-2 py-1 rounded-lg border border-[#D9DBDE] bg-white text-xs font-semibold text-[#0B0B0D] hover:bg-[#F5F5F3] transition-colors"
                title="Change or upload a new floor plan"
              >
                <Layers className="w-3.5 h-3.5 text-[#BE6B37]" />
                <span className="hidden sm:inline">Setup Plan</span>
              </button>
            )}

            <button
              onClick={() => setShowMarkers(!showMarkers)}
              className={`flex items-center gap-1 px-2 py-1 rounded-lg border text-xs font-semibold transition-colors ${
                showMarkers
                  ? 'border-[#BE6B37] bg-[#BE6B37]/10 text-[#BE6B37]'
                  : 'border-[#D9DBDE] text-[#737373] hover:text-[#0B0B0D]'
              }`}
            >
              {showMarkers ? <Eye className="w-3.5 h-3.5" /> : <EyeOff className="w-3.5 h-3.5" />}
              <span>Points ({measurements.length})</span>
            </button>

            <button
              onClick={() => setShowHeatmap(!showHeatmap)}
              disabled={!heatmap}
              className={`flex items-center gap-1 px-2 py-1 rounded-lg border text-xs font-semibold transition-colors ${
                !heatmap
                  ? 'border-[#D9DBDE] text-[#737373] opacity-40 cursor-not-allowed'
                  : showHeatmap
                  ? 'border-[#BE6B37] bg-[#BE6B37]/10 text-[#BE6B37]'
                  : 'border-[#D9DBDE] text-[#737373] hover:text-[#0B0B0D]'
              }`}
            >
              {showHeatmap ? <Eye className="w-3.5 h-3.5" /> : <EyeOff className="w-3.5 h-3.5" />}
              <span>Heatmap</span>
            </button>

            {/* Opacity slider */}
            {showHeatmap && heatmap && (
              <div className="flex items-center gap-1.5 pl-2 border-l border-[#D9DBDE]">
                <Sliders className="w-3.5 h-3.5 text-[#737373]" />
                <input
                  type="range"
                  min="0.1"
                  max="1.0"
                  step="0.05"
                  value={heatmapOpacity}
                  onChange={(e) => setHeatmapOpacity(parseFloat(e.target.value))}
                  className="w-16 accent-[#BE6B37] cursor-pointer"
                  title="Heatmap Opacity"
                />
                <span className="text-[10px] font-mono text-[#737373] w-7">
                  {Math.round(heatmapOpacity * 100)}%
                </span>
              </div>
            )}

            {/* Export PNG button */}
            <button
              onClick={handleExportPng}
              disabled={exportingPng}
              className="flex items-center gap-1 px-2 py-1 rounded-lg border border-[#D9DBDE] bg-white text-xs font-semibold text-[#0B0B0D] hover:bg-[#F5F5F3] transition-colors"
              title="Download calibrated floor plan and heatmap as PNG image"
            >
              <Download className="w-3.5 h-3.5 text-[#BE6B37]" />
              <span className="hidden sm:inline">{exportingPng ? 'Exporting...' : 'Export PNG'}</span>
            </button>
          </div>
        ) : canMutate && onOpenSetupModal ? (
          <button
            onClick={onOpenSetupModal}
            className="flex items-center gap-1.5 px-3 py-1 rounded-lg bg-[#BE6B37] text-white text-xs font-semibold hover:bg-[#9A5226] transition-colors shadow-xs"
          >
            <Upload className="w-3.5 h-3.5" />
            <span>Add Floor Plan</span>
          </button>
        ) : null}
      </div>

      {/* Main Technical Floor Plan Viewing Area (#0D0F12) */}
      <div
        ref={containerRef}
        onMouseDown={handleMouseDown}
        onMouseMove={handleMouseMove}
        onMouseUp={handleMouseUp}
        onMouseLeave={handleMouseUp}
        className="flex-1 bg-[#0D0F12] overflow-hidden relative flex items-center justify-center select-none cursor-crosshair"
      >
        {floorPlan ? (
          <div
            style={{
              transform: `translate(${panPosition.x}px, ${panPosition.y}px) scale(${zoomLevel})`,
              transformOrigin: 'center center',
              transition: isPanning ? 'none' : 'transform 0.15s ease-out',
            }}
            className="relative max-w-full max-h-full"
          >
            {/* Base Architectural Floor Plan Raster */}
            <img
              ref={imageRef}
              src={floorPlan.image_url}
              alt={floor?.name || 'Floor Plan'}
              onClick={handleImageClick}
              className="max-w-none shadow-2xl rounded border border-white/20 block"
              style={{ maxHeight: '520px' }}
            />

            {/* IDW Estimated Heatmap Layer */}
            {heatmap && (
              <HeatmapOverlay
                heatmap={heatmap}
                opacity={heatmapOpacity}
                visible={showHeatmap}
              />
            )}

            {/* Measured Survey Points Overlay */}
            {showMarkers &&
              measurements.map((m) => (
                <SurveyPointMarker
                  key={m.id}
                  measurement={m}
                  naturalWidth={naturalWidth}
                  naturalHeight={naturalHeight}
                  isSelected={selectedMeasurement?.id === m.id}
                  onClick={(pt) => onSelectMeasurement(pt)}
                />
              ))}
          </div>
        ) : (
          /* Empty State when no floor plan is uploaded */
          <div className="p-8 text-center text-slate-400 space-y-3 max-w-sm">
            <div className="w-12 h-12 rounded-xl bg-white/5 border border-white/10 flex items-center justify-center mx-auto text-[#BE6B37]">
              <FileImage className="w-6 h-6" />
            </div>
            <div>
              <h4 className="text-sm font-bold text-white">No Floor Plan Found</h4>
              <p className="text-xs text-slate-400 mt-1">
                Upload an authorized blueprint image or generate a dimensioned floor outline to survey radio coverage.
              </p>
            </div>
            {canMutate && onOpenSetupModal && (
              <div className="flex flex-col sm:flex-row items-center justify-center gap-2 pt-2">
                <button
                  onClick={onOpenSetupModal}
                  className="w-full sm:w-auto py-1.5 px-3 rounded-lg bg-[#BE6B37] text-white text-xs font-semibold hover:bg-[#9A5226] active:scale-[0.98] flex items-center justify-center gap-1.5 shadow-xs transition-colors"
                >
                  <Upload className="w-3.5 h-3.5" />
                  <span>Upload Blueprint</span>
                </button>
                <button
                  onClick={onOpenSetupModal}
                  className="w-full sm:w-auto py-1.5 px-3 rounded-lg border border-white/20 bg-white/10 hover:bg-white/20 text-white text-xs font-semibold active:scale-[0.98] flex items-center justify-center gap-1.5 transition-colors"
                >
                  <LayoutGrid className="w-3.5 h-3.5 text-[#BE6B37]" />
                  <span>Generate Outline</span>
                </button>
              </div>
            )}
          </div>
        )}

        {/* Selected Point Inspector Card (Floats over canvas) */}
        {selectedMeasurement && (
          <div
            onClick={(e) => e.stopPropagation()}
            className="absolute top-4 left-4 p-3.5 rounded-xl bg-black/90 backdrop-blur-md border border-white/20 text-white text-xs space-y-2.5 shadow-2xl max-w-sm z-30"
          >
            <div className="flex items-center justify-between border-b border-white/15 pb-1.5">
              <div className="flex items-center gap-1.5">
                <span className="font-bold text-white uppercase tracking-wider text-[11px]">
                  Point Inspector
                </span>
                <span className={`px-1.5 py-0.2 rounded text-[9px] font-mono font-bold ${
                  selectedMeasurement.data_provenance === 'field_instrument_verified'
                    ? 'bg-emerald-500/20 text-emerald-300 border border-emerald-500/40'
                    : 'bg-amber-500/20 text-amber-300 border border-amber-500/40'
                }`}>
                  {selectedMeasurement.data_provenance === 'field_instrument_verified' ? 'Verified Telemetry' : 'Operator Reported'}
                </span>
              </div>
              <button
                onClick={() => onSelectMeasurement(null)}
                className="text-slate-400 hover:text-white text-xs font-mono ml-2"
              >
                ✕
              </button>
            </div>

            {!isRepositioning ? (
              <>
                <div className="space-y-1 font-mono text-[11px]">
                  <div className="flex justify-between">
                    <span className="text-slate-400">Position:</span>
                    <span>({selectedMeasurement.position_x}, {selectedMeasurement.position_y}) px</span>
                  </div>
                  <div className="flex justify-between">
                    <span className="text-slate-400">Signal:</span>
                    <span
                      style={{ color: getSignalColor(selectedMeasurement.rssi_dbm).hex }}
                      className="font-bold"
                    >
                      {selectedMeasurement.rssi_dbm} dBm
                    </span>
                  </div>
                  <div className="flex justify-between">
                    <span className="text-slate-400">Source:</span>
                    <span className="text-slate-200 capitalize">
                      {selectedMeasurement.measurement_source.replace(/_/g, ' ')}
                    </span>
                  </div>
                  {selectedMeasurement.network_label && (
                    <div className="flex justify-between">
                      <span className="text-slate-400">SSID:</span>
                      <span className="text-slate-200">{selectedMeasurement.network_label}</span>
                    </div>
                  )}
                  {selectedMeasurement.ap_reference && (
                    <div className="flex justify-between">
                      <span className="text-slate-400">AP / BSSID:</span>
                      <span className="text-slate-200">{selectedMeasurement.ap_reference}</span>
                    </div>
                  )}
                  {selectedMeasurement.frequency_mhz && (
                    <div className="flex justify-between">
                      <span className="text-slate-400">Freq/Channel:</span>
                      <span className="text-slate-200">
                        {selectedMeasurement.frequency_mhz} MHz {selectedMeasurement.channel ? `(Ch ${selectedMeasurement.channel})` : ''}
                      </span>
                    </div>
                  )}
                  {selectedMeasurement.rx_bitrate_mbps && (
                    <div className="flex justify-between">
                      <span className="text-slate-400">PHY Link:</span>
                      <span className="text-slate-200">
                        RX {selectedMeasurement.rx_bitrate_mbps} / TX {selectedMeasurement.tx_bitrate_mbps ?? '—'} Mbps
                      </span>
                    </div>
                  )}
                  {heatmap && (
                    <div className="pt-1.5 border-t border-white/10 space-y-1">
                      <div className="flex justify-between">
                        <span className="text-slate-400">IDW Prediction:</span>
                        <span className="font-semibold text-white">
                          {selectedPrediction !== null ? `${selectedPrediction.toFixed(1)} dBm` : 'Masked / Unmeasured'}
                        </span>
                      </div>
                      {selectedPrediction !== null && (
                        <div className="flex justify-between">
                          <span className="text-slate-400">Model Residual (Δ):</span>
                          <span className={`font-bold ${
                            Math.abs(selectedMeasurement.rssi_dbm - selectedPrediction) <= 3
                              ? 'text-emerald-400'
                              : Math.abs(selectedMeasurement.rssi_dbm - selectedPrediction) <= 6
                              ? 'text-amber-400'
                              : 'text-rose-400'
                          }`}>
                            {(selectedMeasurement.rssi_dbm - selectedPrediction >= 0 ? '+' : '')}
                            {(selectedMeasurement.rssi_dbm - selectedPrediction).toFixed(1)} dBm
                          </span>
                        </div>
                      )}
                    </div>
                  )}
                  <div className="flex justify-between pt-1 border-t border-white/10 text-[10px]">
                    <span className="text-slate-400">Observed:</span>
                    <span className="text-slate-300">
                      {new Date(selectedMeasurement.observed_at).toLocaleString()}
                    </span>
                  </div>
                  {selectedMeasurement.notes && (
                    <div className="pt-1 text-[10px] text-slate-300 font-sans italic border-t border-white/10">
                      &quot;{selectedMeasurement.notes}&quot;
                    </div>
                  )}
                </div>

                {canMutate && (
                  <div className="flex items-center gap-2 pt-1 border-t border-white/10">
                    {onRepositionMeasurement && (
                      <button
                        onClick={() => setIsRepositioning(true)}
                        className="flex-1 py-1 px-2 rounded-lg bg-white/10 hover:bg-white/20 text-white text-[11px] font-semibold flex items-center justify-center gap-1 transition-colors"
                      >
                        <Sliders className="w-3 h-3 text-[#BE6B37]" />
                        <span>Reposition</span>
                      </button>
                    )}
                    {onDeleteMeasurement && (
                      <button
                        onClick={() => {
                          onDeleteMeasurement(selectedMeasurement);
                          onSelectMeasurement(null);
                        }}
                        className="py-1 px-2.5 rounded-lg bg-rose-500/20 text-rose-300 border border-rose-500/30 hover:bg-rose-500/30 text-[11px] font-semibold flex items-center justify-center gap-1 transition-colors"
                      >
                        <Trash2 className="w-3 h-3" />
                        <span>Delete</span>
                      </button>
                    )}
                  </div>
                )}
              </>
            ) : (
              <div className="space-y-2 pt-1">
                <p className="text-[11px] text-slate-300">Correct mistaken coordinate placement:</p>
                <div className="grid grid-cols-2 gap-2">
                  <div>
                    <label className="text-[10px] text-slate-400 block mb-0.5">X (px)</label>
                    <input
                      type="number"
                      value={repositionX}
                      onChange={(e) => setRepositionX(parseFloat(e.target.value) || 0)}
                      className="w-full bg-black/60 border border-white/20 rounded px-2 py-1 text-xs text-white font-mono"
                    />
                  </div>
                  <div>
                    <label className="text-[10px] text-slate-400 block mb-0.5">Y (px)</label>
                    <input
                      type="number"
                      value={repositionY}
                      onChange={(e) => setRepositionY(parseFloat(e.target.value) || 0)}
                      className="w-full bg-black/60 border border-white/20 rounded px-2 py-1 text-xs text-white font-mono"
                    />
                  </div>
                </div>
                <div>
                  <label className="text-[10px] text-slate-400 block mb-0.5">Audit Reason</label>
                  <input
                    type="text"
                    placeholder="e.g. Adjusted 2m north to match column"
                    value={repositionReason}
                    onChange={(e) => setRepositionReason(e.target.value)}
                    className="w-full bg-black/60 border border-white/20 rounded px-2 py-1 text-xs text-white"
                  />
                </div>
                <div className="flex items-center gap-2 pt-1">
                  <button
                    type="button"
                    onClick={() => setIsRepositioning(false)}
                    disabled={repositioningLoading}
                    className="flex-1 py-1 rounded bg-white/10 hover:bg-white/20 text-xs font-semibold"
                  >
                    Cancel
                  </button>
                  <button
                    type="button"
                    disabled={repositioningLoading}
                    onClick={async () => {
                      if (!onRepositionMeasurement) return;
                      try {
                        setRepositioningLoading(true);
                        await onRepositionMeasurement(
                          selectedMeasurement,
                          repositionX,
                          repositionY,
                          repositionReason.trim() || undefined
                        );
                        setIsRepositioning(false);
                      } finally {
                        setRepositioningLoading(false);
                      }
                    }}
                    className="flex-1 py-1 rounded bg-[#BE6B37] hover:bg-[#9A5226] text-xs font-semibold text-white disabled:opacity-50"
                  >
                    {repositioningLoading ? 'Saving...' : 'Save Position'}
                  </button>
                </div>
              </div>
            )}
          </div>
        )}

        {/* Floating Zoom & Pan Control Toolbar */}
        {floorPlan && (
          <div className="absolute bottom-4 right-4 flex items-center gap-1.5 bg-black/70 backdrop-blur-md p-1 rounded-xl border border-white/20 text-white shadow-lg z-20">
            <button
              onClick={handleZoomIn}
              className="p-1.5 hover:bg-white/20 rounded-lg transition-colors"
              title="Zoom In"
            >
              <ZoomIn className="w-4 h-4" />
            </button>
            <button
              onClick={handleZoomOut}
              className="p-1.5 hover:bg-white/20 rounded-lg transition-colors"
              title="Zoom Out"
            >
              <ZoomOut className="w-4 h-4" />
            </button>
            <button
              onClick={handleResetZoom}
              className="p-1.5 hover:bg-white/20 rounded-lg transition-colors font-mono text-xs"
              title="Reset View"
            >
              <RotateCcw className="w-3.5 h-3.5" />
            </button>
          </div>
        )}
      </div>
    </div>
  );
};
