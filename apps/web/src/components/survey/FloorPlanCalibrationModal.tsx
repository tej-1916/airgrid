import React, { useState } from 'react';
import {
  X,
  Ruler,
  AlertCircle,
  CheckCircle2,
  RefreshCw,
} from 'lucide-react';
import { FloorPlanAsset, Floor, CalibrationPayload } from '../../types/campus';
import { campusService } from '../../services/campusService';

interface FloorPlanCalibrationModalProps {
  isOpen: boolean;
  onClose: () => void;
  floorPlan: FloorPlanAsset | null;
  floor: Floor | null;
  onCalibrated: (plan: FloorPlanAsset) => void;
}

export const FloorPlanCalibrationModal: React.FC<FloorPlanCalibrationModalProps> = ({
  isOpen,
  onClose,
  floorPlan,
  floor,
  onCalibrated,
}) => {
  const [method, setMethod] = useState<'total_width' | 'two_point'>('total_width');

  // Mode 1: Known Total Width
  const [totalWidthM, setTotalWidthM] = useState<string>(
    floor?.dimensions_width_m ? String(floor.dimensions_width_m) : '40.0'
  );

  // Mode 2: Two-Point Reference
  const [pt1X, setPt1X] = useState<string>('0');
  const [pt1Y, setPt1Y] = useState<string>('0');
  const [pt2X, setPt2X] = useState<string>(floorPlan ? String(floorPlan.pixel_width) : '1000');
  const [pt2Y, setPt2Y] = useState<string>('0');
  const [distanceM, setDistanceM] = useState<string>('20.0');

  const [submitting, setSubmitting] = useState<boolean>(false);
  const [errorMsg, setErrorMsg] = useState<string | null>(null);

  if (!isOpen || !floorPlan) return null;

  const handleSubmit = async (e: React.FormEvent) => {
    e.preventDefault();
    setErrorMsg(null);

    let payload: CalibrationPayload;

    if (method === 'total_width') {
      const w = parseFloat(totalWidthM);
      if (isNaN(w) || w <= 0.5 || w > 2000.0) {
        setErrorMsg('Please enter a valid floor width between 0.5 and 2000 meters.');
        return;
      }
      payload = {
        point1: { x: 0, y: 0 },
        point2: { x: floorPlan.pixel_width, y: 0 },
        distance_m: w,
      };
    } else {
      const x1 = parseFloat(pt1X);
      const y1 = parseFloat(pt1Y);
      const x2 = parseFloat(pt2X);
      const y2 = parseFloat(pt2Y);
      const d = parseFloat(distanceM);

      if (isNaN(x1) || isNaN(y1) || isNaN(x2) || isNaN(y2)) {
        setErrorMsg('Please enter valid pixel coordinates.');
        return;
      }
      if (isNaN(d) || d <= 0.1 || d > 2000.0) {
        setErrorMsg('Please enter a valid distance between 0.1 and 2000 meters.');
        return;
      }

      const dx = x2 - x1;
      const dy = y2 - y1;
      const pixelDist = Math.sqrt(dx * dx + dy * dy);
      if (pixelDist < 5.0) {
        setErrorMsg('Reference points must be at least 5 pixels apart.');
        return;
      }

      payload = {
        point1: { x: x1, y: y1 },
        point2: { x: x2, y: y2 },
        distance_m: d,
      };
    }

    try {
      setSubmitting(true);
      const updated = await campusService.calibrateFloorPlan(floorPlan.id, payload);
      onCalibrated(updated);
      onClose();
    } catch (err: any) {
      setErrorMsg(err.message || 'Failed to calibrate floor plan.');
    } finally {
      setSubmitting(false);
    }
  };

  const parsedWidth = parseFloat(totalWidthM);
  const calculatedScale =
    parsedWidth > 0 ? (floorPlan.pixel_width / parsedWidth).toFixed(2) : '—';
  const calculatedHeightM =
    parsedWidth > 0
      ? ((floorPlan.pixel_height / floorPlan.pixel_width) * parsedWidth).toFixed(1)
      : '—';

  return (
    <div className="fixed inset-0 z-50 flex items-center justify-center p-4 bg-black/60 backdrop-blur-xs">
      <div className="w-full max-w-lg rounded-2xl bg-white border border-[#D9DBDE] shadow-2xl overflow-hidden flex flex-col transition-transform duration-150 ease-out">
        {/* Header */}
        <div className="flex items-center justify-between p-4 border-b border-[#D9DBDE] bg-[#F5F5F3]">
          <div className="flex items-center gap-2">
            <div className="w-7 h-7 rounded-lg bg-[#BE6B37]/10 flex items-center justify-center text-[#BE6B37]">
              <Ruler className="w-4 h-4" />
            </div>
            <div>
              <h3 className="text-sm font-bold text-[#0B0B0D]">
                Scale Calibration
              </h3>
              <p className="text-[11px] text-[#737373]">
                Floor Plan: <span className="font-mono text-[#0B0B0D]">{floorPlan.pixel_width} × {floorPlan.pixel_height} px</span>
              </p>
            </div>
          </div>
          <button
            onClick={onClose}
            className="p-1 rounded-lg text-slate-400 hover:text-black hover:bg-slate-200/50 transition-colors"
          >
            <X className="w-4 h-4" />
          </button>
        </div>

        {/* Current Calibration Status */}
        <div className="p-3 mx-4 mt-3 rounded-xl bg-[#F5F5F3] border border-[#D9DBDE] flex items-center justify-between text-xs">
          <div>
            <span className="text-[#737373] text-[10px] uppercase font-bold tracking-wider block">
              Current Status
            </span>
            <div className="flex items-center gap-1.5 mt-0.5">
              {floorPlan.is_calibrated ? (
                <>
                  <CheckCircle2 className="w-3.5 h-3.5 text-emerald-600 shrink-0" />
                  <span className="font-bold text-emerald-800">
                    Calibrated: {floorPlan.scale_pixels_per_meter.toFixed(2)} px/m
                  </span>
                </>
              ) : (
                <>
                  <AlertCircle className="w-3.5 h-3.5 text-amber-600 shrink-0" />
                  <span className="font-bold text-amber-800">
                    Uncalibrated (Estimated: {floorPlan.scale_pixels_per_meter.toFixed(2)} px/m)
                  </span>
                </>
              )}
            </div>
          </div>
          <div className="text-right font-mono text-[11px] text-[#737373]">
            {floor?.dimensions_width_m}m × {floor?.dimensions_height_m}m
          </div>
        </div>

        {/* Method Selector */}
        <div className="flex border-b border-[#D9DBDE] bg-white text-xs font-semibold mt-2">
          <button
            type="button"
            onClick={() => setMethod('total_width')}
            className={`flex-1 py-2 px-4 border-b-2 text-center transition-colors ${
              method === 'total_width'
                ? 'border-[#BE6B37] text-[#BE6B37] bg-[#BE6B37]/5'
                : 'border-transparent text-[#737373] hover:text-[#0B0B0D]'
            }`}
          >
            Manual Known Width (Fast)
          </button>
          <button
            type="button"
            onClick={() => setMethod('two_point')}
            className={`flex-1 py-2 px-4 border-b-2 text-center transition-colors ${
              method === 'two_point'
                ? 'border-[#BE6B37] text-[#BE6B37] bg-[#BE6B37]/5'
                : 'border-transparent text-[#737373] hover:text-[#0B0B0D]'
            }`}
          >
            2-Point Reference Distance
          </button>
        </div>

        {errorMsg && (
          <div className="mx-4 mt-3 p-2.5 rounded-lg bg-rose-50 border border-rose-200 text-rose-800 text-xs flex items-center gap-2">
            <AlertCircle className="w-4 h-4 shrink-0 text-rose-600" />
            <span>{errorMsg}</span>
          </div>
        )}

        <form onSubmit={handleSubmit} className="p-4 space-y-4">
          {method === 'total_width' ? (
            <div className="space-y-3">
              <div className="space-y-1">
                <label className="text-xs font-semibold text-[#0B0B0D] block">
                  Known Real-World Floor Width (meters)
                </label>
                <input
                  type="number"
                  step="0.1"
                  min="1"
                  max="1000"
                  value={totalWidthM}
                  onChange={(e) => setTotalWidthM(e.target.value)}
                  className="w-full py-2 px-3 rounded-lg border border-[#D9DBDE] text-sm font-mono font-semibold text-[#0B0B0D] focus:outline-none focus:border-[#BE6B37]"
                  required
                />
                <span className="text-[10px] text-[#737373] block">
                  Sets the horizontal width represented by the image ({floorPlan.pixel_width} px).
                </span>
              </div>

              {/* Calculated Preview */}
              <div className="p-3 rounded-lg bg-[#F5F5F3] border border-[#D9DBDE] text-xs space-y-1 font-mono">
                <div className="flex justify-between">
                  <span className="text-[#737373]">Calculated Scale:</span>
                  <span className="font-bold text-[#0B0B0D]">{calculatedScale} px/meter</span>
                </div>
                <div className="flex justify-between">
                  <span className="text-[#737373]">Derived Floor Length:</span>
                  <span className="font-bold text-[#0B0B0D]">{calculatedHeightM} meters</span>
                </div>
              </div>
            </div>
          ) : (
            <div className="space-y-3">
              <div className="grid grid-cols-2 gap-3">
                <div className="space-y-1">
                  <label className="text-xs font-semibold text-[#0B0B0D] block">
                    Point 1 (X, Y in px)
                  </label>
                  <div className="grid grid-cols-2 gap-1.5 font-mono text-xs">
                    <input
                      type="number"
                      value={pt1X}
                      onChange={(e) => setPt1X(e.target.value)}
                      placeholder="X"
                      className="py-1 px-2 rounded border border-[#D9DBDE]"
                    />
                    <input
                      type="number"
                      value={pt1Y}
                      onChange={(e) => setPt1Y(e.target.value)}
                      placeholder="Y"
                      className="py-1 px-2 rounded border border-[#D9DBDE]"
                    />
                  </div>
                </div>

                <div className="space-y-1">
                  <label className="text-xs font-semibold text-[#0B0B0D] block">
                    Point 2 (X, Y in px)
                  </label>
                  <div className="grid grid-cols-2 gap-1.5 font-mono text-xs">
                    <input
                      type="number"
                      value={pt2X}
                      onChange={(e) => setPt2X(e.target.value)}
                      placeholder="X"
                      className="py-1 px-2 rounded border border-[#D9DBDE]"
                    />
                    <input
                      type="number"
                      value={pt2Y}
                      onChange={(e) => setPt2Y(e.target.value)}
                      placeholder="Y"
                      className="py-1 px-2 rounded border border-[#D9DBDE]"
                    />
                  </div>
                </div>
              </div>

              <div className="space-y-1">
                <label className="text-xs font-semibold text-[#0B0B0D] block">
                  Measured Real-World Distance Between Points (meters)
                </label>
                <input
                  type="number"
                  step="0.1"
                  min="0.1"
                  max="500"
                  value={distanceM}
                  onChange={(e) => setDistanceM(e.target.value)}
                  className="w-full py-1.5 px-3 rounded-lg border border-[#D9DBDE] text-sm font-mono font-semibold text-[#0B0B0D] focus:outline-none focus:border-[#BE6B37]"
                  required
                />
              </div>
            </div>
          )}

          <div className="flex items-center justify-end gap-2 pt-2 border-t border-[#D9DBDE]">
            <button
              type="button"
              onClick={onClose}
              className="py-1.5 px-3 rounded-lg border border-[#D9DBDE] text-xs font-semibold text-[#737373] hover:bg-[#F5F5F3]"
            >
              Cancel
            </button>
            <button
              type="submit"
              disabled={submitting}
              className="py-1.5 px-4 rounded-lg bg-[#BE6B37] text-white text-xs font-semibold hover:bg-[#9A5226] active:scale-[0.98] disabled:opacity-50 flex items-center gap-1.5 shadow-xs transition-transform"
            >
              {submitting && <RefreshCw className="w-3.5 h-3.5 animate-spin" />}
              <span>{submitting ? 'Applying...' : 'Apply Scale Calibration'}</span>
            </button>
          </div>
        </form>
      </div>
    </div>
  );
};
