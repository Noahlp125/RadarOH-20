import { randomUUID } from "node:crypto";
import { and, desc, eq, gte, lte } from "drizzle-orm";
import {
  radarActivityLog,
  radarAiAlerts,
  radarAiFindings,
  radarChangeEvents,
  radarCompetitors,
  radarSources,
  radarAlertPreferences,
} from "@workspace/db";
import { z } from "zod";
import { RADAR_WORKSPACE_ID, withRadarTransaction } from "./repository";

export const executiveFiltersSchema = z.object({
  competitor_id: z.string().trim().max(120).optional(),
  source_id: z.string().trim().max(120).optional(),
  from: z.string().datetime({ offset: true }).optional(),
  to: z.string().datetime({ offset: true }).optional(),
  priority: z.enum(["low", "medium", "high", "critical"]).optional(),
  event_type: z.string().trim().max(80).optional(),
  q: z.string().trim().max(160).optional(),
}).superRefine((value, ctx) => {
  if (value.from && value.to && new Date(value.from) > new Date(value.to)) {
    ctx.addIssue({ code: z.ZodIssueCode.custom, path: ["from"], message: "from debe ser anterior a to" });
  }
  if (value.from && value.to && new Date(value.to).getTime() - new Date(value.from).getTime() > 366 * 86_400_000) {
    ctx.addIssue({ code: z.ZodIssueCode.custom, path: ["to"], message: "El rango máximo es de 366 días" });
  }
});

export type ExecutiveFilters = z.infer<typeof executiveFiltersSchema>;

const importanceWeight: Record<string, number> = { low: 25, medium: 50, high: 75, critical: 100 };
const priorityOptions = ["low", "medium", "high", "critical"];
const normalizePriority = (value?: string | null) =>
  ({ baja: "low", media: "medium", alta: "high" }[value?.toLocaleLowerCase() ?? ""] ?? value ?? "low");

