import { useEffect, useMemo, useState } from 'react';
import { Activity, Gauge, Timer, TriangleAlert } from 'lucide-react';
import type { KartingLapComparison, KartingSessionDetails } from './types';
import { buildContinuousLapFindings, ReportPanel } from './RaceEngineerReport';
import { useFindingHighlight } from './findingHighlight';
import './KartingWorkspace.css';
import './KartingChartInteractions.css';

interface Props {
  readonly details: KartingSessionDetails;
  readonly comparison: KartingLapComparison | null;
  readonly comparisonLoading: boolean;
  readonly onCompare: (reference: number, compared: number) => void;
}

export function KartingWorkspace({ details, comparison, comparisonLoading, onCompare }: Props) {
  const comparable = details.laps.filter((lap) => lap.isComparable);
  const bestLap = comparable.reduce((best, lap) => !best || lap.lapTimeSeconds < best.lapTimeSeconds ? lap : best, undefined as KartingSessionDetails['laps'][number] | undefined);
  const [referenceLap, setReferenceLap] = useState(bestLap?.number ?? 0);
  const [comparedLap, setComparedLap] = useState(comparable.find((lap) => lap.number !== bestLap?.number)?.number ?? 0);

  useEffect(() => {
    const best = comparable.reduce((current, lap) => !current || lap.lapTimeSeconds < current.lapTimeSeconds ? lap : current, undefined as KartingSessionDetails['laps'][number] | undefined);
    const other = comparable.find((lap) => lap.number !== best?.number);
    setReferenceLap(best?.number ?? 0);
    setComparedLap(other?.number ?? 0);
    if (best && other) onCompare(best.number, other.number);
  }, [details.id]);

  const changeReference = (value: number) => { setReferenceLap(value); if (comparedLap) onCompare(value, comparedLap); };
  const changeCompared = (value: number) => { setComparedLap(value); if (referenceLap) onCompare(referenceLap, value); };

  return <div className="page-content karting-workspace">
    <section className="page-heading karting-heading">
      <div><div className="eyebrow"><span>KARTING</span><i /> {details.circuit} <i /> {details.vehicle}</div>
        <h1>Real track <span>analysis</span></h1><p>AiM telemetry · {details.racer} · {details.date} · {details.sessionTime}</p></div>
      <span className="data-badge"><span className="status-dot" /> REAL DATA · {details.sampleRateHz} HZ</span>
    </section>

    <section className="karting-metrics">
      <Metric icon={<Activity size={16} />} label="SAMPLES" value={details.sampleCount.toLocaleString('es-ES')} detail="telemetry rows" />
      <Metric icon={<Timer size={16} />} label="SESSION TIME" value={formatDuration(details.durationSeconds)} detail={`${details.lapCount} beacon segments`} />
      <Metric icon={<Gauge size={16} />} label="PEAK SPEED" value={`${details.peakSpeedKph.toFixed(1)} km/h`} detail="GPS maximum" />
      <Metric icon={<Timer size={16} />} label="BEST VALID LAP" value={details.bestLapSeconds == null ? '—' : formatLapTime(details.bestLapSeconds)} detail={`${comparable.length} laps pass comparison filters`} />
    </section>

    {details.warnings.length > 0 && <section className="karting-quality"><div><TriangleAlert size={16} /><strong>Data validation</strong></div>
      <ul>{details.warnings.map((warning) => <li key={warning}>{warning}</li>)}</ul></section>}

    <section className="karting-panel">
      <PanelHeading index="01" title="GPS track" detail="Track trace from real latitude / longitude · coloured by speed" />
      <div className="karting-track-layout"><TrackMap details={details} />
        <div className="karting-track-aside"><div><small>ENGINE</small><strong>{Math.round(details.peakRpm).toLocaleString('es-ES')} rpm</strong><span>session peak</span></div>
          <div><small>WATER TEMPERATURE</small><strong>{details.startWaterTemperatureCelsius.toFixed(1)}° → {details.endWaterTemperatureCelsius.toFixed(1)}°C</strong><span>first to last sample</span></div>
          <div className="karting-legend"><i /> LOW SPEED <i className="high" /> HIGH SPEED</div>
          <p>Track positions are plotted in geographic coordinates. GPS points with reported accuracy ≥100 mm remain visible but are flagged by the API quality notes.</p>
        </div>
      </div>
    </section>

    <section className="karting-panel">
      <PanelHeading index="02" title="Lap comparison" detail="Signals aligned by travelled GPS distance · delta = compared − reference" />
      {comparable.length >= 2 ? <>
        <div className="karting-controls">
          <label>REFERENCE LAP<select value={referenceLap} onChange={(event) => changeReference(Number(event.target.value))}>{comparable.filter((lap) => lap.number !== comparedLap).map((lap) => <option key={lap.number} value={lap.number}>Lap {lap.number} · {formatLapTime(lap.lapTimeSeconds)}</option>)}</select></label>
          <span>VS</span>
          <label>COMPARED LAP<select value={comparedLap} onChange={(event) => changeCompared(Number(event.target.value))}>{comparable.filter((lap) => lap.number !== referenceLap).map((lap) => <option key={lap.number} value={lap.number}>Lap {lap.number} · {formatLapTime(lap.lapTimeSeconds)}</option>)}</select></label>
          <div className="karting-delta"><small>TIME DELTA</small><strong className={comparison && comparison.deltaLapTimeSeconds < 0 ? 'faster' : ''}>{comparison ? formatDelta(comparison.deltaLapTimeSeconds) : comparisonLoading ? 'Calculating…' : '—'}</strong></div>
        </div>
        {comparison && <div className="karting-chart-grid">
          <KartingChart title="Speed trace" unit="km/h" points={comparison.points.map((point) => ({ x: point.relativeDistance, a: point.reference.speedKph, b: point.compared.speedKph }))} labels={[`LAP ${comparison.referenceLap}`, `LAP ${comparison.comparedLap}`]} />
          <KartingChart title="Time delta" unit="seconds · compared − reference" points={comparison.points.map((point) => ({ x: point.relativeDistance, a: point.deltaElapsedSeconds }))} zeroLine labels={['DELTA']} />
          <KartingChart title="Engine speed" unit="rpm" points={comparison.points.map((point) => ({ x: point.relativeDistance, a: point.reference.rpm, b: point.compared.rpm }))} labels={[`LAP ${comparison.referenceLap}`, `LAP ${comparison.comparedLap}`]} />
          <KartingChart title="Acceleration" unit="g · GPS channels" points={comparison.points.map((point) => ({ x: point.relativeDistance, a: point.reference.lateralG, b: point.compared.lateralG, c: point.reference.longitudinalG, d: point.compared.longitudinalG }))} labels={['LAT REF', 'LAT COMP', 'LONG REF', 'LONG COMP']} toggleable />
          <KartingChart title="Water temperature" unit="°C" points={comparison.points.map((point) => ({ x: point.relativeDistance, a: point.reference.waterTemperatureCelsius, b: point.compared.waterTemperatureCelsius }))} labels={[`LAP ${comparison.referenceLap}`, `LAP ${comparison.comparedLap}`]} />
          <KartingChart title="Gear" unit="discrete state · N / 1 / 2" points={comparison.points.map((point) => ({ x: point.relativeDistance, a: point.reference.gear, b: point.compared.gear }))} range={[0, 2]} tickValues={[0, 1, 2]} tickLabel={(value) => value === 0 ? 'N' : String(value)} labels={[`LAP ${comparison.referenceLap}`, `LAP ${comparison.comparedLap}`]} />
        </div>}
        {comparison && <ReportPanel
          title="Oportunidades observadas · Karting"
          subtitle="Diferencias descriptivas entre segmentos de vuelta comparables, alineados por distancia GPS."
          chatContext={buildKartingChatContext(details, comparison)}
          sourceNote="Los segmentos se comparan tras filtros de calidad y provienen de una sesión de karting. Las diferencias no identifican causas de conducción. La explicación generativa, si se solicita, se limita a estos datos; no se usa ML."
          findings={buildContinuousLapFindings(comparison)}
          referenceLap={comparison.referenceLap}
          comparedLap={comparison.comparedLap}
        />}
      </> : <div className="karting-empty">No hay dos vueltas que cumplan los filtros de calidad para compararlas.</div>}
    </section>

    <section className="karting-panel">
      <PanelHeading index="03" title="Beacon lap analysis" detail={`${details.beaconCount} beacon markers · launch and in-lap segments excluded from comparisons`} />
      <div className="karting-table-wrap"><table className="karting-table"><thead><tr><th>SEGMENT</th><th>TIME</th><th>DISTANCE</th><th>AVG SPEED</th><th>PEAK SPEED</th><th>MAX RPM</th><th>WATER TEMP</th><th>GEAR 1 / 2</th><th>QUALITY</th></tr></thead>
        <tbody>{details.laps.map((lap) => <tr key={lap.number} className={lap.number === bestLap?.number ? 'best' : ''}>
          <td>{lap.number}</td><td>{formatLapTime(lap.lapTimeSeconds)}</td><td>{lap.distanceMeters.toFixed(0)} m</td><td>{lap.averageSpeedKph.toFixed(1)} km/h</td><td>{lap.maxSpeedKph.toFixed(1)} km/h</td><td>{Math.round(lap.maxRpm).toLocaleString('es-ES')}</td><td>{lap.averageWaterTemperatureCelsius.toFixed(1)} °C</td><td>{lap.gearOneSamples.toLocaleString('es-ES')} / {lap.gearTwoSamples.toLocaleString('es-ES')}</td><td><span className={`karting-quality-badge ${lap.isComparable ? 'valid' : ''}`}>{lap.quality}</span></td>
        </tr>)}</tbody></table></div>
      <p className="karting-note">Marchas discretizadas al estado más próximo (N, 1 o 2). La marcha N se conserva separada y no se suma a los contadores de las dos marchas engranadas.</p>
    </section>
  </div>;
}

