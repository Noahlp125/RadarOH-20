import { sql } from "drizzle-orm";
import {
  index,
  jsonb,
  pgPolicy,
  pgTable,
  text,
  timestamp,
  uniqueIndex,
} from "drizzle-orm/pg-core";
import { radarWorkspaces } from "./workspaces";

export const radarCompetitors = pgTable(
  "radar_competitors",
  {
    id: text("id").primaryKey(),
    workspaceId: text("workspace_id")
      .notNull()
      .references(() => radarWorkspaces.id, { onDelete: "cascade" }),
    legacyId: text("legacy_id").notNull(),
    nombre: text("nombre").notNull(),
    ubicacion: text("ubicacion").notNull().default(""),
    especialidad: text("especialidad").notNull().default(""),
    rangoPrecio: text("rango_precio").notNull().default(""),
    web: text("web").notNull().default(""),
    redes: text("redes").notNull().default(""),
    fortalezas: text("fortalezas").notNull().default(""),
    debilidades: text("debilidades").notNull().default(""),
    notas: text("notas").notNull().default(""),
    prioridad: text("prioridad").notNull(),
    estado: text("estado").notNull(),
    rawRecord: jsonb("raw_record").$type<Record<string, unknown>>().notNull(),
    createdAt: timestamp("created_at", { withTimezone: true })
      .notNull()
      .defaultNow(),
    updatedAt: timestamp("updated_at", { withTimezone: true })
      .notNull()
      .defaultNow(),
  },
  (table) => [
    uniqueIndex("radar_competitors_workspace_legacy_id_idx").on(
      table.workspaceId,
      table.legacyId,
    ),
    index("radar_competitors_workspace_idx").on(table.workspaceId),
    pgPolicy("radar_competitor_access", {
      as: "permissive",
      for: "all",
      to: "public",
      using: sql`workspace_id = current_setting('app.workspace_id', true)`,
      withCheck: sql`workspace_id = current_setting('app.workspace_id', true)`,
    }),
  ],
).enableRLS();

export type RadarCompetitor = typeof radarCompetitors.$inferSelect;
export type InsertRadarCompetitor = typeof radarCompetitors.$inferInsert;