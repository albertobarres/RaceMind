export interface SessionSummary {
  year: number;
  id: string;
  grandPrix: string;
  sessionName: string;
  driverCount: number | null;
  lapCount: number | null;
}

export interface TelemetryCatalog {
  categories: TelemetryCategory[];
}

export interface TelemetryCategory {
  key: string;
  name: string;
  series: TelemetrySeries[];
}

export interface TelemetrySeries {
  key: string;
  name: string;
  years: TelemetryYear[];
  datasets: TelemetryDataset[];
}

export interface TelemetryYear {
  year: number;
  sessions: SessionSummary[];
  events: TelemetryEvent[];
}

export interface TelemetryEvent {
  code: string;
  name: string;
  sessions: MotoGpSessionSummary[];
}

export interface TelemetryDataset {
  key: string;
  name: string;
  location: string | null;
  hasSessionAnalysis: boolean;
}

export interface MotoGpEventSummary {
  id: string;
  year: number;
  eventCode: string;
  grandPrix: string;
  sessions: MotoGpSessionSummary[];
}

export interface MotoGpSessionSummary {
  id: string;
  eventCode: string;
  eventName: string;
  sessionCode: string;
  sessionName: string;
  date: string | null;
  weather: string | null;
  resultCount: number;
  lapRecordCount: number;
}

export interface MotoGpSessionDetails {
  session: MotoGpSessionSummary;
  circuit: string | null;
  sessionTitle: string | null;
  results: MotoGpRiderResult[];
}

export interface MotoGpRiderResult {
  position: number;
  riderNumber: number;
  rider: string;
  team: string;
  bike: string;
  laps: number | null;
  sessionTime: string | null;
  gap: string | null;
  bestLap: string | null;
  topSpeedKph: number | null;
  status: string | null;
}

export interface MotoGpLapRecord {
  rider: string;
  riderNumber: number;
  position: number;
  lapNumber: number;
  lapTime: string | null;
  sector1: string | null;
  sector2: string | null;
  sector3: string | null;
  sector4: string | null;
  speedKph: number | null;
  pit: number | null;
  run: string | null;
  frontTyre: string | null;
  rearTyre: string | null;
}

export interface DriverSummary {
  code: string;
  fullName: string | null;
  team: string | null;
  teamColour: string | null;
  lapCount: number | null;
  bestLapSeconds: number | null;
}

export interface WeatherSummary {
  airTemperatureCelsius: number | null;
  trackTemperatureCelsius: number | null;
  humidityPercent: number | null;
  pressureHpa: number | null;
  windSpeedMetersPerSecond: number | null;
  rainfall: boolean | null;
  sampleTimeSeconds: number | null;
}

export interface SessionDetails {
  year: number;
  id: string;
  grandPrix: string;
  sessionName: string;
  drivers: DriverSummary[];
  cornerCount: number;
  weather: WeatherSummary | null;
}

export interface LapSummary {
  number: number;
  lapTimeSeconds: number | null;
  sector1Seconds: number | null;
  sector2Seconds: number | null;
  sector3Seconds: number | null;
  tyreCompound: string | null;
  stint: number | null;
  hasTelemetry: boolean;
  isPersonalBest: boolean;
}

export interface CornerSummary {
  number: number;
  distanceMeters: number;
  x: number;
  y: number;
  angleDegrees: number;
}

export interface ComparisonPoint {
  relativeDistance: number;
  referenceElapsedSeconds: number;
  comparedElapsedSeconds: number;
  deltaElapsedSeconds: number;
  referenceSpeedKph: number;
  comparedSpeedKph: number;
  deltaSpeedKph: number;
  referenceThrottlePercent: number;
  comparedThrottlePercent: number;
  referenceBrakePercent: number;
  comparedBrakePercent: number;
}

export interface LapComparison {
  referenceLap: number;
  comparedLap: number;
  referenceLapTimeSeconds: number | null;
  comparedLapTimeSeconds: number | null;
  deltaLapTimeSeconds: number | null;
  sectorDeltasSeconds: (number | null)[];
  points: ComparisonPoint[];
}
