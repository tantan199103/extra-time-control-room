-- Commerce checkout and order tracking.
-- Apply after 202609180003_payment_settings.sql. Payment confirmation is always
-- server-side: a browser can create a pending order, but only a verified
-- provider capture/webhook can move it to PAID/CONFIRMED.
begin;

-- Extend the shared request limiter to the commerce endpoints.  Checkout
-- creation is intentionally tight because each accepted request can reserve
-- inventory; quote and tracking reads are more permissive but still bounded.
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
  elsif requested_action='checkout-quote' then quota:=120; minutes:=60;
  elsif requested_action='checkout-create' then quota:=12; minutes:=60;
  elsif requested_action='payment-capture' then quota:=12; minutes:=60;
  elsif requested_action='payment-cancel' then quota:=12; minutes:=60;
  elsif requested_action='order-track' then quota:=60; minutes:=60;
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

alter table public.pod_product_variants
  add column if not exists reserved_inventory integer not null default 0;

create table if not exists public.pod_orders (
  id uuid primary key default gen_random_uuid(),
  order_number text not null unique,
  session_hash text not null,
  customer_user_id uuid references auth.users(id) on delete set null,
  customer_email text not null,
  customer_name text not null default '',
  shipping_address jsonb not null default '{}'::jsonb,
  currency text not null default 'USD' check (currency ~ '^[A-Z]{3}$'),
  status text not null default 'PENDING_PAYMENT' check (status in ('PENDING_PAYMENT','PAID','CONFIRMED','PROCESSING','SHIPPED','DELIVERED','CANCELLED','REFUNDED','PAYMENT_FAILED','EXPIRED')),
  payment_status text not null default 'PENDING' check (payment_status in ('PENDING','AUTHORIZED','PAID','FAILED','REFUNDED')),
  fulfillment_status text not null default 'UNFULFILLED' check (fulfillment_status in ('UNFULFILLED','IN_PROGRESS','SHIPPED','DELIVERED','CANCELLED')),
  payment_provider text not null default 'NONE' check (payment_provider in ('NONE','PAYPAL','PADDLE')),
  provider_order_id text,
  provider_payment_id text,
  provider_event_id text,
  quote_hash text not null default '',
  idempotency_key text not null,
  subtotal numeric(12,2) not null default 0 check (subtotal >= 0),
  public_subtotal numeric(12,2) not null default 0 check (public_subtotal >= 0),
  discount_total numeric(12,2) not null default 0 check (discount_total >= 0),
  shipping_total numeric(12,2) not null default 0 check (shipping_total >= 0),
  tax_total numeric(12,2) not null default 0 check (tax_total >= 0),
  grand_total numeric(12,2) not null default 0 check (grand_total >= 0),
  member_pricing boolean not null default false,
  tracking_carrier text,
  tracking_number text,
  tracking_url text,
  metadata jsonb not null default '{}'::jsonb,
  tracking_token_hash text not null,
  expires_at timestamptz not null default now() + interval '30 minutes',
  created_at timestamptz not null default now(),
  updated_at timestamptz not null default now(),
  paid_at timestamptz,
  shipped_at timestamptz,
  delivered_at timestamptz,
  cancelled_at timestamptz
);

alter table public.pod_orders add column if not exists provider_order_id text;
alter table public.pod_orders add column if not exists provider_payment_id text;
alter table public.pod_orders add column if not exists provider_event_id text;
alter table public.pod_orders add column if not exists tracking_token_hash text;
alter table public.pod_orders add column if not exists member_pricing boolean not null default false;
alter table public.pod_orders add column if not exists expires_at timestamptz not null default now() + interval '30 minutes';

create unique index if not exists pod_orders_idempotency_session_key
  on public.pod_orders(idempotency_key, session_hash);
create unique index if not exists pod_orders_provider_order_key
  on public.pod_orders(payment_provider, provider_order_id)
  where provider_order_id is not null;
create unique index if not exists pod_orders_provider_event_key
  on public.pod_orders(provider_event_id)
  where provider_event_id is not null;
create index if not exists pod_orders_customer_idx
  on public.pod_orders(customer_user_id, created_at desc);
