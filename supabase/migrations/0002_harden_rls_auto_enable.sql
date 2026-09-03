-- Supabase may provision this event-trigger function before application
-- migrations run. It is an internal DDL helper, not a public RPC endpoint.
-- Keep owner/service-role access intact while removing browser-role execution.
do $$
begin
  if to_regprocedure('public.rls_auto_enable()') is not null then
    execute
      'revoke execute on function public.rls_auto_enable() '
      'from public, anon, authenticated';
  end if;
end
$$;