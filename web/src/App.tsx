import { useEffect, useMemo, useState } from 'react';
import type { CSSProperties } from 'react';
import {
  Activity, ArrowDownRight, ArrowUpRight, ChevronDown, Flag, Gauge,
  MapPin, Radio, RefreshCw, Search, Timer, Wind,
} from 'lucide-react';
import { api } from './api';
import { SeriesChart, TrackMap } from './Charts';
import type { CornerSummary, DriverSummary, LapComparison, LapSummary, SessionDetails, SessionSummary } from './types';

const formatLapTime = (seconds: number | null | undefined) => {
  if (seconds == null || !Number.isFinite(seconds)) return '—';
  const minutes = Math.floor(seconds / 60);
  return `${minutes}:${(seconds % 60).toFixed(3).padStart(6, '0')}`;
};

const formatSectorTime = (seconds: number | null | undefined) =>
  seconds == null || !Number.isFinite(seconds) ? '—' : `${seconds.toFixed(3)} s`;

const formatDelta = (seconds: number | null | undefined) => {
  if (seconds == null || !Number.isFinite(seconds)) return '—';
  return `${seconds > 0 ? '+' : seconds < 0 ? '−' : ''}${Math.abs(seconds).toFixed(3)} s`;
};

const compoundClass = (compound: string | null) => `compound compound-${(compound ?? 'unknown').toLowerCase()}`;

