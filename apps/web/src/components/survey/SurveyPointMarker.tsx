import React from 'react';
import { SurveyMeasurement } from '../../types/survey';
import { getSignalColor } from './SignalLegend';

interface SurveyPointMarkerProps {
  measurement: SurveyMeasurement;
  naturalWidth: number;
  naturalHeight: number;
  isSelected?: boolean;
  onClick?: (m: SurveyMeasurement) => void;
}

export const SurveyPointMarker: React.FC<SurveyPointMarkerProps> = ({
  measurement,
  naturalWidth,
  naturalHeight,
  isSelected = false,
  onClick,
}) => {
  if (!naturalWidth || !naturalHeight) return null;

  const leftPct = (measurement.position_x / naturalWidth) * 100;
  const topPct = (measurement.position_y / naturalHeight) * 100;
  const colorInfo = getSignalColor(measurement.rssi_dbm);

  return (
    <div
      onClick={(e) => {
        e.stopPropagation();
        onClick?.(measurement);
      }}
      style={{
        left: `${leftPct}%`,
        top: `${topPct}%`,
      }}
      className={`absolute -ml-3.5 -mt-3.5 w-7 h-7 rounded-full cursor-pointer transition-transform flex items-center justify-center text-[9px] font-mono font-bold shadow-md select-none ${
        isSelected
          ? 'ring-4 ring-[#BE6B37] scale-125 z-30'
          : 'hover:scale-115 hover:z-20 z-10'
      }`}
      title={`Point #${measurement.id.slice(0, 6)}: ${measurement.rssi_dbm} dBm (${measurement.measurement_source})`}
    >
      {/* Outer border & pulse when selected */}
      <span
        style={{ backgroundColor: colorInfo.hex }}
        className="absolute inset-0 rounded-full border-2 border-white shadow-xs"
      />
      {isSelected && (
        <span
          style={{ borderColor: colorInfo.hex }}
          className="absolute -inset-1 rounded-full border-2 animate-ping opacity-60 pointer-events-none"
        />
      )}
      <span className="relative text-white drop-shadow-xs leading-none">
        {Math.round(measurement.rssi_dbm)}
      </span>
    </div>
  );
};
