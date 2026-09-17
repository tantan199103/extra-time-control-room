-- 90+ Club membership foundation.
-- Apply after 20260916_storefront_runtime.sql so pod_is_admin() is available.
begin;

create table if not exists public.pod_customer_profiles (
  user_id uuid primary key references auth.users(id) on delete cascade,
  email text not null default '',
  display_name text not null default '',
  phone text not null default '',
  created_at timestamptz not null default now(),
  updated_at timestamptz not null default now()
);

create table if not exists public.pod_membership_programs (
  id text primary key,
  slug text not null unique,
  name text not null,
  tagline text not null default '',
  description text not null default '',
  status text not null default 'DRAFT' check (status in ('DRAFT','PUBLISHED','ARCHIVED')),
  currency text not null default 'USD' check (currency ~ '^[A-Z]{3}$'),
  default_discount_percent numeric(5,2) not null default 20 check (default_discount_percent between 0 and 40),
  max_discount_percent numeric(5,2) not null default 40 check (max_discount_percent between 0 and 40),
  min_margin_percent numeric(5,2) not null default 20 check (min_margin_percent between 0 and 95),
  benefits jsonb not null default '[]'::jsonb check (jsonb_typeof(benefits)='array'),
  shipping_policy jsonb not null default '{}'::jsonb check (jsonb_typeof(shipping_policy)='object'),
  created_at timestamptz not null default now(),
  updated_at timestamptz not null default now(),
  check (default_discount_percent <= max_discount_percent)
);

create table if not exists public.pod_membership_prices (
  id uuid primary key default gen_random_uuid(),
  program_id text not null references public.pod_membership_programs(id) on delete cascade,
  billing_interval text not null check (billing_interval in ('MONTH','QUARTER','YEAR')),
  interval_months integer not null check (interval_months in (1,3,12)),
  label text not null,
  amount numeric(12,2) not null check (amount >= 0),
  currency text not null default 'USD' check (currency ~ '^[A-Z]{3}$'),
  status text not null default 'ACTIVE' check (status in ('ACTIVE','INACTIVE')),
  sort_order integer not null default 0,
  created_at timestamptz not null default now(),
  updated_at timestamptz not null default now(),
  unique(program_id,billing_interval)
);

create table if not exists public.pod_membership_discount_rules (
  id uuid primary key default gen_random_uuid(),
  program_id text not null references public.pod_membership_programs(id) on delete cascade,
  name text not null,
  scope_type text not null default 'ALL' check (scope_type in ('ALL','PRODUCT','VARIANT','TAG','COLLECTION')),
  scope_value text not null default '',
  discount_percent numeric(5,2) not null check (discount_percent between 0 and 40),
  priority integer not null default 0,
  stack_with_sale boolean not null default false,
  active boolean not null default true,
  starts_at timestamptz,
  ends_at timestamptz,
  created_at timestamptz not null default now(),
  updated_at timestamptz not null default now(),
  check (scope_type='ALL' or length(trim(scope_value)) > 0),
  check (ends_at is null or starts_at is null or ends_at > starts_at)
);

create table if not exists public.pod_membership_policy_versions (
  id uuid primary key default gen_random_uuid(),
  program_id text not null references public.pod_membership_programs(id) on delete cascade,
  version text not null,
  title text not null,
  summary text not null default '',
  content text not null,
  status text not null default 'DRAFT' check (status in ('DRAFT','PUBLISHED','RETIRED')),
  published_at timestamptz,
  created_at timestamptz not null default now(),
  updated_at timestamptz not null default now(),
  unique(program_id,version)
);

create table if not exists public.pod_member_policy_acceptances (
  user_id uuid not null references auth.users(id) on delete cascade,
  policy_version_id uuid not null references public.pod_membership_policy_versions(id) on delete restrict,
  accepted_at timestamptz not null default now(),
  primary key(user_id,policy_version_id)
);

