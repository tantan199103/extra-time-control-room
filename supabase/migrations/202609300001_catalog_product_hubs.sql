-- Align legacy Header menus with the broad product-intent catalogue hubs.
-- The update is deliberately narrow: only known old jersey destinations are
-- rewritten, and Hats is added only beside that legacy Shop branch.
begin;

with legacy_jersey_items as (
  select item.id, item.menu_id, item.parent_id
  from public.pod_menu_items item
  join public.pod_menus menu on menu.id = item.menu_id
  where menu.location = 'HEADER'
    and lower(item.label) = 'jerseys'
    and item.target in ('/collection?type=jerseys', '/category/football-jerseys')
)
update public.pod_menu_items item
set target = '/category/jerseys',
    link_type = 'PAGE',
    sort_order = 1
from legacy_jersey_items legacy
where item.id = legacy.id;

insert into public.pod_menu_items (
  id, menu_id, parent_id, label, target, link_type, visible, sort_order,
  image_mode, image_url, image_alt, settings
)
select
  'catalog-hats-' || substr(md5(legacy.menu_id || ':' || coalesce(legacy.parent_id, 'root')), 1, 12),
  legacy.menu_id,
  legacy.parent_id,
  'Hats & headwear',
  '/category/hats',
  'PAGE',
  true,
  2,
  'AUTO',
  '',
  '',
  '{}'::jsonb
from (
  select distinct item.menu_id, item.parent_id
  from public.pod_menu_items item
  join public.pod_menus menu on menu.id = item.menu_id
  where menu.location = 'HEADER'
    and lower(item.label) = 'jerseys'
    and item.target = '/category/jerseys'
) legacy
where not exists (
  select 1
  from public.pod_menu_items existing
  where existing.menu_id = legacy.menu_id
    and existing.parent_id is not distinct from legacy.parent_id
    and existing.target = '/category/hats'
);

update public.pod_menu_items accessory
set sort_order = 3
where lower(accessory.label) = 'accessories'
  and exists (
    select 1
    from public.pod_menu_items jerseys
    join public.pod_menus menu on menu.id = jerseys.menu_id
    where menu.location = 'HEADER'
      and jerseys.menu_id = accessory.menu_id
      and jerseys.parent_id is not distinct from accessory.parent_id
      and jerseys.target = '/category/jerseys'
  );

update public.pod_menus menu
set updated_at = now()
where menu.location = 'HEADER'
  and exists (
    select 1 from public.pod_menu_items item
    where item.menu_id = menu.id
      and item.target in ('/category/jerseys', '/category/hats')
  );

commit;
