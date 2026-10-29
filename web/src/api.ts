import type {
  CornerSummary,
  AssettoLapComparison,
  AssettoSessionDetails,
  LapComparison,
  LapSummary,
  KartingLapComparison,
  KartingSessionDetails,
  MotoGpEventSummary,
  MotoGpLapRecord,
  MotoGpSessionDetails,
  SessionDetails,
  SessionSummary,
  TelemetryCatalog,
} from './types';

const apiBase = import.meta.env.VITE_API_BASE_URL ?? 'http://localhost:5171/api';
const normalizedApiBase = apiBase.replace(/\/$/, '');

export interface AuthUser {
  username: string;
  displayName: string;
  csrfToken: string;
  role: 'Admin' | 'User';
}

export interface ManagedUser {
  id: string;
  username: string;
  displayName: string;
  role: 'Admin' | 'User';
  isActive: boolean;
  createdAtUtc: string;
}

let csrfToken = '';

async function loadCurrentUser() {
  const user = await request<AuthUser>('/auth/me');
  csrfToken = user.csrfToken;
  return user;
}

async function login(username: string, password: string) {
  const user = await post<AuthUser>('/auth/login', { username, password });
  csrfToken = user.csrfToken;
  return user;
}

async function request<T>(path: string, signal?: AbortSignal): Promise<T> {
  const response = await fetch(`${normalizedApiBase}${path}`, { signal, credentials: 'include' });
  if (response.status === 401 && !path.startsWith('/auth/')) {
    window.dispatchEvent(new Event('racemind:session-expired'));
  }
  if (!response.ok) {
    const payload = await response.json().catch(() => null) as { message?: string } | null;
    throw new Error(payload?.message ?? `La API respondió ${response.status} (${response.statusText})`);
  }
  return response.json() as Promise<T>;
}

const segment = (value: string) => encodeURIComponent(value);

export interface RaceEngineerExplainRequest {
  source: string;
  referenceLap: number;
  comparedLap: number;
  context: string | null;
  findings: { title: string; value: string; evidence: string; distanceRanges?: { start: number; end: number }[] }[];
  limitations: string | null;
}

export interface RaceEngineerChatRequest {
  report: RaceEngineerExplainRequest;
  question: string;
  history: { role: 'user' | 'assistant'; content: string }[];
}

export const api = {
  currentUser: loadCurrentUser,
  login,
  logout: async () => {
    const response = await fetch(`${normalizedApiBase}/auth/logout`, { method: 'POST', credentials: 'include', headers: { 'X-RaceMind-CSRF': csrfToken } });
    if (!response.ok) throw new Error(`No se pudo cerrar la sesión (${response.status}).`);
    csrfToken = '';
  },
  users: (signal?: AbortSignal) => request<ManagedUser[]>('/auth/users', signal),
  createUser: (payload: { username: string; displayName: string; password: string }, signal?: AbortSignal) =>
    post<ManagedUser>('/auth/users', payload, signal),
  deleteUser: async (id: string) => {
    const response = await fetch(`${normalizedApiBase}/auth/users/${segment(id)}`, {
      method: 'DELETE',
      credentials: 'include',
      headers: { 'X-RaceMind-CSRF': csrfToken },
    });
    if (response.status === 401) window.dispatchEvent(new Event('racemind:session-expired'));
    if (!response.ok) {
      const result = await response.json().catch(() => null) as { message?: string } | null;
      throw new Error(result?.message ?? `No se pudo eliminar la cuenta (${response.status}).`);
    }
  },
  assetUrl: (path: string | null) => path ? `${normalizedApiBase}${path.startsWith('/') ? path : `/${path}`}` : null,
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
  assettoSession: (sessionId: string, signal?: AbortSignal) => request<AssettoSessionDetails>(`/cars/assetto-corsa/sessions/${segment(sessionId)}`, signal),
  assettoCompare: (sessionId: string, reference: number, compared: number, signal?: AbortSignal) =>
    request<AssettoLapComparison>(`/cars/assetto-corsa/sessions/${segment(sessionId)}/laps/compare?referenceLap=${reference}&comparedLap=${compared}&points=201`, signal),
  kartingSession: (sessionId: string, signal?: AbortSignal) =>
    request<KartingSessionDetails>(`/karting/sessions/${segment(sessionId)}`, signal),
  kartingCompare: (sessionId: string, reference: number, compared: number, signal?: AbortSignal) =>
    request<KartingLapComparison>(`/karting/sessions/${segment(sessionId)}/laps/compare?referenceLap=${reference}&comparedLap=${compared}&points=201`, signal),
  explain: (payload: RaceEngineerExplainRequest, signal?: AbortSignal) => post<RaceEngineerExplanation>('/race-engineer/explain', payload, signal),
  chatWithRaceEngineer: (payload: RaceEngineerChatRequest, signal?: AbortSignal) => post<RaceEngineerExplanation>('/race-engineer/chat', payload, signal),
};

export interface RaceEngineerExplanation {
  explanation: string;
  provider: string;
  model: string;
}

async function post<T>(path: string, payload: unknown, signal?: AbortSignal): Promise<T> {
  const response = await fetch(`${normalizedApiBase}${path}`, {
    method: 'POST',
    headers: { 'Content-Type': 'application/json', 'X-RaceMind-CSRF': csrfToken },
    body: JSON.stringify(payload),
    signal,
    credentials: 'include',
  });
  if (response.status === 401 && !path.startsWith('/auth/')) {
    window.dispatchEvent(new Event('racemind:session-expired'));
  }
  if (!response.ok) {
    const result = await response.json().catch(() => null) as { message?: string } | null;
    if (response.status === 503) throw new Error('La IA generativa no está configurada en la API. Configura endpoint, clave y modelo.');
    throw new Error(result?.message ?? `La API respondió ${response.status} (${response.statusText})`);
  }
  return response.json() as Promise<T>;
}
