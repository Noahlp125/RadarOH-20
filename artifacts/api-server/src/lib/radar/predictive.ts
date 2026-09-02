import { and, desc, eq, gte, inArray, lte } from "drizzle-orm";
import { openai } from "@workspace/integrations-openai-ai-server";
import {
  radarAiFindings,
  radarChangeEvents,
  radarCompetitors,
  radarMonitorRuns,
  radarSources,
} from "@workspace/db";
import { RADAR_WORKSPACE_ID, withRadarTransaction } from "./repository";

const DAY_MS = 86_400_000;
const MODEL = "gpt-5.6-terra";
const clamp = (value: number) => Math.round(Math.max(0, Math.min(100, value)));
const importance: Record<string, number> = { low: 25, medium: 50, high: 75, critical: 100 };
const limitations = [
  "Las señales se derivan únicamente de eventos y hallazgos persistidos en RadarOH.",
  "No hay resultados etiquetados ni historial de intervenciones para calibrar probabilidades.",
  "Las salidas son señales prospectivas para revisión humana, no predicciones de movimientos futuros.",
];

type Event = typeof radarChangeEvents.$inferSelect;
type Finding = typeof radarAiFindings.$inferSelect;

export async function getRadarPredictive(days: number) {
  const now = new Date();
  const from = new Date(now.getTime() - days * DAY_MS);
  const previousFrom = new Date(from.getTime() - days * DAY_MS);
  return withRadarTransaction(async (tx) => {
    const competitors = await tx.select().from(radarCompetitors).where(eq(radarCompetitors.workspaceId, RADAR_WORKSPACE_ID));
    const sources = await tx.select().from(radarSources).where(eq(radarSources.workspaceId, RADAR_WORKSPACE_ID));
    const current = await tx.select().from(radarChangeEvents).where(and(eq(radarChangeEvents.workspaceId, RADAR_WORKSPACE_ID), gte(radarChangeEvents.occurredAt, from), lte(radarChangeEvents.occurredAt, now))).orderBy(desc(radarChangeEvents.occurredAt)).limit(5000);
    const previous = await tx.select().from(radarChangeEvents).where(and(eq(radarChangeEvents.workspaceId, RADAR_WORKSPACE_ID), gte(radarChangeEvents.occurredAt, previousFrom), lte(radarChangeEvents.occurredAt, from))).orderBy(desc(radarChangeEvents.occurredAt)).limit(5000);
    const findings = await tx.select().from(radarAiFindings).where(and(eq(radarAiFindings.workspaceId, RADAR_WORKSPACE_ID), gte(radarAiFindings.createdAt, from), lte(radarAiFindings.createdAt, now))).orderBy(desc(radarAiFindings.createdAt)).limit(5000);
    const runs = await tx.select().from(radarMonitorRuns).where(and(eq(radarMonitorRuns.workspaceId, RADAR_WORKSPACE_ID), gte(radarMonitorRuns.startedAt, from), lte(radarMonitorRuns.startedAt, now))).limit(2000);
    const currentIds = new Set(current.map((event) => event.id));
    const groundedFindings = findings.filter((finding) => finding.changeEventId && currentIds.has(finding.changeEventId));
    const findingByEvent = new Map(groundedFindings.map((finding) => [finding.changeEventId!, finding]));
    const competitorMap = new Map(competitors.map((competitor) => [competitor.id, competitor]));
    const slope = current.length - previous.length;
    const evidenceIds = current.slice(0, 20).map((event) => event.id);
    const signalConfidence = (event: Event, finding?: Finding) => {
      const recency = 100 * (1 - Math.min(days, Math.max(0, now.getTime() - event.occurredAt.getTime()) / DAY_MS) / days);
      return clamp((finding?.confidence ?? 35) * .35 + (finding?.relevance ?? 35) * .25 + (importance[finding?.importance ?? ""] ?? 25) * .2 + recency * .1 + (slope > 0 ? 70 : slope === 0 ? 45 : 20) * .1);
    };
    const market_trends = current.length || previous.length ? [{
      title: "Actividad competitiva observada",
      description: `${current.length} eventos en el periodo actual frente a ${previous.length} en el periodo comparable; señal prospectiva, no probabilidad calibrada.`,
      confidence: clamp(30 + Math.min(40, (current.length + previous.length) * 5) + (slope === 0 ? 5 : 10)),
      evidence_event_ids: evidenceIds,
    }] : [];
    const competitor_forecasts = competitors.flatMap((competitor) => {
      const events = current.filter((event) => event.competitorId === competitor.id);
      if (!events.length) return [];
      const event = events[0];
      return [{
        title: `Señal prospectiva: ${competitor.nombre}`,
        description: `${events.length} eventos persistidos sugieren revisar actividad reciente; no afirma un movimiento futuro.`,
        competitor_id: competitor.legacyId,
        confidence: signalConfidence(event, findingByEvent.get(event.id)),
        evidence_event_ids: events.slice(0, 10).map((item) => item.id),
      }];
    });
    const opportunities = groundedFindings.filter((finding) => finding.opportunity.trim()).slice(0, 10).map((finding) => ({
      title: finding.title,
      description: `${finding.opportunity} Requiere revisión humana; es una señal prospectiva.`,
      competitor_id: competitorMap.get(current.find((event) => event.id === finding.changeEventId)?.competitorId ?? "")?.legacyId ?? null,
      confidence: signalConfidence(current.find((event) => event.id === finding.changeEventId)!, finding),
      evidence_event_ids: [finding.changeEventId!],
    }));
    const threats = groundedFindings.filter((finding) => finding.risk.trim()).slice(0, 10).map((finding) => ({
      title: finding.title,
      description: `${finding.risk} Requiere revisión humana; es una señal prospectiva.`,
      competitor_id: competitorMap.get(current.find((event) => event.id === finding.changeEventId)?.competitorId ?? "")?.legacyId ?? null,
      confidence: signalConfidence(current.find((event) => event.id === finding.changeEventId)!, finding),
      evidence_event_ids: [finding.changeEventId!],
    }));
    const scenarios = buildPredictiveScenarios(evidenceIds);
    const predictive_alerts = [...threats, ...competitor_forecasts.filter((item) => item.confidence >= 60)].slice(0, 8).map((item) => ({
      ...item,
      description: `Sugerencia preventiva: revisar esta señal antes de decidir cualquier acción. ${item.description}`,
    }));
    const successful_runs = runs.filter((run) => run.status === "success").length;
    const groundedEventCount = new Set(groundedFindings.map((finding) => finding.changeEventId)).size;
    return {
      generated_at: now.toISOString(),
      period: { from: from.toISOString(), to: now.toISOString(), days },
      methodology: { label: "Heurística determinista: periodos comparables, pendiente de eventos, confianza/relevancia/importancia de hallazgos y recencia; señales prospectivas no calibradas.", calibration_status: "not_available" as const, limitations },
      market_trends, competitor_forecasts, opportunities, threats, scenarios,
      quality: {
        evidence_coverage_percent: current.length ? clamp(groundedEventCount / current.length * 100) : 0,
        trend_consistency_percent: current.length || previous.length ? clamp(50 + Math.min(50, Math.abs(slope) * 10)) : 0,
        monitored_sources: sources.filter((source) => source.enabled).length,
        successful_runs, labeled_outcomes: 0 as const, calibration_status: "not_available" as const, limitations,
      },
      executive_summary: current.length || previous.length
        ? `${current.length} eventos actuales y ${previous.length} comparables generan señales prospectivas para revisión; no son pronósticos calibrados.`
        : "No hay señales persistidas en los periodos comparables; no se generan pronósticos ni recomendaciones prospectivas.",
      predictive_alerts,
    };
  });
}