create index if not exists pod_orders_status_idx
  on public.pod_orders(status, payment_status, created_at desc);

create table if not exists public.pod_order_lines (
  id uuid primary key default gen_random_uuid(),
  order_id uuid not null references public.pod_orders(id) on delete cascade,
  product_id text references public.pod_products(id) on update cascade on delete set null,
  variant_id text references public.pod_product_variants(id) on update cascade on delete set null,
  sku text not null default '',
  product_title text not null default '',
  product_handle text not null default '',
  product_image text,
  option_values jsonb not null default '{}'::jsonb,
  customization jsonb not null default '{}'::jsonb,
  unit_price numeric(12,2) not null default 0 check (unit_price >= 0),
  public_unit_price numeric(12,2) not null default 0 check (public_unit_price >= 0),
  discount_total numeric(12,2) not null default 0 check (discount_total >= 0),
  quantity integer not null check (quantity > 0 and quantity <= 99),
  line_total numeric(12,2) not null default 0 check (line_total >= 0),
  created_at timestamptz not null default now()
);

create index if not exists pod_order_lines_order_idx on public.pod_order_lines(order_id);

create table if not exists public.pod_order_events (
  id uuid primary key default gen_random_uuid(),
  order_id uuid not null references public.pod_orders(id) on delete cascade,
  event_type text not null,
  status text not null,
  message text not null default '',
  metadata jsonb not null default '{}'::jsonb,
  visible_to_customer boolean not null default true,
  actor_id uuid references auth.users(id) on delete set null,
  created_at timestamptz not null default now()
);

create index if not exists pod_order_events_order_idx on public.pod_order_events(order_id, created_at);
create unique index if not exists pod_order_events_provider_event_idx
  on public.pod_order_events((metadata->>'providerEventId'))
  where metadata ? 'providerEventId';

drop trigger if exists orders_touch_updated_at on public.pod_orders;
create trigger orders_touch_updated_at before update on public.pod_orders
for each row execute function public.pod_touch_updated_at();

alter table public.pod_orders enable row level security;
alter table public.pod_order_lines enable row level security;
alter table public.pod_order_events enable row level security;

drop policy if exists "customers read own orders" on public.pod_orders;
drop policy if exists "customers read own order lines" on public.pod_order_lines;
drop policy if exists "customers read own order events" on public.pod_order_events;
drop policy if exists "admins manage orders" on public.pod_orders;
drop policy if exists "admins manage order lines" on public.pod_order_lines;
drop policy if exists "admins manage order events" on public.pod_order_events;

create policy "customers read own orders" on public.pod_orders for select to authenticated
  using (customer_user_id = auth.uid());
create policy "customers read own order lines" on public.pod_order_lines for select to authenticated
  using (exists(select 1 from public.pod_orders o where o.id=order_id and o.customer_user_id=auth.uid()));
create policy "customers read own order events" on public.pod_order_events for select to authenticated
  using (exists(select 1 from public.pod_orders o where o.id=order_id and o.customer_user_id=auth.uid()));
create policy "admins manage orders" on public.pod_orders for all to authenticated
  using ((select public.pod_is_admin())) with check ((select public.pod_is_admin()));
create policy "admins manage order lines" on public.pod_order_lines for all to authenticated
  using ((select public.pod_is_admin())) with check ((select public.pod_is_admin()));
create policy "admins manage order events" on public.pod_order_events for all to authenticated
  using ((select public.pod_is_admin())) with check ((select public.pod_is_admin()));

-- Customer tracking is intentionally served through /api/order-track, which
-- checks the high-entropy tracking token and strips provider/private metadata.
-- Do not expose the raw order tables to browser sessions, even for a user's
-- own rows; that would bypass the response shaping and event visibility rules.
revoke select, insert, update, delete on public.pod_orders, public.pod_order_lines, public.pod_order_events from anon, authenticated;

