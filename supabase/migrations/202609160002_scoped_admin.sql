-- Run after 20260916_listing_foundation.sql. This migration never assigns user roles.
-- Grant extra_time_role to a specifically approved account in a separate admin action.
begin;
create or replace function public.pod_is_admin()
returns boolean language sql stable security invoker set search_path = '' as $$
  select auth.uid() is not null and coalesce(auth.jwt()->'app_metadata'->>'extra_time_role', '') = 'admin';
$$;
revoke all on function public.pod_is_admin() from public, anon;
grant execute on function public.pod_is_admin() to authenticated;

do $migration$
declare
  target record;
  existing_command text;
  rpc_definition text;
  old_guard text := 'if auth.uid() is null or coalesce(auth.jwt()->''app_metadata''->>''role'', '''') <> ''admin'' then';
begin
  for target in select * from (values
    ('pod_products','admins can manage products','ALL'),
    ('pod_templates','admins can manage templates','ALL'),
    ('pod_store_settings','admins can manage settings','ALL'),
    ('pod_city_presets','admins can manage city presets','ALL'),
    ('pod_template_versions','admins can read template versions','SELECT'),
    ('pod_template_versions','admins can manage template versions','ALL'),
    ('pod_customization_orders','admins can manage customization orders','ALL'),
    ('pod_render_jobs','admins can read render jobs','SELECT'),
    ('pod_themes','admins can manage themes','ALL'),
    ('pod_theme_versions','admins can manage theme versions','ALL'),
    ('pod_pages','admins can manage pages','ALL'),
    ('pod_menus','admins can manage menus','ALL'),
    ('pod_menu_items','admins can manage menu items','ALL'),
    ('pod_collections','admins can manage collections','ALL'),
    ('pod_collection_products','admins can manage collection products','ALL'),
    ('pod_product_options','admins can manage product options','ALL'),
    ('pod_product_option_values','admins can manage product option values','ALL'),
    ('pod_product_variants','admins can manage product variants','ALL'),
    ('pod_media_assets','admins can manage media','ALL'),
    ('pod_audit_logs','admins can read audit logs','SELECT')
  ) as policies(table_name, policy_name, expected_command) loop
    select cmd into existing_command from pg_policies where schemaname='public' and tablename=target.table_name and policyname=target.policy_name;
    if existing_command is distinct from target.expected_command then
      raise exception 'Unexpected or missing policy: %.%', target.table_name, target.policy_name;
    end if;
    if target.expected_command='ALL' then
      execute format('alter policy %I on public.%I to authenticated using ((select public.pod_is_admin())) with check ((select public.pod_is_admin()))',target.policy_name,target.table_name);
    else
      execute format('alter policy %I on public.%I to authenticated using ((select public.pod_is_admin()))',target.policy_name,target.table_name);
    end if;
  end loop;
  alter policy "admins can insert listing audit logs" on public.pod_audit_logs to authenticated
    with check (actor_id=auth.uid() and (select public.pod_is_admin()));

  select pg_get_functiondef(to_regprocedure('public.pod_save_listing(jsonb,timestamp with time zone)')) into rpc_definition;
  if position(old_guard in rpc_definition)>0 then
    execute replace(rpc_definition,old_guard,'if not public.pod_is_admin() then');
  elsif rpc_definition is null or position('if not public.pod_is_admin() then' in rpc_definition)=0 then
    raise exception 'Listing RPC guard is not the expected foundation version';
  end if;
end;
$migration$;
revoke all on function public.pod_save_listing(jsonb,timestamptz) from public, anon;
grant execute on function public.pod_save_listing(jsonb,timestamptz) to authenticated;
commit;
