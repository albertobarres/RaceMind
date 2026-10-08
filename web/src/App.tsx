import { useState } from 'react';
import type { CSSProperties } from 'react';
import {
  Activity,
  ArrowDownRight,
  ArrowUpRight,
  ChevronDown,
  ChevronRight,
  Flag,
  Gauge,
  MapPin,
  Radio,
  Search,
  Timer,
  Wind,
} from 'lucide-react';
import { SeriesChart, TrackMap } from './Charts';
import { MotoGpWorkspace } from './MotoGpWorkspace';
import { useRaceMindDashboard } from './useRaceMindDashboard';
import type { CornerSummary, DriverSummary, LapComparison, LapSummary, MotoGpEventSummary, MotoGpLapRecord, MotoGpSessionDetails, MotoGpSessionSummary, SessionDetails, SessionSummary, TelemetryCatalog, TelemetryDataset, TelemetrySeries, TelemetryYear } from './types';

function formatLapTime(seconds: number | null | undefined) {
  if (seconds == null || !Number.isFinite(seconds)) return '—';
  const minutes = Math.floor(seconds / 60);
  return `${minutes}:${(seconds % 60).toFixed(3).padStart(6, '0')}`;
}

function formatSectorTime(seconds: number | null | undefined) {
  if (seconds == null || !Number.isFinite(seconds)) return '—';
  return `${seconds.toFixed(3)} s`;
}

function formatDelta(seconds: number | null | undefined) {
  if (seconds == null || !Number.isFinite(seconds)) return '—';
  return `${getDeltaSign(seconds)}${Math.abs(seconds).toFixed(3)} s`;
}

function getDeltaSign(seconds: number) {
  if (seconds > 0) return '+';
  if (seconds < 0) return '−';
  return '';
}

function compoundClass(compound: string | null) {
  return `compound compound-${(compound ?? 'unknown').toLowerCase()}`;
}

export default function App() {
  const dashboard = useRaceMindDashboard();
  const {
    catalog,
    selectedSessionId,
    selectedYear,
    selectedSession,
    selectedMotoGpSession,
    motoGpEvents,
    motoGpLapRecords,
    session,
    driver,
    laps,
    referenceLap,
    comparedLap,
    comparison,
    corners,
    loading,
    comparisonLoading,
    error,
    search,
    setReferenceLap,
    setComparedLap,
    setSearch,
    setError,
    resetDashboard,
    chooseDriver,
    chooseF1Session,
    chooseMotoGpSession,
  } = dashboard;

  const selectedDriver = session?.drivers.find((item) => item.code === driver) ?? null;
  const reference = laps.find((lap) => lap.number === referenceLap) ?? null;
  const compared = laps.find((lap) => lap.number === comparedLap) ?? null;
  const availableLaps = laps.filter((lap) => lap.hasTelemetry);
  return (
    <div className="app-shell">
      <Sidebar
        catalog={catalog}
        selectedSessionId={selectedSessionId}
        selectedMotoGpSessionId={selectedMotoGpSession?.session.id ?? null}
        selectedYear={selectedYear}
        loading={loading}
        search={search}
        onSearchChange={setSearch}
        onChooseF1Session={chooseF1Session}
        onChooseMotoGpSession={chooseMotoGpSession}
        motoGpEvents={motoGpEvents}
        onHome={resetDashboard}
      />

      <main id="top" className="main-content">
        <Header grandPrix={selectedSession?.grandPrix ?? selectedMotoGpSession?.session.eventName} />
        {error && <ErrorBanner message={error} onClose={() => setError(null)} />}
        <SessionWorkspace
          loading={loading}
          session={session}
          motoGpSession={selectedMotoGpSession}
          motoGpLapRecords={motoGpLapRecords}
          selectedDriver={selectedDriver}
          driver={driver ?? ''}
          reference={reference}
          compared={compared}
          availableLaps={availableLaps}
          comparison={comparison}
          comparisonLoading={comparisonLoading}
          referenceLap={referenceLap}
          comparedLap={comparedLap}
          corners={corners}
          onChooseDriver={chooseDriver}
          onReferenceChange={setReferenceLap}
          onComparedChange={setComparedLap}
        />
      </main>
    </div>
  );
}

interface SidebarProps {
  readonly catalog: TelemetryCatalog | null;
  readonly selectedSessionId: string;
  readonly selectedMotoGpSessionId: string | null;
  readonly selectedYear: number | null;
  readonly loading: boolean;
  readonly search: string;
  readonly onSearchChange: (value: string) => void;
  readonly onChooseF1Session: (year: number, id: string) => void;
  readonly onChooseMotoGpSession: (year: number, eventCode: string, sessionCode: string) => void;
  readonly motoGpEvents: MotoGpEventSummary[];
  readonly onHome: () => void;
}

