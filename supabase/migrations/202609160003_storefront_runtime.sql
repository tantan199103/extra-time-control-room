-- Storefront runtime: published catalogue reads, secured customer requests and atomic site configuration.
begin;

alter table public.pod_customization_orders alter column template_id drop not null;
alter table public.pod_customization_orders alter column template_version drop not null;
alter table public.pod_customization_orders add column if not exists variant_id text;
alter table public.pod_customization_orders add column if not exists listing_revision timestamptz;
alter table public.pod_customization_orders add column if not exists custom_schema jsonb not null default '[]'::jsonb;
alter table public.pod_customization_orders add column if not exists idempotency_key text;
alter table public.pod_customization_orders add column if not exists session_hash text;

-- Move existing personalized listings off the legacy template engine while
-- preserving the customer-facing fields that were previously stored as labels.
update public.pod_products
set custom_fields='[
  {"id":"field-name","key":"name","label":"Name","type":"text","required":false,"placeholder":"YOUR NAME","maxLength":14,"help":"Name printed on the garment."},
  {"id":"field-number","key":"number","label":"Number","type":"number","required":false,"placeholder":"24","maxLength":2,"help":"Player number from 00 to 99."},
  {"id":"field-team-city","key":"teamCity","label":"Team / city","type":"text","required":false,"placeholder":"SAIGON","maxLength":18,"help":"Team, city or place tied to the story."},
  {"id":"field-year","key":"year","label":"Year","type":"number","required":false,"placeholder":"2026","maxLength":4,"help":"A four-digit season or memory."},
  {"id":"field-color","key":"color","label":"Colour note","type":"text","required":false,"placeholder":"BLACK / PURPLE","maxLength":20,"help":"A colour request when this design permits it."},
  {"id":"field-photo","key":"photo","label":"Photo","type":"photo","required":false,"placeholder":"","maxLength":null,"help":"Optional customer reference photo."}
]'::jsonb
where type='PERSONALIZED'
  and jsonb_array_length(custom_fields)=0
  and jsonb_array_length(personalization)>0;

update public.pod_products
set template_id=null, template_version=null
where template_id is not null or template_version is not null;

do $migration$
begin
  if not exists(select 1 from pg_constraint where conname='pod_customization_orders_variant_id_fkey') then
    alter table public.pod_customization_orders add constraint pod_customization_orders_variant_id_fkey
      foreign key(variant_id) references public.pod_product_variants(id) on update cascade on delete set null;
  end if;
  if not exists(select 1 from pg_constraint where conname='pod_customization_orders_idempotency_key_key') then
    alter table public.pod_customization_orders add constraint pod_customization_orders_idempotency_key_key unique(idempotency_key);
  end if;
end;
$migration$;

drop policy if exists "customers can create customization orders" on public.pod_customization_orders;
revoke insert on public.pod_customization_orders from anon, authenticated;

create table if not exists public.pod_api_usage (
  action text not null,
  identity_hash text not null,
  window_started timestamptz not null,
  request_count integer not null default 0,
  updated_at timestamptz not null default now(),
  primary key(action, identity_hash, window_started)
);
alter table public.pod_api_usage enable row level security;
revoke all on public.pod_api_usage from public, anon, authenticated;

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

create table if not exists public.pod_ai_preview_jobs (
  id uuid primary key,
  product_id text references public.pod_products(id) on update cascade on delete set null,
  session_hash text not null,
  storage_path text not null,
  prompt text not null,
  model text not null,
  status text not null default 'COMPLETED' check(status in ('COMPLETED','FAILED','EXPIRED')),
  created_at timestamptz not null default now(),
  expires_at timestamptz not null default now() + interval '24 hours'
);
alter table public.pod_ai_preview_jobs enable row level security;
drop policy if exists "admins can read AI preview jobs" on public.pod_ai_preview_jobs;
create policy "admins can read AI preview jobs" on public.pod_ai_preview_jobs for select to authenticated
  using((select public.pod_is_admin()));

insert into storage.buckets(id,name,public,file_size_limit,allowed_mime_types)
values('ai-previews','ai-previews',false,20971520,array['image/png','image/jpeg','image/webp'])
on conflict(id) do update set public=false,file_size_limit=excluded.file_size_limit,allowed_mime_types=excluded.allowed_mime_types;
insert into storage.buckets(id,name,public,file_size_limit,allowed_mime_types)
values('customer-references','customer-references',false,5242880,array['image/png','image/jpeg','image/webp'])
on conflict(id) do update set public=false,file_size_limit=excluded.file_size_limit,allowed_mime_types=excluded.allowed_mime_types;

-- Related public rows may only be read through a published parent.
drop policy if exists "public can read visible menu items" on public.pod_menu_items;
create policy "public can read visible menu items" on public.pod_menu_items for select
  using(visible=true and exists(select 1 from public.pod_menus menu where menu.id=pod_menu_items.menu_id and menu.status='PUBLISHED'));
