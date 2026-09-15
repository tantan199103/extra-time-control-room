-- Extra Time admin schema. Run in the Supabase SQL editor before connecting VITE_SUPABASE_*.

create table if not exists public.templates (
  id text primary key,
  name text not null,
  slug text unique not null,
  status text not null default 'DRAFT' check (status in ('LIVE', 'DRAFT', 'ARCHIVED')),
  version text not null default 'v1.0',
  artwork_lock_percent integer not null default 70 check (artwork_lock_percent between 0 and 100),
  description text not null default '',
  locked_layers jsonb not null default '[]'::jsonb,
  editable_slots jsonb not null default '[]'::jsonb,
  cover_image text,
  created_at timestamptz not null default now(),
  updated_at timestamptz not null default now()
);

create table if not exists public.products (
  id text primary key,
  handle text unique not null,
  title text not null,
  subtitle text not null default '',
  description text not null default '',
  price numeric(10,2) not null default 0,
  compare_at numeric(10,2),
  status text not null default 'DRAFT' check (status in ('PUBLISHED', 'DRAFT', 'ARCHIVED')),
  badge text,
  type text not null default 'READY TO SHIP',
  template_id text references public.templates(id) on update cascade on delete set null,
  image text,
  color text,
  artwork_lock integer not null default 100 check (artwork_lock between 0 and 100),
  personalization jsonb not null default '[]'::jsonb,
  inventory integer not null default 0,
  seo jsonb not null default '{}'::jsonb,
  created_at timestamptz not null default now(),
  updated_at timestamptz not null default now()
);

create table if not exists public.store_settings (
  key text primary key,
  value jsonb not null default '{}'::jsonb,
  updated_at timestamptz not null default now()
);

create or replace function public.touch_updated_at()
returns trigger language plpgsql as $$
begin
  new.updated_at = now();
  return new;
end;
$$;

drop trigger if exists templates_touch_updated_at on public.templates;
create trigger templates_touch_updated_at before update on public.templates
for each row execute function public.touch_updated_at();

drop trigger if exists products_touch_updated_at on public.products;
create trigger products_touch_updated_at before update on public.products
for each row execute function public.touch_updated_at();

alter table public.templates enable row level security;
alter table public.products enable row level security;
alter table public.store_settings enable row level security;

-- Admin writes require app_metadata.role = 'admin'. Public storefront reads only published products.
create policy "public can read published products" on public.products
  for select using (status = 'PUBLISHED');
create policy "admins can manage products" on public.products
  for all using ((auth.jwt() -> 'app_metadata' ->> 'role') = 'admin')
  with check ((auth.jwt() -> 'app_metadata' ->> 'role') = 'admin');
create policy "public can read live templates" on public.templates
  for select using (status = 'LIVE');
create policy "admins can manage templates" on public.templates
  for all using ((auth.jwt() -> 'app_metadata' ->> 'role') = 'admin')
  with check ((auth.jwt() -> 'app_metadata' ->> 'role') = 'admin');
create policy "admins can manage settings" on public.store_settings
  for all using ((auth.jwt() -> 'app_metadata' ->> 'role') = 'admin')
  with check ((auth.jwt() -> 'app_metadata' ->> 'role') = 'admin');

insert into public.templates (id, name, slug, status, version, artwork_lock_percent, description, locked_layers, editable_slots, cover_image)
values ('touchline-04', 'TOUCHLINE / DESIGN 001', 'touchline-04', 'LIVE', 'v1.4', 70,
  'A fixed football memory system with a small personal layer.',
  '["TYPOGRAPHY", "COMPOSITION", "TEXTURE", "EFFECTS", "HIERARCHY"]'::jsonb,
  '["NAME + NUMBER", "TEAM / CITY", "YEAR", "COLOUR", "OPTIONAL PHOTO"]'::jsonb,
  '/assets/jersey-white.webp')
on conflict (id) do nothing;

insert into public.templates (id, name, slug, status, version, artwork_lock_percent, description, locked_layers, editable_slots, cover_image)
values ('after-90-core', '90+ / CORE', 'after-90-core', 'LIVE', 'v2.0', 100,
  'The locked collection system for ready-to-ship drops.',
  '["TYPOGRAPHY", "COMPOSITION", "TEXTURE", "EFFECTS", "HIERARCHY"]'::jsonb,
  '[]'::jsonb,
  '/assets/jersey-black.webp')
on conflict (id) do nothing;
