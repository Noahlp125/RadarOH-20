import assert from "node:assert/strict";
import { describe, it } from "node:test";
import {
  emptyIntegrationsOverview,
  integrationRegistrationSchema,
  isPublicHttpUrl,
  resolveIntegrationState,
} from "../src/lib/radar/integration-safety";

describe("Radar integration safety controls", () => {
  it("accepts documented http(s) integrations and rejects other documentation URLs", () => {
    assert.equal(integrationRegistrationSchema.safeParse({
      name: "CRM", provider: "example", category: "sales", documentation_url: "https://docs.example.com",
    }).success, true);
    assert.equal(integrationRegistrationSchema.safeParse({
      name: "CRM", provider: "example", category: "sales", documentation_url: "ftp://docs.example.com",
    }).success, false);
    assert.equal(isPublicHttpUrl("https://hooks.example.com/radar"), true);
    assert.equal(isPublicHttpUrl("http://localhost:3000/hook"), false);
    assert.equal(isPublicHttpUrl("https://192.168.1.10/hook"), false);
  });

  it("does not make an unauthorized or undocumented integration ready", () => {
    assert.equal(resolveIntegrationState({ authorized: false, documentationUrl: "https://docs.example.com", requestedStatus: "ready" }), "pending_authorization");
    assert.equal(resolveIntegrationState({ authorized: false, documentationUrl: "https://docs.example.com", requestedStatus: "paused" }), "paused");
    assert.equal(resolveIntegrationState({ authorized: true, documentationUrl: "", requestedStatus: "ready" }), "pending_authorization");
    assert.equal(resolveIntegrationState({ authorized: true, documentationUrl: "https://docs.example.com", requestedStatus: "ready" }), "ready");
  });

  it("builds a safe empty overview", () => {
    const overview = emptyIntegrationsOverview();
    assert.deepEqual(overview.integrations, []);
    assert.deepEqual(overview.deliveries, { total: 0, pending: 0, failed: 0, succeeded: 0 });
    assert.equal(overview.safety.external_connections_enabled, false);
    assert.deepEqual(overview.departments.map((department) => department.id), ["direccion", "marketing", "ventas", "operaciones"]);
  });
});