import { useEffect, useState } from 'react';
import { api } from './api';
import type { CornerSummary, LapComparison, LapSummary, SessionDetails, SessionSummary, TelemetryCatalog } from './types';

interface DashboardState {
  catalog: TelemetryCatalog | null;
  selectedYear: number | null;
  selectedSessionId: string;
  selectedSession: SessionSummary | null;
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
}

const isAbortError = (cause: unknown) => cause instanceof DOMException && cause.name === 'AbortError';

const errorMessage = (cause: unknown, fallback: string) =>
  cause instanceof Error ? cause.message : fallback;

export function useRaceMindDashboard(): DashboardState {
  const [catalog, setCatalog] = useState<TelemetryCatalog | null>(null);
  const [selectedSessionId, setSelectedSessionId] = useState('');
  const [selectedYear, setSelectedYear] = useState<number | null>(null);
  const [selectedF1Session, setSelectedF1Session] = useState<SessionSummary | null>(null);
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
    const controller = new AbortController();
    api.catalog(controller.signal)
      .then((value) => {
        setCatalog(value);
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
    setLoading(true);
    setError(null);
    setSession(null);
    setDriver(null);
    setLaps([]);
    setCorners([]);
    setComparison(null);
  };

  const resetDashboard = () => {
    setSelectedSessionId('');
    setSelectedYear(null);
    setSelectedF1Session(null);
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
