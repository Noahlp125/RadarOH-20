import assert from "node:assert/strict";
import { describe, it } from "node:test";
import {
  AiOutputValidationError,
  AiRequestAttemptsExhaustedError,
  parseAndValidateAiOutput,
  requestValidatedAiOutput,
  resolveAiRequestAudit,
  shouldCreateAiAlert,
} from "../src/lib/radar/ai-validation";

const evidence = [
  { change_event_id: "event-1", evidence_id: "evidence-1", competitor_id: "competitor-1" },
  { change_event_id: "event-2", evidence_id: "evidence-2", competitor_id: "competitor-2" },
];

function finding(overrides: Record<string, unknown> = {}) {
  return {
    change_event_id: "event-1",
    event_type: "pricing",
    importance: "high",
    relevance: 70,
    confidence: 60,
    title: "Cambio de precio",
    summary: "La evidencia muestra un cambio de precio.",
    rationale: "El cambio aparece explícitamente en la fuente.",
    opportunity: "",
    risk: "",
    trend: "",
    evidence_ids: ["evidence-1"],
    suggested_updates: [],
    alert: true,
    ...overrides,
  };
}

function output(overrides: Record<string, unknown> = {}) {
  return {
    summary: "Resumen respaldado por evidencia.",
    summary_evidence_ids: ["evidence-1"],
    trends: [],
    findings: [finding()],
    ...overrides,
  };
}

function assertRejected(value: unknown, expectedIssue: string) {
  assert.throws(
    () => parseAndValidateAiOutput(JSON.stringify(value), evidence),
    (error: unknown) => {
      assert.ok(error instanceof AiOutputValidationError);
      assert.match(error.message, new RegExp(expectedIssue));
      return true;
    },
  );
}

