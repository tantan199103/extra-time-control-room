-- 20260926_admin_query_performance_indexes.sql
-- Optimizes foreign key joins and sorting for pod_products and related tables to prevent PostgreSQL statement timeout on large joins.

create index if not exists pod_product_variants_product_id_idx on public.pod_product_variants(product_id);
create index if not exists pod_products_updated_at_idx on public.pod_products(updated_at desc);
create index if not exists pod_menu_items_menu_id_idx on public.pod_menu_items(menu_id);
