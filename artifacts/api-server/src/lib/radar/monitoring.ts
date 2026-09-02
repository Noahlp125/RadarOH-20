import { createHash, randomUUID } from "node:crypto";
import {
  and,
  asc,
  desc,
  eq,
  isNull,
  lte,
  ne,
  or,
} from "drizzle-orm";
import {
  radarChangeEvents,
  radarCompetitors,
  radarMonitorEvidence,
  radarMonitorRuns,
  radarSources,
} from "@workspace/db";
import { logger } from "../logger";
import {
  fetchSource,
  SourceFetchError,
  type MonitorFetchResult,
  type MonitorItem,
  type RadarConnector,
} from "./connectors";
import { RADAR_WORKSPACE_ID, withRadarTransaction } from "./repository";

type RunTrigger = "scheduler" | "manual" | "retry";
type SourceRow = typeof radarSources.$inferSelect;
type RunRow = typeof radarMonitorRuns.$inferSelect;
type ChangeRow = typeof radarChangeEvents.$inferSelect;
type CompetitorRow = typeof radarCompetitors.$inferSelect;

const MAX_ATTEMPTS = 3;
const SCHEDULER_INTERVAL_MS = 60_000;
const SCHEDULER_BATCH_SIZE = 10;
const runningSources = new Set<string>();
let schedulerTimer: NodeJS.Timeout | null = null;
let schedulerTickActive = false;

export class MonitorSourceNotFoundError extends Error {}

export async function getRadarMonitorStatus() {
  return withRadarTransaction(async (tx) => {
    const sources = await tx
      .select()
      .from(radarSources)
      .where(eq(radarSources.workspaceId, RADAR_WORKSPACE_ID))
      .orderBy(asc(radarSources.createdAt));
    const runs = await tx
      .select()
      .from(radarMonitorRuns)
      .where(eq(radarMonitorRuns.workspaceId, RADAR_WORKSPACE_ID))
      .orderBy(desc(radarMonitorRuns.startedAt))
      .limit(20);
    const changes = await tx
      .select()
      .from(radarChangeEvents)
      .where(eq(radarChangeEvents.workspaceId, RADAR_WORKSPACE_ID))
      .orderBy(desc(radarChangeEvents.occurredAt))
      .limit(30);
    const competitors = await tx
      .select()
      .from(radarCompetitors)
      .where(eq(radarCompetitors.workspaceId, RADAR_WORKSPACE_ID));
    const sourceMap = new Map(sources.map((source) => [source.id, source]));
    const competitorMap = new Map(competitors.map((competitor) => [competitor.id, competitor]));
    const runDates = sources
      .map((source) => source.lastRunAt)
      .filter((date): date is Date => Boolean(date));
    const nextDates = sources
      .filter((source) => source.enabled)
      .map((source) => source.nextRunAt)
      .filter((date): date is Date => Boolean(date));
    return {
      summary: {
        total_sources: sources.length,
        enabled_sources: sources.filter((source) => source.enabled).length,
        healthy_sources: sources.filter((source) => source.enabled && source.lastStatus === "success").length,
        error_sources: sources.filter((source) => source.lastStatus === "error").length,
        last_run_at: runDates.length
          ? new Date(Math.max(...runDates.map((date) => date.getTime()))).toISOString()
          : null,
        next_run_at: nextDates.length
          ? new Date(Math.min(...nextDates.map((date) => date.getTime()))).toISOString()
          : null,
      },
      sources: sources.map(mapSourceStatus),
      recent_runs: runs.map((run) => mapRun(run, sourceMap)),
      recent_changes: changes.map((change) => mapChange(change, sourceMap, competitorMap)),
    };
  });
}

export async function getRadarMonitorHistory(
  competitorLegacyId?: string,
  limit = 50,
) {
  const safeLimit = Math.max(1, Math.min(100, Math.floor(limit)));
  return withRadarTransaction(async (tx) => {
    const sources = await tx
      .select()
      .from(radarSources)
      .where(eq(radarSources.workspaceId, RADAR_WORKSPACE_ID));
    const competitors = await tx
      .select()
      .from(radarCompetitors)
      .where(eq(radarCompetitors.workspaceId, RADAR_WORKSPACE_ID));
    const selectedCompetitor = competitorLegacyId
      ? competitors.find((competitor) => competitor.legacyId === competitorLegacyId)
      : undefined;
    if (competitorLegacyId && !selectedCompetitor) return [];
    const rows = await tx
      .select()
      .from(radarChangeEvents)
      .where(
        selectedCompetitor
          ? and(
              eq(radarChangeEvents.workspaceId, RADAR_WORKSPACE_ID),
              eq(radarChangeEvents.competitorId, selectedCompetitor.id),
            )
          : eq(radarChangeEvents.workspaceId, RADAR_WORKSPACE_ID),
      )
      .orderBy(desc(radarChangeEvents.occurredAt))
      .limit(safeLimit);
    return rows.map((row) =>
      mapChange(
        row,
        new Map(sources.map((source) => [source.id, source])),
        new Map(competitors.map((competitor) => [competitor.id, competitor])),
      ),
    );
  });
}