create table if not exists public.pod_memberships (
  id uuid primary key default gen_random_uuid(),
  user_id uuid not null references auth.users(id) on delete cascade,
  program_id text not null references public.pod_membership_programs(id) on delete restrict,
  price_id uuid references public.pod_membership_prices(id) on delete set null,
  status text not null default 'PENDING' check (status in ('PENDING','TRIALING','ACTIVE','PAST_DUE','CANCELED','EXPIRED')),
  source text not null default 'MANUAL' check (source in ('MANUAL','PAYMENT_PROVIDER','IMPORT')),
  provider_customer_id text,
  provider_subscription_id text,
  current_period_start timestamptz,
  current_period_end timestamptz,
  cancel_at_period_end boolean not null default false,
  canceled_at timestamptz,
  created_at timestamptz not null default now(),
  updated_at timestamptz not null default now(),
  check (current_period_end is null or current_period_start is null or current_period_end > current_period_start)
);
create unique index if not exists pod_one_live_membership_per_program
  on public.pod_memberships(user_id,program_id)
  where status in ('PENDING','TRIALING','ACTIVE','PAST_DUE');

create table if not exists public.pod_membership_enrollment_requests (
  id uuid primary key default gen_random_uuid(),
  user_id uuid not null references auth.users(id) on delete cascade,
  program_id text not null references public.pod_membership_programs(id) on delete restrict,
  price_id uuid not null references public.pod_membership_prices(id) on delete restrict,
  policy_version_id uuid not null references public.pod_membership_policy_versions(id) on delete restrict,
  status text not null default 'PENDING' check (status in ('PENDING','APPROVED','DECLINED','CANCELED')),
  customer_note text not null default '',
  admin_note text not null default '',
  requested_at timestamptz not null default now(),
  reviewed_at timestamptz,
  reviewed_by uuid references auth.users(id) on delete set null,
  updated_at timestamptz not null default now(),
  check (char_length(customer_note) <= 500),
  check (char_length(admin_note) <= 1000)
);
create unique index if not exists pod_one_pending_enrollment_per_program
  on public.pod_membership_enrollment_requests(user_id,program_id)
  where status='PENDING';

create table if not exists public.pod_membership_events (
  id uuid primary key default gen_random_uuid(),
  membership_id uuid references public.pod_memberships(id) on delete cascade,
  user_id uuid references auth.users(id) on delete cascade,
  event_type text not null,
  actor_id uuid,
  payload jsonb not null default '{}'::jsonb check (jsonb_typeof(payload)='object'),
  created_at timestamptz not null default now()
);

create index if not exists pod_memberships_user_status_idx on public.pod_memberships(user_id,status,current_period_end desc);
create index if not exists pod_membership_requests_status_idx on public.pod_membership_enrollment_requests(status,requested_at desc);
create index if not exists pod_membership_rules_match_idx on public.pod_membership_discount_rules(program_id,active,scope_type,scope_value,priority desc);

alter table public.pod_customer_profiles enable row level security;
alter table public.pod_membership_programs enable row level security;
alter table public.pod_membership_prices enable row level security;
alter table public.pod_membership_discount_rules enable row level security;
alter table public.pod_membership_policy_versions enable row level security;
alter table public.pod_member_policy_acceptances enable row level security;
alter table public.pod_memberships enable row level security;
alter table public.pod_membership_enrollment_requests enable row level security;
alter table public.pod_membership_events enable row level security;

create policy "public reads published membership program" on public.pod_membership_programs
  for select using (status='PUBLISHED');
create policy "public reads active membership prices" on public.pod_membership_prices
  for select using (status='ACTIVE' and exists(select 1 from public.pod_membership_programs p where p.id=program_id and p.status='PUBLISHED'));
create policy "public reads published membership policy" on public.pod_membership_policy_versions
  for select using (status='PUBLISHED' and exists(select 1 from public.pod_membership_programs p where p.id=program_id and p.status='PUBLISHED'));

