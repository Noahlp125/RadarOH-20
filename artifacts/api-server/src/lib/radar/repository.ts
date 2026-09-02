import { createHash, randomUUID } from "node:crypto";
import { and, asc, desc, eq, notInArray, sql } from "drizzle-orm";
import { db, type RadarTransaction } from "@workspace/db";
import {
  radarCompetitors,
  radarImports,
  radarKeywords,
  radarPlanItems,
  radarSources,
  radarWorkspaces,
} from "@workspace/db";
import {
  radarCompetitorSchema,
  radarCompetitorUpdateSchema,
  radarImportPayloadSchema,
  radarKeywordSchema,
  radarKeywordUpdateSchema,
  radarPlanItemSchema,
  radarPlanSchema,
  radarSourceSchema,
  radarSourceUpdateSchema,
  radarStateSchema,
  type RadarImportPayload,
  type RadarStateInput,
} from "./validation";
import { getRadarDatabaseRole } from "./database-security";

const configuredWorkspaceId = process.env.RADAR_WORKSPACE_ID;

if (!configuredWorkspaceId) {
  throw new Error("RADAR_WORKSPACE_ID must be configured for RadarOH.");
}

export const RADAR_WORKSPACE_ID: string = configuredWorkspaceId;

function googleNewsRssUrl(term: string) {
  return `https://news.google.com/rss/search?q=${encodeURIComponent(term)}&hl=es&gl=ES&ceid=ES:es`;
}

function publicWebsiteUrl(value: string) {
  const trimmed = value.trim();
  if (!trimmed) return "";
  const withProtocol = /^https?:\/\//i.test(trimmed) ? trimmed : `https://${trimmed}`;
  try {
    const url = new URL(withProtocol);
    if (!["http:", "https:"].includes(url.protocol)) return "";
    url.pathname = url.pathname === "/" ? "/" : `${url.pathname.replace(/\/+$/, "")}/`;
    url.search = "";
    url.hash = "";
    return url.toString();
  } catch {
    return "";
  }
}

/**
 * Turns the initial research plan into executable public monitoring sources.
 * Existing user-defined endpoints are left untouched.
 */
export async function ensureRadarMonitoringSources() {
  return withRadarTransaction(async (tx) => {
    const now = new Date();
    const sources = await tx
      .select()
      .from(radarSources)
      .where(eq(radarSources.workspaceId, RADAR_WORKSPACE_ID));
    const competitors = await tx
      .select()
      .from(radarCompetitors)
      .where(eq(radarCompetitors.workspaceId, RADAR_WORKSPACE_ID));
    let activated = 0;
    let added = 0;

    for (const source of sources) {
      if (source.connector !== "manual" || source.endpointUrl.trim()) continue;
      await tx
        .update(radarSources)
        .set({
          connector: "rss",
          endpointUrl: googleNewsRssUrl(source.termino),
          enabled: true,
          frecuencia: "Diaria",
          nextRunAt: now,
          lastStatus: "idle",
          lastError: "",
          updatedAt: now,
        })
        .where(eq(radarSources.id, source.id));
      activated += 1;
    }

    const knownWebsiteEndpoints = new Set(
      sources
        .map((source) => publicWebsiteUrl(source.endpointUrl))
        .filter(Boolean),
    );
    const knownEndpoints = new Set(
      sources.map((source) => source.endpointUrl.trim()).filter(Boolean),
    );
    for (const competitor of competitors) {
      const endpointUrl = publicWebsiteUrl(competitor.web);
      if (endpointUrl && !knownWebsiteEndpoints.has(endpointUrl)) {
        const id = randomUUID();
        await tx.insert(radarSources).values({
          id,
          legacyId: id,
          workspaceId: RADAR_WORKSPACE_ID,
          termino: competitor.nombre,
          tipo: "Competidores",
          frecuencia: "Diaria",
          notas: `Página pública de ${competitor.nombre}. Se monitoriza solo contenido público.`,
          connector: "web",
          endpointUrl,
          enabled: true,
          competitorId: competitor.id,
          nextRunAt: now,
          lastStatus: "idle",
          lastError: "",
          consecutiveFailures: 0,
          rawRecord: {
            bootstrap: "public-competitor-page",
            competitor_name: competitor.nombre,
          },
          createdAt: now,
          updatedAt: now,
        });
        knownWebsiteEndpoints.add(endpointUrl);
        knownEndpoints.add(endpointUrl);
        added += 1;
      }

      const newsEndpointUrl = googleNewsRssUrl(`"${competitor.nombre}" casas modulares`);
      if (!knownEndpoints.has(newsEndpointUrl)) {
        const id = randomUUID();
        await tx.insert(radarSources).values({
          id,
          legacyId: id,
          workspaceId: RADAR_WORKSPACE_ID,
          termino: `${competitor.nombre} — noticias`,
          tipo: "Competidores",
          frecuencia: "Diaria",
          notas: `Noticias públicas relacionadas con ${competitor.nombre}.`,
          connector: "rss",
          endpointUrl: newsEndpointUrl,
          enabled: true,
          competitorId: competitor.id,
          nextRunAt: now,
          lastStatus: "idle",
          lastError: "",
          consecutiveFailures: 0,
          rawRecord: {
            bootstrap: "public-competitor-news",
            competitor_name: competitor.nombre,
          },
          createdAt: now,
          updatedAt: now,
        });
        knownEndpoints.add(newsEndpointUrl);
        added += 1;
      }
    }

    return { activated, added };
  });
}