create or replace function public.pod_create_pending_order(payload jsonb)
returns jsonb
language plpgsql
security definer
set search_path = public
as $$
declare
  order_row public.pod_orders%rowtype;
  line_row jsonb;
  variant_row record;
  line_id uuid;
  customization_request_id text;
  customization_fields jsonb;
  customization_note text;
  customization_has_ai boolean;
  order_id uuid := coalesce(nullif(payload->>'id','')::uuid, gen_random_uuid());
  idempotency text := coalesce(nullif(payload->>'idempotencyKey',''),'');
  session_value text := coalesce(nullif(payload->>'sessionHash',''),'');
  line_qty integer;
  public_unit numeric;
  final_unit numeric;
  line_discount numeric;
begin
  if jsonb_typeof(payload) is distinct from 'object' then raise exception 'Invalid order payload'; end if;
  if length(idempotency) < 16 or length(idempotency) > 180 or length(session_value) < 16 then raise exception 'Invalid order identity'; end if;
  if jsonb_typeof(payload->'lines') is distinct from 'array' or jsonb_array_length(payload->'lines') < 1 then raise exception 'An order needs at least one line'; end if;

  select * into order_row from public.pod_orders where idempotency_key=idempotency and session_hash=session_value limit 1;
  if found then return to_jsonb(order_row) || jsonb_build_object('replayed', true); end if;

  insert into public.pod_orders(
    id, order_number, session_hash, customer_user_id, customer_email, customer_name,
    shipping_address, currency, status, payment_status, fulfillment_status,
    payment_provider, quote_hash, idempotency_key, subtotal, public_subtotal,
    discount_total, shipping_total, tax_total, grand_total, member_pricing,
    tracking_token_hash, metadata
  ) values (
    order_id, payload->>'orderNumber', session_value, nullif(payload->>'customerUserId','')::uuid,
    lower(payload->>'customerEmail'), coalesce(payload->>'customerName',''),
    coalesce(payload->'shippingAddress','{}'::jsonb), coalesce(payload->>'currency','USD'),
    'PENDING_PAYMENT', 'PENDING', 'UNFULFILLED', coalesce(payload->>'paymentProvider','NONE'),
    coalesce(payload->>'quoteHash',''), idempotency,
    coalesce((payload->'totals'->>'subtotal')::numeric,0), coalesce((payload->'totals'->>'publicSubtotal')::numeric,0),
    coalesce((payload->'totals'->>'discount')::numeric,0), coalesce((payload->'totals'->>'shipping')::numeric,0),
    coalesce((payload->'totals'->>'tax')::numeric,0), coalesce((payload->'totals'->>'total')::numeric,0),
    coalesce((payload->>'memberPricing')::boolean,false), payload->>'trackingTokenHash',
    coalesce(payload->'metadata','{}'::jsonb)
  ) returning * into order_row;

  for line_row in select value from jsonb_array_elements(payload->'lines') loop
    line_qty := greatest(1, least(99, coalesce((line_row->>'qty')::integer,1)));
    select v.id, v.product_id, v.sku, v.option_values, v.price, v.inventory, v.reserved_inventory, v.status as variant_status,
           p.title, p.handle, p.image, p.status as product_status
      into variant_row
      from public.pod_product_variants v join public.pod_products p on p.id=v.product_id
      where v.id=line_row->>'variantId' for update;
    if not found or variant_row.product_status <> 'PUBLISHED' or variant_row.variant_status <> 'ACTIVE' then raise exception 'Listing is no longer published'; end if;
    if nullif(line_row->>'productId','') is not null and line_row->>'productId' <> variant_row.product_id then raise exception 'Variation does not belong to the listing'; end if;
    if variant_row.inventory - variant_row.reserved_inventory < line_qty or variant_row.inventory < 0 then raise exception 'Variation is no longer available'; end if;
    customization_request_id := nullif(line_row->'customization'->>'requestId','');
    customization_fields := '{}'::jsonb;
    customization_note := '';
    customization_has_ai := false;
    if jsonb_typeof(coalesce(line_row->'customization','{}'::jsonb)) = 'object'
       and coalesce(line_row->'customization','{}'::jsonb) <> '{}'::jsonb
       and customization_request_id is null then
      raise exception 'Personalization must be created from the published listing';
    end if;
    if customization_request_id is not null then
      select c.payload->'fields',coalesce(c.payload->>'note',''),(c.ai_preview_id is not null)
        into customization_fields,customization_note,customization_has_ai
        from public.pod_customization_orders c
       where c.id=customization_request_id
         and c.product_id=variant_row.product_id
         and c.variant_id=variant_row.id
         and c.status in ('PREVIEW','CONFIRMED')
       for update;
      if not found then raise exception 'Personalization request is no longer valid'; end if;
    end if;
    public_unit := round(variant_row.price::numeric,2);
    final_unit := round(coalesce((line_row->>'finalUnit')::numeric,public_unit),2);
    if coalesce((line_row->>'publicUnit')::numeric,public_unit) <> public_unit or final_unit < 0 or final_unit > public_unit then raise exception 'Order pricing is no longer valid'; end if;
    line_discount := greatest(0, round((public_unit-final_unit)*line_qty,2));
    update public.pod_product_variants set reserved_inventory=reserved_inventory+line_qty where id=variant_row.id;
    insert into public.pod_order_lines(order_id,product_id,variant_id,sku,product_title,product_handle,product_image,option_values,customization,unit_price,public_unit_price,discount_total,quantity,line_total)
    values(order_row.id,variant_row.product_id,variant_row.id,variant_row.sku,variant_row.title,variant_row.handle,variant_row.image,
      coalesce(variant_row.option_values,'{}'::jsonb),
      case when customization_request_id is null then '{}'::jsonb else jsonb_build_object('requestId',customization_request_id,'fields',coalesce(customization_fields,'{}'::jsonb),'note',customization_note,'hasAiPreview',customization_has_ai) end,
      final_unit,public_unit,line_discount,line_qty,round(final_unit*line_qty,2));
  end loop;

  insert into public.pod_order_events(order_id,event_type,status,message,metadata)
  values(order_row.id,'ORDER_CREATED','PENDING_PAYMENT','Order created and awaiting secure payment.',jsonb_build_object('orderNumber',order_row.order_number));
  return to_jsonb(order_row) || jsonb_build_object('replayed', false);