function Sidebar(props: SidebarProps) {
  const { catalog, selectedSessionId, selectedMotoGpSessionId, selectedYear, loading, search, onSearchChange, onChooseF1Session, onChooseMotoGpSession, motoGpEvents, onHome } = props;
  return (
    <aside className="sidebar">
      <button className="brand brand-button" type="button" aria-label="Volver a RaceMind inicio y deseleccionar sesión" onClick={onHome}>
        <span className="brand-mark"><Activity size={20} strokeWidth={2.5} /></span>
        <span>RACE<span className="brand-light">MIND</span><small>TELEMETRY INTELLIGENCE</small></span>
      </button>

      <div className="side-section-label">WORKSPACE</div>
      <button className="nav-item active"><Gauge size={17} />Performance analysis</button>
      <button className="nav-item disabled" title="Disponible más adelante"><Activity size={17} />Driver profiles <span>SOON</span></button>

      <div className="side-separator" />
      <div className="side-section-label session-label">TELEMETRY SOURCES</div>
      <label className="search-box">
        <Search size={15} />
        <input value={search} onChange={(event) => onSearchChange(event.target.value)} placeholder="Buscar evento..." />
      </label>
      <div className="session-list">
        {loading && !catalog && <div className="side-loading"><span className="spinner" />Cargando fuentes y sesiones...</div>}
        {catalog?.categories.map((category) => (
          <CatalogCategory key={category.key} category={category} search={search} selectedSessionId={selectedSessionId} selectedMotoGpSessionId={selectedMotoGpSessionId} selectedYear={selectedYear} onChooseF1Session={onChooseF1Session} onChooseMotoGpSession={onChooseMotoGpSession} motoGpEvents={motoGpEvents} />
        ))}
        {!loading && catalog?.categories.length === 0 && <div className="empty-side">No hay fuentes configuradas.</div>}
        {!loading && catalog && catalog.categories.length > 0 && !hasMatchingCatalogItems(catalog, search) &&
          <div className="empty-side">No hay coincidencias en el catálogo.</div>}
      </div>

      <div className="sidebar-bottom">
        <div className="source-status"><span className="status-dot" /><span><strong>DATA SOURCE</strong><small>TracingInsights · local archive</small></span></div>
        <div className="profile-chip" title="Alberto Barres · Motorsport analyst"><div className="avatar">AB</div><span><strong>Alberto Barres</strong><small>Motorsport analyst</small></span><ChevronDown size={15} /></div>
      </div>
    </aside>
  );
}

interface CatalogCategoryProps {
  readonly category: TelemetryCatalog['categories'][number];
  readonly search: string;
  readonly selectedSessionId: string;
  readonly selectedMotoGpSessionId: string | null;
  readonly selectedYear: number | null;
  readonly onChooseF1Session: (year: number, id: string) => void;
  readonly onChooseMotoGpSession: (year: number, eventCode: string, sessionCode: string) => void;
  readonly motoGpEvents: MotoGpEventSummary[];
}

function CatalogCategory(props: CatalogCategoryProps) {
  const { category, search, selectedSessionId, selectedMotoGpSessionId, selectedYear, onChooseF1Session, onChooseMotoGpSession, motoGpEvents } = props;
  const [expanded, setExpanded] = useState(category.key === 'cars' || category.key === 'motorcycles' || category.key === 'simulators');
  const matchingSeries = category.series.filter((series) => seriesMatchesSearch(series, search));
  return (
    <div className="catalog-category">
      <TreeToggle expanded={expanded} onClick={() => setExpanded(!expanded)} className="catalog-category-toggle" title={category.name}>
        {category.name}
      </TreeToggle>
      {expanded && <div className="catalog-category-children">
        {matchingSeries.map((series) => (
          <CatalogSeries key={series.key} categoryKey={category.key} series={series} search={search} selectedSessionId={selectedSessionId} selectedMotoGpSessionId={selectedMotoGpSessionId} selectedYear={selectedYear} onChooseF1Session={onChooseF1Session} onChooseMotoGpSession={onChooseMotoGpSession} motoGpEvents={motoGpEvents} />
        ))}
        {matchingSeries.length === 0 && <div className="catalog-empty">No hay coincidencias.</div>}
      </div>}
    </div>
  );
}

interface CatalogSeriesProps {
  readonly categoryKey: string;
  readonly series: TelemetrySeries;
  readonly search: string;
  readonly selectedSessionId: string;
  readonly selectedMotoGpSessionId: string | null;
  readonly selectedYear: number | null;
  readonly onChooseF1Session: (year: number, id: string) => void;
  readonly onChooseMotoGpSession: (year: number, eventCode: string, sessionCode: string) => void;
  readonly motoGpEvents: MotoGpEventSummary[];
}

