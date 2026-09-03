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