exception when unique_violation then
  select * into order_row from public.pod_orders where idempotency_key=idempotency and session_hash=session_value limit 1;
  if found then return to_jsonb(order_row) || jsonb_build_object('replayed', true); end if;
  raise;
end;
$$;

create or replace function public.pod_expire_pending_orders()
returns integer
language plpgsql
security definer
set search_path = public
as $$
declare
  order_row record;
  released integer := 0;
begin
  for order_row in select id from public.pod_orders where status='PENDING_PAYMENT' and expires_at < now() for update skip locked loop
    update public.pod_product_variants v set reserved_inventory=greatest(0,v.reserved_inventory-l.quantity)
      from public.pod_order_lines l where l.order_id=order_row.id and v.id=l.variant_id;
    update public.pod_orders set status='EXPIRED',payment_status='FAILED',cancelled_at=now(),updated_at=now() where id=order_row.id;
    insert into public.pod_order_events(order_id,event_type,status,message,metadata) values(order_row.id,'ORDER_EXPIRED','EXPIRED','The payment window expired and reserved stock was released.','{}'::jsonb);
    released := released + 1;
  end loop;
  return released;
end;
$$;

create or replace function public.pod_mark_order_payment_pending(
  p_order_id uuid,
  p_provider_payment_id text default null,
  p_provider_event_id text default null,
  p_event_payload jsonb default '{}'::jsonb
)
returns jsonb
language plpgsql
security definer
set search_path = public
as $$
declare
  order_row public.pod_orders%rowtype;
begin
  select * into order_row from public.pod_orders where id=p_order_id for update;
  if not found then raise exception 'Order not found'; end if;
  if p_provider_event_id is not null and exists(select 1 from public.pod_order_events where metadata->>'providerEventId'=p_provider_event_id) then
    return to_jsonb(order_row) || jsonb_build_object('replayed', true);
  end if;
  if order_row.payment_status='PAID' or order_row.status <> 'PENDING_PAYMENT' then
    return to_jsonb(order_row) || jsonb_build_object('replayed', true);
  end if;
  update public.pod_orders
     set payment_status='AUTHORIZED',
         provider_payment_id=coalesce(p_provider_payment_id,provider_payment_id),
         provider_event_id=coalesce(p_provider_event_id,provider_event_id),
         expires_at=greatest(expires_at,now()+interval '7 days'),
         updated_at=now()
   where id=order_row.id
   returning * into order_row;
  insert into public.pod_order_events(order_id,event_type,status,message,metadata)
  values(order_row.id,'PAYMENT_PENDING',order_row.status,'Payment was received by the provider and is still pending. We will confirm the order when settlement completes.',coalesce(p_event_payload,'{}'::jsonb) || case when p_provider_event_id is null then '{}'::jsonb else jsonb_build_object('providerEventId',p_provider_event_id) end);
  return to_jsonb(order_row) || jsonb_build_object('replayed', false);
