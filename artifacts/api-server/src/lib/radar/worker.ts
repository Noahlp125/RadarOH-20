import { hostname } from "node:os";
import { randomUUID } from "node:crypto";
import { and, eq, lte, ne, or, sql } from "drizzle-orm";
import {
  radarAiAnalyses,
  radarMonitorRuns,
  radarSources,
  radarWorkerJobs,
  radarWorkerLeases,
  pool,
  type PoolClient,
} from "@workspace/db";
import { logger } from "../logger";
import {
  enqueueRadarAiJob,
  executeRadarAiJob,
  RADAR_AI_INTERVAL_MS,
} from "./ai";
import {
  enqueueDueRadarMonitorJobs,
  executeRadarMonitorJob,
} from "./monitoring";
import { RADAR_WORKSPACE_ID, withRadarTransaction } from "./repository";

const WORKER_TICK_MS = 60_000;
const WORKER_START_DELAY_MS = 2_000;
const WORKER_HEARTBEAT_MS = 30_000;
const WORKER_LEASE_MS = 90_000;
const STALE_JOB_MS = 2 * 60_000;
const MAX_JOBS_PER_TICK = 10;
const MONITOR_ERROR_RETRY_MS = 15 * 60_000;
const workerId = `${hostname()}:${process.pid}:${randomUUID()}`;
const leaseId = `radar-worker:${RADAR_WORKSPACE_ID}`;

type WorkerJob = typeof radarWorkerJobs.$inferSelect;
type JobLockClient = PoolClient;
type ClaimedJob = {
  job: WorkerJob;
  lockClient: JobLockClient;
};

let workerTimer: NodeJS.Timeout | null = null;
let startTimer: NodeJS.Timeout | null = null;
let activeTick: Promise<void> | null = null;
let stopping = false;
let isLeader = false;

export function startRadarWorker() {
  if (workerTimer || startTimer) return;
  stopping = false;
  startTimer = setTimeout(() => {
    startTimer = null;
    scheduleWorkerTick();
  }, WORKER_START_DELAY_MS);
  workerTimer = setInterval(scheduleWorkerTick, WORKER_TICK_MS);
  logger.info(
    { workerId, intervalMs: WORKER_TICK_MS },
    "RadarOH durable worker started",
  );
}

export async function stopRadarWorker() {
  stopping = true;
  if (startTimer) {
    clearTimeout(startTimer);
    startTimer = null;
  }
  if (workerTimer) {
    clearInterval(workerTimer);
    workerTimer = null;
  }
  if (activeTick) await activeTick;
  if (isLeader) await releaseWorkerLease();
  isLeader = false;
  logger.info({ workerId }, "RadarOH durable worker stopped");
}

function scheduleWorkerTick() {
  if (activeTick || stopping) return;
  activeTick = runWorkerTick().finally(() => {
    activeTick = null;
  });
}

async function runWorkerTick() {
  try {
    const lease = await acquireWorkerLease();
    if (!lease.leader) {
      if (isLeader) {
        logger.warn({ workerId }, "RadarOH worker leadership lost");
      }
      isLeader = false;
      return;
    }
    const recovered = await recoverInterruptedWork();
    if (lease.fresh) {
      logger.info(
        { workerId, ...recovered },
        "RadarOH worker leadership acquired",
      );
    } else if (
      recovered.recoveredJobs ||
      recovered.recoveredMonitorRuns ||
      recovered.recoveredAiAnalyses
    ) {
      logger.warn(
        { workerId, ...recovered },
        "RadarOH worker recovered interrupted work",
      );
    }
    isLeader = true;
    await enqueueDueRadarMonitorJobs();
    await enqueueRadarAiJob();
    for (let processed = 0; processed < MAX_JOBS_PER_TICK; processed += 1) {
      if (stopping || !(await renewWorkerLease())) break;
      const claimed = await claimNextJob();
      if (!claimed) break;
      await executeClaimedJob(claimed);
    }
  } catch (error) {
    logger.error({ err: error, workerId }, "RadarOH durable worker tick failed");
  }
}

