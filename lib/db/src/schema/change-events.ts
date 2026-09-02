import { sql } from "drizzle-orm";
import {
  index,
  pgPolicy,
  pgTable,
  text,
  timestamp,
} from "drizzle-orm/pg-core";
import { radarCompetitors } from "./competitors";
import { radarMonitorEvidence } from "./monitor-evidence";
import { radarMonitorRuns } from "./monitor-runs";
import { radarSources } from "./sources";
import { radarWorkspaces } from "./workspaces";

export const radarChangeEvents = pgTable(
  "radar_change_events",
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
    evidenceId: text("evidence_id")
      .notNull()
      .references(() => radarMonitorEvidence.id, { onDelete: "cascade" }),
    competitorId: text("competitor_id").references(() => radarCompetitors.id, {
      onDelete: "set null",
    }),
    changeType: text("change_type").notNull(),
    title: text("title").notNull().default(""),
    summary: text("summary").notNull().default(""),
    url: text("url").notNull().default(""),
    previousFingerprint: text("previous_fingerprint"),
    fingerprint: text("fingerprint").notNull(),
    occurredAt: timestamp("occurred_at", { withTimezone: true })
      .notNull()
      .defaultNow(),
  },
  (table) => [
    index("radar_change_events_workspace_occurred_idx").on(
      table.workspaceId,
      table.occurredAt,
    ),
    index("radar_change_events_competitor_occurred_idx").on(
      table.competitorId,
      table.occurredAt,
    ),
    index("radar_change_events_source_occurred_idx").on(
      table.sourceId,
      table.occurredAt,
    ),
    pgPolicy("radar_change_event_access", {
      as: "permissive",
      for: "all",
      to: "public",
      using: sql`workspace_id = current_setting('app.workspace_id', true)`,
      withCheck: sql`workspace_id = current_setting('app.workspace_id', true)`,
    }),
  ],
).enableRLS();

export type RadarChangeEvent = typeof radarChangeEvents.$inferSelect;
export type InsertRadarChangeEvent = typeof radarChangeEvents.$inferInsert;