import pg from "pg";
import { createHash } from "node:crypto";

const { Client } = pg;

type Row = Record<string, unknown>;
type IdMap = Map<string, string>;

const sourceUrl = process.env.DATABASE_URL;
const targetUrl = process.env.SUPABASE_DB_DIRECT_URL;

if (!sourceUrl) {
  throw new Error("DATABASE_URL must point to the current Replit database.");
}
if (!targetUrl) {
  throw new Error(
    "SUPABASE_DB_DIRECT_URL must point to the prepared Supabase database as the migration owner.",
  );
}

if (process.env.RADAR_MIGRATION_CONFIRM !== "YES") {
  throw new Error(
    "Migration is blocked by default. Set RADAR_MIGRATION_CONFIRM=YES only after reviewing the plan.",
  );
}

const source = new Client({ connectionString: sourceUrl });
const target = new Client({ connectionString: targetUrl });
const EXPECTED_WORKSPACE_ID =
  process.env.RADAR_EXPECTED_LEGACY_WORKSPACE_ID ?? "oh-casas";
const MIGRATION_LOCK_KEY = "radar-oh:replit-to-supabase:v1";
let sourceTransactionOpen = false;
let targetTransactionOpen = false;

const tableNames = [
  "radar_workspaces",
  "radar_competitors",
  "radar_keywords",
  "radar_sources",
  "radar_plan_items",
  "radar_imports",
  "radar_monitor_runs",
  "radar_monitor_evidence",
  "radar_change_events",
  "radar_ai_analyses",
  "radar_ai_findings",
  "radar_ai_alerts",
  "radar_activity_log",
  "radar_alert_preferences",
  "radar_integrations",
  "radar_webhook_subscriptions",
  "radar_integration_deliveries",
  "radar_worker_jobs",
  "radar_worker_leases",
] as const;

const destinationTableNames = [
  ...tableNames,
  "radar_workspace_members",
  "radar_source_runtime",
  "radar_ai_analysis_evidence",
  "radar_ai_finding_evidence",
] as const;

const idMaps = new Map<string, IdMap>(
  tableNames.map((tableName) => [tableName, new Map<string, string>()]),
);

function mapFor(tableName: string): IdMap {
  const map = idMaps.get(tableName);
  if (!map) throw new Error(`No ID map registered for ${tableName}.`);
  return map;
}

function text(value: unknown, fallback = ""): string {
  return typeof value === "string" ? value : fallback;
}

function nullableText(value: unknown): string | null {
  return typeof value === "string" && value.length > 0 ? value : null;
}

function numberValue(value: unknown, fallback = 0): number {
  if (typeof value === "number" && Number.isFinite(value)) return value;
  if (typeof value === "string" && value.trim().length > 0) {
    const parsed = Number(value);
    if (Number.isFinite(parsed)) return parsed;
  }
  return fallback;
}

function jsonValue(value: unknown, fallback: unknown): string {
  return JSON.stringify(value === null || value === undefined ? fallback : value);
}

function stableTargetUuid(tableName: string, legacyId: unknown): string {
  const value = text(legacyId);
  if (!value) throw new Error(`Missing legacy ID for ${tableName}.`);
  if (
    /^[0-9a-f]{8}-[0-9a-f]{4}-[1-5][0-9a-f]{3}-[89ab][0-9a-f]{3}-[0-9a-f]{12}$/i.test(
      value,
    )
  ) {
    return value.toLowerCase();
  }
  const bytes = createHash("sha256")
    .update(`radar-oh:${tableName}:${value}`)
    .digest()
    .subarray(0, 16);
  bytes[6] = (bytes[6]! & 0x0f) | 0x50;
  bytes[8] = (bytes[8]! & 0x3f) | 0x80;
  const hex = bytes.toString("hex");
  return [
    hex.slice(0, 8),
    hex.slice(8, 12),
    hex.slice(12, 16),
    hex.slice(16, 20),
    hex.slice(20),
  ].join("-");
}

function uuidFor(tableName: string, oldId: unknown): string {
  const old = text(oldId);
  if (!old) throw new Error(`Missing legacy ID in ${tableName}.`);
  const mapped = mapFor(tableName).get(old);
  if (!mapped) throw new Error(`Missing ${tableName} mapping for ${old}.`);
  return mapped;
}

