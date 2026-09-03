# RadarOH Supabase production-readiness audit — 2026-09-03

## Decision

**NO-GO for production cutover.**

The migration mechanics, runtime compatibility, isolation and rollback are
validated. RPO/RTO, restore, capacity, monitoring, runtime and cutover plans are
now documented. Execution blockers remain: the definitive project is on the
Free plan, backup/PITR and restore capability are not verified, production-like
load and alerts have not been exercised, production runtime credentials do not
exist, and no maintenance window is approved.

No production configuration or data was changed during this audit.

## Audited staging project

- Project: `RadarOH-rehearsal-2026-09-03`
- Ref: `jrjjwpletpfxthhobdlo`
- Region: `eu-central-1`
- Status: `ACTIVE_HEALTHY`
- PostgreSQL: `17.6`, GA channel
- Organization plan: Free
- Database size: 15 MB
- Free-plan database read-only threshold: 500 MB
- Connections observed: 5 of 60 maximum; 1 active
- RadarOH schema: 23 tables, 92 RLS policies, 3 dedicated roles

The current size is small, but the rehearsal did not replay representative
production traffic or model evidence/history growth. A point-in-time connection
sample is not a capacity forecast.

## Definitive Supabase project

- Project: `Radar-OH`
- Ref: `pimjbwqndcrpeswstbog`
- Region/status: `eu-central-1`, `ACTIVE_HEALTHY`
- PostgreSQL: `17.6`, GA channel
- Organization plan: Free
- Database size: 10.2 MB
- Connections observed: 6 of 60; 1 active
- RadarOH migrations/tables/policies/roles: 0

The project is empty and has not received schema or data. Security Advisor
reports two warnings because `public.rls_auto_enable()` is a `SECURITY DEFINER`
function executable by `anon` and `authenticated`. Resolve this before exposing
or migrating the definitive project:

