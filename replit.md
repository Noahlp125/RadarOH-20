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
- `artifacts/radar-oh/src/data/radarApi.ts` — generated API client boundary for central persistence
- `artifacts/radar-oh/docs/radar-oh-fase-1.md` — Phase 1 source-of-truth and preservation decisions
- `artifacts/radar-oh/docs/radar-oh-fase-2.md` — Phase 2 persistence, migration, security and verification record
- `artifacts/radar-oh/docs/legacy-radar-oh-main-App.jsx` — preserved copy of the original `main` source
- `scripts/src/migrate-radar.ts` — repeatable JSON-to-API migration utility
- `.conversation/attached_assets/` — preserved original JSON and screenshots
- `artifacts/api-server` — modular API service with RadarOH state, import and CRUD routes
- `lib/api-spec/openapi.yaml` — contract-first RadarOH API specification
- `lib/db/src/schema/` — Drizzle schema for normalized RadarOH data and raw snapshots

## Architecture decisions

- Phase 1 kept localStorage and the current JSON shape; Phase 2 adds PostgreSQL/API persistence without removing that compatibility layer.
- PostgreSQL is the managed Replit database for this phase; no external Supabase connection is configured.
- The published `gh-pages` behavior is the functional reference because it includes JSON import/export and matches the supplied captures.
- The original source is preserved; the synchronized UI remains under `src/legacy` while its persistence boundary is now isolated in `src/data`.
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
- Monitoring and AI recurring work must use the PostgreSQL-backed durable worker; do not add independent in-process schedulers or a second worker command.
- Operational endpoints are `/api/healthz`, `/api/readyz`, and `/api/metrics`; Phase 10 operating guidance is in `artifacts/radar-oh/docs/radar-oh-fase-10.md`.
- Do not remove the preserved JSON or legacy source snapshots.

## Pointers

- See the `pnpm-workspace` skill for workspace structure, TypeScript setup, and package details
