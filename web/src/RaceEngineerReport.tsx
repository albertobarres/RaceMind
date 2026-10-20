import { useEffect, useLayoutEffect, useRef, useState } from 'react';
import { Activity, AlertTriangle, MessageCircle, Send, Sparkles } from 'lucide-react';
import { api } from './api';
import { distanceRangeAtElapsed, selectFindingOnCharts, type FindingDistanceRange } from './findingHighlight';
import type { AssettoLapComparison, KartingLapComparison, LapComparison } from './types';

const MIN_NOTABLE_SECTOR_DELTA_SECONDS = 0.05;

export interface Finding {
  readonly id: string;
  readonly title: string;
  readonly value: string;
  readonly evidence: string;
  readonly distanceRanges?: FindingDistanceRange[];
}

interface ReportProps {
  readonly title?: string;
  readonly subtitle: string;
  readonly chatContext?: string;
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
      distanceRanges: [{ start: peak.relativeDistance, end: peak.relativeDistance }],
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
      distanceRanges: [{ start: speedLoss.relativeDistance, end: speedLoss.relativeDistance }],
    });
  }

  return findings.slice(0, 3);
}

export function ReportPanel({
  title = 'Oportunidades observadas',
  subtitle,
  chatContext,
  sourceNote,
  findings,
  referenceLap,
  comparedLap,
}: ReportProps) {
  const [explanation, setExplanation] = useState<string | null>(null);
  const [explanationModel, setExplanationModel] = useState<string | null>(null);
  const [explanationError, setExplanationError] = useState<string | null>(null);
  const [isExplaining, setIsExplaining] = useState(false);
  const [chatMessages, setChatMessages] = useState<{ role: 'user' | 'assistant'; content: string }[]>([]);
  const [chatQuestion, setChatQuestion] = useState('');
  const [isChatSending, setIsChatSending] = useState(false);
  const [chatError, setChatError] = useState<string | null>(null);
  const explanationController = useRef<AbortController | null>(null);
  const chatController = useRef<AbortController | null>(null);
  const chatMessagesEnd = useRef<HTMLDivElement | null>(null);
  const reportKey = JSON.stringify([title, subtitle, sourceNote, findings, referenceLap, comparedLap]);

  useEffect(() => {
    explanationController.current?.abort();
    chatController.current?.abort();
    explanationController.current = null;
    setExplanation(null);
    setExplanationModel(null);
    setExplanationError(null);
    setChatMessages([]);
    setChatQuestion('');
    setChatError(null);
    setIsExplaining(false);
    setIsChatSending(false);
    return () => explanationController.current?.abort();
  }, [reportKey]);

  useLayoutEffect(() => {
    chatMessagesEnd.current?.scrollIntoView({ behavior: 'smooth', block: 'end' });
  }, [chatMessages, isChatSending]);

  const explain = async () => {
    if (findings.length === 0 || isExplaining) return;
    const controller = new AbortController();
    explanationController.current = controller;
    setIsExplaining(true);
    setExplanationError(null);
    try {
      const result = await api.explain({
        source: title.includes('MotoGP') ? 'MotoGP' : title.includes('Assetto Corsa') ? 'Assetto Corsa' : title.includes('Karting') ? 'Karting' : 'F1',
        referenceLap,
        comparedLap,
        context: chatContext ?? subtitle,
        findings,
        limitations: sourceNote,
      }, controller.signal);
      setExplanation(result.explanation);
      setExplanationModel(`${result.provider} · ${result.model}`);
    } catch (error) {
      if (!controller.signal.aborted) {
        setExplanationError(error instanceof Error ? error.message : 'No se pudo generar la explicación.');
      }
    } finally {
      if (!controller.signal.aborted) setIsExplaining(false);
    }
  };

  const sendChatMessage = async (event: React.FormEvent<HTMLFormElement>) => {
    event.preventDefault();
    const question = chatQuestion.trim();
    if (!question || findings.length === 0 || isChatSending) return;
    const controller = new AbortController();
    chatController.current = controller;
    setIsChatSending(true);
    setChatError(null);
    setChatQuestion('');
    setChatMessages((messages) => [...messages, { role: 'user' as const, content: question }]);
    try {
      const response = await api.chatWithRaceEngineer({
        report: {
          source: title.includes('MotoGP') ? 'MotoGP' : title.includes('Assetto Corsa') ? 'Assetto Corsa' : title.includes('Karting') ? 'Karting' : 'F1',
          referenceLap,
          comparedLap,
          context: chatContext ?? subtitle,
          findings,
          limitations: sourceNote,
        },
        question,
        history: [
          ...(explanation ? [{ role: 'assistant' as const, content: `Explicación generativa mostrada en el informe: ${explanation}` }] : []),
          ...chatMessages.slice(-10),
        ].slice(-12),
      }, controller.signal);
      if (!controller.signal.aborted) {
        setChatMessages((messages) => [...messages, { role: 'assistant' as const, content: response.explanation }].slice(-12));
        setExplanationModel(`${response.provider} · ${response.model}`);
      }
    } catch (error) {
      if (!controller.signal.aborted) {
        setChatError(error instanceof Error ? error.message : 'No se pudo enviar la pregunta.');
        setChatMessages((messages) => messages.filter((message, index) => !(index === messages.length - 1 && message.role === 'user' && message.content === question)));
        setChatQuestion(question);
      }
    } finally {
      if (!controller.signal.aborted) setIsChatSending(false);
    }
  };

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
                {finding.distanceRanges && <button type="button" className="race-engineer-chart-link" onClick={() => selectFindingOnCharts(finding.distanceRanges!)}>Ver en gráficas</button>}
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

      <div className="race-engineer-ai">
        <button type="button" className="race-engineer-explain-button" onClick={() => void explain()} disabled={findings.length === 0 || isExplaining}>
          <Sparkles size={14} /> {isExplaining ? 'Generando explicación…' : explanation ? 'Volver a generar' : 'Explicar con IA generativa'}
        </button>
        {explanationError && <p className="race-engineer-ai-error" role="alert">{explanationError}</p>}
        {explanation && <div className="race-engineer-ai-result" aria-live="polite"><strong>Explicación generativa</strong><p><FormattedAnswer text={explanation} /></p><small>{explanationModel} · basada en los hallazgos mostrados; verifica siempre los datos de origen.</small></div>}
      </div>

      <section className="race-engineer-chat" aria-label="Chat con Race Engineer">
        <header><MessageCircle size={15} /><strong>Pregunta al Race Engineer</strong><span>Respuestas basadas en estos hallazgos</span></header>
        {chatMessages.length > 0 && <div className="race-engineer-chat-messages" aria-live="polite">
          {chatMessages.map((message, index) => <article className={`race-engineer-chat-message ${message.role}`} key={`${index}-${message.role}`}>
            <small>{message.role === 'user' ? 'TÚ' : 'RACE ENGINEER'}</small><p><FormattedAnswer text={message.content} /></p>
          </article>)}
          {isChatSending && <div className="race-engineer-chat-pending">Race Engineer está respondiendo…</div>}
          <div ref={chatMessagesEnd} />
        </div>}
        {chatError && <p className="race-engineer-ai-error" role="alert">{chatError}</p>}
        <form className="race-engineer-chat-form" onSubmit={(event) => void sendChatMessage(event)}>
          <input
            value={chatQuestion}
            onChange={(event) => setChatQuestion(event.target.value)}
            placeholder="Ej.: ¿En qué sectores debería centrarse el piloto?"
            maxLength={1000}
            disabled={findings.length === 0 || isChatSending}
            aria-label="Pregunta para Race Engineer"
          />
          <button type="submit" disabled={!chatQuestion.trim() || findings.length === 0 || isChatSending} aria-label="Enviar pregunta"><Send size={15} /></button>
        </form>
      </section>

      <footer className="race-engineer-limit">
        <strong>Alcance de esta versión</strong>
        <span>{sourceNote}</span>
      </footer>
    </section>
  );
}

