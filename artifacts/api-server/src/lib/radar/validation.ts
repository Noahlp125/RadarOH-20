import { z } from "zod";

const idSchema = z.string().min(1).max(255);
const stringField = z.string().max(5_000).default("");
const nullableIdSchema = idSchema.nullable().optional();
export const radarConnectorSchema = z.enum(["manual", "rss", "json_api", "web"]);

const radarSourceObjectSchema = z
  .object({
    id: idSchema.optional(),
    termino: z.string().min(1).max(500),
    tipo: z.string().min(1).max(120),
    frecuencia: z.string().min(1).max(40),
    notas: stringField,
    connector: radarConnectorSchema.default("manual"),
    endpoint_url: z.string().max(2048).default(""),
    enabled: z.boolean().default(false),
    competitor_id: nullableIdSchema,
  })
  .passthrough();

function validateMonitoringConfiguration(
  source: { enabled?: boolean; connector?: string; endpoint_url?: string },
  context: z.RefinementCtx,
) {
    if (source.enabled && source.connector === "manual") {
      context.addIssue({
        code: z.ZodIssueCode.custom,
        message: "Una fuente habilitada necesita un conector automático.",
        path: ["connector"],
      });
    }
    if (source.enabled && !source.endpoint_url?.trim()) {
      context.addIssue({
        code: z.ZodIssueCode.custom,
        message: "Una fuente habilitada necesita un endpoint.",
        path: ["endpoint_url"],
      });
    }
}

export const radarSourceSchema = radarSourceObjectSchema.superRefine(
  validateMonitoringConfiguration,
);

export const radarCompetitorSchema = z
  .object({
    id: idSchema.optional(),
    nombre: z.string().min(1).max(255),
    ubicacion: stringField,
    especialidad: stringField,
    rango_precio: stringField,
    web: stringField,
    redes: stringField,
    fortalezas: stringField,
    debilidades: stringField,
    notas: stringField,
    prioridad: z.enum(["alta", "media", "baja"]),
    estado: z.enum(["pendiente", "revisado"]),
  })
  .passthrough();

export const radarKeywordSchema = z
  .object({
    id: idSchema.optional(),
    termino: z.string().min(1).max(500),
    volumen: z.enum(["Alto", "Medio", "Bajo"]),
    posicion: stringField,
    notas: stringField,
  })
  .passthrough();

export const radarPlanItemSchema = z
  .object({
    id: idSchema.optional(),
    text: z.string().min(1).max(1000),
    done: z.boolean().default(false),
  })
  .passthrough();

export const radarPlanSchema = z
  .object({
    "30": z.array(radarPlanItemSchema).max(500).default([]),
    "60": z.array(radarPlanItemSchema).max(500).default([]),
    "90": z.array(radarPlanItemSchema).max(500).default([]),
  })
  .passthrough();

export const radarImportPayloadSchema = z
  .object({
    sources: z.array(radarSourceSchema).max(500).optional(),
    competitors: z.array(radarCompetitorSchema).max(500).optional(),
    keywords: z.array(radarKeywordSchema).max(1_000).optional(),
    plan: radarPlanSchema.optional(),
    exportedAt: z.string().datetime().optional(),
  })
  .passthrough();

export const radarStateSchema = z.object({
  sources: z.array(radarSourceSchema).max(500),
  competitors: z.array(radarCompetitorSchema).max(500),
  keywords: z.array(radarKeywordSchema).max(1_000),
  plan: radarPlanSchema,
});

export type RadarImportPayload = z.infer<typeof radarImportPayloadSchema>;
export type RadarStateInput = z.infer<typeof radarStateSchema>;

export const radarMonitorRunRequestSchema = z.object({
  source_id: idSchema.optional(),
});

export const radarMonitorRunSchema = z.object({
  id: idSchema,
  source_id: idSchema,
  source_label: z.string(),
  trigger: z.enum(["scheduler", "manual", "retry"]),
  status: z.enum(["running", "success", "error"]),
  started_at: z.string(),
  finished_at: z.string().nullable(),
  attempts: z.number().int().nonnegative(),
  item_count: z.number().int().nonnegative(),
  change_count: z.number().int().nonnegative(),
  http_status: z.number().int().nullable(),
  error_message: z.string(),
  duration_ms: z.number().int().nullable(),
});

export const radarChangeEventSchema = z.object({
  id: idSchema,
  source_id: idSchema,
  source_label: z.string(),
  run_id: idSchema,
  evidence_id: idSchema,
  competitor_id: idSchema.nullable(),
  competitor_name: z.string().nullable(),
  change_type: z.enum(["new", "updated"]),
  title: z.string(),
  summary: z.string(),
  url: z.string(),
  previous_fingerprint: z.string().nullable(),
  fingerprint: z.string(),
  occurred_at: z.string(),
});

export const radarMonitorSourceStatusSchema = z.object({
  source_id: idSchema,
  source_label: z.string(),
  connector: radarConnectorSchema,
  endpoint_url: z.string(),
  enabled: z.boolean(),
  last_status: z.enum(["idle", "running", "success", "error"]),
  last_run_at: z.string().nullable(),
  next_run_at: z.string().nullable(),
  last_error: z.string(),
  consecutive_failures: z.number().int().nonnegative(),
});

export const radarMonitorStatusSchema = z.object({
  summary: z.object({
    total_sources: z.number().int().nonnegative(),
    enabled_sources: z.number().int().nonnegative(),
    healthy_sources: z.number().int().nonnegative(),
    error_sources: z.number().int().nonnegative(),
    last_run_at: z.string().nullable(),
    next_run_at: z.string().nullable(),
  }),
  sources: z.array(radarMonitorSourceStatusSchema),
  recent_runs: z.array(radarMonitorRunSchema),
  recent_changes: z.array(radarChangeEventSchema),
});

export const radarMonitorRunResultSchema = z.object({
  runs: z.array(radarMonitorRunSchema),
  changes: z.array(radarChangeEventSchema),
});

export const radarSourceUpdateSchema = radarSourceObjectSchema
  .omit({ id: true })
  .partial()
  .passthrough()
  .superRefine(validateMonitoringConfiguration);
export const radarCompetitorUpdateSchema = radarCompetitorSchema
  .omit({ id: true })
  .partial()
  .passthrough();
export const radarKeywordUpdateSchema = radarKeywordSchema
  .omit({ id: true })
  .partial()
  .passthrough();