async function acquireWorkerLease() {
  const now = new Date();
  const expiresAt = new Date(now.getTime() + WORKER_LEASE_MS);
  return withRadarTransaction(async (tx) => {
    const [before] = await tx
      .select()
      .from(radarWorkerLeases)
      .where(eq(radarWorkerLeases.id, leaseId))
      .limit(1);
    await tx
      .insert(radarWorkerLeases)
      .values({
        id: leaseId,
        workspaceId: RADAR_WORKSPACE_ID,
        ownerId: workerId,
        acquiredAt: now,
        heartbeatAt: now,
        expiresAt,
        updatedAt: now,
      })
      .onConflictDoNothing();
    const [lease] = await tx
      .update(radarWorkerLeases)
      .set({
        ownerId: workerId,
        acquiredAt:
          before?.ownerId === workerId && before.expiresAt > now
            ? before.acquiredAt
            : now,
        heartbeatAt: now,
        expiresAt,
        updatedAt: now,
      })
      .where(and(
        eq(radarWorkerLeases.id, leaseId),
        or(
          eq(radarWorkerLeases.ownerId, workerId),
          lte(radarWorkerLeases.expiresAt, now),
        ),
      ))
      .returning();
    return {
      leader: Boolean(lease),
      fresh:
        Boolean(lease) &&
        (!before || before.ownerId !== workerId || before.expiresAt <= now),
    };
  });
}

async function renewWorkerLease() {
  const now = new Date();
  return withRadarTransaction(async (tx) => {
    const [lease] = await tx
      .update(radarWorkerLeases)
      .set({
        heartbeatAt: now,
        expiresAt: new Date(now.getTime() + WORKER_LEASE_MS),
        updatedAt: now,
      })
      .where(and(
        eq(radarWorkerLeases.id, leaseId),
        eq(radarWorkerLeases.ownerId, workerId),
      ))
      .returning({ id: radarWorkerLeases.id });
    return Boolean(lease);
  });
}

async function releaseWorkerLease() {
  const now = new Date();
  await withRadarTransaction((tx) =>
    tx
      .update(radarWorkerLeases)
      .set({ expiresAt: now, heartbeatAt: now, updatedAt: now })
      .where(and(
        eq(radarWorkerLeases.id, leaseId),
        eq(radarWorkerLeases.ownerId, workerId),
      )),
  );
}

