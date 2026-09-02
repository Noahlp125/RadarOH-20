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
import { radarChangeEvents } from "./change-events";
import { radarAiAnalyses } from "./ai-analyses";
import { radarWorkspaces } from "./workspaces";

export const radarAiFindings = pgTable(
  "radar_ai_findings",
  {
    id: text("id").primaryKey(),
    workspaceId: text("workspace_id").notNull().references(() => radarWorkspaces.id, { onDelete: "cascade" }),
    analysisId: text("analysis_id").notNull().references(() => radarAiAnalyses.id, { onDelete: "cascade" }),
    changeEventId: text("change_event_id").references(() => radarChangeEvents.id, { onDelete: "set null" }),
    eventType: text("event_type").notNull(),
    importance: text("importance").notNull(),
    relevance: integer("relevance").notNull(),
    confidence: integer("confidence").notNull(),
    title: text("title").notNull(),
    summary: text("summary").notNull(),
    rationale: text("rationale").notNull(),
    opportunity: text("opportunity").notNull().default(""),
    risk: text("risk").notNull().default(""),
    trend: text("trend").notNull().default(""),
    suggestedUpdates: jsonb("suggested_updates").$type<unknown[]>().notNull().default([]),
    evidenceIds: jsonb("evidence_ids").$type<string[]>().notNull().default([]),
    createdAt: timestamp("created_at", { withTimezone: true }).notNull().defaultNow(),
  },
  (table) => [
    index("radar_ai_findings_analysis_idx").on(table.analysisId),
    index("radar_ai_findings_workspace_created_idx").on(table.workspaceId, table.createdAt),
    pgPolicy("radar_ai_finding_access", {
      as: "permissive",
      for: "all",
      to: "public",
      using: sql`workspace_id = current_setting('app.workspace_id', true)`,
      withCheck: sql`workspace_id = current_setting('app.workspace_id', true)`,
    }),
  ],
).enableRLS();

export type RadarAiFinding = typeof radarAiFindings.$inferSelect;
export type InsertRadarAiFinding = typeof radarAiFindings.$inferInsert;