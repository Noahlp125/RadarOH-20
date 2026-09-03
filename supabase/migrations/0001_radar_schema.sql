-- RadarOH / Supabase schema
--
-- This migration is intentionally schema-only. It does not copy, update,
-- delete, or truncate application data. The Replit -> Supabase data transfer
-- is performed by the separately reviewed migration runner.
--
-- The public API keeps the radar_ prefix so the existing API/repository
-- boundary can be adapted without exposing internal table names to the UI.

create extension if not exists pgcrypto;

create table if not exists public.radar_workspaces (
  id uuid primary key default gen_random_uuid(),
  legacy_key text not null unique,
  name text not null,
  created_at timestamptz not null default now()
);

create table if not exists public.radar_workspace_members (
  workspace_id uuid not null references public.radar_workspaces(id) on delete cascade,
  subject text not null,
  role text not null default 'member'
    check (role in ('owner', 'admin', 'member', 'viewer')),
  created_at timestamptz not null default now(),
  primary key (workspace_id, subject)
);

create table if not exists public.radar_competitors (
  id uuid primary key default gen_random_uuid(),
  workspace_id uuid not null references public.radar_workspaces(id) on delete cascade,
  legacy_id text not null,
  nombre text not null,
  ubicacion text not null default '',
  especialidad text not null default '',
  rango_precio text not null default '',
  web text not null default '',
  redes text not null default '',
  fortalezas text not null default '',
  debilidades text not null default '',
  notas text not null default '',
  prioridad text not null check (prioridad in ('alta', 'media', 'baja')),
  estado text not null check (estado in ('pendiente', 'revisado')),
  raw_record jsonb not null default '{}'::jsonb,
  created_at timestamptz not null default now(),
  updated_at timestamptz not null default now(),
  unique (workspace_id, legacy_id),
  unique (workspace_id, id)
);

create table if not exists public.radar_keywords (
  id uuid primary key default gen_random_uuid(),
  workspace_id uuid not null references public.radar_workspaces(id) on delete cascade,
  legacy_id text not null,
  termino text not null,
  volumen text not null check (volumen in ('Alto', 'Medio', 'Bajo')),
  posicion text not null default '',
  notas text not null default '',
  raw_record jsonb not null default '{}'::jsonb,
  created_at timestamptz not null default now(),
  updated_at timestamptz not null default now(),
  unique (workspace_id, legacy_id),
  unique (workspace_id, id)
);

create table if not exists public.radar_sources (
  id uuid primary key default gen_random_uuid(),
  workspace_id uuid not null references public.radar_workspaces(id) on delete cascade,
  legacy_id text not null,
  termino text not null,
  tipo text not null,
  frecuencia text not null,
  notas text not null default '',
  connector text not null default 'manual'
    check (connector in ('manual', 'rss', 'json_api', 'web')),
  endpoint_url text not null default '',
  enabled boolean not null default false,
  competitor_id uuid null,
  -- Transitional API compatibility. The normalized runtime row below is
  -- authoritative after cutover; these columns remain until the backend-only
  -- migration has been proven and the legacy API contract can be retired.
  last_run_at timestamptz null,
  next_run_at timestamptz null,
  last_status text not null default 'idle',
  last_error text not null default '',
  consecutive_failures integer not null default 0 check (consecutive_failures >= 0),
  last_changed_at timestamptz null,
  raw_record jsonb not null default '{}'::jsonb,
  created_at timestamptz not null default now(),
  updated_at timestamptz not null default now(),
  unique (workspace_id, legacy_id),
  unique (workspace_id, id),
  foreign key (competitor_id)
    references public.radar_competitors(id)
    on delete set null
);

create table if not exists public.radar_source_runtime (
  workspace_id uuid not null references public.radar_workspaces(id) on delete cascade,
  source_id uuid primary key,
  last_run_at timestamptz null,
  next_run_at timestamptz null,
  last_status text not null default 'idle',
  last_error text not null default '',
  consecutive_failures integer not null default 0 check (consecutive_failures >= 0),
  last_changed_at timestamptz null,
  updated_at timestamptz not null default now(),
  unique (workspace_id, source_id),
  foreign key (workspace_id, source_id)
    references public.radar_sources(workspace_id, id)
    on delete cascade
);

