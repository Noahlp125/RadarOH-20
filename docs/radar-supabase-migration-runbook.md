# RadarOH: Supabase migration runbook

This runbook prepares the Replit PostgreSQL to Supabase migration. It is
intentionally not executed by application startup, deployment, or tests.

## Files

- `supabase/migrations/0001_radar_schema.sql`: schema, constraints, indexes and
  RLS only. It does not copy or delete data.
- `lib/db/src/migrate-radar-to-supabase.ts`: explicit data transfer for the
  current workspace and all current RadarOH tables.
- `artifacts/radar-oh/src/data/radarApi.ts`: remains unchanged during the
  database-only migration.

## Variables

Current Replit runtime:

- `DATABASE_URL`: existing Replit PostgreSQL connection. Read-only for this
  migration runner.
- `RADAR_WORKSPACE_ID=oh-casas`
- `RADAR_DATABASE_PROVIDER=replit` (this is also the default).
- `RADAR_WORKER_ENABLED=false` during drain/migration.
- `RADAR_WRITE_FREEZE=true` during the RPO 0 rollback window.
- `RADAR_AUTHORIZED_USER_IDS`
- Existing Clerk and OpenAI variables remain unchanged.

Supabase, to be added as secrets only when the migration is approved:

- `SUPABASE_DB_URL`: Supabase runtime connection string. Use a session pooler
  or direct connection for worker/advisory-lock operations.
- `SUPABASE_DB_DIRECT_URL`: direct connection string for applying the SQL
  migration, schema inspection and running the data migrator as migration
  owner.
- The runtime URL must use a dedicated PostgreSQL login that is a member of
  `radar_backend` only. It must not be the migration owner and must not be able
  to `SET ROLE radar_workspace_admin`.
- `RADAR_EXPECTED_LEGACY_WORKSPACE_ID=oh-casas`: optional explicit source
  assertion used by the runner.

The migration runner reads only `SUPABASE_DB_DIRECT_URL` as its target.
`SUPABASE_DB_URL` is reserved for the restricted runtime login. The runner
never uses a browser key or a service-role key.

Only at backend cutover:

- Set the runtime `DATABASE_URL` to the approved Supabase session-pooler or
  direct connection.
- Set `RADAR_DATABASE_PROVIDER=supabase`.
- Set `RADAR_WORKSPACE_UUID` to the migrated workspace UUID selected by
  `legacy_key='oh-casas'`.
- Keep `RADAR_WORKSPACE_ID=oh-casas`; it remains the public/API workspace key.

Do not use transaction-pooler mode for the worker. Session advisory locks must
stay on one PostgreSQL session.

## Safe execution order

1. Deploy a maintenance configuration against Replit with
   `RADAR_WRITE_FREEZE=true` and `RADAR_WORKER_ENABLED=false`.
2. Confirm mutation requests return HTTP 503 and reads still work. Confirm
   there are no monitor runs, AI analyses or worker jobs in `running`.
3. Export the current RadarOH JSON and record its SHA-256 checksum. Capture a
   read-only PostgreSQL backup and source row counts.
4. Apply `supabase/migrations/0001_radar_schema.sql` to an empty Supabase
   project using the direct migration connection.
5. In an independently reviewed administrative step, provision the dedicated
   runtime login and grant it only `radar_backend`. Do not grant
   `radar_workspace_admin`; store its credential through Replit Secrets.
6. Run the data migrator with `RADAR_MIGRATION_CONFIRM=YES`. It:
   - checks the source contains exactly `oh-casas` and no other workspace;
   - uses a `REPEATABLE READ READ ONLY` source transaction;
   - acquires a target advisory lock and uses a `SERIALIZABLE` transaction;
   - rejects any row in every destination RadarOH table;
   - preserves UUIDs when possible and stores every old ID as a legacy ID;
   - validates all source/target and normalized-relation counts before commit;
   - rolls back both open transactions on failure.
7. Run the verification and RLS checks below with the direct connection and
   repeat the authorization checks with the dedicated runtime login.
8. While writes and both workers remain disabled, cut the API runtime to
   Supabase using the variables above. Run read-only API/UI smoke checks.
