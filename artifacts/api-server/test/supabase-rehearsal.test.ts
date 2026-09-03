import assert from "node:assert/strict";
import { createHash, randomUUID } from "node:crypto";
import { after, before, describe, it } from "node:test";
import { initializeRadarDatabaseSecurity } from "../src/lib/radar/database-security";
import {
  importRadarPayload,
  readRadarState,
} from "../src/lib/radar/repository";
import { createRadarPool, pool } from "@workspace/db";

const targetUrl = process.env.DATABASE_URL;
const ownerUrl = process.env.RADAR_REHEARSAL_OWNER_URL;
const sourceUrl = process.env.RADAR_REHEARSAL_SOURCE_URL;
const apiUrl = process.env.RADAR_REHEARSAL_API_URL ?? "";
const workspaceId =
  process.env.RADAR_REHEARSAL_WORKSPACE_UUID ??
  "aaf27cc2-401c-5df6-adc2-4c3f7745c75c";
const runtimeRole =
  process.env.RADAR_REHEARSAL_RUNTIME_ROLE ?? "radar_rehearsal_runtime";
const confirmation = process.env.RADAR_SUPABASE_REHEARSAL_CONFIRM;

const expectedCounts = {
  radar_workspaces: 1,
  radar_competitors: 14,
  radar_keywords: 15,
  radar_sources: 38,
  radar_plan_items: 8,
  radar_imports: 1,
  radar_monitor_runs: 80,
  radar_monitor_evidence: 371,
  radar_change_events: 371,
  radar_ai_analyses: 47,
  radar_ai_findings: 2,
  radar_ai_alerts: 1,
  radar_activity_log: 55,
  radar_alert_preferences: 1,
  radar_integrations: 0,
  radar_webhook_subscriptions: 0,
  radar_integration_deliveries: 0,
  radar_worker_jobs: 39,
  radar_worker_leases: 1,
} as const;

const tables = Object.keys(expectedCounts);
const uuidPattern =
  "^[0-9a-f]{8}-[0-9a-f]{4}-[1-5][0-9a-f]{3}-[89ab][0-9a-f]{3}-[0-9a-f]{12}$";

type RehearsalClient = Awaited<
  ReturnType<ReturnType<typeof createRadarPool>["connect"]>
>;

let sourcePool!: ReturnType<typeof createRadarPool>;
let targetPool!: ReturnType<typeof createRadarPool>;
let source!: RehearsalClient;
let targetOwner!: RehearsalClient;
let sourceIdsBefore: Record<string, string[]> = {};
let importedId: string | undefined;

function canonicalState(state: Awaited<ReturnType<typeof readRadarState>>) {
  const sort = (rows: unknown[]) =>
    [...rows].sort((a, b) =>
      String((a as Record<string, unknown>).id).localeCompare(
        String((b as Record<string, unknown>).id),
      ),
    );
  return {
    sources: sort(state.sources),
    competitors: sort(state.competitors),
    keywords: sort(state.keywords),
    plan: {
      "30": sort(state.plan["30"]),
      "60": sort(state.plan["60"]),
      "90": sort(state.plan["90"]),
    },
  };
}

function digest(value: unknown) {
  return createHash("sha256").update(JSON.stringify(value)).digest("hex");
}

async function counts(client: RehearsalClient) {
  const result: Record<string, number> = {};
  for (const table of tables) {
    result[table] = Number(
      (await client.query(`select count(*)::int as count from public.${table}`))
        .rows[0].count,
    );
  }
  return result;
}

async function ids(client: RehearsalClient) {
  const result: Record<string, string[]> = {};
  for (const table of tables) {
    const column = table === "radar_alert_preferences" ? "workspace_id" : "id";
    result[table] = (
      await client.query(
        `select ${column}::text as id from public.${table} order by ${column}`,
      )
    ).rows.map((row) => row.id);
  }
  return result;
}

async function expectConstraintFailure(
  name: string,
  query: string,
  params: unknown[],
  code: string,
) {
  await targetOwner.query(`savepoint ${name}`);
  try {
    await targetOwner.query(query, params);
    assert.fail(`${name} was accepted`);
  } catch (error) {
    assert.equal((error as { code?: string }).code, code, name);
    await targetOwner.query(`rollback to savepoint ${name}`);
  }
}

