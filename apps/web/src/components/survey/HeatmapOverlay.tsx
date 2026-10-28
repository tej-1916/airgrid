import React, { useEffect, useRef } from 'react';
import { HeatmapGridResponse } from '../../types/survey';

interface HeatmapOverlayProps {
  heatmap: HeatmapGridResponse | null;
  opacity?: number;
  visible?: boolean;
}

// Convert dBm value (-90 to -30) into RGB color
function rssiToRgb(rssi: number): [number, number, number] {
  // Clamp between -90 and -30
  const clamped = Math.max(-90, Math.min(-30, rssi));

  if (clamped < -75) {
    // -90 to -75: Deep Red to Amber
    const t = (clamped - (-90)) / 15;
    return [
      Math.round(225 + t * (245 - 225)),
      Math.round(29 + t * (158 - 29)),
      Math.round(72 + t * (11 - 72)),
    ];
  } else if (clamped < -67) {
    // -75 to -67: Amber to Yellow-Green/Teal
    const t = (clamped - (-75)) / 8;
    return [
      Math.round(245 + t * (13 - 245)),
      Math.round(158 + t * (148 - 158)),
      Math.round(11 + t * (136 - 11)),
    ];
  } else if (clamped < -50) {
    // -67 to -50: Teal to Green
    const t = (clamped - (-67)) / 17;
    return [
      Math.round(13 + t * (16 - 13)),
      Math.round(148 + t * (185 - 148)),
      Math.round(136 + t * (129 - 136)),
    ];
  } else {
    // -50 to -30: Emerald to Intense Green
    const t = (clamped - (-50)) / 20;
    return [
      Math.round(16 + t * (5 - 16)),
      Math.round(185 + t * (230 - 185)),
      Math.round(129 + t * (110 - 129)),
    ];
  }
}

export const HeatmapOverlay: React.FC<HeatmapOverlayProps> = ({
  heatmap,
  opacity = 0.65,
  visible = true,
}) => {
  const canvasRef = useRef<HTMLCanvasElement>(null);

  useEffect(() => {
    if (!visible || !heatmap || !canvasRef.current) return;

    const canvas = canvasRef.current;
    const ctx = canvas.getContext('2d');
    if (!ctx) return;

    const { grid_width, grid_height, pixel_width, pixel_height, grid_data } = heatmap;

    // Set canvas dimensions to match natural floor plan image
    canvas.width = pixel_width;
    canvas.height = pixel_height;

    // Create an offscreen canvas at the lower grid resolution
    const offscreen = document.createElement('canvas');
    offscreen.width = grid_width;
    offscreen.height = grid_height;
    const offCtx = offscreen.getContext('2d');
    if (!offCtx) return;

    const imgData = offCtx.createImageData(grid_width, grid_height);
    const data = imgData.data;

    for (let r = 0; r < grid_height; r++) {
      for (let c = 0; c < grid_width; c++) {
        const val = grid_data[r]?.[c];
        const idx = (r * grid_width + c) * 4;

        if (val === null || val === undefined) {
          // Masked / outside influence radius -> completely transparent
          data[idx] = 0;
          data[idx + 1] = 0;
          data[idx + 2] = 0;
          data[idx + 3] = 0;
        } else {
          const [red, green, blue] = rssiToRgb(val);
          data[idx] = red;
          data[idx + 1] = green;
          data[idx + 2] = blue;
          data[idx + 3] = 230; // Solid coverage in valid cells
        }
      }
    }

    offCtx.putImageData(imgData, 0, 0);

    // Render offscreen canvas onto the main canvas with smooth bilinear scaling
    ctx.clearRect(0, 0, pixel_width, pixel_height);
    ctx.imageSmoothingEnabled = true;
    ctx.imageSmoothingQuality = 'high';
    ctx.drawImage(offscreen, 0, 0, pixel_width, pixel_height);
  }, [heatmap, visible]);

  if (!visible || !heatmap) return null;

  return (
    <div className="absolute inset-0 pointer-events-none overflow-hidden rounded">
      <canvas
        ref={canvasRef}
        style={{
          opacity: opacity,
          width: '100%',
          height: '100%',
          objectFit: 'contain',
        }}
        className="w-full h-full pointer-events-none transition-opacity duration-200"
      />

      {/* Floating confidence banner */}
      <div className="absolute bottom-3 left-3 flex items-center gap-2 px-2.5 py-1 rounded-lg bg-black/75 backdrop-blur-md border border-white/15 text-white text-[10px] shadow-lg pointer-events-auto">
        <span className="w-2 h-2 rounded-full bg-emerald-400 animate-pulse" />
        <span className="font-semibold">{heatmap.confidence_notice}</span>
        {heatmap.is_sparse_warning && (
          <span className="text-amber-300 font-mono text-[9px] bg-amber-500/20 px-1 rounded">
            Sparse sampling
          </span>
        )}
      </div>
    </div>
  );
};
