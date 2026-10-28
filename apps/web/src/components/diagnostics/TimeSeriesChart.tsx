import React, { useMemo, useState } from 'react';

export interface ChartPoint {
  t: string;
  v: number;
  id: string;
  note?: string;
}

export interface ChartSeries {
  label: string;
  color: string;
  points: ChartPoint[];
}

interface Props {
  title: string;
  unit: string;
  series: ChartSeries[];
  emptyText: string;
  yDomain?: [number, number];
}

// Categorical order (validated: copper/blue pass lightness, chroma, CVD and contrast checks on white).
export const SERIES_COLORS = ['#BE6B37', '#2F6FB0'];

const W = 640;
const H = 200;
const PAD = { l: 44, r: 16, t: 12, b: 26 };

const fmtTime = (ms: number) =>
  new Date(ms).toLocaleString(undefined, { month: 'short', day: 'numeric', hour: '2-digit', minute: '2-digit' });

export const TimeSeriesChart: React.FC<Props> = ({ title, unit, series, emptyText, yDomain }) => {
  const [hover, setHover] = useState<{ x: number; rows: { s: ChartSeries; p: ChartPoint }[] } | null>(null);
  const populated = series.filter((s) => s.points.length > 0);
  const all = populated.flatMap((s) => s.points.map((p) => ({ ...p, ms: Date.parse(p.t) })));

  const scale = useMemo(() => {
    if (!all.length) return null;
    const ts = all.map((p) => p.ms);
    let t0 = Math.min(...ts), t1 = Math.max(...ts);
    if (t0 === t1) { t0 -= 30 * 60e3; t1 += 30 * 60e3; }
    let [y0, y1] = yDomain ?? [Math.min(...all.map((p) => p.v)), Math.max(...all.map((p) => p.v))];
    if (!yDomain) {
      const pad = Math.max((y1 - y0) * 0.1, 1);
      y0 -= pad; y1 += pad;
    }
    const x = (ms: number) => PAD.l + ((ms - t0) / (t1 - t0)) * (W - PAD.l - PAD.r);
    const y = (v: number) => PAD.t + (1 - (v - y0) / (y1 - y0)) * (H - PAD.t - PAD.b);
    const ticks = [0, 0.5, 1].map((f) => y0 + f * (y1 - y0));
    return { x, y, t0, t1, ticks };
    // eslint-disable-next-line react-hooks/exhaustive-deps
  }, [series, yDomain]);

  if (!scale) {
    return (
      <figure className="rounded-xl border border-[#D9DBDE] bg-white p-4">
        <figcaption className="text-xs font-semibold text-[#0B0B0D]">{title}</figcaption>
        <p className="mt-6 mb-4 text-center text-xs text-[#737373]">{emptyText}</p>
      </figure>
    );
  }

  const onMove = (e: React.MouseEvent<SVGRectElement>) => {
    const box = e.currentTarget.ownerSVGElement!.getBoundingClientRect();
    const svgX = ((e.clientX - box.left) / box.width) * W;
    const dist = (p: ChartPoint) => Math.abs(scale.x(Date.parse(p.t)) - svgX);
    const rows = populated.map((s) => ({ s, p: s.points.reduce((a, b) => (dist(b) < dist(a) ? b : a)) }));
    const nearest = rows.reduce((a, b) => (dist(a.p) <= dist(b.p) ? a : b));
    setHover({ x: scale.x(Date.parse(nearest.p.t)), rows: rows.filter((r) => r.p.t === nearest.p.t) });
  };

  return (
    <figure className="rounded-xl border border-[#D9DBDE] bg-white p-4">
      <div className="flex flex-wrap items-center justify-between gap-2">
        <figcaption className="text-xs font-semibold text-[#0B0B0D]">{title} <span className="font-normal text-[#737373]">({unit})</span></figcaption>
        {populated.length > 1 && (
          <ul className="flex gap-3 text-[11px] text-[#525252]" aria-label="Legend">
            {populated.map((s) => (
              <li key={s.label} className="flex items-center gap-1.5">
                <span className="inline-block h-0.5 w-4 rounded" style={{ background: s.color }} />{s.label}
              </li>
            ))}
          </ul>
        )}
      </div>
      <div className="relative mt-2">
        <svg viewBox={`0 0 ${W} ${H}`} className="w-full h-auto" role="img" aria-label={`${title} over time`}>
          {scale.ticks.map((v) => (
            <g key={v}>
              <line x1={PAD.l} x2={W - PAD.r} y1={scale.y(v)} y2={scale.y(v)} stroke="#EDEEF0" />
              <text x={PAD.l - 6} y={scale.y(v) + 3} textAnchor="end" fontSize="10" fill="#737373">{Math.round(v)}</text>
            </g>
          ))}
          <text x={PAD.l} y={H - 6} fontSize="10" fill="#737373">{fmtTime(scale.t0)}</text>
          <text x={W - PAD.r} y={H - 6} fontSize="10" fill="#737373" textAnchor="end">{fmtTime(scale.t1)}</text>
          {populated.map((s) => {
            const pts = s.points.map((p) => `${scale.x(Date.parse(p.t))},${scale.y(p.v)}`).join(' ');
            const last = s.points[s.points.length - 1];
            const lastX = scale.x(Date.parse(last.t));
            return (
              <g key={s.label}>
                {s.points.length > 1 && <polyline points={pts} fill="none" stroke={s.color} strokeWidth={2} strokeLinejoin="round" />}
                {s.points.map((p) => (
                  <circle key={p.id} cx={scale.x(Date.parse(p.t))} cy={scale.y(p.v)} r={4} fill={s.color} stroke="#FFFFFF" strokeWidth={2} />
                ))}
                {populated.length > 1 && (
                  <text x={lastX > W - 80 ? lastX - 6 : lastX + 6} y={scale.y(last.v) - 6} fontSize="10" fill="#525252"
                    textAnchor={lastX > W - 80 ? 'end' : 'start'}>{s.label}</text>
                )}
              </g>
            );
          })}
          {hover && <line x1={hover.x} x2={hover.x} y1={PAD.t} y2={H - PAD.b} stroke="#0B0B0D" strokeOpacity={0.3} />}
          <rect x={PAD.l} y={PAD.t} width={W - PAD.l - PAD.r} height={H - PAD.t - PAD.b} fill="transparent"
            onMouseMove={onMove} onMouseLeave={() => setHover(null)} />
        </svg>
        {hover && (
          <div className="pointer-events-none absolute top-0 z-10 rounded-lg border border-[#D9DBDE] bg-white px-2.5 py-1.5 text-[11px] shadow-sm"
            style={{ left: `${(hover.x / W) * 100}%`, transform: hover.x > W / 2 ? 'translateX(calc(-100% - 8px))' : 'translateX(8px)' }}>
            <div className="text-[#737373]">{new Date(hover.rows[0].p.t).toLocaleString()}</div>
            {hover.rows.map(({ s, p }) => (
              <div key={s.label} className="flex items-center gap-1.5 text-[#0B0B0D]">
                <span className="inline-block h-2 w-2 rounded-full" style={{ background: s.color }} />
                {s.label}: <strong>{p.v.toFixed(1)} {unit}</strong>{p.note ? <span className="text-[#737373]"> · {p.note}</span> : null}
              </div>
            ))}
          </div>
        )}
      </div>
      <details className="mt-2 text-[11px] text-[#525252]">
        <summary className="cursor-pointer select-none">Table view ({all.length} values)</summary>
        <div className="mt-1 max-h-40 overflow-auto">
          <table className="w-full text-left">
            <thead><tr className="text-[#737373]"><th className="pr-2">Time</th><th className="pr-2">Series</th><th>Value</th></tr></thead>
            <tbody>
              {populated.flatMap((s) => s.points.map((p) => (
                <tr key={`${s.label}-${p.id}`}><td className="pr-2">{new Date(p.t).toLocaleString()}</td><td className="pr-2">{s.label}</td><td>{p.v.toFixed(1)} {unit}</td></tr>
              )))}
            </tbody>
          </table>
        </div>
      </details>
    </figure>
  );
};
