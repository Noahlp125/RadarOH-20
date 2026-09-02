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

export const radarKeywords = pgTable(
  "radar_keywords",
  {
    id: text("id").primaryKey(),
    workspaceId: text("workspace_id")
      .notNull()
      .references(() => radarWorkspaces.id, { onDelete: "cascade" }),
    legacyId: text("legacy_id").notNull(),
    termino: text("termino").notNull(),
    volumen: text("volumen").notNull(),
    posicion: text("posicion").notNull().default(""),
    notas: text("notas").notNull().default(""),
    rawRecord: jsonb("raw_record").$type<Record<string, unknown>>().notNull(),
    createdAt: timestamp("created_at", { withTimezone: true })
      .notNull()
      .defaultNow(),
    updatedAt: timestamp("updated_at", { withTimezone: true })
      .notNull()
      .defaultNow(),
  },
  (table) => [
    uniqueIndex("radar_keywords_workspace_legacy_id_idx").on(
      table.workspaceId,
      table.legacyId,
    ),
    index("radar_keywords_workspace_idx").on(table.workspaceId),
    pgPolicy("radar_keyword_access", {
      as: "permissive",
      for: "all",
      to: "public",
      using: sql`workspace_id = current_setting('app.workspace_id', true)`,
      withCheck: sql`workspace_id = current_setting('app.workspace_id', true)`,
    }),
  ],
).enableRLS();

export type RadarKeyword = typeof radarKeywords.$inferSelect;
export type InsertRadarKeyword = typeof radarKeywords.$inferInsert;