export async function runRadarMonitor(sourceLegacyId?: string) {
  const sources = await getRunnableSources(sourceLegacyId);
  if (sourceLegacyId && !sources.length) {
    throw new MonitorSourceNotFoundError("Fuente no encontrada.");
  }
  const results = [];
  for (const source of sources) {
    results.push(await runMonitorSource(source.legacyId, "manual"));
  }
  return {
    runs: results.map((result) => result.run),
    changes: results.flatMap((result) => result.changes),
  };
}

export async function runMonitorSource(
  sourceLegacyId: string,
  trigger: RunTrigger,
) {
  if (runningSources.has(sourceLegacyId)) {
    throw new Error("La fuente ya tiene una ejecución en curso.");
  }
  runningSources.add(sourceLegacyId);
  const startedAt = new Date();
  const runId = randomUUID();
  let source: SourceRow | undefined;
  try {
    source = await withRadarTransaction(async (tx) => {
      const [found] = await tx
        .select()
        .from(radarSources)
        .where(
          and(
            eq(radarSources.workspaceId, RADAR_WORKSPACE_ID),
            eq(radarSources.legacyId, sourceLegacyId),
          ),
        )
        .limit(1);
      if (!found) throw new MonitorSourceNotFoundError("Fuente no encontrada.");
      await tx.insert(radarMonitorRuns).values({
        id: runId,
        workspaceId: RADAR_WORKSPACE_ID,
        sourceId: found.id,
        trigger,
        status: "running",
        startedAt,
      });
      await tx
        .update(radarSources)
        .set({ lastStatus: "running", lastError: "", updatedAt: new Date() })
        .where(eq(radarSources.id, found.id));
      return found;
    });

    if (source.connector === "manual" || !source.endpointUrl) {
      throw new SourceFetchError(
        "La fuente necesita un conector y un endpoint antes de ejecutarse.",
        false,
      );
    }

    const fetched = await fetchWithRetry(
      source.connector as RadarConnector,
      source.endpointUrl,
    );
    return await persistSuccessfulRun(
      source,
      runId,
      trigger,
      startedAt,
      fetched.result,
      fetched.attempts,
    );
  } catch (error) {
    if (!source) throw error;
    return persistFailedRun(source, runId, trigger, startedAt, error);
  } finally {
    runningSources.delete(sourceLegacyId);
  }
}

export function startRadarMonitorScheduler() {
  if (schedulerTimer) return;
  const tick = async () => {
    if (schedulerTickActive) return;
    schedulerTickActive = true;
    try {
      const due = await getDueSources();
      for (const source of due) {
        try {
          await runMonitorSource(source.legacyId, "scheduler");
        } catch (error) {
          logger.error({ err: error, sourceId: source.legacyId }, "Scheduled RadarOH source failed");
        }
      }
    } catch (error) {
      logger.error({ err: error }, "RadarOH scheduler tick failed");
    } finally {
      schedulerTickActive = false;
    }
  };
  schedulerTimer = setInterval(() => void tick(), SCHEDULER_INTERVAL_MS);
  setTimeout(() => void tick(), 2_000);
  logger.info({ intervalMs: SCHEDULER_INTERVAL_MS }, "RadarOH monitor scheduler started");
}

async function getRunnableSources(sourceLegacyId?: string) {
  return withRadarTransaction(async (tx) => {
    const rows = await tx
      .select()
      .from(radarSources)
      .where(
        sourceLegacyId
          ? and(
              eq(radarSources.workspaceId, RADAR_WORKSPACE_ID),
              eq(radarSources.legacyId, sourceLegacyId),
            )
          : and(
              eq(radarSources.workspaceId, RADAR_WORKSPACE_ID),
              eq(radarSources.enabled, true),
              ne(radarSources.connector, "manual"),
            ),
      )
      .orderBy(asc(radarSources.createdAt));
    return rows.filter((source) => Boolean(source.endpointUrl));
  });
}