export class RadarAssistantEvidenceError extends Error {}

export function buildPredictiveScenarios(eventIds: string[]) {
  if (!eventIds.length) return [];
  return [
    { label: "base" as const, description: "Simulación: la actividad observada continúa al ritmo reciente; no es una afirmación sobre el futuro.", input_event_ids: eventIds },
    { label: "accelerated" as const, description: "Simulación: la actividad aumenta frente al periodo comparable; no es una afirmación sobre el futuro.", input_event_ids: eventIds },
    { label: "quiet" as const, description: "Simulación: la actividad disminuye frente al periodo comparable; no es una afirmación sobre el futuro.", input_event_ids: eventIds },
  ];
}

export async function askRadarAssistant(question: string) {
  const context = await loadAssistantContext();
  if (!context.events.length) {
    return { answer: "No hay evidencia persistida utilizable para responder esta pregunta.", confidence: 0, evidence_event_ids: [], caveat: "No se llamó al modelo porque RadarOH no dispone de eventos persistidos en el contexto reciente." };
  }
  const allowed = new Set(context.events.map((event) => event.id));
  let content: string;
  try {
    const response = await openai.chat.completions.create({
      model: MODEL, max_completion_tokens: 1200, response_format: { type: "json_object" },
      messages: [
        { role: "system", content: "Responde exclusivamente con JSON válido: answer, confidence (0-100), evidence_event_ids, caveat. Usa solo el contexto suministrado. Toda cita debe ser un change event ID exacto del contexto. Si el contexto no sustenta la respuesta, dilo con confidence 0 y un array vacío. No inventes hechos ni probabilidades; incluye una caveat." },
        { role: "user", content: JSON.stringify({ question, context }) },
      ],
    });
    content = response.choices[0]?.message?.content ?? "";
  } catch (error) {
    throw new RadarAssistantEvidenceError(`La asistencia de IA falló: ${error instanceof Error ? error.message : "error desconocido"}`);
  }
  try {
    return validateAssistantOutput(content, allowed);
  } catch {
    throw new RadarAssistantEvidenceError("La asistencia de IA devolvió una respuesta inválida o con evidencia desconocida.");
  }
}

