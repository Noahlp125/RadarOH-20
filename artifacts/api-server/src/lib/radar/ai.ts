import { randomUUID } from "node:crypto";
import { and, desc, eq, inArray } from "drizzle-orm";
import {
  radarAiAlerts,
  radarAiAnalyses,
  radarAiFindings,
  radarChangeEvents,
  radarCompetitors,
  radarMonitorEvidence,
  radarSources,
} from "@workspace/db";
import { openai } from "@workspace/integrations-openai-ai-server";
import { z } from "zod";
import { logger } from "../logger";
import { RADAR_WORKSPACE_ID, withRadarTransaction } from "./repository";

const MODEL = "gpt-5.6-terra";
const AI_INTERVAL_MS = 5 * 60_000;
let aiScheduler: NodeJS.Timeout | null = null;
let analysisRunning = false;

const suggestedUpdateSchema = z.object({
  competitor_id: z.string(),
  field: z.enum(["ubicacion", "especialidad", "rango_precio", "web", "redes", "fortalezas", "debilidades", "notas"]),
  value: z.string().min(1).max(1500),
  evidence_ids: z.array(z.string()).min(1),
});

const aiOutputSchema = z.object({
  summary: z.string().min(1).max(5000),
  trends: z.array(z.object({
    name: z.string().min(1).max(255),
    direction: z.enum(["emerging", "growing", "stable", "declining"]),
    description: z.string().min(1).max(1500),
    confidence: z.number().int().min(0).max(100),
    evidence_ids: z.array(z.string()).min(1),
  })).max(12),
  findings: z.array(z.object({
    change_event_id: z.string(),
    event_type: z.enum(["launch", "pricing", "content", "reputation", "expansion", "technology", "regulatory", "market", "other"]),
    importance: z.enum(["low", "medium", "high", "critical"]),
    relevance: z.number().int().min(0).max(100),
    confidence: z.number().int().min(0).max(100),
    title: z.string().min(1).max(255),
    summary: z.string().min(1).max(2000),
    rationale: z.string().min(1).max(2000),
    opportunity: z.string().max(1500).default(""),
    risk: z.string().max(1500).default(""),
    trend: z.string().max(500).default(""),
    evidence_ids: z.array(z.string()).min(1),
    suggested_updates: z.array(suggestedUpdateSchema).max(8).default([]),
    alert: z.boolean().default(false),
  })).max(50),
});

export class NoEvidenceForAnalysisError extends Error {}
export class AiAnalysisNotFoundError extends Error {}

type AnalysisTrigger = "manual" | "scheduler";

export async function runRadarAiAnalysis(options: {
  trigger: AnalysisTrigger;
  limit?: number;
  sourceLegacyId?: string;
}) {
  if (analysisRunning) throw new Error("Ya hay un análisis de IA en curso.");
  analysisRunning = true;
  const analysisId = randomUUID();
  const startedAt = new Date();
  try {
    const evidence = await loadUnanalyzedEvidence(options.limit ?? 25, options.sourceLegacyId);
    if (!evidence.length) {
      throw new NoEvidenceForAnalysisError("No hay evidencias nuevas pendientes de análisis.");
    }
    await withRadarTransaction((tx) =>
      tx.insert(radarAiAnalyses).values({
        id: analysisId,
        workspaceId: RADAR_WORKSPACE_ID,
        trigger: options.trigger,
        model: MODEL,
        status: "running",
        sourceEvidenceCount: evidence.length,
        eventCount: evidence.length,
        startedAt,
      }),
    );
    logger.info({ analysisId, evidenceCount: evidence.length, model: MODEL }, "RadarOH AI analysis started");
    const result = await requestAnalysis(evidence);
    const allowedEvidenceIds = new Set(evidence.map((item) => item.evidence_id));
    const allowedEventIds = new Set(evidence.map((item) => item.change_event_id));
    const validFindings = result.findings.filter(
      (finding) =>
        allowedEventIds.has(finding.change_event_id) &&
        finding.evidence_ids.length > 0 &&
        finding.evidence_ids.every((id) => allowedEvidenceIds.has(id)),
    );
    const validTrends = result.trends.filter(
      (trend) => trend.evidence_ids.every((id) => allowedEvidenceIds.has(id)),
    );
    const mapped = await persistAnalysis(
      analysisId,
      result.summary,
      validTrends,
      validFindings,
      evidence,
    );
    logger.info({ analysisId, findings: validFindings.length, trends: validTrends.length }, "RadarOH AI analysis completed");
    return mapped;
  } catch (error) {
    if (!(error instanceof NoEvidenceForAnalysisError)) {
      await markAnalysisFailed(analysisId, startedAt, error);
      logger.error({ err: error, analysisId }, "RadarOH AI analysis failed");
    }
    throw error;
  } finally {
    analysisRunning = false;
  }
}