async function getDueSources() {
  const now = new Date();
  return withRadarTransaction((tx) =>
    tx
      .select()
      .from(radarSources)
      .where(
        and(
          eq(radarSources.workspaceId, RADAR_WORKSPACE_ID),
          eq(radarSources.enabled, true),
          ne(radarSources.connector, "manual"),
          or(isNull(radarSources.nextRunAt), lte(radarSources.nextRunAt, now)),
        ),
      )
      .orderBy(asc(radarSources.nextRunAt))
      .limit(SCHEDULER_BATCH_SIZE),
  );
}

async function fetchWithRetry(connector: RadarConnector, endpointUrl: string) {
  let lastError: unknown;
  for (let attempt = 1; attempt <= MAX_ATTEMPTS; attempt += 1) {
    try {
      return { result: await fetchSource(connector, endpointUrl), attempts: attempt };
    } catch (error) {
      lastError = error;
      if (
        attempt === MAX_ATTEMPTS ||
        !(error instanceof SourceFetchError) ||
        !error.retryable
      ) {
        throw Object.assign(error instanceof Error ? error : new Error("Error de monitorización."), {
          attempts: attempt,
        });
      }
      await delay(250 * 2 ** (attempt - 1));
    }
  }
  throw lastError;
}

async function persistSuccessfulRun(
  source: SourceRow,
  runId: string,
  trigger: RunTrigger,
  startedAt: Date,
  fetched: MonitorFetchResult,
  attempts: number,
) {
  return withRadarTransaction(async (tx) => {
    const competitors = await tx
      .select()
      .from(radarCompetitors)
      .where(eq(radarCompetitors.workspaceId, RADAR_WORKSPACE_ID));
    const changes: ChangeRow[] = [];
    const observedAt = new Date();
    for (const item of fetched.items) {
      const fingerprint = fingerprintItem(item);
      const [previous] = await tx
        .select()
        .from(radarMonitorEvidence)
        .where(
          and(
            eq(radarMonitorEvidence.sourceId, source.id),
            eq(radarMonitorEvidence.itemKey, item.itemKey),
          ),
        )
        .orderBy(desc(radarMonitorEvidence.observedAt))
        .limit(1);
      const evidenceId = randomUUID();
      await tx.insert(radarMonitorEvidence).values({
        id: evidenceId,
        workspaceId: RADAR_WORKSPACE_ID,
        sourceId: source.id,
        runId,
        itemKey: item.itemKey,
        fingerprint,
        title: item.title,
        url: item.url,
        publishedAt: item.publishedAt,
        normalizedText: item.normalizedText,
        rawPayload: item.rawPayload,
        observedAt,
      });
      if (!previous || previous.fingerprint !== fingerprint) {
        const competitor = source.competitorId
          ? competitors.find((candidate) => candidate.id === source.competitorId)
          : matchCompetitor(item, competitors);
        const [event] = await tx
          .insert(radarChangeEvents)
          .values({
            id: randomUUID(),
            workspaceId: RADAR_WORKSPACE_ID,
            sourceId: source.id,
            runId,
            evidenceId,
            competitorId: competitor?.id ?? null,
            changeType: previous ? "updated" : "new",
            title: item.title,
            summary: item.normalizedText.slice(0, 800),
            url: item.url,
            previousFingerprint: previous?.fingerprint ?? null,
            fingerprint,
            occurredAt: observedAt,
          })
          .returning();
        changes.push(event);
      }
    }
    const finishedAt = new Date();
    const [run] = await tx
      .update(radarMonitorRuns)
      .set({
        status: "success",
        finishedAt,
        attempts,
        itemCount: fetched.items.length,
        changeCount: changes.length,
        httpStatus: fetched.httpStatus,
        durationMs: finishedAt.getTime() - startedAt.getTime(),
      })
      .where(eq(radarMonitorRuns.id, runId))
      .returning();
    await tx
      .update(radarSources)
      .set({
        lastRunAt: finishedAt,
        nextRunAt: nextScheduledAt(source.frecuencia, finishedAt),
        lastStatus: "success",
        lastError: "",
        consecutiveFailures: 0,
        lastChangedAt: changes.length ? finishedAt : source.lastChangedAt,
        updatedAt: finishedAt,
      })
      .where(eq(radarSources.id, source.id));
    const sourceMap = new Map([[source.id, source]]);
    const competitorMap = new Map(competitors.map((competitor) => [competitor.id, competitor]));
    return {
      run: mapRun(run, sourceMap),
      changes: changes.map((change) => mapChange(change, sourceMap, competitorMap)),
    };
  });
}

