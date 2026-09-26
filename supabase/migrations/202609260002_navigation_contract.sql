-- Bring the published navigation in line with the current Admin/storefront
-- contract when the database still contains the original four-link seed.
--
-- This is intentionally guarded. If an operator has already edited the live
-- Header menu (different item count/IDs/labels), the migration leaves it
-- alone; the Admin menu editor remains the source of truth in that case.
begin;

do $migration$
declare
  is_legacy_header boolean := false;
begin
  select
    count(*) = 7
    and count(*) filter (where id in ('main-shop','main-moments','main-players','main-vault','main-shop-all','main-shop-jerseys','main-shop-accessories')) = 7
    and count(*) filter (where id in ('main-shop','main-moments','main-players','main-vault') and parent_id is null) = 4
  into is_legacy_header
  from public.pod_menu_items
  where menu_id = 'main';

  if is_legacy_header then
    delete from public.pod_menu_items where menu_id = 'main';

    insert into public.pod_menu_items(id,menu_id,parent_id,label,target,link_type,visible,sort_order)
    values
      ('main-shop','main',null,'Shop','/shop','PAGE',true,0),
      ('main-sports','main',null,'Sports','/sports','PAGE',true,1),
      ('main-teams','main',null,'Teams','/teams','PAGE',true,2),
      ('main-custom','main',null,'Custom','/category/custom-jerseys','PAGE',true,3),
      ('main-collections','main',null,'Collections','/collections','PAGE',true,4),
      ('main-new','main',null,'New & trending','/shop?sort=NEWEST','PAGE',true,5);

    insert into public.pod_menu_items(id,menu_id,parent_id,label,target,link_type,visible,sort_order)
    values
      ('main-shop-all','main','main-shop','All gear','/shop','PAGE',true,0),
      ('main-shop-jerseys','main','main-shop','Jerseys','/category/football-jerseys','PAGE',true,1),
      ('main-shop-accessories','main','main-shop','Accessories','/category/accessories','PAGE',true,2);
  end if;

  -- The old seed stored an internal Journal route as EXTERNAL. Correct only
  -- that known legacy row; a custom external Journal URL is left untouched.
  update public.pod_menu_items
  set link_type = 'PAGE', updated_at = now()
  where id = 'footer-journal' and target = '/journal' and link_type = 'EXTERNAL';
end;
$migration$;

commit;
