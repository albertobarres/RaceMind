import type {
  CornerSummary,
  LapComparison,
  LapSummary,
  SessionDetails,
  SessionSummary,
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
  sessions: (signal?: AbortSignal) => request<SessionSummary[]>('/sessions', signal),
  session: (grandPrix: string, sessionName: string, signal?: AbortSignal) =>
    request<SessionDetails>(`/sessions/${segment(grandPrix)}/${segment(sessionName)}`, signal),
  corners: (grandPrix: string, sessionName: string, signal?: AbortSignal) =>
    request<CornerSummary[]>(`/sessions/${segment(grandPrix)}/${segment(sessionName)}/corners`, signal),
  laps: (grandPrix: string, sessionName: string, driver: string, signal?: AbortSignal) =>
    request<LapSummary[]>(`/sessions/${segment(grandPrix)}/${segment(sessionName)}/drivers/${segment(driver)}/laps`, signal),
  compare: (grandPrix: string, sessionName: string, driver: string, reference: number, compared: number, signal?: AbortSignal) =>
    request<LapComparison>(`/sessions/${segment(grandPrix)}/${segment(sessionName)}/drivers/${segment(driver)}/laps/compare?referenceLap=${reference}&comparedLap=${compared}&points=201`, signal),
};