async function recoverInterruptedWork() {
  const now = new Date();
  const staleBefore = new Date(now.getTime() - STALE_JOB_MS);
  const staleJobs = await withRadarTransaction((tx) =>
    tx
      .select()
      .from(radarWorkerJobs)
      .where(and(
        eq(radarWorkerJobs.workspaceId, RADAR_WORKSPACE_ID),
        eq(radarWorkerJobs.status, "running"),
        ne(radarWorkerJobs.lockedBy, workerId),
        lte(radarWorkerJobs.lockedAt, staleBefore),
      )),
  );
  let recoveredJobs = 0;
  let recoveredMonitorRuns = 0;
  let recoveredAiAnalyses = 0;
  for (const staleJob of staleJobs) {
    const lockClient = await tryAcquireJobLock(staleJob.jobKey);
    if (!lockClient) continue;
    try {
      const recovered = await withRadarTransaction(async (tx) => {
        const [job] = await tx
          .update(radarWorkerJobs)
          .set({
            status: "queued",
            availableAt: now,
            lockedAt: null,
            lockedBy: null,
            startedAt: null,
            finishedAt: null,
            errorMessage: "Trabajo recuperado tras perder el worker anterior.",
            updatedAt: now,
          })
          .where(and(
            eq(radarWorkerJobs.id, staleJob.id),
            eq(radarWorkerJobs.status, "running"),
            eq(radarWorkerJobs.lockedBy, staleJob.lockedBy ?? ""),
            lte(radarWorkerJobs.lockedAt, staleBefore),
          ))
          .returning({ id: radarWorkerJobs.id });
        if (!job) return { jobs: 0, runs: 0, analyses: 0 };

        let runs = 0;
        let analyses = 0;
        if (staleJob.kind === "monitor" && staleJob.sourceId) {
          const staleRuns = await tx
            .update(radarMonitorRuns)
            .set({
              status: "error",
              finishedAt: now,
              errorMessage: "Ejecución interrumpida por reinicio del worker.",
            })
            .where(and(
              eq(radarMonitorRuns.workspaceId, RADAR_WORKSPACE_ID),
              eq(radarMonitorRuns.sourceId, staleJob.sourceId),
              eq(radarMonitorRuns.status, "running"),
              lte(radarMonitorRuns.startedAt, staleBefore),
            ))
            .returning({ id: radarMonitorRuns.id });
          runs = staleRuns.length;
          await tx
            .update(radarSources)
            .set({
              lastStatus: "error",
              lastError: "Ejecución interrumpida por reinicio del worker.",
              nextRunAt: now,
              updatedAt: now,
            })
            .where(eq(radarSources.id, staleJob.sourceId));
        } else if (staleJob.kind === "ai") {
          const staleAnalyses = await tx
            .update(radarAiAnalyses)
            .set({
              status: "error",
              completedAt: now,
              errorMessage: "Análisis interrumpido por reinicio del worker.",
            })
            .where(and(
              eq(radarAiAnalyses.workspaceId, RADAR_WORKSPACE_ID),
              eq(radarAiAnalyses.status, "running"),
              lte(radarAiAnalyses.startedAt, staleBefore),
            ))
            .returning({ id: radarAiAnalyses.id });
          analyses = staleAnalyses.length;
        }
        return { jobs: 1, runs, analyses };
      });
      recoveredJobs += recovered.jobs;
      recoveredMonitorRuns += recovered.runs;
      recoveredAiAnalyses += recovered.analyses;
    } finally {
      await releaseJobLock(lockClient, staleJob.jobKey);
    }
  }
  return { recoveredJobs, recoveredMonitorRuns, recoveredAiAnalyses };
}

async function claimNextJob(): Promise<ClaimedJob | null> {
  const now = new Date();
  const candidate = await withRadarTransaction(async (tx) => {
    const candidates = await tx.execute(sql`
      SELECT id, job_key
      FROM radar_worker_jobs
      WHERE workspace_id = ${RADAR_WORKSPACE_ID}
        AND status = 'queued'
        AND available_at <= ${now}
      ORDER BY available_at ASC, created_at ASC
      FOR UPDATE SKIP LOCKED
      LIMIT 1
    `);
    return candidates.rows[0] as { id?: string; job_key?: string } | undefined;
  });
  if (!candidate?.id || !candidate.job_key) return null;
  const candidateId = candidate.id;
  const candidateJobKey = candidate.job_key;
  const lockClient = await tryAcquireJobLock(candidateJobKey);
  if (!lockClient) return null;
  const job = await withRadarTransaction(async (tx) => {
    const [job] = await tx
      .update(radarWorkerJobs)
      .set({
        status: "running",
        attempts: sql`${radarWorkerJobs.attempts} + 1`,
        lockedAt: now,
        lockedBy: workerId,
        startedAt: now,
        finishedAt: null,
        errorMessage: "",
        updatedAt: now,
      })
      .where(and(
        eq(radarWorkerJobs.id, candidateId),
        eq(radarWorkerJobs.status, "queued"),
      ))
      .returning();
    return job ?? null;
  });
  if (!job) {
    await releaseJobLock(lockClient, candidateJobKey);
    return null;
  }
  return { job, lockClient };
}

