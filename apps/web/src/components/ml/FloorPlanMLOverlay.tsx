import React, { useState, useRef, useEffect } from 'react';
import {
  ZoomIn,
  ZoomOut,
  RotateCcw,
  Layers,
  Sliders,
  Info,
} from 'lucide-react';
import { MLPredictionMap } from '../../types/ml';

interface FloorPlanMLOverlayProps {
  predictionMap: MLPredictionMap | null;
  floorPlanUrl?: string | null;
  floorName?: string;
  loading: boolean;
}

// Convert RSSI dBm (-90 to -30) into RGBA
function rssiToRgba(rssi: number, alpha: number): [number, number, number, number] {
  const clamped = Math.max(-90, Math.min(-30, rssi));
  let r = 0, g = 0, b = 0;

  if (clamped < -75) {
    // -90 to -75: Deep Red to Amber
    const t = (clamped - (-90)) / 15;
    r = Math.round(225 + t * (245 - 225));
    g = Math.round(29 + t * (158 - 29));
    b = Math.round(72 + t * (11 - 72));
  } else if (clamped < -67) {
    // -75 to -67: Amber to Yellow-Green/Teal
    const t = (clamped - (-75)) / 8;
    r = Math.round(245 + t * (13 - 245));
    g = Math.round(158 + t * (148 - 158));
    b = Math.round(11 + t * (136 - 11));
  } else if (clamped < -50) {
    // -67 to -50: Teal to Green
    const t = (clamped - (-67)) / 17;
    r = Math.round(13 + t * (16 - 13));
    g = Math.round(148 + t * (185 - 148));
    b = Math.round(136 + t * (129 - 136));
  } else {
    // -50 to -30: Emerald to Intense Green
    const t = (clamped - (-50)) / 20;
    r = Math.round(16 + t * (5 - 16));
    g = Math.round(185 + t * (230 - 185));
    b = Math.round(129 + t * (110 - 129));
  }
  return [r, g, b, Math.round(alpha * 255)];
}

// Divergent map for Delta (ML - IDW): Blue (negative) -> White (0) -> Orange/Red (positive)
function deltaToRgba(delta: number, alpha: number): [number, number, number, number] {
  const clamped = Math.max(-10, Math.min(10, delta));
  let r = 255, g = 255, b = 255;

  if (clamped < 0) {
    // -10 to 0: Blue to White
    const t = (clamped - (-10)) / 10;
    r = Math.round(37 + t * (255 - 37));
    g = Math.round(99 + t * (255 - 99));
    b = Math.round(235 + t * (255 - 235));
  } else {
    // 0 to +10: White to Copper/Red
    const t = clamped / 10;
    r = Math.round(255 + t * (190 - 255));
    g = Math.round(255 + t * (107 - 255));
    b = Math.round(255 + t * (55 - 255));
  }
  return [r, g, b, Math.round(alpha * 255)];
}

