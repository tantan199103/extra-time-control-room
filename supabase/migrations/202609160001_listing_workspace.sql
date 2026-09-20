-- Listing Workspace: listing-owned story, media, SEO, variants, pricing and custom fields.
-- Additive and idempotent. Legacy artwork-template tables remain untouched for old render jobs.
begin;

alter table public.pod_products add column if not exists media jsonb not null default '[]'::jsonb;
alter table public.pod_products add column if not exists content_blocks jsonb not null default '[]'::jsonb;
alter table public.pod_products add column if not exists tags text[] not null default '{}'::text[];
alter table public.pod_products add column if not exists product_group text not null default '';
alter table public.pod_products add column if not exists taxonomy jsonb not null default '{}'::jsonb;
alter table public.pod_products add column if not exists custom_fields jsonb not null default '[]'::jsonb;
alter table public.pod_products add column if not exists ai_metadata jsonb not null default '{}'::jsonb;
alter table public.pod_product_variants add column if not exists cost numeric(10,2);

insert into storage.buckets(id,name,public) values('product-media','product-media',true)
on conflict(id) do update set public=true;

drop policy if exists "public can read product media" on storage.objects;
create policy "public can read product media" on storage.objects for select to anon, authenticated
  using(bucket_id='product-media');
drop policy if exists "admins can upload product media" on storage.objects;
create policy "admins can upload product media" on storage.objects for insert to authenticated
  with check(bucket_id='product-media' and (select public.pod_is_admin()));
drop policy if exists "admins can update product media" on storage.objects;
create policy "admins can update product media" on storage.objects for update to authenticated
  using(bucket_id='product-media' and (select public.pod_is_admin()))
  with check(bucket_id='product-media' and (select public.pod_is_admin()));
drop policy if exists "admins can delete product media" on storage.objects;
create policy "admins can delete product media" on storage.objects for delete to authenticated
  using(bucket_id='product-media' and (select public.pod_is_admin()));

create or replace function public.pod_save_listing(listing jsonb, expected_updated_at timestamptz default null)
returns jsonb language plpgsql security invoker set search_path = '' as $$
declare
  pid text := listing->>'id';
  old_product public.pod_products%rowtype;
  had_product boolean;
  opt record;
  val record;
  custom_field jsonb;
  variant jsonb;
  oid text;
  vid text;
  vslug text;
  result jsonb;
