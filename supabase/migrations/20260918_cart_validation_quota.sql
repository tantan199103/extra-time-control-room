-- Cart validation quota for the server-authoritative storefront check.
-- Keep this as a forward migration so production installs that already ran
-- 20260916_storefront_runtime.sql receive the new action as well.
begin;

create or replace function public.pod_consume_api_quota(requested_action text, requested_identity_hash text)
returns jsonb
language plpgsql
security definer
set search_path = ''
as $$
declare
  quota integer;
  minutes integer;
  window_start timestamptz;
  hits integer;
  retry_seconds integer;
begin
  if requested_action='ai-preview' then quota:=5; minutes:=60;
  elsif requested_action='customization-order' then quota:=20; minutes:=60;
  elsif requested_action='customer-upload' then quota:=10; minutes:=60;
  elsif requested_action='cart-validate' then quota:=60; minutes:=60;
  else raise exception 'Unsupported quota action';
  end if;
  if requested_identity_hash !~ '^[a-f0-9]{64}$' then raise exception 'Invalid quota identity'; end if;
  window_start:=to_timestamp(floor(extract(epoch from now())/(minutes*60))*(minutes*60));
  insert into public.pod_api_usage(action,identity_hash,window_started,request_count,updated_at)
  values(requested_action,requested_identity_hash,window_start,1,now())
  on conflict(action,identity_hash,window_started) do update
    set request_count=public.pod_api_usage.request_count+1,updated_at=now()
  returning request_count into hits;
  retry_seconds:=greatest(1,ceil(extract(epoch from window_start + make_interval(mins=>minutes) - now())))::integer;
  return jsonb_build_object('allowed',hits<=quota,'remaining',greatest(0,quota-hits),'retry_after_seconds',retry_seconds);
end;
$$;

revoke all on function public.pod_consume_api_quota(text,text) from public;
grant execute on function public.pod_consume_api_quota(text,text) to anon, authenticated, service_role;

commit;
