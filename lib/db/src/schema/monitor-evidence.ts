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
import { radarMonitorRuns } from "./monitor-runs";
import { radarSources } from "./sources";
import { radarWorkspaces } from "./workspaces";

export const radarMonitorEvidence = pgTable(
  "radar_monitor_evidence",
  {
    id: text("id").primaryKey(),
    workspaceId: text("workspace_id")
      .notNull()
      .references(() => radarWorkspaces.id, { onDelete: "cascade" }),
    sourceId: text("source_id")
      .notNull()
      .references(() => radarSources.id, { onDelete: "cascade" }),
    runId: text("run_id")
      .notNull()
      .references(() => radarMonitorRuns.id, { onDelete: "cascade" }),
    itemKey: text("item_key").notNull(),
    fingerprint: text("fingerprint").notNull(),
    title: text("title").notNull().default(""),
    url: text("url").notNull().default(""),
    publishedAt: timestamp("published_at", { withTimezone: true }),
    normalizedText: text("normalized_text").notNull().default(""),
    rawPayload: jsonb("raw_payload")
      .$type<Record<string, unknown>>()
      .notNull(),
    observedAt: timestamp("observed_at", { withTimezone: true })
      .notNull()
      .defaultNow(),
  },
  (table) => [
    uniqueIndex("radar_monitor_evidence_run_item_idx").on(
      table.runId,
      table.itemKey,
    ),
    index("radar_monitor_evidence_source_observed_idx").on(
      table.sourceId,
      table.observedAt,
    ),
    pgPolicy("radar_monitor_evidence_access", {
      as: "permissive",
      for: "all",
      to: "public",
      using: sql`workspace_id = current_setting('app.workspace_id', true)`,
      withCheck: sql`workspace_id = current_setting('app.workspace_id', true)`,
    }),
  ],
).enableRLS();

export type RadarMonitorEvidence = typeof radarMonitorEvidence.$inferSelect;
export type InsertRadarMonitorEvidence = typeof radarMonitorEvidence.$inferInsert;