function mappedEvidenceIds(value: unknown): string[] {
  if (!Array.isArray(value)) return [];
  return [
    ...new Set(
      value.map((evidenceId) =>
        uuidFor("radar_monitor_evidence", evidenceId),
      ),
    ),
  ];
}

async function rows(tableName: string): Promise<Row[]> {
  const result = await source.query(`select * from public.${tableName}`);
  return result.rows as Row[];
}

async function insert(
  tableName: string,
  columns: string[],
  values: unknown[],
): Promise<string> {
  const legacyIndex = columns.findIndex((column) =>
    column === "legacy_id" || column === "legacy_key"
  );
  if (legacyIndex < 0) {
    throw new Error(`Insert into ${tableName} is missing a legacy identifier.`);
  }
  const id = stableTargetUuid(tableName, values[legacyIndex]);
  const insertColumns = ["id", ...columns];
  const insertValues = [id, ...values];
  const placeholders = insertValues
    .map((_, index) => `$${index + 1}`)
    .join(", ");
  const result = await target.query(
    `insert into public.${tableName} (${insertColumns.join(", ")}) values (${placeholders}) returning id`,
    insertValues,
  );
  const insertedId = text(result.rows[0]?.id);
  if (!insertedId) throw new Error(`Insert into ${tableName} did not return an id.`);
  return insertedId;
}

async function insertWithoutId(
  tableName: string,
  columns: string[],
  values: unknown[],
): Promise<void> {
  const placeholders = values.map((_, index) => `$${index + 1}`).join(", ");
  await target.query(
    `insert into public.${tableName} (${columns.join(", ")}) values (${placeholders})`,
    values,
  );
}

async function ensureDestinationIsEmpty(): Promise<void> {
  const populatedTables: string[] = [];
  for (const tableName of destinationTableNames) {
    const result = await target.query(
      `select exists(select 1 from public.${tableName} limit 1) as populated`,
    );
    if (result.rows[0]?.populated === true) populatedTables.push(tableName);
  }
  if (populatedTables.length > 0) {
    throw new Error(
      `Supabase contains RadarOH data in ${populatedTables.length} table(s). ` +
      "The destination must be completely empty; no existing data was changed.",
    );
  }
}

async function validateSourceSnapshot(): Promise<Row[]> {
  const workspaces = await rows("radar_workspaces");
  if (
    workspaces.length !== 1 ||
    text(workspaces[0]?.id) !== EXPECTED_WORKSPACE_ID
  ) {
    throw new Error(
      "Source validation failed: expected exactly the oh-casas workspace and no others.",
    );
  }

  const runningChecks = [
    ["radar_worker_jobs", "jobs"],
    ["radar_monitor_runs", "monitor runs"],
    ["radar_ai_analyses", "AI analyses"],
  ] as const;
  for (const [tableName, label] of runningChecks) {
    const result = await source.query(
      `select count(*)::int as count from public.${tableName} where status = $1`,
      ["running"],
    );
    if (numberValue(result.rows[0]?.count) !== 0) {
      throw new Error(
        `Source is not drained: ${label} are still running. Stop and drain the worker before retrying.`,
      );
    }
  }
  return workspaces;
}

async function scalarCount(
  client: InstanceType<typeof Client>,
  query: string,
): Promise<number> {
  const result = await client.query(query);
  return numberValue(result.rows[0]?.count);
}