export async function getExecutiveDashboard(filters: ExecutiveFilters = {}) {
  const now = new Date();
  const to = filters.to ? new Date(filters.to) : now;
  const from = filters.from ? new Date(filters.from) : new Date(to.getTime() - 30 * 86_400_000);
  return withRadarTransaction(async (tx) => {
    const competitors = await tx.select().from(radarCompetitors).where(eq(radarCompetitors.workspaceId, RADAR_WORKSPACE_ID));
    const sources = await tx.select().from(radarSources).where(eq(radarSources.workspaceId, RADAR_WORKSPACE_ID));
    const events = await tx.select().from(radarChangeEvents).where(and(
      eq(radarChangeEvents.workspaceId, RADAR_WORKSPACE_ID),
      gte(radarChangeEvents.occurredAt, from),
      lte(radarChangeEvents.occurredAt, to),
    )).orderBy(desc(radarChangeEvents.occurredAt)).limit(5000);
    const findings = await tx.select().from(radarAiFindings).where(and(
      eq(radarAiFindings.workspaceId, RADAR_WORKSPACE_ID),
      gte(radarAiFindings.createdAt, from),
      lte(radarAiFindings.createdAt, to),
    )).orderBy(desc(radarAiFindings.createdAt)).limit(5000);
    const alerts = await tx.select().from(radarAiAlerts).where(eq(radarAiAlerts.workspaceId, RADAR_WORKSPACE_ID)).orderBy(desc(radarAiAlerts.createdAt)).limit(100);
    const activity = await tx.select().from(radarActivityLog).where(eq(radarActivityLog.workspaceId, RADAR_WORKSPACE_ID)).orderBy(desc(radarActivityLog.createdAt)).limit(25);
    const competitorMap = new Map(competitors.map((item) => [item.id, item]));
    const sourceMap = new Map(sources.map((item) => [item.id, item]));
    const findingByEvent = new Map(findings.filter((item) => item.changeEventId).map((item) => [item.changeEventId!, item]));
    const visibleEvents = events.filter((event) => {
      const competitor = event.competitorId ? competitorMap.get(event.competitorId) : undefined;
      const source = sourceMap.get(event.sourceId);
      const finding = findingByEvent.get(event.id);
      if (filters.competitor_id && competitor?.legacyId !== filters.competitor_id) return false;
      if (filters.source_id && source?.legacyId !== filters.source_id) return false;
      if (filters.priority && normalizePriority(competitor?.prioridad ?? "medium") !== filters.priority) return false;
      if (filters.event_type && (finding?.eventType ?? event.changeType) !== filters.event_type) return false;
      if (filters.q) {
        const haystack = [
          event.title, event.summary, event.url, competitor?.nombre, source?.termino,
          finding?.title, finding?.summary,
        ].filter(Boolean).join(" ").toLocaleLowerCase();
        if (!haystack.includes(filters.q.toLocaleLowerCase())) return false;
      }
      return true;
    });
    const compare = buildCompetitorComparison(visibleEvents, competitorMap, findingByEvent);
    const timeline = buildTimeline(visibleEvents, findingByEvent);
    const importance = buildImportance(visibleEvents, competitorMap, findingByEvent);
    const types = buildTypes(visibleEvents, findingByEvent);
    const radar = compare.map((item) => ({
      competitor_id: item.competitor_id,
      name: item.name,
      activity: item.activity,
      relevance: item.relevance,
      changes: item.changes,
      importance: item.importance,
      priority: item.priority,
    }));
    const topFindings = findings
      .filter((finding) => visibleEvents.some((event) => event.id === finding.changeEventId))
      .slice(0, 12)
      .map(mapFinding);
    const previousStart = new Date(from.getTime() - (to.getTime() - from.getTime()));
    const previousEvents = await tx.select().from(radarChangeEvents).where(and(
      eq(radarChangeEvents.workspaceId, RADAR_WORKSPACE_ID),
      gte(radarChangeEvents.occurredAt, previousStart),
      lte(radarChangeEvents.occurredAt, from),
    )).limit(5000);
    const trends = buildTrends(visibleEvents, previousEvents, findingByEvent);
    const unreadAlerts = alerts.filter((alert) => alert.status === "unread").length;
    const highPriority = visibleEvents.filter((event) => {
      const finding = findingByEvent.get(event.id);
      return ["high", "critical"].includes(
        finding?.importance ??
          normalizePriority(event.competitorId ? competitorMap.get(event.competitorId)?.prioridad : undefined) ??
          "low",
      );
    }).length;
    const avgRelevance = topFindings.length
      ? Math.round(topFindings.reduce((sum, item) => sum + item.relevance, 0) / topFindings.length)
      : visibleEvents.length ? 50 : 0;
    const healthySources = sources.filter((source) => source.enabled && source.lastStatus !== "error").length;
    const activeCompetitors = new Set(visibleEvents.map((event) => event.competitorId).filter(Boolean)).size;
    return {
      generated_at: now.toISOString(),
      period: { from: from.toISOString(), to: to.toISOString() },
      filters: {
        competitors: competitors.map((item) => ({ id: item.legacyId, name: item.nombre })),
        sources: sources.map((item) => ({ id: item.legacyId, name: item.termino })),
        priorities: priorityOptions,
        event_types: [...new Set([...types.map((item) => item.type), ...findings.map((item) => item.eventType)])].sort(),
      },
      kpis: {
        total_events: visibleEvents.length,
        high_priority_events: highPriority,
        active_competitors: activeCompetitors,
        source_health_percent: sources.length ? Math.round((healthySources / sources.length) * 100) : 0,
        average_relevance: avgRelevance,
        unread_alerts: unreadAlerts,
      },
      by_importance: importance,
      by_type: types,
      timeline,
      trends,
      competitor_compare: compare,
      radar_points: radar,
      findings: topFindings,
      alerts: alerts.slice(0, 10).map((alert) => ({
        id: alert.id,
        title: alert.title,
        importance: alert.importance,
        status: alert.status,
        created_at: alert.createdAt.toISOString(),
      })),
      activity: activity.map((item) => ({
        id: item.id,
        action: item.action,
        entity_type: item.entityType,
        entity_id: item.entityId,
        metadata: item.metadata,
        created_at: item.createdAt.toISOString(),
      })),
      report: {
        title: "Informe ejecutivo de inteligencia competitiva",
        highlights: [
          `${visibleEvents.length} señales en el periodo seleccionado`,
          `${highPriority} señales de prioridad alta o crítica`,
          `${unreadAlerts} alertas internas sin leer`,
        ],
      },
    };
  });
}

