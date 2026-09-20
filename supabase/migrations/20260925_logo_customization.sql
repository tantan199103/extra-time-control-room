-- Customer-supplied logo workflow. Source logos remain private customer
-- references; exact and AI-finished previews remain private preview assets.
begin;

alter table public.pod_ai_preview_jobs
  add column if not exists kind text not null default 'TEXT_EXACT',
  add column if not exists source_asset_path text,
  add column if not exists metadata jsonb not null default '{}'::jsonb;

alter table public.pod_ai_preview_jobs
  drop constraint if exists pod_ai_preview_jobs_kind_check;
alter table public.pod_ai_preview_jobs
  add constraint pod_ai_preview_jobs_kind_check
  check (kind in ('TEXT_EXACT','LOGO_EXACT','LOGO_AI_FINISH'));

create index if not exists pod_ai_preview_jobs_product_kind_created_idx
  on public.pod_ai_preview_jobs(product_id, kind, created_at desc);

insert into storage.buckets(id,name,public,file_size_limit,allowed_mime_types)
values('customer-references','customer-references',false,10485760,array['image/png','image/jpeg','image/webp'])
on conflict(id) do update
  set public=false,
      file_size_limit=excluded.file_size_limit,
      allowed_mime_types=excluded.allowed_mime_types;

commit;
