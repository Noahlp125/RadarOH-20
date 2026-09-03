---
name: RadarOH Supabase migration boundary
description: Approved scope and safety boundary for moving RadarOH persistence from Replit PostgreSQL to Supabase.
---

Move RadarOH to Supabase in a database-only first stage. Keep Clerk, the Express
API, Drizzle, the existing JSON contract, and the worker behavior unchanged at
the product boundary. Preserve imported identifiers through `legacy_id` and
keep Replit PostgreSQL intact until Supabase has passed count, relationship,
history, and operational checks.

**Why:** Migrating storage and authentication together would make workspace
authorization failures difficult to distinguish from data migration failures
and would weaken rollback. The user explicitly approved the staged boundary.

**How to apply:** Do not switch auth providers or expose Supabase directly to
the frontend during the database migration. Require explicit approval before
applying schema or copying data, stop the old worker before cutover, and retain
the JSON backup/import/export path throughout the transition.

When a Supabase direct database endpoint is IPv6-only but the Replit runtime has
no IPv6 route, use the Shared Pooler in Session mode on port 5432 for migration
and backend runtime rehearsals. Do not substitute Transaction mode for the
durable worker.

**Why:** RadarOH depends on session-scoped advisory locks for leader election
and per-job fencing. Transaction pooling cannot preserve those locks across
queries, while Session mode does.

**How to apply:** Confirm connectivity and run a two-session advisory-lock
contention check before relying on the pooler. Keep the direct URL available for
environments that support IPv6, but do not treat it as usable until tested from
the actual runtime.

Automated rehearsals must keep separate Session pooler URLs for the staging
owner and the restricted application runtime.

**Why:** The pooler owner identity can administer tables but cannot necessarily
impersonate the dedicated runtime login. Conversely, the runtime correctly
cannot perform count, constraint or cleanup queries outside `radar_backend`.

**How to apply:** Use the owner URL only for baseline verification,
transactional constraints and cleanup. Use the runtime URL for repository, RLS,
API and advisory-lock checks; never reuse either URL as the Replit source.