-- Persistent, additive collection rules. Existing/manual membership is never
-- removed by automation; matching new or edited listings are attached by the
-- trigger and an authenticated admin can backfill existing matches via RPC.
begin;

alter table public.pod_collections
  add column if not exists automation jsonb not null default '{
    "enabled": false,
    "keywordMode": "ANY",
    "includeKeywords": [],
    "excludeKeywords": [],
    "searchFields": ["title", "sku", "tags"],
    "status": "ALL",
    "productGroup": "",
    "productType": "",
    "league": "",
    "team": "",
    "customizable": "ANY"
  }'::jsonb;

alter table public.pod_collections drop constraint if exists pod_collections_automation_object;
alter table public.pod_collections add constraint pod_collections_automation_object
  check (jsonb_typeof(automation) = 'object');

create or replace function public.pod_collection_automation_has_conditions(rule jsonb)
returns boolean
language sql
immutable
set search_path = ''
as $$
  select case when jsonb_typeof(coalesce(rule, '{}'::jsonb)) <> 'object' then false else
    (case when jsonb_typeof(rule->'includeKeywords') = 'array' then jsonb_array_length(rule->'includeKeywords') > 0 else false end)
    or (case when jsonb_typeof(rule->'excludeKeywords') = 'array' then jsonb_array_length(rule->'excludeKeywords') > 0 else false end)
    or upper(coalesce(rule->>'status', 'ALL')) <> 'ALL'
    or btrim(coalesce(rule->>'productGroup', '')) <> ''
    or btrim(coalesce(rule->>'productType', '')) <> ''
    or btrim(coalesce(rule->>'league', '')) <> ''
    or btrim(coalesce(rule->>'team', '')) <> ''
    or upper(coalesce(rule->>'customizable', 'ANY')) <> 'ANY'
  end;
$$;

create or replace function public.pod_product_matches_collection_rule(product_row public.pod_products, rule jsonb)
returns boolean
language plpgsql
stable
set search_path = ''
as $$
declare
  search_fields jsonb := case when jsonb_typeof(rule->'searchFields') = 'array' then rule->'searchFields' else '["title","sku","tags"]'::jsonb end;
  include_terms jsonb := case when jsonb_typeof(rule->'includeKeywords') = 'array' then rule->'includeKeywords' else '[]'::jsonb end;
  exclude_terms jsonb := case when jsonb_typeof(rule->'excludeKeywords') = 'array' then rule->'excludeKeywords' else '[]'::jsonb end;
  search_document text := '';
  keyword_value text;
  any_include_match boolean := false;
  is_customizable boolean := false;
