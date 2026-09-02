import { sql } from "drizzle-orm";
import {
  index,
  jsonb,
  pgPolicy,
  pgTable,
  text,
  timestamp,
} from "drizzle-orm/pg-core";
import { radarWorkspaces } from "./workspaces";

export const radarImports = pgTable(
  "radar_imports",
  {
    id: text("id").primaryKey(),
    workspaceId: text("workspace_id")
      .notNull()
      .references(() => radarWorkspaces.id, { onDelete: "cascade" }),
    sourceFilename: text("source_filename"),
    sourceExportedAt: timestamp("source_exported_at", { withTimezone: true }),
    sourceChecksum: text("source_checksum").notNull(),
    rawPayload: jsonb("raw_payload").$type<Record<string, unknown>>().notNull(),
    recordCounts: jsonb("record_counts")
      .$type<Record<string, number>>()
      .notNull(),
    validationIssues: jsonb("validation_issues")
      .$type<string[]>()
      .notNull()
      .default([]),
    createdAt: timestamp("created_at", { withTimezone: true })
      .notNull()
      .defaultNow(),
  },
  (table) => [
    index("radar_imports_workspace_created_idx").on(
      table.workspaceId,
      table.createdAt,
    ),
    pgPolicy("radar_import_access", {
      as: "permissive",
      for: "all",
      to: "public",
      using: sql`workspace_id = current_setting('app.workspace_id', true)`,
      withCheck: sql`workspace_id = current_setting('app.workspace_id', true)`,
    }),
  ],
).enableRLS();

export type RadarImport = typeof radarImports.$inferSelect;
export type InsertRadarImport = typeof radarImports.$inferInsert;