function CatalogSeries(props: CatalogSeriesProps) {
  const { categoryKey, series, search, selectedSessionId, selectedMotoGpSessionId, selectedYear, onChooseF1Session, onChooseMotoGpSession, motoGpEvents } = props;
  const [expanded, setExpanded] = useState(false);
  const visibleYears = series.years.filter((year) => yearMatchesSearch(year, search));
  const visibleDatasets = series.datasets.filter((dataset) => datasetMatchesSearch(dataset, search));
  const hasContents = visibleYears.length > 0 || visibleDatasets.length > 0;
  const isAnalysisAvailable = (categoryKey === 'cars' && series.key === 'f1') ||
    (categoryKey === 'motorcycles' && series.key === 'motogp');

  return (
    <div className="catalog-series">
      <TreeToggle expanded={expanded} onClick={() => setExpanded(!expanded)} className="catalog-series-toggle" title={series.name}>
        <span>{series.name}</span>
        {!isAnalysisAvailable && <span className="catalog-soon">PRÓXIMAMENTE</span>}
      </TreeToggle>
      {expanded && <div className="catalog-series-children">
        {categoryKey !== 'motorcycles' || series.key !== 'motogp' ? visibleYears.map((year) => (
          <CatalogYear key={year.year} year={year} search={search} selectedSessionId={selectedSessionId} selectedYear={selectedYear} onChooseF1Session={onChooseF1Session} />
        )) : null}
        {categoryKey === 'motorcycles' && series.key === 'motogp' && (
          <MotoGpLocalSessions events={motoGpEvents} search={search} selectedSessionId={selectedMotoGpSessionId} onChooseSession={onChooseMotoGpSession} />
        )}
        {visibleDatasets.map((dataset) => <CatalogDataset key={dataset.key} dataset={dataset} enabled={false} />)}
        {!hasContents && <div className="catalog-empty">Sin datos disponibles todavía.</div>}
      </div>}
    </div>
  );
}

interface CatalogYearProps {
  readonly year: TelemetryYear;
  readonly search: string;
  readonly selectedSessionId: string;
  readonly selectedYear: number | null;
  readonly onChooseF1Session: (year: number, id: string) => void;
}

function CatalogYear(props: CatalogYearProps) {
  const { year, search, selectedSessionId, selectedYear, onChooseF1Session } = props;
  const [expanded, setExpanded] = useState(false);
  const sessions = year.sessions.filter((session) => sessionMatchesSearch(session, search));
  return (
    <div className="catalog-year">
      <TreeToggle expanded={expanded} onClick={() => setExpanded(!expanded)} className="catalog-year-toggle" title={year.year.toString()}>{year.year}</TreeToggle>
      {expanded && <div className="catalog-session-children">
        {sessions.map((session) => (
          <button
            key={session.id}
            className={`catalog-session ${selectedSessionId === session.id && selectedYear === year.year ? 'selected' : ''}`}
            title={`${formatGrandPrix(session.grandPrix)} · ${session.sessionName}`}
            onClick={() => onChooseF1Session(year.year, session.id)}
          >
            <span className="catalog-session-icon"><Flag size={13} /></span>
            <span className="catalog-session-text"><strong>{formatGrandPrix(session.grandPrix)}</strong><small>{session.sessionName}</small></span>
          </button>
        ))}
        {sessions.length === 0 && <div className="catalog-empty">No hay sesiones en este año.</div>}
      </div>}
    </div>
  );
}

function CatalogDataset({ dataset, enabled }: { readonly dataset: TelemetryDataset; readonly enabled: boolean }) {
  const label = dataset.hasSessionAnalysis ? dataset.name : `${dataset.name} · próximamente`;
  return (
    <button className="catalog-dataset" type="button" disabled={!enabled} title={enabled ? dataset.name : `${dataset.name} · La integración de esta fuente se añadirá más adelante`}>
      <span className="catalog-dataset-dot" />
      <span>{label}</span>
    </button>
  );
}

function MotoGpLocalSessions(props: {
  readonly events: MotoGpEventSummary[];
  readonly search: string;
  readonly selectedSessionId: string | null;
  readonly onChooseSession: (year: number, eventCode: string, sessionCode: string) => void;
}) {
  const { events, search, selectedSessionId, onChooseSession } = props;
  const matchingEvents = events.filter((event) => motoGpEventMatchesSearch(event, search));
  const years = [...new Set(matchingEvents.map((event) => event.year))].sort((first, second) => second - first);

  return <div className="catalog-motogp-local">
    {years.map((year) => <MotoGpYear key={year} year={year} events={matchingEvents.filter((event) => event.year === year)} selectedSessionId={selectedSessionId} onChooseSession={onChooseSession} />)}
    {years.length === 0 && <div className="catalog-empty">No hay sesiones MotoGP para esta búsqueda.</div>}
  </div>;
}

function MotoGpYear({ year, events, selectedSessionId, onChooseSession }: {
  readonly year: number;
  readonly events: MotoGpEventSummary[];
  readonly selectedSessionId: string | null;
  readonly onChooseSession: (year: number, eventCode: string, sessionCode: string) => void;
}) {
  const [expanded, setExpanded] = useState(false);
  return <div className="catalog-year">
    <TreeToggle expanded={expanded} onClick={() => setExpanded(!expanded)} className="catalog-year-toggle" title={year.toString()}>{year}</TreeToggle>
    {expanded && <div className="catalog-session-children">
      {events.map((event) => <MotoGpEvent key={event.id} event={event} selectedSessionId={selectedSessionId} onChooseSession={onChooseSession} />)}
    </div>}
  </div>;
}

function MotoGpEvent({ event, selectedSessionId, onChooseSession }: {
  readonly event: MotoGpEventSummary;
  readonly selectedSessionId: string | null;
  readonly onChooseSession: (year: number, eventCode: string, sessionCode: string) => void;
}) {
  const [expanded, setExpanded] = useState(false);
  return <div className="catalog-year">
    <TreeToggle expanded={expanded} onClick={() => setExpanded(!expanded)} className="catalog-year-toggle" title={event.grandPrix}>{event.grandPrix}</TreeToggle>
    {expanded && <div className="catalog-session-children">
      {event.sessions.map((session) => <MotoGpSessionButton key={session.id} year={event.year} eventCode={event.eventCode} session={session} selected={selectedSessionId === session.id} onChoose={onChooseSession} />)}
    </div>}
  </div>;
}

