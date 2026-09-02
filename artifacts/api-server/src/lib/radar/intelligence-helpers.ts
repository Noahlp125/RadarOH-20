import { z } from "zod";

export const intelligenceQuerySchema = z.object({
  days: z.coerce.number().int().min(30).max(366).default(90),
});

const clamp = (value: number) => Math.round(Math.max(0, Math.min(100, value)));
const rounded = (value: number) => Math.round(value * 100) / 100;

type TrendEvent = { id: string; changeType: string };
type TrendFinding = { eventType: string };

export function buildHistoricalTrends<T extends TrendEvent>(
  current: T[],
  previous: T[],
  findings: Map<string, TrendFinding>,
) {
  const eventType = (event: T) => findings.get(event.id)?.eventType || event.changeType;
  const types = new Set([...current.map(eventType), ...previous.map(eventType)]);
  const rows = [{ key: "overall", label: "Actividad competitiva global", current: current.length, previous: previous.length, events: [...current, ...previous] },
    ...[...types].map((type) => ({
      key: `type:${type}`,
      label: type,
      current: current.filter((event) => eventType(event) === type).length,
      previous: previous.filter((event) => eventType(event) === type).length,
      events: [...current.filter((event) => eventType(event) === type), ...previous.filter((event) => eventType(event) === type)],
    }))]
    .sort((a, b) => b.current - a.current || b.previous - a.previous || a.label.localeCompare(b.label))
    .slice(0, 6);
  return rows.map((row) => {
    const delta = row.current - row.previous;
    const direction = row.previous === 0 && row.current > 0 ? "emerging"
      : delta === 0 ? "stable"
      : delta < 0 ? "declining"
      : row.previous > 0 && delta / row.previous >= 0.5 ? "accelerating" : "growing";
    return {
      key: row.key,
      label: row.label,
      current_count: row.current,
      previous_count: row.previous,
      delta_percent: row.previous ? rounded((delta / row.previous) * 100) : row.current ? 100 : 0,
      direction,
      confidence: clamp((row.current + row.previous) * 10),
      basis: "Señal histórica adelantada basada en periodos equivalentes; no es un pronóstico calibrado.",
      evidence_event_ids: row.events.slice(0, 20).map((event) => event.id),
    };
  });
}