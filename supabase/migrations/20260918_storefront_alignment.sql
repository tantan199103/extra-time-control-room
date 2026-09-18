-- Storefront alignment: keep Theme Studio drafts separate from the live theme.
begin;

create or replace function public.pod_save_theme(theme_payload jsonb)
returns jsonb
language plpgsql
security invoker
set search_path = ''
as $$
declare
  page_row jsonb;
  v_theme_id text := theme_payload->>'id';
  v_definition jsonb;
  v_layout jsonb;
  v_status text := coalesce(theme_payload->>'status','DRAFT');
  v_version text := coalesce(theme_payload->>'version','v1.0');
  v_draft_version text;
begin
  if not public.pod_is_admin() then raise exception 'Admin permission required'; end if;
  if coalesce(v_theme_id,'')='' then raise exception 'Theme ID required'; end if;
  if v_status not in ('DRAFT','PUBLISHED','ARCHIVED') then raise exception 'Invalid theme status'; end if;
  v_definition:=jsonb_build_object('blocks',coalesce(theme_payload->'blocks','[]'::jsonb),'content',coalesce(theme_payload->'content','{}'::jsonb),'pages',coalesce(theme_payload->'pages','[]'::jsonb));

  if v_status='DRAFT' then
    v_draft_version:=v_version||'-draft-'||to_char(clock_timestamp(),'YYYYMMDDHH24MISSMS');
    insert into public.pod_theme_versions(id,theme_id,version,definition,changelog,created_by)
    values(v_theme_id||'-'||v_draft_version,v_theme_id,v_draft_version,v_definition,'Draft saved from Control Room',auth.uid());
    insert into public.pod_audit_logs(actor_id,entity_type,entity_id,action,snapshot) values(auth.uid(),'theme',v_theme_id,'SAVE_DRAFT',theme_payload);
    return jsonb_build_object('id',v_theme_id,'status','DRAFT','version',v_draft_version,'definition',v_definition);
  end if;

  insert into public.pod_themes(id,name,status,version,tokens,definition,updated_at)
  values(v_theme_id,left(coalesce(theme_payload->>'name','Store theme'),160),v_status,v_version,coalesce(theme_payload->'tokens','{}'::jsonb),v_definition,now())
  on conflict(id) do update set name=excluded.name,status=excluded.status,version=excluded.version,tokens=excluded.tokens,definition=excluded.definition,updated_at=now();
  update public.pod_pages set status='ARCHIVED' where pod_pages.theme_id=v_theme_id;
  for page_row in select value from jsonb_array_elements(coalesce(theme_payload->'pages','[]'::jsonb)) loop
    v_layout:=case when jsonb_typeof(page_row->'layout')='array' then page_row->'layout' else '[]'::jsonb end;
    insert into public.pod_pages(id,theme_id,name,path,status,layout,seo,updated_at)
    values(page_row->>'id',v_theme_id,left(coalesce(page_row->>'name','Page'),160),page_row->>'path',coalesce(page_row->>'status','PUBLISHED'),v_layout,coalesce(page_row->'seo','{}'::jsonb),now())
    on conflict(id) do update set name=excluded.name,path=excluded.path,status=excluded.status,layout=excluded.layout,seo=excluded.seo,updated_at=now();
  end loop;
  insert into public.pod_theme_versions(id,theme_id,version,definition,changelog,created_by)
  values(v_theme_id||'-'||v_version,v_theme_id,v_version,v_definition,'Theme published from Control Room',auth.uid())
  on conflict(theme_id,version) do update set definition=excluded.definition,changelog=excluded.changelog,created_by=excluded.created_by,created_at=now();
  insert into public.pod_audit_logs(actor_id,entity_type,entity_id,action,snapshot) values(auth.uid(),'theme',v_theme_id,'PUBLISH',theme_payload);
  return (select to_jsonb(theme) from public.pod_themes theme where theme.id=v_theme_id);
end;
$$;

revoke all on function public.pod_save_theme(jsonb) from public,anon;
grant execute on function public.pod_save_theme(jsonb) to authenticated;

commit;
