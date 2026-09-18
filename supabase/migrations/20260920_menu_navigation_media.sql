-- Navigation tree + representative media.
-- Menu thumbnails are overrides only; AUTO mode is resolved from the linked
-- product, collection or page at read time so catalogue changes propagate.
begin;

alter table public.pod_pages add column if not exists representative_image text not null default '';
alter table public.pod_pages add column if not exists representative_alt text not null default '';
alter table public.pod_menu_items add column if not exists image_mode text not null default 'AUTO';
alter table public.pod_menu_items add column if not exists image_url text not null default '';
alter table public.pod_menu_items add column if not exists image_alt text not null default '';

alter table public.pod_menu_items drop constraint if exists pod_menu_items_image_mode_check;
alter table public.pod_menu_items add constraint pod_menu_items_image_mode_check
  check (image_mode in ('AUTO', 'CUSTOM', 'NONE'));

update public.pod_pages set representative_image='/assets/hero-tunnel.webp', representative_alt='Extra Time storefront hero'
where path in ('/', '/shop', '/collection') and coalesce(representative_image,'')='';
update public.pod_pages set representative_image='/assets/jersey-white.webp', representative_alt='Custom jersey preview'
where path in ('/custom', '/studio', '/membership') and coalesce(representative_image,'')='';
update public.pod_pages set representative_image='/assets/jersey-oxblood.webp', representative_alt='The archive'
where path='/vault' and coalesce(representative_image,'')='';
update public.pod_pages set representative_image='/assets/editorial-player.webp', representative_alt='Extra Time editorial'
where path in ('/moments', '/players', '/journal') and coalesce(representative_image,'')='';

create or replace function public.pod_insert_menu_item_tree(
  p_menu_id text,
  p_item jsonb,
  p_parent_id text,
  p_sort_order integer,
  p_depth integer
)
returns void
language plpgsql
security invoker
set search_path = ''
as $$
declare
  child_row jsonb;
  child_index integer := 0;
  v_id text := p_item->>'id';
  v_type text := upper(coalesce(p_item->>'type', p_item->>'link_type', 'PAGE'));
  v_mode text := upper(coalesce(p_item->>'imageMode', p_item->>'image_mode', 'AUTO'));
  v_children jsonb := coalesce(p_item->'children', '[]'::jsonb);
begin
  if not public.pod_is_admin() then raise exception 'Admin permission required'; end if;
  if p_depth > 3 then raise exception 'Menu nesting is limited to four levels'; end if;
  if coalesce(v_id, '')='' then raise exception 'Every menu item needs an ID'; end if;
  if jsonb_typeof(v_children) is distinct from 'array' then raise exception 'Menu children must be an array'; end if;
  if v_type not in ('PAGE','COLLECTION','PRODUCT','ACTION','EXTERNAL') then raise exception 'Invalid menu link type'; end if;
  if v_mode not in ('AUTO','CUSTOM','NONE') then raise exception 'Invalid menu image mode'; end if;

  insert into public.pod_menu_items(
    id, menu_id, parent_id, label, target, link_type, visible, sort_order,
    image_mode, image_url, image_alt, settings
  ) values (
    v_id, p_menu_id, p_parent_id,
    left(coalesce(p_item->>'label','Link'),120),
    left(coalesce(p_item->>'target','/'),500),
    v_type,
    coalesce((p_item->>'visible')::boolean,true),
    coalesce((p_item->>'sortOrder')::integer,p_sort_order),
    v_mode,
    left(coalesce(p_item->>'imageUrl',p_item->>'image_url',''),2000),
    left(coalesce(p_item->>'imageAlt',p_item->>'image_alt',''),240),
    case when jsonb_typeof(p_item->'settings')='object' then p_item->'settings' else '{}'::jsonb end
  );

  for child_row in select value from jsonb_array_elements(v_children) loop
    perform public.pod_insert_menu_item_tree(p_menu_id, child_row, v_id, child_index, p_depth + 1);
    child_index := child_index + 1;
  end loop;
end;
$$;

create or replace function public.pod_save_menus(menu_payload jsonb)
returns jsonb
language plpgsql
security invoker
set search_path = ''
as $$
declare
  menu_row jsonb;
  item_row jsonb;
  root_index integer := 0;
  v_menu_id text;
  v_location text;
  v_status text;