end;
$$;

create or replace function public.pod_finalize_order_payment(
  p_order_id uuid,
  p_payment_state text,
  p_provider_payment_id text default null,
  p_provider_event_id text default null,
  p_event_payload jsonb default '{}'::jsonb
)
returns jsonb
language plpgsql
security definer
set search_path = public
as $$
declare
  order_row public.pod_orders%rowtype;
  line_row record;
  next_status text;
  event_type text;
begin
  if p_payment_state not in ('PAID','FAILED','CANCELLED','REFUNDED') then raise exception 'Invalid payment state'; end if;
  select * into order_row from public.pod_orders where id=p_order_id for update;
  if not found then raise exception 'Order not found'; end if;
  if p_provider_event_id is not null and exists(select 1 from public.pod_order_events where metadata->>'providerEventId'=p_provider_event_id) then return to_jsonb(order_row) || jsonb_build_object('replayed', true); end if;
  -- Payment callbacks are retried and can arrive after a browser return or an
  -- expiry job.  Never let a late/duplicate callback move a terminal order
  -- backwards, consume stock a second time, or turn an expired reservation
  -- into a paid order without a fresh checkout.
  if p_payment_state='REFUNDED' then
    if order_row.payment_status='REFUNDED' then return to_jsonb(order_row) || jsonb_build_object('replayed', true); end if;
    if order_row.payment_status <> 'PAID' then return to_jsonb(order_row) || jsonb_build_object('replayed', true); end if;
    update public.pod_orders
       set status='REFUNDED',payment_status='REFUNDED',provider_payment_id=coalesce(p_provider_payment_id,provider_payment_id),provider_event_id=coalesce(p_provider_event_id,provider_event_id),updated_at=now()
     where id=order_row.id returning * into order_row;
    insert into public.pod_order_events(order_id,event_type,status,message,metadata)
    values(order_row.id,'PAYMENT_REFUNDED',order_row.status,'The payment was refunded. Fulfillment stock is not automatically restocked.',coalesce(p_event_payload,'{}'::jsonb) || case when p_provider_event_id is null then '{}'::jsonb else jsonb_build_object('providerEventId',p_provider_event_id) end);
    return to_jsonb(order_row) || jsonb_build_object('replayed', false);
  end if;
  if order_row.payment_status='PAID' then return to_jsonb(order_row) || jsonb_build_object('replayed', true); end if;
  if order_row.status <> 'PENDING_PAYMENT' then return to_jsonb(order_row) || jsonb_build_object('replayed', true); end if;

  if p_payment_state='PAID' then
    for line_row in select * from public.pod_order_lines where order_id=order_row.id loop
      update public.pod_product_variants set inventory=inventory-line_row.quantity, reserved_inventory=greatest(0,reserved_inventory-line_row.quantity) where id=line_row.variant_id and inventory >= line_row.quantity and reserved_inventory >= line_row.quantity;
      if not found then raise exception 'Inventory changed before payment confirmation'; end if;
    end loop;
    update public.pod_customization_orders c
       set status='CONFIRMED', updated_at=now()
     where c.id in (select nullif(l.customization->>'requestId','') from public.pod_order_lines l where l.order_id=order_row.id)
       and c.status='PREVIEW';
    next_status := 'CONFIRMED'; event_type := 'PAYMENT_CONFIRMED';
    update public.pod_orders set status=next_status,payment_status='PAID',provider_payment_id=coalesce(p_provider_payment_id,public.pod_orders.provider_payment_id),provider_event_id=coalesce(p_provider_event_id,public.pod_orders.provider_event_id),paid_at=coalesce(paid_at,now()),updated_at=now() where id=order_row.id returning * into order_row;
  else
    for line_row in select * from public.pod_order_lines where order_id=order_row.id loop
      update public.pod_product_variants set reserved_inventory=greatest(0,reserved_inventory-line_row.quantity) where id=line_row.variant_id;
    end loop;
    next_status := case when p_payment_state='CANCELLED' then 'CANCELLED' else 'PAYMENT_FAILED' end;
    event_type := case when p_payment_state='CANCELLED' then 'PAYMENT_CANCELLED' else 'PAYMENT_FAILED' end;
    update public.pod_orders set status=next_status,payment_status='FAILED',provider_payment_id=coalesce(p_provider_payment_id,public.pod_orders.provider_payment_id),provider_event_id=coalesce(p_provider_event_id,public.pod_orders.provider_event_id),cancelled_at=case when p_payment_state='CANCELLED' then now() else cancelled_at end,updated_at=now() where id=order_row.id returning * into order_row;
  end if;
  insert into public.pod_order_events(order_id,event_type,status,message,metadata)
  values(order_row.id,event_type,order_row.status,case when p_payment_state='PAID' then 'Payment confirmed. Your order is now in the studio queue.' else 'Payment was not completed; reserved stock was released.' end,coalesce(p_event_payload,'{}'::jsonb) || case when p_provider_event_id is null then '{}'::jsonb else jsonb_build_object('providerEventId',p_provider_event_id) end);
  return to_jsonb(order_row) || jsonb_build_object('replayed', false);