create table if not exists public.radar_plan_items (
  id uuid primary key default gen_random_uuid(),
  workspace_id uuid not null references public.radar_workspaces(id) on delete cascade,
  legacy_id text not null,
  horizon smallint not null check (horizon in (30, 60, 90)),
  text text not null,
  done boolean not null default false,
  raw_record jsonb not null default '{}'::jsonb,
  created_at timestamptz not null default now(),
  updated_at timestamptz not null default now(),
  unique (workspace_id, legacy_id),
  unique (workspace_id, id)
);

create table if not exists public.radar_imports (
  id uuid primary key default gen_random_uuid(),
  workspace_id uuid not null references public.radar_workspaces(id) on delete cascade,
  legacy_id text null,
  source_filename text null,
  source_exported_at timestamptz null,
  source_checksum text not null,
  raw_payload jsonb not null,
  record_counts jsonb not null default '{}'::jsonb,
  validation_issues jsonb not null default '[]'::jsonb,
  created_at timestamptz not null default now()
);

create table if not exists public.radar_monitor_runs (
  id uuid primary key default gen_random_uuid(),
  workspace_id uuid not null references public.radar_workspaces(id) on delete cascade,
  legacy_id text null,
  source_id uuid not null references public.radar_sources(id) on delete restrict,
  trigger text not null,
  status text not null,
  started_at timestamptz not null default now(),
  finished_at timestamptz null,
  attempts integer not null default 0 check (attempts >= 0),
  item_count integer not null default 0 check (item_count >= 0),
  change_count integer not null default 0 check (change_count >= 0),
  http_status integer null,
  error_message text not null default '',
  duration_ms integer null check (duration_ms is null or duration_ms >= 0),
  unique (workspace_id, id)
);

create table if not exists public.radar_monitor_evidence (
  id uuid primary key default gen_random_uuid(),
  workspace_id uuid not null references public.radar_workspaces(id) on delete cascade,
  legacy_id text null,
  source_id uuid not null references public.radar_sources(id) on delete restrict,
  run_id uuid not null references public.radar_monitor_runs(id) on delete restrict,
  item_key text not null,
  fingerprint text not null,
  title text not null default '',
  url text not null default '',
  published_at timestamptz null,
  normalized_text text not null default '',
  raw_payload jsonb not null default '{}'::jsonb,
  observed_at timestamptz not null default now(),
  unique (run_id, item_key),
  unique (workspace_id, id)
);

create table if not exists public.radar_change_events (
  id uuid primary key default gen_random_uuid(),
  workspace_id uuid not null references public.radar_workspaces(id) on delete cascade,
  legacy_id text null,
  source_id uuid not null references public.radar_sources(id) on delete restrict,
  run_id uuid not null references public.radar_monitor_runs(id) on delete restrict,
  evidence_id uuid not null references public.radar_monitor_evidence(id) on delete restrict,
  competitor_id uuid null,
  change_type text not null,
  title text not null default '',
  summary text not null default '',
  url text not null default '',
  previous_fingerprint text null,
  fingerprint text not null,
  occurred_at timestamptz not null default now(),
  unique (workspace_id, id),
  foreign key (competitor_id)
    references public.radar_competitors(id)
    on delete set null
);

create table if not exists public.radar_ai_analyses (
  id uuid primary key default gen_random_uuid(),
  workspace_id uuid not null references public.radar_workspaces(id) on delete cascade,
  legacy_id text null,
  trigger text not null,
  model text not null,
  status text not null,
  source_evidence_count integer not null default 0 check (source_evidence_count >= 0),
  event_count integer not null default 0 check (event_count >= 0),
  summary text not null default '',
  evidence_ids jsonb not null default '[]'::jsonb
    check (jsonb_typeof(evidence_ids) = 'array'),
  trends jsonb not null default '[]'::jsonb,
  attempt_count integer not null default 0 check (attempt_count >= 0),
  attempt_errors jsonb not null default '[]'::jsonb,
  error_message text not null default '',
  started_at timestamptz not null default now(),
  completed_at timestamptz null,
  unique (workspace_id, id)
);

create table if not exists public.radar_ai_analysis_evidence (
  workspace_id uuid not null references public.radar_workspaces(id) on delete cascade,
  analysis_id uuid not null references public.radar_ai_analyses(id) on delete cascade,
  evidence_id uuid not null references public.radar_monitor_evidence(id) on delete restrict,
  primary key (workspace_id, analysis_id, evidence_id)
);

