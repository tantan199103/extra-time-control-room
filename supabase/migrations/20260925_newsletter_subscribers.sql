begin;

create table if not exists public.pod_newsletter_subscribers (
  id uuid primary key default gen_random_uuid(),
  email text not null unique check (length(email) between 3 and 240),
  source text not null default 'storefront',
  status text not null default 'SUBSCRIBED' check (status in ('SUBSCRIBED','UNSUBSCRIBED')),
  consent_at timestamptz not null default now(),
  unsubscribed_at timestamptz,
  created_at timestamptz not null default now(),
  updated_at timestamptz not null default now()
);

create index if not exists pod_newsletter_subscribers_status_idx
  on public.pod_newsletter_subscribers(status, created_at desc);

alter table public.pod_newsletter_subscribers enable row level security;
revoke all on public.pod_newsletter_subscribers from anon, authenticated;
grant select, insert, update on public.pod_newsletter_subscribers to service_role;

create or replace function public.pod_consume_api_quota(requested_action text, requested_identity_hash text)
returns jsonb language plpgsql security definer set search_path = '' as $$
declare quota integer; minutes integer; window_start timestamptz; hits integer; retry_seconds integer;
begin
  if requested_action='newsletter-subscribe' then quota:=5; minutes:=60;
  elsif requested_action='ai-preview' then quota:=5; minutes:=60;
  elsif requested_action='customization-order' then quota:=20; minutes:=60;
  elsif requested_action='customer-upload' then quota:=10; minutes:=60;
  elsif requested_action='cart-validate' then quota:=60; minutes:=60;
  elsif requested_action='checkout-quote' then quota:=120; minutes:=60;
  elsif requested_action='checkout-create' then quota:=12; minutes:=60;
  elsif requested_action='payment-capture' then quota:=12; minutes:=60;
  elsif requested_action='payment-cancel' then quota:=12; minutes:=60;
  elsif requested_action='order-track' then quota:=60; minutes:=60;
  else raise exception 'Unsupported quota action'; end if;
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

commit;
