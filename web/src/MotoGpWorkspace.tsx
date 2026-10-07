import { useMemo, useState } from 'react';
import { Flag, Gauge, Timer, Trophy, Wind } from 'lucide-react';
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
  const standings = buildStandings(details.results, lapRecords);

  return (
    <div className="page-content motogp-workspace">
      <section className="page-heading">
        <div>
          <div className="eyebrow"><span>MOTOGP</span><i /> {details.session.eventName} <i /> {details.session.sessionName}</div>
          <h1>MotoGP <span>session analysis</span></h1>
          <p>Resultados y análisis de vueltas procedentes del libro de sesión.</p>
        </div>
        <span className="data-badge"><span className="status-dot" /> XLSX SESSION</span>
      </section>

      <section className="session-strip">
        <div className="session-strip-event"><span className="event-flag"><Flag size={18} /></span><span><small>EVENT / SESSION</small><strong>{details.session.eventName} <b>·</b> {details.session.sessionName}</strong></span></div>
        <div className="strip-divider" />
        <div className="session-strip-stat"><small>RIDERS</small><strong>{details.results.length}</strong></div>
        <div className="session-strip-stat"><small>LAP RECORDS</small><strong>{details.session.lapRecordCount}</strong></div>
        <div className="strip-weather"><Wind size={16} /><span><small>DATE / CONDITIONS</small><strong>{details.session.date ?? '—'}</strong></span></div>
      </section>

      <section className="motogp-overview-grid">
        <MetricCard icon={<Trophy size={17} />} label="SESSION LEADER" value={details.results[0]?.rider ?? '—'} detail={details.results[0] ? `P${details.results[0].position} · #${details.results[0].riderNumber}` : 'No result data'} />
        <MetricCard icon={<Timer size={17} />} label="FASTEST LAP" value={fastest?.bestLap ?? '—'} detail={fastest?.rider ?? 'No lap-time data'} />
        <MetricCard icon={<Gauge size={17} />} label="TOP SPEED" value={formatSpeed(fastest?.topSpeedKph ?? null)} detail={fastest?.rider ?? 'No speed data'} />
        <MetricCard icon={<Flag size={17} />} label="CIRCUIT" value={details.circuit ?? '—'} detail={details.session.weather ?? 'Session conditions unavailable'} />
      </section>

      <LapComparison records={lapRecords} riders={riders} />

      <section className="motogp-panel">
        <div className="motogp-panel-heading">
          <div><span className="section-index">02</span><h2>Session classification</h2></div>
          <span className="muted-label">{details.session.sessionCode} RESULTS · SOURCE ORDER</span>
        </div>
        <div className="motogp-table-wrap">
          <table className="motogp-table">
            <thead><tr><th>POS</th><th>RIDER</th><th>TEAM</th><th>BIKE</th><th>LAPS</th><th>BEST LAP</th><th>TOP SPEED</th><th>GAP</th><th>STATUS</th></tr></thead>
            <tbody>{standings.map((result) => <ClassificationRow key={`${result.riderNumber}-${result.position}`} result={result} />)}
            </tbody>
          </table>
          {standings.length === 0 && <div className="catalog-empty">No hay resultados disponibles en esta hoja.</div>}
        </div>
      </section>

      <section className="motogp-panel">
        <div className="motogp-panel-heading">
          <div><span className="section-index">03</span><h2>Lap analysis</h2></div>
          <label className="rider-filter">RIDER
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
        <div className="motogp-data-note">Los datos MotoGP disponibles son agregados por vuelta; esta vista no representa muestras de telemetría continua.</div>
      </section>
    </div>
  );
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
  return <div className="motogp-metric"><span className="motogp-metric-icon">{icon}</span><small>{label}</small><strong>{value}</strong><span>{detail}</span></div>;
}

function ClassificationRow({ result }: { readonly result: MotoGpRiderResult }) {
  return <tr>
    <td><span className={`position-number ${result.position <= 3 ? 'podium' : ''}`}>{result.position || '—'}</span></td>
    <td><strong>{result.rider}</strong><small>#{result.riderNumber}</small></td>
    <td>{result.team || '—'}</td><td>{result.bike || '—'}</td><td>{result.laps ?? '—'}</td>
    <td className="time-cell">{result.bestLap ?? '—'}</td><td>{formatSpeed(result.topSpeedKph)}</td><td>{result.gap ?? '—'}</td><td><span className="motogp-status">{result.status ?? '—'}</span></td>
  </tr>;
}

function LapRecordRow({ record }: { readonly record: MotoGpLapRecord }) {
  return <tr>
    <td><strong>{record.rider}</strong></td><td>{record.position || '—'}</td><td>{record.lapNumber}</td><td className="time-cell">{record.lapTime ?? '—'}</td>
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

  return [...results, ...rowsFromLapData].sort((first, second) => first.position - second.position);
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