async function persistFailedRun(
  source: SourceRow,
  runId: string,
  trigger: RunTrigger,
  startedAt: Date,
  error: unknown,
) {
  const finishedAt = new Date();
  const message = error instanceof Error ? error.message : "Error de monitorización.";
  const attempts =
    error && typeof error === "object" && "attempts" in error && typeof error.attempts === "number"
      ? error.attempts
      : 1;
  const httpStatus = error instanceof SourceFetchError ? error.httpStatus : null;
  const failures = source.consecutiveFailures + 1;
  logger.warn({ err: error, sourceId: source.legacyId, trigger }, "RadarOH source execution failed");
  return withRadarTransaction(async (tx) => {
    const [run] = await tx
      .update(radarMonitorRuns)
      .set({
        status: "error",
        finishedAt,
        attempts,
        httpStatus,
        errorMessage: message,
        durationMs: finishedAt.getTime() - startedAt.getTime(),
      })
      .where(eq(radarMonitorRuns.id, runId))
      .returning();
    await tx
      .update(radarSources)
      .set({
        lastRunAt: finishedAt,
        nextRunAt: new Date(finishedAt.getTime() + retryDelayMs(failures)),
        lastStatus: "error",
        lastError: message,
        consecutiveFailures: failures,
        updatedAt: finishedAt,
      })
      .where(eq(radarSources.id, source.id));
    return {
      run: mapRun(run, new Map([[source.id, source]])),
      changes: [],
    };
  });
}

function mapSourceStatus(source: SourceRow) {
  return {
    source_id: source.legacyId,
    source_label: source.termino,
    connector: source.connector,
    endpoint_url: source.endpointUrl,
    enabled: source.enabled,
    last_status: source.lastStatus,
    last_run_at: source.lastRunAt?.toISOString() ?? null,
    next_run_at: source.nextRunAt?.toISOString() ?? null,
    last_error: source.lastError,
    consecutive_failures: source.consecutiveFailures,
  };
}

function mapRun(run: RunRow, sources: Map<string, SourceRow>) {
  const source = sources.get(run.sourceId);
  return {
    id: run.id,
    source_id: source?.legacyId ?? run.sourceId,
    source_label: source?.termino ?? "Fuente eliminada",
    trigger: run.trigger,
    status: run.status,
    started_at: run.startedAt.toISOString(),
    finished_at: run.finishedAt?.toISOString() ?? null,
    attempts: run.attempts,
    item_count: run.itemCount,
    change_count: run.changeCount,
    http_status: run.httpStatus,
    error_message: run.errorMessage,
    duration_ms: run.durationMs,
  };
}

function mapChange(
  change: ChangeRow,
  sources: Map<string, SourceRow>,
  competitors: Map<string, CompetitorRow>,
) {
  const source = sources.get(change.sourceId);
  const competitor = change.competitorId ? competitors.get(change.competitorId) : undefined;
  return {
    id: change.id,
    source_id: source?.legacyId ?? change.sourceId,
    source_label: source?.termino ?? "Fuente eliminada",
    run_id: change.runId,
    evidence_id: change.evidenceId,
    competitor_id: competitor?.legacyId ?? null,
    competitor_name: competitor?.nombre ?? null,
    change_type: change.changeType,
    title: change.title,
    summary: change.summary,
    url: change.url,
    previous_fingerprint: change.previousFingerprint,
    fingerprint: change.fingerprint,
    occurred_at: change.occurredAt.toISOString(),
  };
}

function fingerprintItem(item: MonitorItem): string {
  return createHash("sha256")
    .update(JSON.stringify({
      title: item.title,
      url: item.url,
      publishedAt: item.publishedAt?.toISOString() ?? null,
      normalizedText: item.normalizedText,
    }))
    .digest("hex");
}

function matchCompetitor(item: MonitorItem, competitors: CompetitorRow[]) {
  const haystack = normalizeForMatch(`${item.title} ${item.normalizedText} ${item.url}`);
  return competitors.find((competitor) => {
    const name = normalizeForMatch(competitor.nombre);
    return name.length >= 4 && haystack.includes(name);
  });
}

function normalizeForMatch(value: string): string {
  return value
    .normalize("NFD")
    .replace(/\p{Diacritic}/gu, "")
    .replace(/[^a-z0-9]+/gi, " ")
    .toLowerCase()
    .trim();
}

function nextScheduledAt(frequency: string, from: Date): Date {
  const normalized = normalizeForMatch(frequency);
  const days = normalized.includes("diaria")
    ? 1
    : normalized.includes("mensual")
      ? 30
      : 7;
  return new Date(from.getTime() + days * 24 * 60 * 60 * 1_000);
}

function retryDelayMs(failures: number): number {
  return Math.min(24 * 60 * 60 * 1_000, 15 * 60 * 1_000 * 2 ** Math.max(0, failures - 1));
}

function delay(milliseconds: number) {
  return new Promise((resolve) => setTimeout(resolve, milliseconds));
}