function MotoGpSessionButton({ year, eventCode, session, selected, onChoose }: {
  readonly year: number;
  readonly eventCode: string;
  readonly session: MotoGpSessionSummary;
  readonly selected: boolean;
  readonly onChoose: (year: number, eventCode: string, sessionCode: string) => void;
}) {
  return <button className={`catalog-session ${selected ? 'selected' : ''}`} title={`${session.sessionName} · ${session.date ?? 'MotoGP'} · ${session.resultCount} pilotos`} onClick={() => onChoose(year, eventCode, session.sessionCode)}>
    <span className="catalog-session-icon"><Flag size={13} /></span>
    <span className="catalog-session-text"><strong>{session.sessionName}</strong><small>{session.date ?? 'MotoGP'} · {session.resultCount} pilotos</small></span>
  </button>;
}

function motoGpEventMatchesSearch(event: MotoGpEventSummary, search: string) {
  if (!search) return true;
  return `${event.grandPrix} ${event.eventCode} ${event.year} ${event.sessions.map((session) => `${session.sessionName} ${session.date ?? ''}`).join(' ')}`
    .toLowerCase().includes(search.toLowerCase());
}

function TreeToggle({
  expanded,
  onClick,
  className,
  title,
  children,
}: {
  readonly expanded: boolean;
  readonly onClick: () => void;
  readonly className: string;
  readonly title?: string;
  readonly children: React.ReactNode;
}) {
  const Icon = expanded ? ChevronDown : ChevronRight;
  return <button className={className} type="button" title={title} aria-expanded={expanded} onClick={onClick}><Icon size={14} />{children}</button>;
}

function seriesMatchesSearch(series: TelemetrySeries, search: string) {
  if (!search) return true;
  if (series.name.toLowerCase().includes(search.toLowerCase())) return true;
  return series.years.some((year) => yearMatchesSearch(year, search)) || series.datasets.some((dataset) => datasetMatchesSearch(dataset, search));
}

function yearMatchesSearch(year: TelemetryYear, search: string) {
  return !search || year.year.toString().includes(search) || year.sessions.some((session) => sessionMatchesSearch(session, search));
}

function sessionMatchesSearch(session: SessionSummary, search: string) {
  return !search || `${session.grandPrix} ${session.sessionName} ${session.year}`.toLowerCase().includes(search.toLowerCase());
}

function datasetMatchesSearch(dataset: TelemetryDataset, search: string) {
  return !search || `${dataset.name} ${dataset.location ?? ''}`.toLowerCase().includes(search.toLowerCase());
}

function hasMatchingCatalogItems(catalog: TelemetryCatalog, search: string) {
  if (!search) return true;
  return catalog.categories.some((category) => category.series.some((series) => seriesMatchesSearch(series, search)));
}

function Header({ grandPrix }: { readonly grandPrix: string | undefined }) {
  return (
    <header className="topbar">
      <div className="breadcrumbs" title={grandPrix ?? 'Selecciona un evento'}><span>Analysis</span><span className="crumb-slash">/</span><strong>{grandPrix ?? 'Selecciona un evento'}</strong></div>
      <div className="topbar-right"><span className="live-pill"><i /> DATA READY</span><span className="topbar-divider" /><span className="user-initials">AB</span></div>
    </header>
  );
}

function ErrorBanner({ message, onClose }: { readonly message: string; readonly onClose: () => void }) {
  return <div className="error-banner"><strong>No se pudo completar la solicitud.</strong><span>{message}</span><button onClick={onClose}>Cerrar</button></div>;
}

interface SessionWorkspaceProps {
  readonly loading: boolean;
  readonly session: SessionDetails | null;
  readonly motoGpSession: MotoGpSessionDetails | null;
  readonly motoGpLapRecords: MotoGpLapRecord[];
  readonly selectedDriver: DriverSummary | null;
  readonly driver: string;
  readonly reference: LapSummary | null;
  readonly compared: LapSummary | null;
  readonly availableLaps: LapSummary[];
  readonly comparison: LapComparison | null;
  readonly comparisonLoading: boolean;
  readonly referenceLap: number;
  readonly comparedLap: number;
  readonly corners: CornerSummary[];
  readonly onChooseDriver: (value: string) => void;
  readonly onReferenceChange: (value: number) => void;
  readonly onComparedChange: (value: number) => void;
}

function SessionWorkspace(props: SessionWorkspaceProps) {
  if (props.loading && !props.session && !props.motoGpSession) {
    return <div className="loading-screen"><span className="spinner large" /><span><strong>Cargando datos</strong><small>Preparando el catálogo de sesiones de telemetría…</small></span></div>;
  }
  if (props.motoGpSession) {
    return <MotoGpWorkspace details={props.motoGpSession} lapRecords={props.motoGpLapRecords} />;
  }
  if (!props.session) {
    return <SelectionPrompt title="Selecciona un Gran Premio" message="Elige un evento y una sesión en el panel izquierdo para consultar sus condiciones, pilotos y vueltas." />;
  }
  return <SessionContent {...props} session={props.session} />;
}

