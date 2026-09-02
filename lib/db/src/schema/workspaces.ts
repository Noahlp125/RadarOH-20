import { sql } from "drizzle-orm";
import { pgPolicy, pgTable, text, timestamp } from "drizzle-orm/pg-core";

const workspacePolicy = pgPolicy("radar_workspace_access", {
  as: "permissive",
  for: "all",
  to: "public",
  using: sql`id = current_setting('app.workspace_id', true)`,
  withCheck: sql`id = current_setting('app.workspace_id', true)`,
});

export const radarWorkspaces = pgTable(
  "radar_workspaces",
  {
    id: text("id").primaryKey(),
    name: text("name").notNull(),
    createdAt: timestamp("created_at", { withTimezone: true })
      .notNull()
      .defaultNow(),
  },
  () => [workspacePolicy],
).enableRLS();

export type RadarWorkspace = typeof radarWorkspaces.$inferSelect;
export type InsertRadarWorkspace = typeof radarWorkspaces.$inferInsert;