create policy "customers read own profile" on public.pod_customer_profiles for select to authenticated using (user_id=auth.uid());
create policy "customers create own profile" on public.pod_customer_profiles for insert to authenticated with check (user_id=auth.uid() and lower(email)=lower(coalesce(auth.jwt()->>'email','')));
create policy "customers update own profile" on public.pod_customer_profiles for update to authenticated using (user_id=auth.uid()) with check (user_id=auth.uid() and lower(email)=lower(coalesce(auth.jwt()->>'email','')));
create policy "customers read own memberships" on public.pod_memberships for select to authenticated using (user_id=auth.uid());
create policy "customers read own enrollment requests" on public.pod_membership_enrollment_requests for select to authenticated using (user_id=auth.uid());
create policy "customers create pending enrollment requests" on public.pod_membership_enrollment_requests for insert to authenticated
  with check (
    user_id=auth.uid() and status='PENDING' and reviewed_at is null and reviewed_by is null
    and exists(select 1 from public.pod_membership_prices p where p.id=price_id and p.program_id=program_id and p.status='ACTIVE')
    and exists(select 1 from public.pod_membership_policy_versions v where v.id=policy_version_id and v.program_id=program_id and v.status='PUBLISHED')
  );
create policy "customers read own policy acceptance" on public.pod_member_policy_acceptances for select to authenticated using (user_id=auth.uid());
create policy "customers accept own policy" on public.pod_member_policy_acceptances for insert to authenticated with check (user_id=auth.uid() and exists(select 1 from public.pod_membership_policy_versions v where v.id=policy_version_id and v.status='PUBLISHED'));
create policy "customers read own membership events" on public.pod_membership_events for select to authenticated using (user_id=auth.uid());

create policy "admins manage customer profiles" on public.pod_customer_profiles for all to authenticated using ((select public.pod_is_admin())) with check ((select public.pod_is_admin()));
create policy "admins manage membership programs" on public.pod_membership_programs for all to authenticated using ((select public.pod_is_admin())) with check ((select public.pod_is_admin()));
create policy "admins manage membership prices" on public.pod_membership_prices for all to authenticated using ((select public.pod_is_admin())) with check ((select public.pod_is_admin()));
create policy "admins manage membership rules" on public.pod_membership_discount_rules for all to authenticated using ((select public.pod_is_admin())) with check ((select public.pod_is_admin()));
create policy "admins manage membership policies" on public.pod_membership_policy_versions for all to authenticated using ((select public.pod_is_admin())) with check ((select public.pod_is_admin()));
create policy "admins read policy acceptances" on public.pod_member_policy_acceptances for select to authenticated using ((select public.pod_is_admin()));
create policy "admins manage memberships" on public.pod_memberships for all to authenticated using ((select public.pod_is_admin())) with check ((select public.pod_is_admin()));
create policy "admins manage enrollment requests" on public.pod_membership_enrollment_requests for all to authenticated using ((select public.pod_is_admin())) with check ((select public.pod_is_admin()));
create policy "admins read membership events" on public.pod_membership_events for select to authenticated using ((select public.pod_is_admin()));
create policy "admins create membership events" on public.pod_membership_events for insert to authenticated with check ((select public.pod_is_admin()));

grant select on public.pod_membership_programs,public.pod_membership_prices,public.pod_membership_policy_versions to anon,authenticated;
grant select,insert,update on public.pod_customer_profiles to authenticated;
grant select on public.pod_memberships,public.pod_membership_events to authenticated;
grant select,insert on public.pod_membership_enrollment_requests,public.pod_member_policy_acceptances to authenticated;
grant select,insert,update,delete on public.pod_membership_discount_rules to authenticated;
grant insert,update,delete on public.pod_membership_programs,public.pod_membership_prices,public.pod_membership_policy_versions,public.pod_memberships,public.pod_membership_events to authenticated;
grant update,delete on public.pod_membership_enrollment_requests to authenticated;

insert into public.pod_membership_programs(id,slug,name,tagline,description,status,currency,default_discount_percent,max_discount_percent,min_margin_percent,benefits,shipping_policy)
values(
  '90-club','90-plus-club','90+ Club','More time. Better access.',
  'A season pass for people who wear the story beyond the final whistle. Member pricing, eligible standard shipping and first access are managed as clear store entitlements.',
  'PUBLISHED','USD',20,40,20,
  '[{"id":"member-price","title":"20–40% member pricing","copy":"The best eligible price is applied; public sale and member discounts do not stack by default."},{"id":"shipping","title":"Eligible standard shipping included","copy":"Destination, method and subsidy limits are checked at quote time."},{"id":"early-access","title":"Early access to new drops","copy":"Enter selected releases before the public window opens."},{"id":"studio","title":"Studio priority","copy":"Membership fees never replace custom, artwork or production charges."}]'::jsonb,
  '{"enabled":true,"eligible_zones":["ALL"],"method":"STANDARD","minimum_subtotal":0,"subsidy_cap":15,"excluded_product_tags":["oversize-shipping"],"copy":"Standard shipping is covered up to $15 for eligible destinations. Express upgrades and exceptional surcharges remain payable."}'::jsonb
)
on conflict(id) do nothing;

