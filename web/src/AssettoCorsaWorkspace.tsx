import { useEffect, useMemo, useState } from 'react';
import { Activity, Gauge, Timer, TriangleAlert } from 'lucide-react';
import type { AssettoLapComparison, AssettoSessionDetails } from './types';
import { buildContinuousLapFindings, ReportPanel } from './RaceEngineerReport';
import { useFindingHighlight } from './findingHighlight';
import { api } from './api';
import './AssettoCorsaWorkspace.css';
import './AssettoCorsaWorkspaceOverrides.css';

interface Props {
  readonly details: AssettoSessionDetails;
  readonly comparison: AssettoLapComparison | null;
  readonly comparisonLoading: boolean;
  readonly onCompare: (reference: number, compared: number) => void;
}

const colors = { reference: '#73dfb2', compared: '#ffaf63' };

export function AssettoCorsaWorkspace({ details, comparison, comparisonLoading, onCompare }: Props) {
  const [referenceLap, setReferenceLap] = useState(details.laps[0]?.number ?? 0);
  const [comparedLap, setComparedLap] = useState(details.laps[1]?.number ?? 0);
  useEffect(() => {
    if (details.laps.length === 0) { setReferenceLap(0); setComparedLap(0); return; }
    const fastest = [...details.laps].sort((first, second) => first.lapTimeSeconds - second.lapTimeSeconds)[0];
    const alternative = details.laps.find((lap) => lap.number !== fastest.number);
    setReferenceLap(fastest.number);
    setComparedLap(alternative?.number ?? 0);
    if (alternative) onCompare(fastest.number, alternative.number);
  }, [details.id]);
  const reference = details.laps.find((lap) => lap.number === referenceLap);
  const compared = details.laps.find((lap) => lap.number === comparedLap);
  const bestLapNumber = details.laps.reduce((best, lap) => lap.lapTimeSeconds < best.lapTimeSeconds ? lap : best, details.laps[0])?.number;

  const changeReference = (value: number) => { setReferenceLap(value); if (comparedLap) onCompare(value, comparedLap); };
  const changeCompared = (value: number) => { setComparedLap(value); if (referenceLap) onCompare(referenceLap, value); };

  return <div className="page-content assetto-workspace">
    <section className="page-heading assetto-heading">
      <div><div className="eyebrow"><span>ASSETTO CORSA</span><i /> {details.circuit} <i /> {details.car}</div>
        <h1>Session <span>analysis</span></h1><p>Telemetría de conducción, trazada y comparación de vueltas.</p></div>
      <span className="data-badge"><span className="status-dot" /> CSV TELEMETRY</span>
    </section>

    <section className="assetto-session-hero">
      {details.carImageUrl && <img className="assetto-car-image" src={api.assetUrl(details.carImageUrl) ?? undefined} alt={`Coche ${details.car}`} />}
      <div className="assetto-session-identity"><small>VEHICLE / CIRCUIT</small><strong>{details.car}</strong><span>{details.circuit}</span></div>
      <div className="assetto-specs">
        <Spec label="MAX RPM" value={details.specs.maxRpm?.toLocaleString('es-ES') ?? '—'} />
        <Spec label="POWER" value={formatPower(details.specs.maxPowerWatts)} />
        <Spec label="TORQUE" value={details.specs.maxTorqueNm == null ? '—' : `${details.specs.maxTorqueNm.toFixed(0)} Nm`} />
        <Spec label="FUEL CAPACITY" value={details.specs.maxFuelLitres == null ? '—' : `${details.specs.maxFuelLitres.toFixed(0)} L`} />
      </div>
    </section>

    <section className="assetto-metrics-grid">
      <Metric icon={<Activity size={16} />} label="SAMPLES" value={details.sampleCount.toLocaleString('es-ES')} detail="telemetry rows" />
      <Metric icon={<Timer size={16} />} label="SESSION TIME" value={formatDuration(details.durationSeconds)} detail={`${details.lapCount} complete laps detected`} />
      <Metric icon={<Gauge size={16} />} label="PEAK SPEED" value={details.peakSpeedKph == null ? '—' : `${details.peakSpeedKph.toFixed(1)} km/h`} detail="session maximum" />
      <Metric icon={<Timer size={16} />} label="BEST LAP" value={details.bestLapSeconds == null ? '—' : formatLapTime(details.bestLapSeconds)} detail="reconstructed from track position" />
    </section>

    {details.warnings.length > 0 && <section className="assetto-data-quality">
      <div><TriangleAlert size={16} /><strong>Data quality notes</strong></div>
      <ul>{details.warnings.map((warning) => <li key={warning}>{warning}</li>)}</ul>
    </section>}

    <section className="assetto-panel">
      <PanelHeading index="01" title="Track map" detail="Position coloured by speed · start/finish proximity used for lap reconstruction" />
      <div className="assetto-track-layout">
        <TrackMap details={details} />
        <div className="assetto-map-aside">
          {details.mapUrl && <img src={api.assetUrl(details.mapUrl) ?? undefined} alt={`${details.circuit} circuit reference map`} />}
          <div className="assetto-gradient-legend"><span>LOW SPEED</span><i /><span>HIGH SPEED</span></div>
          <p>The trajectory comes from simulation coordinates. The supplied map is shown separately as a reference and isn't scale-aligned.</p>
        </div>
      </div>
    </section>

    {details.laps.length > 0 && <>
      <section className="assetto-panel assetto-compare-panel">
        <PanelHeading index="02" title="Lap comparison" detail="Signals aligned by travelled distance · delta = compared − reference" />
        <div className="assetto-compare-controls">
          <label>REFERENCE LAP<select value={referenceLap} onChange={(event) => changeReference(Number(event.target.value))}>{details.laps.map((lap) => <option key={lap.number} value={lap.number}>Lap {lap.number} · {formatLapTime(lap.lapTimeSeconds)}</option>)}</select></label>
          <span className="assetto-vs">VS</span>
          <label>COMPARED LAP<select value={comparedLap} onChange={(event) => changeCompared(Number(event.target.value))}>{details.laps.filter((lap) => lap.number !== referenceLap).map((lap) => <option key={lap.number} value={lap.number}>Lap {lap.number} · {formatLapTime(lap.lapTimeSeconds)}</option>)}</select></label>
          <div className="assetto-delta-readout"><small>TIME DELTA</small><strong className={comparison && comparison.deltaLapTimeSeconds < 0 ? 'faster' : ''}>{comparison ? formatDelta(comparison.deltaLapTimeSeconds) : comparisonLoading ? 'Calculating…' : '—'}</strong></div>
        </div>
        {reference && compared && <div className="assetto-lap-stats">
          <LapStat label={`REFERENCE · LAP ${reference.number}`} value={formatLapTime(reference.lapTimeSeconds)} sub={`${reference.maxSpeedKph.toFixed(1)} km/h peak · ${reference.distanceMeters.toFixed(0)} m`} color={colors.reference} />
          <LapStat label={`COMPARED · LAP ${compared.number}`} value={formatLapTime(compared.lapTimeSeconds)} sub={`${compared.maxSpeedKph.toFixed(1)} km/h peak · ${compared.distanceMeters.toFixed(0)} m`} color={colors.compared} />
        </div>}
        {comparison && <div className="assetto-charts-grid">
          <AssettoChart title="Speed trace" unit="km/h" points={comparison.points.map((point) => ({ x: point.relativeDistance, first: point.reference.speedKph, second: point.compared.speedKph }))} />
          <AssettoChart title="Throttle & brake" unit="input · 0–1" range={[0, 1]} points={comparison.points.map((point) => ({ x: point.relativeDistance, first: point.reference.throttle, second: point.compared.throttle, third: point.reference.brake, fourth: point.compared.brake }))} labels={['THROTTLE REF', 'THROTTLE COMP', 'BRAKE REF', 'BRAKE COMP']} colors={[colors.reference, colors.compared, '#68aaff', '#bb8bf3']} toggleable />
          <AssettoChart title="Time delta" unit="seconds · compared − reference" points={comparison.points.map((point) => ({ x: point.relativeDistance, first: point.deltaElapsedSeconds }))} zeroLine />
          <AssettoChart title="Lateral acceleration" unit="g" points={comparison.points.map((point) => ({ x: point.relativeDistance, first: point.reference.lateralG, second: point.compared.lateralG }))} />
        </div>}
        {comparison && <ReportPanel
          title="Oportunidades observadas · Assetto Corsa"
          subtitle={buildAssettoChatContext(details, reference, compared, comparison)}
          sourceNote="Los hallazgos son observaciones de esta sesión simulada. La reconstrucción de vuelta usa proximidad al origen. La explicación generativa, si se solicita, se limita a estas observaciones; no se usa ML."
          findings={buildContinuousLapFindings(comparison)}
          referenceLap={comparison.referenceLap}
          comparedLap={comparison.comparedLap}
        />}
      </section>

      <section className="assetto-panel">
        <PanelHeading index="03" title="Tyre temperatures" detail="Tyre core temperature by wheel · °C" />
        {comparison ? <TyreCards comparison={comparison} /> : <div className="assetto-empty">Elige dos vueltas detectadas para cargar la telemetría comparativa.</div>}
      </section>
    </>}

    <section className="assetto-panel">
      <PanelHeading index="04" title="Lap analysis" detail={`${details.laps.length} detected laps · robust speed percentile and travelled distance`} />
      <div className="assetto-table-wrap"><table className="assetto-table"><thead><tr><th>LAP</th><th>LAP TIME</th><th>DISTANCE</th><th>AVG SPEED</th><th>PEAK SPEED</th><th>MAX RPM</th><th>FUEL Δ</th><th title="Number of telemetry rows recorded within this lap">SAMPLES / LAP</th></tr></thead>
        <tbody>{details.laps.map((lap) => <tr key={lap.number} className={lap.number === bestLapNumber ? 'best' : ''}>
          <td>{lap.number}</td><td>{formatLapTime(lap.lapTimeSeconds)}</td><td>{lap.distanceMeters.toFixed(0)} m</td><td>{lap.averageSpeedKph.toFixed(1)} km/h</td><td>{lap.maxSpeedKph.toFixed(1)} km/h</td><td>{lap.maxRpm.toLocaleString('es-ES')}</td><td>{(lap.fuelStartLitres - lap.fuelEndLitres).toFixed(2)} L</td><td title="Number of telemetry rows recorded within this lap">{lap.sampleCount.toLocaleString('es-ES')}</td>
        </tr>)}</tbody>
      </table>{details.laps.length === 0 && <div className="assetto-empty">No hay vueltas completas fiables para listar.</div>}</div>
      {details.laps.length > 0 && <p className="assetto-table-note">Samples = número de filas de telemetría registradas durante la vuelta.</p>}
    </section>
  </div>;
}