export async function getRadarAiStatus() {
  const analyses = await listRadarAiAnalyses(1);
  const alerts = await listRadarAiAlerts();
  return {
    latest_analysis: analyses[0] ?? null,
    unread_alerts: alerts.filter((alert) => alert.status === "unread").length,
    recent_alerts: alerts.slice(0, 10),
  };
}

export async function listRadarAiAnalyses(limit = 20) {
  return withRadarTransaction(async (tx) => {
    const analyses = await tx
      .select()
      .from(radarAiAnalyses)
      .where(eq(radarAiAnalyses.workspaceId, RADAR_WORKSPACE_ID))
      .orderBy(desc(radarAiAnalyses.startedAt))
      .limit(limit);
    const ids = analyses.map((analysis) => analysis.id);
    const findings = ids.length
      ? await tx
          .select()
          .from(radarAiFindings)
          .where(and(
            eq(radarAiFindings.workspaceId, RADAR_WORKSPACE_ID),
            inArray(radarAiFindings.analysisId, ids),
          ))
          .orderBy(desc(radarAiFindings.createdAt))
      : [];
    return analyses.map((analysis) => mapAnalysis(
      analysis,
      findings.filter((finding) => finding.analysisId === analysis.id),
    ));
  });
}

export async function listRadarAiAlerts() {
  return withRadarTransaction(async (tx) => {
    const alerts = await tx
      .select()
      .from(radarAiAlerts)
      .where(eq(radarAiAlerts.workspaceId, RADAR_WORKSPACE_ID))
      .orderBy(desc(radarAiAlerts.createdAt))
      .limit(100);
    const competitors = await tx
      .select()
      .from(radarCompetitors)
      .where(eq(radarCompetitors.workspaceId, RADAR_WORKSPACE_ID));
    const map = new Map(competitors.map((competitor) => [competitor.id, competitor]));
    return alerts.map((alert) => mapAlert(alert, map));
  });
}

export async function updateRadarAiAlert(id: string, status: "read" | "unread") {
  return withRadarTransaction(async (tx) => {
    const [alert] = await tx
      .update(radarAiAlerts)
      .set({ status, readAt: status === "read" ? new Date() : null })
      .where(and(eq(radarAiAlerts.workspaceId, RADAR_WORKSPACE_ID), eq(radarAiAlerts.id, id)))
      .returning();
    if (!alert) throw new AiAnalysisNotFoundError("Alerta no encontrada.");
    const competitors = await tx
      .select()
      .from(radarCompetitors)
      .where(eq(radarCompetitors.workspaceId, RADAR_WORKSPACE_ID));
    return mapAlert(alert, new Map(competitors.map((competitor) => [competitor.id, competitor])));
  });
}

export function startRadarAiScheduler() {
  if (aiScheduler) return;
  const tick = async () => {
    if (analysisRunning) return;
    try {
      await runRadarAiAnalysis({ trigger: "scheduler", limit: 25 });
    } catch (error) {
      if (!(error instanceof NoEvidenceForAnalysisError)) {
        logger.error({ err: error }, "RadarOH scheduled AI analysis failed");
      }
    }
  };
  aiScheduler = setInterval(() => void tick(), AI_INTERVAL_MS);
  logger.info({ intervalMs: AI_INTERVAL_MS, model: MODEL }, "RadarOH AI scheduler started");
}