export async function searchRadar(query: string) {
  const q = query.trim().toLocaleLowerCase();
  if (q.length < 2) return { query, results: [] };
  return withRadarTransaction(async (tx) => {
    const competitors = await tx.select().from(radarCompetitors).where(eq(radarCompetitors.workspaceId, RADAR_WORKSPACE_ID)).limit(500);
    const sources = await tx.select().from(radarSources).where(eq(radarSources.workspaceId, RADAR_WORKSPACE_ID)).limit(500);
    const events = await tx.select().from(radarChangeEvents).where(eq(radarChangeEvents.workspaceId, RADAR_WORKSPACE_ID)).orderBy(desc(radarChangeEvents.occurredAt)).limit(1000);
    const findings = await tx.select().from(radarAiFindings).where(eq(radarAiFindings.workspaceId, RADAR_WORKSPACE_ID)).orderBy(desc(radarAiFindings.createdAt)).limit(500);
    const results = [
      ...competitors.filter((item) => [item.nombre, item.ubicacion, item.especialidad, item.notas].join(" ").toLocaleLowerCase().includes(q)).map((item) => ({ type: "competitor", id: item.legacyId, title: item.nombre, detail: item.especialidad || item.ubicacion })),
      ...sources.filter((item) => [item.termino, item.notas, item.endpointUrl].join(" ").toLocaleLowerCase().includes(q)).map((item) => ({ type: "source", id: item.legacyId, title: item.termino, detail: item.tipo })),
      ...events.filter((item) => [item.title, item.summary, item.url].join(" ").toLocaleLowerCase().includes(q)).map((item) => ({ type: "event", id: item.id, title: item.title || item.changeType, detail: item.summary || item.url, created_at: item.occurredAt.toISOString() })),
      ...findings.filter((item) => [item.title, item.summary, item.opportunity, item.risk].join(" ").toLocaleLowerCase().includes(q)).map((item) => ({ type: "insight", id: item.id, title: item.title, detail: item.summary, importance: item.importance })),
    ];
    return { query, results: results.slice(0, 50) };
  });
}

export async function getAlertPreferences() {
  return withRadarTransaction(async (tx) => {
    const [existing] = await tx.select().from(radarAlertPreferences).where(eq(radarAlertPreferences.workspaceId, RADAR_WORKSPACE_ID)).limit(1);
    if (existing) return mapPreferences(existing);
    const [created] = await tx.insert(radarAlertPreferences).values({ workspaceId: RADAR_WORKSPACE_ID }).returning();
    return mapPreferences(created);
  });
}

export async function updateAlertPreferences(input: {
  enabled?: boolean;
  minimum_importance?: string;
  minimum_relevance?: number;
  minimum_confidence?: number;
  internal_enabled?: boolean;
}) {
  return withRadarTransaction(async (tx) => {
    const [current] = await tx.select().from(radarAlertPreferences).where(eq(radarAlertPreferences.workspaceId, RADAR_WORKSPACE_ID)).limit(1);
    const values = {
      enabled: input.enabled ?? current?.enabled ?? true,
      minimumImportance: input.minimum_importance ?? current?.minimumImportance ?? "high",
      minimumRelevance: input.minimum_relevance ?? current?.minimumRelevance ?? 70,
      minimumConfidence: input.minimum_confidence ?? current?.minimumConfidence ?? 60,
      internalEnabled: input.internal_enabled ?? current?.internalEnabled ?? true,
      updatedAt: new Date(),
    };
    const [updated] = current
      ? await tx.update(radarAlertPreferences).set(values).where(eq(radarAlertPreferences.workspaceId, RADAR_WORKSPACE_ID)).returning()
      : await tx.insert(radarAlertPreferences).values({ workspaceId: RADAR_WORKSPACE_ID, ...values }).returning();
    return mapPreferences(updated);
  });
}

export async function exportExecutiveCsv(filters: ExecutiveFilters) {
  const dashboard = await getExecutiveDashboard(filters);
  const rows = [
    ["competidor", "actividad", "relevancia", "cambios", "prioridad"],
    ...dashboard.competitor_compare.map((row) => [row.name, row.activity, row.relevance, row.changes, row.priority]),
  ];
  return rows.map((row) => row.map((value) => `"${String(value ?? "").replaceAll("\"", "\"\"")}"`).join(",")).join("\n");
}

export async function recordRadarActivity(action: string, entityType: string, entityId?: string, metadata: Record<string, unknown> = {}) {
  await withRadarTransaction((tx) => tx.insert(radarActivityLog).values({
    id: randomUUID(),
    workspaceId: RADAR_WORKSPACE_ID,
    action,
    entityType,
    entityId,
    metadata,
  }));
}