end;
$$;

-- Fulfillment is a separate, auditable transition.  The API authenticates the
-- scoped admin before calling this service-role RPC; keeping the order update,
-- customer event and audit row in one transaction prevents a half-saved
-- shipment state when one write fails.
create or replace function public.pod_admin_update_order_fulfillment(
  p_order_id uuid,
  p_fulfillment_status text,
  p_tracking_carrier text default null,
  p_tracking_number text default null,
  p_tracking_url text default null,
  p_actor_id uuid default null
)
returns jsonb
language plpgsql
security definer
set search_path = public
as $$
declare
  order_row public.pod_orders%rowtype;
  next_status text;
  clean_carrier text := nullif(left(trim(coalesce(p_tracking_carrier,'')),80),'');
  clean_number text := nullif(left(trim(coalesce(p_tracking_number,'')),160),'');
  clean_url text := nullif(left(trim(coalesce(p_tracking_url,'')),500),'');
begin
  if p_fulfillment_status not in ('UNFULFILLED','IN_PROGRESS','SHIPPED','DELIVERED','CANCELLED') then
    raise exception 'Invalid fulfillment status';
  end if;
  if clean_url is not null and clean_url !~* '^https://' then
    raise exception 'Tracking links must use HTTPS';
  end if;
  select * into order_row from public.pod_orders where id=p_order_id for update;
  if not found then raise exception 'Order not found'; end if;
  if p_fulfillment_status in ('IN_PROGRESS','SHIPPED','DELIVERED') and order_row.payment_status <> 'PAID' then
    raise exception 'Only paid orders can enter fulfillment';
  end if;
  if p_fulfillment_status in ('SHIPPED','DELIVERED') and (clean_carrier is null or clean_number is null) then
    raise exception 'Carrier and tracking number are required before shipping';
  end if;
  if p_fulfillment_status='DELIVERED' and order_row.fulfillment_status not in ('SHIPPED','DELIVERED') then
    raise exception 'An order must be shipped before it can be delivered';
  end if;
  if p_fulfillment_status='CANCELLED' and order_row.payment_status='PAID' then
    raise exception 'Paid orders need a refund workflow before cancellation';
  end if;
  if p_fulfillment_status='CANCELLED' and (order_row.status <> 'PENDING_PAYMENT' or order_row.payment_status <> 'PENDING') then
    raise exception 'Only an unpaid pending order can be cancelled here';
  end if;
  if order_row.fulfillment_status='SHIPPED' and p_fulfillment_status not in ('SHIPPED','DELIVERED') then
    raise exception 'A shipped order cannot move backwards';
  end if;
  if order_row.fulfillment_status='DELIVERED' and p_fulfillment_status <> 'DELIVERED' then
    raise exception 'A delivered order cannot move backwards';
  end if;
  if order_row.fulfillment_status='CANCELLED' and p_fulfillment_status <> 'CANCELLED' then
    raise exception 'A cancelled order cannot re-enter fulfillment';
  end if;
  if p_fulfillment_status='CANCELLED' and order_row.fulfillment_status <> 'CANCELLED' then
    update public.pod_product_variants v set reserved_inventory=greatest(0,v.reserved_inventory-l.quantity)
      from public.pod_order_lines l where l.order_id=order_row.id and v.id=l.variant_id;
  end if;

  next_status := case
    when p_fulfillment_status='CANCELLED' then 'CANCELLED'
    when p_fulfillment_status='SHIPPED' then 'SHIPPED'
    when p_fulfillment_status='DELIVERED' then 'DELIVERED'
    when p_fulfillment_status='IN_PROGRESS' then 'PROCESSING'
    when order_row.payment_status='PAID' then 'CONFIRMED'
    else order_row.status
  end;

  update public.pod_orders
     set fulfillment_status=p_fulfillment_status,
         status=next_status,
         tracking_carrier=clean_carrier,
         tracking_number=clean_number,
         tracking_url=clean_url,
         shipped_at=case when p_fulfillment_status in ('SHIPPED','DELIVERED') then coalesce(shipped_at,now()) else shipped_at end,
         delivered_at=case when p_fulfillment_status='DELIVERED' then coalesce(delivered_at,now()) else delivered_at end,
         cancelled_at=case when p_fulfillment_status='CANCELLED' then coalesce(cancelled_at,now()) else cancelled_at end,
         updated_at=now()
   where id=p_order_id
   returning * into order_row;

  insert into public.pod_order_events(order_id,event_type,status,message,metadata,visible_to_customer,actor_id)
  values(
    order_row.id,
    'FULFILLMENT_' || p_fulfillment_status,
    order_row.status,
    case p_fulfillment_status
      when 'SHIPPED' then 'Your order has shipped.'
      when 'DELIVERED' then 'Your order was delivered.'
      when 'IN_PROGRESS' then 'Your order is now in production.'
      when 'CANCELLED' then 'Your order was cancelled.'
      else 'Fulfillment returned to unfulfilled.'
    end,
    jsonb_build_object('trackingCarrier',coalesce(clean_carrier,''),'trackingNumber',coalesce(clean_number,''),'trackingUrl',coalesce(clean_url,'')),
    true,
    p_actor_id
  );
  insert into public.pod_audit_logs(actor_id,entity_type,entity_id,action,snapshot)
  values(p_actor_id,'order',order_row.id,'FULFILLMENT_' || p_fulfillment_status,jsonb_build_object('status',order_row.status,'fulfillmentStatus',p_fulfillment_status,'trackingCarrier',clean_carrier,'trackingNumber',clean_number,'trackingUrl',clean_url));
  return to_jsonb(order_row);
end;
$$;

revoke all on function public.pod_create_pending_order(jsonb) from public, anon, authenticated;
revoke all on function public.pod_finalize_order_payment(uuid,text,text,text,jsonb) from public, anon, authenticated;
revoke all on function public.pod_expire_pending_orders() from public, anon, authenticated;
revoke all on function public.pod_mark_order_payment_pending(uuid,text,text,jsonb) from public, anon, authenticated;
revoke all on function public.pod_admin_update_order_fulfillment(uuid,text,text,text,text,uuid) from public, anon, authenticated;
grant execute on function public.pod_create_pending_order(jsonb) to service_role;
grant execute on function public.pod_finalize_order_payment(uuid,text,text,text,jsonb) to service_role;
grant execute on function public.pod_expire_pending_orders() to service_role;
grant execute on function public.pod_mark_order_payment_pending(uuid,text,text,jsonb) to service_role;
grant execute on function public.pod_admin_update_order_fulfillment(uuid,text,text,text,text,uuid) to service_role;

commit;
