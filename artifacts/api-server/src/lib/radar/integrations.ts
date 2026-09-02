import { randomUUID } from "node:crypto";
import { and, desc, eq } from "drizzle-orm";
import {
  radarIntegrationDeliveries,
  radarIntegrations,
  radarWebhookSubscriptions,
} from "@workspace/db";
import { z } from "zod";
import {
  emptyIntegrationsOverview, integrationRegistrationSchema, integrationUpdateSchema, isPublicHttpUrl,
  resolveIntegrationState, webhookRegistrationSchema,
} from "./integration-safety";
export { emptyIntegrationsOverview, integrationRegistrationSchema, isPublicHttpUrl, resolveIntegrationState };
import { recordRadarActivity } from "./dashboard";
import { RADAR_WORKSPACE_ID, withRadarTransaction } from "./repository";

const blockedKeys = new Set(["__proto__", "constructor", "prototype"]);

function stringList(value: unknown) {
  return Array.isArray(value) ? value.filter((item): item is string => typeof item === "string").slice(0, 50) : [];
}

function mapIntegration(row: typeof radarIntegrations.$inferSelect) {
  return {
    id: row.id, name: row.name, provider: row.provider, category: row.category,
    status: row.status, documentation_url: row.documentationUrl, authorized: row.authorized,
    scopes: stringList(row.scopes), last_checked_at: row.lastCheckedAt?.toISOString() ?? null,
    last_error: row.lastError, created_at: row.createdAt.toISOString(), updated_at: row.updatedAt.toISOString(),
  };
}

function mapWebhook(row: typeof radarWebhookSubscriptions.$inferSelect) {
  return {
    id: row.id, integration_id: row.integrationId, name: row.name, endpoint_url: row.endpointUrl,
    event_types: stringList(row.eventTypes), status: row.status, authorized: row.authorized,
    max_attempts: row.maxAttempts, consecutive_failures: row.consecutiveFailures,
    last_delivery_at: row.lastDeliveryAt?.toISOString() ?? null, last_error: row.lastError,
  };
}

function mapDelivery(row: typeof radarIntegrationDeliveries.$inferSelect) {
  return {
    id: row.id, webhook_id: row.webhookId, event_type: row.eventType, status: row.status,
    attempts: row.attempts, next_attempt_at: row.nextAttemptAt?.toISOString() ?? null,
    last_error: row.lastError, delivered_at: row.deliveredAt?.toISOString() ?? null,
    created_at: row.createdAt.toISOString(),
  };
}

export async function getIntegrationsOverview() {
  return withRadarTransaction(async (tx) => {
    const overview = emptyIntegrationsOverview();
    const integrations = await tx.select().from(radarIntegrations).where(eq(radarIntegrations.workspaceId, RADAR_WORKSPACE_ID)).orderBy(desc(radarIntegrations.createdAt));
    const webhooks = await tx.select().from(radarWebhookSubscriptions).where(eq(radarWebhookSubscriptions.workspaceId, RADAR_WORKSPACE_ID)).orderBy(desc(radarWebhookSubscriptions.createdAt));
    const deliveries = await tx.select().from(radarIntegrationDeliveries).where(eq(radarIntegrationDeliveries.workspaceId, RADAR_WORKSPACE_ID));
    return {
      ...overview,
      integrations: integrations.map(mapIntegration),
      webhooks: webhooks.map(mapWebhook),
      deliveries: { total: deliveries.length, pending: deliveries.filter((row) => row.status === "pending").length, failed: deliveries.filter((row) => row.status === "failed").length, succeeded: deliveries.filter((row) => row.status === "succeeded").length },
    };
  });
}

export async function registerIntegration(input: unknown) {
  const value = integrationRegistrationSchema.parse(input);
  const result = await withRadarTransaction(async (tx) => {
    const [row] = await tx.insert(radarIntegrations).values({
      id: randomUUID(), workspaceId: RADAR_WORKSPACE_ID, name: value.name, provider: value.provider,
      category: value.category, documentationUrl: value.documentation_url, scopes: value.scopes ?? [],
      status: "pending_authorization", authorized: false,
    }).returning();
    return mapIntegration(row);
  });
  await recordRadarActivity("registered", "integration", result.id, { provider: result.provider, category: result.category });
  return result;
}