describe("RadarOH AI output validation", () => {
  it("rejects invalid JSON before persistence", () => {
    assert.throws(
      () => parseAndValidateAiOutput("{not-json", evidence),
      (error: unknown) => error instanceof AiOutputValidationError,
    );
  });

  it("rejects an invented event ID when cited evidence does not identify one exact event", () => {
    assertRejected(
      output({
        findings: [finding({
          change_event_id: "invented-event",
          evidence_ids: ["evidence-1", "evidence-2"],
        })],
      }),
      "change_event_id",
    );
  });

  it("rejects a response containing an invented evidence ID", () => {
    assertRejected(output({ findings: [finding({ evidence_ids: ["invented-evidence"] })] }), "evidencia desconocida");
  });

  it("rejects a finding that cites evidence from a different event", () => {
    assertRejected(output({ findings: [finding({ evidence_ids: ["evidence-2"] })] }), "no cita la evidencia");
  });

  it("rejects a summary without known supporting evidence", () => {
    assertRejected(output({ summary_evidence_ids: ["invented-evidence"] }), "summary");
  });

  it("rejects findings without evidence", () => {
    assertRejected(output({ findings: [finding({ evidence_ids: [] })] }), "evidence_ids");
  });

  it("rejects unsupported evidence in trends and suggested updates", () => {
    assertRejected(
      output({
        trends: [{
          name: "Precios",
          direction: "growing",
          description: "Suben.",
          confidence: 80,
          evidence_ids: ["invented-evidence"],
        }],
      }),
      "trend",
    );
    assertRejected(
      output({
        findings: [finding({
          suggested_updates: [{
            competitor_id: "competitor-1",
            field: "notas",
            value: "Dato explícito",
            evidence_ids: ["invented-evidence"],
          }],
        })],
      }),
      "suggested_updates",
    );
  });

  it("rejects the complete response instead of silently dropping one bad finding", () => {
    assertRejected(
      output({
        findings: [
          finding(),
          finding({
            change_event_id: "invented-event",
            evidence_ids: ["evidence-1", "evidence-2"],
          }),
        ],
      }),
      "change_event_id",
    );
  });

  it("keeps valid change event and evidence IDs unchanged", () => {
    const result = parseAndValidateAiOutput(JSON.stringify(output()), evidence);
    assert.equal(result.findings[0]?.change_event_id, "event-1");
    assert.deepEqual(result.findings[0]?.evidence_ids, ["evidence-1"]);
  });

  it("maps known change event IDs to their exact persisted evidence IDs", () => {
    const result = parseAndValidateAiOutput(
      JSON.stringify(output({
        summary_evidence_ids: ["event-1"],
        trends: [{
          name: "Precios",
          direction: "growing",
          description: "Suben.",
          confidence: 80,
          evidence_ids: ["event-1"],
        }],
        findings: [finding({
          evidence_ids: ["event-1"],
          suggested_updates: [{
            competitor_id: "competitor-1",
            field: "notas",
            value: "Dato explícito",
            evidence_ids: ["event-1"],
          }],
        })],
      })),
      evidence,
    );

    assert.deepEqual(result.summary_evidence_ids, ["evidence-1"]);
    assert.deepEqual(result.trends[0]?.evidence_ids, ["evidence-1"]);
    assert.deepEqual(result.findings[0]?.evidence_ids, ["evidence-1"]);
    assert.deepEqual(
      result.findings[0]?.suggested_updates[0]?.evidence_ids,
      ["evidence-1"],
    );
  });

  it("maps an unknown finding event only when cited evidence identifies one exact event", () => {
    const result = parseAndValidateAiOutput(
      JSON.stringify(output({
        findings: [finding({ change_event_id: "invented-event" })],
      })),
      evidence,
    );

    assert.equal(result.findings[0]?.change_event_id, "event-1");
    assert.deepEqual(result.findings[0]?.evidence_ids, ["evidence-1"]);
  });

  it("still rejects an unknown finding event when cited evidence is ambiguous", () => {
    assertRejected(
      output({
        findings: [finding({
          change_event_id: "invented-event",
          evidence_ids: ["evidence-1", "evidence-2"],
        })],
      }),
      "change_event_id",
    );
  });

  it("normalizes explicit text booleans and preserves descriptive suggested fields", () => {
    const result = parseAndValidateAiOutput(
      JSON.stringify(output({
        findings: [finding({
          alert: "false",
          suggested_updates: [{
            competitor_id: "competitor-1",
            field: "proyectos_modulares",
            value: "Proyecto citado explícitamente",
            evidence_ids: ["evidence-1"],
          }],
        })],
      })),
      evidence,
    );
    assert.equal(result.findings[0]?.alert, false);
    assert.equal(result.findings[0]?.suggested_updates[0]?.field, "proyectos_modulares");
  });

  it("retries rejected responses without returning partial findings", async () => {
    const responses = [
      "{not-json",
      JSON.stringify(output({ findings: [finding({ evidence_ids: ["invented-evidence"] })] })),
      JSON.stringify(output()),
    ];
    const requestedAttempts: number[] = [];
    const delayedAttempts: number[] = [];

    const result = await requestValidatedAiOutput(
      async (attempt) => {
        requestedAttempts.push(attempt);
        return responses[attempt - 1] ?? "";
      },
      evidence,
      {
        delay: async (attempt) => {
          delayedAttempts.push(attempt);
        },
      },
    );

    assert.deepEqual(requestedAttempts, [1, 2, 3]);
    assert.deepEqual(delayedAttempts, [1, 2]);
    assert.equal(result.attemptCount, 3);
    assert.equal(result.attemptErrors.length, 2);
    assert.equal(result.output.findings.length, 1);
    assert.equal(result.output.findings[0]?.change_event_id, "event-1");
    assert.deepEqual(result.output.findings[0]?.evidence_ids, ["evidence-1"]);
  });

  it("throws the final validation error after exhausting retries", async () => {
    let attempts = 0;
    await assert.rejects(
      requestValidatedAiOutput(
        async () => {
          attempts += 1;
          return "{not-json";
        },
        evidence,
        { delay: async () => undefined },
      ),
      AiRequestAttemptsExhaustedError,
    );
    assert.equal(attempts, 3);
  });

  it("keeps retry audit data when persistence later fails", () => {
    const completedRequestAudit = {
      attemptCount: 3,
      attemptErrors: [
        { attempt: 1, error: "JSON inválido" },
        { attempt: 2, error: "evidencia desconocida" },
      ],
    };

    assert.deepEqual(
      resolveAiRequestAudit(new Error("falló la transacción"), completedRequestAudit),
      completedRequestAudit,
    );
  });
});

describe("RadarOH alert thresholds", () => {
  const baseFinding = {
    alert: true,
    importance: "high" as const,
    relevance: 70,
  };

  it("alerts at the relevance and confidence boundaries", () => {
    assert.equal(shouldCreateAiAlert(baseFinding, 60), true);
    assert.equal(shouldCreateAiAlert({ ...baseFinding, relevance: 69 }, 60), false);
    assert.equal(shouldCreateAiAlert(baseFinding, 59), false);
  });

  it("requires high or critical importance and an explicit alert flag", () => {
    assert.equal(shouldCreateAiAlert({ ...baseFinding, importance: "critical" }, 60), true);
    assert.equal(shouldCreateAiAlert({ ...baseFinding, importance: "medium" }, 100), false);
    assert.equal(shouldCreateAiAlert({ ...baseFinding, alert: false }, 100), false);
  });

  it("honors configurable thresholds at their exact boundaries", () => {
    const thresholds = {
      minimumImportanceRank: 3,
      minimumRelevance: 80,
      minimumConfidence: 75,
    };
    const criticalFinding = { ...baseFinding, importance: "critical" as const, relevance: 80 };

    assert.equal(shouldCreateAiAlert(criticalFinding, 75, thresholds), true);
    assert.equal(shouldCreateAiAlert({ ...criticalFinding, importance: "high" }, 75, thresholds), false);
    assert.equal(shouldCreateAiAlert({ ...criticalFinding, relevance: 79 }, 75, thresholds), false);
    assert.equal(shouldCreateAiAlert(criticalFinding, 74, thresholds), false);
  });
});