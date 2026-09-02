---
name: RadarOH build environment
description: Environment-specific build requirements for the RadarOH web artifact.
---

The managed web workflow injects both `PORT` and `BASE_PATH`. A direct Vite production build must provide both values explicitly; setting only `PORT` fails before Vite loads the config.

**Why:** The artifact config intentionally fails fast when routing metadata is absent, while the workflow supplies that metadata automatically.

**How to apply:** Prefer restarting the managed web workflow for preview verification; when running a standalone production build, set `PORT` and the artifact's configured base path.

In artifact-mode Autoscale publishing, the startup probe may hit the API artifact's preview path (`/api`) even when a more specific startup health path is declared. The runnable service must open its port before slow database initialization, keep business routes gated until ready, and return liveness success at the artifact root. Business requests must wait for initialization without a fixed application-level timeout; an arbitrary timeout recreated cold-start 503s when concurrent security DDL took longer.

**Why:** Waiting for PostgreSQL security DDL before `listen()` caused a successful image build to fail promotion because the public port never became detectable and `/api` returned a proxy-level 500.

**How to apply:** Keep `/api` and `/api/healthz` dependency-free, use `/api/readyz` for database readiness, and never expose Radar routes until startup initialization has completed. A frontend startup failure must retry the central API and show an explicit error; it must not silently switch an authenticated user to cached local data.