create table if not exists public.radar_ai_findings (
  id uuid primary key default gen_random_uuid(),
  workspace_id uuid not null references public.radar_workspaces(id) on delete cascade,
  legacy_id text null,
  analysis_id uuid not null references public.radar_ai_analyses(id) on delete restrict,
  change_event_id uuid null references public.radar_change_events(id) on delete set null,
  event_type text not null,
  importance text not null check (importance in ('low', 'medium', 'high', 'critical')),
  relevance integer not null check (relevance between 0 and 100),
  confidence integer not null check (confidence between 0 and 100),
  title text not null,
  summary text not null,
  rationale text not null,
  opportunity text not null default '',
  risk text not null default '',
  trend text not null default '',
  suggested_updates jsonb not null default '[]'::jsonb,
  evidence_ids jsonb not null default '[]'::jsonb
    check (jsonb_typeof(evidence_ids) = 'array'),
  created_at timestamptz not null default now(),
  unique (workspace_id, id)
);

create table if not exists public.radar_ai_finding_evidence (
  workspace_id uuid not null references public.radar_workspaces(id) on delete cascade,
  finding_id uuid not null references public.radar_ai_findings(id) on delete cascade,
  evidence_id uuid not null references public.radar_monitor_evidence(id) on delete restrict,
  primary key (workspace_id, finding_id, evidence_id)
);

create table if not exists public.radar_ai_alerts (
  id uuid primary key default gen_random_uuid(),
  workspace_id uuid not null references public.radar_workspaces(id) on delete cascade,
  legacy_id text null,
  finding_id uuid not null references public.radar_ai_findings(id) on delete restrict,
  competitor_id uuid null,
  title text not null,
  description text not null,
  importance text not null check (importance in ('low', 'medium', 'high', 'critical')),
  dedupe_key text null,
  status text not null default 'unread',
  created_at timestamptz not null default now(),
  read_at timestamptz null,
  unique (workspace_id, id),
  foreign key (competitor_id)
    references public.radar_competitors(id)
    on delete set null
);

create table if not exists public.radar_activity_log (
  id uuid primary key default gen_random_uuid(),
  workspace_id uuid not null references public.radar_workspaces(id) on delete cascade,
  legacy_id text null,
  action text not null,
  entity_type text not null,
  entity_id text null,
  metadata jsonb not null default '{}'::jsonb,
  created_at timestamptz not null default now()
);

create table if not exists public.radar_alert_preferences (
  workspace_id uuid primary key references public.radar_workspaces(id) on delete cascade,
  enabled boolean not null default true,
  minimum_importance text not null default 'high'
    check (minimum_importance in ('low', 'medium', 'high', 'critical')),
  minimum_relevance integer not null default 70 check (minimum_relevance between 0 and 100),
  minimum_confidence integer not null default 60 check (minimum_confidence between 0 and 100),
  internal_enabled boolean not null default true,
  channels text[] not null default array['internal']::text[],
  updated_at timestamptz not null default now()
);

create table if not exists public.radar_integrations (
  id uuid primary key default gen_random_uuid(),
  workspace_id uuid not null references public.radar_workspaces(id) on delete cascade,
  legacy_id text null,
  name text not null,
  provider text not null,
  category text not null,
  status text not null default 'pending_authorization',
  documentation_url text not null default '',
  authorized boolean not null default false,
  scopes text[] not null default array[]::text[],
  last_checked_at timestamptz null,
  last_error text not null default '',
  created_by_subject text not null default 'system',
  created_at timestamptz not null default now(),
  updated_at timestamptz not null default now(),
  unique (workspace_id, id)
);

create table if not exists public.radar_webhook_subscriptions (
  id uuid primary key default gen_random_uuid(),
  workspace_id uuid not null references public.radar_workspaces(id) on delete cascade,
  legacy_id text null,
  integration_id uuid not null references public.radar_integrations(id) on delete restrict,
  name text not null,
  endpoint_url text not null,
  event_types text[] not null default array[]::text[],
  status text not null default 'paused',
  authorized boolean not null default false,
  max_attempts integer not null default 5 check (max_attempts > 0),
  consecutive_failures integer not null default 0 check (consecutive_failures >= 0),
  last_delivery_at timestamptz null,
  last_error text not null default '',
  created_at timestamptz not null default now(),
  updated_at timestamptz not null default now(),
  unique (workspace_id, id)
);

create table if not exists public.radar_integration_deliveries (
  id uuid primary key default gen_random_uuid(),
  workspace_id uuid not null references public.radar_workspaces(id) on delete cascade,
  legacy_id text null,
  webhook_id uuid not null references public.radar_webhook_subscriptions(id) on delete restrict,
  event_type text not null,
  payload jsonb not null,
  status text not null default 'pending',
  attempts integer not null default 0 check (attempts >= 0),
  next_attempt_at timestamptz null,
  last_error text not null default '',
  delivered_at timestamptz null,
  created_at timestamptz not null default now(),
  unique (workspace_id, id)
);