function SessionContent(props: SessionWorkspaceProps & { readonly session: SessionDetails }) {
  const {
    session,
    selectedDriver,
    driver,
    reference,
    compared,
    availableLaps,
    comparison,
    comparisonLoading,
    referenceLap,
    comparedLap,
    corners,
    onChooseDriver,
    onReferenceChange,
    onComparedChange,
  } = props;

  return (
    <div className="page-content">
      <PageHeading session={session} />
      <SessionStrip session={session} />
      <DriverSelection drivers={session.drivers} selectedDriver={driver} onChooseDriver={onChooseDriver} />
      {driver ? (
        <LapComparisonSection
          session={session}
          selectedDriver={selectedDriver}
          driver={driver}
          reference={reference}
          compared={compared}
          availableLaps={availableLaps}
          comparison={comparison}
          comparisonLoading={comparisonLoading}
          referenceLap={referenceLap}
          comparedLap={comparedLap}
          corners={corners}
          onReferenceChange={onReferenceChange}
          onComparedChange={onComparedChange}
        />
      ) : (
        <SelectionPrompt title="Selecciona un piloto" message="Las tarjetas muestran el mejor tiempo conocido. Selecciona un piloto para cargar sus vueltas y compararlas." />
      )}
    </div>
  );
}

function PageHeading({ session }: { readonly session: SessionDetails }) {
  return (
    <section className="page-heading">
      <div>
        <div className="eyebrow"><span>F1</span><i /> {session.grandPrix} <i /> {session.sessionName}</div>
        <h1>Performance <span>analysis</span></h1>
        <p>Compara vueltas y descubre dónde cambia el rendimiento.</p>
      </div>
      <div className="heading-actions"><span className="data-badge"><span className="status-dot" /> SESSION DATA</span></div>
    </section>
  );
}

function SelectionPrompt({ title, message }: { readonly title: string; readonly message: string }) {
  return (
    <section className="selection-prompt" aria-live="polite">
      <span className="selection-prompt-icon"><Flag size={19} /></span>
      <h2>{title}</h2>
      <p>{message}</p>
    </section>
  );
}

function SessionStrip({ session }: { readonly session: SessionDetails }) {
  return (
    <section className="session-strip">
      <div className="session-strip-event" title={`${session.grandPrix} · ${session.sessionName}`}><span className="event-flag"><Flag size={18} /></span><span><small>EVENT / SESSION</small><strong>{session.grandPrix} <b>·</b> {session.sessionName}</strong></span></div>
      <div className="strip-divider" />
      <div className="session-strip-stat"><small>DRIVERS</small><strong>{session.drivers.length}</strong></div>
      <div className="session-strip-stat"><small>CIRCUIT CORNERS</small><strong>{session.cornerCount || '—'}</strong></div>
      <div className="strip-weather"><Wind size={16} /><span><small>TRACK TEMP</small><strong>{session.weather?.trackTemperatureCelsius?.toFixed(1) ?? '—'}°C</strong></span><span className="weather-air">AIR {session.weather?.airTemperatureCelsius?.toFixed(1) ?? '—'}°C</span></div>
    </section>
  );
}

function DriverSelection({
  drivers,
  selectedDriver,
  onChooseDriver,
}: {
  readonly drivers: DriverSummary[];
  readonly selectedDriver: string;
  readonly onChooseDriver: (value: string) => void;
}) {
  if (drivers.length === 0) {
    return (
      <section className="driver-section">
        <div className="section-title"><div><span className="section-index">01</span><h2>Driver selection</h2></div></div>
        <div className="inline-loading"><span className="spinner" />Cargando pilotos del evento…</div>
      </section>
    );
  }

  return (
    <section className="driver-section">
      <div className="section-title"><div><span className="section-index">01</span><h2>Driver selection</h2></div><span className="muted-label">SELECT A DRIVER TO ANALYSE</span></div>
      <div className="driver-cards">
        {drivers.map((item) => <DriverCard key={item.code} driver={item} selected={selectedDriver === item.code} onClick={() => onChooseDriver(item.code)} />)}
      </div>
    </section>
  );
}

function LapComparisonSection(props: {
  readonly session: SessionDetails;
  readonly selectedDriver: DriverSummary | null;
  readonly driver: string;
  readonly reference: LapSummary | null;
  readonly compared: LapSummary | null;
  readonly availableLaps: LapSummary[];
  readonly comparison: LapComparison | null;
  readonly comparisonLoading: boolean;
  readonly referenceLap: number;
  readonly comparedLap: number;
  readonly corners: CornerSummary[];
  readonly onReferenceChange: (value: number) => void;
  readonly onComparedChange: (value: number) => void;
}) {
  const {
    session, selectedDriver, driver, reference, compared, availableLaps, comparison,
    comparisonLoading, referenceLap, comparedLap, corners, onReferenceChange, onComparedChange,
  } = props;

  return (
    <section className="compare-section">
      <ComparisonHeading selectedDriver={selectedDriver} driver={driver} />
      <LapSelectors
        availableLaps={availableLaps}
        reference={reference}
        referenceLap={referenceLap}
        comparedLap={comparedLap}
        comparisonLoading={comparisonLoading}
        onReferenceChange={onReferenceChange}
        onComparedChange={onComparedChange}
      />
      <LapSummary comparison={comparison} reference={reference} compared={compared} referenceLap={referenceLap} />
      <SectorGrid reference={reference} comparison={comparison} />
      <TelemetryVisualizations session={session} corners={corners} comparison={comparison} referenceLap={referenceLap} comparedLap={comparedLap} />
      <div className="footer-note"><Timer size={14} /><span>ANALYSIS GENERATED FROM SOURCE TELEMETRY</span><i /><span>TRACEABLE · REPRODUCIBLE</span><span className="footer-right">RaceMind <b>v0.1</b></span></div>
    </section>
  );
}

