import { Activity, AlertTriangle } from 'lucide-react';
import type { AssettoLapComparison, KartingLapComparison, LapComparison } from './types';

const MIN_NOTABLE_SECTOR_DELTA_SECONDS = 0.05;

export interface Finding {
  readonly id: string;
  readonly title: string;
  readonly value: string;
  readonly evidence: string;
}

interface ReportProps {
  readonly title?: string;
  readonly subtitle: string;
  readonly sourceNote: string;
  readonly findings: Finding[];
  readonly referenceLap: number;
  readonly comparedLap: number;
}

export function RaceEngineerReport({
  title = 'Oportunidades observadas',
  subtitle = 'Hallazgos derivados de la comparación seleccionada; no son recomendaciones ni conclusiones causales.',
  sourceNote = 'Se describen diferencias observadas entre dos vueltas. No se infieren causas ni se usa ML o IA generativa en este informe.',
  findings,
  referenceLap,
  comparedLap,
}: ReportProps) {
  return <ReportPanel title={title} subtitle={subtitle} sourceNote={sourceNote} findings={findings}
    referenceLap={referenceLap} comparedLap={comparedLap} />;
}

export function buildContinuousLapFindings(comparison: AssettoLapComparison | KartingLapComparison): Finding[] {
  const findings: Finding[] = [];
  const delta = comparison.deltaLapTimeSeconds;
  if (delta > MIN_NOTABLE_SECTOR_DELTA_SECONDS) {
    findings.push({
      id: 'lap-time-delta',
      title: 'La vuelta comparada registra un tiempo mayor',
      value: formatDelta(delta),
      evidence: `Diferencia de tiempo de vuelta comparada − referencia: ${comparison.comparedLapTimeSeconds.toFixed(3)} s − ${comparison.referenceLapTimeSeconds.toFixed(3)} s.`,
    });
  }

  const peak = comparison.points.reduce<{ delta: number; relativeDistance: number } | null>((best, point) => {
    if (!Number.isFinite(point.deltaElapsedSeconds) || point.deltaElapsedSeconds <= 0) return best;
    if (best == null || point.deltaElapsedSeconds > best.delta) {
      return { delta: point.deltaElapsedSeconds, relativeDistance: point.relativeDistance };
    }
    return best;
  }, null);
  if (peak != null) {
    findings.push({
      id: 'peak-delta',
      title: 'Máxima desventaja acumulada observada',
      value: formatDelta(peak.delta),
      evidence: `Delta comparada − referencia en el ${Math.round(peak.relativeDistance * 100)}% de la distancia relativa.`,
    });
  }

  const speedLoss = comparison.points.reduce<{ delta: number; relativeDistance: number } | null>((best, point) => {
    const deltaSpeed = point.compared.speedKph - point.reference.speedKph;
    if (!Number.isFinite(deltaSpeed) || deltaSpeed >= 0) return best;
    if (best == null || deltaSpeed < best.delta) {
      return { delta: deltaSpeed, relativeDistance: point.relativeDistance };
    }
    return best;
  }, null);
  if (speedLoss != null) {
    findings.push({
      id: 'speed-difference',
      title: 'Mayor diferencia negativa de velocidad',
      value: `${speedLoss.delta.toFixed(1)} km/h`,
      evidence: `Velocidad comparada − referencia en el ${Math.round(speedLoss.relativeDistance * 100)}% de la distancia relativa. Es una diferencia puntual, no una medida de tiempo perdido.`,
    });
  }

  return findings.slice(0, 3);
}

export function ReportPanel({
  title,
  subtitle,
  sourceNote,
  findings,
  referenceLap,
  comparedLap,
}: ReportProps) {
  return (
    <section className="race-engineer-report" aria-labelledby="race-engineer-title">
      <header className="race-engineer-heading">
        <div>
          <span className="race-engineer-kicker"><Activity size={14} /> ANÁLISIS DETERMINISTA</span>
          <h2 id="race-engineer-title">{title}</h2>
          <p>{subtitle}</p>
        </div>
        <span className="race-engineer-pair">VUELTAS {referenceLap} / {comparedLap}</span>
      </header>

      {findings.length > 0 ? (
        <div className="race-engineer-findings">
          {findings.map((finding, index) => (
            <article className="race-engineer-finding" key={finding.id}>
              <span className="race-engineer-index">0{index + 1}</span>
              <div className="race-engineer-finding-content">
                <h3>{finding.title}</h3>
                <p>{finding.evidence}</p>
              </div>
              <strong className="race-engineer-value">{finding.value}</strong>
            </article>
          ))}
        </div>
      ) : (
        <div className="race-engineer-empty">
          <AlertTriangle size={16} />
          <span>No hay diferencias positivas de sector por encima del umbral actual ni un delta acumulado positivo para señalar.</span>
        </div>
      )}

      <footer className="race-engineer-limit">
        <strong>Alcance de esta versión</strong>
        <span>{sourceNote}</span>
      </footer>
    </section>
  );
}

export function buildF1Findings(comparison: LapComparison): Finding[] {
  const sectorFindings = comparison.sectorDeltasSeconds
    .map((delta, index) => ({ delta, index }))
    .filter(({ delta }) => delta != null && delta >= MIN_NOTABLE_SECTOR_DELTA_SECONDS)
    .sort((first, second) => (second.delta ?? 0) - (first.delta ?? 0))
    .map(({ delta, index }): Finding => ({
      id: `sector-${index + 1}`,
      title: `Sector ${index + 1}: mayor tiempo en la vuelta comparada`,
      value: formatDelta(delta!),
      evidence: `Diferencia calculada a partir de los tiempos de sector registrados para las vueltas ${comparison.referenceLap} y ${comparison.comparedLap}.`,
    }));

  return sectorFindings.length > 0
    ? sectorFindings.slice(0, 3)
    : [buildPeakDeltaFinding(comparison)].filter((finding): finding is Finding => finding != null);
}

function buildPeakDeltaFinding(comparison: LapComparison): Finding | null {
  const peak = comparison.points.reduce<{ delta: number; relativeDistance: number } | null>((best, point) => {
    if (!Number.isFinite(point.deltaElapsedSeconds) || point.deltaElapsedSeconds <= 0) return best;
    if (best == null || point.deltaElapsedSeconds > best.delta) {
      return { delta: point.deltaElapsedSeconds, relativeDistance: point.relativeDistance };
    }
    return best;
  }, null);

  if (peak == null) return null;

  return {
    id: 'peak-delta',
    title: 'Máxima desventaja acumulada observada',
    value: formatDelta(peak.delta),
    evidence: `Delta comparada − referencia en el ${Math.round(peak.relativeDistance * 100)}% de la distancia relativa; las diferencias de sector no superan el umbral actual o no están disponibles.`,
  };
}

function formatDelta(seconds: number) {
  return `+${seconds.toFixed(3)} s`;
}