create table if not exists public.radar_worker_jobs (
  id uuid primary key default gen_random_uuid(),
  workspace_id uuid not null references public.radar_workspaces(id) on delete cascade,
  legacy_id text null,
  job_key text not null,
  kind text not null,
  source_id uuid null references public.radar_sources(id) on delete set null,
  status text not null default 'queued',
  available_at timestamptz not null default now(),
  attempts integer not null default 0 check (attempts >= 0),
  locked_at timestamptz null,
  locked_by text null,
  started_at timestamptz null,
  finished_at timestamptz null,
  error_message text not null default '',
  payload jsonb not null default '{}'::jsonb,
  created_at timestamptz not null default now(),
  updated_at timestamptz not null default now(),
  unique (workspace_id, job_key),
  unique (workspace_id, id)
);

create table if not exists public.radar_worker_leases (
  id uuid primary key default gen_random_uuid(),
  workspace_id uuid not null references public.radar_workspaces(id) on delete cascade,
  legacy_id text null,
  owner_id text not null,
  acquired_at timestamptz not null default now(),
  heartbeat_at timestamptz not null default now(),
  expires_at timestamptz not null,
  updated_at timestamptz not null default now(),
  unique (workspace_id),
  unique (workspace_id, id)
);

-- Composite tenant foreign keys prevent a valid UUID from another workspace
-- being attached to a row in the current workspace.
alter table public.radar_sources
  add constraint radar_sources_workspace_competitor_fk
  foreign key (workspace_id, competitor_id)
  references public.radar_competitors(workspace_id, id)
  on delete set null (competitor_id);
alter table public.radar_monitor_runs
  add constraint radar_monitor_runs_workspace_source_fk
  foreign key (workspace_id, source_id)
  references public.radar_sources(workspace_id, id)
  on delete restrict;
alter table public.radar_monitor_evidence
  add constraint radar_monitor_evidence_workspace_source_fk
  foreign key (workspace_id, source_id)
  references public.radar_sources(workspace_id, id)
  on delete restrict;
alter table public.radar_monitor_evidence
  add constraint radar_monitor_evidence_workspace_run_fk
  foreign key (workspace_id, run_id)
  references public.radar_monitor_runs(workspace_id, id)
  on delete restrict;
alter table public.radar_change_events
  add constraint radar_change_events_workspace_source_fk
  foreign key (workspace_id, source_id)
  references public.radar_sources(workspace_id, id)
  on delete restrict;
alter table public.radar_change_events
  add constraint radar_change_events_workspace_run_fk
  foreign key (workspace_id, run_id)
  references public.radar_monitor_runs(workspace_id, id)
  on delete restrict;
alter table public.radar_change_events
  add constraint radar_change_events_workspace_evidence_fk
  foreign key (workspace_id, evidence_id)
  references public.radar_monitor_evidence(workspace_id, id)
  on delete restrict;
alter table public.radar_change_events
  add constraint radar_change_events_workspace_competitor_fk
  foreign key (workspace_id, competitor_id)
  references public.radar_competitors(workspace_id, id)
  on delete set null (competitor_id);
alter table public.radar_ai_analysis_evidence
  add constraint radar_ai_analysis_evidence_workspace_analysis_fk
  foreign key (workspace_id, analysis_id)
  references public.radar_ai_analyses(workspace_id, id)
  on delete cascade;
alter table public.radar_ai_analysis_evidence
  add constraint radar_ai_analysis_evidence_workspace_evidence_fk
  foreign key (workspace_id, evidence_id)
  references public.radar_monitor_evidence(workspace_id, id)
  on delete restrict;
alter table public.radar_ai_findings
  add constraint radar_ai_findings_workspace_analysis_fk
  foreign key (workspace_id, analysis_id)
  references public.radar_ai_analyses(workspace_id, id)
  on delete restrict;
alter table public.radar_ai_findings
  add constraint radar_ai_findings_workspace_change_event_fk
  foreign key (workspace_id, change_event_id)
  references public.radar_change_events(workspace_id, id)
  on delete set null (change_event_id);
alter table public.radar_ai_finding_evidence
  add constraint radar_ai_finding_evidence_workspace_finding_fk
  foreign key (workspace_id, finding_id)
  references public.radar_ai_findings(workspace_id, id)
  on delete cascade;