async function executeClaimedJob({ job, lockClient }: ClaimedJob) {
  const heartbeat = setInterval(() => {
    void heartbeatJob(job.id).catch((error) =>
      logger.error(
        { err: error, jobId: job.id, workerId },
        "RadarOH job heartbeat failed",
      ),
    );
  }, WORKER_HEARTBEAT_MS);
  try {
    if (job.kind === "monitor") {
      const sourceLegacyId = job.payload["source_legacy_id"];
      if (typeof sourceLegacyId !== "string" || !sourceLegacyId) {
        throw new Error("El trabajo de monitorización no tiene una fuente válida.");
      }
      const result = await executeRadarMonitorJob(sourceLegacyId);
      if (result.run.status === "error") {
        throw new Error(result.run.error_message || "La monitorización falló.");
      }
    } else if (job.kind === "ai") {
      await executeRadarAiJob();
    } else {
      throw new Error(`Tipo de trabajo desconocido: ${job.kind}`);
    }
    await finishJob(job, "success");
  } catch (error) {
    logger.error(
      { err: error, jobId: job.id, jobKind: job.kind, workerId },
      "RadarOH durable job failed",
    );
    await finishJob(
      job,
      "error",
      error instanceof Error ? error.message : "Error de ejecución.",
    );
  } finally {
    clearInterval(heartbeat);
    await releaseJobLock(lockClient, job.jobKey);
  }
}

async function tryAcquireJobLock(jobKey: string): Promise<JobLockClient | null> {
  const client = await pool.connect();
  try {
    const result = await client.query<{ acquired: boolean }>(
      "select pg_try_advisory_lock(hashtext($1), hashtext($2)) as acquired",
      [RADAR_WORKSPACE_ID, jobKey],
    );
    if (result.rows[0]?.acquired) return client;
    client.release();
    return null;
  } catch (error) {
    client.release();
    throw error;
  }
}

async function releaseJobLock(client: JobLockClient, jobKey: string) {
  try {
    await client.query(
      "select pg_advisory_unlock(hashtext($1), hashtext($2))",
      [RADAR_WORKSPACE_ID, jobKey],
    );
  } finally {
    client.release();
  }
}

async function heartbeatJob(jobId: string) {
  const now = new Date();
  const [jobAlive, leaseAlive] = await Promise.all([
    withRadarTransaction(async (tx) => {
      const [job] = await tx
        .update(radarWorkerJobs)
        .set({ lockedAt: now, updatedAt: now })
        .where(and(
          eq(radarWorkerJobs.id, jobId),
          eq(radarWorkerJobs.status, "running"),
          eq(radarWorkerJobs.lockedBy, workerId),
        ))
        .returning({ id: radarWorkerJobs.id });
      return Boolean(job);
    }),
    renewWorkerLease(),
  ]);
  if (!jobAlive || !leaseAlive) {
    throw new Error("El worker perdió el lease del trabajo.");
  }
}

async function finishJob(
  job: WorkerJob,
  status: "success" | "error",
  errorMessage = "",
) {
  const now = new Date();
  await withRadarTransaction(async (tx) => {
    let availableAt = new Date(
      now.getTime() +
        (job.kind === "ai" ? RADAR_AI_INTERVAL_MS : MONITOR_ERROR_RETRY_MS),
    );
    if (job.kind === "monitor" && job.sourceId) {
      const [source] = await tx
        .select({ nextRunAt: radarSources.nextRunAt })
        .from(radarSources)
        .where(eq(radarSources.id, job.sourceId))
        .limit(1);
      if (source?.nextRunAt) availableAt = source.nextRunAt;
    }
    await tx
      .update(radarWorkerJobs)
      .set({
        status,
        availableAt,
        lockedAt: null,
        lockedBy: null,
        finishedAt: now,
        errorMessage,
        updatedAt: now,
      })
      .where(and(
        eq(radarWorkerJobs.id, job.id),
        eq(radarWorkerJobs.lockedBy, workerId),
      ));
  });
}