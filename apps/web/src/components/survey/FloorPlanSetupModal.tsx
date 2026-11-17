import React, { useState } from 'react';
import {
  X,
  Upload,
  Ruler,
  AlertCircle,
  FileImage,
  RefreshCw,
  LayoutGrid,
} from 'lucide-react';
import { Floor, FloorPlanAsset } from '../../types/campus';
import { campusService } from '../../services/campusService';

interface FloorPlanSetupModalProps {
  isOpen: boolean;
  onClose: () => void;
  floor: Floor | null;
  onPlanCreated: (plan: FloorPlanAsset) => void;
}

export const FloorPlanSetupModal: React.FC<FloorPlanSetupModalProps> = ({
  isOpen,
  onClose,
  floor,
  onPlanCreated,
}) => {
  const [activeTab, setActiveTab] = useState<'upload' | 'outline'>('upload');

  // Upload state
  const [selectedFile, setSelectedFile] = useState<File | null>(null);
  const [uploadPreview, setUploadPreview] = useState<string | null>(null);

  // Outline state
  const [widthM, setWidthM] = useState<string>(
    floor?.dimensions_width_m ? String(floor.dimensions_width_m) : '40.0'
  );
  const [heightM, setHeightM] = useState<string>(
    floor?.dimensions_height_m ? String(floor.dimensions_height_m) : '25.0'
  );
  const [gridIntervalM, setGridIntervalM] = useState<string>('5.0');
  const [outlineLabel, setOutlineLabel] = useState<string>(floor?.name || 'Survey Floor');

  // Execution state
  const [submitting, setSubmitting] = useState<boolean>(false);
  const [errorMsg, setErrorMsg] = useState<string | null>(null);

  if (!isOpen || !floor) return null;

  const handleFileChange = (e: React.ChangeEvent<HTMLInputElement>) => {
    setErrorMsg(null);
    const file = e.target.files?.[0];
    if (!file) return;

    if (!file.type.match(/^image\/(png|jpeg|jpg|webp)$/)) {
      setErrorMsg('Only PNG, JPEG, and WebP image files are supported.');
      return;
    }

    if (file.size > 10 * 1024 * 1024) {
      setErrorMsg('File exceeds maximum size of 10 MB.');
      return;
    }

    setSelectedFile(file);
    const reader = new FileReader();
    reader.onload = () => setUploadPreview(reader.result as string);
    reader.readAsDataURL(file);
  };

  const handleUploadSubmit = async (e: React.FormEvent) => {
    e.preventDefault();
    if (!selectedFile) {
      setErrorMsg('Please select an authorized floor plan image.');
      return;
    }

    try {
      setSubmitting(true);
      setErrorMsg(null);
      const plan = await campusService.uploadFloorPlan(floor.id, selectedFile);
      onPlanCreated(plan);
      onClose();
    } catch (err: any) {
      setErrorMsg(err.message || 'Failed to upload floor plan image.');
    } finally {
      setSubmitting(false);
    }
  };

  const handleOutlineSubmit = async (e: React.FormEvent) => {
    e.preventDefault();
    const w = parseFloat(widthM);
    const h = parseFloat(heightM);
    const g = parseFloat(gridIntervalM);

    if (isNaN(w) || w <= 1.0 || w > 1000.0) {
      setErrorMsg('Width must be between 1.0 and 1000.0 meters.');
      return;
    }

    if (isNaN(h) || h <= 1.0 || h > 1000.0) {
      setErrorMsg('Length/Height must be between 1.0 and 1000.0 meters.');
      return;
    }

    if (isNaN(g) || g < 0.5 || g > 50.0) {
      setErrorMsg('Grid interval must be between 0.5 and 50.0 meters.');
      return;
    }

    try {
      setSubmitting(true);
      setErrorMsg(null);
      const plan = await campusService.createFloorOutline(floor.id, {
        width_m: w,
        height_m: h,
        grid_interval_m: g,
        label: outlineLabel.trim() || floor.name,
      });
      onPlanCreated(plan);
      onClose();
    } catch (err: any) {
      setErrorMsg(err.message || 'Failed to generate floor outline.');
    } finally {
      setSubmitting(false);
    }
  };

  const parsedW = parseFloat(widthM) || 0;
  const parsedH = parseFloat(heightM) || 0;
  const estimatedArea = parsedW > 0 && parsedH > 0 ? (parsedW * parsedH).toFixed(1) : '0';

  return (
    <div className="fixed inset-0 z-50 flex items-center justify-center p-4 bg-black/60 backdrop-blur-xs">
      <div className="w-full max-w-lg rounded-2xl bg-white border border-[#D9DBDE] shadow-2xl overflow-hidden flex flex-col transition-transform duration-150 ease-out">
        {/* Header */}
        <div className="flex items-center justify-between p-4 border-b border-[#D9DBDE] bg-[#F5F5F3]">
          <div className="flex items-center gap-2">
            <div className="w-7 h-7 rounded-lg bg-[#BE6B37]/10 flex items-center justify-center text-[#BE6B37]">
              <FileImage className="w-4 h-4" />
            </div>
            <div>
              <h3 className="text-sm font-bold text-[#0B0B0D]">
                Floor Plan Setup
              </h3>
              <p className="text-[11px] text-[#737373]">
                Floor: <span className="font-semibold text-[#0B0B0D]">{floor.name}</span> (Level {floor.floor_number})
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

        {/* Tab Selection */}
        <div className="flex border-b border-[#D9DBDE] bg-white text-xs font-semibold">
          <button
            type="button"
            onClick={() => {
              setActiveTab('upload');
              setErrorMsg(null);
            }}
            className={`flex-1 py-2.5 px-4 flex items-center justify-center gap-2 border-b-2 transition-colors ${
              activeTab === 'upload'
                ? 'border-[#BE6B37] text-[#BE6B37] bg-[#BE6B37]/5'
                : 'border-transparent text-[#737373] hover:text-[#0B0B0D]'
            }`}
          >
            <Upload className="w-3.5 h-3.5" />
            <span>Upload Real Blueprint Image</span>
          </button>
          <button
            type="button"
            onClick={() => {
              setActiveTab('outline');
              setErrorMsg(null);
            }}
            className={`flex-1 py-2.5 px-4 flex items-center justify-center gap-2 border-b-2 transition-colors ${
              activeTab === 'outline'
                ? 'border-[#BE6B37] text-[#BE6B37] bg-[#BE6B37]/5'
                : 'border-transparent text-[#737373] hover:text-[#0B0B0D]'
            }`}
          >
            <LayoutGrid className="w-3.5 h-3.5" />
            <span>Generate Calibrated Outline</span>
          </button>
        </div>

        {/* Error Notice */}
        {errorMsg && (
          <div className="mx-4 mt-3 p-2.5 rounded-lg bg-rose-50 border border-rose-200 text-rose-800 text-xs flex items-center gap-2">
            <AlertCircle className="w-4 h-4 shrink-0 text-rose-600" />
            <span>{errorMsg}</span>
          </div>
        )}

        {/* Tab 1: Upload Real Blueprint */}
        {activeTab === 'upload' && (
          <form onSubmit={handleUploadSubmit} className="p-4 space-y-4">
            <div className="space-y-1.5">
              <label className="text-xs font-semibold text-[#0B0B0D] block">
                Select Blueprint File (PNG, JPEG, WebP)
              </label>
              <label className="flex flex-col items-center justify-center border-2 border-dashed border-[#D9DBDE] hover:border-[#BE6B37] rounded-xl p-5 cursor-pointer bg-[#F5F5F3] hover:bg-[#BE6B37]/5 transition-colors">
                {uploadPreview ? (
                  <div className="space-y-2 text-center">
                    <img
                      src={uploadPreview}
                      alt="Preview"
                      className="max-h-36 rounded border border-slate-300 mx-auto shadow-xs"
                    />
                    <span className="text-[11px] font-mono text-[#0B0B0D] block">
                      {selectedFile?.name} ({(selectedFile?.size! / 1024).toFixed(0)} KB)
                    </span>
                    <span className="text-[10px] text-[#BE6B37] font-semibold underline block">
                      Click to choose a different file
                    </span>
                  </div>
                ) : (
                  <div className="text-center space-y-1.5">
                    <div className="w-10 h-10 rounded-full bg-white border border-[#D9DBDE] flex items-center justify-center mx-auto text-[#BE6B37] shadow-xs">
                      <Upload className="w-5 h-5" />
                    </div>
                    <span className="text-xs font-semibold text-[#0B0B0D] block">
                      Click to browse or drop file here
                    </span>
                    <span className="text-[10px] text-[#737373] block">
                      High-resolution floor plans up to 10 MB supported
                    </span>
                  </div>
                )}
                <input
                  type="file"
                  accept="image/png,image/jpeg,image/webp"
                  onChange={handleFileChange}
                  className="hidden"
                />
              </label>
            </div>

            <p className="text-[11px] text-[#737373] leading-relaxed">
              * Note: After uploading, you will be able to calibrate real-world distance in meters using the in-studio Calibration tool.
            </p>

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
                disabled={submitting || !selectedFile}
                className="py-1.5 px-4 rounded-lg bg-[#BE6B37] text-white text-xs font-semibold hover:bg-[#9A5226] active:scale-[0.98] disabled:opacity-50 flex items-center gap-1.5 shadow-xs transition-transform"
              >
                {submitting && <RefreshCw className="w-3.5 h-3.5 animate-spin" />}
                <span>{submitting ? 'Uploading...' : 'Upload & Attach Plan'}</span>
              </button>
            </div>
          </form>
        )}

        {/* Tab 2: Dimensioned Outline Generator */}
        {activeTab === 'outline' && (
          <form onSubmit={handleOutlineSubmit} className="p-4 space-y-4">
            <div className="p-3 rounded-xl bg-amber-50/70 border border-amber-200/60 text-amber-900 text-[11px] space-y-1">
              <span className="font-bold flex items-center gap-1">
                <Ruler className="w-3.5 h-3.5 text-amber-700" />
                Physical Dimension Specification
              </span>
              <p className="text-[#737373]">
                If no CAD or image asset exists, generate an authentic, metric-scaled outline with structural boundary walls and grid lines.
              </p>
            </div>

            <div className="grid grid-cols-2 gap-3">
              <div className="space-y-1">
                <label className="text-xs font-semibold text-[#0B0B0D] block">
                  Physical Width (meters)
                </label>
                <input
                  type="number"
                  step="0.5"
                  min="2"
                  max="500"
                  value={widthM}
                  onChange={(e) => setWidthM(e.target.value)}
                  className="w-full py-1.5 px-2.5 rounded-lg border border-[#D9DBDE] text-xs font-mono font-semibold text-[#0B0B0D] focus:outline-none focus:border-[#BE6B37]"
                  required
                />
              </div>

              <div className="space-y-1">
                <label className="text-xs font-semibold text-[#0B0B0D] block">
                  Physical Length / Height (meters)
                </label>
                <input
                  type="number"
                  step="0.5"
                  min="2"
                  max="500"
                  value={heightM}
                  onChange={(e) => setHeightM(e.target.value)}
                  className="w-full py-1.5 px-2.5 rounded-lg border border-[#D9DBDE] text-xs font-mono font-semibold text-[#0B0B0D] focus:outline-none focus:border-[#BE6B37]"
                  required
                />
              </div>
            </div>

            <div className="grid grid-cols-2 gap-3">
              <div className="space-y-1">
                <label className="text-xs font-semibold text-[#0B0B0D] block">
                  Grid Line Interval (meters)
                </label>
                <select
                  value={gridIntervalM}
                  onChange={(e) => setGridIntervalM(e.target.value)}
                  className="w-full py-1.5 px-2.5 rounded-lg border border-[#D9DBDE] text-xs font-semibold text-[#0B0B0D] focus:outline-none focus:border-[#BE6B37] bg-white"
                >
                  <option value="2.0">Every 2.0 meters (Dense)</option>
                  <option value="5.0">Every 5.0 meters (Standard)</option>
                  <option value="10.0">Every 10.0 meters (Wide)</option>
                </select>
              </div>

              <div className="space-y-1">
                <label className="text-xs font-semibold text-[#0B0B0D] block">
                  Schematic Title / Label
                </label>
                <input
                  type="text"
                  value={outlineLabel}
                  onChange={(e) => setOutlineLabel(e.target.value)}
                  placeholder={floor.name}
                  className="w-full py-1.5 px-2.5 rounded-lg border border-[#D9DBDE] text-xs font-semibold text-[#0B0B0D] focus:outline-none focus:border-[#BE6B37]"
                />
              </div>
            </div>

            {/* Calculated Metrics */}
            <div className="p-2.5 rounded-lg bg-[#F5F5F3] border border-[#D9DBDE] text-xs flex items-center justify-between font-mono">
              <span className="text-[#737373]">Floor Surface Area:</span>
              <span className="font-bold text-[#0B0B0D]">{estimatedArea} m²</span>
            </div>

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
                <span>{submitting ? 'Generating...' : 'Generate Calibrated Outline'}</span>
              </button>
            </div>
          </form>
        )}
      </div>
    </div>
  );
};