begin
  if not public.pod_is_admin() then
    raise exception 'Admin permission is required' using errcode = '42501';
  end if;
  if jsonb_typeof(listing) is distinct from 'object' or coalesce(pid,'') = '' or coalesce(trim(listing->>'title'),'') = '' then
    raise exception 'Listing ID and title are required';
  end if;
  if coalesce(listing->>'handle','') !~ '^[a-z0-9]+(-[a-z0-9]+)*$' then raise exception 'Invalid listing handle'; end if;
  if coalesce(listing->>'status','') not in ('DRAFT','PUBLISHED','ARCHIVED') then raise exception 'Invalid listing status'; end if;
  if coalesce((listing->>'price')::numeric,-1) < 0 or (listing->>'price') in ('NaN','Infinity','-Infinity') then raise exception 'Invalid listing price'; end if;
  if (listing->>'price')::numeric <> round((listing->>'price')::numeric,2) then raise exception 'Price supports at most two decimal places'; end if;
  if (listing->>'compare_at')::numeric < (listing->>'price')::numeric then raise exception 'Compare-at price is too low'; end if;
  if jsonb_typeof(listing->'options') is distinct from 'array' or jsonb_typeof(listing->'variants') is distinct from 'array' then raise exception 'Options and variants must be arrays'; end if;
  if jsonb_typeof(listing->'media') is distinct from 'array' or jsonb_typeof(listing->'content_blocks') is distinct from 'array' or jsonb_typeof(listing->'tags') is distinct from 'array' or jsonb_typeof(listing->'custom_fields') is distinct from 'array' then raise exception 'Listing workspace fields must be arrays'; end if;
  if jsonb_typeof(listing->'seo') is distinct from 'object' or jsonb_typeof(listing->'taxonomy') is distinct from 'object' or jsonb_typeof(listing->'ai_metadata') is distinct from 'object' then raise exception 'Listing metadata must be objects'; end if;
  if jsonb_array_length(listing->'options') > 3 or jsonb_array_length(listing->'variants') > 250 then raise exception 'Listing size limit exceeded'; end if;
  if jsonb_array_length(listing->'media') > 100 or jsonb_array_length(listing->'content_blocks') > 100 or jsonb_array_length(listing->'custom_fields') > 30 or jsonb_array_length(listing->'tags') > 50 then raise exception 'Listing workspace limit exceeded'; end if;
  if exists(select 1 from jsonb_array_elements(listing->'options') o group by lower(trim(o->>'name')) having count(*) > 1) then raise exception 'Duplicate option names'; end if;
  if exists(select 1 from jsonb_array_elements_text(listing->'tags') tag where trim(tag)='') then raise exception 'Invalid empty tag'; end if;
  if exists(select 1 from jsonb_array_elements_text(listing->'tags') tag group by lower(trim(tag)) having count(*) > 1) then raise exception 'Duplicate tags'; end if;
  for custom_field in select value from jsonb_array_elements(listing->'custom_fields') loop
    if coalesce(trim(custom_field->>'id'),'')='' or coalesce(trim(custom_field->>'key'),'')='' or coalesce(trim(custom_field->>'label'),'')='' then raise exception 'Custom field ID, key and label are required'; end if;
    if coalesce(custom_field->>'type','') not in ('text','number','textarea','select','photo') then raise exception 'Invalid custom field type'; end if;
    if custom_field->>'type'='select' and (jsonb_typeof(custom_field->'options') is distinct from 'array' or jsonb_array_length(custom_field->'options')=0) then raise exception 'Select custom fields need options'; end if;
  end loop;
  if exists(select 1 from jsonb_array_elements(listing->'custom_fields') field group by field->>'key' having count(*) > 1) then raise exception 'Duplicate custom field keys'; end if;
  for opt in select value, ordinality from jsonb_array_elements(listing->'options') with ordinality loop
    if coalesce(trim(opt.value->>'name'),'') = '' or jsonb_typeof(opt.value->'values') is distinct from 'array' then raise exception 'Invalid option'; end if;
    if jsonb_array_length(opt.value->'values') = 0 then raise exception 'Option values cannot be empty'; end if;
    if exists(select 1 from jsonb_array_elements(opt.value->'values') v where jsonb_typeof(v) <> 'string' or trim(v#>>'{}') = '') then raise exception 'Invalid option value'; end if;
    if exists(select 1 from jsonb_array_elements_text(opt.value->'values') v group by lower(trim(v)) having count(*) > 1) then raise exception 'Duplicate option values'; end if;
  end loop;
  if exists(select 1 from jsonb_array_elements(listing->'variants') v group by v->>'id' having count(*) > 1) then raise exception 'Duplicate variant IDs'; end if;
  if exists(select 1 from jsonb_array_elements(listing->'variants') v where v->>'status' <> 'ARCHIVED' group by v->'option_values' having count(*) > 1) then raise exception 'Duplicate variant combination'; end if;
  for variant in select value from jsonb_array_elements(listing->'variants') loop
    if coalesce(variant->>'id','') = '' or coalesce(trim(variant->>'sku'),'') = '' then raise exception 'Variant ID and SKU are required'; end if;
    if coalesce(variant->>'status','') not in ('ACTIVE','DRAFT','ARCHIVED') then raise exception 'Invalid variant status'; end if;
    if coalesce((variant->>'price')::numeric,-1) < 0 or (variant->>'price') in ('NaN','Infinity','-Infinity') then raise exception 'Invalid variant price'; end if;
    if (variant->>'price')::numeric <> round((variant->>'price')::numeric,2) then raise exception 'Price supports at most two decimal places'; end if;
    if (variant->>'compare_at')::numeric < (variant->>'price')::numeric then raise exception 'Variant compare-at price is too low'; end if;
    if (variant->>'cost') is not null and (variant->>'cost' in ('NaN','Infinity','-Infinity') or (variant->>'cost')::numeric < 0 or (variant->>'cost')::numeric <> round((variant->>'cost')::numeric,2)) then raise exception 'Invalid variant cost'; end if;
    if coalesce((variant->>'inventory')::numeric,-1) < 0 or (variant->>'inventory')::numeric <> trunc((variant->>'inventory')::numeric) then raise exception 'Invalid variant stock'; end if;
    if (variant->>'weight_grams') is not null and ((variant->>'weight_grams')::numeric < 0 or (variant->>'weight_grams')::numeric <> trunc((variant->>'weight_grams')::numeric)) then raise exception 'Invalid variant weight'; end if;
    if jsonb_typeof(variant->'option_values') is distinct from 'object' then raise exception 'Invalid variant options'; end if;
    if variant->>'status' <> 'ARCHIVED' and (
      (select count(*) from jsonb_object_keys(variant->'option_values')) <> jsonb_array_length(listing->'options') or
      exists(select 1 from jsonb_array_elements(listing->'options') o where not (o->'values' @> jsonb_build_array(variant->'option_values'->>(o->>'name'))))
    ) then raise exception 'Variant does not match the listing options'; end if;
    if exists(select 1 from public.pod_product_variants where id = variant->>'id' and product_id <> pid) then raise exception 'Variant belongs to another listing'; end if;
  end loop;
  if listing->>'status' = 'PUBLISHED' and (coalesce(trim(listing->>'image'),'') = '' or not exists(select 1 from jsonb_array_elements(listing->'variants') v where v->>'status' = 'ACTIVE')) then raise exception 'Publishing requires a primary image and an active variant'; end if;

  select * into old_product from public.pod_products where id = pid for update;
  had_product := found;
  if had_product and expected_updated_at is distinct from old_product.updated_at then raise exception 'This listing changed elsewhere. Reload before saving.' using errcode = '40001'; end if;
  if not had_product and expected_updated_at is not null then raise exception 'Listing no longer exists. Reload before saving.'; end if;
  if not had_product then insert into public.pod_products(id,handle,title) values(pid,listing->>'handle',listing->>'title'); end if;

  update public.pod_products set handle=listing->>'handle', title=listing->>'title',
    subtitle=coalesce(listing->>'subtitle',''), description=coalesce(listing->>'description',''),
    price=(listing->>'price')::numeric, compare_at=(listing->>'compare_at')::numeric,
    status=listing->>'status', badge=listing->>'badge', type=coalesce(listing->>'type','READY TO SHIP'),
    template_id=null, template_version=null,
    image=listing->>'image', color=listing->>'color', sku=coalesce(listing->>'sku',''),
    artwork_lock=coalesce((listing->>'artwork_lock')::integer,100), personalization=coalesce(listing->'personalization','[]'::jsonb),
    media=listing->'media', content_blocks=listing->'content_blocks', tags=coalesce(array(select jsonb_array_elements_text(listing->'tags')),'{}'::text[]),
    product_group=coalesce(listing->>'product_group',''), taxonomy=listing->'taxonomy', custom_fields=listing->'custom_fields',
    seo=listing->'seo', ai_metadata=listing->'ai_metadata',
    inventory=coalesce((select sum((v->>'inventory')::integer) from jsonb_array_elements(listing->'variants') v where v->>'status'='ACTIVE'),0), updated_at=clock_timestamp()
  where id=pid;

  update public.pod_product_variants set status='ARCHIVED' where product_id=pid and not exists(select 1 from jsonb_array_elements(listing->'variants') v where v->>'id'=pod_product_variants.id);
  update public.pod_product_variants set status='ARCHIVED' where product_id=pid;
  for variant in select value from jsonb_array_elements(listing->'variants') loop
    insert into public.pod_product_variants(id,product_id,sku,option_values,price,compare_at,cost,inventory,weight_grams,barcode,status,image)
    values(variant->>'id',pid,variant->>'sku',variant->'option_values',(variant->>'price')::numeric,(variant->>'compare_at')::numeric,(variant->>'cost')::numeric,(variant->>'inventory')::integer,(variant->>'weight_grams')::integer,nullif(variant->>'barcode',''),variant->>'status',variant->>'image')
    on conflict(id) do update set sku=excluded.sku,option_values=excluded.option_values,price=excluded.price,compare_at=excluded.compare_at,cost=excluded.cost,inventory=excluded.inventory,weight_grams=excluded.weight_grams,barcode=excluded.barcode,status=excluded.status,image=excluded.image
    where public.pod_product_variants.product_id=pid;
    if not found then raise exception 'Variant belongs to another listing'; end if;
  end loop;

  delete from public.pod_product_options where product_id=pid and not exists(select 1 from jsonb_array_elements(listing->'options') o where o->>'name'=pod_product_options.name);
  for opt in select value, ordinality from jsonb_array_elements(listing->'options') with ordinality loop
    select id into oid from public.pod_product_options where product_id=pid and name=opt.value->>'name';
    oid := coalesce(oid,gen_random_uuid()::text);
    insert into public.pod_product_options(id,product_id,name,sort_order) values(oid,pid,opt.value->>'name',opt.ordinality-1)
    on conflict(id) do update set sort_order=excluded.sort_order;
    delete from public.pod_product_option_values where option_id=oid and not (opt.value->'values' @> jsonb_build_array(label));
    for val in select value, ordinality from jsonb_array_elements_text(opt.value->'values') with ordinality loop
      select id,slug into vid,vslug from public.pod_product_option_values where option_id=oid and label=val.value;
      vid:=coalesce(vid,gen_random_uuid()::text); vslug:=coalesce(vslug,md5(val.value));
      insert into public.pod_product_option_values(id,option_id,label,slug,sort_order) values(vid,oid,val.value,vslug,val.ordinality-1)
      on conflict(id) do update set sort_order=excluded.sort_order;
    end loop;
  end loop;
  insert into public.pod_audit_logs(actor_id,entity_type,entity_id,action,snapshot)
    values(auth.uid(),'product',pid,case when had_product then 'updated' else 'created' end,listing);
  select to_jsonb(p) || jsonb_build_object(
    'pod_product_variants',coalesce((select jsonb_agg(to_jsonb(v)) from public.pod_product_variants v where v.product_id=pid),'[]'::jsonb),
    'pod_product_options',coalesce((select jsonb_agg(to_jsonb(o) || jsonb_build_object('pod_product_option_values',coalesce((select jsonb_agg(to_jsonb(v)) from public.pod_product_option_values v where v.option_id=o.id),'[]'::jsonb))) from public.pod_product_options o where o.product_id=pid),'[]'::jsonb)
  ) into result from public.pod_products p where p.id=pid;
  return result;
end;
$$;
revoke all on function public.pod_save_listing(jsonb,timestamptz) from public, anon;
grant execute on function public.pod_save_listing(jsonb,timestamptz) to authenticated;

commit;