insert into public.pod_membership_prices(id,program_id,billing_interval,interval_months,label,amount,currency,status,sort_order) values
  ('90000000-0000-4000-8000-000000000001','90-club','MONTH',1,'Monthly',19,'USD','ACTIVE',1),
  ('90000000-0000-4000-8000-000000000003','90-club','QUARTER',3,'Quarterly',49,'USD','ACTIVE',2),
  ('90000000-0000-4000-8000-000000000012','90-club','YEAR',12,'Annual',169,'USD','ACTIVE',3)
on conflict(id) do nothing;

insert into public.pod_membership_discount_rules(id,program_id,name,scope_type,scope_value,discount_percent,priority,stack_with_sale,active) values
  ('91000000-0000-4000-8000-000000000001','90-club','Club default','ALL','',20,0,false,true)
on conflict(id) do nothing;

insert into public.pod_membership_policy_versions(id,program_id,version,title,summary,content,status,published_at) values(
  '92000000-0000-4000-8000-000000000001','90-club','v1','90+ Club membership policy',
  'Membership renews only after billing is connected. Benefits are subject to eligibility, price protection and the published shipping policy.',
  E'90+ Club is a store membership. Eligible member pricing is calculated at quote time and may vary by product, variation or campaign, from 20% up to 40%. Member pricing does not normally stack with a public sale; the customer receives the better eligible product price.\n\nStandard shipping is included only for eligible destinations and methods, up to the configured subsidy limit. Express delivery, duties, taxes, remote-area surcharges and excluded products may remain payable.\n\nCustomization, AI artwork, production upgrades and other service fees are excluded unless a published benefit says otherwise. Membership activation requires confirmed payment or an authorized manual grant. An enrollment request alone is not an active membership.\n\nCancellation stops future renewal when recurring billing is connected. Access normally continues through the paid period, subject to fraud, abuse and refund rules.',
  'PUBLISHED',now()
)
on conflict(id) do nothing;

create or replace function public.pod_save_membership_program(payload jsonb)
returns jsonb language plpgsql security invoker set search_path=public as $$
declare
  pid text := coalesce(nullif(trim(payload->'program'->>'id'),''),'90-club');
  program jsonb := payload->'program';
  price jsonb;
  rule jsonb;
  policy jsonb := payload->'policy';
  price_ids uuid[] := '{}';
  rule_ids uuid[] := '{}';
  item_id uuid;
  result jsonb;
