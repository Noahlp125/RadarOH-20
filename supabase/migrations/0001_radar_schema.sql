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
  source_id uuid primary key references public.radar_sources(id) on delete cascade,
  last_run_at timestamptz null,
  next_run_at timestamptz null,
  last_status text not null default 'idle',
  last_error text not null default '',
  consecutive_failures integer not null default 0 check (consecutive_failures >= 0),
  last_changed_at timestamptz null,
  updated_at timestamptz not null default now()
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
  source_id uuid not null references public.radar_sources(id) on delete cascade,
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
  source_id uuid not null references public.radar_sources(id) on delete cascade,
  run_id uuid not null references public.radar_monitor_runs(id) on delete cascade,
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
  source_id uuid not null references public.radar_sources(id) on delete cascade,
  run_id uuid not null references public.radar_monitor_runs(id) on delete cascade,
  evidence_id uuid not null references public.radar_monitor_evidence(id) on delete cascade,
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
  trends jsonb not null default '[]'::jsonb,
  attempt_count integer not null default 0 check (attempt_count >= 0),
  attempt_errors jsonb not null default '[]'::jsonb,
  error_message text not null default '',
  started_at timestamptz not null default now(),
  completed_at timestamptz null,
  unique (workspace_id, id)
);

create table if not exists public.radar_ai_analysis_evidence (
  analysis_id uuid not null references public.radar_ai_analyses(id) on delete cascade,
  evidence_id uuid not null references public.radar_monitor_evidence(id) on delete cascade,
  primary key (analysis_id, evidence_id)
);

create table if not exists public.radar_ai_findings (
  id uuid primary key default gen_random_uuid(),
  workspace_id uuid not null references public.radar_workspaces(id) on delete cascade,
  legacy_id text null,
  analysis_id uuid not null references public.radar_ai_analyses(id) on delete cascade,
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
  created_at timestamptz not null default now(),
  unique (workspace_id, id)
);

create table if not exists public.radar_ai_finding_evidence (
  finding_id uuid not null references public.radar_ai_findings(id) on delete cascade,
  evidence_id uuid not null references public.radar_monitor_evidence(id) on delete cascade,
  primary key (finding_id, evidence_id)
);

create table if not exists public.radar_ai_alerts (
  id uuid primary key default gen_random_uuid(),
  workspace_id uuid not null references public.radar_workspaces(id) on delete cascade,
  legacy_id text null,
  finding_id uuid not null references public.radar_ai_findings(id) on delete cascade,
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
  integration_id uuid not null references public.radar_integrations(id) on delete cascade,
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
  webhook_id uuid not null references public.radar_webhook_subscriptions(id) on delete cascade,
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
create index if not exists radar_integrations_workspace_status_idx
  on public.radar_integrations(workspace_id, status);
create index if not exists radar_webhooks_workspace_status_idx
  on public.radar_webhook_subscriptions(workspace_id, status);
create index if not exists radar_deliveries_workspace_status_idx
  on public.radar_integration_deliveries(workspace_id, status, created_at);
create index if not exists radar_worker_jobs_claim_idx
  on public.radar_worker_jobs(workspace_id, status, available_at);

-- RLS is enabled for Supabase Auth/direct client access. The first cutover
-- keeps the API server as the trusted transaction boundary and retains Clerk;
-- repository queries must still include an explicit workspace predicate.
create or replace function public.radar_has_workspace_access(target_workspace uuid)
returns boolean
language sql
stable
security definer
set search_path = public
as $$
  select exists (
    select 1
    from public.radar_workspace_members member
    where member.workspace_id = target_workspace
      and member.subject = coalesce(auth.jwt() ->> 'sub', '')
  );
$$;

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

create policy radar_workspace_access on public.radar_workspaces
  for all to authenticated
  using (public.radar_has_workspace_access(id))
  with check (public.radar_has_workspace_access(id));

create policy radar_workspace_member_access on public.radar_workspace_members
  for all to authenticated
  using (public.radar_has_workspace_access(workspace_id))
  with check (public.radar_has_workspace_access(workspace_id));

do $$
declare
  table_name text;
begin
  foreach table_name in array array[
    'radar_competitors',
    'radar_keywords',
    'radar_sources',
    'radar_plan_items',
    'radar_imports',
    'radar_monitor_runs',
    'radar_monitor_evidence',
    'radar_change_events',
    'radar_ai_analyses',
    'radar_ai_findings',
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
      'create policy %I on public.%I for all to authenticated using (public.radar_has_workspace_access(workspace_id)) with check (public.radar_has_workspace_access(workspace_id))',
      table_name || '_access',
      table_name
    );
  end loop;

  create policy radar_source_runtime_access
    on public.radar_source_runtime
    for all to authenticated
    using (
      exists (
        select 1 from public.radar_sources source
        where source.id = source_id
          and public.radar_has_workspace_access(source.workspace_id)
      )
    )
    with check (
      exists (
        select 1 from public.radar_sources source
        where source.id = source_id
          and public.radar_has_workspace_access(source.workspace_id)
      )
    );

  create policy radar_ai_analysis_evidence_access
    on public.radar_ai_analysis_evidence
    for all to authenticated
    using (
      exists (
        select 1 from public.radar_ai_analyses analysis
        where analysis.id = analysis_id
          and public.radar_has_workspace_access(analysis.workspace_id)
      )
    )
    with check (
      exists (
        select 1 from public.radar_ai_analyses analysis
        where analysis.id = analysis_id
          and public.radar_has_workspace_access(analysis.workspace_id)
      )
    );

  create policy radar_ai_finding_evidence_access
    on public.radar_ai_finding_evidence
    for all to authenticated
    using (
      exists (
        select 1 from public.radar_ai_findings finding
        where finding.id = finding_id
          and public.radar_has_workspace_access(finding.workspace_id)
      )
    )
    with check (
      exists (
        select 1 from public.radar_ai_findings finding
        where finding.id = finding_id
          and public.radar_has_workspace_access(finding.workspace_id)
      )
    );
end $$;
