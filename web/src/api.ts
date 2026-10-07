import type {
  CornerSummary,
  LapComparison,
  LapSummary,
  MotoGpEventSummary,
  MotoGpLapRecord,
  MotoGpSessionDetails,
  SessionDetails,
  SessionSummary,
  TelemetryCatalog,
} from './types';

const apiBase = import.meta.env.VITE_API_BASE_URL ?? 'http://localhost:5171/api';

async function request<T>(path: string, signal?: AbortSignal): Promise<T> {
  const response = await fetch(`${apiBase}${path}`, { signal });
  if (!response.ok) {
    const payload = await response.json().catch(() => null) as { message?: string } | null;
    throw new Error(payload?.message ?? `La API respondió ${response.status} (${response.statusText})`);
  }
  return response.json() as Promise<T>;
}

const segment = (value: string) => encodeURIComponent(value);

export const api = {
  catalog: (signal?: AbortSignal) => request<TelemetryCatalog>('/catalog', signal),
  motoGpEvents: (year: number, signal?: AbortSignal) => request<MotoGpEventSummary[]>(`/motorcycles/motogp/${year}/events`, signal),
  motoGpSession: (year: number, eventCode: string, sessionCode: string, signal?: AbortSignal) =>
    request<MotoGpSessionDetails>(`/motorcycles/motogp/${year}/events/${segment(eventCode)}/sessions/${segment(sessionCode)}`, signal),
  motoGpLapRecords: (year: number, eventCode: string, sessionCode: string, rider?: string, signal?: AbortSignal) => {
    const riderQuery = rider ? `?rider=${segment(rider)}` : '';
    return request<MotoGpLapRecord[]>(`/motorcycles/motogp/${year}/events/${segment(eventCode)}/sessions/${segment(sessionCode)}/laps${riderQuery}`, signal);
  },
  sessions: (year: number, signal?: AbortSignal) => request<SessionSummary[]>(`/cars/f1/${year}/sessions`, signal),
  session: (year: number, grandPrix: string, sessionName: string, signal?: AbortSignal) =>
    request<SessionDetails>(`/cars/f1/${year}/sessions/${segment(grandPrix)}/${segment(sessionName)}`, signal),
  corners: (year: number, grandPrix: string, sessionName: string, signal?: AbortSignal) =>
    request<CornerSummary[]>(`/cars/f1/${year}/sessions/${segment(grandPrix)}/${segment(sessionName)}/corners`, signal),
  laps: (year: number, grandPrix: string, sessionName: string, driver: string, signal?: AbortSignal) =>
    request<LapSummary[]>(`/cars/f1/${year}/sessions/${segment(grandPrix)}/${segment(sessionName)}/drivers/${segment(driver)}/laps`, signal),
  compare: (year: number, grandPrix: string, sessionName: string, driver: string, reference: number, compared: number, signal?: AbortSignal) =>
    request<LapComparison>(`/cars/f1/${year}/sessions/${segment(grandPrix)}/${segment(sessionName)}/drivers/${segment(driver)}/laps/compare?referenceLap=${reference}&comparedLap=${compared}&points=201`, signal),
};
