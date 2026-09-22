-- Listing deletion stored procedure
-- Deletes a listing and cleans up associated child rows atomically.
-- Requires scoped admin authority (pod_is_admin).

create or replace function public.pod_delete_listing(target_id text)
returns boolean language plpgsql security invoker set search_path = '' as $$
begin
  if not public.pod_is_admin() then
    raise exception 'Admin permission is required' using errcode = '42501';
  end if;
  if coalesce(trim(target_id), '') = '' then
    raise exception 'Listing ID is required';
  end if;

  delete from public.pod_collection_products where product_id = target_id;
  delete from public.pod_product_revisions where product_id = target_id;
  delete from public.pod_product_variants where product_id = target_id;
  delete from public.pod_product_options where product_id = target_id;
  delete from public.pod_products where id = target_id;

  return true;
end;
$$;

revoke all on function public.pod_delete_listing(text) from public, anon;
grant execute on function public.pod_delete_listing(text) to authenticated;