function ComparisonHeading({ selectedDriver, driver }: { readonly selectedDriver: DriverSummary | null; readonly driver: string }) {
  return (
    <div className="section-title">
      <div><span className="section-index">02</span><h2>Lap comparison</h2><span className="section-subtitle">/{selectedDriver?.code ?? driver}</span></div>
      <span className="muted-label"><span className="status-dot" /> TELEMETRY SYNCED</span>
    </div>
  );
}

function LapSelectors(props: {
  readonly availableLaps: LapSummary[];
  readonly reference: LapSummary | null;
  readonly referenceLap: number;
  readonly comparedLap: number;
  readonly comparisonLoading: boolean;
  readonly onReferenceChange: (value: number) => void;
  readonly onComparedChange: (value: number) => void;
}) {
  const { availableLaps, reference, referenceLap, comparedLap, comparisonLoading, onReferenceChange, onComparedChange } = props;
  return (
    <div className="compare-controls">
      <LapSelect label="REFERENCE LAP" id="reference-lap" value={referenceLap} laps={availableLaps} excludeLap={comparedLap} onChange={onReferenceChange} />
      <div className="compare-versus">VS</div>
      <LapSelect label="COMPARED LAP" id="compared-lap" value={comparedLap} laps={availableLaps} excludeLap={referenceLap} onChange={onComparedChange} />
      <div className="compare-control-divider" />
      <TyreInfo lap={reference} />
      <div className="compare-control-divider" />
      <ComparisonReadiness loading={comparisonLoading} />
    </div>
  );
}

function LapSelect(props: {
  readonly label: string;
  readonly id: string;
  readonly value: number;
  readonly laps: LapSummary[];
  readonly excludeLap: number;
  readonly onChange: (value: number) => void;
}) {
  const { label, id, value, laps, excludeLap, onChange } = props;
  return (
    <div className="lap-select-group">
      <label htmlFor={id}>{label}</label>
      <div className="lap-select-wrap">
        <span className={`lap-color ${id === 'reference-lap' ? 'reference-color' : 'compared-color'}`} />
        <select id={id} value={value} onChange={(event) => onChange(Number(event.target.value))}>
          {laps.filter((lap) => lap.number !== excludeLap).map((lap) => <LapOption key={lap.number} lap={lap} />)}
        </select>
        <ChevronDown size={15} />
      </div>
    </div>
  );
}

function LapOption({ lap }: { readonly lap: LapSummary }) {
  const personalBestLabel = lap.isPersonalBest ? ' · PB' : '';
  return <option value={lap.number}>Lap {lap.number} · {formatLapTime(lap.lapTimeSeconds)}{personalBestLabel}</option>;
}

function TyreInfo({ lap }: { readonly lap: LapSummary | null }) {
  return (
    <div className="tyre-info">
      <span className={compoundClass(lap?.tyreCompound ?? null)}>{lap?.tyreCompound?.slice(0, 1) ?? '—'}</span>
      <span><small>REFERENCE TYRE</small><strong>{lap?.tyreCompound ?? '—'} <em>· STINT {lap?.stint ?? '—'}</em></strong></span>
    </div>
  );
}

function ComparisonReadiness({ loading }: { readonly loading: boolean }) {
  if (loading) {
    return <span className="compare-status"><span className="spinner small" /> CALCULATING</span>;
  }
  return <span className="compare-status"><span className="status-dot" /> READY</span>;
}

function LapSummary(props: {
  readonly comparison: LapComparison | null;
  readonly reference: LapSummary | null;
  readonly compared: LapSummary | null;
  readonly referenceLap: number;
}) {
  const { comparison, reference, compared, referenceLap } = props;
  return (
    <div className="lap-summary-grid">
      <LapSummaryCard label="REFERENCE LAP" lap={reference} color="reference" />
          <div className={`delta-card ${getDeltaCardClass(comparison)}`}>
        <small>TIME DELTA</small>
        <strong>{formatComparisonDelta(comparison)}</strong>
        <DeltaStatus comparison={comparison} />
      </div>
      <LapSummaryCard label="COMPARED LAP" lap={compared} color="compared" />
      <span className="sr-only">Reference lap number {referenceLap}</span>
    </div>
  );
}

function formatComparisonDelta(comparison: LapComparison | null) {
  if (!comparison) return '—';
  return formatDelta(comparison.deltaLapTimeSeconds);
}