async function verifyCopiedCounts(): Promise<void> {
  for (const tableName of tableNames) {
    const sourceCount = await scalarCount(
      source,
      `select count(*)::int as count from public.${tableName}`,
    );
    const targetCount = await scalarCount(
      target,
      `select count(*)::int as count from public.${tableName}`,
    );
    if (sourceCount !== targetCount) {
      throw new Error(
        `Verification failed for ${tableName}: source and target counts differ.`,
      );
    }
  }

  const sourceCount = await scalarCount(
    source,
    "select count(*)::int as count from public.radar_sources",
  );
  const runtimeCount = await scalarCount(
    target,
    "select count(*)::int as count from public.radar_source_runtime",
  );
  if (sourceCount !== runtimeCount) {
    throw new Error(
      "Verification failed: every migrated source must have one runtime row.",
    );
  }

  const analysisEvidenceSourceCount = await scalarCount(
    source,
    `select count(*)::int as count
       from public.radar_ai_analyses analysis
       cross join lateral (
         select distinct value
         from jsonb_array_elements_text(analysis.evidence_ids)
       ) evidence`,
  );
  const analysisEvidenceTargetCount = await scalarCount(
    target,
    "select count(*)::int as count from public.radar_ai_analysis_evidence",
  );
  if (analysisEvidenceSourceCount !== analysisEvidenceTargetCount) {
    throw new Error(
      "Verification failed for normalized AI analysis evidence.",
    );
  }

  const findingEvidenceSourceCount = await scalarCount(
    source,
    `select count(*)::int as count
       from public.radar_ai_findings finding
       cross join lateral (
         select distinct value
         from jsonb_array_elements_text(finding.evidence_ids)
       ) evidence`,
  );
  const findingEvidenceTargetCount = await scalarCount(
    target,
    "select count(*)::int as count from public.radar_ai_finding_evidence",
  );
  if (findingEvidenceSourceCount !== findingEvidenceTargetCount) {
    throw new Error(
      "Verification failed for normalized AI finding evidence.",
    );
  }
}

