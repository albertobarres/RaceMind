import { useEffect, useLayoutEffect, useRef, useState } from 'react';
import { Activity, AlertTriangle, MessageCircle, Send, Sparkles } from 'lucide-react';
import { api } from './api';
import { distanceRangeAtElapsed, selectFindingOnCharts, type FindingDistanceRange } from './findingHighlight';
import type { AssettoLapComparison, CornerSummary, KartingLapComparison, LapComparison } from './types';

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
  sourceNote = 'Se describen diferencias observadas entre dos vueltas. No se infieren causas ni se generan explicaciones con IA en este informe.',
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
  if (Math.abs(delta) > MIN_NOTABLE_SECTOR_DELTA_SECONDS) {
    findings.push({
      id: 'lap-time-delta',
      title: delta > 0 ? 'La vuelta comparada fue más lenta' : 'La vuelta comparada fue más rápida',
      value: formatSignedDelta(delta),
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
  if (peak != null && peak.delta > MIN_NOTABLE_SECTOR_DELTA_SECONDS) {
    findings.push({
      id: 'peak-delta',
      title: 'Mayor desventaja acumulada observada',
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
  if (speedLoss != null && speedLoss.delta <= -5) {
    findings.push({
      id: 'speed-difference',
      title: 'Mayor diferencia negativa de velocidad',
      value: `${speedLoss.delta.toFixed(1)} km/h`,
      evidence: `Velocidad comparada − referencia en el ${Math.round(speedLoss.relativeDistance * 100)}% de la distancia relativa. Es una diferencia puntual, no una medida de tiempo perdido.`,
      distanceRanges: [{ start: speedLoss.relativeDistance, end: speedLoss.relativeDistance }],
    });
  }

  if ('referenceDistanceMeters' in comparison) {
    const braking = compareBrakeOnset(comparison);
    if (braking && Math.abs(braking.deltaMeters) >= 5) {
      findings.push({
        id: 'braking-point',
        title: braking.deltaMeters > 0 ? 'Frenada más tardía en la vuelta comparada' : 'Frenada más temprana en la vuelta comparada',
        value: `${Math.abs(braking.deltaMeters).toFixed(0)} m ${braking.deltaMeters > 0 ? 'después' : 'antes'}`,
        evidence: `Primer punto de frenada sostenida (freno ≥20% durante al menos dos muestras): referencia ${braking.referenceMeters.toFixed(0)} m y comparada ${braking.comparedMeters.toFixed(0)} m desde la salida. Posición reconstruida por distancia recorrida.`,
        distanceRanges: [{ start: braking.relativeDistance, end: braking.relativeDistance }],
      });
    }

    const throttle = compareThrottle(comparison);
    if (throttle && Math.abs(throttle.relativePercent) >= 8) {
      findings.push({
        id: 'throttle-application',
        title: throttle.relativePercent < 0 ? 'Menos acelerador tras la mínima velocidad' : 'Más acelerador tras la mínima velocidad',
        value: `${Math.abs(throttle.relativePercent).toFixed(0)}% ${throttle.relativePercent < 0 ? 'menos' : 'más'}`,
        evidence: `Media de acelerador durante los 2 s posteriores al punto de mínima velocidad: referencia ${throttle.referenceMean.toFixed(0)}%, comparada ${throttle.comparedMean.toFixed(0)}% (${throttle.deltaPoints.toFixed(0)} puntos porcentuales).`,
        distanceRanges: [{ start: throttle.relativeDistance, end: throttle.endRelativeDistance }],
      });
    }

    if (braking && braking.deltaMeters < -5) {
      const speedAtBrake = nearestPoint(comparison.points, braking.relativeDistance);
      if (speedAtBrake && speedAtBrake.compared.speedKph <= speedAtBrake.reference.speedKph - 3) {
        findings.push({
          id: 'braking-experiment',
          title: 'Prueba sugerida',
          value: 'Retrasar la frenada 3–5 m',
          evidence: `En esta zona la vuelta comparada inicia la frenada unos ${Math.abs(braking.deltaMeters).toFixed(0)} m antes y registra menor velocidad. En una tanda controlada, prueba a retrasar ligeramente el punto de frenada y compara salida, estabilidad y tiempo; no es una garantía de mejora.`,
          distanceRanges: [{ start: Math.max(0, braking.relativeDistance - 0.01), end: Math.min(1, braking.relativeDistance + 0.01) }],
        });
      }
    }

    const tyre = compareFrontTyreTemperature(comparison);
    if (tyre && Math.abs(tyre.deltaCelsius) >= 2) {
      findings.push({
        id: 'front-tyre-temperature',
        title: tyre.deltaCelsius > 0 ? 'Mayor temperatura media en los neumáticos delanteros' : 'Menor temperatura media en los neumáticos delanteros',
        value: `${tyre.deltaCelsius > 0 ? '+' : ''}${tyre.deltaCelsius.toFixed(1)} °C`,
        evidence: `Media de temperatura del núcleo delantero (ruedas izquierda y derecha) en las muestras alineadas: referencia ${tyre.referenceMean.toFixed(1)} °C, comparada ${tyre.comparedMean.toFixed(1)} °C. Canal variable en ambas vueltas.`,
      });
    }
  }

  return findings.slice(0, 8);
}

function compareBrakeOnset(comparison: AssettoLapComparison) {
  const onsets = (side: 'reference' | 'compared', totalDistance: number) => comparison.points.flatMap((point, index) => {
    if (index === 0 || point[side].brake < 0.2 || comparison.points[index - 1][side].brake >= 0.2) return [];
    if (comparison.points.slice(index, index + 2).some((next) => next[side].brake < 0.2)) return [];
    return [{ relativeDistance: point.relativeDistance, distance: point.relativeDistance * totalDistance }];
  });
  const reference = onsets('reference', comparison.referenceDistanceMeters);
  const compared = onsets('compared', comparison.comparedDistanceMeters);
  const pairs = reference.flatMap((ref) => {
    const nearest = compared.reduce<typeof compared[number] | null>((best, item) =>
      best == null || Math.abs(item.relativeDistance - ref.relativeDistance) < Math.abs(best.relativeDistance - ref.relativeDistance) ? item : best, null);
    return nearest && Math.abs(nearest.relativeDistance - ref.relativeDistance) <= 0.06
      ? [{ reference: ref, compared: nearest, deltaMeters: nearest.distance - ref.distance }]
      : [];
  });
  const largest = pairs.sort((first, second) => Math.abs(second.deltaMeters) - Math.abs(first.deltaMeters))[0];
  return largest ? {
    referenceMeters: largest.reference.distance,
    comparedMeters: largest.compared.distance,
    relativeDistance: (largest.reference.relativeDistance + largest.compared.relativeDistance) / 2,
    deltaMeters: largest.deltaMeters,
  } : null;
}

function nearestPoint<T extends { relativeDistance: number }>(points: T[], relativeDistance: number): T | null {
  return points.reduce<T | null>((best, point) =>
    best == null || Math.abs(point.relativeDistance - relativeDistance) < Math.abs(best.relativeDistance - relativeDistance) ? point : best, null);
}

function compareThrottle(comparison: AssettoLapComparison) {
  const lowSpeedPoint = comparison.points.reduce<number | null>((best, point, index, points) => {
    const speedDifference = point.compared.speedKph - point.reference.speedKph;
    if (speedDifference > -3) return best;
    return best == null || speedDifference < points[best].compared.speedKph - points[best].reference.speedKph ? index : best;
  }, null);
  if (lowSpeedPoint == null) return null;
  const anchor = comparison.points[lowSpeedPoint];
  const endReference = anchor.reference.elapsedSeconds + 2;
  const endCompared = anchor.compared.elapsedSeconds + 2;
  const samples = comparison.points.filter((point) =>
    point.reference.elapsedSeconds >= anchor.reference.elapsedSeconds && point.reference.elapsedSeconds <= endReference &&
    point.compared.elapsedSeconds >= anchor.compared.elapsedSeconds && point.compared.elapsedSeconds <= endCompared);
  if (samples.length < 3) return null;
  const referenceMean = samples.reduce((sum, point) => sum + point.reference.throttle, 0) / samples.length * 100;
  const comparedMean = samples.reduce((sum, point) => sum + point.compared.throttle, 0) / samples.length * 100;
  if (referenceMean < 5) return null;
  return {
    referenceMean,
    comparedMean,
    deltaPoints: comparedMean - referenceMean,
    relativePercent: (comparedMean - referenceMean) / referenceMean * 100,
    relativeDistance: anchor.relativeDistance,
    endRelativeDistance: samples.at(-1)?.relativeDistance ?? anchor.relativeDistance,
  };
}

function compareFrontTyreTemperature(comparison: AssettoLapComparison) {
  const wheels = [
    ['tyreCoreFl', 'tyreCoreFl'], ['tyreCoreFr', 'tyreCoreFr'],
  ] as const;
  // Assetto adapter uses 26 °C as its missing-channel fallback. Ignore constant wheels on either lap.
  const availableWheels = wheels.filter(([referenceKey, comparedKey]) => {
    const reference = comparison.points.map((point) => point.reference[referenceKey]);
    const compared = comparison.points.map((point) => point.compared[comparedKey]);
    return Math.max(...reference) - Math.min(...reference) > 1 && Math.max(...compared) - Math.min(...compared) > 1;
  });
  if (!availableWheels.length) return null;
  const reference = comparison.points.flatMap((point) => availableWheels.map(([key]) => point.reference[key]));
  const compared = comparison.points.flatMap((point) => availableWheels.map(([, key]) => point.compared[key]));
  const referenceMean = reference.reduce((sum, value) => sum + value, 0) / reference.length;
  const comparedMean = compared.reduce((sum, value) => sum + value, 0) / compared.length;
  return { referenceMean, comparedMean, deltaCelsius: comparedMean - referenceMean };
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
  const reportKey = JSON.stringify([title, subtitle, chatContext, sourceNote, findings, referenceLap, comparedLap]);

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
        {explanation && <div className="race-engineer-ai-result" aria-live="polite"><strong>Explicación generativa</strong><FormattedAnswer text={explanation} /><small>{explanationModel} · basada en los hallazgos mostrados; verifica siempre los datos de origen.</small></div>}
      </div>

      <section className="race-engineer-chat" aria-label="Chat con Race Engineer">
        <header><MessageCircle size={15} /><strong>Pregunta al Race Engineer</strong><span>Respuestas basadas en estos hallazgos</span></header>
        {chatMessages.length > 0 && <div className="race-engineer-chat-messages" aria-live="polite">
          {chatMessages.map((message, index) => <article className={`race-engineer-chat-message ${message.role}`} key={`${index}-${message.role}`}>
            <small>{message.role === 'user' ? 'TÚ' : 'RACE ENGINEER'}</small><FormattedAnswer text={message.content} />
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
  const lines = text.split(/\r?\n/).map((line) => line.trim()).filter(Boolean);
  const points = lines.length > 1
    ? lines
    : (lines[0] ?? '').split(/\s+(?=(?:•|-(?!\*)|\d+[.)])\s)/).filter(Boolean);
  return <ul className="race-engineer-answer-points">{points.map((line, index) => {
    const normalized = line.replace(/^(?:[-*•]|\d+[.)])\s*/, '').replace(/\\([*_])/g, '$1');
    return <li key={index}>{formatInlineAnswer(normalized, index)}</li>;
  })}</ul>;
}

function formatInlineAnswer(text: string, lineIndex: number) {
  const tokens = text.split(/(\*{1,2}[^*\n]+?\*{1,2}|_{1,2}[^_\n]+?_{1,2})/g).filter(Boolean);
  return tokens.map((token, index) => {
    const match = token.match(/^(\*{1,2}|_{1,2})(.+?)(\*{1,2}|_{1,2})$/);
    if (match && match[1][0] === match[3][0]) {
      return <strong key={`${lineIndex}-bold-${index}`}>{match[2]}</strong>;
    }
    // Strip malformed/unmatched Markdown markers from model output instead of showing raw syntax.
    return <span key={`${lineIndex}-text-${index}`}>{token.replace(/\*{1,2}|_{1,2}/g, '')}</span>;
  });
}

export function buildF1Findings(comparison: LapComparison, referenceSectorTimes: (number | null)[] = [], corners: CornerSummary[] = []): Finding[] {
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

  const cornerFinding = buildCornerFinding(comparison, corners);
  const brakingFinding = buildF1BrakingFinding(comparison, corners);
  const throttleFinding = buildF1ThrottleFinding(comparison);
  const prioritized = [
    ...sectorFindings.slice(0, 2),
    ...(cornerFinding ? [cornerFinding] : []),
    ...(brakingFinding ? [brakingFinding] : []),
    ...(brakingFinding?.value.includes('antes') ? [{
      id: 'braking-experiment',
      title: 'Prueba sugerida',
      value: 'Retrasar la frenada 3–5 m',
      evidence: 'La vuelta comparada inicia la frenada antes en esta zona. En una tanda controlada, prueba a retrasar ligeramente el punto de frenada y compara velocidad mínima, estabilidad, salida y tiempo; no es una garantía de mejora.',
      distanceRanges: brakingFinding.distanceRanges,
    }] : []),
    ...(throttleFinding ? [throttleFinding] : []),
    ...(!sectorFindings.length && !cornerFinding ? [buildPeakDeltaFinding(comparison)].filter((finding): finding is Finding => finding != null) : []),
  ];
  return prioritized.slice(0, 4);
}

function buildCornerFinding(comparison: LapComparison, corners: CornerSummary[]): Finding | null {
  if (!corners.length || !comparison.points.length) return null;
  const totalDistance = comparison.points.at(-1)!.referenceDistanceMeters;
  if (totalDistance <= 0) return null;
  const candidates = corners.map((corner) => {
    const relative = corner.distanceMeters / totalDistance;
    const point = comparison.points.reduce((best, item) => Math.abs(item.relativeDistance - relative) < Math.abs(best.relativeDistance - relative) ? item : best, comparison.points[0]);
    return { corner, relative, delta: point.comparedSpeedKph - point.referenceSpeedKph };
  }).filter((item) => Math.abs(item.delta) >= 5);
  const largest = candidates.sort((first, second) => Math.abs(second.delta) - Math.abs(first.delta))[0];
  if (!largest) return null;
  return {
    id: 'corner-speed',
    title: `Curva ${largest.corner.number}: diferencia de velocidad estimada`,
    value: `${largest.delta > 0 ? '+' : ''}${largest.delta.toFixed(0)} km/h`,
    evidence: `Velocidad comparada − referencia en la muestra más cercana a la posición de curva registrada (${largest.corner.distanceMeters.toFixed(0)} m). La posición de curva es aproximada, no el vértice medido.`,
    distanceRanges: [{ start: Math.max(0, largest.relative - 0.008), end: Math.min(1, largest.relative + 0.008) }],
  };
}

function buildF1BrakingFinding(comparison: LapComparison, corners: CornerSummary[]): Finding | null {
  const totalDistance = comparison.points.at(-1)?.referenceDistanceMeters ?? 0;
  if (totalDistance <= 0) return null;
  const zones = corners.length ? corners.map((corner) => ({ number: corner.number, relative: corner.distanceMeters / totalDistance })) : [];
  let best: { number: number | null; delta: number; relative: number; ref: number; cmp: number } | null = null;
  for (const zone of zones) {
    const start = Math.max(0, zone.relative - 0.08);
    const end = zone.relative;
    const range = comparison.points.filter((point) => point.relativeDistance >= start && point.relativeDistance <= end);
    const refPoint = range.find((point) => point.referenceBrakePercent >= 15);
    const cmpPoint = range.find((point) => point.comparedBrakePercent >= 15);
    if (!refPoint || !cmpPoint) continue;
    const refDistance = refPoint.referenceDistanceMeters;
    const cmpDistance = cmpPoint.comparedDistanceMeters;
    const delta = cmpDistance - refDistance;
    if (Math.abs(delta) >= 5 && (!best || Math.abs(delta) > Math.abs(best.delta))) best = { number: zone.number, delta, relative: (refPoint.relativeDistance + cmpPoint.relativeDistance) / 2, ref: refDistance, cmp: cmpDistance };
  }
  if (!best) return null;
  return {
    id: 'braking-point',
    title: best.number == null ? 'Inicio de frenada estimado' : `Curva ${best.number}: inicio de frenada estimado`,
    value: `${Math.abs(best.delta).toFixed(0)} m ${best.delta > 0 ? 'después' : 'antes'}`,
    evidence: `Primer cruce del 15% de freno en el tramo previo a la curva: referencia ${best.ref.toFixed(0)} m, comparada ${best.cmp.toFixed(0)} m. Estimación basada en muestras alineadas por distancia.`,
    distanceRanges: [{ start: best.relative, end: best.relative }],
  };
}

function buildF1ThrottleFinding(comparison: LapComparison): Finding | null {
  const candidate = comparison.points.reduce<{ index: number; deficit: number } | null>((best, point, index) => {
    const deficit = point.comparedSpeedKph - point.referenceSpeedKph;
    return deficit <= -5 && (!best || deficit < best.deficit) ? { index, deficit } : best;
  }, null);
  if (!candidate) return null;
  const start = comparison.points[candidate.index];
  const endDistance = start.relativeDistance + 0.015;
  const window = comparison.points.filter((point) => point.relativeDistance >= start.relativeDistance && point.relativeDistance <= endDistance);
  if (window.length < 3) return null;
  const ref = window.reduce((sum, point) => sum + point.referenceThrottlePercent, 0) / window.length;
  const cmp = window.reduce((sum, point) => sum + point.comparedThrottlePercent, 0) / window.length;
  if (ref < 5 || cmp - ref > -5) return null;
  return {
    id: 'throttle-application',
    title: 'Menos acelerador en la salida de la zona lenta',
    value: `${Math.abs((cmp - ref) / ref * 100).toFixed(0)}% menos`,
    evidence: `Media en el siguiente 1,5% de distancia: referencia ${ref.toFixed(0)}%, comparada ${cmp.toFixed(0)}% (${(cmp - ref).toFixed(0)} puntos porcentuales).`,
    distanceRanges: [{ start: start.relativeDistance, end: Math.min(1, endDistance) }],
  };
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

function formatSignedDelta(seconds: number) {
  return `${seconds > 0 ? '+' : seconds < 0 ? '−' : ''}${Math.abs(seconds).toFixed(3)} s`;
}
