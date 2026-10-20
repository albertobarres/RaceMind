import { useEffect, useState } from 'react';
import { api } from './api';
import type { AssettoLapComparison, AssettoSessionDetails, CornerSummary, KartingLapComparison, KartingSessionDetails, LapComparison, LapSummary, MotoGpEventSummary, MotoGpLapRecord, MotoGpSessionDetails, SessionDetails, SessionSummary, TelemetryCatalog } from './types';

interface DashboardState {
  catalog: TelemetryCatalog | null;
  selectedYear: number | null;
  selectedSessionId: string;
  selectedSession: SessionSummary | null;
  selectedMotoGpSession: MotoGpSessionDetails | null;
  selectedAssettoSessionId: string | null;
  assettoSession: AssettoSessionDetails | null;
  assettoComparison: AssettoLapComparison | null;
  selectedKartingSessionId: string | null;
  kartingSession: KartingSessionDetails | null;
  kartingComparison: KartingLapComparison | null;
  motoGpEvents: MotoGpEventSummary[];
  motoGpLapRecords: MotoGpLapRecord[];
  session: SessionDetails | null;
  driver: string | null;
  laps: LapSummary[];
  referenceLap: number;
  comparedLap: number;
  comparison: LapComparison | null;
  corners: CornerSummary[];
  loading: boolean;
  comparisonLoading: boolean;
  error: string | null;
  search: string;
  setReferenceLap: (value: number) => void;
  setComparedLap: (value: number) => void;
  setSearch: (value: string) => void;
  setError: (value: string | null) => void;
  resetDashboard: () => void;
  chooseDriver: (value: string | null) => void;
  chooseF1Session: (year: number, value: string) => void;
  chooseMotoGpSession: (year: number, eventCode: string, sessionCode: string) => void;
  chooseAssettoSession: (sessionId: string) => void;
  compareAssettoLaps: (reference: number, compared: number) => void;
  chooseKartingSession: (sessionId: string) => void;
  compareKartingLaps: (reference: number, compared: number) => void;
}

const isAbortError = (cause: unknown) => cause instanceof DOMException && cause.name === 'AbortError';

const errorMessage = (cause: unknown, fallback: string) =>
  cause instanceof Error ? cause.message : fallback;