function SectorGrid({ reference, comparison }: { readonly reference: LapSummary | null; readonly comparison: LapComparison | null }) {
  return (
    <div className="sector-grid">
      {[0, 1, 2].map((index) => <SectorCard key={index} index={index} reference={reference} delta={comparison?.sectorDeltasSeconds[index]} />)}
    </div>
  );
}

function TelemetryVisualizations(props: {
  readonly session: SessionDetails;
  readonly corners: CornerSummary[];
  readonly comparison: LapComparison | null;
  readonly referenceLap: number;
  readonly comparedLap: number;
}) {
  const { session, corners, comparison, referenceLap, comparedLap } = props;
  return (
    <>
      <div className="visualization-heading"><span><MapPin size={15} /> TRACK & TELEMETRY</span><span>ALIGNED BY DISTANCE <i /> {comparison?.points.length ?? 0} POINTS</span></div>
      <div className="analysis-grid">
        <TrackPanel corners={corners} comparison={comparison} />
        <WeatherPanel session={session} />
      </div>
      {comparison && <ChartsPanel comparison={comparison} referenceLap={referenceLap} comparedLap={comparedLap} />}
    </>
  );
}

function TrackPanel({ corners, comparison }: { readonly corners: CornerSummary[]; readonly comparison: LapComparison | null }) {
  return (
    <section className="track-card">
      <div className="card-title"><div><h3>Circuit overview</h3><span>Corner markers · session geometry</span></div><span className="corner-count">{corners.length} TURNS</span></div>
      {comparison ? <TrackMap corners={corners} /> : <div className="chart-placeholder"><span className="spinner" />Loading telemetry...</div>}
      <div className="track-legend"><span><i className="track-dot" /> CORNER</span><span><i className="track-line" /> TRACK LAYOUT</span><span className="track-legend-note">Schematic · not to scale</span></div>
    </section>
  );
}

function WeatherPanel({ session }: { readonly session: SessionDetails }) {
  const weather = session.weather;
  return (
    <section className="insight-card">
      <div className="card-title"><div><h3>Session conditions</h3><span>Latest available weather sample</span></div><span className="weather-icon"><Wind size={16} /></span></div>
      <div className="conditions-grid">
        <Condition label="AIR TEMP" value={weather?.airTemperatureCelsius} unit="°C" />
        <Condition label="TRACK TEMP" value={weather?.trackTemperatureCelsius} unit="°C" />
        <Condition label="HUMIDITY" value={weather?.humidityPercent} unit="%" />
        <Condition label="WIND" value={weather?.windSpeedMetersPerSecond} unit="m/s" />
        <Condition label="PRESSURE" value={weather?.pressureHpa} unit="hPa" />
        <Condition label="RAINFALL" display={formatRainfall(weather?.rainfall)} />
      </div>
      <div className="conditions-foot"><span className="status-dot" /> WEATHER STREAM <span>SESSION ARCHIVE</span></div>
    </section>
  );
}

function ChartsPanel(props: { readonly comparison: LapComparison; readonly referenceLap: number; readonly comparedLap: number }) {
  const { comparison, referenceLap, comparedLap } = props;
  return (
    <div className="charts-grid">
      <SpeedChart comparison={comparison} referenceLap={referenceLap} comparedLap={comparedLap} />
      <ThrottleBrakeChart comparison={comparison} referenceLap={referenceLap} comparedLap={comparedLap} />
      <TimeDeltaChart comparison={comparison} />
      <TelemetryNotes />
    </div>
  );
}

function SpeedChart({ comparison, referenceLap, comparedLap }: { readonly comparison: LapComparison; readonly referenceLap: number; readonly comparedLap: number }) {
  return (
    <SeriesChart title="Speed trace" unit="km/h · source unit to be confirmed" comparison={comparison} series={[
      { key: 'referenceSpeedKph', label: `LAP ${referenceLap}`, color: '#73dfb2' },
      { key: 'comparedSpeedKph', label: `LAP ${comparedLap}`, color: '#ffaf63' },
    ]} />
  );
}

function ThrottleBrakeChart({ comparison, referenceLap, comparedLap }: { readonly comparison: LapComparison; readonly referenceLap: number; readonly comparedLap: number }) {
  return (
    <SeriesChart title="Throttle & brake" unit="% · brake converted from 0–1 source scale" comparison={comparison} series={[
      { key: 'referenceThrottlePercent', label: `THROTTLE L${referenceLap}`, color: '#73dfb2' },
      { key: 'comparedThrottlePercent', label: `THROTTLE L${comparedLap}`, color: '#ffaf63' },
      { key: 'referenceBrakePercent', label: `BRAKE L${referenceLap}`, color: '#4b9ff5' },
      { key: 'comparedBrakePercent', label: `BRAKE L${comparedLap}`, color: '#bb8bf3' },
    ]} range={[0, 100]} />
  );
}

function TimeDeltaChart({ comparison }: { readonly comparison: LapComparison }) {
  return (
    <SeriesChart title="Time delta" unit="seconds · compared minus reference" comparison={comparison} series={[
      { key: 'deltaElapsedSeconds', label: 'TIME DELTA', color: '#ffaf63' },
    ]} format={(value) => value.toFixed(2)} />
  );
}

