import { sql } from "drizzle-orm";
import {
  index,
  integer,
  jsonb,
  pgPolicy,
  pgTable,
  text,
  timestamp,
  uniqueIndex,
} from "drizzle-orm/pg-core";
import { radarSources } from "./sources";
import { radarWorkspaces } from "./workspaces";

export const radarWorkerJobs = pgTable(
  "radar_worker_jobs",
  {
    id: text("id").primaryKey(),
    workspaceId: text("workspace_id")
      .notNull()
      .references(() => radarWorkspaces.id, { onDelete: "cascade" }),
    jobKey: text("job_key").notNull(),
    kind: text("kind").notNull(),
    sourceId: text("source_id").references(() => radarSources.id, {
      onDelete: "set null",
    }),
    status: text("status").notNull().default("queued"),
    availableAt: timestamp("available_at", { withTimezone: true })
      .notNull()
      .defaultNow(),
    attempts: integer("attempts").notNull().default(0),
    lockedAt: timestamp("locked_at", { withTimezone: true }),
    lockedBy: text("locked_by"),
    startedAt: timestamp("started_at", { withTimezone: true }),
    finishedAt: timestamp("finished_at", { withTimezone: true }),
    errorMessage: text("error_message").notNull().default(""),
    payload: jsonb("payload").$type<Record<string, unknown>>().notNull().default({}),
    createdAt: timestamp("created_at", { withTimezone: true })
      .notNull()
      .defaultNow(),
    updatedAt: timestamp("updated_at", { withTimezone: true })
      .notNull()
      .defaultNow(),
  },
  (table) => [
    uniqueIndex("radar_worker_jobs_workspace_key_idx").on(
      table.workspaceId,
      table.jobKey,
    ),
    index("radar_worker_jobs_claim_idx").on(
      table.workspaceId,
      table.status,
      table.availableAt,
    ),
    pgPolicy("radar_worker_job_access", {
      as: "permissive",
      for: "all",
      to: "public",
      using: sql`${table.workspaceId} = current_setting('app.workspace_id', true)`,
      withCheck: sql`${table.workspaceId} = current_setting('app.workspace_id', true)`,
    }),
  ],
).enableRLS();

export type RadarWorkerJob = typeof radarWorkerJobs.$inferSelect;
export type InsertRadarWorkerJob = typeof radarWorkerJobs.$inferInsert;