-- Trusted server-side catalogue import support.
-- Apply only after 202609160002_scoped_admin.sql and 20260920_menu_navigation_media.sql.
-- The service-role key remains server-only; this migration does not grant browser access.
begin;

create or replace function public.pod_is_admin()
returns boolean language sql stable security invoker set search_path = '' as $$
  select coalesce(auth.role(), '') = 'service_role'
    or (auth.uid() is not null and coalesce(auth.jwt()->'app_metadata'->>'extra_time_role', '') = 'admin');
$$;

revoke all on function public.pod_is_admin() from public, anon;
grant execute on function public.pod_is_admin() to authenticated, service_role;

-- Import provenance is deliberately kept in a private audit table instead of
-- leaking source URLs, source names or importer details into storefront rows.
create table if not exists public.pod_catalog_imports (
  source text not null,
  source_entity_id text not null,
  entity_type text not null check (entity_type in ('PRODUCT', 'COLLECTION', 'MEDIA')),
  entity_id text not null,
  source_sku text not null default '',
  source_categories jsonb not null default '[]'::jsonb,
  imported_at timestamptz not null default now(),
  primary key (source, source_entity_id, entity_type)
);

alter table public.pod_catalog_imports enable row level security;
revoke all on public.pod_catalog_imports from public, anon, authenticated;
grant select, insert, update on public.pod_catalog_imports to service_role;
drop policy if exists "admins can read catalog import audit" on public.pod_catalog_imports;
create policy "admins can read catalog import audit" on public.pod_catalog_imports
  for select to authenticated using ((select public.pod_is_admin()));

grant execute on function public.pod_save_listing(jsonb, timestamptz) to service_role;
grant execute on function public.pod_save_collections(jsonb) to service_role;

commit;
