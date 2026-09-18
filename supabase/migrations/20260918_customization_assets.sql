-- Stable references for customer and AI assets. Signed URLs remain short-lived
-- presentation values; these columns are the durable source of truth.
begin;

alter table public.pod_customization_orders add column if not exists asset_refs jsonb not null default '{}'::jsonb;
alter table public.pod_customization_orders add column if not exists ai_preview_id text;
alter table public.pod_customization_orders add column if not exists review_note text not null default '';
create index if not exists pod_customization_orders_status_created_idx on public.pod_customization_orders(status, created_at desc);

commit;
