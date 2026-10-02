-- Artwork-first Custom flow: private assets, durable jobs and verified drafts.
-- The service runtime owns all writes; the browser only receives expiring
-- signed URLs and opaque IDs.
begin;

create table if not exists public.pod_artwork_assets (
  id text primary key,
  session_hash text not null,
  storage_key text not null unique,
  mime text not null check (mime in ('image/png','image/jpeg','image/webp')),
  expected_mime text check (expected_mime is null or expected_mime in ('image/png','image/jpeg','image/webp')),
  expected_size bigint check (expected_size is null or expected_size > 0),
  width_px integer,
  height_px integer,
  dpi numeric,
  sha256 text,
  source text not null default 'upload' check (source in ('upload','ai-generated','remix','cleanup')),
  consent boolean not null default false,
  verified boolean not null default false,
  scan_status text not null default 'pending' check (scan_status in ('pending','clean','infected','failed','skipped')),
  scan_id text,
  verified_at timestamptz,
  updated_at timestamptz not null default now(),
  error text,
  job_id text,
  variant_index integer,
  created_at timestamptz not null default now(),
  expires_at timestamptz not null default now() + interval '30 days'
);
create index if not exists pod_artwork_assets_session_created_idx on public.pod_artwork_assets(session_hash, created_at desc);

alter table public.pod_artwork_assets add column if not exists expected_mime text;
alter table public.pod_artwork_assets add column if not exists expected_size bigint;
alter table public.pod_artwork_assets add column if not exists scan_status text not null default 'pending';
alter table public.pod_artwork_assets add column if not exists scan_id text;
alter table public.pod_artwork_assets add column if not exists verified_at timestamptz;
alter table public.pod_artwork_assets add column if not exists updated_at timestamptz not null default now();
alter table public.pod_artwork_assets add column if not exists error text;
alter table public.pod_artwork_assets add column if not exists job_id text;
alter table public.pod_artwork_assets add column if not exists variant_index integer;

create table if not exists public.pod_artwork_jobs (
  id text primary key,
  session_hash text not null,
  type text not null check (type in ('generate','redesign','remix','inpaint','upscale','removeBackground','cleanup')),
  prompt text not null default '',
  style text not null default '',
  source_asset_ids jsonb not null default '[]'::jsonb,
  params jsonb not null default '{}'::jsonb,
  status text not null default 'queued' check (status in ('queued','running','succeeded','failed','cancelled')),
  variants jsonb not null default '[]'::jsonb,
  error text,
  idempotency_key text,
  attempts integer not null default 0 check (attempts >= 0),
  max_attempts integer not null default 3 check (max_attempts between 1 and 10),
  worker_id text,
  locked_at timestamptz,
  provider_job_id text,
  retry_after timestamptz,
  created_at timestamptz not null default now(),
  updated_at timestamptz not null default now()
);
create index if not exists pod_artwork_jobs_session_created_idx on public.pod_artwork_jobs(session_hash, created_at desc);
create index if not exists pod_artwork_jobs_queue_idx on public.pod_artwork_jobs(status, created_at);
create unique index if not exists pod_artwork_jobs_session_idempotency_idx on public.pod_artwork_jobs(session_hash, idempotency_key) where idempotency_key is not null;

alter table public.pod_artwork_jobs add column if not exists idempotency_key text;
alter table public.pod_artwork_jobs add column if not exists attempts integer not null default 0;
alter table public.pod_artwork_jobs add column if not exists max_attempts integer not null default 3;
alter table public.pod_artwork_jobs add column if not exists worker_id text;
alter table public.pod_artwork_jobs add column if not exists locked_at timestamptz;
alter table public.pod_artwork_jobs add column if not exists provider_job_id text;

alter table public.pod_artwork_assets enable row level security;
alter table public.pod_artwork_jobs enable row level security;
drop policy if exists "admins can read artwork assets" on public.pod_artwork_assets;
create policy "admins can read artwork assets" on public.pod_artwork_assets for select to authenticated using ((select public.pod_is_admin()));
drop policy if exists "admins can read artwork jobs" on public.pod_artwork_jobs;
create policy "admins can read artwork jobs" on public.pod_artwork_jobs for select to authenticated using ((select public.pod_is_admin()));

insert into storage.buckets(id,name,public,file_size_limit,allowed_mime_types)
values('customer-artwork','customer-artwork',false,15728640,array['image/png','image/jpeg','image/webp'])
on conflict(id) do update set public=false,file_size_limit=excluded.file_size_limit,allowed_mime_types=excluded.allowed_mime_types;

commit;