function FormattedAnswer({ text }: { readonly text: string }) {
  const parts = text.split(/(\*\*[^*]+\*\*)/g);
  return <>{parts.map((part, index) => part.startsWith('**') && part.endsWith('**')
    ? <strong key={index}>{part.slice(2, -2)}</strong>
    : <span key={index}>{part}</span>)}</>;
}

export function buildF1Findings(comparison: LapComparison, referenceSectorTimes: (number | null)[] = []): Finding[] {
  const sectorFindings = comparison.sectorDeltasSeconds
    .map((delta, index) => ({ delta, index }))
    .filter(({ delta }) => delta != null && delta >= MIN_NOTABLE_SECTOR_DELTA_SECONDS)
    .sort((first, second) => (second.delta ?? 0) - (first.delta ?? 0))
    .map(({ delta, index }): Finding => {
      let elapsedAtSectorStart = 0;
      for (let prior = 0; prior < index; prior++) elapsedAtSectorStart += referenceSectorTimes[prior] ?? 0;
      const referenceSectorTime = referenceSectorTimes[index];
      const comparedRange = referenceSectorTime == null
        ? null
        : distanceRangeAtElapsed(comparison.points, 'reference', elapsedAtSectorStart, elapsedAtSectorStart + referenceSectorTime);
      return {
        id: `sector-${index + 1}`,
        title: `Sector ${index + 1}: mayor tiempo en la vuelta comparada`,
        value: formatDelta(delta!),
        evidence: `Diferencia calculada a partir de los tiempos de sector registrados para las vueltas ${comparison.referenceLap} y ${comparison.comparedLap}.`,
        ...(comparedRange ? { distanceRanges: [comparedRange] } : {}),
      };
    });

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