alter table public.radar_ai_finding_evidence
  add constraint radar_ai_finding_evidence_workspace_evidence_fk
  foreign key (workspace_id, evidence_id)
  references public.radar_monitor_evidence(workspace_id, id)
  on delete restrict;
alter table public.radar_ai_alerts
  add constraint radar_ai_alerts_workspace_finding_fk
  foreign key (workspace_id, finding_id)
  references public.radar_ai_findings(workspace_id, id)
  on delete restrict;
alter table public.radar_ai_alerts
  add constraint radar_ai_alerts_workspace_competitor_fk
  foreign key (workspace_id, competitor_id)
  references public.radar_competitors(workspace_id, id)
  on delete set null (competitor_id);
alter table public.radar_webhook_subscriptions
  add constraint radar_webhooks_workspace_integration_fk
  foreign key (workspace_id, integration_id)
  references public.radar_integrations(workspace_id, id)
  on delete restrict;
alter table public.radar_integration_deliveries
  add constraint radar_deliveries_workspace_webhook_fk
  foreign key (workspace_id, webhook_id)
  references public.radar_webhook_subscriptions(workspace_id, id)
  on delete restrict;
alter table public.radar_worker_jobs
  add constraint radar_worker_jobs_workspace_source_fk
  foreign key (workspace_id, source_id)
  references public.radar_sources(workspace_id, id)
  on delete set null (source_id);

-- Transactional compatibility adapters. The API can keep its existing JSON
-- shape while normalized runtime/evidence relations remain authoritative and
-- tenant-constrained.
create or replace function public.radar_sync_source_runtime()
returns trigger
language plpgsql
set search_path = ''
as $$
begin
  insert into public.radar_source_runtime (
    workspace_id,
    source_id,
    last_run_at,
    next_run_at,
    last_status,
    last_error,
    consecutive_failures,
    last_changed_at,
    updated_at
  ) values (
    new.workspace_id,
    new.id,
    new.last_run_at,
    new.next_run_at,
    new.last_status,
    new.last_error,
    new.consecutive_failures,
    new.last_changed_at,
    new.updated_at
  )
  on conflict (source_id) do update set
    workspace_id = excluded.workspace_id,
    last_run_at = excluded.last_run_at,
    next_run_at = excluded.next_run_at,
    last_status = excluded.last_status,
    last_error = excluded.last_error,
    consecutive_failures = excluded.consecutive_failures,
    last_changed_at = excluded.last_changed_at,
    updated_at = excluded.updated_at;
  return new;
end;
$$;

create trigger radar_sources_sync_runtime
after insert or update of
  workspace_id,
  last_run_at,
  next_run_at,
  last_status,
  last_error,
  consecutive_failures,
  last_changed_at,
  updated_at
on public.radar_sources
for each row execute function public.radar_sync_source_runtime();

create or replace function public.radar_sync_analysis_evidence()
returns trigger
language plpgsql
set search_path = ''
as $$
begin
  delete from public.radar_ai_analysis_evidence
  where workspace_id = new.workspace_id and analysis_id = new.id;
  insert into public.radar_ai_analysis_evidence (
    workspace_id,
    analysis_id,
    evidence_id
  )
  select
    new.workspace_id,
    new.id,
    evidence.value::uuid
  from jsonb_array_elements_text(new.evidence_ids) as evidence(value)
  on conflict do nothing;
  return new;
end;
$$;

create trigger radar_ai_analyses_sync_evidence
after insert or update of workspace_id, evidence_ids
on public.radar_ai_analyses
for each row execute function public.radar_sync_analysis_evidence();

create or replace function public.radar_sync_finding_evidence()
returns trigger
language plpgsql
set search_path = ''
as $$
begin
  delete from public.radar_ai_finding_evidence
  where workspace_id = new.workspace_id and finding_id = new.id;
  insert into public.radar_ai_finding_evidence (
    workspace_id,
    finding_id,
    evidence_id
  )
  select
    new.workspace_id,
    new.id,
    evidence.value::uuid
  from jsonb_array_elements_text(new.evidence_ids) as evidence(value)
  on conflict do nothing;
  return new;
end;
$$;

create trigger radar_ai_findings_sync_evidence
after insert or update of workspace_id, evidence_ids
on public.radar_ai_findings
for each row execute function public.radar_sync_finding_evidence();