begin
  if jsonb_typeof(coalesce(rule, '{}'::jsonb)) <> 'object' then return false; end if;
  if upper(coalesce(rule->>'status', 'ALL')) <> 'ALL'
     and upper(coalesce(product_row.status, '')) <> upper(rule->>'status') then return false; end if;
  if btrim(coalesce(rule->>'productGroup', '')) <> ''
     and lower(coalesce(product_row.product_group, '')) <> lower(btrim(rule->>'productGroup')) then return false; end if;
  if btrim(coalesce(rule->>'productType', '')) <> ''
     and lower(coalesce(product_row.type, '')) <> lower(btrim(rule->>'productType')) then return false; end if;
  if btrim(coalesce(rule->>'league', '')) <> ''
     and lower(coalesce(product_row.taxonomy->>'league', '')) <> lower(btrim(rule->>'league')) then return false; end if;
  if btrim(coalesce(rule->>'team', '')) <> ''
     and lower(coalesce(product_row.taxonomy->>'team', '')) <> lower(btrim(rule->>'team')) then return false; end if;

  is_customizable := (jsonb_typeof(product_row.custom_fields) = 'array' and jsonb_array_length(product_row.custom_fields) > 0)
    or (jsonb_typeof(product_row.personalization) = 'array' and jsonb_array_length(product_row.personalization) > 0);
  if upper(coalesce(rule->>'customizable', 'ANY')) = 'YES' and not is_customizable then return false; end if;
  if upper(coalesce(rule->>'customizable', 'ANY')) = 'NO' and is_customizable then return false; end if;

  if search_fields ? 'title' then
    search_document := search_document || ' ' || coalesce(product_row.title, '') || ' ' || coalesce(product_row.subtitle, '');
  end if;
  if search_fields ? 'handle' then search_document := search_document || ' ' || coalesce(product_row.handle, ''); end if;
  if search_fields ? 'sku' then search_document := search_document || ' ' || coalesce(product_row.sku, ''); end if;
  if search_fields ? 'description' then search_document := search_document || ' ' || coalesce(product_row.description, ''); end if;
  if search_fields ? 'tags' then
    search_document := search_document || ' ' || coalesce(array_to_string(product_row.tags, ' '), '') || ' '
      || coalesce(product_row.taxonomy->>'league', '') || ' ' || coalesce(product_row.taxonomy->>'team', '') || ' '
      || coalesce(product_row.taxonomy->>'category', '') || ' ' || coalesce(product_row.taxonomy->>'brand', '');
  end if;
  search_document := lower(search_document);

  for keyword_value in select value from jsonb_array_elements_text(exclude_terms) loop
    if btrim(keyword_value) <> '' and position(lower(btrim(keyword_value)) in search_document) > 0 then return false; end if;
  end loop;

  if jsonb_array_length(include_terms) = 0 then return true; end if;
  for keyword_value in select value from jsonb_array_elements_text(include_terms) loop
    if btrim(keyword_value) = '' then continue; end if;
    if position(lower(btrim(keyword_value)) in search_document) > 0 then
      any_include_match := true;
    elsif upper(coalesce(rule->>'keywordMode', 'ANY')) = 'ALL' then
      return false;
    end if;
  end loop;
  return any_include_match;
end;
$$;

create or replace function public.pod_preview_collection_automation(
  target_collection_id text,
  requested_rules jsonb,
  requested_sample_limit integer default 40
)
returns jsonb
language plpgsql
security definer
set search_path = ''
as $$
declare
  match_count integer := 0;
  assigned_count integer := 0;
  samples jsonb := '[]'::jsonb;
  safe_limit integer := greatest(1, least(coalesce(requested_sample_limit, 40), 100));
begin
  if not public.pod_is_admin() then raise exception 'Admin permission is required'; end if;
  if not public.pod_collection_automation_has_conditions(requested_rules) then
    raise exception 'Add at least one automatic collection condition before previewing';
  end if;

  select count(*)::integer into match_count
  from public.pod_products product
  where public.pod_product_matches_collection_rule(product, requested_rules);

  select count(*)::integer into assigned_count
  from public.pod_products product
  where public.pod_product_matches_collection_rule(product, requested_rules)
    and exists (
      select 1 from public.pod_collection_products membership
      where membership.collection_id = target_collection_id and membership.product_id = product.id
    );

  select coalesce(jsonb_agg(jsonb_build_object(
    'id', sample.id,
    'title', sample.title,
    'sku', sample.sku,
    'image', sample.image,
    'status', sample.status,
    'productGroup', sample.product_group,
    'assigned', exists (
      select 1 from public.pod_collection_products membership
      where membership.collection_id = target_collection_id and membership.product_id = sample.id
    )
  )), '[]'::jsonb) into samples
  from (
    select product.id, product.title, product.sku, product.image, product.status, product.product_group
    from public.pod_products product
    where public.pod_product_matches_collection_rule(product, requested_rules)
    order by product.updated_at desc, product.id
    limit safe_limit
  ) sample;

  return jsonb_build_object(
    'collectionId', target_collection_id,
    'matchCount', match_count,
    'assignedCount', assigned_count,
    'newCount', greatest(match_count - assigned_count, 0),
    'sample', samples
  );
end;
$$;