export function useRaceMindDashboard(): DashboardState {
  const [catalog, setCatalog] = useState<TelemetryCatalog | null>(null);
  const [selectedSessionId, setSelectedSessionId] = useState('');
  const [selectedYear, setSelectedYear] = useState<number | null>(null);
  const [selectedF1Session, setSelectedF1Session] = useState<SessionSummary | null>(null);
  const [selectedMotoGpSession, setSelectedMotoGpSession] = useState<MotoGpSessionDetails | null>(null);
  const [selectedAssettoSessionId, setSelectedAssettoSessionId] = useState<string | null>(null);
  const [assettoSession, setAssettoSession] = useState<AssettoSessionDetails | null>(null);
  const [assettoComparison, setAssettoComparison] = useState<AssettoLapComparison | null>(null);
  const [selectedKartingSessionId, setSelectedKartingSessionId] = useState<string | null>(null);
  const [kartingSession, setKartingSession] = useState<KartingSessionDetails | null>(null);
  const [kartingComparison, setKartingComparison] = useState<KartingLapComparison | null>(null);
  const [motoGpEvents, setMotoGpEvents] = useState<MotoGpEventSummary[]>([]);
  const [motoGpLapRecords, setMotoGpLapRecords] = useState<MotoGpLapRecord[]>([]);
  const [session, setSession] = useState<SessionDetails | null>(null);
  const [driver, setDriver] = useState<string | null>(null);
  const [laps, setLaps] = useState<LapSummary[]>([]);
  const [referenceLap, setReferenceLap] = useState(10);
  const [comparedLap, setComparedLap] = useState(11);
  const [comparison, setComparison] = useState<LapComparison | null>(null);
  const [corners, setCorners] = useState<CornerSummary[]>([]);
  const [loading, setLoading] = useState(true);
  const [comparisonLoading, setComparisonLoading] = useState(false);
  const [error, setError] = useState<string | null>(null);
  const [search, setSearch] = useState('');

  const selectedSession = selectedF1Session;

  useEffect(() => {
    if (!selectedAssettoSessionId) return;
    const controller = new AbortController();
    setLoading(true);
    setError(null);
    api.assettoSession(selectedAssettoSessionId, controller.signal)
      .then((details) => {
        setAssettoSession(details);
      })
      .catch((cause: unknown) => setFailure(cause, controller.signal, setError, 'No se pudo cargar la sesión de Assetto Corsa.'))
      .finally(() => { if (!controller.signal.aborted) setLoading(false); });
    return () => controller.abort();
  }, [selectedAssettoSessionId]);

  useEffect(() => {
    if (!selectedKartingSessionId) return;
    const controller = new AbortController();
    setLoading(true);
    setError(null);
    api.kartingSession(selectedKartingSessionId, controller.signal)
      .then(setKartingSession)
      .catch((cause: unknown) => setFailure(cause, controller.signal, setError, 'No se pudo cargar la sesión de karting.'))
      .finally(() => { if (!controller.signal.aborted) setLoading(false); });
    return () => controller.abort();
  }, [selectedKartingSessionId]);

  useEffect(() => {
    const controller = new AbortController();
    api.catalog(controller.signal)
      .then((value) => {
        setCatalog(value);
        const motoGpYears = value.categories.find((category) => category.key === 'motorcycles')?.series
          .find((series) => series.key === 'motogp')?.years ?? [];
        setMotoGpEvents(motoGpYears.flatMap((year) => year.events.map((event) => ({
          id: `${year.year}/${event.code}`,
          year: year.year,
          eventCode: event.code,
          grandPrix: event.name,
          sessions: event.sessions,
        }))));
      })
      .catch((cause: unknown) => setFailure(cause, controller.signal, setError, 'No se pudo conectar con RaceMind API.'))
      .finally(() => {
        if (!controller.signal.aborted) setLoading(false);
      });
    return () => controller.abort();
  }, []);

  useEffect(() => {
    if (!selectedSession || selectedYear == null) return;
    const controller = new AbortController();
    setLoading(true);
    setError(null);
    setComparison(null);
    loadSessionDetails(selectedYear, selectedSession, controller.signal)
      .then(({ details, trackCorners }) => {
        setSession(details);
        setCorners(trackCorners);
      })
      .catch((cause: unknown) => setFailure(cause, controller.signal, setError, 'No se pudo cargar la sesión.'))
      .finally(() => {
        if (!controller.signal.aborted) setLoading(false);
      });
    return () => controller.abort();
  }, [selectedSession, selectedYear]);

  useEffect(() => {
    if (!selectedSession || selectedYear == null || !driver) {
      setLaps([]);
      return;
    }
    const controller = new AbortController();
    setLoading(true);
    setComparison(null);
    api.laps(selectedYear, selectedSession.grandPrix, selectedSession.sessionName, driver, controller.signal)
      .then((items) => {
        setLaps(items);
        chooseDefaultLaps(items, setReferenceLap, setComparedLap);
      })
      .catch((cause: unknown) => setFailure(cause, controller.signal, setError, 'No se pudieron cargar las vueltas.'))
      .finally(() => {
        if (!controller.signal.aborted) setLoading(false);
      });
    return () => controller.abort();
  }, [selectedSession, selectedYear, driver]);

  useEffect(() => {
    if (!selectedSession || selectedYear == null || !driver || !areLapsComparable(referenceLap, comparedLap)) return;
    const controller = new AbortController();
    setComparisonLoading(true);
    api.compare(selectedYear, selectedSession.grandPrix, selectedSession.sessionName, driver, referenceLap, comparedLap, controller.signal)
      .then(setComparison)
      .catch((cause: unknown) => {
        setFailure(cause, controller.signal, setError, 'No se pudo comparar estas vueltas.');
        if (!controller.signal.aborted) setComparison(null);
      })
      .finally(() => {
        if (!controller.signal.aborted) setComparisonLoading(false);
      });
    return () => controller.abort();
  }, [selectedSession, selectedYear, driver, referenceLap, comparedLap]);

  const chooseDriver = (value: string | null) => {
    setDriver(value);
    setLaps([]);
    setComparison(null);
    setError(null);
    if (value) setLoading(true);
  };

  const chooseF1Session = (year: number, value: string) => {
    if (!catalog) return;
    const selected = getF1Sessions(catalog).find((item) => item.id === value && item.year === year);
    if (!selected) return;
    setSelectedSessionId(value);
    setSelectedYear(year);
    setSelectedF1Session(selected);
    setSelectedMotoGpSession(null);
    setSelectedAssettoSessionId(null);
    setAssettoSession(null);
    setAssettoComparison(null);
    setKartingSession(null);
    setKartingComparison(null);
    setMotoGpLapRecords([]);
    setLoading(true);
    setError(null);
    setSession(null);
    setDriver(null);
    setLaps([]);
    setCorners([]);
    setComparison(null);
  };

  const chooseMotoGpSession = (year: number, eventCode: string, sessionCode: string) => {
    const controller = new AbortController();
    setSelectedSessionId(`motogp/${year}/${eventCode}/${sessionCode}`);
    setSelectedYear(year);
    setSelectedF1Session(null);
    setSelectedAssettoSessionId(null);
    setAssettoSession(null);
    setAssettoComparison(null);
    setKartingSession(null);
    setKartingComparison(null);
    setSelectedMotoGpSession(null);
    setMotoGpLapRecords([]);
    setDriver(null);
    setComparison(null);
    setLoading(true);
    setError(null);

    Promise.all([
      api.motoGpSession(year, eventCode, sessionCode, controller.signal),
      api.motoGpLapRecords(year, eventCode, sessionCode, undefined, controller.signal),
    ])
      .then(([details, records]) => {
        setSelectedMotoGpSession(details);
        setMotoGpLapRecords(records);
        setLoading(false);
      })
      .catch((cause: unknown) => {
        setFailure(cause, controller.signal, setError, 'No se pudieron cargar los datos de MotoGP.');
        if (!controller.signal.aborted) setLoading(false);
      });
  };

  const chooseAssettoSession = (sessionId: string) => {
    setSelectedSessionId(`assetto/${sessionId}`);
    setSelectedYear(null);
    setSelectedF1Session(null);
    setSelectedMotoGpSession(null);
    setSelectedKartingSessionId(null);
    setKartingSession(null);
    setKartingComparison(null);
    setSelectedAssettoSessionId(sessionId);
    setAssettoSession(null);
    setAssettoComparison(null);
    setMotoGpLapRecords([]);
    setSession(null);
    setDriver(null);
    setLoading(true);
    setError(null);
  };

  const compareAssettoLaps = (reference: number, compared: number) => {
    if (!selectedAssettoSessionId || reference === compared) {
      setAssettoComparison(null);
      return;
    }
    const controller = new AbortController();
    setComparisonLoading(true);
    api.assettoCompare(selectedAssettoSessionId, reference, compared, controller.signal)
      .then(setAssettoComparison)
      .catch((cause: unknown) => {
        setFailure(cause, controller.signal, setError, 'No se pudieron comparar las vueltas de Assetto Corsa.');
        if (!controller.signal.aborted) setAssettoComparison(null);
      })
      .finally(() => { if (!controller.signal.aborted) setComparisonLoading(false); });
  };

  const chooseKartingSession = (sessionId: string) => {
    setSelectedSessionId(`karting/${sessionId}`);
    setSelectedYear(null);
    setSelectedF1Session(null);
    setSelectedMotoGpSession(null);
    setSelectedAssettoSessionId(null);
    setSelectedKartingSessionId(sessionId);
    setAssettoSession(null);
    setAssettoComparison(null);
    setMotoGpLapRecords([]);
    setSession(null);
    setDriver(null);
    setLoading(true);
    setError(null);
  };

  const compareKartingLaps = (reference: number, compared: number) => {
    if (!selectedKartingSessionId || reference === compared) {
      setKartingComparison(null);
      return;
    }
    const controller = new AbortController();
    setComparisonLoading(true);
    api.kartingCompare(selectedKartingSessionId, reference, compared, controller.signal)
      .then(setKartingComparison)
      .catch((cause: unknown) => {
        setFailure(cause, controller.signal, setError, 'No se pudieron comparar las vueltas de karting.');
        if (!controller.signal.aborted) setKartingComparison(null);
      })
      .finally(() => { if (!controller.signal.aborted) setComparisonLoading(false); });
  };

  const resetDashboard = () => {
    setSelectedSessionId('');
    setSelectedYear(null);
    setSelectedF1Session(null);
    setSelectedMotoGpSession(null);
    setSelectedKartingSessionId(null);
    setKartingSession(null);
    setKartingComparison(null);
    setSelectedAssettoSessionId(null);
    setAssettoSession(null);
    setAssettoComparison(null);
    setMotoGpLapRecords([]);
    setSession(null);
    setDriver(null);
    setLaps([]);
    setCorners([]);
    setComparison(null);
    setError(null);
    setLoading(false);
    setComparisonLoading(false);
  };

  return {
    catalog,
    selectedSessionId,
    selectedYear,
    selectedSession,
    selectedMotoGpSession,
    selectedAssettoSessionId,
    assettoSession,
    assettoComparison,
    selectedKartingSessionId,
    kartingSession,
    kartingComparison,
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
    chooseAssettoSession,
    compareAssettoLaps,
    chooseKartingSession,
    compareKartingLaps,
  };
}