before(async () => {
  assert.equal(
    confirmation,
    "YES",
    "Set RADAR_SUPABASE_REHEARSAL_CONFIRM=YES to run against staging.",
  );
  assert.ok(targetUrl, "DATABASE_URL must point to Supabase staging.");
  assert.ok(
    ownerUrl,
    "RADAR_REHEARSAL_OWNER_URL must point to the staging owner connection.",
  );
  assert.ok(
    sourceUrl,
    "RADAR_REHEARSAL_SOURCE_URL must point to the Replit source.",
  );
  assert.notEqual(targetUrl, sourceUrl, "Source and staging URLs must differ.");
  assert.ok(apiUrl, "RADAR_REHEARSAL_API_URL must point to the isolated API.");

  sourcePool = createRadarPool(sourceUrl);
  targetPool = createRadarPool(ownerUrl);
  source = await sourcePool.connect();
  targetOwner = await targetPool.connect();
  sourceIdsBefore = await ids(source);
  await initializeRadarDatabaseSecurity();
});

after(async () => {
  if (importedId) {
    await targetOwner
      .query("delete from public.radar_imports where id = $1", [importedId])
      .catch(() => {});
  }
  source?.release();
  targetOwner?.release();
  await Promise.allSettled([
    sourcePool?.end(),
    targetPool?.end(),
    pool.end(),
  ]);
});