function buildKartingChatContext(details: KartingSessionDetails, comparison: KartingLapComparison) {
  const reference = details.laps.find((lap) => lap.number === comparison.referenceLap);
  const compared = details.laps.find((lap) => lap.number === comparison.comparedLap);
  const mean = (values: number[]) => values.length ? values.reduce((sum, value) => sum + value, 0) / values.length : null;
  const stats = (values: number[], suffix = '') => values.length
    ? `media ${mean(values)!.toFixed(2)}${suffix}, mín ${Math.min(...values).toFixed(2)}${suffix}, máx ${Math.max(...values).toFixed(2)}${suffix}`
    : 'sin datos';
  const channelRows = ([
    ['velocidad', (point: KartingLapComparison['points'][number], side: 'reference' | 'compared') => point[side].speedKph, ' km/h'],
    ['RPM', (point: KartingLapComparison['points'][number], side: 'reference' | 'compared') => point[side].rpm, ' rpm'],
    ['aceleración lateral', (point: KartingLapComparison['points'][number], side: 'reference' | 'compared') => point[side].lateralG, ' g'],
    ['aceleración longitudinal', (point: KartingLapComparison['points'][number], side: 'reference' | 'compared') => point[side].longitudinalG, ' g'],
    ['temperatura agua', (point: KartingLapComparison['points'][number], side: 'reference' | 'compared') => point[side].waterTemperatureCelsius, ' °C'],
  ] as const).map(([label, read, suffix]) => {
    const referenceValues = comparison.points.map((point) => read(point, 'reference')).filter(Number.isFinite);
    const comparedValues = comparison.points.map((point) => read(point, 'compared')).filter(Number.isFinite);
    const intervals = Array.from({ length: 4 }, (_, segment) => {
      const start = segment / 4;
      const end = (segment + 1) / 4;
      const points = comparison.points.filter((point) => point.relativeDistance >= start && (segment === 3 ? point.relativeDistance <= end : point.relativeDistance < end));
      return `${segment * 25}–${(segment + 1) * 25}% ref ${formatKpi(mean(points.map((point) => read(point, 'reference')).filter(Number.isFinite)), suffix)} / comp ${formatKpi(mean(points.map((point) => read(point, 'compared')).filter(Number.isFinite)), suffix)}`;
    });
    return `${label}: referencia ${stats(referenceValues, suffix)}; comparada ${stats(comparedValues, suffix)}; por tramos ${intervals.join('; ')}.`;
  });
  const gearSummary = (side: 'reference' | 'compared') => {
    const counts = [0, 1, 2].map((gear) => comparison.points.filter((point) => point[side].gear === gear).length);
    return `N/1/2: ${counts.map((count) => `${count} muestras`).join(' / ')}`;
  };

  return [
    `Sesión de karting: piloto ${details.racer}, vehículo ${details.vehicle}, circuito ${details.circuit}, fecha ${details.date} ${details.sessionTime}, frecuencia ${details.sampleRateHz} Hz.`,
    `Indicadores de sesión: ${details.sampleCount} muestras, duración ${details.durationSeconds.toFixed(1)} s, ${details.lapCount} segmentos, ${details.beaconCount} beacons, velocidad máxima ${details.peakSpeedKph.toFixed(1)} km/h, RPM máximo ${details.peakRpm.toFixed(0)}, temperatura del agua inicial/final ${details.startWaterTemperatureCelsius.toFixed(1)}/${details.endWaterTemperatureCelsius.toFixed(1)} °C, mejor vuelta ${details.bestLapSeconds == null ? 'no disponible' : `${details.bestLapSeconds.toFixed(3)} s`}.`,
    `Vuelta de referencia ${comparison.referenceLap}: ${reference ? `${reference.lapTimeSeconds.toFixed(3)} s, ${reference.distanceMeters.toFixed(1)} m, velocidad media/máxima ${reference.averageSpeedKph.toFixed(1)}/${reference.maxSpeedKph.toFixed(1)} km/h, RPM máximo ${reference.maxRpm.toFixed(0)}, agua media ${reference.averageWaterTemperatureCelsius.toFixed(1)} °C, marchas 1/2 ${reference.gearOneSamples}/${reference.gearTwoSamples}, calidad ${reference.quality}` : 'resumen no disponible'}.`,
    `Vuelta comparada ${comparison.comparedLap}: ${compared ? `${compared.lapTimeSeconds.toFixed(3)} s, ${compared.distanceMeters.toFixed(1)} m, velocidad media/máxima ${compared.averageSpeedKph.toFixed(1)}/${compared.maxSpeedKph.toFixed(1)} km/h, RPM máximo ${compared.maxRpm.toFixed(0)}, agua media ${compared.averageWaterTemperatureCelsius.toFixed(1)} °C, marchas 1/2 ${compared.gearOneSamples}/${compared.gearTwoSamples}, calidad ${compared.quality}` : 'resumen no disponible'}. Delta de vuelta comparada − referencia ${comparison.deltaLapTimeSeconds.toFixed(3)} s.`,
    `Trazas comparativas (medias y extremos de los puntos alineados por distancia): ${channelRows.join(' ')} Marcha discreta N/1/2, referencia ${gearSummary('reference')}; comparada ${gearSummary('compared')}.`,
    `Advertencias de calidad visibles: ${details.warnings.join('; ') || 'ninguna'}. Las relaciones observadas no prueban causalidad.`,
  ].join('\n');
}

