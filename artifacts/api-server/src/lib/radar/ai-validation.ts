import { z } from "zod";

export const suggestedUpdateSchema = z.object({
  competitor_id: z.string(),
  field: z.string().min(1).max(120),
  value: z.string().min(1).max(1500),
  evidence_ids: z.array(z.string()).min(1),
});

const aiBooleanSchema = z.preprocess((value) => {
  if (typeof value !== "string") return value;
  const normalized = value.trim().toLocaleLowerCase();
  if (["true", "yes", "sí", "si", "1"].includes(normalized)) return true;
  if (["false", "no", "0"].includes(normalized)) return false;
  return value;
}, z.boolean());

export const aiOutputSchema = z.object({
  summary: z.string().min(1).max(5000),
  summary_evidence_ids: z.array(z.string()).min(1),
  trends: z.array(z.object({
    name: z.string().min(1).max(255),
    direction: z.enum(["emerging", "growing", "stable", "declining"]),
    description: z.string().min(1).max(1500),
    confidence: z.number().int().min(0).max(100),
    evidence_ids: z.array(z.string()).min(1),
  })).max(12),
  findings: z.array(z.object({
    change_event_id: z.string(),
    event_type: z.enum(["launch", "pricing", "content", "reputation", "expansion", "technology", "regulatory", "market", "other"]),
    importance: z.enum(["low", "medium", "high", "critical"]),
    relevance: z.number().int().min(0).max(100),
    confidence: z.number().int().min(0).max(100),
    title: z.string().min(1).max(255),
    summary: z.string().min(1).max(2000),
    rationale: z.string().min(1).max(2000),
    opportunity: z.string().max(1500).default(""),
    risk: z.string().max(1500).default(""),
    trend: z.string().max(500).default(""),
    evidence_ids: z.array(z.string()).min(1),
    suggested_updates: z.array(suggestedUpdateSchema).max(8).default([]),
    alert: aiBooleanSchema.default(false),
  })).max(50),
});

export type AiOutput = z.infer<typeof aiOutputSchema>;

export type AiEvidenceReference = {
  change_event_id: string;
  evidence_id: string;
  competitor_id?: string | null;
};

export class AiOutputValidationError extends Error {
  readonly issues: string[];

  constructor(issues: string[]) {
    super(`Respuesta de IA rechazada: ${issues.join(" ")}`);
    this.name = "AiOutputValidationError";
    this.issues = issues;
  }
}

export type AiAttemptError = {
  attempt: number;
  error: string;
};

export type AiRequestAudit = {
  attemptCount: number;
  attemptErrors: AiAttemptError[];
};

export class AiRequestAttemptsExhaustedError extends Error {
  readonly attemptCount: number;
  readonly attemptErrors: AiAttemptError[];

  constructor(attemptErrors: AiAttemptError[], cause: unknown) {
    const finalMessage = sanitizeAttemptError(cause);
    super(`La IA agotó ${attemptErrors.length} intentos. Último error: ${finalMessage}`);
    this.name = "AiRequestAttemptsExhaustedError";
    this.attemptCount = attemptErrors.length;
    this.attemptErrors = attemptErrors;
  }
}

/**
 * Check every model-provided reference against the exact evidence batch sent
 * to the model. This deliberately rejects the whole response instead of
 * dropping individual findings or trends, so a partially grounded response
 * can never reach persistence.
 */
export function validateAiOutputReferences(
  result: AiOutput,
  evidence: AiEvidenceReference[],
): AiOutput {
  const allowedEvidenceIds = new Set(evidence.map((item) => item.evidence_id));
  const allowedEventIds = new Set(evidence.map((item) => item.change_event_id));
  const evidenceIdByEventId = new Map(evidence.map((item) => [item.change_event_id, item.evidence_id]));
  const evidenceById = new Map(evidence.map((item) => [item.evidence_id, item]));
  const issues: string[] = [];

  const unknownSummaryEvidenceIds = result.summary_evidence_ids.filter((id) => !allowedEvidenceIds.has(id));
  if (unknownSummaryEvidenceIds.length) {
    issues.push(`summary cita evidencia desconocida: ${unknownSummaryEvidenceIds.join(", ")}.`);
  }

  result.trends.forEach((trend, index) => {
    const unknownEvidenceIds = trend.evidence_ids.filter((id) => !allowedEvidenceIds.has(id));
    if (unknownEvidenceIds.length) {
      issues.push(`trend[${index}] cita evidencia desconocida: ${unknownEvidenceIds.join(", ")}.`);
    }
  });

  result.findings.forEach((finding, index) => {
    if (!allowedEventIds.has(finding.change_event_id)) {
      issues.push(`finding[${index}] referencia change_event_id desconocido: ${finding.change_event_id}.`);
    }

    const eventEvidenceId = evidenceIdByEventId.get(finding.change_event_id);
    if (eventEvidenceId && !finding.evidence_ids.includes(eventEvidenceId)) {
      issues.push(
        `finding[${index}] no cita la evidencia ${eventEvidenceId} de su change_event_id ${finding.change_event_id}.`,
      );
    }

    const unknownEvidenceIds = finding.evidence_ids.filter((id) => !allowedEvidenceIds.has(id));
    if (unknownEvidenceIds.length) {
      issues.push(`finding[${index}] cita evidencia desconocida: ${unknownEvidenceIds.join(", ")}.`);
    }

    finding.suggested_updates.forEach((update, updateIndex) => {
      const unknownUpdateEvidenceIds = update.evidence_ids.filter((id) => !allowedEvidenceIds.has(id));
      if (unknownUpdateEvidenceIds.length) {
        issues.push(
          `finding[${index}].suggested_updates[${updateIndex}] cita evidencia desconocida: ${unknownUpdateEvidenceIds.join(", ")}.`,
        );
      }
      const citesMatchingCompetitor = update.evidence_ids.some(
        (id) => evidenceById.get(id)?.competitor_id === update.competitor_id,
      );
      if (!citesMatchingCompetitor) {
        issues.push(
          `finding[${index}].suggested_updates[${updateIndex}] no cita evidencia del competidor ${update.competitor_id}.`,
        );
      }
    });
  });

  if (issues.length) throw new AiOutputValidationError(issues);
  return result;
}