drop policy if exists "public can read published pages" on public.pod_pages;
create policy "public can read published pages" on public.pod_pages for select
  using(status='PUBLISHED' and exists(select 1 from public.pod_themes theme where theme.id=pod_pages.theme_id and theme.status='PUBLISHED'));
drop policy if exists "public can read collection products" on public.pod_collection_products;
create policy "public can read collection products" on public.pod_collection_products for select
  using(exists(select 1 from public.pod_collections collection where collection.id=pod_collection_products.collection_id and collection.status='PUBLISHED')
    and exists(select 1 from public.pod_products product where product.id=pod_collection_products.product_id and product.status='PUBLISHED'));
drop policy if exists "public can read product options" on public.pod_product_options;
create policy "public can read product options" on public.pod_product_options for select
  using(exists(select 1 from public.pod_products product where product.id=pod_product_options.product_id and product.status='PUBLISHED'));
drop policy if exists "public can read product option values" on public.pod_product_option_values;
create policy "public can read product option values" on public.pod_product_option_values for select
  using(exists(select 1 from public.pod_product_options option_row join public.pod_products product on product.id=option_row.product_id where option_row.id=pod_product_option_values.option_id and product.status='PUBLISHED'));
drop policy if exists "public can read active variants" on public.pod_product_variants;
create policy "public can read active variants" on public.pod_product_variants for select
  using(status='ACTIVE' and exists(select 1 from public.pod_products product where product.id=pod_product_variants.product_id and product.status='PUBLISHED'));

create or replace function public.pod_save_menus(menu_payload jsonb)
returns jsonb
language plpgsql
security invoker
set search_path = ''
as $$
declare menu_row jsonb; item_row jsonb; child_row jsonb; v_menu_id text;
begin
  if not public.pod_is_admin() then raise exception 'Admin permission required'; end if;
  if jsonb_typeof(menu_payload) is distinct from 'array' or jsonb_array_length(menu_payload)>30 then raise exception 'Invalid menu payload'; end if;
  for menu_row in select value from jsonb_array_elements(menu_payload) loop
    v_menu_id:=menu_row->>'id';
    if coalesce(v_menu_id,'')='' or jsonb_array_length(coalesce(menu_row->'items','[]'::jsonb))>100 then raise exception 'Invalid menu'; end if;
    insert into public.pod_menus(id,name,location,status,updated_at)
    values(v_menu_id,left(coalesce(menu_row->>'name','Untitled menu'),120),left(coalesce(menu_row->>'location','Header'),120),coalesce(menu_row->>'status','DRAFT'),now())
    on conflict(id) do update set name=excluded.name,location=excluded.location,status=excluded.status,updated_at=now();
    delete from public.pod_menu_items where pod_menu_items.menu_id=v_menu_id;
    for item_row in select value from jsonb_array_elements(coalesce(menu_row->'items','[]'::jsonb)) loop
      insert into public.pod_menu_items(id,menu_id,parent_id,label,target,link_type,visible,sort_order)
      values(item_row->>'id',v_menu_id,null,left(coalesce(item_row->>'label','Link'),120),left(coalesce(item_row->>'target','/'),500),upper(coalesce(item_row->>'type','PAGE')),coalesce((item_row->>'visible')::boolean,true),coalesce((item_row->>'sortOrder')::integer,0));
      for child_row in select value from jsonb_array_elements(coalesce(item_row->'children','[]'::jsonb)) loop
        insert into public.pod_menu_items(id,menu_id,parent_id,label,target,link_type,visible,sort_order)
        values(child_row->>'id',v_menu_id,item_row->>'id',left(coalesce(child_row->>'label','Link'),120),left(coalesce(child_row->>'target','/'),500),upper(coalesce(child_row->>'type','PAGE')),coalesce((child_row->>'visible')::boolean,true),coalesce((child_row->>'sortOrder')::integer,0));
      end loop;
    end loop;
    insert into public.pod_audit_logs(actor_id,entity_type,entity_id,action,snapshot) values(auth.uid(),'menu',v_menu_id,'SAVE',menu_row);
  end loop;
  return menu_payload;
end;
$$;
revoke all on function public.pod_save_menus(jsonb) from public,anon;
grant execute on function public.pod_save_menus(jsonb) to authenticated;

