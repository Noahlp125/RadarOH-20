import assert from "node:assert/strict";
import { describe, it } from "node:test";
import {
  recordHttpRequest,
  recordWorkerJob,
  renderMetrics,
  safeRoute,
} from "../src/lib/observability";
import { readinessStatus } from "../src/routes/health";
import { requestIdFromHeader } from "../src/app";

describe("operational observability", () => {
  it("uses bounded route labels and Prometheus text", () => {
    assert.equal(safeRoute("/api/radar/sources/secret?token=never"), "/api/radar/*");
    assert.equal(safeRoute("/readyz"), "/api/readyz");
    assert.equal(safeRoute("/outside/tenant-123"), "other");
    recordHttpRequest("GET", "/api/radar/a-sensitive-id?secret=value", 500, 12);
    recordWorkerJob("untrusted-kind", "error");
    const metrics = renderMetrics();
    assert.match(metrics, /radar_http_requests_total\{method="GET",route="\/api\/radar\/\*",status="5xx"\} 1/);
    assert.match(metrics, /radar_worker_jobs_processed_total\{kind="unknown",status="error"\} 1/);
    assert.doesNotMatch(metrics, /secret=value|a-sensitive-id|tenant-123/);
  });

  it("maps readiness failures to a generic unavailable status", async () => {
    assert.equal(await readinessStatus(async () => undefined), 200);
    assert.equal(await readinessStatus(async () => { throw new Error("database details"); }), 503);
  });

  it("only accepts bounded safe request identifiers", () => {
    assert.equal(requestIdFromHeader("edge-abc_123.4"), "edge-abc_123.4");
    assert.match(requestIdFromHeader("bad value\r\nx-header: injected"), /^[0-9a-f-]{36}$/);
    assert.match(requestIdFromHeader("x".repeat(129)), /^[0-9a-f-]{36}$/);
  });
});