function TelemetryNotes() {
  return (
    <section className="chart-card telemetry-notes">
      <div className="chart-heading"><div><h3>Reading the comparison</h3><span>HOW TO INTERPRET</span></div><Activity size={17} /></div>
      <p>The delta is calculated as <strong>compared lap minus reference lap</strong>. A positive time delta means the compared lap is behind; a negative delta means it is ahead at that distance.</p>
      <div className="note-callout"><Radio size={15} /><span>Signals are interpolated by relative distance. Source sampling intervals are irregular.</span></div>
    </section>
  );
}

interface DriverCardProps {
  readonly driver: DriverSummary;
  readonly selected: boolean;
  readonly onClick: () => void;
}

function DriverCard({ driver, selected, onClick }: DriverCardProps) {
  const color = getTeamColor(driver);
  const initials = getDriverInitials(driver.fullName ?? driver.code);
  const bestLap = driver.bestLapSeconds == null ? 'TIME PENDING' : formatLapTime(driver.bestLapSeconds);
  return (
    <button className={`driver-card ${selected ? 'driver-selected' : ''}`} title={`${driver.code} · ${driver.fullName ?? driver.team ?? 'Driver'} · Best lap ${bestLap}`} style={{ '--team-color': color } as CSSProperties & { '--team-color': string }} onClick={onClick}>
      <span className="driver-color" />
      <span className="driver-avatar">{initials}</span>
      <span className="driver-info" title={driver.fullName ?? driver.team ?? 'Driver'}><strong>{driver.code}</strong><small>{driver.fullName ?? driver.team ?? 'Driver'}</small></span>
      <span className="driver-best" title={`Best lap: ${bestLap}`}><small>BEST</small><strong>{bestLap}</strong></span>
    </button>
  );
}

function getTeamColor(driver: DriverSummary) {
  if (driver.teamColour) return `#${driver.teamColour}`;
  return '#73dfb2';
}

function getDriverInitials(name: string) {
  const nameParts = name.split(' ');
  const lastName = nameParts[nameParts.length - 1] ?? name;
  return lastName.slice(0, 3).toUpperCase();
}

interface LapSummaryCardProps {
  readonly label: string;
  readonly lap: LapSummary | null;
  readonly color: 'reference' | 'compared';
}

function LapSummaryCard({ label, lap, color }: LapSummaryCardProps) {
  return (
    <div className={`lap-summary-card ${color}`}>
      <div className="lap-summary-label"><i />{label}</div>
      <div className="lap-summary-time">{formatLapTime(lap?.lapTimeSeconds)}</div>
      <div className="lap-summary-meta">
        <span> LAP {lap?.number ?? '—'}</span>
        <span className={compoundClass(lap?.tyreCompound ?? null)}>{lap?.tyreCompound ?? 'NO TYRE DATA'}</span>
        <span>STINT {lap?.stint ?? '—'}</span>
      </div>
    </div>
  );
}

interface ConditionProps {
  readonly label: string;
  readonly value?: number | null;
  readonly unit?: string;
  readonly display?: string;
}

function Condition({ label, value, unit = '', display }: ConditionProps) {
  return <div className="condition"><small>{label}</small><strong>{display ?? formatCondition(value, unit)}</strong></div>;
}

function formatCondition(value: number | null | undefined, unit: string) {
  if (value == null) return '—';
  return `${value.toFixed(1)}${unit}`;
}

function formatRainfall(rainfall: boolean | null | undefined) {
  if (rainfall == null) return '—';
  if (rainfall) return 'YES';
  return 'NO';
}

interface SectorCardProps {
  readonly index: number;
  readonly reference: LapSummary | null;
  readonly delta: number | null | undefined;
}

function SectorCard({ index, reference, delta }: SectorCardProps) {
  const sectorTime = getSectorTime(reference, index);
  const barWidth = getSectorBarWidth(delta);
  return (
    <div className="sector-card">
      <small>SECTOR {index + 1}</small>
      <div><strong>{formatSectorTime(sectorTime)}</strong><span>{formatDelta(delta)}</span></div>
      <div className="sector-bar"><i style={{ width: `${barWidth}%` }} /></div>
    </div>
  );
}

function getSectorTime(lap: LapSummary | null, index: number) {
  if (index === 0) return lap?.sector1Seconds ?? null;
  if (index === 1) return lap?.sector2Seconds ?? null;
  return lap?.sector3Seconds ?? null;
}

function getSectorBarWidth(delta: number | null | undefined) {
  const absoluteDelta = Math.abs(delta ?? 0);
  const adjustedWidth = 100 - Math.min(100, absoluteDelta * 160);
  return Math.max(12, adjustedWidth);
}

function getDeltaCardClass(comparison: LapComparison | null) {
  const delta = comparison?.deltaLapTimeSeconds;
  if (delta == null) return 'delta-negative';
  if (delta < 0) return 'delta-positive';
  return 'delta-negative';
}

function DeltaStatus({ comparison }: { readonly comparison: LapComparison | null }) {
  const delta = comparison?.deltaLapTimeSeconds;
  if (delta == null) return <span>AWAITING DATA</span>;
  if (delta < 0) return <span><ArrowDownRight size={13} /> FASTER</span>;
  return <span><ArrowUpRight size={13} /> SLOWER</span>;
}

function formatGrandPrix(grandPrix: string) {
  return grandPrix.replace(' Grand Prix', ' GP');
}