export type RadarSourceResponse = ReturnType<typeof mapSource>;
export type RadarCompetitorResponse = ReturnType<typeof mapCompetitor>;
export type RadarKeywordResponse = ReturnType<typeof mapKeyword>;
export type RadarPlanItemResponse = ReturnType<typeof mapPlanItem>;

type RadarStateResponse = {
  workspaceId: string;
  sources: RadarSourceResponse[];
  competitors: RadarCompetitorResponse[];
  keywords: RadarKeywordResponse[];
  plan: {
    "30": RadarPlanItemResponse[];
    "60": RadarPlanItemResponse[];
    "90": RadarPlanItemResponse[];
  };
};

function asRecord(value: unknown): Record<string, unknown> {
  if (!value || typeof value !== "object" || Array.isArray(value)) return {};
  const blocked = new Set(["__proto__", "constructor", "prototype"]);
  return Object.fromEntries(
    Object.entries(value as Record<string, unknown>)
      .filter(([key]) => !blocked.has(key))
      .slice(0, 100),
  );
}

function mapSource(row: typeof radarSources.$inferSelect) {
  return {
    ...asRecord(row.rawRecord),
    id: row.legacyId,
    termino: row.termino,
    tipo: row.tipo,
    frecuencia: row.frecuencia,
    notas: row.notas,
    connector: row.connector,
    endpoint_url: row.endpointUrl,
    enabled: row.enabled,
    competitor_id: row.competitorId,
    last_run_at: row.lastRunAt?.toISOString() ?? null,
    next_run_at: row.nextRunAt?.toISOString() ?? null,
    last_status: row.lastStatus,
    last_error: row.lastError,
    consecutive_failures: row.consecutiveFailures,
  };
}

function mapCompetitor(row: typeof radarCompetitors.$inferSelect) {
  return {
    ...asRecord(row.rawRecord),
    id: row.legacyId,
    nombre: row.nombre,
    ubicacion: row.ubicacion,
    especialidad: row.especialidad,
    rango_precio: row.rangoPrecio,
    web: row.web,
    redes: row.redes,
    fortalezas: row.fortalezas,
    debilidades: row.debilidades,
    notas: row.notas,
    prioridad: row.prioridad,
    estado: row.estado,
  };
}

function mapKeyword(row: typeof radarKeywords.$inferSelect) {
  return {
    ...asRecord(row.rawRecord),
    id: row.legacyId,
    termino: row.termino,
    volumen: row.volumen,
    posicion: row.posicion,
    notas: row.notas,
  };
}