export const FloorPlanMLOverlay: React.FC<FloorPlanMLOverlayProps> = ({
  predictionMap,
  floorPlanUrl,
  floorName,
  loading,
}) => {
  const [activeLayer, setActiveLayer] = useState<'ml' | 'idw' | 'delta'>('ml');
  const [opacity, setOpacity] = useState<number>(0.65);
  const [zoom, setZoom] = useState<number>(1);
  const [pan, setPan] = useState<{ x: number; y: number }>({ x: 0, y: 0 });
  const [isPanning, setIsPanning] = useState<boolean>(false);
  const [startPan, setStartPan] = useState<{ x: number; y: number }>({ x: 0, y: 0 });

  const canvasRef = useRef<HTMLCanvasElement>(null);

  // Render heatmap onto offscreen/overlay canvas
  useEffect(() => {
    if (!predictionMap || !canvasRef.current) return;

    const canvas = canvasRef.current;
    const ctx = canvas.getContext('2d');
    if (!ctx) return;

    const gridRows = predictionMap.grid_height;
    const gridCols = predictionMap.grid_width;
    const width = predictionMap.pixel_width;
    const height = predictionMap.pixel_height;

    canvas.width = width;
    canvas.height = height;
    ctx.clearRect(0, 0, width, height);

    // Pick active matrix
    let matrix: (number | null)[][];
    if (activeLayer === 'ml') {
      matrix = predictionMap.grid_data;
    } else if (activeLayer === 'idw') {
      matrix = predictionMap.idw_grid_data;
    } else {
      matrix = predictionMap.delta_grid_data;
    }

    if (!matrix || matrix.length === 0) return;

    // Create low-res ImageData to draw into
    const offscreen = document.createElement('canvas');
    offscreen.width = gridCols;
    offscreen.height = gridRows;
    const offCtx = offscreen.getContext('2d');
    if (!offCtx) return;

    const imgData = offCtx.createImageData(gridCols, gridRows);
    const data = imgData.data;

    for (let r = 0; r < gridRows; r++) {
      for (let c = 0; c < gridCols; c++) {
        const val = matrix[r]?.[c];
        const idx = (r * gridCols + c) * 4;

        if (val === null || val === undefined) {
          data[idx + 3] = 0; // Transparent
        } else {
          const [red, green, blue, alphaVal] =
            activeLayer === 'delta'
              ? deltaToRgba(val, opacity)
              : rssiToRgba(val, opacity);
          data[idx] = red;
          data[idx + 1] = green;
          data[idx + 2] = blue;
          data[idx + 3] = alphaVal;
        }
      }
    }

    offCtx.putImageData(imgData, 0, 0);

    // Upscale smoothly with bicubic interpolation
    ctx.imageSmoothingEnabled = true;
    ctx.imageSmoothingQuality = 'high';
    ctx.drawImage(offscreen, 0, 0, width, height);
  }, [predictionMap, activeLayer, opacity]);

  const handleMouseDown = (e: React.MouseEvent) => {
    setIsPanning(true);
    setStartPan({ x: e.clientX - pan.x, y: e.clientY - pan.y });
  };

  const handleMouseMove = (e: React.MouseEvent) => {
    if (!isPanning) return;
    setPan({ x: e.clientX - startPan.x, y: e.clientY - startPan.y });
  };

  const handleMouseUp = () => {
    setIsPanning(false);
  };

  const resetView = () => {
    setZoom(1);
    setPan({ x: 0, y: 0 });
  };

  if (loading) {
    return (
      <div className="bg-white rounded-2xl border border-[#D9DBDE] p-12 text-center shadow-sm animate-pulse space-y-4">
        <div className="h-6 w-56 bg-slate-200 rounded mx-auto"></div>
        <div className="h-64 bg-slate-100 rounded-2xl"></div>
      </div>
    );
  }

  if (!predictionMap) {
    return (
      <div className="bg-white rounded-2xl border border-[#D9DBDE] p-10 text-center shadow-sm space-y-3">
        <div className="w-12 h-12 rounded-2xl bg-[#F5F5F3] border border-[#D9DBDE] flex items-center justify-center mx-auto text-[#737373]">
          <Layers className="w-6 h-6" />
        </div>
        <h4 className="text-sm font-bold text-[#0B0B0D]">No Active Prediction Overlay</h4>
        <p className="text-xs text-[#737373] max-w-sm mx-auto">
          Select a trained model from the registry above and click "Overlay" to project its 2D spatial
          predictions onto this floor plan.
        </p>
      </div>
    );
  }

  return (
    <div className="bg-white rounded-2xl border border-[#D9DBDE] shadow-sm overflow-hidden space-y-0">
      {/* Disclaimer Banner */}
      <div className="bg-amber-50 border-b border-amber-200 px-4 py-2.5 flex items-center justify-between text-xs text-amber-900">
        <div className="flex items-center gap-2">
          <Info className="w-4 h-4 text-[#BE6B37] flex-shrink-0" />
          <span className="font-semibold">{predictionMap.confidence_notice}</span>
          <span className="text-[11px] text-amber-800 hidden sm:inline">
            (Separated from raw measurements and IDW estimates)
          </span>
        </div>
        <div className="text-[11px] font-mono font-semibold">
          Model: {predictionMap.model_name}
        </div>
      </div>

      {/* Toolbar Controls */}
      <div className="p-4 border-b border-[#D9DBDE] bg-[#F5F5F3] flex flex-wrap items-center justify-between gap-4">
        {/* Layer Mode Selector */}
        <div className="flex items-center gap-1.5 p-1 rounded-xl bg-white border border-[#D9DBDE]">
          <button
            onClick={() => setActiveLayer('ml')}
            className={`px-3 py-1.5 rounded-lg text-xs font-semibold transition-all ${
              activeLayer === 'ml'
                ? 'bg-[#BE6B37] text-white shadow-sm'
                : 'text-[#737373] hover:text-[#0B0B0D]'
            }`}
          >
            ML Prediction
          </button>
          <button
            onClick={() => setActiveLayer('idw')}
            className={`px-3 py-1.5 rounded-lg text-xs font-semibold transition-all ${
              activeLayer === 'idw'
                ? 'bg-[#BE6B37] text-white shadow-sm'
                : 'text-[#737373] hover:text-[#0B0B0D]'
            }`}
          >
            IDW Baseline
          </button>
          <button
            onClick={() => setActiveLayer('delta')}
            className={`px-3 py-1.5 rounded-lg text-xs font-semibold transition-all ${
              activeLayer === 'delta'
                ? 'bg-[#BE6B37] text-white shadow-sm'
                : 'text-[#737373] hover:text-[#0B0B0D]'
            }`}
          >
            Delta Difference (ML - IDW)
          </button>
        </div>

        {/* Opacity & Zoom Controls */}
        <div className="flex items-center gap-4 text-xs">
          <div className="flex items-center gap-2">
            <Sliders className="w-3.5 h-3.5 text-[#737373]" />
            <span className="text-[#737373]">Opacity:</span>
            <input
              type="range"
              min="0.2"
              max="1.0"
              step="0.05"
              value={opacity}
              onChange={(e) => setOpacity(parseFloat(e.target.value))}
              className="w-20 accent-[#BE6B37] cursor-pointer"
            />
            <span className="font-mono text-[#0B0B0D] w-8">{Math.round(opacity * 100)}%</span>
          </div>

          <div className="flex items-center gap-1 bg-white border border-[#D9DBDE] rounded-xl p-1">
            <button
              onClick={() => setZoom((z) => Math.min(z + 0.25, 3))}
              className="p-1 hover:bg-slate-100 rounded text-[#0B0B0D]"
              title="Zoom In"
            >
              <ZoomIn className="w-4 h-4" />
            </button>
            <span className="px-1 text-[11px] font-mono text-[#737373]">{Math.round(zoom * 100)}%</span>
            <button
              onClick={() => setZoom((z) => Math.max(z - 0.25, 0.5))}
              className="p-1 hover:bg-slate-100 rounded text-[#0B0B0D]"
              title="Zoom Out"
            >
              <ZoomOut className="w-4 h-4" />
            </button>
            <button
              onClick={resetView}
              className="p-1 hover:bg-slate-100 rounded text-[#0B0B0D]"
              title="Reset View"
            >
              <RotateCcw className="w-4 h-4" />
            </button>
          </div>
        </div>
      </div>

      {/* Interactive Floor Plan Canvas Viewport */}
      <div
        className="relative h-[500px] w-full overflow-hidden bg-[#0D0F12] cursor-grab active:cursor-grabbing select-none"
        onMouseDown={handleMouseDown}
        onMouseMove={handleMouseMove}
        onMouseUp={handleMouseUp}
        onMouseLeave={handleMouseUp}
      >
        <div
          style={{
            transform: `translate(${pan.x}px, ${pan.y}px) scale(${zoom})`,
            transformOrigin: '0 0',
            transition: isPanning ? 'none' : 'transform 0.1s ease-out',
            width: predictionMap.pixel_width,
            height: predictionMap.pixel_height,
          }}
          className="relative"
        >
          {/* Architectural Floor Plan Asset */}
          {floorPlanUrl ? (
            <img
              src={floorPlanUrl}
              alt={floorName || 'Floor Plan'}
              className="absolute inset-0 w-full h-full object-contain pointer-events-none"
            />
          ) : (
            <div className="absolute inset-0 w-full h-full border border-slate-700/50 flex items-center justify-center bg-[#151921]">
              <span className="text-slate-500 font-mono text-xs">
                Architectural Grid Canvas ({predictionMap.pixel_width} × {predictionMap.pixel_height} px)
              </span>
            </div>
          )}

          {/* ML Heatmap Canvas Overlay */}
          <canvas
            ref={canvasRef}
            className="absolute inset-0 pointer-events-none"
            style={{ width: '100%', height: '100%' }}
          />
        </div>

        {/* Legend Overlay Floating in Bottom-Left */}
        <div className="absolute bottom-4 left-4 p-3 rounded-xl bg-white/95 backdrop-blur border border-[#D9DBDE] shadow-lg text-xs space-y-1.5 z-10 pointer-events-auto">
          <div className="font-bold text-[#0B0B0D] text-[11px] flex items-center justify-between gap-4">
            <span>
              {activeLayer === 'delta'
                ? 'Prediction Delta (ML - IDW)'
                : `${activeLayer === 'ml' ? 'ML Regressor' : 'IDW Baseline'} Signal (dBm)`}
            </span>
          </div>

          {activeLayer === 'delta' ? (
            <div>
              <div
                className="h-2.5 w-48 rounded"
                style={{
                  background: 'linear-gradient(to right, rgb(37, 99, 235), rgb(255, 255, 255), rgb(190, 107, 55))',
                }}
              />
              <div className="flex justify-between text-[9px] font-mono text-[#737373] mt-1">
                <span>-10 dB (ML weaker)</span>
                <span>0 dB (Identical)</span>
                <span>+10 dB (ML stronger)</span>
              </div>
            </div>
          ) : (
            <div>
              <div
                className="h-2.5 w-48 rounded"
                style={{
                  background:
                    'linear-gradient(to right, rgb(225, 29, 72), rgb(245, 158, 11), rgb(13, 148, 136), rgb(5, 230, 110))',
                }}
              />
              <div className="flex justify-between text-[9px] font-mono text-[#737373] mt-1">
                <span>-90 dBm (Dead)</span>
                <span>-75 dBm</span>
                <span>-65 dBm</span>
                <span>-30 dBm (Max)</span>
              </div>
            </div>
          )}
        </div>
      </div>
    </div>
  );
};