9. Choose one outcome:
   - **Rollback inside the RPO 0 window:** restore the Replit runtime settings.
     Because no writes were accepted after the snapshot, Replit is current.
   - **Commit the cutover:** explicitly accept the point of no return, then set
     `RADAR_WRITE_FREEZE=false` and `RADAR_WORKER_ENABLED=true` on Supabase.
10. Keep Replit PostgreSQL unchanged and access-controlled as the migration
   snapshot. Do not run a Replit worker after Supabase is live.

The runner is not idempotent by overwrite design. A partially populated target
is never reused, merged or truncated. A retry requires a newly prepared empty
target or an operator-reviewed cleanup outside this runbook.

## Expected source counts

Record the actual counts immediately after write freeze. The earlier
architecture-review snapshot below is only a reference and must not be used as
an execution assertion:

| Table | Expected |
|---|---:|
| `radar_workspaces` | 1 |
| `radar_competitors` | 14 |
| `radar_keywords` | 15 |
| `radar_sources` | 38 |
| `radar_plan_items` | 8 |
| `radar_imports` | 1 |
| `radar_monitor_runs` | 80 |
| `radar_monitor_evidence` | 371 |
| `radar_change_events` | 371 |
| `radar_ai_analyses` | 25 |
| `radar_ai_analysis_evidence` | 3 |
| `radar_ai_findings` | 2 |
| `radar_ai_finding_evidence` | 3 |
| `radar_ai_alerts` | 1 |
| `radar_activity_log` | 51 |
| `radar_alert_preferences` | 1 |
| `radar_integrations` | 0 |
| `radar_webhook_subscriptions` | 0 |
| `radar_integration_deliveries` | 0 |
| `radar_worker_jobs` | 39 |
| `radar_worker_leases` | 1 |

Additional normalized Supabase counts must be derived from the frozen source:

- `radar_workspace_members`: 0 until the authentication/workspace membership
  policy is explicitly bootstrapped.
- `radar_source_runtime`: exactly one row per source.
- `radar_ai_analysis_evidence`: the distinct IDs in each persisted analysis
  `evidence_ids` array.
- `radar_ai_finding_evidence`: the distinct IDs in each persisted finding
  `evidence_ids` array.

## Verification queries

Run equivalent count queries on both databases. For the normalized target,
compare the source table to the target table as follows:

```sql
select 'workspaces' as entity, count(*) from public.radar_workspaces
union all select 'competitors', count(*) from public.radar_competitors
union all select 'keywords', count(*) from public.radar_keywords
union all select 'sources', count(*) from public.radar_sources
union all select 'source_runtime', count(*) from public.radar_source_runtime
union all select 'plan_items', count(*) from public.radar_plan_items
union all select 'imports', count(*) from public.radar_imports
union all select 'monitor_runs', count(*) from public.radar_monitor_runs
union all select 'monitor_evidence', count(*) from public.radar_monitor_evidence
union all select 'change_events', count(*) from public.radar_change_events
union all select 'ai_analyses', count(*) from public.radar_ai_analyses
union all select 'ai_findings', count(*) from public.radar_ai_findings
union all select 'ai_alerts', count(*) from public.radar_ai_alerts
union all select 'activity_log', count(*) from public.radar_activity_log
union all select 'alert_preferences', count(*) from public.radar_alert_preferences
union all select 'integrations', count(*) from public.radar_integrations
union all select 'webhooks', count(*) from public.radar_webhook_subscriptions
union all select 'deliveries', count(*) from public.radar_integration_deliveries
union all select 'worker_jobs', count(*) from public.radar_worker_jobs
union all select 'worker_leases', count(*) from public.radar_worker_leases
union all select 'analysis_evidence', count(*) from public.radar_ai_analysis_evidence
union all select 'finding_evidence', count(*) from public.radar_ai_finding_evidence;
```

Also verify:

```sql
select count(*) from public.radar_sources
where competitor_id is not null;

select count(*) from public.radar_change_events event
left join public.radar_monitor_evidence evidence on evidence.id = event.evidence_id
where evidence.id is null;

select count(*) from public.radar_ai_findings finding
left join public.radar_ai_analyses analysis on analysis.id = finding.analysis_id
where analysis.id is null;

select count(*) from public.radar_worker_leases;

select legacy_key, id
from public.radar_workspaces;

select count(*)
from public.radar_source_runtime runtime
join public.radar_sources source
  on source.workspace_id = runtime.workspace_id
 and source.id = runtime.source_id;
```