async function loadUnanalyzedEvidence(limit: number, sourceLegacyId?: string) {
  const safeLimit = Math.max(1, Math.min(50, Math.floor(limit)));
  return withRadarTransaction(async (tx) => {
    const sources = await tx
      .select()
      .from(radarSources)
      .where(eq(radarSources.workspaceId, RADAR_WORKSPACE_ID));
    const selectedSource = sourceLegacyId
      ? sources.find((source) => source.legacyId === sourceLegacyId)
      : undefined;
    if (sourceLegacyId && !selectedSource) throw new NoEvidenceForAnalysisError("Fuente no encontrada.");
    const events = await tx
      .select()
      .from(radarChangeEvents)
      .where(selectedSource
        ? and(
            eq(radarChangeEvents.workspaceId, RADAR_WORKSPACE_ID),
            eq(radarChangeEvents.sourceId, selectedSource.id),
          )
        : eq(radarChangeEvents.workspaceId, RADAR_WORKSPACE_ID))
      .orderBy(desc(radarChangeEvents.occurredAt))
      .limit(safeLimit * 2);
    const eventIds = events.map((event) => event.id);
    const existing = eventIds.length
      ? await tx
          .select({ changeEventId: radarAiFindings.changeEventId })
          .from(radarAiFindings)
          .where(and(
            eq(radarAiFindings.workspaceId, RADAR_WORKSPACE_ID),
            inArray(radarAiFindings.changeEventId, eventIds),
          ))
      : [];
    const analyzed = new Set(existing.map((row) => row.changeEventId).filter(Boolean));
    const pending = events.filter((event) => !analyzed.has(event.id)).slice(0, safeLimit);
    const competitors = await tx
      .select()
      .from(radarCompetitors)
      .where(eq(radarCompetitors.workspaceId, RADAR_WORKSPACE_ID));
    const sourceMap = new Map(sources.map((source) => [source.id, source]));
    const competitorMap = new Map(competitors.map((competitor) => [competitor.id, competitor]));
    const output = [];
    for (const event of pending) {
      const [evidence] = await tx
        .select()
        .from(radarMonitorEvidence)
        .where(and(
          eq(radarMonitorEvidence.workspaceId, RADAR_WORKSPACE_ID),
          eq(radarMonitorEvidence.id, event.evidenceId),
        ))
        .limit(1);
      if (!evidence) continue;
      const source = sourceMap.get(event.sourceId);
      const competitor = event.competitorId ? competitorMap.get(event.competitorId) : undefined;
      output.push({
        change_event_id: event.id,
        evidence_id: evidence.id,
        source_id: source?.legacyId ?? event.sourceId,
        source_label: source?.termino ?? "Fuente",
        competitor_id: competitor?.legacyId ?? null,
        competitor_name: competitor?.nombre ?? null,
        change_type: event.changeType,
        title: evidence.title,
        url: evidence.url,
        published_at: evidence.publishedAt?.toISOString() ?? null,
        observed_at: evidence.observedAt.toISOString(),
        normalized_text: evidence.normalizedText.slice(0, 12_000),
        raw_payload: evidence.rawPayload,
      });
    }
    return output;
  });
}

async function requestAnalysis(evidence: Awaited<ReturnType<typeof loadUnanalyzedEvidence>>) {
  let lastError: unknown;
  for (let attempt = 1; attempt <= 3; attempt += 1) {
    try {
      const response = await openai.chat.completions.create({
        model: MODEL,
        max_completion_tokens: 8192,
        response_format: { type: "json_object" },
        messages: [
          {
            role: "system",
            content: [
              "Eres el analista competitivo de RadarOH para OH Casas.",
              "Usa EXCLUSIVAMENTE las evidencias JSON suministradas. No uses conocimiento externo ni completes huecos.",
              "Toda afirmación debe estar respaldada por evidence_ids exactos del input.",
              "Si una evidencia es ambigua, reduce confidence y explica la limitación.",
              "No sugieras actualizar una ficha salvo que el valor aparezca explícitamente en la evidencia.",
              "Devuelve solo JSON válido con: summary, trends y findings.",
              "Cada finding: change_event_id, event_type, importance, relevance 0-100, confidence 0-100, title, summary, rationale, opportunity, risk, trend, evidence_ids, suggested_updates, alert.",
              "Tipos: launch, pricing, content, reputation, expansion, technology, regulatory, market, other.",
              "Importancia: low, medium, high, critical.",
              "Cada trend: name, direction (emerging|growing|stable|declining), description, confidence, evidence_ids.",
              "Cada suggested_update: competitor_id, field, value, evidence_ids.",
            ].join("\n"),
          },
          {
            role: "user",
            content: JSON.stringify({ evidence }),
          },
        ],
      });
      const content = response.choices[0]?.message?.content;
      if (!content) throw new Error("La IA no devolvió contenido.");
      return aiOutputSchema.parse(JSON.parse(content));
    } catch (error) {
      lastError = error;
      if (attempt < 3) await new Promise((resolve) => setTimeout(resolve, 500 * 2 ** (attempt - 1)));
    }
  }
  throw lastError;
}