create or replace function public.pod_save_collections(collection_payload jsonb)
returns jsonb
language plpgsql
security invoker
set search_path = ''
as $$
declare collection_row jsonb; product_value jsonb; v_collection_id text; v_position integer;
begin
  if not public.pod_is_admin() then raise exception 'Admin permission required'; end if;
  if jsonb_typeof(collection_payload) is distinct from 'array' or jsonb_array_length(collection_payload)>100 then raise exception 'Invalid collection payload'; end if;
  for collection_row in select value from jsonb_array_elements(collection_payload) loop
    v_collection_id:=collection_row->>'id';
    if coalesce(v_collection_id,'')='' or jsonb_array_length(coalesce(collection_row->'products','[]'::jsonb))>500 then raise exception 'Invalid collection'; end if;
    insert into public.pod_collections(id,handle,name,description,status,hero_image,sort_mode,seo,updated_at)
    values(v_collection_id,collection_row->>'handle',left(coalesce(collection_row->>'name','Untitled collection'),160),left(coalesce(collection_row->>'description',''),5000),coalesce(collection_row->>'status','DRAFT'),nullif(collection_row->>'hero',''),upper(replace(coalesce(collection_row->>'sort','MANUAL'),' ','_')),coalesce(collection_row->'seo','{}'::jsonb),now())
    on conflict(id) do update set handle=excluded.handle,name=excluded.name,description=excluded.description,status=excluded.status,hero_image=excluded.hero_image,sort_mode=excluded.sort_mode,seo=excluded.seo,updated_at=now();
    delete from public.pod_collection_products where pod_collection_products.collection_id=v_collection_id;
    v_position:=0;
    for product_value in select value from jsonb_array_elements(coalesce(collection_row->'products','[]'::jsonb)) loop
      insert into public.pod_collection_products(collection_id,product_id,sort_order,featured) values(v_collection_id,trim(both '"' from product_value::text),v_position,v_position=0);
      v_position:=v_position+1;
    end loop;
    insert into public.pod_audit_logs(actor_id,entity_type,entity_id,action,snapshot) values(auth.uid(),'collection',v_collection_id,'SAVE',collection_row);
  end loop;
  return collection_payload;
end;
$$;
revoke all on function public.pod_save_collections(jsonb) from public,anon;
grant execute on function public.pod_save_collections(jsonb) to authenticated;

create or replace function public.pod_save_theme(theme_payload jsonb)
returns jsonb
language plpgsql
security invoker
set search_path = ''
as $$
declare page_row jsonb; v_theme_id text; v_definition jsonb; v_layout jsonb;
begin
  if not public.pod_is_admin() then raise exception 'Admin permission required'; end if;
  v_theme_id:=theme_payload->>'id';
  if coalesce(v_theme_id,'')='' then raise exception 'Theme ID required'; end if;
  v_definition:=jsonb_build_object('blocks',coalesce(theme_payload->'blocks','[]'::jsonb),'content',coalesce(theme_payload->'content','{}'::jsonb),'pages',coalesce(theme_payload->'pages','[]'::jsonb));
  insert into public.pod_themes(id,name,status,version,tokens,definition,updated_at)
  values(v_theme_id,left(coalesce(theme_payload->>'name','Store theme'),160),coalesce(theme_payload->>'status','DRAFT'),coalesce(theme_payload->>'version','v1.0'),coalesce(theme_payload->'tokens','{}'::jsonb),v_definition,now())
  on conflict(id) do update set name=excluded.name,status=excluded.status,version=excluded.version,tokens=excluded.tokens,definition=excluded.definition,updated_at=now();
  update public.pod_pages set status='ARCHIVED' where pod_pages.theme_id=v_theme_id;
  for page_row in select value from jsonb_array_elements(coalesce(theme_payload->'pages','[]'::jsonb)) loop
    v_layout:=case when jsonb_typeof(page_row->'layout')='array' then page_row->'layout' else '[]'::jsonb end;
    insert into public.pod_pages(id,theme_id,name,path,status,layout,seo,updated_at)
    values(page_row->>'id',v_theme_id,left(coalesce(page_row->>'name','Page'),160),page_row->>'path',coalesce(page_row->>'status','DRAFT'),v_layout,coalesce(page_row->'seo','{}'::jsonb),now())
    on conflict(id) do update set name=excluded.name,path=excluded.path,status=excluded.status,layout=excluded.layout,seo=excluded.seo,updated_at=now();
  end loop;
  insert into public.pod_theme_versions(id,theme_id,version,definition,changelog,created_by)
  values(v_theme_id||'-'||coalesce(theme_payload->>'version','v1.0'),v_theme_id,coalesce(theme_payload->>'version','v1.0'),v_definition,'Theme saved from Control Room',auth.uid())
  on conflict(theme_id,version) do update set definition=excluded.definition,changelog=excluded.changelog,created_by=excluded.created_by,created_at=now();
  insert into public.pod_audit_logs(actor_id,entity_type,entity_id,action,snapshot) values(auth.uid(),'theme',v_theme_id,'SAVE',theme_payload);
  return (select to_jsonb(theme) from public.pod_themes theme where theme.id=v_theme_id);
end;
$$;
revoke all on function public.pod_save_theme(jsonb) from public,anon;
grant execute on function public.pod_save_theme(jsonb) to authenticated;

commit;