create unique index if not exists radar_ai_alerts_workspace_dedupe_idx
  on public.radar_ai_alerts(workspace_id, dedupe_key)
  where dedupe_key is not null;

create index if not exists radar_activity_log_workspace_created_idx
  on public.radar_activity_log(workspace_id, created_at);
create index if not exists radar_competitors_workspace_idx
  on public.radar_competitors(workspace_id);
create index if not exists radar_keywords_workspace_idx
  on public.radar_keywords(workspace_id);
create index if not exists radar_sources_workspace_idx
  on public.radar_sources(workspace_id);
create index if not exists radar_sources_competitor_idx
  on public.radar_sources(competitor_id);
create index if not exists radar_plan_items_workspace_horizon_idx
  on public.radar_plan_items(workspace_id, horizon);
create index if not exists radar_imports_workspace_created_idx
  on public.radar_imports(workspace_id, created_at);
create index if not exists radar_monitor_runs_workspace_started_idx
  on public.radar_monitor_runs(workspace_id, started_at);
create index if not exists radar_monitor_runs_source_started_idx
  on public.radar_monitor_runs(source_id, started_at);
create index if not exists radar_monitor_evidence_source_observed_idx
  on public.radar_monitor_evidence(source_id, observed_at);
create index if not exists radar_change_events_workspace_occurred_idx
  on public.radar_change_events(workspace_id, occurred_at);
create index if not exists radar_change_events_competitor_occurred_idx
  on public.radar_change_events(competitor_id, occurred_at);
create index if not exists radar_change_events_source_occurred_idx
  on public.radar_change_events(source_id, occurred_at);
create index if not exists radar_ai_analyses_workspace_started_idx
  on public.radar_ai_analyses(workspace_id, started_at);
create index if not exists radar_ai_findings_analysis_idx
  on public.radar_ai_findings(analysis_id);
create index if not exists radar_ai_findings_change_event_idx
  on public.radar_ai_findings(change_event_id);
create index if not exists radar_ai_findings_workspace_created_idx
  on public.radar_ai_findings(workspace_id, created_at);
create index if not exists radar_ai_alerts_workspace_status_idx
  on public.radar_ai_alerts(workspace_id, status, created_at);
create index if not exists radar_ai_alerts_competitor_idx
  on public.radar_ai_alerts(competitor_id);
create index if not exists radar_integrations_workspace_status_idx
  on public.radar_integrations(workspace_id, status);
create index if not exists radar_webhooks_workspace_status_idx
  on public.radar_webhook_subscriptions(workspace_id, status);
create index if not exists radar_deliveries_workspace_status_idx
  on public.radar_integration_deliveries(workspace_id, status, created_at);
create index if not exists radar_worker_jobs_claim_idx
  on public.radar_worker_jobs(workspace_id, status, available_at);
create index if not exists radar_change_events_run_idx
  on public.radar_change_events(workspace_id, run_id);
create index if not exists radar_change_events_evidence_idx
  on public.radar_change_events(workspace_id, evidence_id);
create index if not exists radar_ai_analysis_evidence_evidence_idx
  on public.radar_ai_analysis_evidence(workspace_id, evidence_id);
create index if not exists radar_ai_finding_evidence_evidence_idx
  on public.radar_ai_finding_evidence(workspace_id, evidence_id);
create index if not exists radar_ai_alerts_finding_idx
  on public.radar_ai_alerts(workspace_id, finding_id);
create index if not exists radar_webhooks_integration_idx
  on public.radar_webhook_subscriptions(workspace_id, integration_id);
create index if not exists radar_deliveries_webhook_idx
  on public.radar_integration_deliveries(workspace_id, webhook_id);
create index if not exists radar_worker_jobs_source_idx
  on public.radar_worker_jobs(workspace_id, source_id);
create index if not exists radar_source_runtime_workspace_idx
  on public.radar_source_runtime(workspace_id);

create unique index if not exists radar_imports_workspace_legacy_idx
  on public.radar_imports(workspace_id, legacy_id) where legacy_id is not null;
create unique index if not exists radar_monitor_runs_workspace_legacy_idx
  on public.radar_monitor_runs(workspace_id, legacy_id) where legacy_id is not null;
create unique index if not exists radar_monitor_evidence_workspace_legacy_idx
  on public.radar_monitor_evidence(workspace_id, legacy_id) where legacy_id is not null;
create unique index if not exists radar_change_events_workspace_legacy_idx
  on public.radar_change_events(workspace_id, legacy_id) where legacy_id is not null;