Expected results:

- No orphaned source, evidence, analysis or finding relations.
- Exactly one lease for the migrated workspace.
- One source runtime row per source.
- No change to the Replit source counts.

## Permission and RLS verification

The migration deliberately grants no RadarOH table privileges to Supabase
browser roles. Clerk remains at the API boundary.

Using the direct/admin connection, verify:

```sql
select has_table_privilege('anon', 'public.radar_sources', 'select');
select has_table_privilege('authenticated', 'public.radar_sources', 'select');
-- Both must be false.

begin;
set local app.workspace_id = '<migrated-workspace-uuid>';
set local role radar_backend;
select count(*) from public.radar_sources;
rollback;

begin;
set local app.workspace_id = '00000000-0000-4000-8000-000000000000';
set local role radar_backend;
select count(*) from public.radar_sources;
rollback;
-- The second count must be zero.
```

Using the dedicated runtime login, verify:

```sql
select pg_has_role(current_user, 'radar_backend', 'MEMBER');        -- true
select pg_has_role(current_user, 'radar_workspace_admin', 'MEMBER'); -- false
select has_table_privilege(current_user, 'public.radar_sources', 'select');
-- The table privilege is inherited only through radar_backend; application
-- transactions still SET LOCAL ROLE radar_backend before issuing data queries.
```

Also attempt an insert whose `workspace_id` is correct but whose referenced
competitor/source/evidence belongs to a different test workspace. The composite
foreign key must reject it. Perform that destructive test only in a disposable
staging project, never in the migration target.

## Rollback

Before accepting writes on Supabase, rollback is configuration-only and RPO 0:

1. Keep `RADAR_WRITE_FREEZE=true` and `RADAR_WORKER_ENABLED=false`.
2. Return `DATABASE_URL` and `RADAR_DATABASE_PROVIDER` to Replit.
3. Remove `RADAR_WORKSPACE_UUID` from the Replit runtime configuration.
4. Validate reads against Replit.
5. Set `RADAR_WRITE_FREEZE=false`, then restart the Replit worker.
6. Leave Supabase data intact and read-only for investigation.

Once writes are reopened on Supabase, Replit is no longer guaranteed current.
At that point a direct switch back is forbidden: it would lose accepted writes.
Any later rollback requires a separately reviewed reverse-delta migration while
both APIs are write-frozen. Never run both workers against the same live
sources. The schema migration and data runner contain no destructive rollback
statements and never modify or delete the Replit database.

## Automated staging rehearsal

The opt-in harness reproduces the critical staging checks without running during
normal builds:

```bash
RADAR_SUPABASE_REHEARSAL_CONFIRM=YES \
RADAR_REHEARSAL_SOURCE_URL="$DATABASE_URL" \
RADAR_REHEARSAL_OWNER_URL="$SUPABASE_STAGING_DB_SESSION_URL" \
DATABASE_URL="<dedicated-staging-runtime-url>" \
RADAR_DATABASE_PROVIDER=supabase \
RADAR_REHEARSAL_WORKSPACE_UUID="<migrated-workspace-uuid>" \
RADAR_REHEARSAL_API_URL="http://127.0.0.1:<isolated-api-port>" \
pnpm --filter @workspace/api-server run test:supabase-rehearsal
```

Safety requirements:

- `DATABASE_URL` must be the restricted staging runtime login, not production.
- `RADAR_REHEARSAL_OWNER_URL` must be the staging owner Session pooler URL.
- The isolated API must run with `RADAR_WRITE_FREEZE=true` and
  `RADAR_WORKER_ENABLED=false`.
- Source and target URLs must differ.
- Constraint writes are wrapped in `ROLLBACK`.
- The JSON round-trip audit row is deleted in cleanup.
- The harness captures all source IDs before testing and fails if any disappear.
- Update the frozen baseline counts in
  `test/supabase-rehearsal.test.ts` only after accepting a new snapshot.

The harness validates frozen counts, UUID/legacy integrity, foreign keys, RLS,
runtime authorization, JSON import/export, worker lease shape, advisory locks,
API health/readiness, AI/evidence relations, fingerprints, freeze behavior and
source data preservation.