function mapPlanItem(row: typeof radarPlanItems.$inferSelect) {
  return {
    ...asRecord(row.rawRecord),
    id: row.legacyId,
    text: row.text,
    done: row.done,
  };
}

export async function withRadarTransaction<T>(
  callback: (tx: RadarTransaction) => Promise<T>,
): Promise<T> {
  return db.transaction(async (tx) => {
    await tx.execute(
      sql`select set_config('app.workspace_id', ${RADAR_WORKSPACE_ID}, true)`,
    );
    await tx
      .insert(radarWorkspaces)
      .values({ id: RADAR_WORKSPACE_ID, name: "OH Casas" })
      .onConflictDoNothing();
    const role = getRadarDatabaseRole();
    if (!/^radar_app_[a-f0-9]{12}$/.test(role)) {
      throw new Error("RadarOH database role is not initialized");
    }
    await tx.execute(sql.raw(`set local role "${role}"`));
    return callback(tx);
  });
}

async function readStateTx(tx: RadarTransaction): Promise<RadarStateResponse> {
  const sources = await tx
    .select()
    .from(radarSources)
    .where(eq(radarSources.workspaceId, RADAR_WORKSPACE_ID))
    .orderBy(asc(radarSources.createdAt));
  const competitors = await tx
    .select()
    .from(radarCompetitors)
    .where(eq(radarCompetitors.workspaceId, RADAR_WORKSPACE_ID))
    .orderBy(asc(radarCompetitors.createdAt));
  const keywords = await tx
    .select()
    .from(radarKeywords)
    .where(eq(radarKeywords.workspaceId, RADAR_WORKSPACE_ID))
    .orderBy(asc(radarKeywords.createdAt));
  const planItems = await tx
    .select()
    .from(radarPlanItems)
    .where(eq(radarPlanItems.workspaceId, RADAR_WORKSPACE_ID))
    .orderBy(asc(radarPlanItems.createdAt));

  return {
    workspaceId: RADAR_WORKSPACE_ID,
    sources: sources.map(mapSource),
    competitors: competitors.map(mapCompetitor),
    keywords: keywords.map(mapKeyword),
    plan: {
      "30": planItems.filter((item) => item.horizon === "30").map(mapPlanItem),
      "60": planItems.filter((item) => item.horizon === "60").map(mapPlanItem),
      "90": planItems.filter((item) => item.horizon === "90").map(mapPlanItem),
    },
  };
}

export async function readRadarState(): Promise<RadarStateResponse> {
  return withRadarTransaction(readStateTx);
}

function normalizedSource(input: unknown) {
  const parsed = radarSourceSchema.parse(input);
  const id = parsed.id ?? randomUUID();
  return {
    id,
    legacyId: id,
    termino: parsed.termino,
    tipo: parsed.tipo,
    frecuencia: parsed.frecuencia,
    notas: parsed.notas,
    connector: parsed.connector,
    endpointUrl: parsed.endpoint_url,
    enabled: parsed.enabled,
    competitorId: parsed.competitor_id ?? null,
    rawRecord: asRecord(input),
  };
}

function normalizedCompetitor(input: unknown) {
  const parsed = radarCompetitorSchema.parse(input);
  const id = parsed.id ?? randomUUID();
  return {
    id,
    legacyId: id,
    nombre: parsed.nombre,
    ubicacion: parsed.ubicacion,
    especialidad: parsed.especialidad,
    rangoPrecio: parsed.rango_precio,
    web: parsed.web,
    redes: parsed.redes,
    fortalezas: parsed.fortalezas,
    debilidades: parsed.debilidades,
    notas: parsed.notas,
    prioridad: parsed.prioridad,
    estado: parsed.estado,
    rawRecord: asRecord(input),
  };
}