begin
  if not public.pod_is_admin() then raise exception 'Admin permission required'; end if;
  if jsonb_typeof(menu_payload) is distinct from 'array' or jsonb_array_length(menu_payload)>30 then raise exception 'Invalid menu payload'; end if;
  for menu_row in select value from jsonb_array_elements(menu_payload) loop
    v_menu_id := menu_row->>'id';
    v_location := upper(coalesce(menu_row->>'location','MOBILE_DRAWER'));
    v_status := upper(coalesce(menu_row->>'status','DRAFT'));
    if coalesce(v_menu_id,'')='' or jsonb_typeof(menu_row->'items') is distinct from 'array' then raise exception 'Invalid menu'; end if;
    if jsonb_array_length(coalesce(menu_row->'items','[]'::jsonb))>100 then raise exception 'Menu item limit exceeded'; end if;
    if v_status not in ('PUBLISHED','DRAFT','ARCHIVED') then raise exception 'Invalid menu status'; end if;
    insert into public.pod_menus(id,name,location,status,updated_at)
    values(v_menu_id,left(coalesce(menu_row->>'name','Untitled menu'),120),v_location,v_status,now())
    on conflict(id) do update set name=excluded.name,location=excluded.location,status=excluded.status,updated_at=now();
    delete from public.pod_menu_items where menu_id=v_menu_id;
    root_index := 0;
    for item_row in select value from jsonb_array_elements(coalesce(menu_row->'items','[]'::jsonb)) loop
      perform public.pod_insert_menu_item_tree(v_menu_id,item_row,null,root_index,0);
      root_index := root_index + 1;
    end loop;
    insert into public.pod_audit_logs(actor_id,entity_type,entity_id,action,snapshot)
    values(auth.uid(),'menu',v_menu_id,'SAVE',menu_row);
  end loop;
  return menu_payload;
end;
$$;

revoke all on function public.pod_insert_menu_item_tree(text,jsonb,text,integer,integer) from public,anon;
grant execute on function public.pod_insert_menu_item_tree(text,jsonb,text,integer,integer) to authenticated;
revoke all on function public.pod_save_menus(jsonb) from public,anon;
grant execute on function public.pod_save_menus(jsonb) to authenticated;

-- Keep the existing Theme Studio API compatible while persisting page media.
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
    insert into public.pod_audit_logs(actor_id,entity_type,entity_id,action,snapshot)
    values(auth.uid(),'theme',v_theme_id,'SAVE_DRAFT',theme_payload);
    return jsonb_build_object('id',v_theme_id,'status','DRAFT','version',v_draft_version,'definition',v_definition);
  end if;

  insert into public.pod_themes(id,name,status,version,tokens,definition,updated_at)
  values(v_theme_id,left(coalesce(theme_payload->>'name','Store theme'),160),v_status,v_version,coalesce(theme_payload->'tokens','{}'::jsonb),v_definition,now())
  on conflict(id) do update set name=excluded.name,status=excluded.status,version=excluded.version,tokens=excluded.tokens,definition=excluded.definition,updated_at=now();
  update public.pod_pages set status='ARCHIVED' where pod_pages.theme_id=v_theme_id;
  for page_row in select value from jsonb_array_elements(coalesce(theme_payload->'pages','[]'::jsonb)) loop
    v_layout:=case when jsonb_typeof(page_row->'layout')='array' then page_row->'layout' else '[]'::jsonb end;
    insert into public.pod_pages(id,theme_id,name,path,status,layout,representative_image,representative_alt,seo,updated_at)
    values(page_row->>'id',v_theme_id,left(coalesce(page_row->>'name','Page'),160),page_row->>'path',coalesce(page_row->>'status','PUBLISHED'),v_layout,left(coalesce(page_row->>'representativeImage',page_row->>'representative_image',''),2000),left(coalesce(page_row->>'representativeAlt',page_row->>'representative_alt',''),240),coalesce(page_row->'seo','{}'::jsonb),now())
    on conflict(id) do update set name=excluded.name,path=excluded.path,status=excluded.status,layout=excluded.layout,representative_image=excluded.representative_image,representative_alt=excluded.representative_alt,seo=excluded.seo,updated_at=now();
  end loop;
  insert into public.pod_theme_versions(id,theme_id,version,definition,changelog,created_by)
  values(v_theme_id||'-'||v_version,v_theme_id,v_version,v_definition,'Theme published from Control Room',auth.uid())
  on conflict(theme_id,version) do update set definition=excluded.definition,changelog=excluded.changelog,created_by=excluded.created_by,created_at=now();
  insert into public.pod_audit_logs(actor_id,entity_type,entity_id,action,snapshot)
  values(auth.uid(),'theme',v_theme_id,'PUBLISH',theme_payload);
  return (select to_jsonb(theme) from public.pod_themes theme where theme.id=v_theme_id);
end;
$$;

revoke all on function public.pod_save_theme(jsonb) from public,anon;
grant execute on function public.pod_save_theme(jsonb) to authenticated;

commit;
