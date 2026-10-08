import { useEffect, useMemo, useState } from 'react';
import type { CSSProperties } from 'react';
import { Activity, Flag, Gauge, Timer, Trophy, Wind } from 'lucide-react';
import type { MotoGpLapRecord, MotoGpRiderResult, MotoGpSessionDetails } from './types';
import './MotoGpWorkspace.css';

interface MotoGpWorkspaceProps {
  readonly details: MotoGpSessionDetails;
  readonly lapRecords: MotoGpLapRecord[];
}

export function MotoGpWorkspace({ details, lapRecords }: MotoGpWorkspaceProps) {
  const [selectedRider, setSelectedRider] = useState('');
  const riders = useMemo(() => aggregateRiders(lapRecords), [lapRecords]);
  const visibleRecords = selectedRider
    ? lapRecords.filter((record) => riderKey(record) === selectedRider)
    : lapRecords;
  const fastest = findFastestRider(details.results);
  const fastestLapRecord = [...lapRecords].filter((record) => parseLapTime(record.lapTime) != null)
    .sort((first, second) => compareLapTime(first.lapTime ?? '', second.lapTime ?? ''))[0];
  const topSpeedRecord = [...lapRecords].filter((record) => record.speedKph != null)
    .sort((first, second) => (second.speedKph ?? 0) - (first.speedKph ?? 0))[0];
  const standings = buildStandings(details.results, lapRecords);

  return (
    <div className="page-content motogp-workspace">
      <section className="page-heading">
        <div>
          <div className="eyebrow" title={`${details.session.eventName} · ${details.session.sessionName}`}><span>MOTOGP</span><i /> {details.session.eventName} <i /> {details.session.sessionName}</div>
          <h1>MotoGP <span>session analysis</span></h1>
          <p>Resultados y análisis de vueltas procedentes del libro de sesión.</p>
        </div>
        <span className="data-badge"><span className="status-dot" /> XLSX SESSION</span>
      </section>

      <section className="session-strip">
        <div className="session-strip-event" title={`${details.session.eventName} · ${details.session.sessionName}`}><span className="event-flag"><Flag size={18} /></span><span><small>EVENT / SESSION</small><strong>{details.session.eventName} <b>·</b> {details.session.sessionName}</strong></span></div>
        <div className="strip-divider" />
        <div className="session-strip-stat" title={`${details.results.length} riders`}><small>RIDERS</small><strong>{details.results.length}</strong></div>
        <div className="session-strip-stat" title={`${details.session.lapRecordCount} lap records`}><small>LAP RECORDS</small><strong>{details.session.lapRecordCount}</strong></div>
        <div className="strip-weather" title={details.session.weather ?? 'Conditions unavailable'}><Wind size={16} /><span><small>DATE / CONDITIONS</small><strong>{details.session.date ?? '—'}</strong></span></div>
      </section>

      <section className="motogp-overview-grid">
        <MetricCard icon={<Trophy size={17} />} label="SESSION LEADER" value={details.results[0]?.rider ?? '—'} detail={details.results[0] ? `P${details.results[0].position} · #${details.results[0].riderNumber}` : 'No result data'} />
        <MetricCard icon={<Timer size={17} />} label="FASTEST LAP" value={fastestLapRecord?.lapTime ?? fastest?.bestLap ?? '—'} detail={fastestLapRecord?.rider ?? fastest?.rider ?? 'No lap-time data'} />
        <MetricCard icon={<Gauge size={17} />} label="TOP SPEED" value={formatSpeed(topSpeedRecord?.speedKph ?? fastest?.topSpeedKph ?? null)} detail={topSpeedRecord?.rider ?? fastest?.rider ?? 'No speed data'} />
        <MetricCard icon={<Flag size={17} />} label="CIRCUIT" value={details.circuit ?? '—'} detail={details.session.weather ?? 'Session conditions unavailable'} />
      </section>

      <MotoGpAnalytics records={lapRecords} riders={riders} />

      <LapComparison records={lapRecords} riders={riders} />

      <details className="motogp-details">
        <summary><span>Session classification</span><small>{standings.length} riders · result sheet</small></summary>
        <section className="motogp-panel">
          <div className="motogp-table-wrap">
            <table className="motogp-table">
              <thead><tr><th>POS</th><th>RIDER</th><th>TEAM</th><th>BIKE</th><th>LAPS</th><th>BEST LAP</th><th>TOP SPEED</th><th>GAP</th><th>STATUS</th></tr></thead>
              <tbody>{standings.map((result) => <ClassificationRow key={`${result.riderNumber}-${result.position}`} result={result} />)}</tbody>
            </table>
            {standings.length === 0 && <div className="catalog-empty">No hay resultados disponibles en esta hoja.</div>}
          </div>
        </section>
      </details>

      <details className="motogp-details">
        <summary><span>Lap analysis data</span><small>{visibleRecords.length} lap records · detailed table</small></summary>
        <section className="motogp-panel">
          <div className="motogp-panel-heading">
            <label className="rider-filter">FILTER RIDER
              <select value={selectedRider} onChange={(event) => setSelectedRider(event.target.value)}>
                <option value="">All riders</option>
                {riders.map((rider) => <option key={rider.key} value={rider.key}>{rider.name} · #{rider.number}</option>)}
              </select>
            </label>
          </div>
          <div className="motogp-table-wrap lap-record-table-wrap">
            <table className="motogp-table lap-record-table">
              <thead><tr><th>RIDER</th><th>POS</th><th>LAP</th><th>LAP TIME</th><th>T1</th><th>T2</th><th>T3</th><th>T4</th><th>SPEED</th><th>PIT</th><th>RUN</th><th>FRONT TYRE</th><th>REAR TYRE</th></tr></thead>
              <tbody>{visibleRecords.map((record, index) => <LapRecordRow key={`${record.riderNumber}-${record.lapNumber}-${index}`} record={record} />)}</tbody>
            </table>
            {visibleRecords.length === 0 && <div className="catalog-empty">No hay vueltas que mostrar.</div>}
          </div>
          <div className="motogp-data-note">Los datos son tiempos agregados por vuelta; no hay muestras de telemetría continua.</div>
        </section>
      </details>
    </div>
  );
}

const riderChartColors = ['#73dfb2', '#ffaf63', '#68aaff', '#cb91ff'];

function MotoGpAnalytics({ records, riders }: LapComparisonProps) {
  const fastestRiders = useMemo(() => [...riders].filter((rider) => rider.bestLap != null)
    .sort((first, second) => compareLapTime(first.bestLap ?? '', second.bestLap ?? '')), [riders]);
  const [selectedRiders, setSelectedRiders] = useState<string[]>([]);

  useEffect(() => {
    setSelectedRiders((current) => current.length > 0
      ? current.filter((key) => riders.some((rider) => rider.key === key)).slice(0, 4)
      : fastestRiders.slice(0, 4).map((rider) => rider.key));
  }, [fastestRiders, riders]);

  const toggleRider = (key: string) => setSelectedRiders((current) => {
    if (current.includes(key)) return current.filter((item) => item !== key);
    return current.length < 4 ? [...current, key] : current;
  });
  const selectedRiderItems = selectedRiders
    .map((key) => riders.find((rider) => rider.key === key))
    .filter((rider): rider is ReturnType<typeof aggregateRiders>[number] => rider != null);

  return <section className="motogp-panel motogp-analytics">
    <div className="motogp-panel-heading">
      <div><span className="section-index">01</span><h2>Race pace & sector performance</h2></div>
      <span className="muted-label"><Activity size={13} /> LAP-BY-LAP DATA</span>
    </div>
    <div className="motogp-analytics-grid">
      <section className="motogp-chart-card motogp-pace-card">
        <div className="motogp-chart-heading"><div><h3>Lap time progression</h3><span>Lap time in seconds · lower is faster</span></div><small>{selectedRiders.length}/4 RIDERS</small></div>
        <div className="motogp-rider-legend">
          {fastestRiders.map((rider) => {
            const selectedIndex = selectedRiders.indexOf(rider.key);
            const riderColor = selectedIndex >= 0 ? riderChartColors[selectedIndex] : undefined;
            return <button type="button" key={rider.key} className={`motogp-rider-chip ${selectedIndex >= 0 ? 'selected' : ''}`} title={`${rider.name} · #${rider.number}${rider.bestLap ? ` · Best lap ${rider.bestLap}` : ''}`} style={riderColor ? { '--rider-color': riderColor } as CSSProperties : undefined} onClick={() => toggleRider(rider.key)} aria-pressed={selectedIndex >= 0}>
              <i />{rider.name} <small>#{rider.number}</small>
            </button>;
          })}
          {fastestRiders.length === 0 && <span className="motogp-chart-empty">No timed laps available.</span>}
        </div>
        <LapPaceChart records={records} riders={selectedRiderItems} />
      </section>
      <SectorHeatmap records={records} riders={fastestRiders.slice(0, 10)} />
    </div>
    <p className="motogp-data-note">Pit laps and outliers can affect lap-time comparisons. The chart uses recorded lap times only; it does not interpolate telemetry.</p>
  </section>;
}

function LapPaceChart({ records, riders }: { readonly records: MotoGpLapRecord[]; readonly riders: ReturnType<typeof aggregateRiders> }) {
  const width = 800;
  const height = 300;
  const margin = { top: 18, right: 20, bottom: 40, left: 60 };
  const plotWidth = width - margin.left - margin.right;
  const plotHeight = height - margin.top - margin.bottom;
  const lines = riders.map((rider, index) => ({
    ...rider,
    color: riderChartColors[index],
    laps: records.filter((record) => riderKey(record) === rider.key && parseLapTime(record.lapTime) != null)
      .sort((first, second) => first.lapNumber - second.lapNumber),
  })).filter((rider) => rider.laps.length > 0);
  const allLaps = lines.flatMap((rider) => rider.laps);
  if (allLaps.length === 0) return <div className="motogp-chart-empty large">Select riders with recorded lap times to view their pace.</div>;

  const times = allLaps.map((lap) => parseLapTime(lap.lapTime) ?? 0);
  let minTime = Math.min(...times);
  let maxTime = Math.max(...times);
  const padding = Math.max((maxTime - minTime) * .12, .5);
  minTime -= padding;
  maxTime += padding;
  const lapNumbers = allLaps.map((lap) => lap.lapNumber);
  const minLap = Math.min(...lapNumbers);
  const maxLap = Math.max(...lapNumbers);
  const x = (lap: number) => margin.left + (maxLap === minLap ? .5 : (lap - minLap) / (maxLap - minLap)) * plotWidth;
  const y = (seconds: number) => margin.top + ((maxTime - seconds) / (maxTime - minTime)) * plotHeight;
  const timeTicks = Array.from({ length: 5 }, (_, index) => minTime + (maxTime - minTime) * index / 4);
  const lapTicks = [...new Set(Array.from({ length: Math.min(6, maxLap - minLap + 1) }, (_, index) => Math.round(minLap + (maxLap - minLap) * index / Math.max(1, Math.min(6, maxLap - minLap + 1) - 1))))];

  return <div className="motogp-svg-scroll"><svg className="motogp-pace-chart" viewBox={`0 0 ${width} ${height}`} role="img" aria-label="Lap time progression by lap">
    {timeTicks.map((tick, index) => <g key={`time-${index}`}>
      <line x1={margin.left} x2={width - margin.right} y1={y(tick)} y2={y(tick)} className="motogp-chart-gridline" />
      <text x={margin.left - 9} y={y(tick) + 4} textAnchor="end" className="motogp-chart-axis">{tick.toFixed(1)}s</text>
    </g>)}
    {lapTicks.map((lap) => <g key={`lap-${lap}`}>
      <line x1={x(lap)} x2={x(lap)} y1={margin.top} y2={height - margin.bottom} className="motogp-chart-gridline vertical" />
      <text x={x(lap)} y={height - 14} textAnchor="middle" className="motogp-chart-axis">{lap}</text>
    </g>)}
    {lines.map((rider) => <g key={rider.key}>
      <polyline points={rider.laps.map((lap) => `${x(lap.lapNumber)},${y(parseLapTime(lap.lapTime) ?? minTime)}`).join(' ')} fill="none" stroke={rider.color} strokeWidth="2.2" strokeLinejoin="round" strokeLinecap="round" />
      {rider.laps.map((lap) => <circle key={`${rider.key}-${lap.lapNumber}`} cx={x(lap.lapNumber)} cy={y(parseLapTime(lap.lapTime) ?? minTime)} r="3.2" fill="#171a20" stroke={rider.color} strokeWidth="2"><title>{rider.name} · lap {lap.lapNumber}: {lap.lapTime}</title></circle>)}
    </g>)}
    <text x={margin.left + plotWidth / 2} y={height - 1} textAnchor="middle" className="motogp-chart-axis-title">LAP NUMBER</text>
  </svg></div>;
}

function SectorHeatmap({ records, riders }: { readonly records: MotoGpLapRecord[]; readonly riders: ReturnType<typeof aggregateRiders> }) {
  const bestLaps = riders.map((rider) => {
    const laps = records.filter((record) => riderKey(record) === rider.key && parseLapTime(record.lapTime) != null)
      .sort((first, second) => compareLapTime(first.lapTime ?? '', second.lapTime ?? ''));
    const bestLap = laps[0];
    const sectorValues = [
      laps.map((lap) => parseLapTime(lap.sector1)),
      laps.map((lap) => parseLapTime(lap.sector2)),
      laps.map((lap) => parseLapTime(lap.sector3)),
      laps.map((lap) => parseLapTime(lap.sector4)),
    ];
    const sectors = sectorValues.map((values) => {
      const valid = values.filter((time): time is number => time != null);
      return valid.length > 0 ? Math.min(...valid) : null;
    });
    return bestLap ? { rider, lap: bestLap, sectors } : null;
  }).filter((entry): entry is NonNullable<typeof entry> => entry != null);
  const sectorBest = [0, 1, 2, 3].map((sector) => Math.min(...bestLaps.map((entry) => entry.sectors[sector]).filter((time): time is number => time != null)));
  const classForSector = (time: number | null, best: number) => {
    if (time == null || !Number.isFinite(best)) return 'no-sector-time';
    const delta = time - best;
    if (delta < .15) return 'sector-best';
    if (delta < .4) return 'sector-close';
    return 'sector-behind';
  };

  return <section className="motogp-chart-card motogp-sector-heatmap">
    <div className="motogp-chart-heading"><div><h3>Best sector times</h3><span>Best overall lap and personal best in each sector</span></div><small>TOP {bestLaps.length}</small></div>
    {bestLaps.length > 0 ? <div className="motogp-heatmap-scroll"><table>
      <thead><tr><th>RIDER</th><th>LAP</th><th>S1</th><th>S2</th><th>S3</th><th>S4</th></tr></thead>
      <tbody>{bestLaps.map(({ rider, lap, sectors }) => <tr key={rider.key}>
        <td><strong title={`${rider.name} · #${rider.number}`}>{rider.name}</strong><small>#{rider.number}</small></td><td className="heatmap-lap-time" title={`Best lap: ${lap.lapTime}`}>{lap.lapTime}</td>
        {sectors.map((time, index) => <td key={index}><span className={`motogp-heat-cell ${classForSector(time, sectorBest[index])}`} title={time == null ? 'No sector time' : `${time.toFixed(3)} seconds${sectorBest[index] === time ? ' · session best' : ''}`}>{time == null ? '—' : time.toFixed(3)}</span></td>)}
      </tr>)}</tbody>
    </table></div> : <div className="motogp-chart-empty">No sector times available.</div>}
    <div className="motogp-heat-legend"><span><i className="sector-best" />Within 0.15s of best</span><span><i className="sector-close" />Within 0.4s</span><span><i className="sector-behind" />Over 0.4s</span></div>
  </section>;
}

interface LapComparisonProps {
  readonly records: MotoGpLapRecord[];
  readonly riders: ReturnType<typeof aggregateRiders>;
}

function LapComparison({ records, riders }: LapComparisonProps) {
  const [riderKeySelection, setRiderKeySelection] = useState('');
  const [referenceLapSelection, setReferenceLapSelection] = useState<number | null>(null);
  const [comparedLapSelection, setComparedLapSelection] = useState<number | null>(null);
  const rider = riders.find((item) => item.key === riderKeySelection) ?? riders[0];
  const riderRecords = records
    .filter((record) => rider != null && riderKey(record) === rider.key)
    .sort((first, second) => first.lapNumber - second.lapNumber);
  const validLaps = riderRecords.filter((record) => parseLapTime(record.lapTime) != null);
  const fastestFirst = [...validLaps].sort((first, second) => compareLapTime(first.lapTime ?? '', second.lapTime ?? ''));
  const reference = validLaps.find((record) => record.lapNumber === referenceLapSelection) ?? fastestFirst[0] ?? null;
  const compared = validLaps.find((record) => record.lapNumber === comparedLapSelection && record.lapNumber !== reference?.lapNumber)
    ?? fastestFirst.find((record) => record.lapNumber !== reference?.lapNumber)
    ?? null;

  return (
    <section className="motogp-panel motogp-compare-panel">
      <div className="motogp-panel-heading">
        <div><span className="section-index">01</span><h2>Lap comparison</h2></div>
        <span className="muted-label">COMPARE LAP TIMES AND FOUR SECTORS</span>
      </div>
      {validLaps.length > 0 ? <>
        <div className="motogp-compare-controls">
          <label>RIDER
            <select value={rider?.key ?? ''} onChange={(event) => { setRiderKeySelection(event.target.value); setReferenceLapSelection(null); setComparedLapSelection(null); }}>
              {riders.map((item) => <option key={item.key} value={item.key}>{item.name} · #{item.number}</option>)}
            </select>
          </label>
          <label><span className="motogp-lap-dot reference" />REFERENCE LAP
            <select value={reference?.lapNumber ?? ''} onChange={(event) => setReferenceLapSelection(Number(event.target.value))}>
              {validLaps.filter((record) => record.lapNumber !== compared?.lapNumber).map((record) => <option key={record.lapNumber} value={record.lapNumber}>Lap {record.lapNumber} · {record.lapTime}</option>)}
            </select>
          </label>
          <span className="motogp-compare-vs">VS</span>
          <label><span className="motogp-lap-dot compared" />COMPARED LAP
            <select value={compared?.lapNumber ?? ''} onChange={(event) => setComparedLapSelection(Number(event.target.value))}>
              {validLaps.filter((record) => record.lapNumber !== reference?.lapNumber).map((record) => <option key={record.lapNumber} value={record.lapNumber}>Lap {record.lapNumber} · {record.lapTime}</option>)}
            </select>
          </label>
        </div>
        {reference && compared ? <>
          <div className="motogp-lap-summary">
            <div className="motogp-lap-summary-time reference"><small>REFERENCE · LAP {reference.lapNumber}</small><strong>{reference.lapTime}</strong></div>
            <div className={`motogp-lap-delta ${getDeltaClass(parseLapTime(compared.lapTime)! - parseLapTime(reference.lapTime)!)}`}>
              <small>COMPARED − REFERENCE</small><strong>{formatDelta(parseLapTime(compared.lapTime)! - parseLapTime(reference.lapTime)!)}</strong>
              <span>{parseLapTime(compared.lapTime)! < parseLapTime(reference.lapTime)! ? 'FASTER' : parseLapTime(compared.lapTime)! > parseLapTime(reference.lapTime)! ? 'SLOWER' : 'EVEN'}</span>
            </div>
            <div className="motogp-lap-summary-time compared"><small>COMPARED · LAP {compared.lapNumber}</small><strong>{compared.lapTime}</strong></div>
          </div>
          <div className="motogp-sector-grid">
            {([reference.sector1, reference.sector2, reference.sector3, reference.sector4] as const).map((referenceSector, index) => {
              const referenceSeconds = parseLapTime(referenceSector);
              const comparedSeconds = parseLapTime([compared.sector1, compared.sector2, compared.sector3, compared.sector4][index]);
              const delta = referenceSeconds != null && comparedSeconds != null ? comparedSeconds - referenceSeconds : null;
              return <SectorComparison key={index} index={index} reference={referenceSector} compared={[compared.sector1, compared.sector2, compared.sector3, compared.sector4][index]} delta={delta} />;
            })}
          </div>
          <p className="motogp-data-note">Sector delta = compared lap − reference lap. Positive values are slower; negative values are faster.</p>
        </> : <div className="catalog-empty">Select at least two laps with valid lap times to compare.</div>}
      </> : <div className="motogp-compare-empty"><Timer size={18} /><span><strong>No comparable lap times</strong><small>There are no lap records with a valid time for this session.</small></span></div>}
    </section>
  );
}

function SectorComparison({ index, reference, compared, delta }: { readonly index: number; readonly reference: string | null; readonly compared: string | null; readonly delta: number | null }) {
  return <article className={`motogp-sector-card ${delta == null ? '' : getDeltaClass(delta)}`}>
    <div className="motogp-sector-heading"><small>SECTOR {index + 1}</small><span>{delta == null ? 'NO DATA' : formatDelta(delta)}</span></div>
    <div className="motogp-sector-times"><span><i className="reference" />{reference ?? '—'}</span><span><i className="compared" />{compared ?? '—'}</span></div>
    <div className="motogp-sector-track"><i /></div>
  </article>;
}

function getDeltaClass(delta: number) {
  if (delta < 0) return 'is-faster';
  if (delta > 0) return 'is-slower';
  return 'is-even';
}

function formatDelta(delta: number) {
  const sign = delta > 0 ? '+' : delta < 0 ? '−' : '';
  return `${sign}${Math.abs(delta).toFixed(3)} s`;
}

function MetricCard({ icon, label, value, detail }: { readonly icon: React.ReactNode; readonly label: string; readonly value: string; readonly detail: string }) {
  return <div className="motogp-metric"><span className="motogp-metric-icon">{icon}</span><small>{label}</small><strong title={value}>{value}</strong><span title={detail}>{detail}</span></div>;
}

function ClassificationRow({ result }: { readonly result: MotoGpRiderResult }) {
  return <tr>
    <td><span className={`position-number ${result.position <= 3 ? 'podium' : ''}`} title={`Position ${result.position || 'not classified'}`}>{result.position || '—'}</span></td>
    <td><strong title={`${result.rider} · #${result.riderNumber}`}>{result.rider}</strong><small>#{result.riderNumber}</small></td>
    <td title={result.team || 'Team unavailable'}>{result.team || '—'}</td><td title={result.bike || 'Bike unavailable'}>{result.bike || '—'}</td><td>{result.laps ?? '—'}</td>
    <td className="time-cell" title={result.bestLap ?? 'Best lap unavailable'}>{result.bestLap ?? '—'}</td><td title={formatSpeed(result.topSpeedKph)}>{formatSpeed(result.topSpeedKph)}</td><td title={result.gap ?? 'Gap unavailable'}>{result.gap ?? '—'}</td><td><span className="motogp-status" title={result.status ?? 'Status unavailable'}>{result.status ?? '—'}</span></td>
  </tr>;
}

function LapRecordRow({ record }: { readonly record: MotoGpLapRecord }) {
  return <tr>
    <td><strong title={`${record.rider} · #${record.riderNumber}`}>{record.rider}</strong></td><td>{record.position || '—'}</td><td>{record.lapNumber}</td><td className="time-cell" title={record.lapTime ?? 'Lap time unavailable'}>{record.lapTime ?? '—'}</td>
    <td>{record.sector1 ?? '—'}</td><td>{record.sector2 ?? '—'}</td><td>{record.sector3 ?? '—'}</td><td>{record.sector4 ?? '—'}</td>
    <td>{formatSpeed(record.speedKph)}</td><td>{record.pit ?? '—'}</td><td>{record.run ?? '—'}</td><td>{record.frontTyre ?? '—'}</td><td>{record.rearTyre ?? '—'}</td>
  </tr>;
}

function aggregateRiders(records: MotoGpLapRecord[]) {
  const grouped = new Map<string, MotoGpLapRecord[]>();
  for (const record of records) {
    const key = riderKey(record);
    const riderRecords = grouped.get(key) ?? [];
    riderRecords.push(record);
    grouped.set(key, riderRecords);
  }

  return [...grouped.entries()].map(([key, riderRecords]) => {
    const bestLap = riderRecords.map((record) => record.lapTime).filter(isValidLapTime).sort(compareLapTime)[0] ?? null;
    const first = riderRecords[0];
    return { key, name: first.rider, number: first.riderNumber, bestLap, topSpeedKph: maxSpeed(riderRecords) };
  }).sort((first, second) => first.name.localeCompare(second.name));
}

function findFastestRider(results: MotoGpRiderResult[]) {
  const candidates = results.filter((result) => isValidLapTime(result.bestLap));
  return [...candidates].sort((first, second) => compareLapTime(first.bestLap ?? '', second.bestLap ?? ''))[0];
}

function buildStandings(results: MotoGpRiderResult[], lapRecords: MotoGpLapRecord[]) {
  const resultByNumber = new Map(results.map((result) => [result.riderNumber, result]));
  const ridersFromLapRows = aggregateRiders(lapRecords);
  const rowsFromLapData = ridersFromLapRows
    .filter((rider) => !resultByNumber.has(rider.number))
    .map((rider, index) => ({
      position: index + 1,
      riderNumber: rider.number,
      rider: rider.name,
      team: '',
      bike: '',
      laps: lapRecords.filter((record) => record.riderNumber === rider.number).length,
      sessionTime: null,
      gap: null,
      bestLap: rider.bestLap,
      topSpeedKph: rider.topSpeedKph,
      status: 'LAP DATA',
    } satisfies MotoGpRiderResult));

  return [...results, ...rowsFromLapData].sort((first, second) => {
    const firstIsOut = first.status?.toUpperCase() === 'OUTSTND';
    const secondIsOut = second.status?.toUpperCase() === 'OUTSTND';
    if (firstIsOut !== secondIsOut) return firstIsOut ? 1 : -1;
    if (firstIsOut) return 0;
    return first.position - second.position;
  });
}

function riderKey(record: MotoGpLapRecord) {
  return `${record.riderNumber}:${record.rider}`;
}

function isValidLapTime(value: string | null): value is string {
  return value != null && parseLapTime(value) != null;
}

function compareLapTime(first: string, second: string) {
  return (parseLapTime(first) ?? 0) - (parseLapTime(second) ?? 0);
}

function parseLapTime(value: string | null | undefined): number | null {
  if (value == null) return null;
  const normalized = value.trim();
  if (!normalized) return null;
  if (!normalized.includes(':')) {
    const seconds = Number(normalized);
    return Number.isFinite(seconds) ? seconds : null;
  }
  const parts = normalized.split(':');
  if (parts.length !== 2) return null;
  const minutes = Number(parts[0]);
  const seconds = Number(parts[1]);
  return Number.isFinite(minutes) && Number.isFinite(seconds) ? minutes * 60 + seconds : null;
}

function maxSpeed(records: MotoGpLapRecord[]) {
  const speeds = records.map((record) => record.speedKph).filter((speed): speed is number => speed != null);
  return speeds.length > 0 ? Math.max(...speeds) : null;
}

function formatSpeed(value: number | null) {
  return value == null ? '—' : `${value.toFixed(1)} km/h`;
}
