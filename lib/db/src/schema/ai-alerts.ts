import { sql } from "drizzle-orm";
import {
  index,
  pgPolicy,
  pgTable,
  text,
  timestamp,
} from "drizzle-orm/pg-core";
import { radarAiFindings } from "./ai-findings";
import { radarCompetitors } from "./competitors";
import { radarWorkspaces } from "./workspaces";

export const radarAiAlerts = pgTable(
  "radar_ai_alerts",
  {
    id: text("id").primaryKey(),
    workspaceId: text("workspace_id").notNull().references(() => radarWorkspaces.id, { onDelete: "cascade" }),
    findingId: text("finding_id").notNull().references(() => radarAiFindings.id, { onDelete: "cascade" }),
    competitorId: text("competitor_id").references(() => radarCompetitors.id, { onDelete: "set null" }),
    title: text("title").notNull(),
    description: text("description").notNull(),
    importance: text("importance").notNull(),
    status: text("status").notNull().default("unread"),
    createdAt: timestamp("created_at", { withTimezone: true }).notNull().defaultNow(),
    readAt: timestamp("read_at", { withTimezone: true }),
  },
  (table) => [
    index("radar_ai_alerts_workspace_status_idx").on(table.workspaceId, table.status, table.createdAt),
    pgPolicy("radar_ai_alert_access", {
      as: "permissive",
      for: "all",
      to: "public",
      using: sql`workspace_id = current_setting('app.workspace_id', true)`,
      withCheck: sql`workspace_id = current_setting('app.workspace_id', true)`,
    }),
  ],
).enableRLS();

export type RadarAiAlert = typeof radarAiAlerts.$inferSelect;
export type InsertRadarAiAlert = typeof radarAiAlerts.$inferInsert;