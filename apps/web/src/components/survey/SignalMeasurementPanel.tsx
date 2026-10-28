import React, { useState, useEffect } from 'react';
import { Radio, AlertCircle, Save, X, Wifi, ShieldAlert, Cpu } from 'lucide-react';
import { MeasurementSource, SurveyMeasurementCreatePayload } from '../../types/survey';
import { getSignalColor } from './SignalLegend';
import { TelemetrySnapshot } from '../../types/diagnostics';

interface SignalMeasurementPanelProps {
  floorId: string;
  clickCoords: { x: number; y: number } | null;
  onSave: (payload: SurveyMeasurementCreatePayload) => Promise<void>;
  onCancel: () => void;
  scaleRatio?: number;
  isCalibrated?: boolean;
  placeable?: TelemetrySnapshot[];
  onPlaceSnapshot?: (snapshotId: string, notes?: string) => Promise<void>;
}

export const SignalMeasurementPanel: React.FC<SignalMeasurementPanelProps> = ({
  floorId,
  clickCoords,
  onSave,
  onCancel,
  scaleRatio = 20.0,
  isCalibrated = false,
  placeable = [],
  onPlaceSnapshot,
}) => {
  const [snapshotId, setSnapshotId] = useState<string>('');
  const [rssiDbm, setRssiDbm] = useState<number>(-62);
  const [source, setSource] = useState<MeasurementSource>('manual_observation');
  const [networkLabel, setNetworkLabel] = useState<string>('');
  const [apReference, setApReference] = useState<string>('');
  const [frequencyBand, setFrequencyBand] = useState<'2.4' | '5' | '6'>('5');
  const [channel, setChannel] = useState<string>('36');
  const [notes, setNotes] = useState<string>('');
  const [saving, setSaving] = useState<boolean>(false);
  const [errorMsg, setErrorMsg] = useState<string | null>(null);

  // Sync frequency to standard channel defaults
  useEffect(() => {
    if (frequencyBand === '2.4') {
      setChannel('6');
    } else if (frequencyBand === '5') {
      setChannel('36');
    } else if (frequencyBand === '6') {
      setChannel('37');
    }
  }, [frequencyBand]);

  if (!clickCoords) return null;

  const x_m = isCalibrated ? (clickCoords.x / scaleRatio).toFixed(1) : null;
  const y_m = isCalibrated ? (clickCoords.y / scaleRatio).toFixed(1) : null;
  const colorInfo = getSignalColor(rssiDbm);

  const handleSubmit = async (e: React.FormEvent) => {
    e.preventDefault();
    if (rssiDbm < -100 || rssiDbm > -20) {
      setErrorMsg('Plausible Wi-Fi RSSI must be between -100 dBm and -20 dBm.');
      return;
    }

    try {
      setSaving(true);
      setErrorMsg(null);

      const freqMhz =
        frequencyBand === '2.4' ? 2437 : frequencyBand === '5' ? 5180 : 6135;

      const payload: SurveyMeasurementCreatePayload = {
        floor_id: floorId,
        position_x: clickCoords.x,
        position_y: clickCoords.y,
        rssi_dbm: rssiDbm,
        measurement_source: source,
        network_label: networkLabel.trim() || undefined,
        ap_reference: apReference.trim() || undefined,
        frequency_mhz: freqMhz,
        channel: channel ? parseInt(channel, 10) : undefined,
        notes: notes.trim() || undefined,
        data_provenance:
          source === 'manual_observation' ? 'operator_reported' : 'controlled_test_import',
      };

      await onSave(payload);
    } catch (err: any) {
      setErrorMsg(err.message || 'Failed to save measurement.');
    } finally {
      setSaving(false);
    }
  };

  return (
    <div className="rounded-xl border border-[#D9DBDE] bg-white p-4 shadow-sm space-y-4">
      {/* Header */}
      <div className="flex items-center justify-between pb-2 border-b border-[#D9DBDE]">
        <div className="flex items-center gap-2">
          <div className="w-7 h-7 rounded-lg bg-[#BE6B37]/10 flex items-center justify-center text-[#BE6B37]">
            <Radio className="w-4 h-4" />
          </div>
          <div>
            <h3 className="text-xs font-bold text-[#0B0B0D] uppercase tracking-wider">
              Record Signal Observation
            </h3>
            <p className="text-[11px] text-[#737373] font-mono">
              Position: ({clickCoords.x}, {clickCoords.y}) px
              {isCalibrated && ` • (${x_m}m, ${y_m}m)`}
            </p>
          </div>
        </div>
        <button
          onClick={onCancel}
          className="p-1 rounded-lg text-[#737373] hover:text-[#0B0B0D] hover:bg-[#F5F5F3]"
          title="Cancel"
        >
          <X className="w-4 h-4" />
        </button>
      </div>

      {errorMsg && (
        <div className="p-2.5 rounded-lg bg-rose-50 border border-rose-200 text-rose-800 text-xs flex items-center gap-2">
          <AlertCircle className="w-4 h-4 shrink-0 text-rose-600" />
          <span>{errorMsg}</span>
        </div>
      )}

      {onPlaceSnapshot && placeable.length > 0 && (
        <div className="rounded-lg border border-emerald-200 bg-emerald-50 p-3 space-y-2">
          <p className="text-xs font-semibold text-[#0B0B0D]">Place an instrument observation at this position</p>
          <p className="text-[11px] text-[#525252]">
            Use only if the observation was collected standing here. It is stored as instrument-verified evidence;
            AirGrid never infers position from signal strength.
          </p>
          {isCalibrated ? (
            <>
              <select aria-label="Instrument observation" value={snapshotId} onChange={(e) => setSnapshotId(e.target.value)}
                className="w-full text-xs bg-white border border-[#D9DBDE] rounded-lg px-2 py-1.5">
                <option value="">Select a recent observation…</option>
                {placeable.map((s) => (
                  <option key={s.id} value={s.id}>
                    {new Date(s.collected_at).toLocaleTimeString()} · {s.ssid} · {s.rssi_dbm} dBm · {s.vantage_point === 'registered_collector' ? 'collector' : 'backend host'}
                  </option>
                ))}
              </select>
              <button type="button" disabled={!snapshotId || saving}
                onClick={async () => {
                  try { setSaving(true); setErrorMsg(null); await onPlaceSnapshot(snapshotId, notes.trim() || undefined); }
                  catch (err: any) { setErrorMsg(err.message || 'Failed to place observation.'); }
                  finally { setSaving(false); }
                }}
                className="w-full rounded-lg bg-emerald-700 hover:bg-emerald-800 disabled:opacity-40 text-white text-xs font-semibold py-2">
                Place instrument observation
              </button>
            </>
          ) : (
            <p className="text-[11px] text-amber-800">Calibrate this floor plan before placing instrument observations.</p>
          )}
          <p className="text-center text-[10px] text-[#737373]">— or enter a manual, operator-reported value below —</p>
        </div>
      )}

      <form onSubmit={handleSubmit} className="space-y-3.5">
        {/* RSSI dBm Slider & Numeric Input */}
        <div className="space-y-1.5">
          <div className="flex items-center justify-between">
            <label className="text-xs font-semibold text-[#0B0B0D]">
              Signal Strength (RSSI)
            </label>
            <div className="flex items-center gap-2">
              <span
                style={{ backgroundColor: colorInfo.hex }}
                className="w-2.5 h-2.5 rounded-full"
              />
              <span className={`text-xs font-bold font-mono ${colorInfo.textClass}`}>
                {rssiDbm} dBm
              </span>
              <span className="text-[10px] text-[#737373]">({colorInfo.label.split(' ')[0]})</span>
            </div>
          </div>

          <div className="flex items-center gap-3">
            <input
              type="range"
              min="-100"
              max="-20"
              step="1"
              value={rssiDbm}
              onChange={(e) => setRssiDbm(parseInt(e.target.value, 10))}
              className="flex-1 accent-[#BE6B37] cursor-pointer"
            />
            <input
              type="number"
              min="-100"
              max="-20"
              value={rssiDbm}
              onChange={(e) => setRssiDbm(parseInt(e.target.value, 10) || -100)}
              className="w-16 py-1 px-2 rounded-lg bg-[#F5F5F3] border border-[#D9DBDE] text-xs font-mono font-bold text-[#0B0B0D] text-right focus:outline-none focus:border-[#BE6B37]"
            />
          </div>
        </div>

        {/* Measurement Source */}
        <div className="space-y-1">
          <label className="text-xs font-semibold text-[#0B0B0D]">
            Measurement Source
          </label>
          <div className="grid grid-cols-2 gap-2">
            <button
              type="button"
              onClick={() => setSource('manual_observation')}
              className={`p-2 rounded-lg border text-xs font-semibold flex items-center justify-center gap-1.5 transition-all ${
                source === 'manual_observation'
                  ? 'border-[#BE6B37] bg-[#BE6B37]/10 text-[#BE6B37]'
                  : 'border-[#D9DBDE] bg-white text-[#737373] hover:border-[#737373]'
              }`}
            >
              <Wifi className="w-3.5 h-3.5" />
              <span>Manual Observation</span>
            </button>
            <button
              type="button"
              onClick={() => setSource('controlled_test_import')}
              className={`p-2 rounded-lg border text-xs font-semibold flex items-center justify-center gap-1.5 transition-all ${
                source === 'controlled_test_import'
                  ? 'border-[#BE6B37] bg-[#BE6B37]/10 text-[#BE6B37]'
                  : 'border-[#D9DBDE] bg-white text-[#737373] hover:border-[#737373]'
              }`}
            >
              <Cpu className="w-3.5 h-3.5" />
              <span>Controlled Test Import</span>
            </button>
          </div>
        </div>

        {/* Network & AP Metadata */}
        <div className="grid grid-cols-2 gap-2">
          <div>
            <label className="text-[11px] font-semibold text-[#737373] block mb-1">
              Network Label (SSID)
            </label>
            <input
              type="text"
              placeholder="e.g. Campus-Secure"
              value={networkLabel}
              onChange={(e) => setNetworkLabel(e.target.value)}
              className="w-full py-1.5 px-2.5 rounded-lg bg-white border border-[#D9DBDE] text-xs text-[#0B0B0D] placeholder-[#737373] focus:outline-none focus:border-[#BE6B37]"
            />
          </div>
          <div>
            <label className="text-[11px] font-semibold text-[#737373] block mb-1">
              AP Reference (Optional)
            </label>
            <input
              type="text"
              placeholder="e.g. AP-West-02"
              value={apReference}
              onChange={(e) => setApReference(e.target.value)}
              className="w-full py-1.5 px-2.5 rounded-lg bg-white border border-[#D9DBDE] text-xs text-[#0B0B0D] placeholder-[#737373] focus:outline-none focus:border-[#BE6B37]"
            />
          </div>
        </div>

        {/* Frequency & Channel */}
        <div className="grid grid-cols-2 gap-2">
          <div>
            <label className="text-[11px] font-semibold text-[#737373] block mb-1">
              Frequency Band
            </label>
            <select
              value={frequencyBand}
              onChange={(e) => setFrequencyBand(e.target.value as any)}
              className="w-full py-1.5 px-2 rounded-lg bg-white border border-[#D9DBDE] text-xs font-semibold text-[#0B0B0D] focus:outline-none focus:border-[#BE6B37]"
            >
              <option value="2.4">2.4 GHz (ISM)</option>
              <option value="5">5 GHz (UNII-1/2/3)</option>
              <option value="6">6 GHz (Wi-Fi 6E/7)</option>
            </select>
          </div>
          <div>
            <label className="text-[11px] font-semibold text-[#737373] block mb-1">
              Channel Number
            </label>
            <input
              type="number"
              min="1"
              max="196"
              value={channel}
              onChange={(e) => setChannel(e.target.value)}
              className="w-full py-1.5 px-2.5 rounded-lg bg-white border border-[#D9DBDE] text-xs font-mono text-[#0B0B0D] focus:outline-none focus:border-[#BE6B37]"
            />
          </div>
        </div>

        {/* Operator Notes */}
        <div>
          <label className="text-[11px] font-semibold text-[#737373] block mb-1">
            Operator Location Notes
          </label>
          <input
            type="text"
            placeholder="e.g. Next to server rack, line-of-sight to corridor"
            value={notes}
            onChange={(e) => setNotes(e.target.value)}
            className="w-full py-1.5 px-2.5 rounded-lg bg-white border border-[#D9DBDE] text-xs text-[#0B0B0D] placeholder-[#737373] focus:outline-none focus:border-[#BE6B37]"
          />
        </div>

        {/* Provenance Notice */}
        <div className="p-2 rounded-lg bg-[#F5F5F3] border border-[#D9DBDE] flex items-start gap-2 text-[10px] text-[#737373]">
          <ShieldAlert className="w-3.5 h-3.5 text-[#BE6B37] shrink-0 mt-0.5" />
          <p className="leading-tight">
            Manually entered values are operator-provided observations, not independently certified physical telemetry. Stored under provenance tag <code>operator_reported</code>.
          </p>
        </div>

        {/* Form Actions */}
        <div className="flex items-center justify-end gap-2 pt-1">
          <button
            type="button"
            onClick={onCancel}
            disabled={saving}
            className="py-1.5 px-3 rounded-lg border border-[#D9DBDE] text-xs font-semibold text-[#0B0B0D] hover:bg-[#F5F5F3]"
          >
            Cancel
          </button>
          <button
            type="submit"
            disabled={saving}
            className="py-1.5 px-4 rounded-lg bg-[#BE6B37] text-white text-xs font-semibold hover:bg-[#9A5226] flex items-center gap-1.5 transition-colors shadow-xs disabled:opacity-50"
          >
            <Save className="w-3.5 h-3.5" />
            <span>{saving ? 'Saving...' : 'Save Observation'}</span>
          </button>
        </div>
      </form>
    </div>
  );
};