function buildCompetitorComparison(events: typeof radarChangeEvents.$inferSelect[], competitors: Map<string, typeof radarCompetitors.$inferSelect>, findings: Map<string, typeof radarAiFindings.$inferSelect>) {
  const rows = [...competitors.values()].map((competitor) => {
    const related = events.filter((event) => event.competitorId === competitor.id);
    const findingRows = related.map((event) => findings.get(event.id)).filter(Boolean) as (typeof radarAiFindings.$inferSelect)[];
    const relevance = findingRows.length ? Math.round(findingRows.reduce((sum, item) => sum + item.relevance, 0) / findingRows.length) : related.length ? 50 : 0;
    const importance = findingRows.length ? Math.round(findingRows.reduce((sum, item) => sum + (importanceWeight[item.importance] ?? 50), 0) / findingRows.length) : 25;
    return {
      competitor_id: competitor.legacyId,
      name: competitor.nombre,
      activity: Math.min(100, related.length * 12),
      relevance,
      changes: related.length,
      high_priority: findingRows.filter((item) => ["high", "critical"].includes(item.importance)).length,
      importance,
      priority: normalizePriority(competitor.prioridad),
      last_event_at: related[0]?.occurredAt.toISOString() ?? null,
    };
  });
  return rows.filter((item) => item.changes > 0).sort((a, b) => b.activity - a.activity);
}

function buildTimeline(events: typeof radarChangeEvents.$inferSelect[], findings: Map<string, typeof radarAiFindings.$inferSelect>) {
  const map = new Map<string, { date: string; events: number; high_priority: number; competitors: number }>();
  for (const event of events) {
    const date = event.occurredAt.toISOString().slice(0, 10);
    const row = map.get(date) ?? { date, events: 0, high_priority: 0, competitors: 0 };
    row.events += 1;
    if (["high", "critical"].includes(findings.get(event.id)?.importance ?? "")) row.high_priority += 1;
    row.competitors += event.competitorId ? 1 : 0;
    map.set(date, row);
  }
  return [...map.values()].sort((a, b) => a.date.localeCompare(b.date));
}

function buildImportance(events: typeof radarChangeEvents.$inferSelect[], competitors: Map<string, typeof radarCompetitors.$inferSelect>, findings: Map<string, typeof radarAiFindings.$inferSelect>) {
  const counts = new Map(priorityOptions.map((value) => [value, 0]));
  for (const event of events) {
    const key = findings.get(event.id)?.importance ?? normalizePriority(event.competitorId ? competitors.get(event.competitorId)?.prioridad : "low");
    counts.set(key, (counts.get(key) ?? 0) + 1);
  }
  return priorityOptions.map((label) => ({ label, count: counts.get(label) ?? 0 }));
}

function buildTypes(events: typeof radarChangeEvents.$inferSelect[], findings: Map<string, typeof radarAiFindings.$inferSelect>) {
  const counts = new Map<string, number>();
  for (const event of events) {
    const type = findings.get(event.id)?.eventType ?? event.changeType;
    counts.set(type, (counts.get(type) ?? 0) + 1);
  }
  return [...counts.entries()].map(([type, count]) => ({ type, count })).sort((a, b) => b.count - a.count);
}

function buildTrends(current: typeof radarChangeEvents.$inferSelect[], previous: typeof radarChangeEvents.$inferSelect[], findings: Map<string, typeof radarAiFindings.$inferSelect>) {
  const delta = current.length - previous.length;
  const direction = delta > 0 ? "growing" : delta < 0 ? "declining" : "stable";
  return [{
    name: "Actividad competitiva",
    direction,
    current: current.length,
    previous: previous.length,
    delta,
    confidence: current.length || previous.length ? 80 : 0,
    description: delta === 0 ? "La actividad se mantiene estable frente al periodo anterior." : `${Math.abs(delta)} señales ${delta > 0 ? "más" : "menos"} que en el periodo anterior.`,
  }, ...buildTypes(current, findings).slice(0, 3).map((item) => ({
    name: item.type,
    direction: "emerging",
    current: item.count,
    previous: 0,
    delta: item.count,
    confidence: 60,
    description: `${item.count} señales clasificadas como ${item.type}.`,
  }))];
}

function mapFinding(item: typeof radarAiFindings.$inferSelect) {
  return {
    id: item.id,
    title: item.title,
    summary: item.summary,
    importance: item.importance,
    relevance: item.relevance,
    confidence: item.confidence,
    event_type: item.eventType,
    opportunity: item.opportunity,
    risk: item.risk,
    trend: item.trend,
    evidence_ids: Array.isArray(item.evidenceIds) ? item.evidenceIds : [],
  };
}

function mapPreferences(item: typeof radarAlertPreferences.$inferSelect) {
  return {
    enabled: item.enabled,
    minimum_importance: item.minimumImportance,
    minimum_relevance: item.minimumRelevance,
    minimum_confidence: item.minimumConfidence,
    internal_enabled: item.internalEnabled,
    channels: Array.isArray(item.channels) ? item.channels : ["internal"],
    updated_at: item.updatedAt.toISOString(),
  };
}