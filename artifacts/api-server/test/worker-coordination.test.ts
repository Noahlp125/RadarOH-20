import assert from "node:assert/strict";
import { randomUUID } from "node:crypto";
import { after, before, beforeEach, describe, it } from "node:test";
import { pool } from "@workspace/db";
import { initializeRadarDatabaseSecurity } from "../src/lib/radar/database-security";
import { RADAR_WORKSPACE_ID } from "../src/lib/radar/repository";
import { radarWorkerTestHarness } from "../src/lib/radar/worker";

const firstWorker = `worker-a:${randomUUID()}`;
const replacementWorker = `worker-b:${randomUUID()}`;
const blockedJobId = `job:${randomUUID()}`;
const blockedJobKey = `monitor:${randomUUID()}`;
const staleJobId = `job:${randomUUID()}`;
const staleJobKey = `ai:${randomUUID()}`;
const staleAnalysisId = `analysis:${randomUUID()}`;

async function clearTestRows() {
  await pool.query(
    `delete from radar_ai_analyses where id = $1`,
    [staleAnalysisId],
  );
  await pool.query(
    `delete from radar_worker_jobs where id = any($1::text[])`,
    [[blockedJobId, staleJobId]],
  );
  await pool.query(
    `delete from radar_worker_leases where id = $1`,
    [radarWorkerTestHarness.leaseId],
  );
}

async function seedExpiredLease(ownerId: string, now: Date) {
  const expiredAt = new Date(now.getTime() - 1);
  await pool.query(
    `insert into radar_worker_leases
      (id, workspace_id, owner_id, acquired_at, heartbeat_at, expires_at, updated_at)
     values ($1, $2, $3, $4, $4, $4, $4)`,
    [
      radarWorkerTestHarness.leaseId,
      RADAR_WORKSPACE_ID,
      ownerId,
      expiredAt,
    ],
  );
}

async function seedRunningJob({
  id,
  jobKey,
  kind,
  ownerId,
  lockedAt,
}: {
  id: string;
  jobKey: string;
  kind: string;
  ownerId: string;
  lockedAt: Date;
}) {
  await pool.query(
    `insert into radar_worker_jobs
      (id, workspace_id, job_key, kind, status, available_at, attempts,
       locked_at, locked_by, started_at, error_message, payload, created_at, updated_at)
     values ($1, $2, $3, $4, 'running', $5, 1, $5, $6, $5, '', '{}'::jsonb, $5, $5)`,
    [id, RADAR_WORKSPACE_ID, jobKey, kind, lockedAt, ownerId],
  );
}

before(async () => {
  await initializeRadarDatabaseSecurity();
  await pool.query(
    `insert into radar_workspaces (id, name)
     values ($1, 'RadarOH worker coordination tests')
     on conflict (id) do nothing`,
    [RADAR_WORKSPACE_ID],
  );
});

beforeEach(clearTestRows);

after(async () => {
  await clearTestRows();
  await pool.query(
    `delete from radar_workspaces where id = $1`,
    [RADAR_WORKSPACE_ID],
  );
  await pool.end();
});

describe("RadarOH durable worker coordination", { concurrency: false }, () => {
  it("does not recover or execute a stale job while the previous process still holds its external-work lock", async () => {
    const now = new Date();
    const staleAt = new Date(
      now.getTime() - radarWorkerTestHarness.staleJobMs - 1,
    );
    await seedExpiredLease(firstWorker, now);
    await seedRunningJob({
      id: blockedJobId,
      jobKey: blockedJobKey,
      kind: "monitor",
      ownerId: firstWorker,
      lockedAt: staleAt,
    });

    const externalWorkLock =
      await radarWorkerTestHarness.acquireJobLock(blockedJobKey);
    assert.ok(externalWorkLock);

    try {
      const lease = await radarWorkerTestHarness.acquireLease(
        replacementWorker,
        now,
      );
      assert.deepEqual(lease, { leader: true, fresh: true });

      const recovered =
        await radarWorkerTestHarness.recoverInterruptedWork(
          replacementWorker,
          now,
        );
      assert.deepEqual(recovered, {
        recoveredJobs: 0,
        recoveredMonitorRuns: 0,
        recoveredAiAnalyses: 0,
      });

      const result = await pool.query<{
        status: string;
        attempts: number;
        locked_by: string;
      }>(
        `select status, attempts, locked_by
         from radar_worker_jobs
         where id = $1`,
        [blockedJobId],
      );
      assert.deepEqual(result.rows[0], {
        status: "running",
        attempts: 1,
        locked_by: firstWorker,
      });
    } finally {
      await radarWorkerTestHarness.releaseJobLock(
        externalWorkLock,
        blockedJobKey,
      );
    }
  });

  it("takes over an expired lease and recovers a job whose heartbeat crossed the stale threshold", async () => {
    const now = new Date();
    const staleAt = new Date(
      now.getTime() - radarWorkerTestHarness.staleJobMs - 1,
    );
    await seedExpiredLease(firstWorker, now);
    await seedRunningJob({
      id: staleJobId,
      jobKey: staleJobKey,
      kind: "ai",
      ownerId: firstWorker,
      lockedAt: staleAt,
    });
    await pool.query(
      `insert into radar_ai_analyses
        (id, workspace_id, trigger, model, status, started_at)
       values ($1, $2, 'scheduler', 'test-model', 'running', $3)`,
      [staleAnalysisId, RADAR_WORKSPACE_ID, staleAt],
    );

    const lease = await radarWorkerTestHarness.acquireLease(
      replacementWorker,
      now,
    );
    assert.deepEqual(lease, { leader: true, fresh: true });

    const recovered =
      await radarWorkerTestHarness.recoverInterruptedWork(
        replacementWorker,
        now,
      );
    assert.deepEqual(recovered, {
      recoveredJobs: 1,
      recoveredMonitorRuns: 0,
      recoveredAiAnalyses: 1,
    });

    const job = await pool.query<{
      status: string;
      locked_at: Date | null;
      locked_by: string | null;
      attempts: number;
    }>(
      `select status, locked_at, locked_by, attempts
       from radar_worker_jobs
       where id = $1`,
      [staleJobId],
    );
    assert.deepEqual(job.rows[0], {
      status: "queued",
      locked_at: null,
      locked_by: null,
      attempts: 1,
    });

    const analysis = await pool.query<{
      status: string;
      completed_at: Date | null;
    }>(
      `select status, completed_at
       from radar_ai_analyses
       where id = $1`,
      [staleAnalysisId],
    );
    assert.equal(analysis.rows[0]?.status, "error");
    assert.ok(analysis.rows[0]?.completed_at);
  });
});