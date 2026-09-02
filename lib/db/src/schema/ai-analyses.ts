import { sql } from "drizzle-orm";
import {
  index,
  integer,
  jsonb,
  pgPolicy,
  pgTable,
  text,
  timestamp,
} from "drizzle-orm/pg-core";
import { radarWorkspaces } from "./workspaces";

export const radarAiAnalyses = pgTable(
  "radar_ai_analyses",
  {
    id: text("id").primaryKey(),
    workspaceId: text("workspace_id").notNull().references(() => radarWorkspaces.id, { onDelete: "cascade" }),
    trigger: text("trigger").notNull(),
    model: text("model").notNull(),
    status: text("status").notNull(),
    sourceEvidenceCount: integer("source_evidence_count").notNull().default(0),
    eventCount: integer("event_count").notNull().default(0),
    summary: text("summary").notNull().default(""),
    trends: jsonb("trends").$type<unknown[]>().notNull().default([]),
    errorMessage: text("error_message").notNull().default(""),
    startedAt: timestamp("started_at", { withTimezone: true }).notNull().defaultNow(),
    completedAt: timestamp("completed_at", { withTimezone: true }),
  },
  (table) => [
    index("radar_ai_analyses_workspace_started_idx").on(table.workspaceId, table.startedAt),
    pgPolicy("radar_ai_analysis_access", {
      as: "permissive",
      for: "all",
      to: "public",
      using: sql`workspace_id = current_setting('app.workspace_id', true)`,
      withCheck: sql`workspace_id = current_setting('app.workspace_id', true)`,
    }),
  ],
).enableRLS();

export type RadarAiAnalysis = typeof radarAiAnalyses.$inferSelect;
export type InsertRadarAiAnalysis = typeof radarAiAnalyses.$inferInsert;