export async function updateIntegration(id: string, input: unknown) {
  const patch = integrationUpdateSchema.parse(input);
  const result = await withRadarTransaction(async (tx) => {
    const [existing] = await tx.select().from(radarIntegrations).where(and(eq(radarIntegrations.workspaceId, RADAR_WORKSPACE_ID), eq(radarIntegrations.id, id))).limit(1);
    if (!existing) return null;
    const authorized = patch.authorized ?? existing.authorized;
    const documentationUrl = patch.documentation_url ?? existing.documentationUrl;
    const status = resolveIntegrationState({ authorized, documentationUrl, requestedStatus: patch.status ?? existing.status as "pending_authorization" | "ready" | "paused" | "error" });
    const [row] = await tx.update(radarIntegrations).set({
      documentationUrl, authorized, status, scopes: patch.scopes ?? stringList(existing.scopes),
      lastError: patch.last_error ?? existing.lastError, updatedAt: new Date(),
    }).where(eq(radarIntegrations.id, existing.id)).returning();
    return mapIntegration(row);
  });
  if (result) await recordRadarActivity("updated", "integration", result.id, { authorized: result.authorized, status: result.status });
  return result;
}

export async function createWebhook(integrationId: string, input: unknown) {
  const value = webhookRegistrationSchema.parse(input);
  if (!isPublicHttpUrl(value.endpoint_url)) throw new z.ZodError([{ code: "custom", path: ["endpoint_url"], message: "endpoint_url must be a public http(s) URL" }]);
  const result = await withRadarTransaction(async (tx) => {
    const [integration] = await tx.select().from(radarIntegrations).where(and(eq(radarIntegrations.workspaceId, RADAR_WORKSPACE_ID), eq(radarIntegrations.id, integrationId))).limit(1);
    if (!integration) return null;
    const [row] = await tx.insert(radarWebhookSubscriptions).values({
      id: randomUUID(), workspaceId: RADAR_WORKSPACE_ID, integrationId, name: value.name,
      endpointUrl: value.endpoint_url, eventTypes: value.event_types, status: "paused", authorized: false,
    }).returning();
    return mapWebhook(row);
  });
  if (result) await recordRadarActivity("registered", "webhook", result.id, { integration_id: integrationId, event_types: result.event_types });
  return result;
}

export async function listIntegrationDeliveries() {
  return withRadarTransaction(async (tx) => {
    const rows = await tx.select().from(radarIntegrationDeliveries).where(eq(radarIntegrationDeliveries.workspaceId, RADAR_WORKSPACE_ID)).orderBy(desc(radarIntegrationDeliveries.createdAt)).limit(100);
    return rows.map(mapDelivery);
  });
}

export async function retryIntegrationDelivery(id: string) {
  const result = await withRadarTransaction(async (tx) => {
    const [delivery] = await tx.select().from(radarIntegrationDeliveries).where(and(eq(radarIntegrationDeliveries.workspaceId, RADAR_WORKSPACE_ID), eq(radarIntegrationDeliveries.id, id))).limit(1);
    if (!delivery) return { kind: "missing" } as const;
    if (delivery.status !== "failed") return { kind: "conflict", message: "Only failed deliveries can be retried." } as const;
    const [webhook] = await tx.select().from(radarWebhookSubscriptions).where(and(eq(radarWebhookSubscriptions.workspaceId, RADAR_WORKSPACE_ID), eq(radarWebhookSubscriptions.id, delivery.webhookId))).limit(1);
    if (!webhook) return { kind: "conflict", message: "The parent webhook is unavailable." } as const;
    const [integration] = await tx.select().from(radarIntegrations).where(and(eq(radarIntegrations.workspaceId, RADAR_WORKSPACE_ID), eq(radarIntegrations.id, webhook.integrationId))).limit(1);
    if (!integration || !webhook.authorized || webhook.status !== "active" || !integration.authorized || integration.status !== "ready") {
      return { kind: "conflict", message: "Delivery retry requires an authorized, active webhook and integration." } as const;
    }
    const [updated] = await tx.update(radarIntegrationDeliveries).set({ status: "pending", attempts: 0, nextAttemptAt: new Date(), lastError: "" }).where(eq(radarIntegrationDeliveries.id, delivery.id)).returning();
    return { kind: "ok", delivery: mapDelivery(updated) } as const;
  });
  if (result.kind === "ok") await recordRadarActivity("retried", "integration_delivery", result.delivery.id, {});
  return result;
}

export function safeMetadata(value: unknown): Record<string, unknown> {
  if (!value || typeof value !== "object" || Array.isArray(value)) return {};
  return Object.fromEntries(Object.entries(value as Record<string, unknown>).filter(([key]) => !blockedKeys.has(key)).slice(0, 100));
}