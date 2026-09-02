import { and, desc, eq, gte, lte } from "drizzle-orm";
import {
  radarAiAlerts,
  radarAiAnalyses,
  radarAiFindings,
  radarChangeEvents,
  radarCompetitors,
  radarMonitorRuns,
  radarSources,
} from "@workspace/db";
import { z } from "zod";
import { RADAR_WORKSPACE_ID, withRadarTransaction } from "./repository";
import { buildHistoricalTrends, intelligenceQuerySchema } from "./intelligence-helpers";

export { buildHistoricalTrends, intelligenceQuerySchema };

const DAY_MS = 86_400_000;
const importanceValue: Record<string, number> = { low: 25, medium: 50, high: 75, critical: 100 };

type EventRow = typeof radarChangeEvents.$inferSelect;
type FindingRow = typeof radarAiFindings.$inferSelect;
type CompetitorRow = typeof radarCompetitors.$inferSelect;

const clamp = (value: number) => Math.round(Math.max(0, Math.min(100, value)));
const rounded = (value: number) => Math.round(value * 100) / 100;

export function buildScorecards(
  competitors: CompetitorRow[],
  currentEvents: EventRow[],
  previousEvents: EventRow[],
  findingsByEvent: Map<string, FindingRow>,
  now: Date,
  days: number,
) {
  const counts = new Map<string, number>();
  for (const event of currentEvents) {
    if (event.competitorId) counts.set(event.competitorId, (counts.get(event.competitorId) ?? 0) + 1);
  }
  const maxCount = Math.max(1, ...counts.values());
  return competitors.map((competitor) => {
    const events = currentEvents.filter((event) => event.competitorId === competitor.id);
    const previousCount = previousEvents.filter((event) => event.competitorId === competitor.id).length;
    const findings = events.map((event) => findingsByEvent.get(event.id)).filter(Boolean) as FindingRow[];
    const activityRaw = (events.length / maxCount) * 100;
    const momentumRaw = events.length === 0 ? 0 : previousCount === 0 ? 100 : clamp(50 + ((events.length - previousCount) / previousCount) * 50);
    const importanceRaw = findings.length
      ? findings.reduce((sum, finding) => sum + (importanceValue[finding.importance] ?? 50), 0) / findings.length
      : 0;
    const relevanceRaw = findings.length
      ? findings.reduce((sum, finding) => sum + finding.relevance, 0) / findings.length
      : 0;
    const lastEvent = events.sort((a, b) => b.occurredAt.getTime() - a.occurredAt.getTime())[0];
    const ageDays = lastEvent ? Math.max(0, (now.getTime() - lastEvent.occurredAt.getTime()) / DAY_MS) : days;
    const recencyRaw = lastEvent ? clamp(100 * (1 - Math.min(ageDays, days) / days)) : 0;
    const breakdown = {
      activity: rounded(activityRaw),
      momentum: rounded(momentumRaw),
      importance: rounded(importanceRaw),
      relevance: rounded(relevanceRaw),
      recency: rounded(recencyRaw),
    };
    const score = clamp(
      breakdown.activity * 0.25 +
      breakdown.momentum * 0.2 +
      breakdown.importance * 0.2 +
      breakdown.relevance * 0.2 +
      breakdown.recency * 0.15,
    );
    return {
      competitor_id: competitor.legacyId,
      name: competitor.nombre,
      score,
      band: score >= 75 ? "high" : score >= 50 ? "medium" : score > 0 ? "low" : "no_signal",
      signal_count: events.length,
      last_event_at: lastEvent?.occurredAt.toISOString() ?? null,
      breakdown,
    };
  }).sort((a, b) => b.score - a.score || b.signal_count - a.signal_count || a.name.localeCompare(b.name));
}

