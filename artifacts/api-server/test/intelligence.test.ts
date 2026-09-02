import assert from "node:assert/strict";
import { describe, it } from "node:test";
import { intelligenceQuerySchema, buildHistoricalTrends } from "../src/lib/radar/intelligence-helpers";

describe("RadarOH intelligence helpers", () => {
  it("defaults days and rejects values outside the generated contract bounds", () => {
    assert.equal(intelligenceQuerySchema.parse({}).days, 90);
    assert.equal(intelligenceQuerySchema.parse({ days: "30" }).days, 30);
    assert.equal(intelligenceQuerySchema.parse({ days: 366 }).days, 366);
    assert.equal(intelligenceQuerySchema.safeParse({ days: 29 }).success, false);
    assert.equal(intelligenceQuerySchema.safeParse({ days: 367 }).success, false);
  });

  it("returns a stable empty historical trend without invented evidence", () => {
    const trends = buildHistoricalTrends([], [], new Map());
    assert.deepEqual(trends, [{
      key: "overall",
      label: "Actividad competitiva global",
      current_count: 0,
      previous_count: 0,
      delta_percent: 0,
      direction: "stable",
      confidence: 0,
      basis: "Señal histórica adelantada basada en periodos equivalentes; no es un pronóstico calibrado.",
      evidence_event_ids: [],
    }]);
  });
});