function getF1Sessions(catalog: TelemetryCatalog) {
  return catalog.categories
    .find((category) => category.key === 'cars')?.series
    .find((series) => series.key === 'f1')?.years
    .flatMap((year) => year.sessions) ?? [];
}

function chooseDefaultLaps(
  items: LapSummary[],
  setReference: (lap: number) => void,
  setCompared: (lap: number) => void,
) {
  const validLaps = items.filter((lap) => lap.hasTelemetry);
  const timedLaps = validLaps.filter((lap) => lap.lapTimeSeconds != null);
  const fastestLap = [...timedLaps].sort((first, second) => first.lapTimeSeconds! - second.lapTimeSeconds!)[0];
  const reference = validLaps.find((lap) => lap.isPersonalBest) ?? fastestLap ?? validLaps[0];
  if (!reference) return;

  const consecutive = validLaps.find((lap) => lap.number === reference.number + 1);
  const alternative = validLaps.find((lap) => lap.number !== reference.number);
  setReference(reference.number);
  if (consecutive ?? alternative) setCompared((consecutive ?? alternative)!.number);
}

function areLapsComparable(referenceLap: number, comparedLap: number) {
  return referenceLap > 0 && comparedLap > 0 && referenceLap !== comparedLap;
}

async function loadSessionDetails(year: number, session: SessionSummary, signal: AbortSignal) {
  const [details, trackCorners] = await Promise.all([
    api.session(year, session.grandPrix, session.sessionName, signal),
    api.corners(year, session.grandPrix, session.sessionName, signal),
  ]);
  return { details, trackCorners };
}

function setFailure(
  cause: unknown,
  signal: AbortSignal,
  setError: (message: string) => void,
  fallback: string,
) {
  if (!signal.aborted && !isAbortError(cause)) {
    setError(errorMessage(cause, fallback));
  }
}
