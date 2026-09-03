import pg from "pg";

const { Client } = pg;

type Row = Record<string, unknown>;
type IdMap = Map<string, string>;

const sourceUrl = process.env.DATABASE_URL;
const targetUrl = process.env.SUPABASE_DB_URL;

if (!sourceUrl) {
  throw new Error("DATABASE_URL must point to the current Replit database.");
}
if (!targetUrl) {
  throw new Error("SUPABASE_DB_URL must point to the prepared Supabase database.");
}

if (process.env.RADAR_MIGRATION_CONFIRM !== "YES") {
  throw new Error(
    "Migration is blocked by default. Set RADAR_MIGRATION_CONFIRM=YES only after reviewing the plan.",
  );
}

const source = new Client({ connectionString: sourceUrl });
const target = new Client({ connectionString: targetUrl });

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
  return typeof value === "number" && Number.isFinite(value) ? value : fallback;
}

function jsonValue(value: unknown, fallback: unknown): unknown {
  return value === null || value === undefined ? fallback : value;
}

function uuidFor(tableName: string, oldId: unknown): string {
  const old = text(oldId);
  if (!old) throw new Error(`Missing legacy ID in ${tableName}.`);
  const mapped = mapFor(tableName).get(old);
  if (!mapped) throw new Error(`Missing ${tableName} mapping for ${old}.`);
  return mapped;
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
  const placeholders = values.map((_, index) => `$${index + 1}`).join(", ");
  const result = await target.query(
    `insert into public.${tableName} (${columns.join(", ")}) values (${placeholders}) returning id`,
    values,
  );
  const id = text(result.rows[0]?.id);
  if (!id) throw new Error(`Insert into ${tableName} did not return an id.`);
  return id;
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
  const result = await target.query(
    "select count(*)::int as count from public.radar_workspaces where legacy_key = $1",
    ["oh-casas"],
  );
  if (numberValue(result.rows[0]?.count) !== 0) {
    throw new Error(
      "Supabase already contains the oh-casas workspace. No existing data was changed.",
    );
  }
}

async function migrate(): Promise<void> {
  await source.connect();
  await target.connect();
  await ensureDestinationIsEmpty();
  await target.query("begin");

  const workspaces = await rows("radar_workspaces");
  for (const row of workspaces) {
    const newId = await insert(
      "radar_workspaces",
      ["legacy_key", "name", "created_at"],
      [text(row.id), text(row.name), row.created_at],
    );
    mapFor("radar_workspaces").set(text(row.id), newId);
  }

  const workspaceId = mapFor("radar_workspaces").get("oh-casas");
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
        "created_at", "updated_at",
      ],
      [
        workspaceId, text(row.legacy_id, text(row.id)), text(row.termino),
        text(row.tipo), text(row.frecuencia), text(row.notas),
        text(row.connector, "manual"), text(row.endpoint_url), Boolean(row.enabled),
        competitorId, jsonValue(row.raw_record, {}), row.created_at,
        row.updated_at,
      ],
    );
    mapFor("radar_sources").set(text(row.id), newId);
    await insertWithoutId(
      "radar_source_runtime",
      [
        "source_id", "last_run_at", "next_run_at", "last_status", "last_error",
        "consecutive_failures", "last_changed_at", "updated_at",
      ],
      [
        newId, row.last_run_at, row.next_run_at, text(row.last_status, "idle"),
        text(row.last_error), numberValue(row.consecutive_failures),
        row.last_changed_at, row.updated_at,
      ],
    );
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
    const newId = await insert(
      "radar_ai_analyses",
      [
        "workspace_id", "legacy_id", "trigger", "model", "status",
        "source_evidence_count", "event_count", "summary", "trends",
        "attempt_count", "attempt_errors", "error_message", "started_at",
        "completed_at",
      ],
      [
        workspaceId, text(row.id), text(row.trigger), text(row.model),
        text(row.status), numberValue(row.source_evidence_count),
        numberValue(row.event_count), text(row.summary),
        jsonValue(row.trends, []), numberValue(row.attempt_count),
        jsonValue(row.attempt_errors, []), text(row.error_message),
        row.started_at, row.completed_at,
      ],
    );
    mapFor("radar_ai_analyses").set(text(row.id), newId);
    const evidenceIds = Array.isArray(row.evidence_ids) ? row.evidence_ids : [];
    for (const evidenceId of evidenceIds) {
      await insertWithoutId(
        "radar_ai_analysis_evidence",
        ["analysis_id", "evidence_id"],
        [newId, uuidFor("radar_monitor_evidence", evidenceId)],
      );
    }
  }

  for (const row of await rows("radar_ai_findings")) {
    const newId = await insert(
      "radar_ai_findings",
      [
        "workspace_id", "legacy_id", "analysis_id", "change_event_id",
        "event_type", "importance", "relevance", "confidence", "title",
        "summary", "rationale", "opportunity", "risk", "trend",
        "suggested_updates", "created_at",
      ],
      [
        workspaceId, text(row.id), uuidFor("radar_ai_analyses", row.analysis_id),
        row.change_event_id ? uuidFor("radar_change_events", row.change_event_id) : null,
        text(row.event_type), text(row.importance), numberValue(row.relevance),
        numberValue(row.confidence), text(row.title), text(row.summary),
        text(row.rationale), text(row.opportunity), text(row.risk),
        text(row.trend), jsonValue(row.suggested_updates, []), row.created_at,
      ],
    );
    mapFor("radar_ai_findings").set(text(row.id), newId);
    const evidenceIds = Array.isArray(row.evidence_ids) ? row.evidence_ids : [];
    for (const evidenceId of evidenceIds) {
      await insertWithoutId(
        "radar_ai_finding_evidence",
        ["finding_id", "evidence_id"],
        [newId, uuidFor("radar_monitor_evidence", evidenceId)],
      );
    }
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

  await target.query("commit");
}

async function main(): Promise<void> {
  try {
    await migrate();
    console.info(
      "RadarOH migration completed. Run the independent verification queries before cutover.",
    );
  } catch (error) {
    try {
      await target.query("rollback");
    } catch {
      // The original error is more useful than a rollback transport error.
    }
    throw error;
  } finally {
    await Promise.allSettled([source.end(), target.end()]);
  }
}

await main();