function normalizedKeyword(input: unknown) {
  const parsed = radarKeywordSchema.parse(input);
  const id = parsed.id ?? randomUUID();
  return {
    id,
    legacyId: id,
    termino: parsed.termino,
    volumen: parsed.volumen,
    posicion: parsed.posicion,
    notas: parsed.notas,
    rawRecord: asRecord(input),
  };
}

function normalizedPlanItem(input: unknown) {
  const parsed = radarPlanItemSchema.parse(input);
  const id = parsed.id ?? randomUUID();
  return {
    id,
    legacyId: id,
    text: parsed.text,
    done: parsed.done,
    rawRecord: asRecord(input),
  };
}

async function replaceStateTx(
  tx: RadarTransaction,
  input: RadarStateInput,
): Promise<RadarStateResponse> {
  const state = radarStateSchema.parse(input);
  const now = new Date();

  const sourceRows = state.sources.map((item: unknown) => ({
    ...normalizedSource(item),
    workspaceId: RADAR_WORKSPACE_ID,
    createdAt: now,
    updatedAt: now,
  }));
  const competitorRows = state.competitors.map((item: unknown) => ({
    ...normalizedCompetitor(item),
    workspaceId: RADAR_WORKSPACE_ID,
    createdAt: now,
    updatedAt: now,
  }));
  const keywordRows = state.keywords.map((item: unknown) => ({
    ...normalizedKeyword(item),
    workspaceId: RADAR_WORKSPACE_ID,
    createdAt: now,
    updatedAt: now,
  }));
  const planRows = (["30", "60", "90"] as const).flatMap((horizon) =>
    state.plan[horizon].map((item: unknown) => ({
      ...normalizedPlanItem(item),
      horizon,
      workspaceId: RADAR_WORKSPACE_ID,
      createdAt: now,
      updatedAt: now,
    })),
  );

  await deleteMissingRows(tx, radarPlanItems, planRows.map((row) => row.legacyId));
  await deleteMissingRows(tx, radarKeywords, keywordRows.map((row) => row.legacyId));
  for (const row of competitorRows) {
    await tx.insert(radarCompetitors).values(row).onConflictDoUpdate({
      target: radarCompetitors.id,
      set: {
        nombre: row.nombre,
        ubicacion: row.ubicacion,
        especialidad: row.especialidad,
        rangoPrecio: row.rangoPrecio,
        web: row.web,
        redes: row.redes,
        fortalezas: row.fortalezas,
        debilidades: row.debilidades,
        notas: row.notas,
        prioridad: row.prioridad,
        estado: row.estado,
        rawRecord: row.rawRecord,
        updatedAt: now,
      },
    });
  }
  for (const row of sourceRows) {
    await tx.insert(radarSources).values(row).onConflictDoUpdate({
      target: radarSources.id,
      set: {
        termino: row.termino,
        tipo: row.tipo,
        frecuencia: row.frecuencia,
        notas: row.notas,
        connector: row.connector,
        endpointUrl: row.endpointUrl,
        enabled: row.enabled,
        competitorId: row.competitorId,
        rawRecord: row.rawRecord,
        updatedAt: now,
      },
    });
  }
  for (const row of keywordRows) {
    await tx.insert(radarKeywords).values(row).onConflictDoUpdate({
      target: radarKeywords.id,
      set: {
        termino: row.termino,
        volumen: row.volumen,
        posicion: row.posicion,
        notas: row.notas,
        rawRecord: row.rawRecord,
        updatedAt: now,
      },
    });
  }
  for (const row of planRows) {
    await tx.insert(radarPlanItems).values(row).onConflictDoUpdate({
      target: radarPlanItems.id,
      set: {
        horizon: row.horizon,
        text: row.text,
        done: row.done,
        rawRecord: row.rawRecord,
        updatedAt: now,
      },
    });
  }

  return readStateTx(tx);
}

