import { sql } from "drizzle-orm";
import { boolean, integer, jsonb, pgPolicy, pgTable, text, timestamp } from "drizzle-orm/pg-core";
import { radarWorkspaces } from "./workspaces";

export const radarAlertPreferences = pgTable(
  "radar_alert_preferences",
  {
    workspaceId: text("workspace_id").primaryKey().references(() => radarWorkspaces.id, { onDelete: "cascade" }),
    enabled: boolean("enabled").notNull().default(true),
    minimumImportance: text("minimum_importance").notNull().default("high"),
    minimumRelevance: integer("minimum_relevance").notNull().default(70),
    minimumConfidence: integer("minimum_confidence").notNull().default(60),
    internalEnabled: boolean("internal_enabled").notNull().default(true),
    channels: jsonb("channels").$type<string[]>().notNull().default(["internal"]),
    updatedAt: timestamp("updated_at", { withTimezone: true }).notNull().defaultNow(),
  },
  (table) => [
    pgPolicy("radar_alert_preferences_access", {
      as: "permissive",
      for: "all",
      to: "public",
      using: sql`workspace_id = current_setting('app.workspace_id', true)`,
      withCheck: sql`workspace_id = current_setting('app.workspace_id', true)`,
    }),
  ],
).enableRLS();

export type RadarAlertPreferences = typeof radarAlertPreferences.$inferSelect;