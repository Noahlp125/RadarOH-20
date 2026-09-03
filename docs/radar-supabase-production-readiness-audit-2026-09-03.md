# RadarOH Supabase production-readiness audit — 2026-09-03

## Decision

**NO-GO for production cutover.**

The migration mechanics, runtime compatibility, isolation and rollback are
validated. The remaining blockers are operational rather than data-integrity
failures: the candidate staging project is on the Free plan, production
backup/PITR and restore capability are not verified, production capacity and
alerts are not configured, production Supabase connection secrets do not exist,
no maintenance window is approved, and RPO/RTO have not been accepted.

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

**Blocking.**

- The organization is currently on the Free plan.
- Active PITR was not observable or proven.
- No restore into an isolated project was executed.
- Acceptable RPO and RTO are not defined.
- Backup retention and operator access for the definitive project are not
  confirmed.

Before cutover, use a production-appropriate plan and explicitly verify backup
retention, PITR availability, restore permissions and a timed restore drill.

Official references:

- [Database Backups](https://supabase.com/docs/guides/platform/backups)
- [Manage Point-in-Time Recovery usage](https://supabase.com/docs/guides/platform/manage-your-usage/point-in-time-recovery)

## Capacity, monitoring and alerts

**Blocking pending production-like evidence.**

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

Required before cutover:

1. Estimate 30/90/365-day row and storage growth.
2. Replay representative monitoring and AI traffic.
3. Define latency and connection thresholds.
4. Configure and verify alerts with test incidents.

## FK/index warning review

Supabase Performance Advisor reported 21 informational unindexed-FK warnings
and 10 unused indexes.

The 21 warnings are not 21 independent missing indexes. They include simple and
tenant-composite FKs on the same relationship. Existing PKs and indexes already
cover many application predicates by globally unique IDs or tenant/ID pairs.

### Recommended for the next staging migration

These three indexes have direct value in current code paths and parent-FK
checks:

| Candidate | Reason |
|---|---|
| `radar_sources (competitor_id)` | Competitor cleanup and `ON DELETE SET NULL` lookup |
| `radar_ai_alerts (competitor_id)` | Competitor alert cleanup and `ON DELETE SET NULL` lookup |
| `radar_monitor_evidence (run_id)` | Run/evidence integrity and future run-detail/history lookup |

Apply and benchmark them in staging, then rerun the Advisor. Do not apply DDL
directly to production.

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

## Remaining blockers

1. Production-grade backup/PITR and a successful timed restore drill.
2. Accepted RPO/RTO.
3. Production capacity forecast and representative load test.
4. Database, worker and API alerts configured and exercised.
5. Review/apply/benchmark the three recommended FK indexes in staging.
6. Production Session pooler secret and restricted runtime login, created only
   when cutover preparation is explicitly authorized.
7. Approved maintenance window and named cutover/rollback operators.
8. Final frozen snapshot and automated rehearsal against the definitive
   Supabase project.

Until all eight are closed, the production recommendation remains **NO-GO**.