create unique index if not exists radar_ai_analyses_workspace_legacy_idx
  on public.radar_ai_analyses(workspace_id, legacy_id) where legacy_id is not null;
create unique index if not exists radar_ai_findings_workspace_legacy_idx
  on public.radar_ai_findings(workspace_id, legacy_id) where legacy_id is not null;
create unique index if not exists radar_ai_alerts_workspace_legacy_idx
  on public.radar_ai_alerts(workspace_id, legacy_id) where legacy_id is not null;
create unique index if not exists radar_activity_log_workspace_legacy_idx
  on public.radar_activity_log(workspace_id, legacy_id) where legacy_id is not null;
create unique index if not exists radar_integrations_workspace_legacy_idx
  on public.radar_integrations(workspace_id, legacy_id) where legacy_id is not null;
create unique index if not exists radar_webhooks_workspace_legacy_idx
  on public.radar_webhook_subscriptions(workspace_id, legacy_id) where legacy_id is not null;
create unique index if not exists radar_deliveries_workspace_legacy_idx
  on public.radar_integration_deliveries(workspace_id, legacy_id) where legacy_id is not null;
create unique index if not exists radar_worker_jobs_workspace_legacy_idx
  on public.radar_worker_jobs(workspace_id, legacy_id) where legacy_id is not null;
create unique index if not exists radar_worker_leases_workspace_legacy_idx
  on public.radar_worker_leases(workspace_id, legacy_id) where legacy_id is not null;

-- Clerk remains the authentication system. Browser roles receive no RadarOH
-- table privileges. The Express API is the trusted boundary and must SET LOCAL
-- app.workspace_id before reducing privileges to radar_backend.
do $$
begin
  if not exists (select 1 from pg_roles where rolname = 'radar_backend') then
    create role radar_backend
      nologin nosuperuser nocreatedb nocreaterole noinherit nobypassrls;
  end if;
  if not exists (select 1 from pg_roles where rolname = 'radar_workspace_admin') then
    create role radar_workspace_admin
      nologin nosuperuser nocreatedb nocreaterole noinherit nobypassrls;
  end if;
end
$$;

grant radar_backend to current_user;
-- Deliberately do not grant radar_workspace_admin to the migration owner or
-- application login. A separate, controlled admin identity may receive it in
-- an independently reviewed operational change.
revoke create on schema public from public;
revoke all on schema public from anon, authenticated;
grant usage on schema public to radar_backend, radar_workspace_admin;

create or replace function public.radar_current_workspace()
returns uuid
language sql
stable
set search_path = ''
as $$
  select nullif(current_setting('app.workspace_id', true), '')::uuid;
$$;

revoke all on function public.radar_current_workspace()
  from public, anon, authenticated;
revoke all on function public.radar_sync_source_runtime()
  from public, anon, authenticated;
revoke all on function public.radar_sync_analysis_evidence()
  from public, anon, authenticated;
revoke all on function public.radar_sync_finding_evidence()
  from public, anon, authenticated;
grant execute on function public.radar_current_workspace()
  to radar_backend, radar_workspace_admin;

alter table public.radar_workspaces enable row level security;
alter table public.radar_workspace_members enable row level security;
alter table public.radar_competitors enable row level security;
alter table public.radar_keywords enable row level security;
alter table public.radar_sources enable row level security;
alter table public.radar_source_runtime enable row level security;
alter table public.radar_plan_items enable row level security;
alter table public.radar_imports enable row level security;
alter table public.radar_monitor_runs enable row level security;
alter table public.radar_monitor_evidence enable row level security;
alter table public.radar_change_events enable row level security;
alter table public.radar_ai_analyses enable row level security;
alter table public.radar_ai_analysis_evidence enable row level security;
alter table public.radar_ai_findings enable row level security;
alter table public.radar_ai_finding_evidence enable row level security;
alter table public.radar_ai_alerts enable row level security;
alter table public.radar_activity_log enable row level security;
alter table public.radar_alert_preferences enable row level security;
alter table public.radar_integrations enable row level security;
alter table public.radar_webhook_subscriptions enable row level security;
alter table public.radar_integration_deliveries enable row level security;
alter table public.radar_worker_jobs enable row level security;
alter table public.radar_worker_leases enable row level security;

do $$
declare
  table_name text;
