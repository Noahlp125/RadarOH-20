import { sql } from "drizzle-orm";
import {
  index,
  jsonb,
  pgPolicy,
  pgTable,
  text,
  timestamp,
  uniqueIndex,
  boolean,
  integer,
} from "drizzle-orm/pg-core";
import { radarWorkspaces } from "./workspaces";
import { radarCompetitors } from "./competitors";

export const radarSources = pgTable(
  "radar_sources",
  {
    id: text("id").primaryKey(),
    workspaceId: text("workspace_id")
      .notNull()
      .references(() => radarWorkspaces.id, { onDelete: "cascade" }),
    legacyId: text("legacy_id").notNull(),
    termino: text("termino").notNull(),
    tipo: text("tipo").notNull(),
    frecuencia: text("frecuencia").notNull(),
    notas: text("notas").notNull().default(""),
    connector: text("connector").notNull().default("manual"),
    endpointUrl: text("endpoint_url").notNull().default(""),
    enabled: boolean("enabled").notNull().default(false),
    competitorId: text("competitor_id").references(() => radarCompetitors.id, {
      onDelete: "set null",
    }),
    lastRunAt: timestamp("last_run_at", { withTimezone: true }),
    nextRunAt: timestamp("next_run_at", { withTimezone: true }),
    lastStatus: text("last_status").notNull().default("idle"),
    lastError: text("last_error").notNull().default(""),
    consecutiveFailures: integer("consecutive_failures").notNull().default(0),
    lastChangedAt: timestamp("last_changed_at", { withTimezone: true }),
    rawRecord: jsonb("raw_record").$type<Record<string, unknown>>().notNull(),
    createdAt: timestamp("created_at", { withTimezone: true })
      .notNull()
      .defaultNow(),
    updatedAt: timestamp("updated_at", { withTimezone: true })
      .notNull()
      .defaultNow(),
  },
  (table) => [
    uniqueIndex("radar_sources_workspace_legacy_id_idx").on(
      table.workspaceId,
      table.legacyId,
    ),
    index("radar_sources_workspace_idx").on(table.workspaceId),
    pgPolicy("radar_source_access", {
      as: "permissive",
      for: "all",
      to: "public",
      using: sql`workspace_id = current_setting('app.workspace_id', true)`,
      withCheck: sql`workspace_id = current_setting('app.workspace_id', true)`,
    }),
  ],
).enableRLS();

export type RadarSource = typeof radarSources.$inferSelect;
export type InsertRadarSource = typeof radarSources.$inferInsert;