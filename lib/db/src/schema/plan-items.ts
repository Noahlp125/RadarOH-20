import { sql } from "drizzle-orm";
import {
  index,
  jsonb,
  pgPolicy,
  pgTable,
  text,
  timestamp,
  uniqueIndex,
  boolean,
} from "drizzle-orm/pg-core";
import { radarWorkspaces } from "./workspaces";

export const radarPlanItems = pgTable(
  "radar_plan_items",
  {
    id: text("id").primaryKey(),
    workspaceId: text("workspace_id")
      .notNull()
      .references(() => radarWorkspaces.id, { onDelete: "cascade" }),
    legacyId: text("legacy_id").notNull(),
    horizon: text("horizon").notNull(),
    text: text("text").notNull(),
    done: boolean("done").notNull().default(false),
    rawRecord: jsonb("raw_record").$type<Record<string, unknown>>().notNull(),
    createdAt: timestamp("created_at", { withTimezone: true })
      .notNull()
      .defaultNow(),
    updatedAt: timestamp("updated_at", { withTimezone: true })
      .notNull()
      .defaultNow(),
  },
  (table) => [
    uniqueIndex("radar_plan_items_workspace_legacy_id_idx").on(
      table.workspaceId,
      table.legacyId,
    ),
    index("radar_plan_items_workspace_horizon_idx").on(
      table.workspaceId,
      table.horizon,
    ),
    pgPolicy("radar_plan_access", {
      as: "permissive",
      for: "all",
      to: "public",
      using: sql`workspace_id = current_setting('app.workspace_id', true)`,
      withCheck: sql`workspace_id = current_setting('app.workspace_id', true)`,
    }),
  ],
).enableRLS();

export type RadarPlanItem = typeof radarPlanItems.$inferSelect;
export type InsertRadarPlanItem = typeof radarPlanItems.$inferInsert;