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
  definition jsonb not null default '{}'::jsonb,
  cover_image text,
  created_at timestamptz not null default now(),
  updated_at timestamptz not null default now()
);

alter table public.templates add column if not exists definition jsonb not null default '{}'::jsonb;

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
  template_version text,
  image text,
  color text,
  artwork_lock integer not null default 100 check (artwork_lock between 0 and 100),
  personalization jsonb not null default '[]'::jsonb,
  inventory integer not null default 0,
  seo jsonb not null default '{}'::jsonb,
  created_at timestamptz not null default now(),
  updated_at timestamptz not null default now()
);

alter table public.products add column if not exists template_version text;

create table if not exists public.template_versions (
  id text primary key,
  template_id text not null references public.templates(id) on update cascade on delete cascade,
  version text not null,
  definition jsonb not null,
  changelog text not null default '',
  created_by uuid references auth.users(id) on delete set null,
  created_at timestamptz not null default now(),
  unique (template_id, version)
);

create table if not exists public.city_presets (
  id text primary key,
  city text not null,
  region text not null default '',
  code text not null,
  coordinates jsonb not null default '{}'::jsonb,
  palette jsonb not null default '{}'::jsonb,
  icons jsonb not null default '[]'::jsonb,
  signature text not null default '',
  pattern_asset text,
  created_at timestamptz not null default now(),
  updated_at timestamptz not null default now()
);

create table if not exists public.customization_orders (
  id text primary key,
  product_id text references public.products(id) on update cascade on delete set null,
  template_id text not null references public.templates(id) on update cascade on delete restrict,
  template_version text not null,
  payload jsonb not null,
  preview_front_url text,
  preview_back_url text,
  print_front_url text,
  print_back_url text,
  status text not null default 'PREVIEW' check (status in ('PREVIEW','CONFIRMED','RENDERING','READY','CANCELLED')),
  customer_email text,
  created_at timestamptz not null default now(),
  updated_at timestamptz not null default now()
);