export async function getRadarIntelligence(input: z.infer<typeof intelligenceQuerySchema>) {
  const now = new Date();
  const to = now;
  const from = new Date(to.getTime() - input.days * DAY_MS);
  const previousFrom = new Date(from.getTime() - input.days * DAY_MS);
  return withRadarTransaction(async (tx) => {
    const competitors = await tx.select().from(radarCompetitors).where(eq(radarCompetitors.workspaceId, RADAR_WORKSPACE_ID));
    const sources = await tx.select().from(radarSources).where(eq(radarSources.workspaceId, RADAR_WORKSPACE_ID));
    const currentEvents = await tx.select().from(radarChangeEvents).where(and(eq(radarChangeEvents.workspaceId, RADAR_WORKSPACE_ID), gte(radarChangeEvents.occurredAt, from), lte(radarChangeEvents.occurredAt, to))).orderBy(desc(radarChangeEvents.occurredAt)).limit(5000);
    const previousEvents = await tx.select().from(radarChangeEvents).where(and(eq(radarChangeEvents.workspaceId, RADAR_WORKSPACE_ID), gte(radarChangeEvents.occurredAt, previousFrom), lte(radarChangeEvents.occurredAt, from))).orderBy(desc(radarChangeEvents.occurredAt)).limit(5000);
    const allFindings = await tx.select().from(radarAiFindings).where(and(eq(radarAiFindings.workspaceId, RADAR_WORKSPACE_ID), gte(radarAiFindings.createdAt, previousFrom), lte(radarAiFindings.createdAt, to))).orderBy(desc(radarAiFindings.createdAt)).limit(5000);
    const runs = await tx.select().from(radarMonitorRuns).where(and(eq(radarMonitorRuns.workspaceId, RADAR_WORKSPACE_ID), gte(radarMonitorRuns.startedAt, from), lte(radarMonitorRuns.startedAt, to))).orderBy(desc(radarMonitorRuns.startedAt)).limit(2000);
    const analyses = await tx.select().from(radarAiAnalyses).where(and(eq(radarAiAnalyses.workspaceId, RADAR_WORKSPACE_ID), gte(radarAiAnalyses.startedAt, from), lte(radarAiAnalyses.startedAt, to))).orderBy(desc(radarAiAnalyses.startedAt)).limit(500);
    const alerts = await tx.select().from(radarAiAlerts).where(and(eq(radarAiAlerts.workspaceId, RADAR_WORKSPACE_ID), gte(radarAiAlerts.createdAt, from), lte(radarAiAlerts.createdAt, to))).orderBy(desc(radarAiAlerts.createdAt)).limit(500);
    const findings = allFindings.filter((finding) => finding.createdAt >= from);
    const findingsByEvent = new Map(allFindings.filter((finding) => finding.changeEventId).map((finding) => [finding.changeEventId!, finding]));
    const competitorLegacyIds = new Map(competitors.map((competitor) => [competitor.id, competitor.legacyId]));
    const scorecards = buildScorecards(competitors, currentEvents, previousEvents, findingsByEvent, now, input.days);
    const trends = buildHistoricalTrends(currentEvents, previousEvents, findingsByEvent);
    const currentIds = new Set(currentEvents.map((event) => event.id));
    const actionable = findings.filter((finding) => ["high", "critical"].includes(finding.importance) && finding.changeEventId && currentIds.has(finding.changeEventId));
    const recommendations = actionable.slice(0, 8).map((finding) => ({
      id: `recommendation:${finding.id}`,
      title: finding.title,
      priority: ["low", "medium", "high", "critical"].includes(finding.importance) ? finding.importance as "low" | "medium" | "high" | "critical" : "high" as const,
      action: "Revisar la evidencia y decidir si corresponde una respuesta operativa.",
      reason: finding.summary || finding.rationale,
      competitor_id: competitorLegacyIds.get(currentEvents.find((event) => event.id === finding.changeEventId)?.competitorId ?? "") ?? null,
      confidence: clamp(finding.confidence),
      evidence_event_ids: [finding.changeEventId!],
      status: "review_required" as const,
    }));
    const opportunities = actionable.filter((finding) => Boolean(finding.opportunity)).slice(0, 6).map((finding) => ({
      title: finding.title,
      description: finding.opportunity,
      competitor_id: competitorLegacyIds.get(currentEvents.find((event) => event.id === finding.changeEventId)?.competitorId ?? "") ?? null,
      score: clamp((importanceValue[finding.importance] ?? 50) * 0.5 + finding.relevance * 0.3 + finding.confidence * 0.2),
      evidence_event_ids: [finding.changeEventId!],
    }));
    const successfulRuns = runs.filter((run) => run.status === "success");
    const durations = successfulRuns.map((run) => run.durationMs).filter((value): value is number => value !== null);
    const groundedFindings = findings.filter((finding) => finding.changeEventId && currentIds.has(finding.changeEventId)).length;
    const highMomentum = scorecards.filter((scorecard) => scorecard.breakdown.momentum >= 15).length;
    return {
      generated_at: now.toISOString(),
      period: { from: from.toISOString(), to: to.toISOString(), days: input.days },
      methodology: { label: "Scoring histórico determinista basado en evidencia", limitations: ["Los scores utilizan únicamente registros persistidos en RadarOH.", "Las tendencias son señales históricas adelantadas, no pronósticos calibrados."] },
      scorecards,
      trends,
      recommendations,
      opportunities,
      quality: {
        monitoring: { runs: runs.length, success_rate: runs.length ? rounded(successfulRuns.length / runs.length * 100) : 0, average_latency_ms: durations.length ? rounded(durations.reduce((sum, value) => sum + value, 0) / durations.length) : 0, sources_with_errors: sources.filter((source) => source.lastStatus === "error" || Boolean(source.lastError)).length },
        ai: { analyses: analyses.length, completed: analyses.filter((analysis) => analysis.status === "completed").length, findings: findings.length, grounded_findings: groundedFindings },
        alerts: { total: alerts.length, unread: alerts.filter((alert) => alert.status === "unread").length, read_rate: alerts.length ? rounded(alerts.filter((alert) => alert.status !== "unread").length / alerts.length * 100) : 0 },
      },
      report: {
        title: `Informe automático de señales · ${input.days} días`,
        summary: `${currentEvents.length} señales actuales en ${scorecards.filter((scorecard) => scorecard.signal_count > 0).length} competidores; ${actionable.length} hallazgos respaldados de prioridad alta o crítica y ${highMomentum} competidores con momentum positivo.`,
        generated_at: now.toISOString(),
      },
    };
  });
}