describe("RadarOH Supabase staging rehearsal", { concurrency: false }, () => {
  it("matches the frozen migration baseline and preserves integrity", async () => {
    const targetCounts = await counts(targetOwner);
    assert.deepEqual(targetCounts, expectedCounts);

    const sourceCore = await source.query(
      `select
         (select count(*)::int from public.radar_workspaces) as workspaces,
         (select count(*)::int from public.radar_competitors) as competitors,
         (select count(*)::int from public.radar_keywords) as keywords,
         (select count(*)::int from public.radar_sources) as sources,
         (select count(*)::int from public.radar_plan_items) as plan_items`,
    );
    assert.deepEqual(sourceCore.rows[0], {
      workspaces: 1,
      competitors: 14,
      keywords: 15,
      sources: 38,
      plan_items: 8,
    });

    const missingLegacy = await targetOwner.query(
      `select count(*)::int as count
       from (
         select legacy_id from public.radar_competitors
         union all select legacy_id from public.radar_keywords
         union all select legacy_id from public.radar_sources
         union all select legacy_id from public.radar_plan_items
         union all select legacy_id from public.radar_imports
         union all select legacy_id from public.radar_monitor_runs
         union all select legacy_id from public.radar_monitor_evidence
         union all select legacy_id from public.radar_change_events
         union all select legacy_id from public.radar_ai_analyses
         union all select legacy_id from public.radar_ai_findings
         union all select legacy_id from public.radar_ai_alerts
         union all select legacy_id from public.radar_activity_log
         union all select legacy_id from public.radar_integrations
         union all select legacy_id from public.radar_webhook_subscriptions
         union all select legacy_id from public.radar_integration_deliveries
         union all select legacy_id from public.radar_worker_jobs
         union all select legacy_id from public.radar_worker_leases
       ) rows
       where legacy_id is null`,
    );
    assert.equal(missingLegacy.rows[0].count, 0);

    const invalidUuid = await targetOwner.query(
      `select count(*)::int as count
       from public.radar_workspaces
       where id::text !~ $1`,
      [uuidPattern],
    );
    assert.equal(invalidUuid.rows[0].count, 0);

    const references = await targetOwner.query(
      `select
         (select count(*)::int from public.radar_change_events e
          left join public.radar_monitor_evidence v
            on v.workspace_id=e.workspace_id and v.id=e.evidence_id
          where v.id is null) as orphan_events,
         (select count(*)::int from public.radar_ai_analysis_evidence x
          left join public.radar_monitor_evidence v
            on v.workspace_id=x.workspace_id and v.id=x.evidence_id
          where v.id is null) as orphan_analysis_evidence,
         (select count(*)::int from public.radar_ai_finding_evidence x
          left join public.radar_monitor_evidence v
            on v.workspace_id=x.workspace_id and v.id=x.evidence_id
          where v.id is null) as orphan_finding_evidence,
         (select count(*)::int from public.radar_monitor_evidence
          where fingerprint is null or fingerprint='') as missing_fingerprints`,
    );
    assert.deepEqual(references.rows[0], {
      orphan_events: 0,
      orphan_analysis_evidence: 0,
      orphan_finding_evidence: 0,
      missing_fingerprints: 0,
    });

    const running = await targetOwner.query(
      `select
         (select count(*)::int from public.radar_worker_jobs where status='running') as jobs,
         (select count(*)::int from public.radar_monitor_runs where status='running') as runs,
         (select count(*)::int from public.radar_ai_analyses where status='running') as analyses`,
    );
    assert.deepEqual(running.rows[0], { jobs: 0, runs: 0, analyses: 0 });
  });

  it("enforces RLS, authorization boundaries, and transactional constraints", async () => {
    const runtimePool = createRadarPool(targetUrl);
    const runtime = await runtimePool.connect();
    try {
      await runtime.query("begin");
      const roles = await runtime.query(
        `select
           current_user as role,
           coalesce((select rolbypassrls from pg_roles where rolname=current_user), false) as bypass_rls,
           pg_has_role(current_user, 'radar_backend', 'member') as backend,
           pg_has_role(current_user, 'radar_workspace_admin', 'member') as admin`,
      );
      assert.equal(roles.rows[0].role, runtimeRole);
      assert.deepEqual(
        {
          bypass_rls: roles.rows[0].bypass_rls,
          backend: roles.rows[0].backend,
          admin: roles.rows[0].admin,
        },
        { bypass_rls: false, backend: true, admin: false },
      );
      await runtime.query('set local role "radar_backend"');
      await runtime.query(
        "select set_config('app.workspace_id', $1, true)",
        [workspaceId],
      );
      const visible = await runtime.query(
        "select count(*)::int as count from public.radar_sources",
      );
      assert.equal(visible.rows[0].count, 38);
      await runtime.query(
        "select set_config('app.workspace_id', $1, true)",
        [randomUUID()],
      );
      const isolated = await runtime.query(
        "select count(*)::int as count from public.radar_sources",
      );
      assert.equal(isolated.rows[0].count, 0);
      await runtime.query("commit");
    } catch (error) {
      await runtime.query("rollback");
      throw error;
    } finally {
      runtime.release();
      await runtimePool.end();
    }

    await targetOwner.query("begin");
    try {
      const otherWorkspace = randomUUID();
      await targetOwner.query(
        `insert into public.radar_workspaces(id, legacy_key, name)
         values ($1, $2, $3)`,
        [otherWorkspace, `rehearsal-${otherWorkspace.slice(0, 8)}`, "Rehearsal"],
      );
      const competitor = (
        await targetOwner.query(
          "select id from public.radar_competitors where workspace_id=$1 limit 1",
          [workspaceId],
        )
      ).rows[0].id;
      await expectConstraintFailure(
        "cross_workspace_fk",
        `insert into public.radar_sources
           (id, workspace_id, legacy_id, termino, tipo, frecuencia, notas,
            connector, endpoint_url, enabled, competitor_id, raw_record,
            last_status, consecutive_failures)
         values ($1,$2,$3,'cross tenant','rss','daily','','manual','',false,
                 $4,'{}'::jsonb,'idle',0)`,
        [randomUUID(), otherWorkspace, `cross-${randomUUID()}`, competitor],
        "23503",
      );
      await expectConstraintFailure(
        "invalid_horizon",
        `insert into public.radar_plan_items
           (id, workspace_id, legacy_id, horizon, text, done, raw_record)
         values ($1,$2,$3,0,'invalid horizon',false,'{}'::jsonb)`,
        [randomUUID(), workspaceId, `invalid-${randomUUID()}`],
        "23514",
      );
      await expectConstraintFailure(
        "duplicate_legacy",
        `insert into public.radar_competitors
           (id,workspace_id,legacy_id,nombre,ubicacion,especialidad,rango_precio,
            web,redes,fortalezas,debilidades,notas,prioridad,estado,raw_record,
            created_at,updated_at)
         select $1,workspace_id,legacy_id,nombre,ubicacion,especialidad,rango_precio,
            web,redes,fortalezas,debilidades,notas,prioridad,estado,raw_record,
            created_at,updated_at
         from public.radar_competitors limit 1`,
        [randomUUID()],
        "23505",
      );
      const sourceWithHistory = (
        await targetOwner.query(
          "select source_id from public.radar_monitor_runs where workspace_id=$1 limit 1",
          [workspaceId],
        )
      ).rows[0].source_id;
      await expectConstraintFailure(
        "history_delete_restrict",
        "delete from public.radar_sources where workspace_id=$1 and id=$2",
        [workspaceId, sourceWithHistory],
        "23503",
      );
      await targetOwner.query("rollback");
    } catch (error) {
      await targetOwner.query("rollback");
      throw error;
    }
  });

  it("verifies Session pooler locks, worker lease shape, and API boundaries", async () => {
    const firstPool = createRadarPool(targetUrl);
    const secondPool = createRadarPool(targetUrl);
    const first = await firstPool.connect();
    const second = await secondPool.connect();
    try {
      const lockKey = `rehearsal-${randomUUID()}`;
      const firstLock = await first.query(
        "select pg_try_advisory_lock(hashtext($1), hashtext($2)) as acquired",
        [lockKey, "worker"],
      );
      const blockedLock = await second.query(
        "select pg_try_advisory_lock(hashtext($1), hashtext($2)) as acquired",
        [lockKey, "worker"],
      );
      assert.equal(firstLock.rows[0].acquired, true);
      assert.equal(blockedLock.rows[0].acquired, false);
      await first.query(
        "select pg_advisory_unlock(hashtext($1), hashtext($2))",
        [lockKey, "worker"],
      );
      const reacquired = await second.query(
        "select pg_try_advisory_lock(hashtext($1), hashtext($2)) as acquired",
        [lockKey, "worker"],
      );
      assert.equal(reacquired.rows[0].acquired, true);
      await second.query(
        "select pg_advisory_unlock(hashtext($1), hashtext($2))",
        [lockKey, "worker"],
      );
    } finally {
      first.release();
      second.release();
      await Promise.all([firstPool.end(), secondPool.end()]);
    }

    const lease = await targetOwner.query(
      `select count(*)::int as count, count(distinct workspace_id)::int as workspaces
       from public.radar_worker_leases`,
    );
    assert.deepEqual(lease.rows[0], { count: 1, workspaces: 1 });

    const requests = [
      ["/api/healthz", 200],
      ["/api/readyz", 200],
      ["/api/radar/state", 401],
    ] as const;
    for (const [path, expectedStatus] of requests) {
      const response = await fetch(new URL(path, apiUrl));
      assert.equal(response.status, expectedStatus, path);
    }
    const frozenMutation = await fetch(new URL("/api/radar/import", apiUrl), {
      method: "POST",
      headers: { "content-type": "application/json" },
      body: "{}",
    });
    assert.equal(frozenMutation.status, 503);
  });

  it("round-trips JSON without changing canonical state", async () => {
    const before = await readRadarState();
    assert.equal(
      before.plan["30"].length +
        before.plan["60"].length +
        before.plan["90"].length,
      8,
    );
    const state = {
      sources: before.sources,
      competitors: before.competitors,
      keywords: before.keywords,
      plan: before.plan,
    };
    const beforeCanonical = canonicalState(before);
    const imported = await importRadarPayload(
      { exportedAt: new Date().toISOString(), ...state },
      "radaroh-automated-rehearsal.json",
    );
    importedId = imported.importId;
    const after = await readRadarState();
    const afterCanonical = canonicalState(after);
    assert.equal(digest(beforeCanonical), digest(afterCanonical));
    assert.deepEqual(imported.validation, {
      sources: 38,
      competitors: 14,
      keywords: 15,
      planItems: 8,
    });
  });

  it("keeps every source ID present across the rehearsal checks", async () => {
    const sourceIdsAfter = await ids(source);
    const missing: Record<string, number> = {};
    for (const table of tables) {
      const afterSet = new Set(sourceIdsAfter[table]);
      const lost = sourceIdsBefore[table].filter((id) => !afterSet.has(id));
      if (lost.length) missing[table] = lost.length;
    }
    assert.deepEqual(missing, {});
  });
});