create table if not exists public.render_jobs (
  id text primary key,
  order_id text references public.customization_orders(id) on update cascade on delete set null,
  template_id text not null references public.templates(id) on update cascade on delete restrict,
  template_version text not null,
  payload jsonb not null,
  status text not null default 'QUEUED' check (status in ('QUEUED','PROCESSING','COMPLETED','FAILED')),
  front_url text,
  back_url text,
  error_message text,
  created_at timestamptz not null default now(),
  completed_at timestamptz
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

drop trigger if exists city_presets_touch_updated_at on public.city_presets;
create trigger city_presets_touch_updated_at before update on public.city_presets
for each row execute function public.touch_updated_at();

alter table public.templates enable row level security;
alter table public.products enable row level security;
alter table public.store_settings enable row level security;
alter table public.template_versions enable row level security;
alter table public.city_presets enable row level security;
alter table public.customization_orders enable row level security;
alter table public.render_jobs enable row level security;

-- Admin writes require app_metadata.role = 'admin'. Public storefront reads only published products.
drop policy if exists "public can read published products" on public.products;
drop policy if exists "admins can manage products" on public.products;
drop policy if exists "public can read live templates" on public.templates;
drop policy if exists "admins can manage templates" on public.templates;
drop policy if exists "admins can manage settings" on public.store_settings;
drop policy if exists "public can read city presets" on public.city_presets;
drop policy if exists "admins can manage city presets" on public.city_presets;
drop policy if exists "admins can read template versions" on public.template_versions;
drop policy if exists "admins can manage template versions" on public.template_versions;
drop policy if exists "customers can create customization orders" on public.customization_orders;
drop policy if exists "admins can manage customization orders" on public.customization_orders;
drop policy if exists "admins can read render jobs" on public.render_jobs;
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
create policy "public can read city presets" on public.city_presets
  for select using (true);
create policy "admins can manage city presets" on public.city_presets
  for all using ((auth.jwt() -> 'app_metadata' ->> 'role') = 'admin')
  with check ((auth.jwt() -> 'app_metadata' ->> 'role') = 'admin');
create policy "admins can read template versions" on public.template_versions
  for select using ((auth.jwt() -> 'app_metadata' ->> 'role') = 'admin');
create policy "admins can manage template versions" on public.template_versions
  for all using ((auth.jwt() -> 'app_metadata' ->> 'role') = 'admin')
  with check ((auth.jwt() -> 'app_metadata' ->> 'role') = 'admin');
create policy "customers can create customization orders" on public.customization_orders
  for insert with check (jsonb_typeof(payload) = 'object');
create policy "admins can manage customization orders" on public.customization_orders
  for all using ((auth.jwt() -> 'app_metadata' ->> 'role') = 'admin')
  with check ((auth.jwt() -> 'app_metadata' ->> 'role') = 'admin');
create policy "admins can read render jobs" on public.render_jobs
  for select using ((auth.jwt() -> 'app_metadata' ->> 'role') = 'admin');

insert into public.templates (id, name, slug, status, version, artwork_lock_percent, description, locked_layers, editable_slots, cover_image)
values ('touchline-04', 'TOUCHLINE / DESIGN 001', 'touchline-04', 'LIVE', 'v1.4', 70,
  'A fixed football memory system with a small personal layer.',
  '["TYPOGRAPHY", "COMPOSITION", "TEXTURE", "EFFECTS", "HIERARCHY"]'::jsonb,
  '["NAME + NUMBER", "TEAM / CITY", "YEAR", "COLOUR", "OPTIONAL PHOTO"]'::jsonb,
  '/assets/jersey-white.webp')
on conflict (id) do nothing;

update public.templates set definition = jsonb_build_object('templateId', id, 'version', version, 'artworkLock', artwork_lock_percent, 'lockedLayers', locked_layers, 'editableSlots', editable_slots) where definition = '{}'::jsonb;

insert into public.templates (id, name, slug, status, version, artwork_lock_percent, description, locked_layers, editable_slots, cover_image)
values ('after-90-core', '90+ / CORE', 'after-90-core', 'LIVE', 'v2.0', 100,
  'The locked collection system for ready-to-ship drops.',
  '["TYPOGRAPHY", "COMPOSITION", "TEXTURE", "EFFECTS", "HIERARCHY"]'::jsonb,
  '[]'::jsonb,
  '/assets/jersey-black.webp')
on conflict (id) do nothing;

insert into public.templates (id, name, slug, status, version, artwork_lock_percent, description, locked_layers, editable_slots, cover_image)
values
  ('venom-v1', 'VENOM', 'venom-v1', 'LIVE', '1.2.0', 74, 'Pressure becomes identity.', '["TYPOGRAPHY", "COMPOSITION", "TEXTURE", "EFFECTS", "HIERARCHY"]'::jsonb, '["BACK_NAME", "BACK_NUMBER", "MOTTO", "ACCENT_COLOR", "METAL_ACCENT", "OPTIONAL_PHOTO"]'::jsonb, '/assets/jersey-black.webp'),
  ('hometown-v1', 'HOMETOWN HERO', 'hometown-v1', 'LIVE', '1.0.0', 70, 'Your city already knows the rest.', '["TYPOGRAPHY", "COMPOSITION", "TEXTURE", "EFFECTS", "HIERARCHY"]'::jsonb, '["BACK_NAME", "BACK_NUMBER", "CITY", "YEAR", "OPTIONAL_PHOTO"]'::jsonb, '/assets/hero-tunnel.webp'),
  ('legacy-v1', 'MY LEGACY', 'legacy-v1', 'LIVE', '1.1.0', 68, 'A career written into the garment.', '["TYPOGRAPHY", "COMPOSITION", "TEXTURE", "EFFECTS", "HIERARCHY"]'::jsonb, '["BACK_NAME", "BACK_NUMBER", "CITY", "YEAR", "MILESTONE_1", "MILESTONE_2", "MILESTONE_3", "MOTTO", "ACCENT_COLOR", "OPTIONAL_PHOTO"]'::jsonb, '/assets/jersey-white.webp'),
  ('underdog-v1', 'UNDERDOG', 'underdog-v1', 'DRAFT', '1.0.0', 76, 'Nothing given. Everything carried.', '["TYPOGRAPHY", "COMPOSITION", "TEXTURE", "EFFECTS", "HIERARCHY"]'::jsonb, '["BACK_NAME", "BACK_NUMBER", "YEAR", "MOTTO", "ACCENT_COLOR", "OPTIONAL_PHOTO"]'::jsonb, '/assets/editorial-player.webp'),
  ('king-v1', 'THE KING', 'king-v1', 'DRAFT', '1.0.0', 72, 'Earn the mark. Keep the years.', '["TYPOGRAPHY", "COMPOSITION", "TEXTURE", "EFFECTS", "HIERARCHY"]'::jsonb, '["BACK_NAME", "BACK_NUMBER", "CREST", "CHAMPIONSHIP_YEARS", "METAL_ACCENT", "OPTIONAL_PHOTO"]'::jsonb, '/assets/jersey-oxblood.webp')
on conflict (id) do nothing;

update public.templates set definition = jsonb_build_object('templateId', id, 'version', version, 'artworkLock', artwork_lock_percent, 'lockedLayers', locked_layers, 'editableSlots', editable_slots) where definition = '{}'::jsonb;

insert into public.template_versions (id, template_id, version, definition, changelog)
select id || '-' || version, id, version, definition, 'Initial template definition'
from public.templates
where definition <> '{}'::jsonb
on conflict (id) do nothing;

insert into public.products (id, handle, title, subtitle, description, price, compare_at, status, badge, type, template_id, image, color, artwork_lock, personalization, inventory)
values
  ('after-90', 'after-90', 'AFTER 90', 'The minutes nobody forgets.', 'The minutes nobody forgets.', 89, 110, 'PUBLISHED', 'NEW DROP', 'READY TO SHIP', 'after-90-core', '/assets/jersey-black.webp', 'Black', 100, '[]'::jsonb, 38),
  ('chalk-lines', 'chalk-lines', 'CHALK LINES', 'Every move leaves a mark.', 'Every move leaves a mark.', 92, null, 'DRAFT', 'BEST SELLER', 'READY TO SHIP', 'after-90-core', '/assets/jersey-white.webp', 'White', 100, '[]'::jsonb, 14),
  ('home-end', 'home-end', 'HOME END', 'A ground. A voice. A lifetime.', 'A ground. A voice. A lifetime.', 95, null, 'PUBLISHED', 'LOW STOCK', 'READY TO SHIP', 'after-90-core', '/assets/jersey-oxblood.webp', 'Oxblood', 100, '[]'::jsonb, 7),
  ('under-lights', 'under-lights', 'UNDER LIGHTS', 'Made for games that finish late.', 'Made for games that finish late.', 86, null, 'PUBLISHED', 'READY TO SHIP', 'READY TO SHIP', 'after-90-core', '/assets/editorial-player.webp', 'Black', 100, '[]'::jsonb, 24),
  ('the-whistle', 'the-whistle', 'THE WHISTLE', 'Before the noise begins.', 'Before the noise begins.', 99, 120, 'ARCHIVED', 'PRE-ORDER', 'READY TO SHIP', 'after-90-core', '/assets/hero-tunnel.webp', 'Black', 100, '[]'::jsonb, 0),
  ('touchline', 'touchline', 'TOUCHLINE 04', 'Designed from the view beside the pitch.', 'Designed from the view beside the pitch.', 109, null, 'PUBLISHED', 'CUSTOMIZABLE', 'PERSONALIZED', 'legacy-v1', '/assets/jersey-white.webp', 'White', 70,
    '["NAME + NUMBER", "TEAM / CITY", "YEAR", "COLOUR", "OPTIONAL PHOTO"]'::jsonb, 16)
on conflict (id) do nothing;

insert into public.city_presets (id, city, region, code, coordinates, palette, icons, signature)
values
  ('saigon-vn', 'SAIGON', 'VN', '028', '{"lat":"10.8231° N", "lng":"106.6297° E"}'::jsonb, '{"primary":"#F4D447", "secondary":"#D64232"}'::jsonb, '["river", "star", "skyline"]'::jsonb, 'Raised in Saigon'),
  ('miami-fl', 'MIAMI', 'FL', '305', '{"lat":"25.7617° N", "lng":"80.1918° W"}'::jsonb, '{"primary":"#FF6534", "secondary":"#20D9D8"}'::jsonb, '["palm", "ocean", "heron"]'::jsonb, 'Raised in Miami'),
  ('chicago-il', 'CHICAGO', 'IL', '312', '{"lat":"41.8781° N", "lng":"87.6298° W"}'::jsonb, '{"primary":"#62A8E5", "secondary":"#D22630"}'::jsonb, '["stars", "rail", "lake"]'::jsonb, 'Built by Chicago'),
  ('new-york-ny', 'NEW YORK', 'NY', '212', '{"lat":"40.7128° N", "lng":"74.0060° W"}'::jsonb, '{"primary":"#F58426", "secondary":"#006BB6"}'::jsonb, '["grid", "bridge", "skyline"]'::jsonb, 'Made in New York'),
  ('london-uk', 'LONDON', 'UK', '020', '{"lat":"51.5072° N", "lng":"0.1276° W"}'::jsonb, '{"primary":"#D22730", "secondary":"#E7E6DE"}'::jsonb, '["river", "crown", "underground"]'::jsonb, 'From London with noise')
on conflict (id) do nothing;

insert into storage.buckets (id, name, public)
values ('artwork', 'artwork', true)
on conflict (id) do nothing;