async function deleteMissingRows(
  tx: RadarTransaction,
  table: typeof radarSources | typeof radarCompetitors | typeof radarKeywords | typeof radarPlanItems,
  legacyIds: string[],
) {
  const workspaceColumn = table.workspaceId;
  const legacyIdColumn = table.legacyId;
  const condition = legacyIds.length
    ? and(
        eq(workspaceColumn, RADAR_WORKSPACE_ID),
        notInArray(legacyIdColumn, legacyIds),
      )
    : eq(workspaceColumn, RADAR_WORKSPACE_ID);
  await tx.delete(table).where(condition);
}

export async function replaceRadarState(
  input: unknown,
): Promise<RadarStateResponse> {
  return withRadarTransaction((tx) => replaceStateTx(tx, radarStateSchema.parse(input)));
}

export async function importRadarPayload(
  payloadInput: unknown,
  sourceFilename?: string,
): Promise<{ importId: string; state: RadarStateResponse; validation: Record<string, number> }> {
  const payload = radarImportPayloadSchema.parse(payloadInput);
  return withRadarTransaction(async (tx) => {
    const current = await readStateTx(tx);
    const merged = radarStateSchema.parse({
      sources: payload.sources ?? current.sources,
      competitors: payload.competitors ?? current.competitors,
      keywords: payload.keywords ?? current.keywords,
      plan: {
        "30": payload.plan?.["30"] ?? current.plan["30"],
        "60": payload.plan?.["60"] ?? current.plan["60"],
        "90": payload.plan?.["90"] ?? current.plan["90"],
      },
    });
    const state = await replaceStateTx(tx, merged);
    const importId = randomUUID();
    await tx.insert(radarImports).values({
      id: importId,
      workspaceId: RADAR_WORKSPACE_ID,
      sourceFilename: sourceFilename ?? null,
      sourceExportedAt: parseExportedAt(payload.exportedAt),
      sourceChecksum: createHash("sha256")
        .update(JSON.stringify(payload))
        .digest("hex"),
      rawPayload: payload as Record<string, unknown>,
      recordCounts: {
        sources: payload.sources?.length ?? 0,
        competitors: payload.competitors?.length ?? 0,
        keywords: payload.keywords?.length ?? 0,
        planItems: countPlanItems(payload.plan),
      },
      validationIssues: [],
    });
    return {
      importId,
      state,
      validation: {
        sources: merged.sources.length,
        competitors: merged.competitors.length,
        keywords: merged.keywords.length,
        planItems: countPlanItems(merged.plan),
      },
    };
  });
}

function countPlanItems(plan: RadarImportPayload["plan"] | RadarStateInput["plan"] | undefined) {
  if (!plan) return 0;
  return plan["30"].length + plan["60"].length + plan["90"].length;
}

function parseExportedAt(value: string | undefined): Date | null {
  if (!value) return null;
  const date = new Date(value);
  return Number.isNaN(date.getTime()) ? null : date;
}

export async function createRadarSource(input: unknown) {
  return withRadarTransaction(async (tx) => {
    const row = normalizedSource(input);
    const [created] = await tx.insert(radarSources).values({
      ...row,
      workspaceId: RADAR_WORKSPACE_ID,
    }).returning();
    return mapSource(created);
  });
}

export async function updateRadarSource(id: string, input: unknown) {
  return withRadarTransaction(async (tx) => {
    const [existing] = await tx.select().from(radarSources).where(and(
      eq(radarSources.workspaceId, RADAR_WORKSPACE_ID),
      eq(radarSources.legacyId, id),
    ));
    if (!existing) return null;
    const patch = radarSourceUpdateSchema.parse(input);
    const next = radarSourceSchema.parse({ ...mapSource(existing), ...patch, id });
    const [updated] = await tx.update(radarSources).set({
      termino: next.termino,
      tipo: next.tipo,
      frecuencia: next.frecuencia,
      notas: next.notas,
      connector: next.connector,
      endpointUrl: next.endpoint_url,
      enabled: next.enabled,
      competitorId: next.competitor_id ?? null,
      rawRecord: { ...asRecord(existing.rawRecord), ...asRecord(input) },
      updatedAt: new Date(),
    }).where(eq(radarSources.id, existing.id)).returning();
    return mapSource(updated);
  });
}

