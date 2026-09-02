# RadarOH 2.0

Plataforma centralizada de inteligencia competitiva y monitorización digital para OH Casas.

## Run & Operate

- `pnpm --filter @workspace/api-server run dev` — run the API server (port 5000)
- `pnpm --filter @workspace/radar-oh run dev` — run the RadarOH web app
- `pnpm --filter @workspace/radar-oh run typecheck` — typecheck the RadarOH web app
- `pnpm --filter @workspace/radar-oh run build` — build the RadarOH web app (the workflow injects `PORT` and `BASE_PATH`)
- `pnpm run typecheck` — full typecheck across all packages
- `pnpm run build` — typecheck + build all packages
- `pnpm --filter @workspace/api-spec run codegen` — regenerate API hooks and Zod schemas from the OpenAPI spec
- `pnpm --filter @workspace/db run push` — push DB schema changes (dev only)
- Required env: `DATABASE_URL` — Postgres connection string

## Stack

- pnpm workspaces, Node.js 24, TypeScript 5.9
- API: Express 5
- DB: PostgreSQL + Drizzle ORM
- Validation: Zod (`zod/v4`), `drizzle-zod`
- API codegen: Orval (from OpenAPI spec)
- Build: esbuild (CJS bundle)

## Where things live

- `artifacts/radar-oh` — web artifact for the RadarOH product
- `artifacts/radar-oh/src/legacy/App.jsx` — synchronized functional UI carried over from the original RadarOH
- `artifacts/radar-oh/docs/radar-oh-fase-1.md` — Phase 1 source-of-truth and preservation decisions
- `artifacts/radar-oh/docs/legacy-radar-oh-main-App.jsx` — preserved copy of the original `main` source
- `.conversation/attached_assets/` — preserved original JSON and screenshots
- `artifacts/api-server` — existing API service, not yet connected to RadarOH domain data
- `lib/api-spec/openapi.yaml` — existing API contract, unchanged in Phase 1
- `lib/db/src/schema/` — existing Drizzle schema location, unchanged in Phase 1

## Architecture decisions

- Phase 1 keeps localStorage and the current JSON shape; PostgreSQL/API centralization is deferred to later approved phases.
- The published `gh-pages` behavior is the functional reference because it includes JSON import/export and matches the supplied captures.
- The original source is preserved; the synchronized UI remains isolated under `src/legacy` until modularization is approved.
- Original JSON files are never silently corrected, overwritten, or deleted.

## Product

- Resumen visual de vigilancia competitiva
- Gestión de fuentes, competidores y keywords
- Plan de acciones 30-60-90
- Persistencia local compatible con la versión original
- Importación y exportación JSON con validación estructural y confirmación de sustitución

## User preferences

No preferences recorded.

## Gotchas

- Direct Vite builds require the workflow-provided `PORT` and `BASE_PATH`; use the managed RadarOH workflow for preview verification.
- Do not create the PostgreSQL schema or monitoring worker before the current phase is explicitly approved.
- Do not remove the preserved JSON or legacy source snapshots.

## Pointers

- See the `pnpm-workspace` skill for workspace structure, TypeScript setup, and package details