function buildAssettoChatContext(
  details: AssettoSessionDetails,
  reference: AssettoSessionDetails['laps'][number] | undefined,
  compared: AssettoSessionDetails['laps'][number] | undefined,
  comparison: AssettoLapComparison,
) {
  const average = (values: number[]) => values.length ? values.reduce((sum, value) => sum + value, 0) / values.length : null;
  const tyreRows = ([
    ['delantera izquierda', 'tyreCoreFl'], ['delantera derecha', 'tyreCoreFr'],
    ['trasera izquierda', 'tyreCoreRl'], ['trasera derecha', 'tyreCoreRr'],
  ] as const).map(([label, key]) => {
    const referenceValues = comparison.points.map((point) => point.reference[key]).filter(Number.isFinite);
    const comparedValues = comparison.points.map((point) => point.compared[key]).filter(Number.isFinite);
    const referenceTemperature = average(referenceValues);
    const comparedTemperature = average(comparedValues);
    return `${label}: referencia ${formatOptional(referenceTemperature, ' °C')} (mín ${formatOptional(referenceValues.length ? Math.min(...referenceValues) : null, ' °C')}, máx ${formatOptional(referenceValues.length ? Math.max(...referenceValues) : null, ' °C')}), comparada ${formatOptional(comparedTemperature, ' °C')} (mín ${formatOptional(comparedValues.length ? Math.min(...comparedValues) : null, ' °C')}, máx ${formatOptional(comparedValues.length ? Math.max(...comparedValues) : null, ' °C')})`;
  });
  const allLapRows = details.laps.map((lap) =>
    `vuelta ${lap.number}: ${lap.lapTimeSeconds.toFixed(3)} s, velocidad media/máxima ${lap.averageSpeedKph.toFixed(1)}/${lap.maxSpeedKph.toFixed(1)} km/h, distancia ${lap.distanceMeters.toFixed(0)} m, RPM máximo ${lap.maxRpm.toFixed(0)}, combustible ${lap.fuelStartLitres.toFixed(2)}→${lap.fuelEndLitres.toFixed(2)} L, ${lap.sampleCount} muestras`,
  );
  const channelSummary = (
    label: string,
    read: (sample: AssettoLapComparison['points'][number]['reference']) => number,
    suffix = '',
  ) => {
    const referenceValues = comparison.points.map((point) => read(point.reference)).filter(Number.isFinite);
    const comparedValues = comparison.points.map((point) => read(point.compared)).filter(Number.isFinite);
    const stats = (values: number[]) => values.length
      ? `media ${formatOptional(average(values), suffix)}, mín ${formatOptional(Math.min(...values), suffix)}, máx ${formatOptional(Math.max(...values), suffix)}`
      : 'sin datos válidos';
    const segments = Array.from({ length: 4 }, (_, segment) => {
      const start = segment / 4;
      const end = (segment + 1) / 4;
      const points = comparison.points.filter((point) => point.relativeDistance >= start && (segment === 3 ? point.relativeDistance <= end : point.relativeDistance < end));
      const referenceSegment = points.map((point) => read(point.reference)).filter(Number.isFinite);
      const comparedSegment = points.map((point) => read(point.compared)).filter(Number.isFinite);
      return `${segment * 25}–${(segment + 1) * 25}% ref ${formatOptional(average(referenceSegment), suffix)} / comp ${formatOptional(average(comparedSegment), suffix)}`;
    });
    const meanReference = average(referenceValues);
    const meanCompared = average(comparedValues);
    return `${label} (valores normalizados en su unidad de gráfica): referencia ${stats(referenceValues)}; comparada ${stats(comparedValues)}; delta medio comparada − referencia ${formatOptional(meanCompared != null && meanReference != null ? meanCompared - meanReference : null, suffix)}. Medias por distancia relativa (referencia / comparada): ${segments.join('; ')}.`;
  };

  return [
    `Sesión Assetto Corsa: coche ${details.car}, circuito ${details.circuit}.`,
    `Contexto de sesión visible: ${details.sampleCount} muestras, ${formatDuration(details.durationSeconds)}, ${details.lapCount} vueltas detectadas, velocidad máxima de sesión ${formatOptional(details.peakSpeedKph, ' km/h')}, mejor vuelta ${details.bestLapSeconds == null ? 'no disponible' : `${details.bestLapSeconds.toFixed(3)} s`}.`,
    `Ficha visible del coche: ${details.specs.maxRpm == null ? 'RPM máximo no disponible' : `${details.specs.maxRpm} rpm máximo`}, potencia ${formatPower(details.specs.maxPowerWatts)}, par ${formatOptional(details.specs.maxTorqueNm, ' Nm')}, capacidad de combustible ${formatOptional(details.specs.maxFuelLitres, ' L')}.`,
    `Todas las vueltas del análisis visible (${details.laps.length}): ${allLapRows.join('; ') || 'sin registros'}.`,
    'Comparación alineada por distancia relativa; magnitudes descriptivas, no experimentales.',
    reference && compared
      ? `Vuelta de referencia ${reference.number}: ${reference.lapTimeSeconds.toFixed(3)} s, ${reference.averageSpeedKph.toFixed(1)} km/h de media, ${reference.maxSpeedKph.toFixed(1)} km/h de máximo, ${reference.maxRpm.toFixed(0)} rpm máximo, combustible ${reference.fuelStartLitres.toFixed(2)}→${reference.fuelEndLitres.toFixed(2)} L.`
      : `Delta de vuelta: ${formatDelta(comparison.deltaLapTimeSeconds)}.`,
    reference && compared
      ? `Vuelta comparada ${compared.number}: ${compared.lapTimeSeconds.toFixed(3)} s, ${compared.averageSpeedKph.toFixed(1)} km/h de media, ${compared.maxSpeedKph.toFixed(1)} km/h de máximo, ${compared.maxRpm.toFixed(0)} rpm máximo, combustible ${compared.fuelStartLitres.toFixed(2)}→${compared.fuelEndLitres.toFixed(2)} L.`
      : '',
    `Delta de tiempo de vuelta comparada − referencia: ${formatDelta(comparison.deltaLapTimeSeconds)}.`,
    `Temperatura media del núcleo de neumático por rueda (referencia / comparada): ${tyreRows.join('; ')}.`,
    channelSummary('Velocidad', (sample) => sample.speedKph, ' km/h'),
    channelSummary('Acelerador', (sample) => sample.throttle),
    channelSummary('Freno', (sample) => sample.brake),
    channelSummary('Aceleración lateral', (sample) => sample.lateralG, ' g'),
    channelSummary('Aceleración longitudinal', (sample) => sample.longitudinalG, ' g'),
    details.warnings.length ? `Advertencias de calidad visibles: ${details.warnings.join('; ')}.` : 'La vista no presenta advertencias de calidad de datos.',
    'La comparación observacional no demuestra que la temperatura cause la diferencia de tiempo; para ello harían falta múltiples vueltas comparables y condiciones/control experimental.',
  ].filter(Boolean).join('\n');
}

