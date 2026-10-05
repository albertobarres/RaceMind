import { useEffect, useMemo, useState } from 'react';
import { api } from './api';
import type { CornerSummary, LapComparison, LapSummary, SessionDetails, SessionSummary } from './types';

interface DashboardState {
  sessions: SessionSummary[];
  selectedSessionId: string;
  selectedSession: SessionSummary | null;
  session: SessionDetails | null;
  driver: string;
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
  chooseDriver: (value: string) => void;
  chooseSession: (value: string) => void;
}

const isAbortError = (cause: unknown) => cause instanceof DOMException && cause.name === 'AbortError';

const errorMessage = (cause: unknown, fallback: string) =>
  cause instanceof Error ? cause.message : fallback;

export function useRaceMindDashboard(): DashboardState {
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
        const preferred = findPreferredSession(items);
        if (preferred) setSelectedSessionId(preferred.id);
      })
      .catch((cause: unknown) => setFailure(cause, controller.signal, setError, 'No se pudo conectar con RaceMind API.'))
      .finally(() => setLoading(false));
    return () => controller.abort();
  }, []);

  useEffect(() => {
    if (!selectedSession) return;
    const controller = new AbortController();
    setLoading(true);
    setError(null);
    setComparison(null);
    loadSessionDetails(selectedSession, controller.signal)
      .then(({ details, trackCorners }) => {
        setSession(details);
        setCorners(trackCorners);
        const preferredDriver = findPreferredDriver(details);
        if (preferredDriver) setDriver(preferredDriver.code);
      })
      .catch((cause: unknown) => setFailure(cause, controller.signal, setError, 'No se pudo cargar la sesión.'))
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
        chooseDefaultLaps(items, setReferenceLap, setComparedLap);
      })
      .catch((cause: unknown) => setFailure(cause, controller.signal, setError, 'No se pudieron cargar las vueltas.'))
      .finally(() => setLoading(false));
    return () => controller.abort();
  }, [selectedSession, driver]);

  useEffect(() => {
    if (!selectedSession || !driver || !areLapsComparable(referenceLap, comparedLap)) return;
    const controller = new AbortController();
    setComparisonLoading(true);
    api.compare(selectedSession.grandPrix, selectedSession.sessionName, driver, referenceLap, comparedLap, controller.signal)
      .then(setComparison)
      .catch((cause: unknown) => {
        setFailure(cause, controller.signal, setError, 'No se pudo comparar estas vueltas.');
        if (!controller.signal.aborted) setComparison(null);
      })
      .finally(() => setComparisonLoading(false));
    return () => controller.abort();
  }, [selectedSession, driver, referenceLap, comparedLap]);

  const chooseDriver = (value: string) => {
    setDriver(value);
    setComparison(null);
  };

  const chooseSession = (value: string) => {
    setSelectedSessionId(value);
    setSession(null);
    setLaps([]);
  };

  return {
    sessions,
    selectedSessionId,
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
    chooseDriver,
    chooseSession,
  };
}

function findPreferredSession(items: SessionSummary[]) {
  return items.find((item) => item.grandPrix === 'Barcelona Grand Prix' && item.sessionName === 'Race') ?? items[0];
}

function findPreferredDriver(details: SessionDetails) {
  return details.drivers.find((item) => item.code === 'VER') ?? details.drivers[0];
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

async function loadSessionDetails(session: SessionSummary, signal: AbortSignal) {
  const [details, trackCorners] = await Promise.all([
    api.session(session.grandPrix, session.sessionName, signal),
    api.corners(session.grandPrix, session.sessionName, signal),
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
