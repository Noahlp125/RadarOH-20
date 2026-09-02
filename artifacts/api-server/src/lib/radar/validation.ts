import { z } from "zod";

const idSchema = z.string().min(1).max(255);
const stringField = z.string().default("");

export const radarSourceSchema = z
  .object({
    id: idSchema.optional(),
    termino: z.string().min(1).max(500),
    tipo: z.string().min(1).max(120),
    frecuencia: z.string().min(1).max(40),
    notas: stringField,
  })
  .passthrough();

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
    "30": z.array(radarPlanItemSchema).default([]),
    "60": z.array(radarPlanItemSchema).default([]),
    "90": z.array(radarPlanItemSchema).default([]),
  })
  .passthrough();

export const radarImportPayloadSchema = z
  .object({
    sources: z.array(radarSourceSchema).optional(),
    competitors: z.array(radarCompetitorSchema).optional(),
    keywords: z.array(radarKeywordSchema).optional(),
    plan: radarPlanSchema.optional(),
    exportedAt: z.string().optional(),
  })
  .passthrough();

export const radarStateSchema = z.object({
  sources: z.array(radarSourceSchema),
  competitors: z.array(radarCompetitorSchema),
  keywords: z.array(radarKeywordSchema),
  plan: radarPlanSchema,
});

export type RadarImportPayload = z.infer<typeof radarImportPayloadSchema>;
export type RadarStateInput = z.infer<typeof radarStateSchema>;

export const radarSourceUpdateSchema = radarSourceSchema
  .omit({ id: true })
  .partial()
  .passthrough();
export const radarCompetitorUpdateSchema = radarCompetitorSchema
  .omit({ id: true })
  .partial()
  .passthrough();
export const radarKeywordUpdateSchema = radarKeywordSchema
  .omit({ id: true })
  .partial()
  .passthrough();