begin
  if not public.pod_is_admin() then raise exception 'Admin permission required'; end if;
  if jsonb_typeof(program) is distinct from 'object' or jsonb_typeof(payload->'prices') is distinct from 'array' or jsonb_typeof(payload->'rules') is distinct from 'array' then raise exception 'Invalid membership configuration'; end if;
  if coalesce(program->>'name','')='' or coalesce(program->>'slug','')='' then raise exception 'Program name and slug are required'; end if;
  if (program->>'default_discount_percent')::numeric not between 0 and 40 or (program->>'max_discount_percent')::numeric not between 0 and 40 or (program->>'default_discount_percent')::numeric > (program->>'max_discount_percent')::numeric then raise exception 'Invalid discount limits'; end if;
  if (program->>'min_margin_percent')::numeric not between 0 and 95 then raise exception 'Invalid margin floor'; end if;
  if jsonb_typeof(program->'benefits') is distinct from 'array' or jsonb_typeof(program->'shipping_policy') is distinct from 'object' then raise exception 'Benefits and shipping policy are invalid'; end if;
  if jsonb_typeof(program->'shipping_policy'->'eligible_zones') is distinct from 'array' or coalesce((program->'shipping_policy'->>'minimum_subtotal')::numeric,-1) < 0 or coalesce((program->'shipping_policy'->>'subsidy_cap')::numeric,-1) < 0 then raise exception 'Shipping limits are invalid'; end if;

  insert into public.pod_membership_programs(id,slug,name,tagline,description,status,currency,default_discount_percent,max_discount_percent,min_margin_percent,benefits,shipping_policy,updated_at)
  values(pid,program->>'slug',program->>'name',coalesce(program->>'tagline',''),coalesce(program->>'description',''),coalesce(program->>'status','DRAFT'),coalesce(program->>'currency','USD'),(program->>'default_discount_percent')::numeric,(program->>'max_discount_percent')::numeric,(program->>'min_margin_percent')::numeric,program->'benefits',program->'shipping_policy',clock_timestamp())
  on conflict(id) do update set slug=excluded.slug,name=excluded.name,tagline=excluded.tagline,description=excluded.description,status=excluded.status,currency=excluded.currency,default_discount_percent=excluded.default_discount_percent,max_discount_percent=excluded.max_discount_percent,min_margin_percent=excluded.min_margin_percent,benefits=excluded.benefits,shipping_policy=excluded.shipping_policy,updated_at=excluded.updated_at;

  for price in select value from jsonb_array_elements(payload->'prices') loop
    item_id := coalesce(nullif(price->>'id','')::uuid,gen_random_uuid());
    price_ids := array_append(price_ids,item_id);
    insert into public.pod_membership_prices(id,program_id,billing_interval,interval_months,label,amount,currency,status,sort_order,updated_at)
    values(item_id,pid,price->>'billing_interval',(price->>'interval_months')::integer,price->>'label',(price->>'amount')::numeric,coalesce(price->>'currency',program->>'currency','USD'),coalesce(price->>'status','ACTIVE'),coalesce((price->>'sort_order')::integer,0),clock_timestamp())
    on conflict(id) do update set billing_interval=excluded.billing_interval,interval_months=excluded.interval_months,label=excluded.label,amount=excluded.amount,currency=excluded.currency,status=excluded.status,sort_order=excluded.sort_order,updated_at=excluded.updated_at where pod_membership_prices.program_id=pid;
  end loop;
  delete from public.pod_membership_prices where program_id=pid and not(id=any(price_ids)) and not exists(select 1 from public.pod_memberships where price_id=pod_membership_prices.id) and not exists(select 1 from public.pod_membership_enrollment_requests where price_id=pod_membership_prices.id);

  for rule in select value from jsonb_array_elements(payload->'rules') loop
    item_id := coalesce(nullif(rule->>'id','')::uuid,gen_random_uuid());
    rule_ids := array_append(rule_ids,item_id);
    if (rule->>'discount_percent')::numeric > (program->>'max_discount_percent')::numeric then raise exception 'A rule exceeds the program maximum discount'; end if;
    insert into public.pod_membership_discount_rules(id,program_id,name,scope_type,scope_value,discount_percent,priority,stack_with_sale,active,starts_at,ends_at,updated_at)
    values(item_id,pid,rule->>'name',rule->>'scope_type',coalesce(rule->>'scope_value',''),(rule->>'discount_percent')::numeric,coalesce((rule->>'priority')::integer,0),coalesce((rule->>'stack_with_sale')::boolean,false),coalesce((rule->>'active')::boolean,true),(rule->>'starts_at')::timestamptz,(rule->>'ends_at')::timestamptz,clock_timestamp())
    on conflict(id) do update set name=excluded.name,scope_type=excluded.scope_type,scope_value=excluded.scope_value,discount_percent=excluded.discount_percent,priority=excluded.priority,stack_with_sale=excluded.stack_with_sale,active=excluded.active,starts_at=excluded.starts_at,ends_at=excluded.ends_at,updated_at=excluded.updated_at where pod_membership_discount_rules.program_id=pid;
  end loop;
  delete from public.pod_membership_discount_rules where program_id=pid and not(id=any(rule_ids));

  if jsonb_typeof(policy)='object' then
    item_id := coalesce(nullif(policy->>'id','')::uuid,gen_random_uuid());
    insert into public.pod_membership_policy_versions(id,program_id,version,title,summary,content,status,published_at,updated_at)
    values(item_id,pid,policy->>'version',policy->>'title',coalesce(policy->>'summary',''),policy->>'content',coalesce(policy->>'status','DRAFT'),case when policy->>'status'='PUBLISHED' then coalesce((policy->>'published_at')::timestamptz,now()) else null end,clock_timestamp())
    on conflict(id) do update set version=excluded.version,title=excluded.title,summary=excluded.summary,content=excluded.content,status=excluded.status,published_at=excluded.published_at,updated_at=excluded.updated_at where pod_membership_policy_versions.program_id=pid;
  end if;

  select to_jsonb(p) into result from public.pod_membership_programs p where p.id=pid;
  return result;
