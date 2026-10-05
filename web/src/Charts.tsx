import { useMemo } from 'react';
import type { CornerSummary, LapComparison } from './types';

type SeriesKey =
  | 'referenceSpeedKph' | 'comparedSpeedKph'
  | 'referenceThrottlePercent' | 'comparedThrottlePercent'
  | 'referenceBrakePercent' | 'comparedBrakePercent'
  | 'deltaElapsedSeconds';

interface SeriesChartProps {
  readonly title: string;
  readonly unit: string;
  readonly comparison: LapComparison;
  readonly series: { readonly key: SeriesKey; readonly label: string; readonly color: string }[];
  readonly format?: (value: number) => string;
  readonly range?: [number, number];
}

export function SeriesChart({ title, unit, comparison, series, format, range }: SeriesChartProps) {
  const width = 900;
  const height = 190;
  const left = 52;
  const right = 18;
  const top = 16;
  const bottom = 28;
  const plotWidth = width - left - right;
  const plotHeight = height - top - bottom;
  const values = series.flatMap((item) => comparison.points.map((point) => point[item.key]));
  let min = range?.[0] ?? Math.min(...values);
  let max = range?.[1] ?? Math.max(...values);
  if (Math.abs(max - min) < 0.000001) {
    max += 1;
    min -= 1;
  }
  const pad = range ? 0 : (max - min) * 0.08;
  min -= pad;
  max += pad;
  const x = (value: number) => left + value * plotWidth;
  const y = (value: number) => top + ((max - value) / (max - min)) * plotHeight;
  const ticks = 4;

  return (
    <section className="chart-card">
      <div className="chart-heading">
        <div>
          <h3>{title}</h3>
          <span>{unit}</span>
        </div>
        <div className="chart-legend">
          {series.map((item) => <span key={item.key}><i style={{ background: item.color }} />{item.label}</span>)}
        </div>
      </div>
      <div className="chart-scroll">
        <svg className="series-chart" viewBox={`0 0 ${width} ${height}`} role="img" aria-label={title}>
          {Array.from({ length: ticks + 1 }, (_, index) => {
            const value = min + ((max - min) * index) / ticks;
            const yy = y(value);
            return <g key={index}>
              <line x1={left} x2={width - right} y1={yy} y2={yy} className="grid-line" />
              <text x={left - 9} y={yy + 4} textAnchor="end" className="axis-label">{format ? format(value) : value.toFixed(0)}</text>
            </g>;
          })}
          {Array.from({ length: 5 }, (_, index) => {
            const ratio = index / 4;
            const xx = x(ratio);
            return <g key={index}>
              <line x1={xx} x2={xx} y1={top} y2={height - bottom} className="grid-line vertical" />
              <text x={xx} y={height - 7} textAnchor="middle" className="axis-label">{Math.round(ratio * 100)}%</text>
            </g>;
          })}
          {series.map((item) => {
            const path = comparison.points.map((point, index) => {
              const value = point[item.key];
              return `${index === 0 ? 'M' : 'L'} ${x(point.relativeDistance).toFixed(2)} ${y(value).toFixed(2)}`;
            }).join(' ');
            return <path key={item.key} d={path} fill="none" stroke={item.color} strokeWidth="2.4" strokeLinejoin="round" strokeLinecap="round" />;
          })}
        </svg>
      </div>
      <div className="chart-axis-caption">Distancia relativa de vuelta</div>
    </section>
  );
}

export function TrackMap({ corners }: { readonly corners: CornerSummary[] }) {
  const dimensions = useMemo(() => {
    if (corners.length < 2) return null;
    const xs = corners.map((corner) => corner.x);
    const ys = corners.map((corner) => corner.y);
    return {
      minX: Math.min(...xs), maxX: Math.max(...xs), minY: Math.min(...ys), maxY: Math.max(...ys),
    };
  }, [corners]);

  if (!dimensions) {
    return <div className="track-empty">No hay geometría de circuito disponible para esta sesión.</div>;
  }

  const width = 480;
  const height = 260;
  const padding = 28;
  const dx = Math.max(dimensions.maxX - dimensions.minX, 1);
  const dy = Math.max(dimensions.maxY - dimensions.minY, 1);
  const scale = Math.min((width - padding * 2) / dx, (height - padding * 2) / dy);
  const offsetX = (width - dx * scale) / 2;
  const offsetY = (height - dy * scale) / 2;
  const project = (corner: CornerSummary) => ({
    x: offsetX + (corner.x - dimensions.minX) * scale,
    y: height - (offsetY + (corner.y - dimensions.minY) * scale),
  });
  const points = corners.map(project);
  const path = points.map((point, index) => `${index === 0 ? 'M' : 'L'}${point.x},${point.y}`).join(' ');
  return (
    <svg className="track-map" viewBox={`0 0 ${width} ${height}`} role="img" aria-label="Mapa esquemático de curvas del circuito">
      <defs>
        <linearGradient id="trackGradient" x1="0" y1="0" x2="1" y2="1">
          <stop offset="0%" stopColor="#77e6bc" />
          <stop offset="100%" stopColor="#ffb45e" />
        </linearGradient>
      </defs>
      <path d={path} fill="none" stroke="#293039" strokeWidth="12" strokeLinecap="round" strokeLinejoin="round" />
      <path d={path} fill="none" stroke="url(#trackGradient)" strokeWidth="3" strokeLinecap="round" strokeLinejoin="round" />
      {corners.map((corner, index) => {
        const point = points[index];
        return <g key={corner.number}>
          <circle cx={point.x} cy={point.y} r="8" fill="#15191f" stroke="#74e2b5" strokeWidth="1.5" />
          <text x={point.x} y={point.y + 3} textAnchor="middle" className="corner-label">{corner.number}</text>
        </g>;
      })}
    </svg>
  );
}