- [Anonymous role can execute SECURITY DEFINER](https://supabase.com/docs/guides/database/database-linter?lint=0028_anon_security_definer_function_executable)
- [Authenticated role can execute SECURITY DEFINER](https://supabase.com/docs/guides/database/database-linter?lint=0029_authenticated_security_definer_function_executable)

## Automated regression coverage

The dedicated command
`pnpm --filter @workspace/api-server run test:supabase-rehearsal` passed five
test groups:

1. Frozen count baseline, UUID/legacy integrity, FK integrity, AI relations and
   evidence fingerprints.
2. Runtime RLS isolation, role boundaries and transactional constraints.
3. Session pooler advisory locks, worker lease shape, API health/readiness,
   authentication and write-freeze.
4. Canonical JSON export/import with all 8 plan items.
5. Source ID preservation across the complete check.

The harness is opt-in and requires explicit staging confirmation. It does not
run during routine API builds.

## Security and permissions

**Pass.**

- Supabase Security Advisor: zero findings.
- `anon` and `authenticated`: no direct RadarOH table privileges.
- `radar_backend`: `NOLOGIN`, `NOINHERIT`, `NOBYPASSRLS`.
- `radar_workspace_admin`: `NOLOGIN`, `NOINHERIT`, `NOBYPASSRLS`.
- Rehearsal runtime: login enabled, `NOINHERIT`, `NOBYPASSRLS`, member of
  `radar_backend`, not member of `radar_workspace_admin`.
- Correct workspace sees 38 sources; a false workspace sees zero.
- Cross-workspace FK writes are rejected.

The temporary rehearsal login must be removed when staging is decommissioned or
rotated before reuse.

## Connection strategy

**Technically validated; production configuration missing.**

- The direct Supabase host is IPv6-only from this Replit runtime.
- Shared Pooler Session mode on port 5432 provides IPv4 connectivity.
- Two-session contention proved that session-scoped advisory locks remain held
  and prevent concurrent worker ownership.
- Transaction mode is not acceptable for the durable worker because session
  advisory locks would not remain attached to one backend session.
- Production secrets `SUPABASE_PRODUCTION_DB_SESSION_URL` and
  `SUPABASE_PRODUCTION_DB_DIRECT_URL` are not configured. Staging secrets exist.

Official reference:
[Connect to your database](https://supabase.com/docs/guides/database/connecting-to-postgres).

## Backup, restore, RPO and RTO

**Objectives and drill documented; execution blocking.**

- The organization is currently on the Free plan.
- Active PITR was not observable or proven.
- No restore into an isolated project was executed.
- Proposed objectives are RPO ≤15 minutes and RTO ≤2 hours, with RPO 0 during
  the frozen pre-write cutover window.
- Backup retention and operator access for the definitive project are not
  confirmed.

Before cutover, use a production-appropriate plan and explicitly verify backup
retention, PITR availability, restore permissions and a timed restore drill.

Procedure: `docs/radar-supabase-rpo-rto-restore-plan.md`.

Official references:

- [Database Backups](https://supabase.com/docs/guides/platform/backups)
- [Manage Point-in-Time Recovery usage](https://supabase.com/docs/guides/platform/manage-your-usage/point-in-time-recovery)

## Capacity, monitoring and alerts

**Assessment and alerts documented; execution blocking.**

- Current database utilization is low, but expected source, evidence, change
  event, analysis and delivery growth has not been projected.
- The rehearsal observed only a new 15 MB database and does not establish
  sustained query latency or connection behavior.
- No verified alerts exist for connection saturation, database size, read-only
  mode, failed backups, prolonged jobs, worker leadership loss or API
  readiness.
- The 24-hour staging log window contained no ongoing application failure. One
  PostgREST connection was terminated by an administrator command during
  initial project setup; the other matched entry was migration SQL text, not a
  continuing runtime error.
- The active Replit source worker is repeatedly exhausting all three AI attempts
  because generated output references unknown evidence IDs. Validation correctly
  rejects unsupported findings, but the scheduler continues creating error
  analyses and consuming capacity. This is an operational blocker independent
  of the database migration.

Required before cutover:

1. Estimate 30/90/365-day row and storage growth.
2. Replay representative monitoring and AI traffic.
3. Define latency and connection thresholds.
4. Configure and verify alerts with test incidents.

Detailed scenarios, thresholds and runtime plan:
`docs/radar-supabase-capacity-monitoring-runtime-plan.md`.

## FK/index warning review

Supabase Performance Advisor reported 21 informational unindexed-FK warnings
and 10 unused indexes.

The 21 warnings are not 21 independent missing indexes. They include simple and
tenant-composite FKs on the same relationship. Existing PKs and indexes already
cover many application predicates by globally unique IDs or tenant/ID pairs.

### Staging benchmark decision

| Candidate | Representative result | Decision |
|---|---|---|
| `radar_sources (competitor_id)` | 200k rows: 28.262 ms seq → 0.060 ms index | keep in staging/schema |
| `radar_ai_alerts (competitor_id)` | 500k rows: 67.246 ms seq → 0.131 ms index | keep in staging/schema |
| `radar_monitor_evidence (run_id)` | 1M rows: existing index 0.042 ms; duplicate 0.041 ms | reject duplicate |

`radar_monitor_evidence(run_id, item_key)` already covers `run_id`. The
duplicate simulated ~9 MB per million rows without meaningful gain. No index
was applied to the definitive project.

### Already usefully covered or low priority

- Analysis/finding evidence association PKs begin with
  `(workspace_id, parent_id)`.
- Evidence reverse indexes cover `(workspace_id, evidence_id)`.
- Alert finding, delivery webhook, webhook integration and worker source
  relations have tenant-aware indexes.
- Findings by analysis/change event and change events/runs/evidence have useful
  single-ID or tenant-aware indexes for current queries.
- Empty integration/delivery tables provide no evidence for additional indexes.

The 10 unused-index warnings are expected on a newly created staging database
without representative traffic. No index should be removed from this signal
alone. Reassess `pg_stat_user_indexes` only after realistic worker, monitoring,
AI, alert and integration workloads.

Advisor reference:
[Unindexed foreign keys](https://supabase.com/docs/guides/database/database-linter?lint=0001_unindexed_foreign_keys).

## Rollback and cutover procedure

**Rollback mechanics pass; cutover authorization and timing remain blocking.**

The rehearsal proved an RPO-0 configuration rollback while writes remained
frozen: Replit was restored, readiness passed and no pre-existing source ID
disappeared.

Before a real cutover, approve and record:

- maintenance start/end and responsible operator;
- exact freeze verification and zero-running-work check;
- final snapshot manifest;
- Supabase migration and automated rehearsal command;
- API switch followed by worker switch, never both workers;
- rollback deadline before accepting Supabase writes;
- reverse-delta procedure if rollback is required after Supabase accepts writes;
- RPO/RTO and restore escalation path.

Detailed procedure:
`docs/radar-supabase-production-cutover-runbook.md`.

## Rehearsal against the definitive project

**Not executed under the read-only production boundary.**

The definitive project is empty. Repeating the rehearsal there would require
applying schema, copying a snapshot, creating a restricted runtime login and
temporarily supplying connection credentials. Those are production-affecting
actions and require explicit approval.

The safe next step is either:

1. a Supabase branch/restore isolated from the definitive project; or
2. a formally approved pre-production load into the definitive project while it
   remains disconnected from the active application.

Both options may have provider cost and require a separate approval.

## Completed readiness work

- Proposed RPO/RTO and timed restore-drill procedure.
- Current-dataset capacity formulas and 20/100/1,000-source scenarios.
- Required representative API/worker/AI load suite.
- Supabase/API/worker alert matrix and verification methods.
- Staging benchmark of all three index candidates; two retained, one rejected.
- Production runtime login and Session Pooler configuration plan.
- Detailed cutover gates, responsibilities, smoke tests and rollback procedure.
- Read-only audit of the definitive Supabase project.

## Remaining blockers

1. Upgrade/approve a production-capable Supabase plan.
2. Verify backup/PITR and complete the timed restore drill.
3. Accept the proposed RPO ≤15 min / RTO ≤2 h.
4. Run the documented representative load scenarios.
5. Configure and exercise database, API and worker alerts.
6. Resolve the two `rls_auto_enable()` security warnings.
7. Production Session pooler secret and restricted runtime login, created only
   when cutover preparation is explicitly authorized.
8. Approved maintenance window and named cutover/rollback operators.
9. Final frozen snapshot and automated rehearsal against the definitive
   Supabase project.
10. Stabilize or explicitly pause the repeatedly failing scheduled AI analysis
    job, then verify a successful analysis and its alert.

Until all ten are closed, the production recommendation remains **NO-GO**.