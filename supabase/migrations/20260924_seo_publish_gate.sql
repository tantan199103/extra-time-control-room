-- Separate commerce visibility from organic-search indexability.
-- A product may be visible in the storefront while SEO remains BLOCKED or READY.
begin;

alter table public.pod_products
  add column if not exists seo_status text not null default 'BLOCKED',
  add column if not exists seo_quality_score integer not null default 0,
  add column if not exists seo_block_reasons jsonb not null default '[]'::jsonb,
  add column if not exists seo_reviewed_at timestamptz,
  add column if not exists seo_published_at timestamptz;

do $constraints$
begin
  if not exists (
    select 1 from pg_constraint
    where conname = 'pod_products_seo_status_check'
      and conrelid = 'public.pod_products'::regclass
  ) then
    alter table public.pod_products
      add constraint pod_products_seo_status_check
      check (seo_status in ('BLOCKED', 'READY', 'INDEXABLE'));
  end if;
  if not exists (
    select 1 from pg_constraint
    where conname = 'pod_products_seo_quality_score_check'
      and conrelid = 'public.pod_products'::regclass
  ) then
    alter table public.pod_products
      add constraint pod_products_seo_quality_score_check
      check (seo_quality_score between 0 and 100);
  end if;
  if not exists (
    select 1 from pg_constraint
    where conname = 'pod_products_seo_block_reasons_array_check'
      and conrelid = 'public.pod_products'::regclass
  ) then
    alter table public.pod_products
      add constraint pod_products_seo_block_reasons_array_check
      check (jsonb_typeof(seo_block_reasons) = 'array');
  end if;
end;
$constraints$;

create index if not exists pod_products_seo_status_idx
  on public.pod_products (seo_status, status, updated_at desc);

-- Keep the structured SEO object and first-class columns in sync. The listing
-- RPC already accepts `seo`; this trigger lets old clients continue working
-- while the admin gains explicit status/reason fields.
create or replace function public.pod_sync_seo_fields()
returns trigger language plpgsql set search_path = '' as $$
declare
  requested_status text;
  requested_score integer;
  requested_reasons jsonb;
begin
  requested_status := upper(nullif(trim(coalesce(new.seo->>'status', new.seo_status, '')), ''));
  if requested_status not in ('BLOCKED', 'READY', 'INDEXABLE') then
    requested_status := case when new.status = 'PUBLISHED' then 'READY' else 'BLOCKED' end;
  end if;
  -- A draft/archived row can be editorially ready, but it can never be
  -- indexable until commerce status is PUBLISHED.
  if new.status <> 'PUBLISHED' and requested_status = 'INDEXABLE' then
    requested_status := 'READY';
  end if;

  requested_score := new.seo_quality_score;
  if coalesce(new.seo->>'quality_score', '') ~ '^[0-9]+$' then
    requested_score := (new.seo->>'quality_score')::integer;
  end if;
  requested_score := greatest(0, least(100, coalesce(requested_score, 0)));

  requested_reasons := new.seo_block_reasons;
  if jsonb_typeof(new.seo->'block_reasons') = 'array' then
    requested_reasons := new.seo->'block_reasons';
  end if;
  if jsonb_typeof(requested_reasons) <> 'array' then
    requested_reasons := '[]'::jsonb;
  end if;

  new.seo_status := requested_status;
  new.seo_quality_score := requested_score;
  new.seo_block_reasons := requested_reasons;
  if requested_status = 'INDEXABLE' then
    new.seo_published_at := coalesce(new.seo_published_at, now());
  else
    new.seo_published_at := null;
  end if;
  new.seo := jsonb_set(
    jsonb_set(
      jsonb_set(coalesce(new.seo, '{}'::jsonb), '{status}', to_jsonb(requested_status), true),
      '{quality_score}', to_jsonb(requested_score), true
    ),
    '{block_reasons}', requested_reasons, true
  );
  return new;
end;
$$;

drop trigger if exists products_sync_seo_fields on public.pod_products;
create trigger products_sync_seo_fields
before insert or update of status, seo, seo_status, seo_quality_score, seo_block_reasons
on public.pod_products
for each row execute function public.pod_sync_seo_fields();

-- Initial backfill is deliberately conservative. Existing rows are only
-- indexable when they already have the minimum factual content and a live
-- priced variant. Imported drafts remain blocked until the optimizer/reviewer
-- explicitly moves them forward.
update public.pod_products p
set seo_status = case
      when p.status = 'PUBLISHED'
       and coalesce(trim(p.image), '') <> ''
       and length(trim(p.description)) >= 160
       and length(trim(coalesce(p.seo->>'title', ''))) between 30 and 65
       and length(trim(coalesce(p.seo->>'description', ''))) between 120 and 180
       and jsonb_array_length(coalesce(p.media, '[]'::jsonb)) >= 1
       and exists (
         select 1 from public.pod_product_variants v
         where v.product_id = p.id
           and v.status = 'ACTIVE'
           and coalesce(v.inventory, 0) > 0
           and coalesce(v.price, 0) > 0
       ) then 'INDEXABLE'
      else case when p.status = 'PUBLISHED' then 'READY' else 'BLOCKED' end
    end,
    seo_quality_score = case
      when p.status = 'PUBLISHED'
       and coalesce(trim(p.image), '') <> ''
       and length(trim(p.description)) >= 160
       and length(trim(coalesce(p.seo->>'title', ''))) between 30 and 65
       and length(trim(coalesce(p.seo->>'description', ''))) between 120 and 180
       and jsonb_array_length(coalesce(p.media, '[]'::jsonb)) >= 1
       and exists (
         select 1 from public.pod_product_variants v
         where v.product_id = p.id
           and v.status = 'ACTIVE'
           and coalesce(v.inventory, 0) > 0
           and coalesce(v.price, 0) > 0
       ) then 100 else 0 end,
    seo_block_reasons = case
      when p.status = 'PUBLISHED'
       and coalesce(trim(p.image), '') <> ''
       and length(trim(p.description)) >= 160
       and length(trim(coalesce(p.seo->>'title', ''))) between 30 and 65
       and length(trim(coalesce(p.seo->>'description', ''))) between 120 and 180
       and jsonb_array_length(coalesce(p.media, '[]'::jsonb)) >= 1
       and exists (
         select 1 from public.pod_product_variants v
         where v.product_id = p.id
           and v.status = 'ACTIVE'
           and coalesce(v.inventory, 0) > 0
           and coalesce(v.price, 0) > 0
       ) then '[]'::jsonb
      else jsonb_build_array('SEO_REVIEW_REQUIRED') end,
    seo_reviewed_at = case when p.status = 'PUBLISHED' then coalesce(p.seo_reviewed_at, now()) else p.seo_reviewed_at end
where true;

commit;