export async function deleteRadarSource(id: string) {
  return withRadarTransaction(async (tx) => {
    const [deleted] = await tx.delete(radarSources).where(and(
      eq(radarSources.workspaceId, RADAR_WORKSPACE_ID),
      eq(radarSources.legacyId, id),
    )).returning({ id: radarSources.id });
    return Boolean(deleted);
  });
}

export async function createRadarCompetitor(input: unknown) {
  return withRadarTransaction(async (tx) => {
    const row = normalizedCompetitor(input);
    const [created] = await tx.insert(radarCompetitors).values({
      ...row,
      workspaceId: RADAR_WORKSPACE_ID,
    }).returning();
    return mapCompetitor(created);
  });
}

export async function updateRadarCompetitor(id: string, input: unknown) {
  return withRadarTransaction(async (tx) => {
    const [existing] = await tx.select().from(radarCompetitors).where(and(
      eq(radarCompetitors.workspaceId, RADAR_WORKSPACE_ID),
      eq(radarCompetitors.legacyId, id),
    ));
    if (!existing) return null;
    const patch = radarCompetitorUpdateSchema.parse(input);
    const next = radarCompetitorSchema.parse({ ...mapCompetitor(existing), ...patch, id });
    const [updated] = await tx.update(radarCompetitors).set({
      nombre: next.nombre,
      ubicacion: next.ubicacion,
      especialidad: next.especialidad,
      rangoPrecio: next.rango_precio,
      web: next.web,
      redes: next.redes,
      fortalezas: next.fortalezas,
      debilidades: next.debilidades,
      notas: next.notas,
      prioridad: next.prioridad,
      estado: next.estado,
      rawRecord: { ...asRecord(existing.rawRecord), ...asRecord(input) },
      updatedAt: new Date(),
    }).where(eq(radarCompetitors.id, existing.id)).returning();
    return mapCompetitor(updated);
  });
}

export async function deleteRadarCompetitor(id: string) {
  return withRadarTransaction(async (tx) => {
    const [deleted] = await tx.delete(radarCompetitors).where(and(
      eq(radarCompetitors.workspaceId, RADAR_WORKSPACE_ID),
      eq(radarCompetitors.legacyId, id),
    )).returning({ id: radarCompetitors.id });
    return Boolean(deleted);
  });
}

export async function createRadarKeyword(input: unknown) {
  return withRadarTransaction(async (tx) => {
    const row = normalizedKeyword(input);
    const [created] = await tx.insert(radarKeywords).values({
      ...row,
      workspaceId: RADAR_WORKSPACE_ID,
    }).returning();
    return mapKeyword(created);
  });
}

export async function updateRadarKeyword(id: string, input: unknown) {
  return withRadarTransaction(async (tx) => {
    const [existing] = await tx.select().from(radarKeywords).where(and(
      eq(radarKeywords.workspaceId, RADAR_WORKSPACE_ID),
      eq(radarKeywords.legacyId, id),
    ));
    if (!existing) return null;
    const patch = radarKeywordUpdateSchema.parse(input);
    const next = radarKeywordSchema.parse({ ...mapKeyword(existing), ...patch, id });
    const [updated] = await tx.update(radarKeywords).set({
      termino: next.termino,
      volumen: next.volumen,
      posicion: next.posicion,
      notas: next.notas,
      rawRecord: { ...asRecord(existing.rawRecord), ...asRecord(input) },
      updatedAt: new Date(),
    }).where(eq(radarKeywords.id, existing.id)).returning();
    return mapKeyword(updated);
  });
}

export async function deleteRadarKeyword(id: string) {
  return withRadarTransaction(async (tx) => {
    const [deleted] = await tx.delete(radarKeywords).where(and(
      eq(radarKeywords.workspaceId, RADAR_WORKSPACE_ID),
      eq(radarKeywords.legacyId, id),
    )).returning({ id: radarKeywords.id });
    return Boolean(deleted);
  });
}