function formatKpi(value: number | null, suffix: string) {
  return value == null || !Number.isFinite(value) ? 'no disponible' : `${value.toFixed(2)}${suffix}`;
}

function TrackMap({ details }: { readonly details: KartingSessionDetails }) {
  const geometry = useMemo(() => {
    if (details.track.length < 2) return null;
    const lat = details.track.map((point) => point.latitude); const lon = details.track.map((point) => point.longitude);
    const lat0 = (Math.min(...lat) + Math.max(...lat)) / 2;
    const xs = details.track.map((point) => (point.longitude - (Math.min(...lon) + Math.max(...lon)) / 2) * 111320 * Math.cos(lat0 * Math.PI / 180));
    const ys = details.track.map((point) => (point.latitude - lat0) * 111320);
    const minX = Math.min(...xs); const maxX = Math.max(...xs); const minY = Math.min(...ys); const maxY = Math.max(...ys);
    const width = 820; const height = 410; const pad = 25;
    const scale = Math.min((width - pad * 2) / Math.max(maxX - minX, 1), (height - pad * 2) / Math.max(maxY - minY, 1));
    const x = (value: number) => (width - (maxX - minX) * scale) / 2 + (value - minX) * scale;
    const y = (value: number) => height - ((height - (maxY - minY) * scale) / 2 + (value - minY) * scale);
    const speeds = details.track.map((point) => point.speedKph); const low = Math.min(...speeds); const high = Math.max(...speeds);
    return { width, height, points: details.track.map((point, index) => ({ x: x(xs[index]), y: y(ys[index]), speed: point.speedKph })), low, high };
  }, [details.track]);
  if (!geometry) return <div className="karting-empty">No hay coordenadas GPS suficientes para dibujar el circuito.</div>;
  const color = (speed: number) => `hsl(${155 - ((speed - geometry.low) / Math.max(geometry.high - geometry.low, 1)) * 125} 78% 62%)`;
  return <div className="karting-track-svg-wrap"><svg viewBox={`0 0 ${geometry.width} ${geometry.height}`} role="img" aria-label="Trazada GPS de la sesión de karting">
    {geometry.points.slice(1).map((point, index) => { const first = geometry.points[index]; return <line key={index} x1={first.x} y1={first.y} x2={point.x} y2={point.y} stroke={color((first.speed + point.speed) / 2)} strokeWidth="3.2" strokeLinecap="round" />; })}
    <circle cx={geometry.points[0].x} cy={geometry.points[0].y} r="5" fill="#f4f7f7" stroke="#111318" strokeWidth="2" />
  </svg></div>;
}