function formatOptional(value: number | null, suffix: string) {
  return value == null || !Number.isFinite(value) ? 'no disponible' : `${value.toFixed(1)}${suffix}`;
}

function TrackMap({ details }: { readonly details: AssettoSessionDetails }) {
  const geometry = useMemo(() => {
    if (details.track.length < 2) return null;
    const xs = details.track.map((point) => point.x); const zs = details.track.map((point) => point.z);
    const minX = Math.min(...xs); const maxX = Math.max(...xs); const minZ = Math.min(...zs); const maxZ = Math.max(...zs);
    const width = 760; const height = 390; const pad = 28;
    const scale = Math.min((width - 2 * pad) / Math.max(maxX - minX, 1), (height - 2 * pad) / Math.max(maxZ - minZ, 1));
    const x = (value: number) => (width - (maxX - minX) * scale) / 2 + (value - minX) * scale;
    const y = (value: number) => height - ((height - (maxZ - minZ) * scale) / 2 + (value - minZ) * scale);
    return { width, height, points: details.track.map((point) => ({ x: x(point.x), y: y(point.z), speed: point.speedKph })) };
  }, [details.track]);
  if (!geometry) return <div className="assetto-empty">No hay coordenadas de trazada suficientes.</div>;
  const speeds = geometry.points.map((point) => point.speed); const min = Math.min(...speeds); const max = Math.max(...speeds);
  const color = (speed: number) => { const ratio = (speed - min) / Math.max(max - min, 1); return `hsl(${155 - ratio * 125} 78% 62%)`; };
  return <div className="assetto-track-svg-wrap"><svg className="assetto-track-svg" viewBox={`0 0 ${geometry.width} ${geometry.height}`} role="img" aria-label="Assetto Corsa track path coloured by speed">
    {geometry.points.slice(1).map((point, index) => { const first = geometry.points[index]; return <line key={index} x1={first.x} y1={first.y} x2={point.x} y2={point.y} stroke={color((first.speed + point.speed) / 2)} strokeWidth="3.2" strokeLinecap="round" />; })}
    <circle cx={geometry.points[0].x} cy={geometry.points[0].y} r="5" fill="#f4f7f7" stroke="#111318" strokeWidth="2"><title>Session start</title></circle>
  </svg></div>;
}

