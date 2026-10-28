import React, { useRef, useState } from 'react';
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

  // Layer visibility toggles
  const [showMarkers, setShowMarkers] = useState<boolean>(true);
  const [showHeatmap, setShowHeatmap] = useState<boolean>(true);
  const [heatmapOpacity, setHeatmapOpacity] = useState<number>(0.65);

  const containerRef = useRef<HTMLDivElement>(null);
  const imageRef = useRef<HTMLImageElement>(null);

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
    const naturalWidth = imageRef.current.naturalWidth || floorPlan?.pixel_width || 1000;
    const naturalHeight = imageRef.current.naturalHeight || floorPlan?.pixel_height || 600;

    const clickX = e.clientX - rect.left;
    const clickY = e.clientY - rect.top;

    // Reject clicks outside image bounding box
    if (clickX < 0 || clickY < 0 || clickX > rect.width || clickY > rect.height) return;

    // Convert to unscaled natural image pixel coordinates
    const originalX = Math.round((clickX / rect.width) * naturalWidth);
    const originalY = Math.round((clickY / rect.height) * naturalHeight);

    onCanvasClick({ x: originalX, y: originalY });
  };

  const naturalWidth = floorPlan?.pixel_width || imageRef.current?.naturalWidth || 1000;
  const naturalHeight = floorPlan?.pixel_height || imageRef.current?.naturalHeight || 600;

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

        {/* Visibility Toggles */}
        {floorPlan && (
          <div className="flex items-center gap-3">
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
          </div>
        )}
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
                Upload a calibrated floor plan image in Campus Manager to survey radio signal coverage.
              </p>
            </div>
          </div>
        )}

        {/* Selected Point Inspector Card (Floats over canvas) */}
        {selectedMeasurement && (
          <div
            onClick={(e) => e.stopPropagation()}
            className="absolute top-4 left-4 p-3 rounded-xl bg-black/85 backdrop-blur-md border border-white/20 text-white text-xs space-y-2 shadow-2xl max-w-xs z-30"
          >
            <div className="flex items-center justify-between border-b border-white/15 pb-1.5">
              <span className="font-bold text-white uppercase tracking-wider text-[11px]">
                Point Inspector
              </span>
              <button
                onClick={() => onSelectMeasurement(null)}
                className="text-slate-400 hover:text-white text-xs font-mono"
              >
                ✕
              </button>
            </div>

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
                  {selectedMeasurement.measurement_source.replace('_', ' ')}
                </span>
              </div>
              {selectedMeasurement.network_label && (
                <div className="flex justify-between">
                  <span className="text-slate-400">SSID:</span>
                  <span className="text-slate-200">{selectedMeasurement.network_label}</span>
                </div>
              )}
              {selectedMeasurement.notes && (
                <div className="pt-1 text-[10px] text-slate-300 font-sans italic border-t border-white/10">
                  &quot;{selectedMeasurement.notes}&quot;
                </div>
              )}
            </div>

            {canMutate && onDeleteMeasurement && (
              <button
                onClick={() => {
                  onDeleteMeasurement(selectedMeasurement);
                  onSelectMeasurement(null);
                }}
                className="w-full mt-2 py-1 px-2 rounded-lg bg-rose-500/20 text-rose-300 border border-rose-500/30 hover:bg-rose-500/30 text-[11px] font-semibold flex items-center justify-center gap-1.5 transition-colors"
              >
                <Trash2 className="w-3 h-3" />
                <span>Delete Point</span>
              </button>
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
