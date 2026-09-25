-- Keep public discovery queries predictable as the catalogue grows. These
-- partial indexes stay small because drafts and archived listings are not in
-- the customer-facing read path.

create index if not exists pod_products_published_updated_id_idx
  on public.pod_products (updated_at desc, id asc)
  where status = 'PUBLISHED';

create index if not exists pod_products_published_price_id_idx
  on public.pod_products (price, id)
  where status = 'PUBLISHED';

create index if not exists pod_products_published_group_updated_idx
  on public.pod_products (product_group, updated_at desc, id asc)
  where status = 'PUBLISHED';

create index if not exists pod_products_published_league_team_updated_idx
  on public.pod_products ((taxonomy ->> 'league'), (taxonomy ->> 'team'), updated_at desc, id asc)
  where status = 'PUBLISHED';

create index if not exists pod_products_published_brand_updated_idx
  on public.pod_products ((taxonomy ->> 'brand'), updated_at desc, id asc)
  where status = 'PUBLISHED';

analyze public.pod_products;