export function validateAssistantOutput(content: string, allowedEventIds: Set<string>) {
  const parsed = JSON.parse(content) as { answer?: unknown; confidence?: unknown; evidence_event_ids?: unknown; caveat?: unknown };
  if (
    typeof parsed.answer !== "string" ||
    typeof parsed.caveat !== "string" ||
    !Array.isArray(parsed.evidence_event_ids) ||
    !parsed.evidence_event_ids.every((id) => typeof id === "string" && allowedEventIds.has(id)) ||
    typeof parsed.confidence !== "number"
  ) throw new Error("respuesta no fundamentada");
  return { answer: parsed.answer, confidence: clamp(parsed.confidence), evidence_event_ids: parsed.evidence_event_ids, caveat: parsed.caveat };
}

async function loadAssistantContext() {
  return withRadarTransaction(async (tx) => {
    const events = await tx.select().from(radarChangeEvents).where(eq(radarChangeEvents.workspaceId, RADAR_WORKSPACE_ID)).orderBy(desc(radarChangeEvents.occurredAt)).limit(30);
    const ids = events.map((event) => event.id);
    const findings = ids.length ? await tx.select().from(radarAiFindings).where(and(eq(radarAiFindings.workspaceId, RADAR_WORKSPACE_ID), inArray(radarAiFindings.changeEventId, ids))).orderBy(desc(radarAiFindings.createdAt)).limit(30) : [];
    const competitors = await tx.select().from(radarCompetitors).where(eq(radarCompetitors.workspaceId, RADAR_WORKSPACE_ID)).limit(100);
    const trendCounts = new Map<string, number>();
    for (const event of events) trendCounts.set(event.changeType, (trendCounts.get(event.changeType) ?? 0) + 1);
    return {
      events: events.map((event) => ({ id: event.id, occurred_at: event.occurredAt.toISOString(), change_type: event.changeType, title: event.title, summary: event.summary, competitor_id: event.competitorId })),
      findings: findings.map((finding) => ({ change_event_id: finding.changeEventId, title: finding.title, summary: finding.summary, relevance: finding.relevance, confidence: finding.confidence, trend: finding.trend })),
      competitors: competitors.map((competitor) => ({ id: competitor.id, name: competitor.nombre, specialty: competitor.especialidad })),
      trends: [...trendCounts.entries()].map(([change_type, count]) => ({ change_type, count })),
    };
  });
}