-- Let trusted catalogue/admin saves attach large imported catalogues without
-- weakening the collection payload or per-listing validation rules.
begin;

do $migration$
declare
  current_definition text;
  expanded_definition text;
  old_guard constant text := 'jsonb_array_length(coalesce(collection_row->''products'',''[]''::jsonb))>500';
  new_guard constant text := 'jsonb_array_length(coalesce(collection_row->''products'',''[]''::jsonb))>5000';
begin
  select pg_get_functiondef(to_regprocedure('public.pod_save_collections(jsonb)'))
    into current_definition;
  if current_definition is null then
    raise exception 'pod_save_collections(jsonb) must exist before applying the large catalogue migration';
  end if;
  expanded_definition := replace(current_definition, old_guard, new_guard);
  if expanded_definition = current_definition and position(new_guard in current_definition) = 0 then
    raise exception 'pod_save_collections product guard has an unexpected definition';
  end if;
  if expanded_definition <> current_definition then execute expanded_definition; end if;
end;
$migration$;

revoke all on function public.pod_save_collections(jsonb) from public, anon;
grant execute on function public.pod_save_collections(jsonb) to authenticated, service_role;

commit;