begin
  foreach table_name in array array[
    'radar_workspaces',
    'radar_workspace_members',
    'radar_competitors',
    'radar_keywords',
    'radar_sources',
    'radar_source_runtime',
    'radar_plan_items',
    'radar_imports',
    'radar_monitor_runs',
    'radar_monitor_evidence',
    'radar_change_events',
    'radar_ai_analyses',
    'radar_ai_analysis_evidence',
    'radar_ai_findings',
    'radar_ai_finding_evidence',
    'radar_ai_alerts',
    'radar_activity_log',
    'radar_alert_preferences',
    'radar_integrations',
    'radar_webhook_subscriptions',
    'radar_integration_deliveries',
    'radar_worker_jobs',
    'radar_worker_leases'
  ]
  loop
    execute format(
      'revoke all on table public.%I from public, anon, authenticated',
      table_name
    );
  end loop;
end
$$;

grant select on public.radar_workspace_members to radar_backend;
grant select, insert, update, delete on public.radar_workspace_members
  to radar_workspace_admin;
grant select on public.radar_workspaces to radar_backend, radar_workspace_admin;
grant update on public.radar_workspaces to radar_workspace_admin;

grant select, insert, update, delete on
  public.radar_competitors,
  public.radar_keywords,
  public.radar_sources,
  public.radar_source_runtime,
  public.radar_plan_items,
  public.radar_imports,
  public.radar_monitor_runs,
  public.radar_monitor_evidence,
  public.radar_change_events,
  public.radar_ai_analyses,
  public.radar_ai_analysis_evidence,
  public.radar_ai_findings,
  public.radar_ai_finding_evidence,
  public.radar_ai_alerts,
  public.radar_activity_log,
  public.radar_alert_preferences,
  public.radar_integrations,
  public.radar_webhook_subscriptions,
  public.radar_integration_deliveries,
  public.radar_worker_jobs,
  public.radar_worker_leases
to radar_backend;

create policy radar_workspaces_backend_select
  on public.radar_workspaces for select to radar_backend
  using (id = public.radar_current_workspace());
create policy radar_workspaces_admin_select
  on public.radar_workspaces for select to radar_workspace_admin
  using (id = public.radar_current_workspace());
create policy radar_workspaces_admin_update
  on public.radar_workspaces for update to radar_workspace_admin
  using (id = public.radar_current_workspace())
  with check (id = public.radar_current_workspace());

create policy radar_members_backend_select
  on public.radar_workspace_members for select to radar_backend
  using (workspace_id = public.radar_current_workspace());
create policy radar_members_admin_select
  on public.radar_workspace_members for select to radar_workspace_admin
  using (workspace_id = public.radar_current_workspace());
create policy radar_members_admin_insert
  on public.radar_workspace_members for insert to radar_workspace_admin
  with check (workspace_id = public.radar_current_workspace());
create policy radar_members_admin_update
  on public.radar_workspace_members for update to radar_workspace_admin
  using (workspace_id = public.radar_current_workspace())
  with check (workspace_id = public.radar_current_workspace());
create policy radar_members_admin_delete
  on public.radar_workspace_members for delete to radar_workspace_admin
  using (workspace_id = public.radar_current_workspace());

do $$
declare
  table_name text;
begin
  foreach table_name in array array[
    'radar_competitors',
    'radar_keywords',
    'radar_sources',
    'radar_source_runtime',
    'radar_plan_items',
    'radar_imports',
    'radar_monitor_runs',
    'radar_monitor_evidence',
    'radar_change_events',
    'radar_ai_analyses',
    'radar_ai_analysis_evidence',
    'radar_ai_findings',
    'radar_ai_finding_evidence',
    'radar_ai_alerts',
    'radar_activity_log',
    'radar_alert_preferences',
    'radar_integrations',
    'radar_webhook_subscriptions',
    'radar_integration_deliveries',
    'radar_worker_jobs',
    'radar_worker_leases'
  ]
  loop
    execute format(
      'create policy %I on public.%I for select to radar_backend using (workspace_id = public.radar_current_workspace())',
      table_name || '_backend_select',
      table_name
    );
    execute format(
      'create policy %I on public.%I for insert to radar_backend with check (workspace_id = public.radar_current_workspace())',
      table_name || '_backend_insert',
      table_name
    );
    execute format(
      'create policy %I on public.%I for update to radar_backend using (workspace_id = public.radar_current_workspace()) with check (workspace_id = public.radar_current_workspace())',
      table_name || '_backend_update',
      table_name
    );
    execute format(
      'create policy %I on public.%I for delete to radar_backend using (workspace_id = public.radar_current_workspace())',
      table_name || '_backend_delete',
      table_name
    );
  end loop;
end $$;
