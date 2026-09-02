import { sql } from "drizzle-orm";
import {
  pgPolicy,
  pgTable,
  text,
  timestamp,
  uniqueIndex,
} from "drizzle-orm/pg-core";
import { radarWorkspaces } from "./workspaces";

export const radarWorkerLeases = pgTable(
  "radar_worker_leases",
  {
    id: text("id").primaryKey(),
    workspaceId: text("workspace_id")
      .notNull()
      .references(() => radarWorkspaces.id, { onDelete: "cascade" }),
    ownerId: text("owner_id").notNull(),
    acquiredAt: timestamp("acquired_at", { withTimezone: true })
      .notNull()
      .defaultNow(),
    heartbeatAt: timestamp("heartbeat_at", { withTimezone: true })
      .notNull()
      .defaultNow(),
    expiresAt: timestamp("expires_at", { withTimezone: true })
      .notNull(),
    updatedAt: timestamp("updated_at", { withTimezone: true })
      .notNull()
      .defaultNow(),
  },
  (table) => [
    uniqueIndex("radar_worker_leases_workspace_idx").on(table.workspaceId),
    pgPolicy("radar_worker_lease_access", {
      as: "permissive",
      for: "all",
      to: "public",
      using: sql`${table.workspaceId} = current_setting('app.workspace_id', true)`,
      withCheck: sql`${table.workspaceId} = current_setting('app.workspace_id', true)`,
    }),
  ],
).enableRLS();

export type RadarWorkerLease = typeof radarWorkerLeases.$inferSelect;
export type InsertRadarWorkerLease = typeof radarWorkerLeases.$inferInsert;