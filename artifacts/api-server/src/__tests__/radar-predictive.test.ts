import { describe, expect, it } from "vitest";
import {
  AskRadarAssistantBody,
  GetRadarPredictiveQueryParams,
} from "@workspace/api-zod";
import { buildPredictiveScenarios, validateAssistantOutput } from "../lib/radar/predictive";

describe("Radar predictive contract safeguards", () => {
  it("uses the bounded predictive horizon", () => {
    expect(GetRadarPredictiveQueryParams.parse({}).days).toBe(90);
    expect(() => GetRadarPredictiveQueryParams.parse({ days: 181 })).toThrow();
  });

  it("does not construct scenarios without signals and labels simulations", () => {
    expect(buildPredictiveScenarios([])).toEqual([]);
    expect(buildPredictiveScenarios(["event-1"]).map((scenario) => scenario.label))
      .toEqual(["base", "accelerated", "quiet"]);
  });

  it("validates assistant questions at the API boundary", () => {
    expect(() => AskRadarAssistantBody.parse({ question: "x" })).toThrow();
    expect(() => AskRadarAssistantBody.parse({ question: "x".repeat(1001) })).toThrow();
  });

  it("rejects assistant output with unknown event evidence and bounds confidence", () => {
    expect(() => validateAssistantOutput(JSON.stringify({
      answer: "Unsupported", confidence: 80, evidence_event_ids: ["unknown"], caveat: "Test",
    }), new Set(["event-1"]))).toThrow();
    expect(validateAssistantOutput(JSON.stringify({
      answer: "Grounded", confidence: 120, evidence_event_ids: ["event-1"], caveat: "Review evidence.",
    }), new Set(["event-1"]))).toMatchObject({ confidence: 100, evidence_event_ids: ["event-1"] });
  });
});