async function migrate(): Promise<void> {
  await source.connect();
  await target.connect();
  await source.query("begin transaction isolation level repeatable read read only");
  sourceTransactionOpen = true;
  await target.query("begin transaction isolation level serializable");
  targetTransactionOpen = true;
  await target.query(
    "select pg_advisory_xact_lock(hashtextextended($1, 0))",
    [MIGRATION_LOCK_KEY],
  );
  await ensureDestinationIsEmpty();

  const workspaces = await validateSourceSnapshot();
  for (const row of workspaces) {
    const newId = await insert(
      "radar_workspaces",
      ["legacy_key", "name", "created_at"],
      [text(row.id), text(row.name), row.created_at],
    );
    mapFor("radar_workspaces").set(text(row.id), newId);
  }

  const workspaceId = mapFor("radar_workspaces").get(EXPECTED_WORKSPACE_ID);
  if (!workspaceId) throw new Error("The oh-casas workspace was not found.");

  for (const row of await rows("radar_competitors")) {
    const newId = await insert(
      "radar_competitors",
      [
        "workspace_id", "legacy_id", "nombre", "ubicacion", "especialidad",
        "rango_precio", "web", "redes", "fortalezas", "debilidades", "notas",
        "prioridad", "estado", "raw_record", "created_at", "updated_at",
      ],
      [
        workspaceId, text(row.legacy_id, text(row.id)), text(row.nombre),
        text(row.ubicacion), text(row.especialidad), text(row.rango_precio),
        text(row.web), text(row.redes), text(row.fortalezas),
        text(row.debilidades), text(row.notas), text(row.prioridad),
        text(row.estado), jsonValue(row.raw_record, {}), row.created_at,
        row.updated_at,
      ],
    );
    mapFor("radar_competitors").set(text(row.id), newId);
  }

  for (const row of await rows("radar_keywords")) {
    const newId = await insert(
      "radar_keywords",
      [
        "workspace_id", "legacy_id", "termino", "volumen", "posicion", "notas",
        "raw_record", "created_at", "updated_at",
      ],
      [
        workspaceId, text(row.legacy_id, text(row.id)), text(row.termino),
        text(row.volumen), text(row.posicion), text(row.notas),
        jsonValue(row.raw_record, {}), row.created_at, row.updated_at,
      ],
    );
    mapFor("radar_keywords").set(text(row.id), newId);
  }

  for (const row of await rows("radar_sources")) {
    const competitorId = row.competitor_id
      ? uuidFor("radar_competitors", row.competitor_id)
      : null;
    const newId = await insert(
      "radar_sources",
      [
        "workspace_id", "legacy_id", "termino", "tipo", "frecuencia", "notas",
        "connector", "endpoint_url", "enabled", "competitor_id", "raw_record",
        "last_run_at", "next_run_at", "last_status", "last_error",
        "consecutive_failures", "last_changed_at", "created_at", "updated_at",
      ],
      [
        workspaceId, text(row.legacy_id, text(row.id)), text(row.termino),
        text(row.tipo), text(row.frecuencia), text(row.notas),
        text(row.connector, "manual"), text(row.endpoint_url), Boolean(row.enabled),
        competitorId, jsonValue(row.raw_record, {}), row.last_run_at,
        row.next_run_at, text(row.last_status, "idle"), text(row.last_error),
        numberValue(row.consecutive_failures), row.last_changed_at,
        row.created_at, row.updated_at,
      ],
    );
    mapFor("radar_sources").set(text(row.id), newId);
  }

  for (const row of await rows("radar_plan_items")) {
    const newId = await insert(
      "radar_plan_items",
      [
        "workspace_id", "legacy_id", "horizon", "text", "done", "raw_record",
        "created_at", "updated_at",
      ],
      [
        workspaceId, text(row.legacy_id, text(row.id)), numberValue(row.horizon),
        text(row.text), Boolean(row.done), jsonValue(row.raw_record, {}),
        row.created_at, row.updated_at,
      ],
    );
    mapFor("radar_plan_items").set(text(row.id), newId);
  }

  for (const sourceTable of [
    "radar_imports",
    "radar_monitor_runs",
    "radar_monitor_evidence",
    "radar_change_events",
    "radar_ai_analyses",
    "radar_ai_findings",
    "radar_ai_alerts",
    "radar_activity_log",
    "radar_integrations",
    "radar_webhook_subscriptions",
    "radar_integration_deliveries",
    "radar_worker_jobs",
    "radar_worker_leases",
  ]) {
    // These tables are intentionally copied in the dependency-specific
    // passes below. Keeping the source list here documents the full scope.
    void sourceTable;
  }

  for (const row of await rows("radar_imports")) {
    const newId = await insert(
      "radar_imports",
      [
        "workspace_id", "legacy_id", "source_filename", "source_exported_at",
        "source_checksum", "raw_payload", "record_counts",
        "validation_issues", "created_at",
      ],
      [
        workspaceId, text(row.id), row.source_filename, row.source_exported_at,
        text(row.source_checksum), jsonValue(row.raw_payload, {}),
        jsonValue(row.record_counts, {}), jsonValue(row.validation_issues, []),
        row.created_at,
      ],
    );
    mapFor("radar_imports").set(text(row.id), newId);
  }

  for (const row of await rows("radar_monitor_runs")) {
    const newId = await insert(
      "radar_monitor_runs",
      [
        "workspace_id", "legacy_id", "source_id", "trigger", "status",
        "started_at", "finished_at", "attempts", "item_count", "change_count",
        "http_status", "error_message", "duration_ms",
      ],
      [
        workspaceId, text(row.id), uuidFor("radar_sources", row.source_id),
        text(row.trigger), text(row.status), row.started_at, row.finished_at,
        numberValue(row.attempts), numberValue(row.item_count),
        numberValue(row.change_count), row.http_status, text(row.error_message),
        row.duration_ms,
      ],
    );
    mapFor("radar_monitor_runs").set(text(row.id), newId);
  }

  for (const row of await rows("radar_monitor_evidence")) {
    const newId = await insert(
      "radar_monitor_evidence",
      [
        "workspace_id", "legacy_id", "source_id", "run_id", "item_key",
        "fingerprint", "title", "url", "published_at", "normalized_text",
        "raw_payload", "observed_at",
      ],
      [
        workspaceId, text(row.id), uuidFor("radar_sources", row.source_id),
        uuidFor("radar_monitor_runs", row.run_id), text(row.item_key),
        text(row.fingerprint), text(row.title), text(row.url), row.published_at,
        text(row.normalized_text), jsonValue(row.raw_payload, {}),
        row.observed_at,
      ],
    );
    mapFor("radar_monitor_evidence").set(text(row.id), newId);
  }

  for (const row of await rows("radar_change_events")) {
    const newId = await insert(
      "radar_change_events",
      [
        "workspace_id", "legacy_id", "source_id", "run_id", "evidence_id",
        "competitor_id", "change_type", "title", "summary", "url",
        "previous_fingerprint", "fingerprint", "occurred_at",
      ],
      [
        workspaceId, text(row.id), uuidFor("radar_sources", row.source_id),
        uuidFor("radar_monitor_runs", row.run_id),
        uuidFor("radar_monitor_evidence", row.evidence_id),
        row.competitor_id ? uuidFor("radar_competitors", row.competitor_id) : null,
        text(row.change_type), text(row.title), text(row.summary), text(row.url),
        row.previous_fingerprint, text(row.fingerprint), row.occurred_at,
      ],
    );
    mapFor("radar_change_events").set(text(row.id), newId);
  }

  for (const row of await rows("radar_ai_analyses")) {
    const evidenceIds = mappedEvidenceIds(row.evidence_ids);
    const newId = await insert(
      "radar_ai_analyses",
      [
        "workspace_id", "legacy_id", "trigger", "model", "status",
        "source_evidence_count", "event_count", "summary", "evidence_ids", "trends",
        "attempt_count", "attempt_errors", "error_message", "started_at",
        "completed_at",
      ],
      [
        workspaceId, text(row.id), text(row.trigger), text(row.model),
        text(row.status), numberValue(row.source_evidence_count),
        numberValue(row.event_count), text(row.summary),
        jsonValue(evidenceIds, []), jsonValue(row.trends, []), numberValue(row.attempt_count),
        jsonValue(row.attempt_errors, []), text(row.error_message),
        row.started_at, row.completed_at,
      ],
    );
    mapFor("radar_ai_analyses").set(text(row.id), newId);
  }

  for (const row of await rows("radar_ai_findings")) {
    const evidenceIds = mappedEvidenceIds(row.evidence_ids);
    const newId = await insert(
      "radar_ai_findings",
      [
        "workspace_id", "legacy_id", "analysis_id", "change_event_id",
        "event_type", "importance", "relevance", "confidence", "title",
        "summary", "rationale", "opportunity", "risk", "trend",
        "suggested_updates", "evidence_ids", "created_at",
      ],
      [
        workspaceId, text(row.id), uuidFor("radar_ai_analyses", row.analysis_id),
        row.change_event_id ? uuidFor("radar_change_events", row.change_event_id) : null,
        text(row.event_type), text(row.importance), numberValue(row.relevance),
        numberValue(row.confidence), text(row.title), text(row.summary),
        text(row.rationale), text(row.opportunity), text(row.risk),
        text(row.trend), jsonValue(row.suggested_updates, []),
        jsonValue(evidenceIds, []),
        row.created_at,
      ],
    );
    mapFor("radar_ai_findings").set(text(row.id), newId);
  }

  for (const row of await rows("radar_ai_alerts")) {
    const newId = await insert(
      "radar_ai_alerts",
      [
        "workspace_id", "legacy_id", "finding_id", "competitor_id", "title",
        "description", "importance", "dedupe_key", "status", "created_at",
        "read_at",
      ],
      [
        workspaceId, text(row.id), uuidFor("radar_ai_findings", row.finding_id),
        row.competitor_id ? uuidFor("radar_competitors", row.competitor_id) : null,
        text(row.title), text(row.description), text(row.importance),
        row.dedupe_key, text(row.status, "unread"), row.created_at, row.read_at,
      ],
    );
    mapFor("radar_ai_alerts").set(text(row.id), newId);
  }

  for (const row of await rows("radar_activity_log")) {
    const newId = await insert(
      "radar_activity_log",
      [
        "workspace_id", "legacy_id", "action", "entity_type", "entity_id",
        "metadata", "created_at",
      ],
      [
        workspaceId, text(row.id), text(row.action), text(row.entity_type),
        row.entity_id, jsonValue(row.metadata, {}), row.created_at,
      ],
    );
    mapFor("radar_activity_log").set(text(row.id), newId);
  }

  for (const row of await rows("radar_alert_preferences")) {
    await insertWithoutId(
      "radar_alert_preferences",
      [
        "workspace_id", "enabled", "minimum_importance", "minimum_relevance",
        "minimum_confidence", "internal_enabled", "channels", "updated_at",
      ],
      [
        workspaceId, Boolean(row.enabled), text(row.minimum_importance, "high"),
        numberValue(row.minimum_relevance, 70),
        numberValue(row.minimum_confidence, 60), Boolean(row.internal_enabled),
        Array.isArray(row.channels) ? row.channels : ["internal"], row.updated_at,
      ],
    );
  }

  for (const row of await rows("radar_integrations")) {
    const newId = await insert(
      "radar_integrations",
      [
        "workspace_id", "legacy_id", "name", "provider", "category", "status",
        "documentation_url", "authorized", "scopes", "last_checked_at",
        "last_error", "created_by_subject", "created_at", "updated_at",
      ],
      [
        workspaceId, text(row.id), text(row.name), text(row.provider),
        text(row.category), text(row.status, "pending_authorization"),
        text(row.documentation_url), Boolean(row.authorized),
        Array.isArray(row.scopes) ? row.scopes : [], row.last_checked_at,
        text(row.last_error), text(row.created_by_user_id, "system"),
        row.created_at, row.updated_at,
      ],
    );
    mapFor("radar_integrations").set(text(row.id), newId);
  }

  for (const row of await rows("radar_webhook_subscriptions")) {
    const newId = await insert(
      "radar_webhook_subscriptions",
      [
        "workspace_id", "legacy_id", "integration_id", "name", "endpoint_url",
        "event_types", "status", "authorized", "max_attempts",
        "consecutive_failures", "last_delivery_at", "last_error",
        "created_at", "updated_at",
      ],
      [
        workspaceId, text(row.id),
        uuidFor("radar_integrations", row.integration_id), text(row.name),
        text(row.endpoint_url), Array.isArray(row.event_types) ? row.event_types : [],
        text(row.status, "paused"), Boolean(row.authorized),
        numberValue(row.max_attempts, 5), numberValue(row.consecutive_failures),
        row.last_delivery_at, text(row.last_error), row.created_at, row.updated_at,
      ],
    );
    mapFor("radar_webhook_subscriptions").set(text(row.id), newId);
  }

  for (const row of await rows("radar_integration_deliveries")) {
    const newId = await insert(
      "radar_integration_deliveries",
      [
        "workspace_id", "legacy_id", "webhook_id", "event_type", "payload",
        "status", "attempts", "next_attempt_at", "last_error", "delivered_at",
        "created_at",
      ],
      [
        workspaceId, text(row.id),
        uuidFor("radar_webhook_subscriptions", row.webhook_id),
        text(row.event_type), jsonValue(row.payload, {}),
        text(row.status, "pending"), numberValue(row.attempts),
        row.next_attempt_at, text(row.last_error), row.delivered_at,
        row.created_at,
      ],
    );
    mapFor("radar_integration_deliveries").set(text(row.id), newId);
  }

  for (const row of await rows("radar_worker_jobs")) {
    const newId = await insert(
      "radar_worker_jobs",
      [
        "workspace_id", "legacy_id", "job_key", "kind", "source_id", "status",
        "available_at", "attempts", "locked_at", "locked_by", "started_at",
        "finished_at", "error_message", "payload", "created_at", "updated_at",
      ],
      [
        workspaceId, text(row.id), text(row.job_key), text(row.kind),
        row.source_id ? uuidFor("radar_sources", row.source_id) : null,
        text(row.status, "queued"), row.available_at, numberValue(row.attempts),
        row.locked_at, row.locked_by, row.started_at, row.finished_at,
        text(row.error_message), jsonValue(row.payload, {}), row.created_at,
        row.updated_at,
      ],
    );
    mapFor("radar_worker_jobs").set(text(row.id), newId);
  }

  for (const row of await rows("radar_worker_leases")) {
    const newId = await insert(
      "radar_worker_leases",
      [
        "workspace_id", "legacy_id", "owner_id", "acquired_at", "heartbeat_at",
        "expires_at", "updated_at",
      ],
      [
        workspaceId, text(row.id), text(row.owner_id), row.acquired_at,
        row.heartbeat_at, row.expires_at, row.updated_at,
      ],
    );
    mapFor("radar_worker_leases").set(text(row.id), newId);
  }

  await verifyCopiedCounts();
  await target.query("commit");
  targetTransactionOpen = false;
  await source.query("commit");
  sourceTransactionOpen = false;
}

async function main(): Promise<void> {
  try {
    await migrate();
    console.info(
      "RadarOH migration completed. Run the independent verification queries before cutover.",
    );
  } catch (error) {
    await Promise.allSettled([
      targetTransactionOpen ? target.query("rollback") : Promise.resolve(),
      sourceTransactionOpen ? source.query("rollback") : Promise.resolve(),
    ]);
    targetTransactionOpen = false;
    sourceTransactionOpen = false;
    throw error;
  } finally {
    await Promise.allSettled([source.end(), target.end()]);
  }
}

await main();
