-- Complete representative media for the legacy Product page row so the
-- Theme Studio and menu AUTO thumbnails have a usable preview immediately.
-- Only an empty legacy value is changed.
begin;

update public.pod_pages
set representative_image = '/assets/jersey-black.webp',
    representative_alt = 'Product detail preview',
    updated_at = now()
where id = 'product'
  and coalesce(representative_image, '') = '';

commit;