async function persistAnalysis(
  analysisId: string,
  summary: string,
  trends: z.infer<typeof aiOutputSchema>["trends"],
  findings: z.infer<typeof aiOutputSchema>["findings"],
  evidence: Awaited<ReturnType<typeof loadUnanalyzedEvidence>>,
) {
  return withRadarTransaction(async (tx) => {
    const evidenceMap = new Map(evidence.map((item) => [item.change_event_id, item]));
    const findingRows = [];
    for (const finding of findings) {
      const source = evidenceMap.get(finding.change_event_id);
      if (!source) continue;
      const confidence = Math.min(finding.confidence, finding.evidence_ids.length === 1 ? 85 : 100);
      const [row] = await tx
        .insert(radarAiFindings)
        .values({
          id: randomUUID(),
          workspaceId: RADAR_WORKSPACE_ID,
          analysisId,
          changeEventId: finding.change_event_id,
          eventType: finding.event_type,
          importance: finding.importance,
          relevance: finding.relevance,
          confidence,
          title: finding.title,
          summary: finding.summary,
          rationale: finding.rationale,
          opportunity: finding.opportunity,
          risk: finding.risk,
          trend: finding.trend,
          evidenceIds: finding.evidence_ids,
          suggestedUpdates: finding.suggested_updates,
        })
        .returning();
      findingRows.push(row);
      if (
        finding.alert &&
        ["high", "critical"].includes(finding.importance) &&
        finding.relevance >= 70 &&
        confidence >= 60
      ) {
        const [event] = await tx
          .select()
          .from(radarChangeEvents)
          .where(eq(radarChangeEvents.id, finding.change_event_id))
          .limit(1);
        await tx.insert(radarAiAlerts).values({
          id: randomUUID(),
          workspaceId: RADAR_WORKSPACE_ID,
          findingId: row.id,
          competitorId: event?.competitorId ?? null,
          title: finding.title,
          description: finding.summary,
          importance: finding.importance,
        });
      }
    }
    const completedAt = new Date();
    const [analysis] = await tx
      .update(radarAiAnalyses)
      .set({
        status: "success",
        summary,
        trends,
        completedAt,
        errorMessage: "",
      })
      .where(eq(radarAiAnalyses.id, analysisId))
      .returning();
    return mapAnalysis(analysis, findingRows);
  });
}

async function markAnalysisFailed(analysisId: string, startedAt: Date, error: unknown) {
  const message = error instanceof Error ? error.message : "Error de análisis de IA.";
  await withRadarTransaction(async (tx) => {
    const existing = await tx
      .select({ id: radarAiAnalyses.id })
      .from(radarAiAnalyses)
      .where(eq(radarAiAnalyses.id, analysisId))
      .limit(1);
    if (!existing.length) {
      await tx.insert(radarAiAnalyses).values({
        id: analysisId,
        workspaceId: RADAR_WORKSPACE_ID,
        trigger: "manual",
        model: MODEL,
        status: "error",
        startedAt,
        completedAt: new Date(),
        errorMessage: message,
      });
    } else {
      await tx
        .update(radarAiAnalyses)
        .set({ status: "error", completedAt: new Date(), errorMessage: message })
        .where(eq(radarAiAnalyses.id, analysisId));
    }
  });
}

function mapAnalysis(
  analysis: typeof radarAiAnalyses.$inferSelect,
  findings: (typeof radarAiFindings.$inferSelect)[],
) {
  return {
    id: analysis.id,
    trigger: analysis.trigger,
    model: analysis.model,
    status: analysis.status,
    source_evidence_count: analysis.sourceEvidenceCount,
    event_count: analysis.eventCount,
    summary: analysis.summary,
    trends: Array.isArray(analysis.trends) ? analysis.trends : [],
    error_message: analysis.errorMessage,
    started_at: analysis.startedAt.toISOString(),
    completed_at: analysis.completedAt?.toISOString() ?? null,
    findings: findings.map((finding) => ({
      id: finding.id,
      change_event_id: finding.changeEventId,
      event_type: finding.eventType,
      importance: finding.importance,
      relevance: finding.relevance,
      confidence: finding.confidence,
      title: finding.title,
      summary: finding.summary,
      rationale: finding.rationale,
      opportunity: finding.opportunity,
      risk: finding.risk,
      trend: finding.trend,
      evidence_ids: Array.isArray(finding.evidenceIds) ? finding.evidenceIds : [],
      suggested_updates: Array.isArray(finding.suggestedUpdates) ? finding.suggestedUpdates : [],
    })),
  };
}

function mapAlert(
  alert: typeof radarAiAlerts.$inferSelect,
  competitors: Map<string, typeof radarCompetitors.$inferSelect>,
) {
  const competitor = alert.competitorId ? competitors.get(alert.competitorId) : undefined;
  return {
    id: alert.id,
    finding_id: alert.findingId,
    competitor_id: competitor?.legacyId ?? null,
    competitor_name: competitor?.nombre ?? null,
    title: alert.title,
    description: alert.description,
    importance: alert.importance,
    status: alert.status,
    created_at: alert.createdAt.toISOString(),
    read_at: alert.readAt?.toISOString() ?? null,
  };
}