function KartingChart({ title, unit, points, labels, range, zeroLine = false, toggleable = false, tickValues, tickLabel }: {
  readonly title: string; readonly unit: string;
  readonly points: { x: number; a: number; b?: number; c?: number; d?: number }[];
  readonly labels: string[]; readonly range?: [number, number]; readonly zeroLine?: boolean; readonly toggleable?: boolean;
  readonly tickValues?: number[]; readonly tickLabel?: (value: number) => string;
}) {
  const [visibleSeries, setVisibleSeries] = useState<number[]>(() => labels.map((_, index) => index));
  const highlightedRanges = useFindingHighlight();
  const values = points.flatMap((point) => [point.a, point.b, point.c, point.d].filter((value): value is number => value != null));
  let min = range?.[0] ?? Math.min(...values); let max = range?.[1] ?? Math.max(...values);
  if (max - min < 0.00001) { min -= 1; max += 1; }
  if (!range) { const pad = (max - min) * 0.08; min -= pad; max += pad; }
  const width = 760; const height = 235; const left = 58; const right = 14; const top = 35; const bottom = 30;
  const x = (value: number) => left + value * (width - left - right);
  const y = (value: number) => top + (max - value) / (max - min) * (height - top - bottom);
  const axisTicks = tickValues ?? Array.from({ length: 5 }, (_, index) => min + (max - min) * index / 4);
  const keys = ['a', 'b', 'c', 'd'] as const; const colors = ['#73dfb2', '#ffaf63', '#59a9ff', '#c292ff'];
  return <section className="karting-chart"><header><div><h3>{title}</h3><span>{unit}</span></div><div className="karting-chart-legend">{labels.map((label, index) => {
    const active = visibleSeries.includes(index);
    return toggleable
      ? <button type="button" key={label} className={`karting-chart-legend-toggle ${active ? 'is-active' : ''}`} style={{ color: colors[index] }} onClick={() => setVisibleSeries((current) => active ? current.filter((item) => item !== index) : [...current, index])} aria-pressed={active} aria-label={`${active ? 'Ocultar' : 'Mostrar'} ${label}`}><i style={{ background: colors[index] }} />{label}</button>
      : <span key={label}><i style={{ background: colors[index] }} />{label}</span>;
  })}</div></header>
    <div className="karting-chart-svg-wrap"><svg data-racemind-chart-anchor="true" viewBox={`0 0 ${width} ${height}`} role="img" aria-label={`${title} by lap distance`}>
       {axisTicks.map((value) => <g key={value}><line x1={left} x2={width - right} y1={y(value)} y2={y(value)} className="karting-gridline" /><text x={left - 7} y={y(value) + 3} textAnchor="end" className="karting-axis-label">{tickLabel ? tickLabel(value) : value.toFixed(1)}</text></g>)}
      {highlightedRanges.map((highlight, index) => { const first = x(highlight.start); const last = x(highlight.end); return <g key={`finding-highlight-${index}`} pointerEvents="none">{Math.abs(last - first) < 2 ? <line x1={first} x2={first} y1={top} y2={height - bottom} className="finding-chart-cursor" /> : <rect x={first} y={top} width={last - first} height={height - top - bottom} className="finding-chart-range" />}</g>; })}
      {zeroLine && min < 0 && max > 0 && <line x1={left} x2={width - right} y1={y(0)} y2={y(0)} className="karting-zero-line" />}
      {keys.map((key, index) => { const selected = points.filter((point) => point[key] != null); if (!selected.length || !labels[index] || (toggleable && !visibleSeries.includes(index))) return null; return <path key={key} d={selected.map((point, position) => `${position ? 'L' : 'M'}${x(point.x)},${y(point[key]!)}`).join(' ')} fill="none" stroke={colors[index]} strokeWidth="2" strokeLinejoin="round" strokeLinecap="round" />; })}
      {[0, .25, .5, .75, 1].map((value) => <text key={value} x={x(value)} y={height - 7} textAnchor="middle" className="karting-axis-label">{Math.round(value * 100)}%</text>)}
    </svg></div>
  </section>;
}

function PanelHeading({ index, title, detail }: { readonly index: string; readonly title: string; readonly detail: string }) {
  return <header className="karting-panel-heading"><div><span>{index}</span><h2>{title}</h2></div><small>{detail}</small></header>;
}
function Metric({ icon, label, value, detail }: { readonly icon: React.ReactNode; readonly label: string; readonly value: string; readonly detail: string }) { return <article><i>{icon}</i><small>{label}</small><strong>{value}</strong><span>{detail}</span></article>; }
function formatDuration(seconds: number) { return `${Math.floor(seconds / 60)}m ${(seconds % 60).toFixed(0)}s`; }
function formatLapTime(seconds: number) { return `${Math.floor(seconds / 60)}:${(seconds % 60).toFixed(3).padStart(6, '0')}`; }
function formatDelta(seconds: number) { return `${seconds > 0 ? '+' : seconds < 0 ? '−' : ''}${Math.abs(seconds).toFixed(3)} s`; }