function App() {
  const [sessions, setSessions] = useState<SessionSummary[]>([]);
  const [selectedSessionId, setSelectedSessionId] = useState('');
  const [session, setSession] = useState<SessionDetails | null>(null);
  const [driver, setDriver] = useState('VER');
  const [laps, setLaps] = useState<LapSummary[]>([]);
  const [referenceLap, setReferenceLap] = useState(10);
  const [comparedLap, setComparedLap] = useState(11);
  const [comparison, setComparison] = useState<LapComparison | null>(null);
  const [corners, setCorners] = useState<CornerSummary[]>([]);
  const [loading, setLoading] = useState(true);
  const [comparisonLoading, setComparisonLoading] = useState(false);
  const [error, setError] = useState<string | null>(null);
  const [search, setSearch] = useState('');

  const selectedSession = useMemo(
    () => sessions.find((item) => item.id === selectedSessionId) ?? null,
    [sessions, selectedSessionId],
  );

  useEffect(() => {
    const controller = new AbortController();
    api.sessions(controller.signal)
      .then((items) => {
        setSessions(items);
        const preferred = items.find((item) => item.grandPrix === 'Barcelona Grand Prix' && item.sessionName === 'Race') ?? items[0];
        if (preferred) setSelectedSessionId(preferred.id);
      })
      .catch((cause: unknown) => {
        if (!(cause instanceof DOMException && cause.name === 'AbortError')) {
          setError(cause instanceof Error ? cause.message : 'No se pudo conectar con RaceMind API.');
        }
      })
      .finally(() => setLoading(false));
    return () => controller.abort();
  }, []);

  useEffect(() => {
    if (!selectedSession) return;
    const controller = new AbortController();
    setLoading(true);
    setError(null);
    setComparison(null);
    const [grandPrix, sessionName] = [selectedSession.grandPrix, selectedSession.sessionName];
    Promise.all([
      api.session(grandPrix, sessionName, controller.signal),
      api.corners(grandPrix, sessionName, controller.signal),
    ])
      .then(([details, trackCorners]) => {
        setSession(details);
        setCorners(trackCorners);
        const preferredDriver = details.drivers.find((item) => item.code === 'VER') ?? details.drivers[0];
        if (preferredDriver) setDriver(preferredDriver.code);
      })
      .catch((cause: unknown) => {
        if (!(cause instanceof DOMException && cause.name === 'AbortError')) {
          setError(cause instanceof Error ? cause.message : 'No se pudo cargar la sesión.');
        }
      })
      .finally(() => setLoading(false));
    return () => controller.abort();
  }, [selectedSession]);

  useEffect(() => {
    if (!selectedSession || !driver) return;
    const controller = new AbortController();
    setLoading(true);
    setComparison(null);
    api.laps(selectedSession.grandPrix, selectedSession.sessionName, driver, controller.signal)
      .then((items) => {
        setLaps(items);
        const valid = items.filter((lap) => lap.hasTelemetry);
        const preferredReference = valid.find((lap) => lap.isPersonalBest) ??
          [...valid].filter((lap) => lap.lapTimeSeconds != null).sort((a, b) => a.lapTimeSeconds! - b.lapTimeSeconds!)[0] ?? valid[0];
        const preferredCompared = valid.find((lap) => lap.number !== preferredReference?.number && lap.number === preferredReference!.number + 1) ??
          valid.find((lap) => lap.number !== preferredReference?.number);
        if (preferredReference) setReferenceLap(preferredReference.number);
        if (preferredCompared) setComparedLap(preferredCompared.number);
      })
      .catch((cause: unknown) => {
        if (!(cause instanceof DOMException && cause.name === 'AbortError')) {
          setError(cause instanceof Error ? cause.message : 'No se pudieron cargar las vueltas.');
        }
      })
      .finally(() => setLoading(false));
    return () => controller.abort();
  }, [selectedSession, driver]);

  useEffect(() => {
    if (!selectedSession || !driver || referenceLap === comparedLap || referenceLap <= 0 || comparedLap <= 0) return;
    const controller = new AbortController();
    setComparisonLoading(true);
    api.compare(selectedSession.grandPrix, selectedSession.sessionName, driver, referenceLap, comparedLap, controller.signal)
      .then(setComparison)
      .catch((cause: unknown) => {
        if (!(cause instanceof DOMException && cause.name === 'AbortError')) {
          setComparison(null);
          setError(cause instanceof Error ? cause.message : 'No se pudo comparar estas vueltas.');
        }
      })
      .finally(() => setComparisonLoading(false));
    return () => controller.abort();
  }, [selectedSession, driver, referenceLap, comparedLap]);

  const filteredSessions = useMemo(() => sessions.filter((item) =>
    `${item.grandPrix} ${item.sessionName}`.toLowerCase().includes(search.toLowerCase())), [sessions, search]);
  const selectedDriver = session?.drivers.find((item) => item.code === driver) ?? null;
  const reference = laps.find((lap) => lap.number === referenceLap) ?? null;
  const compared = laps.find((lap) => lap.number === comparedLap) ?? null;
  const availableLaps = laps.filter((lap) => lap.hasTelemetry);

  const chooseDriver = (value: string) => {
    setDriver(value);
    setComparison(null);
  };

  const chooseSession = (id: string) => {
    setSelectedSessionId(id);
    setSession(null);
    setLaps([]);
  };

  return (
    <div className="app-shell">
      <aside className="sidebar">
        <a className="brand" href="#top" aria-label="RaceMind inicio">
          <span className="brand-mark"><Activity size={20} strokeWidth={2.5} /></span>
          <span>RACE<span className="brand-light">MIND</span><small>TELEMETRY INTELLIGENCE</small></span>
        </a>

        <div className="side-section-label">WORKSPACE</div>
        <button className="nav-item active"><Gauge size={17} />Performance analysis</button>
        <button className="nav-item disabled" title="Disponible más adelante"><Activity size={17} />Driver profiles <span>SOON</span></button>

        <div className="side-separator" />
        <div className="side-section-label session-label">DATA SESSIONS <span>{sessions.length}</span></div>
        <label className="search-box">
          <Search size={15} />
          <input value={search} onChange={(event) => setSearch(event.target.value)} placeholder="Buscar evento..." />
        </label>
        <div className="session-list">
          {loading && sessions.length === 0 && <div className="side-loading"><span className="spinner" />Cargando eventos...</div>}
          {filteredSessions.map((item) => (
            <button key={item.id} className={`session-nav ${selectedSessionId === item.id ? 'selected' : ''}`} onClick={() => chooseSession(item.id)}>
              <span className="session-nav-icon"><Flag size={15} /></span>
              <span className="session-nav-text"><strong>{item.grandPrix.replace(' Grand Prix', ' GP')}</strong><small>{item.sessionName}</small></span>
              <span className="session-nav-count">{item.driverCount}</span>
            </button>
          ))}
          {!loading && filteredSessions.length === 0 && <div className="empty-side">No hay eventos con ese nombre.</div>}
        </div>

        <div className="sidebar-bottom">
          <div className="source-status"><span className="status-dot" /><span><strong>DATA SOURCE</strong><small>TracingInsights · local archive</small></span></div>
          <div className="profile-chip"><div className="avatar">AB</div><span><strong>Alberto Barres</strong><small>Motorsport analyst</small></span><ChevronDown size={15} /></div>
        </div>
      </aside>

      <main id="top" className="main-content">
        <header className="topbar">
          <div className="breadcrumbs"><span>Analysis</span><span className="crumb-slash">/</span><strong>{selectedSession?.grandPrix ?? 'Selecciona un evento'}</strong></div>
          <div className="topbar-right"><span className="live-pill"><i /> DATA READY</span><span className="topbar-divider" /><span className="user-initials">AB</span></div>
        </header>

        {error && <div className="error-banner"><strong>No se pudo completar la solicitud.</strong><span>{error}</span><button onClick={() => setError(null)}>Cerrar</button></div>}

        {loading && !session ? <div className="loading-screen"><span className="spinner large" />Cargando datos de sesión...</div> : session ? (
          <div className="page-content">
            <section className="page-heading">
              <div>
                <div className="eyebrow"><span>F1</span><i /> {session.grandPrix} <i /> {session.sessionName}</div>
                <h1>Performance <span>analysis</span></h1>
                <p>Compara vueltas y descubre dónde cambia el rendimiento.</p>
              </div>
              <div className="heading-actions"><span className="data-badge"><span className="status-dot" /> SESSION DATA</span><button className="icon-button" title="Actualizar" onClick={() => chooseSession(selectedSessionId)}><RefreshCw size={16} /></button></div>
            </section>

            <section className="session-strip">
              <div className="session-strip-event"><span className="event-flag"><Flag size={18} /></span><span><small>EVENT / SESSION</small><strong>{session.grandPrix} <b>·</b> {session.sessionName}</strong></span></div>
              <div className="strip-divider" />
              <div className="session-strip-stat"><small>DRIVERS</small><strong>{session.drivers.length}</strong></div>
              <div className="session-strip-stat"><small>CIRCUIT CORNERS</small><strong>{session.cornerCount || '—'}</strong></div>
              <div className="strip-weather"><Wind size={16} /><span><small>TRACK TEMP</small><strong>{session.weather?.trackTemperatureCelsius?.toFixed(1) ?? '—'}°C</strong></span><span className="weather-air">AIR {session.weather?.airTemperatureCelsius?.toFixed(1) ?? '—'}°C</span></div>
            </section>

            <section className="driver-section">
              <div className="section-title"><div><span className="section-index">01</span><h2>Driver selection</h2></div><span className="muted-label">SELECT A DRIVER TO ANALYSE</span></div>
              <div className="driver-cards">
                {session.drivers.map((item) => <DriverCard key={item.code} driver={item} selected={driver === item.code} onClick={() => chooseDriver(item.code)} />)}
              </div>
            </section>

            <section className="compare-section">
              <div className="section-title"><div><span className="section-index">02</span><h2>Lap comparison</h2><span className="section-subtitle">/{selectedDriver?.code ?? driver}</span></div><span className="muted-label"><span className="status-dot" /> TELEMETRY SYNCED</span></div>
              <div className="compare-controls">
                <div className="lap-select-group">
                  <label>REFERENCE LAP</label>
                  <div className="lap-select-wrap"><span className="lap-color reference-color" />
                    <select value={referenceLap} onChange={(event) => setReferenceLap(Number(event.target.value))}>
                      {availableLaps.map((lap) => <option key={lap.number} value={lap.number}>Lap {lap.number} · {formatLapTime(lap.lapTimeSeconds)}{lap.isPersonalBest ? ' · PB' : ''}</option>)}
                    </select><ChevronDown size={15} />
                  </div>
                </div>
                <div className="compare-versus">VS</div>
                <div className="lap-select-group">
                  <label>COMPARED LAP</label>
                  <div className="lap-select-wrap"><span className="lap-color compared-color" />
                    <select value={comparedLap} onChange={(event) => setComparedLap(Number(event.target.value))}>
                      {availableLaps.filter((lap) => lap.number !== referenceLap).map((lap) => <option key={lap.number} value={lap.number}>Lap {lap.number} · {formatLapTime(lap.lapTimeSeconds)}</option>)}
                    </select><ChevronDown size={15} />
                  </div>
                </div>
                <div className="compare-control-divider" />
                <div className="tyre-info"><span className={compoundClass(reference?.tyreCompound ?? null)}>{reference?.tyreCompound?.slice(0, 1) ?? '—'}</span><span><small>REFERENCE TYRE</small><strong>{reference?.tyreCompound ?? '—'} <em>· STINT {reference?.stint ?? '—'}</em></strong></span></div>
                <div className="compare-control-divider" />
                <span className="compare-status">{comparisonLoading ? <><span className="spinner small" /> CALCULATING</> : <><span className="status-dot" /> READY</>}</span>
              </div>

              <div className="lap-summary-grid">
                <LapSummaryCard label="REFERENCE LAP" lap={reference} color="reference" />
                <div className={`delta-card ${comparison?.deltaLapTimeSeconds != null && comparison.deltaLapTimeSeconds < 0 ? 'delta-positive' : 'delta-negative'}`}>
                  <small>TIME DELTA</small>
                  <strong>{comparison ? formatDelta(comparison.deltaLapTimeSeconds) : '—'}</strong>
                  <span>{comparison?.deltaLapTimeSeconds != null && comparison.deltaLapTimeSeconds < 0 ? <><ArrowDownRight size={13} /> FASTER</> : comparison?.deltaLapTimeSeconds != null ? <><ArrowUpRight size={13} /> SLOWER</> : 'AWAITING DATA'}</span>
                </div>
                <LapSummaryCard label="COMPARED LAP" lap={compared} color="compared" />
              </div>

              <div className="sector-grid">
                {[0, 1, 2].map((index) => <div className="sector-card" key={index}><small>SECTOR {index + 1}</small><div><strong>{formatSectorTime(index === 0 ? reference?.sector1Seconds : index === 1 ? reference?.sector2Seconds : reference?.sector3Seconds)}</strong><span>{formatDelta(comparison?.sectorDeltasSeconds[index])}</span></div><div className="sector-bar"><i style={{ width: `${Math.max(12, 100 - Math.min(100, Math.abs(comparison?.sectorDeltasSeconds[index] ?? 0) * 160))}%` }} /></div></div>)}
              </div>

              <div className="visualization-heading"><span><MapPin size={15} /> TRACK & TELEMETRY</span><span>ALIGNED BY DISTANCE <i /> {comparison?.points.length ?? 0} POINTS</span></div>
              <div className="analysis-grid">
                <section className="track-card">
                  <div className="card-title"><div><h3>Circuit overview</h3><span>Corner markers · session geometry</span></div><span className="corner-count">{corners.length} TURNS</span></div>
                  {comparison ? <TrackMap corners={corners} /> : <div className="chart-placeholder"><span className="spinner" />Loading telemetry...</div>}
                  <div className="track-legend"><span><i className="track-dot" /> CORNER</span><span><i className="track-line" /> TRACK LAYOUT</span><span className="track-legend-note">Schematic · not to scale</span></div>
                </section>
                <section className="insight-card">
                  <div className="card-title"><div><h3>Session conditions</h3><span>Latest available weather sample</span></div><span className="weather-icon"><Wind size={16} /></span></div>
                  <div className="conditions-grid">
                    <Condition label="AIR TEMP" value={session.weather?.airTemperatureCelsius} unit="°C" />
                    <Condition label="TRACK TEMP" value={session.weather?.trackTemperatureCelsius} unit="°C" />
                    <Condition label="HUMIDITY" value={session.weather?.humidityPercent} unit="%" />
                    <Condition label="WIND" value={session.weather?.windSpeedMetersPerSecond} unit="m/s" />
                    <Condition label="PRESSURE" value={session.weather?.pressureHpa} unit="hPa" />
                    <Condition label="RAINFALL" value={session.weather?.rainfall == null ? null : Number(session.weather.rainfall)} unit="" display={session.weather?.rainfall == null ? '—' : session.weather.rainfall ? 'YES' : 'NO'} />
                  </div>
                  <div className="conditions-foot"><span className="status-dot" /> WEATHER STREAM <span>SESSION ARCHIVE</span></div>
                </section>
              </div>

              {comparison && <div className="charts-grid">
                <SeriesChart title="Speed trace" unit="km/h · source unit to be confirmed" comparison={comparison} series={[
                  { key: 'referenceSpeedKph', label: `LAP ${referenceLap}`, color: '#73dfb2' },
                  { key: 'comparedSpeedKph', label: `LAP ${comparedLap}`, color: '#ffaf63' },
                ]} />
                <SeriesChart title="Throttle & brake" unit="% · brake converted from 0–1 source scale" comparison={comparison} series={[
                  { key: 'referenceThrottlePercent', label: `THROTTLE L${referenceLap}`, color: '#73dfb2' },
                  { key: 'comparedThrottlePercent', label: `THROTTLE L${comparedLap}`, color: '#ffaf63' },
                  { key: 'referenceBrakePercent', label: `BRAKE L${referenceLap}`, color: '#4b9ff5' },
                  { key: 'comparedBrakePercent', label: `BRAKE L${comparedLap}`, color: '#bb8bf3' },
                ]} range={[0, 100]} />
                <SeriesChart title="Time delta" unit="seconds · compared minus reference" comparison={comparison} series={[
                  { key: 'deltaElapsedSeconds', label: 'TIME DELTA', color: '#ffaf63' },
                ]} format={(value) => value.toFixed(2)} />
                <section className="chart-card telemetry-notes">
                  <div className="chart-heading"><div><h3>Reading the comparison</h3><span>HOW TO INTERPRET</span></div><Activity size={17} /></div>
                  <p>The delta is calculated as <strong>compared lap minus reference lap</strong>. A positive time delta means the compared lap is behind; a negative delta means it is ahead at that distance.</p>
                  <div className="note-callout"><Radio size={15} /><span>Signals are interpolated by relative distance. Source sampling intervals are irregular.</span></div>
                </section>
              </div>}

              <div className="footer-note"><Timer size={14} /><span>ANALYSIS GENERATED FROM SOURCE TELEMETRY</span><i /> <span>TRACEABLE · REPRODUCIBLE</span><span className="footer-right">RaceMind <b>v0.1</b></span></div>
            </section>
          </div>
        ) : <div className="loading-screen"><span>No session selected.</span></div>}
      </main>
    </div>
  );
}