end;
$$;

create or replace function public.pod_admin_set_membership(payload jsonb)
returns jsonb language plpgsql security invoker set search_path=public as $$
declare
  target_user uuid := (payload->>'user_id')::uuid;
  target_program text := coalesce(nullif(payload->>'program_id',''),'90-club');
  target_price uuid := nullif(payload->>'price_id','')::uuid;
  target_status text := coalesce(payload->>'status','ACTIVE');
  membership public.pod_memberships%rowtype;
  months integer;
begin
  if not public.pod_is_admin() then raise exception 'Admin permission required'; end if;
  if target_status not in ('PENDING','TRIALING','ACTIVE','PAST_DUE','CANCELED','EXPIRED') then raise exception 'Invalid membership status'; end if;
  select interval_months into months from public.pod_membership_prices where id=target_price and program_id=target_program;
  if target_price is not null and months is null then raise exception 'Membership price not found'; end if;
  select * into membership from public.pod_memberships where user_id=target_user and program_id=target_program order by created_at desc limit 1 for update;
  if found then
    update public.pod_memberships set price_id=target_price,status=target_status,source='MANUAL',current_period_start=coalesce((payload->>'current_period_start')::timestamptz,current_period_start,now()),current_period_end=coalesce((payload->>'current_period_end')::timestamptz,case when months is not null then now()+make_interval(months=>months) else current_period_end end),cancel_at_period_end=coalesce((payload->>'cancel_at_period_end')::boolean,false),canceled_at=case when target_status='CANCELED' then now() else null end,updated_at=clock_timestamp() where id=membership.id returning * into membership;
  else
    insert into public.pod_memberships(user_id,program_id,price_id,status,source,current_period_start,current_period_end,cancel_at_period_end)
    values(target_user,target_program,target_price,target_status,'MANUAL',coalesce((payload->>'current_period_start')::timestamptz,now()),coalesce((payload->>'current_period_end')::timestamptz,case when months is not null then now()+make_interval(months=>months) end),coalesce((payload->>'cancel_at_period_end')::boolean,false)) returning * into membership;
  end if;
  insert into public.pod_membership_events(membership_id,user_id,event_type,actor_id,payload) values(membership.id,target_user,'ADMIN_STATUS_SET',auth.uid(),jsonb_build_object('status',target_status,'price_id',target_price));
  return to_jsonb(membership);
end;
$$;

create or replace function public.pod_admin_approve_membership_request(request_id uuid, period_end timestamptz default null)
returns jsonb language plpgsql security invoker set search_path=public as $$
declare request public.pod_membership_enrollment_requests%rowtype; result jsonb;
begin
  if not public.pod_is_admin() then raise exception 'Admin permission required'; end if;
  select * into request from public.pod_membership_enrollment_requests where id=request_id for update;
  if not found or request.status <> 'PENDING' then raise exception 'Pending enrollment request not found'; end if;
  result := public.pod_admin_set_membership(jsonb_build_object('user_id',request.user_id,'program_id',request.program_id,'price_id',request.price_id,'status','ACTIVE','current_period_end',period_end));
  update public.pod_membership_enrollment_requests set status='APPROVED',reviewed_at=now(),reviewed_by=auth.uid(),updated_at=clock_timestamp() where id=request.id;
  return result;
end;
$$;

revoke all on function public.pod_save_membership_program(jsonb) from public,anon;
revoke all on function public.pod_admin_set_membership(jsonb) from public,anon;
revoke all on function public.pod_admin_approve_membership_request(uuid,timestamptz) from public,anon;
grant execute on function public.pod_save_membership_program(jsonb),public.pod_admin_set_membership(jsonb),public.pod_admin_approve_membership_request(uuid,timestamptz) to authenticated;

commit;