function AssettoChart({ title, unit, points, range, zeroLine, labels = ['REFERENCE', 'COMPARED'], colors: lineColors = [colors.reference, colors.compared], toggleable = false }: {
  readonly title: string; readonly unit: string; readonly points: { x: number; first: number; second?: number; third?: number; fourth?: number }[];
  readonly range?: [number, number]; readonly zeroLine?: boolean; readonly labels?: string[]; readonly colors?: string[]; readonly toggleable?: boolean;
}) {
  const [visibleSeries, setVisibleSeries] = useState<number[]>(() => labels.map((_, index) => index));
  const highlightedRanges = useFindingHighlight();
  const values = points.flatMap((point) => [point.first, point.second, point.third, point.fourth].filter((value): value is number => value != null));
  let min = range?.[0] ?? Math.min(...values); let max = range?.[1] ?? Math.max(...values);
  if (max - min < 0.00001) { min -= 1; max += 1; }
  if (!range) { const padding = (max - min) * .08; min -= padding; max += padding; }
  const series = ['first', 'second', 'third', 'fourth'] as const;
  const width = 760; const height = 225; const left = 54; const right = 12; const top = 28; const bottom = 28;
  const x = (value: number) => left + value * (width - left - right);
  const y = (value: number) => top + (max - value) / (max - min) * (height - top - bottom);
  return <section className="assetto-chart-card"><header><div><h3>{title}</h3><span>{unit}</span></div><div className="assetto-chart-legend">{labels.map((label, index) => {
    const isVisible = visibleSeries.includes(index);
    return toggleable
      ? <button type="button" key={label} className={`assetto-chart-legend-toggle ${isVisible ? 'is-active' : ''}`} style={{ color: lineColors[index] }} onClick={() => setVisibleSeries((current) => isVisible ? current.filter((item) => item !== index) : [...current, index])} aria-pressed={isVisible} aria-label={`${isVisible ? 'Hide' : 'Show'} ${label}`}><i style={{ background: lineColors[index] }} />{label}</button>
      : <span key={label} style={{ color: lineColors[index] }}><i style={{ background: lineColors[index] }} />{label}</span>;
  })}</div></header>
    <div className="assetto-chart-scroll"><svg data-racemind-chart-anchor="true" viewBox={`0 0 ${width} ${height}`} role="img" aria-label={`${title}, plotted by lap distance`}>
       {Array.from({ length: 5 }, (_, index) => { const value = min + (max - min) * index / 4; return <g key={index}><line x1={left} x2={width - right} y1={y(value)} y2={y(value)} className="assetto-gridline" /><text x={left - 7} y={y(value) + 3} textAnchor="end" className="assetto-axis-label">{value.toFixed(1)}</text></g>; })}
      {highlightedRanges.map((highlight, index) => { const first = x(highlight.start); const last = x(highlight.end); return <g key={`finding-highlight-${index}`} pointerEvents="none">{Math.abs(last - first) < 2 ? <line x1={first} x2={first} y1={top} y2={height - bottom} className="finding-chart-cursor" /> : <rect x={first} y={top} width={last - first} height={height - top - bottom} className="finding-chart-range" />}</g>; })}
      {zeroLine && min < 0 && max > 0 && <line x1={left} x2={width - right} y1={y(0)} y2={y(0)} className="assetto-zero-line" />}
      {series.map((key, seriesIndex) => { if (toggleable && !visibleSeries.includes(seriesIndex)) return null; const selected = points.filter((point) => point[key] != null); if (selected.length === 0) return null; const path = selected.map((point, index) => `${index ? 'L' : 'M'}${x(point.x)},${y(point[key]!)}`).join(' '); return <path key={key} d={path} fill="none" stroke={lineColors[seriesIndex]} strokeWidth="2.1" strokeLinejoin="round" strokeLinecap="round" />; })}
      {[0, .25, .5, .75, 1].map((ratio) => <text key={ratio} x={x(ratio)} y={height - 7} textAnchor="middle" className="assetto-axis-label">{Math.round(ratio * 100)}%</text>)}
    </svg></div>
  </section>;
}

