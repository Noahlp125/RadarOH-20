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
- `RADAR_AUTHORIZED_USER_IDS`
- Existing Clerk and OpenAI variables remain unchanged.

Supabase, to be added as secrets only when the migration is approved:

- `SUPABASE_DB_URL`: Supabase runtime connection string. Use a session pooler
  or direct connection for worker/advisory-lock operations.
- `SUPABASE_DB_DIRECT_URL`: direct connection string for applying the SQL
  migration and schema inspection.

The migration runner currently reads `SUPABASE_DB_URL` as its target. It never
uses a browser key or a service-role key.

## Safe execution order

1. Export the current RadarOH JSON from the UI and record its checksum.
2. Capture a read-only PostgreSQL backup and the source row counts.
3. Apply `supabase/migrations/0001_radar_schema.sql` to the empty Supabase
   project using the direct migration connection.
4. Run the data migrator with `RADAR_MIGRATION_CONFIRM=YES`. It:
   - reads the Replit database;
   - opens one transaction on Supabase;
   - rejects an existing `oh-casas` destination workspace;
   - preserves old IDs in `legacy_id`;
   - maps all foreign keys to new UUIDs;
   - rolls back the complete target transaction on failure.
5. Run the verification queries below.
6. Compare representative state, historical relationships and checksums.
7. Only after a successful review, adapt the backend connection/repository.
8. Keep Replit PostgreSQL unchanged and available for rollback.

The runner is not idempotent by overwrite design. A partially populated target
is not silently reused or truncated.

## Expected source counts

These are the counts observed in the development Replit database during the
architecture review:

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

Additional normalized Supabase tables expected after migration:

- `radar_workspace_members`: 0 until the authentication/workspace membership
  policy is explicitly bootstrapped.
- `radar_source_runtime`: 38, one row per source.
- `radar_ai_analysis_evidence`: 3 for the current snapshot, calculated from
  all persisted analysis `evidence_ids` arrays.
- `radar_ai_finding_evidence`: 3 for the current snapshot, calculated from all
  persisted finding `evidence_ids` arrays.

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
```

Expected results:

- No orphaned source, evidence, analysis or finding relations.
- Exactly one lease for the migrated workspace.
- 38 source runtime rows.
- No change to the Replit source counts.

## Rollback

Before backend cutover, rollback is configuration-only:

1. Do not start the Supabase worker.
2. Keep the Replit API/database untouched.
3. Return `DATABASE_URL`/provider selection to Replit.
4. Leave Supabase data intact for investigation.

After a cutover, stop the Supabase worker before switching back. Never run both
workers against the same live sources. The schema migration and data runner do
not contain destructive rollback statements.
