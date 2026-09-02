import { sql } from "drizzle-orm";
import {
  index,
  integer,
  pgPolicy,
  pgTable,
  text,
  timestamp,
} from "drizzle-orm/pg-core";
import { radarSources } from "./sources";
import { radarWorkspaces } from "./workspaces";

export const radarMonitorRuns = pgTable(
  "radar_monitor_runs",
  {
    id: text("id").primaryKey(),
    workspaceId: text("workspace_id")
      .notNull()
      .references(() => radarWorkspaces.id, { onDelete: "cascade" }),
    sourceId: text("source_id")
      .notNull()
      .references(() => radarSources.id, { onDelete: "cascade" }),
    trigger: text("trigger").notNull(),
    status: text("status").notNull(),
    startedAt: timestamp("started_at", { withTimezone: true })
      .notNull()
      .defaultNow(),
    finishedAt: timestamp("finished_at", { withTimezone: true }),
    attempts: integer("attempts").notNull().default(0),
    itemCount: integer("item_count").notNull().default(0),
    changeCount: integer("change_count").notNull().default(0),
    httpStatus: integer("http_status"),
    errorMessage: text("error_message").notNull().default(""),
    durationMs: integer("duration_ms"),
  },
  (table) => [
    index("radar_monitor_runs_workspace_started_idx").on(
      table.workspaceId,
      table.startedAt,
    ),
    index("radar_monitor_runs_source_started_idx").on(
      table.sourceId,
      table.startedAt,
    ),
    pgPolicy("radar_monitor_run_access", {
      as: "permissive",
      for: "all",
      to: "public",
      using: sql`workspace_id = current_setting('app.workspace_id', true)`,
      withCheck: sql`workspace_id = current_setting('app.workspace_id', true)`,
    }),
  ],
).enableRLS();

export type RadarMonitorRun = typeof radarMonitorRuns.$inferSelect;
export type InsertRadarMonitorRun = typeof radarMonitorRuns.$inferInsert;