function TyreCards({ comparison }: { readonly comparison: AssettoLapComparison }) {
  const keys = ['tyreCoreFl', 'tyreCoreFr', 'tyreCoreRl', 'tyreCoreRr'] as const;
  const labels = ['FRONT LEFT', 'FRONT RIGHT', 'REAR LEFT', 'REAR RIGHT'];
  return <div className="assetto-tyres-grid">{keys.map((key, index) => {
    const refValues = comparison.points.map((point) => point.reference[key]); const cmpValues = comparison.points.map((point) => point.compared[key]);
    const avg = (items: number[]) => items.reduce((total, value) => total + value, 0) / Math.max(items.length, 1);
    return <article key={key}><small>{labels[index]}</small><strong>{avg(refValues).toFixed(1)}° <i>/</i> {avg(cmpValues).toFixed(1)}°</strong><span>reference / compared · core °C</span></article>;
  })}</div>;
}

function PanelHeading({ index, title, detail }: { readonly index: string; readonly title: string; readonly detail: string }) {
  return <header className="assetto-panel-heading"><div><span>{index}</span><h2>{title}</h2></div><small>{detail}</small></header>;
}

function Spec({ label, value }: { readonly label: string; readonly value: string }) { return <div><small>{label}</small><strong>{value}</strong></div>; }
function Metric({ icon, label, value, detail }: { readonly icon: React.ReactNode; readonly label: string; readonly value: string; readonly detail: string }) { return <article className="assetto-metric"><i>{icon}</i><small>{label}</small><strong>{value}</strong><span>{detail}</span></article>; }
function LapStat({ label, value, sub, color }: { readonly label: string; readonly value: string; readonly sub: string; readonly color: string }) { return <article><small style={{ color }}>{label}</small><strong>{value}</strong><span>{sub}</span></article>; }
function formatDuration(seconds: number) { const minutes = Math.floor(seconds / 60); return `${minutes}m ${(seconds % 60).toFixed(0)}s`; }
function formatLapTime(seconds: number) { return `${Math.floor(seconds / 60)}:${(seconds % 60).toFixed(3).padStart(6, '0')}`; }
function formatDelta(seconds: number) { return `${seconds > 0 ? '+' : seconds < 0 ? '−' : ''}${Math.abs(seconds).toFixed(3)} s`; }
function formatPower(watts: number | null) { return watts == null ? '—' : `${Math.round(watts / 735.49875).toLocaleString('es-ES')} CV (${(watts / 1000).toFixed(0)} kW)`; }