/**
 * Models occasionally copy a valid change_event_id into an evidence_ids field
 * even when the prompt distinguishes both identifiers. Resolve only that
 * unambiguous, persisted relationship. Truly unknown identifiers remain
 * unchanged and are rejected by validateAiOutputReferences.
 */
export function normalizeAiOutputEvidenceReferences(
  result: AiOutput,
  evidence: AiEvidenceReference[],
): AiOutput {
  const evidenceIdByEventId = new Map(
    evidence.map((item) => [item.change_event_id, item.evidence_id]),
  );
  const eventIdByEvidenceId = new Map(
    evidence.map((item) => [item.evidence_id, item.change_event_id]),
  );
  const allowedEventIds = new Set(evidence.map((item) => item.change_event_id));
  const normalizeIds = (ids: string[]) =>
    ids.map((id) => evidenceIdByEventId.get(id) ?? id);
  const normalizeFinding = (finding: AiOutput["findings"][number]) => {
    const evidenceIds = normalizeIds(finding.evidence_ids);
    const citedEventIds = new Set(
      evidenceIds
        .map((id) => eventIdByEvidenceId.get(id))
        .filter((id): id is string => Boolean(id)),
    );
    const changeEventId = allowedEventIds.has(finding.change_event_id)
      ? finding.change_event_id
      : citedEventIds.size === 1
        ? [...citedEventIds][0]!
        : finding.change_event_id;

    return {
      ...finding,
      change_event_id: changeEventId,
      evidence_ids: evidenceIds,
      suggested_updates: finding.suggested_updates.map((update) => ({
        ...update,
        evidence_ids: normalizeIds(update.evidence_ids),
      })),
    };
  };

  return {
    ...result,
    summary_evidence_ids: normalizeIds(result.summary_evidence_ids),
    trends: result.trends.map((trend) => ({
      ...trend,
      evidence_ids: normalizeIds(trend.evidence_ids),
    })),
    findings: result.findings.map(normalizeFinding),
  };
}

export function parseAndValidateAiOutput(
  content: string,
  evidence: AiEvidenceReference[],
): AiOutput {
  let parsedJson: unknown;
  try {
    parsedJson = JSON.parse(content);
  } catch {
    throw new AiOutputValidationError(["el contenido no es JSON válido."]);
  }

  const parsed = aiOutputSchema.safeParse(parsedJson);
  if (!parsed.success) {
    throw new AiOutputValidationError(
      parsed.error.issues.map((issue) => {
        const path = issue.path.length ? issue.path.join(".") : "respuesta";
        return `${path}: ${issue.message}.`;
      }),
    );
  }
  return validateAiOutputReferences(
    normalizeAiOutputEvidenceReferences(parsed.data, evidence),
    evidence,
  );
}

function sanitizeAttemptError(error: unknown): string {
  const message = error instanceof Error ? error.message : "Error desconocido de análisis.";
  return message.replace(/\s+/g, " ").slice(0, 1000);
}

export async function requestValidatedAiOutput(
  requestContent: (attempt: number) => Promise<string>,
  evidence: AiEvidenceReference[],
  options: {
    attempts?: number;
    delay?: (attempt: number) => Promise<void>;
  } = {},
): Promise<{ output: AiOutput } & AiRequestAudit> {
  const attempts = Math.max(1, options.attempts ?? 3);
  const delay = options.delay ?? (
    (attempt: number) => new Promise((resolve) => setTimeout(resolve, 500 * 2 ** (attempt - 1)))
  );
  let lastError: unknown;
  const attemptErrors: AiAttemptError[] = [];

  for (let attempt = 1; attempt <= attempts; attempt += 1) {
    try {
      return {
        output: parseAndValidateAiOutput(await requestContent(attempt), evidence),
        attemptCount: attempt,
        attemptErrors,
      };
    } catch (error) {
      lastError = error;
      attemptErrors.push({ attempt, error: sanitizeAttemptError(error) });
      if (attempt < attempts) await delay(attempt);
    }
  }

  throw new AiRequestAttemptsExhaustedError(attemptErrors, lastError);
}

export function resolveAiRequestAudit(
  error: unknown,
  completedRequestAudit?: AiRequestAudit,
): AiRequestAudit {
  if (completedRequestAudit) return completedRequestAudit;
  if (error instanceof AiRequestAttemptsExhaustedError) {
    return {
      attemptCount: error.attemptCount,
      attemptErrors: error.attemptErrors,
    };
  }
  return { attemptCount: 0, attemptErrors: [] };
}

export function shouldCreateAiAlert(
  finding: Pick<AiOutput["findings"][number], "alert" | "importance" | "relevance">,
  confidence: number,
  thresholds: {
    minimumImportanceRank?: number;
    minimumRelevance?: number;
    minimumConfidence?: number;
  } = {},
): boolean {
  const importanceRank: Record<AiOutput["findings"][number]["importance"], number> = {
    low: 0,
    medium: 1,
    high: 2,
    critical: 3,
  };
  return (
    finding.alert &&
    importanceRank[finding.importance] >= (thresholds.minimumImportanceRank ?? 2) &&
    finding.relevance >= (thresholds.minimumRelevance ?? 70) &&
    confidence >= (thresholds.minimumConfidence ?? 60)
  );
}