create or replace function public.pod_apply_collection_automation(
  target_collection_id text,
  requested_rules jsonb
)
returns jsonb
language plpgsql
security definer
set search_path = ''
as $$
declare
  match_count integer := 0;
  added_count integer := 0;
  base_sort integer := 0;
  added_ids jsonb := '[]'::jsonb;
begin
  if not public.pod_is_admin() then raise exception 'Admin permission is required'; end if;
  if not exists (select 1 from public.pod_collections where id = target_collection_id) then raise exception 'Collection not found'; end if;
  if not public.pod_collection_automation_has_conditions(requested_rules) then
    raise exception 'Add at least one automatic collection condition before applying';
  end if;

  update public.pod_collections
  set automation = requested_rules, updated_at = now()
  where id = target_collection_id;

  select coalesce(max(sort_order) + 1, 0) into base_sort
  from public.pod_collection_products where collection_id = target_collection_id;

  select count(*)::integer into match_count
  from public.pod_products product
  where public.pod_product_matches_collection_rule(product, requested_rules);

  with matching as (
    select product.id, row_number() over (order by product.updated_at desc, product.id) - 1 as offset_index
    from public.pod_products product
    where public.pod_product_matches_collection_rule(product, requested_rules)
  ), inserted as (
    insert into public.pod_collection_products(collection_id, product_id, sort_order, featured)
    select target_collection_id, matching.id, base_sort + matching.offset_index::integer, false
    from matching
    on conflict (collection_id, product_id) do nothing
    returning product_id
  )
  select count(*)::integer, coalesce(jsonb_agg(product_id order by product_id), '[]'::jsonb)
  into added_count, added_ids
  from inserted;

  insert into public.pod_audit_logs(actor_id, entity_type, entity_id, action, snapshot)
  values (auth.uid(), 'collection', target_collection_id, 'APPLY_AUTOMATION', jsonb_build_object(
    'matchCount', match_count, 'addedCount', added_count, 'rules', requested_rules
  ));

  return jsonb_build_object(
    'collectionId', target_collection_id,
    'matchCount', match_count,
    'addedCount', added_count,
    'addedIds', added_ids
  );
end;
$$;

create or replace function public.pod_auto_assign_product_collections()
returns trigger
language plpgsql
security definer
set search_path = ''
as $$
begin
  insert into public.pod_collection_products(collection_id, product_id, sort_order, featured)
  select collection.id, new.id,
    coalesce((select max(existing.sort_order) + 1 from public.pod_collection_products existing where existing.collection_id = collection.id), 0),
    false
  from public.pod_collections collection
  where collection.status <> 'ARCHIVED'
    and coalesce((collection.automation->>'enabled')::boolean, false)
    and public.pod_collection_automation_has_conditions(collection.automation)
    and public.pod_product_matches_collection_rule(new, collection.automation)
  on conflict (collection_id, product_id) do nothing;
  return new;
end;
$$;

drop trigger if exists product_auto_assign_collections on public.pod_products;
create trigger product_auto_assign_collections
after insert or update of title, subtitle, description, status, type, sku, tags, product_group, taxonomy, custom_fields, personalization
on public.pod_products
for each row execute function public.pod_auto_assign_product_collections();

revoke all on function public.pod_collection_automation_has_conditions(jsonb) from public, anon;
revoke all on function public.pod_product_matches_collection_rule(public.pod_products, jsonb) from public, anon;
revoke all on function public.pod_preview_collection_automation(text, jsonb, integer) from public, anon;
revoke all on function public.pod_apply_collection_automation(text, jsonb) from public, anon;
revoke all on function public.pod_auto_assign_product_collections() from public, anon;
grant execute on function public.pod_collection_automation_has_conditions(jsonb) to authenticated, service_role;
grant execute on function public.pod_product_matches_collection_rule(public.pod_products, jsonb) to authenticated, service_role;
grant execute on function public.pod_preview_collection_automation(text, jsonb, integer) to authenticated, service_role;
grant execute on function public.pod_apply_collection_automation(text, jsonb) to authenticated, service_role;

commit;
