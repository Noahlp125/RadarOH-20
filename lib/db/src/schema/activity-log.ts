import { sql } from "drizzle-orm";
import { index, jsonb, pgPolicy, pgTable, text, timestamp } from "drizzle-orm/pg-core";
import { radarWorkspaces } from "./workspaces";

export const radarActivityLog = pgTable(
  "radar_activity_log",
  {
    id: text("id").primaryKey(),
    workspaceId: text("workspace_id").notNull().references(() => radarWorkspaces.id, { onDelete: "cascade" }),
    action: text("action").notNull(),
    entityType: text("entity_type").notNull(),
    entityId: text("entity_id"),
    metadata: jsonb("metadata").$type<Record<string, unknown>>().notNull().default({}),
    createdAt: timestamp("created_at", { withTimezone: true }).notNull().defaultNow(),
  },
  (table) => [
    index("radar_activity_log_workspace_created_idx").on(table.workspaceId, table.createdAt),
    pgPolicy("radar_activity_log_access", {
      as: "permissive",
      for: "all",
      to: "public",
      using: sql`workspace_id = current_setting('app.workspace_id', true)`,
      withCheck: sql`workspace_id = current_setting('app.workspace_id', true)`,
    }),
  ],
).enableRLS();

export type RadarActivityLog = typeof radarActivityLog.$inferSelect;