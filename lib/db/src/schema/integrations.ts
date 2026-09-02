import { sql } from "drizzle-orm";
import {
  boolean,
  index,
  integer,
  jsonb,
  pgPolicy,
  pgTable,
  text,
  timestamp,
} from "drizzle-orm/pg-core";
import { radarWorkspaces } from "./workspaces";

export const radarIntegrations = pgTable(
  "radar_integrations",
  {
    id: text("id").primaryKey(),
    workspaceId: text("workspace_id").notNull().references(() => radarWorkspaces.id, { onDelete: "cascade" }),
    name: text("name").notNull(),
    provider: text("provider").notNull(),
    category: text("category").notNull(),
    status: text("status").notNull().default("pending_authorization"),
    documentationUrl: text("documentation_url").notNull().default(""),
    authorized: boolean("authorized").notNull().default(false),
    scopes: jsonb("scopes").$type<string[]>().notNull().default([]),
    lastCheckedAt: timestamp("last_checked_at", { withTimezone: true }),
    lastError: text("last_error").notNull().default(""),
    createdByUserId: text("created_by_user_id").notNull().default("system"),
    createdAt: timestamp("created_at", { withTimezone: true }).notNull().defaultNow(),
    updatedAt: timestamp("updated_at", { withTimezone: true }).notNull().defaultNow(),
  },
  (table) => [
    index("radar_integrations_workspace_status_idx").on(table.workspaceId, table.status),
    pgPolicy("radar_integrations_access", {
      as: "permissive",
      for: "all",
      to: "public",
      using: sql`workspace_id = current_setting('app.workspace_id', true)`,
      withCheck: sql`workspace_id = current_setting('app.workspace_id', true)`,
    }),
  ],
).enableRLS();

export const radarWebhookSubscriptions = pgTable(
  "radar_webhook_subscriptions",
  {
    id: text("id").primaryKey(),
    workspaceId: text("workspace_id").notNull().references(() => radarWorkspaces.id, { onDelete: "cascade" }),
    integrationId: text("integration_id").notNull().references(() => radarIntegrations.id, { onDelete: "cascade" }),
    name: text("name").notNull(),
    endpointUrl: text("endpoint_url").notNull(),
    eventTypes: jsonb("event_types").$type<string[]>().notNull().default([]),
    status: text("status").notNull().default("paused"),
    authorized: boolean("authorized").notNull().default(false),
    maxAttempts: integer("max_attempts").notNull().default(5),
    consecutiveFailures: integer("consecutive_failures").notNull().default(0),
    lastDeliveryAt: timestamp("last_delivery_at", { withTimezone: true }),
    lastError: text("last_error").notNull().default(""),
    createdAt: timestamp("created_at", { withTimezone: true }).notNull().defaultNow(),
    updatedAt: timestamp("updated_at", { withTimezone: true }).notNull().defaultNow(),
  },
  (table) => [
    index("radar_webhook_subscriptions_workspace_status_idx").on(table.workspaceId, table.status),
    pgPolicy("radar_webhook_subscriptions_access", {
      as: "permissive",
      for: "all",
      to: "public",
      using: sql`workspace_id = current_setting('app.workspace_id', true)`,
      withCheck: sql`workspace_id = current_setting('app.workspace_id', true)`,
    }),
  ],
).enableRLS();

export const radarIntegrationDeliveries = pgTable(
  "radar_integration_deliveries",
  {
    id: text("id").primaryKey(),
    workspaceId: text("workspace_id").notNull().references(() => radarWorkspaces.id, { onDelete: "cascade" }),
    webhookId: text("webhook_id").notNull().references(() => radarWebhookSubscriptions.id, { onDelete: "cascade" }),
    eventType: text("event_type").notNull(),
    payload: jsonb("payload").$type<Record<string, unknown>>().notNull(),
    status: text("status").notNull().default("pending"),
    attempts: integer("attempts").notNull().default(0),
    nextAttemptAt: timestamp("next_attempt_at", { withTimezone: true }),
    lastError: text("last_error").notNull().default(""),
    deliveredAt: timestamp("delivered_at", { withTimezone: true }),
    createdAt: timestamp("created_at", { withTimezone: true }).notNull().defaultNow(),
  },
  (table) => [
    index("radar_integration_deliveries_workspace_status_idx").on(table.workspaceId, table.status, table.createdAt),
    pgPolicy("radar_integration_deliveries_access", {
      as: "permissive",
      for: "all",
      to: "public",
      using: sql`workspace_id = current_setting('app.workspace_id', true)`,
      withCheck: sql`workspace_id = current_setting('app.workspace_id', true)`,
    }),
  ],
).enableRLS();

export type RadarIntegration = typeof radarIntegrations.$inferSelect;
export type RadarWebhookSubscription = typeof radarWebhookSubscriptions.$inferSelect;
export type RadarIntegrationDelivery = typeof radarIntegrationDeliveries.$inferSelect;