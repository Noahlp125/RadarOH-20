import { isIP } from "node:net";
import { z } from "zod";

const safeText = (max: number) => z.string().trim().min(1).max(max);
const scopeSchema = z.array(z.string().trim().min(1).max(160)).max(50);

function isHttpUrl(value: string) {
  try {
    const url = new URL(value);
    return (url.protocol === "http:" || url.protocol === "https:") && Boolean(url.hostname);
  } catch {
    return false;
  }
}

export const integrationRegistrationSchema = z.object({
  name: safeText(160), provider: safeText(120), category: safeText(80),
  documentation_url: safeText(2048).refine(isHttpUrl, "documentation_url must use http or https"),
  scopes: scopeSchema.optional(),
}).strict();
export const integrationUpdateSchema = z.object({
  documentation_url: z.string().trim().max(2048).refine((value) => !value || isHttpUrl(value), "documentation_url must use http or https").optional(),
  authorized: z.boolean().optional(), status: z.enum(["pending_authorization", "ready", "paused", "error"]).optional(),
  scopes: scopeSchema.optional(), last_error: z.string().trim().max(1000).optional(),
}).strict();
export const webhookRegistrationSchema = z.object({
  name: safeText(160), endpoint_url: safeText(2048), event_types: z.array(safeText(120)).min(1).max(50),
  authorized: z.boolean().optional(),
}).strict();

export function isPublicHttpUrl(value: string) {
  if (!isHttpUrl(value)) return false;
  const hostname = new URL(value).hostname.toLowerCase().replace(/^\[|\]$/g, "");
  if (hostname === "localhost" || hostname.endsWith(".localhost")) return false;
  const ipVersion = isIP(hostname);
  if (ipVersion === 4) {
    const [a, b] = hostname.split(".").map(Number);
    return !(a === 10 || a === 127 || a === 0 || a >= 224 || (a === 169 && b === 254) || (a === 172 && b >= 16 && b <= 31) || (a === 192 && b === 168));
  }
  if (ipVersion === 6) {
    const normalized = hostname.toLowerCase();
    return !(normalized === "::1" || normalized.startsWith("fc") || normalized.startsWith("fd") || normalized.startsWith("fe8") || normalized.startsWith("fe9") || normalized.startsWith("fea") || normalized.startsWith("feb") || normalized.startsWith("::ffff:127.") || normalized.startsWith("::ffff:10.") || normalized.startsWith("::ffff:192.168."));
  }
  return true;
}

export function resolveIntegrationState(input: { authorized: boolean; documentationUrl: string; requestedStatus?: "pending_authorization" | "ready" | "paused" | "error" }) {
  if (!input.authorized) return input.requestedStatus === "paused" ? "paused" : "pending_authorization" as const;
  if (input.requestedStatus === "ready") return input.documentationUrl.trim() ? "ready" : "pending_authorization";
  return input.requestedStatus ?? "pending_authorization";
}

export function emptyIntegrationsOverview() {
  return {
    generated_at: new Date().toISOString(),
    safety: { external_connections_enabled: false, authorization_required: true, documentation_required: true },
    integrations: [], webhooks: [], deliveries: { total: 0, pending: 0, failed: 0, succeeded: 0 },
    departments: [
      { id: "direccion", name: "Dirección", description: "Gobierno y decisiones estratégicas.", focus: ["riesgos", "oportunidades"] },
      { id: "marketing", name: "Marketing", description: "Mercado, contenido y posicionamiento.", focus: ["competencia", "campañas"] },
      { id: "ventas", name: "Ventas", description: "Señales comerciales y cuentas.", focus: ["leads", "propuestas"] },
      { id: "operaciones", name: "Operaciones", description: "Salud operativa y cumplimiento.", focus: ["procesos", "incidencias"] },
    ],
    api: { private_base_path: "/api/radar", public_status: "not_enabled", supported_events: ["radar.change.detected", "radar.alert.created", "radar.analysis.completed"] },
  };
}