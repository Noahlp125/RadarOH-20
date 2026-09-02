import { describe, expect, it } from "vitest";
import {
  radarImportPayloadSchema,
  radarSourceSchema,
  radarStateSchema,
} from "../lib/radar/validation";

const source = {
  termino: "Competidor",
  tipo: "RSS",
  frecuencia: "daily",
  prioridad: "alta",
  connector: "rss",
  endpoint_url: "https://example.com/feed.xml",
  enabled: true,
};

describe("RadarOH input limits", () => {
  it("accepts a bounded valid source", () => {
    expect(radarSourceSchema.parse(source).termino).toBe("Competidor");
  });

  it("rejects oversized text", () => {
    expect(() => radarSourceSchema.parse({ ...source, notas: "x".repeat(5_001) })).toThrow();
  });

  it("rejects oversized state collections", () => {
    expect(() =>
      radarStateSchema.parse({
        sources: Array.from({ length: 501 }, () => source),
        competitors: [],
        keywords: [],
        plan: { "30": [], "60": [], "90": [] },
      }),
    ).toThrow();
  });

  it("rejects malformed export dates", () => {
    expect(() => radarImportPayloadSchema.parse({ exportedAt: "ayer" })).toThrow();
  });
});