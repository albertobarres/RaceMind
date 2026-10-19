import { useEffect, useState } from 'react';

export interface FindingDistanceRange {
  start: number;
  end: number;
}

const highlightEventName = 'racemind:finding-highlight';

export function selectFindingOnCharts(ranges: FindingDistanceRange[]) {
  document.querySelector('[data-racemind-chart-anchor]')?.scrollIntoView({ behavior: 'smooth', block: 'center' });
  window.dispatchEvent(new CustomEvent<FindingDistanceRange[]>(highlightEventName, { detail: ranges }));
}

export function useFindingHighlight() {
  const [ranges, setRanges] = useState<FindingDistanceRange[]>([]);

  useEffect(() => {
    const handleHighlight = (event: Event) => {
      setRanges((event as CustomEvent<FindingDistanceRange[]>).detail);
    };
    window.addEventListener(highlightEventName, handleHighlight);
    return () => window.removeEventListener(highlightEventName, handleHighlight);
  }, []);

  return ranges;
}

export function distanceRangeAtElapsed(
  points: { relativeDistance: number; referenceElapsedSeconds: number; comparedElapsedSeconds: number }[],
  lap: 'reference' | 'compared',
  elapsedStart: number,
  elapsedEnd: number,
): FindingDistanceRange | null {
  if (points.length < 2) return null;
  const elapsedKey = lap === 'reference' ? 'referenceElapsedSeconds' : 'comparedElapsedSeconds';
  const at = (elapsed: number) => {
    const first = points[0];
    const last = points[points.length - 1];
    if (elapsed <= first[elapsedKey]) return first.relativeDistance;
    if (elapsed >= last[elapsedKey]) return last.relativeDistance;
    for (let index = 1; index < points.length; index++) {
      const before = points[index - 1];
      const after = points[index];
      if (after[elapsedKey] < elapsed) continue;
      const duration = after[elapsedKey] - before[elapsedKey];
      const ratio = duration > 0 ? (elapsed - before[elapsedKey]) / duration : 0;
      return before.relativeDistance + (after.relativeDistance - before.relativeDistance) * ratio;
    }
    return last.relativeDistance;
  };
  const first = at(elapsedStart);
  const second = at(elapsedEnd);
  return { start: Math.min(first, second), end: Math.max(first, second) };
}
