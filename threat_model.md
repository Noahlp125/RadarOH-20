# Threat Model

## Project Overview

RadarOH is OH Casas' internal competitive-intelligence platform. A React/Vite client uses an Express API backed by managed PostgreSQL. The API monitors public RSS, JSON and web sources and sends persisted evidence to OpenAI through Replit AI Integrations. Replit-managed Clerk provides browser sessions.

## Assets

- **Competitive intelligence** — competitors, sources, keywords, evidence, alerts, reports and action plans are confidential business data.
- **Monitoring integrity** — source configuration and evidence fingerprints determine what downstream analysis can trust.
- **AI integrity** — findings must reference persisted evidence; unsupported model output must never become an alert or proposed update.
- **Sessions and authorization configuration** — Clerk cookies and the production user allowlist control access to the whole workspace.
- **Application secrets** — Clerk, PostgreSQL and AI Integration credentials must remain server-side and only in Replit Secrets.
- **Audit history** — actor, operation, result and timestamp are needed to investigate changes.

## Trust Boundaries

- **Public browser to protected API** — the browser and all request data are untrusted. Every `/api/radar/*` route requires a verified Clerk session and workspace authorization.
- **API to PostgreSQL** — the physical database owner can bypass RLS. Radar transactions therefore reduce privileges to a `NOLOGIN`, `NOBYPASSRLS` role before accessing workspace data.
- **API to public sources** — configured URLs are attacker-influenced. DNS, redirects, protocols, response sizes and timeouts must be checked to prevent SSRF and resource exhaustion.
- **API to OpenAI** — only bounded, persisted evidence crosses this boundary. Model output is untrusted and requires schema and evidence-reference validation.
- **Development to production** — secrets, Clerk tenants, database contents and user IDs differ. Production must fail closed without an explicit authorized-user list.
- **Unauthenticated to authenticated UI** — only the landing and Clerk callback routes are public; competitive data must not render before session state is signed in.

## Scan Anchors

- Production entry points: `artifacts/api-server/src/index.ts`, `artifacts/api-server/src/app.ts`, `artifacts/radar-oh/src/App.tsx`.
- Highest-risk areas: `artifacts/api-server/src/routes/`, `src/lib/radar/connectors.ts`, `src/lib/radar/ai.ts`, `src/lib/radar/repository.ts`.
- Public surface: `/api/healthz`, landing page, `/sign-in/*?`, `/sign-up/*?`, Clerk proxy.
- Protected surface: every `/api/radar/*` endpoint and the legacy RadarOH application.
- Dev-only surface: `artifacts/mockup-sandbox/`.

## Threat Categories

### Spoofing

An attacker may forge requests or create an unapproved Clerk account. The API must validate Clerk on every Radar route and production must reject every user ID not present in `RADAR_AUTHORIZED_USER_IDS`. Browser API calls use secure session cookies, never client-managed bearer tokens.

### Tampering

An authenticated user or compromised source may alter monitored state or inject oversized/arbitrary records. Mutations must be server-authorized, schema-validated and bounded. PostgreSQL writes must run under workspace RLS. Destructive removal must remain an explicit operation.

### Repudiation

Sensitive mutations without actor attribution cannot be investigated. Audit records must include the authenticated Clerk user ID, route, method, result and timestamp. Application logs must use request IDs and must not log cookies, tokens or secret values.

### Information Disclosure

The primary risk is exposure of the complete intelligence dataset. No Radar API may be public, errors must not return stack traces or database details, and CORS must not grant cross-origin browser access. Raw evidence and exports receive the same authorization as dashboards.

### Denial of Service

Monitoring, AI analysis, imports and exports consume network, database and model capacity. Requests and collections must be bounded, expensive endpoints must have tighter rate limits, public-source requests must enforce timeouts and size limits, and schedulers must not run concurrently across instances.

### Elevation of Privilege

Authentication alone is insufficient because self-sign-up may be enabled. Production authorization must use an explicit allowlist. Database-owner privileges must be reduced to `radar_app` inside each transaction so `FORCE ROW LEVEL SECURITY` cannot be bypassed. All SQL values must remain parameterized.