function DriverCard({ driver, selected, onClick }: { driver: DriverSummary; selected: boolean; onClick: () => void }) {
  const color = driver.teamColour ? `#${driver.teamColour}` : '#73dfb2';
  const initials = (driver.fullName ?? driver.code).split(' ').slice(-1)[0].slice(0, 3).toUpperCase();
  return (
    <button className={`driver-card ${selected ? 'driver-selected' : ''}`} style={{ '--team-color': color } as CSSProperties & { '--team-color': string }} onClick={onClick}>
      <span className="driver-color" /><span className="driver-avatar">{initials}</span>
      <span className="driver-info"><strong>{driver.code}</strong><small>{driver.fullName ?? driver.team ?? 'Driver'}</small></span>
      <span className="driver-best"><small>BEST</small><strong>{formatLapTime(driver.bestLapSeconds)}</strong></span>
    </button>
  );
}

function LapSummaryCard({ label, lap, color }: { label: string; lap: LapSummary | null; color: 'reference' | 'compared' }) {
  return (
    <div className={`lap-summary-card ${color}`}>
      <div className="lap-summary-label"><i />{label}</div>
      <div className="lap-summary-time">{formatLapTime(lap?.lapTimeSeconds)}</div>
      <div className="lap-summary-meta"><span> LAP {lap?.number ?? '—'}</span><span className={compoundClass(lap?.tyreCompound ?? null)}>{lap?.tyreCompound ?? 'NO TYRE DATA'}</span><span>STINT {lap?.stint ?? '—'}</span></div>
    </div>
  );
}

function Condition({ label, value, unit, display }: { label: string; value: number | null | undefined; unit: string; display?: string }) {
  return <div className="condition"><small>{label}</small><strong>{display ?? (value == null ? '—' : `${value.toFixed(1)}${unit}`)}</strong></div>;
}

export default App;
