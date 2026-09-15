-- Extra Time admin schema. Run in the Supabase SQL editor before connecting VITE_SUPABASE_*.

create table if not exists public.pod_templates (
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

alter table public.pod_templates add column if not exists definition jsonb not null default '{}'::jsonb;

create table if not exists public.pod_products (
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
  template_id text references public.pod_templates(id) on update cascade on delete set null,
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

alter table public.pod_products add column if not exists template_version text;

create table if not exists public.pod_template_versions (
  id text primary key,
  template_id text not null references public.pod_templates(id) on update cascade on delete cascade,
  version text not null,
  definition jsonb not null,
  changelog text not null default '',
  created_by uuid references auth.users(id) on delete set null,
  created_at timestamptz not null default now(),
  unique (template_id, version)
);

create table if not exists public.pod_city_presets (
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

create table if not exists public.pod_customization_orders (
  id text primary key,
  product_id text references public.pod_products(id) on update cascade on delete set null,
  template_id text not null references public.pod_templates(id) on update cascade on delete restrict,
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

create table if not exists public.pod_render_jobs (
  id text primary key,
  order_id text references public.pod_customization_orders(id) on update cascade on delete set null,
  template_id text not null references public.pod_templates(id) on update cascade on delete restrict,
  template_version text not null,
  payload jsonb not null,
  status text not null default 'QUEUED' check (status in ('QUEUED','PROCESSING','COMPLETED','FAILED')),
  front_url text,
  back_url text,
  error_message text,
  created_at timestamptz not null default now(),
  completed_at timestamptz
);

create table if not exists public.pod_store_settings (
  key text primary key,
  value jsonb not null default '{}'::jsonb,
  updated_at timestamptz not null default now()
);

create or replace function public.pod_touch_updated_at()
returns trigger language plpgsql as $$
begin
  new.updated_at = now();
  return new;
end;
$$;

drop trigger if exists templates_touch_updated_at on public.pod_templates;
create trigger templates_touch_updated_at before update on public.pod_templates
for each row execute function public.pod_touch_updated_at();

drop trigger if exists products_touch_updated_at on public.pod_products;
create trigger products_touch_updated_at before update on public.pod_products
for each row execute function public.pod_touch_updated_at();

drop trigger if exists city_presets_touch_updated_at on public.pod_city_presets;
create trigger city_presets_touch_updated_at before update on public.pod_city_presets
for each row execute function public.pod_touch_updated_at();

alter table public.pod_templates enable row level security;
alter table public.pod_products enable row level security;
alter table public.pod_store_settings enable row level security;
alter table public.pod_template_versions enable row level security;
alter table public.pod_city_presets enable row level security;
alter table public.pod_customization_orders enable row level security;
alter table public.pod_render_jobs enable row level security;

-- Admin writes require app_metadata.role = 'admin'. Public storefront reads only published products.
drop policy if exists "public can read published products" on public.pod_products;
drop policy if exists "admins can manage products" on public.pod_products;
drop policy if exists "public can read live templates" on public.pod_templates;
drop policy if exists "admins can manage templates" on public.pod_templates;
drop policy if exists "admins can manage settings" on public.pod_store_settings;
drop policy if exists "public can read city presets" on public.pod_city_presets;
drop policy if exists "admins can manage city presets" on public.pod_city_presets;
drop policy if exists "admins can read template versions" on public.pod_template_versions;
drop policy if exists "admins can manage template versions" on public.pod_template_versions;
drop policy if exists "customers can create customization orders" on public.pod_customization_orders;
drop policy if exists "admins can manage customization orders" on public.pod_customization_orders;
drop policy if exists "admins can read render jobs" on public.pod_render_jobs;
create policy "public can read published products" on public.pod_products
  for select using (status = 'PUBLISHED');
create policy "admins can manage products" on public.pod_products
  for all using ((auth.jwt() -> 'app_metadata' ->> 'role') = 'admin')
  with check ((auth.jwt() -> 'app_metadata' ->> 'role') = 'admin');
create policy "public can read live templates" on public.pod_templates
  for select using (status = 'LIVE');
create policy "admins can manage templates" on public.pod_templates
  for all using ((auth.jwt() -> 'app_metadata' ->> 'role') = 'admin')
  with check ((auth.jwt() -> 'app_metadata' ->> 'role') = 'admin');
create policy "admins can manage settings" on public.pod_store_settings
  for all using ((auth.jwt() -> 'app_metadata' ->> 'role') = 'admin')
  with check ((auth.jwt() -> 'app_metadata' ->> 'role') = 'admin');
create policy "public can read city presets" on public.pod_city_presets
  for select using (true);
create policy "admins can manage city presets" on public.pod_city_presets
  for all using ((auth.jwt() -> 'app_metadata' ->> 'role') = 'admin')
  with check ((auth.jwt() -> 'app_metadata' ->> 'role') = 'admin');
create policy "admins can read template versions" on public.pod_template_versions
  for select using ((auth.jwt() -> 'app_metadata' ->> 'role') = 'admin');
create policy "admins can manage template versions" on public.pod_template_versions
  for all using ((auth.jwt() -> 'app_metadata' ->> 'role') = 'admin')
  with check ((auth.jwt() -> 'app_metadata' ->> 'role') = 'admin');
create policy "customers can create customization orders" on public.pod_customization_orders
  for insert with check (jsonb_typeof(payload) = 'object');
create policy "admins can manage customization orders" on public.pod_customization_orders
  for all using ((auth.jwt() -> 'app_metadata' ->> 'role') = 'admin')
  with check ((auth.jwt() -> 'app_metadata' ->> 'role') = 'admin');
create policy "admins can read render jobs" on public.pod_render_jobs
  for select using ((auth.jwt() -> 'app_metadata' ->> 'role') = 'admin');

insert into public.pod_templates (id, name, slug, status, version, artwork_lock_percent, description, locked_layers, editable_slots, cover_image)
values ('touchline-04', 'TOUCHLINE / DESIGN 001', 'touchline-04', 'LIVE', 'v1.4', 70,
  'A fixed football memory system with a small personal layer.',
  '["TYPOGRAPHY", "COMPOSITION", "TEXTURE", "EFFECTS", "HIERARCHY"]'::jsonb,
  '["NAME + NUMBER", "TEAM / CITY", "YEAR", "COLOUR"]'::jsonb,
  '/assets/jersey-white.webp')
on conflict (id) do nothing;

update public.pod_templates set definition = jsonb_build_object('templateId', id, 'version', version, 'artworkLock', artwork_lock_percent, 'lockedLayers', locked_layers, 'editableSlots', editable_slots) where definition = '{}'::jsonb;

insert into public.pod_templates (id, name, slug, status, version, artwork_lock_percent, description, locked_layers, editable_slots, cover_image)
values ('after-90-core', '90+ / CORE', 'after-90-core', 'LIVE', 'v2.0', 100,
  'The locked collection system for ready-to-ship drops.',
  '["TYPOGRAPHY", "COMPOSITION", "TEXTURE", "EFFECTS", "HIERARCHY"]'::jsonb,
  '[]'::jsonb,
  '/assets/jersey-black.webp')
on conflict (id) do nothing;

insert into public.pod_templates (id, name, slug, status, version, artwork_lock_percent, description, locked_layers, editable_slots, cover_image)
values
  ('venom-v1', 'VENOM', 'venom-v1', 'LIVE', '1.2.0', 74, 'Pressure becomes identity.', '["TYPOGRAPHY", "COMPOSITION", "TEXTURE", "EFFECTS", "HIERARCHY"]'::jsonb, '["BACK_NAME", "BACK_NUMBER", "MOTTO", "ACCENT_COLOR", "METAL_ACCENT"]'::jsonb, '/assets/jersey-black.webp'),
  ('hometown-v1', 'HOMETOWN HERO', 'hometown-v1', 'LIVE', '1.0.0', 70, 'Your city already knows the rest.', '["TYPOGRAPHY", "COMPOSITION", "TEXTURE", "EFFECTS", "HIERARCHY"]'::jsonb, '["BACK_NAME", "BACK_NUMBER", "CITY", "YEAR"]'::jsonb, '/assets/hero-tunnel.webp'),
  ('legacy-v1', 'MY LEGACY', 'legacy-v1', 'LIVE', '1.1.0', 68, 'A career written into the garment.', '["TYPOGRAPHY", "COMPOSITION", "TEXTURE", "EFFECTS", "HIERARCHY"]'::jsonb, '["BACK_NAME", "BACK_NUMBER", "CITY", "YEAR", "MILESTONE_1", "MILESTONE_2", "MILESTONE_3", "MOTTO", "ACCENT_COLOR"]'::jsonb, '/assets/jersey-white.webp'),
  ('underdog-v1', 'UNDERDOG', 'underdog-v1', 'DRAFT', '1.0.0', 76, 'Nothing given. Everything carried.', '["TYPOGRAPHY", "COMPOSITION", "TEXTURE", "EFFECTS", "HIERARCHY"]'::jsonb, '["BACK_NAME", "BACK_NUMBER", "YEAR", "MOTTO", "ACCENT_COLOR"]'::jsonb, '/assets/editorial-player.webp'),
  ('king-v1', 'THE KING', 'king-v1', 'DRAFT', '1.0.0', 72, 'Earn the mark. Keep the years.', '["TYPOGRAPHY", "COMPOSITION", "TEXTURE", "EFFECTS", "HIERARCHY"]'::jsonb, '["BACK_NAME", "BACK_NUMBER", "CREST", "CHAMPIONSHIP_YEARS", "METAL_ACCENT"]'::jsonb, '/assets/jersey-oxblood.webp')
on conflict (id) do nothing;

update public.pod_templates set definition = jsonb_build_object('templateId', id, 'version', version, 'artworkLock', artwork_lock_percent, 'lockedLayers', locked_layers, 'editableSlots', editable_slots) where definition = '{}'::jsonb;

insert into public.pod_template_versions (id, template_id, version, definition, changelog)
select id || '-' || version, id, version, definition, 'Initial template definition'
from public.pod_templates
where definition <> '{}'::jsonb
on conflict (id) do nothing;

insert into public.pod_products (id, handle, title, subtitle, description, price, compare_at, status, badge, type, template_id, image, color, artwork_lock, personalization, inventory)
values
  ('after-90', 'after-90', 'AFTER 90', 'The minutes nobody forgets.', 'The minutes nobody forgets.', 89, 110, 'PUBLISHED', 'NEW DROP', 'READY TO SHIP', 'after-90-core', '/assets/jersey-black.webp', 'Black', 100, '[]'::jsonb, 38),
  ('chalk-lines', 'chalk-lines', 'CHALK LINES', 'Every move leaves a mark.', 'Every move leaves a mark.', 92, null, 'DRAFT', 'BEST SELLER', 'READY TO SHIP', 'after-90-core', '/assets/jersey-white.webp', 'White', 100, '[]'::jsonb, 14),
  ('home-end', 'home-end', 'HOME END', 'A ground. A voice. A lifetime.', 'A ground. A voice. A lifetime.', 95, null, 'PUBLISHED', 'LOW STOCK', 'READY TO SHIP', 'after-90-core', '/assets/jersey-oxblood.webp', 'Oxblood', 100, '[]'::jsonb, 7),
  ('under-lights', 'under-lights', 'UNDER LIGHTS', 'Made for games that finish late.', 'Made for games that finish late.', 86, null, 'PUBLISHED', 'READY TO SHIP', 'READY TO SHIP', 'after-90-core', '/assets/editorial-player.webp', 'Black', 100, '[]'::jsonb, 24),
  ('the-whistle', 'the-whistle', 'THE WHISTLE', 'Before the noise begins.', 'Before the noise begins.', 99, 120, 'ARCHIVED', 'PRE-ORDER', 'READY TO SHIP', 'after-90-core', '/assets/hero-tunnel.webp', 'Black', 100, '[]'::jsonb, 0),
  ('touchline', 'touchline', 'TOUCHLINE 04', 'Designed from the view beside the pitch.', 'Designed from the view beside the pitch.', 109, null, 'PUBLISHED', 'CUSTOMIZABLE', 'PERSONALIZED', 'legacy-v1', '/assets/jersey-white.webp', 'White', 70,
    '["NAME + NUMBER", "TEAM / CITY", "YEAR", "COLOUR"]'::jsonb, 16)
on conflict (id) do nothing;

insert into public.pod_city_presets (id, city, region, code, coordinates, palette, icons, signature)
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

-- Storefront theme builder. Kept separate from artwork templates.
create table if not exists public.pod_themes (
  id text primary key,
  name text not null,
  status text not null default 'DRAFT' check (status in ('PUBLISHED', 'DRAFT', 'ARCHIVED')),
  version text not null default 'v1.0',
  tokens jsonb not null default '{}'::jsonb,
  definition jsonb not null default '{}'::jsonb,
  created_at timestamptz not null default now(),
  updated_at timestamptz not null default now()
);

create table if not exists public.pod_theme_versions (
  id text primary key,
  theme_id text not null references public.pod_themes(id) on update cascade on delete cascade,
  version text not null,
  definition jsonb not null,
  changelog text not null default '',
  created_by uuid references auth.users(id) on delete set null,
  created_at timestamptz not null default now(),
  unique (theme_id, version)
);

create table if not exists public.pod_pages (
  id text primary key,
  theme_id text not null references public.pod_themes(id) on update cascade on delete cascade,
  name text not null,
  path text not null,
  status text not null default 'DRAFT' check (status in ('PUBLISHED', 'DRAFT', 'ARCHIVED')),
  layout jsonb not null default '[]'::jsonb,
  seo jsonb not null default '{}'::jsonb,
  created_at timestamptz not null default now(),
  updated_at timestamptz not null default now(),
  unique (theme_id, path)
);

create table if not exists public.pod_menus (
  id text primary key,
  name text not null,
  location text not null,
  status text not null default 'DRAFT' check (status in ('PUBLISHED', 'DRAFT', 'ARCHIVED')),
  created_at timestamptz not null default now(),
  updated_at timestamptz not null default now()
);

create table if not exists public.pod_menu_items (
  id text primary key,
  menu_id text not null references public.pod_menus(id) on update cascade on delete cascade,
  parent_id text references public.pod_menu_items(id) on update cascade on delete cascade,
  label text not null,
  target text not null,
  link_type text not null default 'PAGE' check (link_type in ('PAGE', 'COLLECTION', 'PRODUCT', 'ACTION', 'EXTERNAL')),
  visible boolean not null default true,
  sort_order integer not null default 0,
  settings jsonb not null default '{}'::jsonb,
  created_at timestamptz not null default now(),
  updated_at timestamptz not null default now()
);

alter table public.pod_menu_items drop constraint if exists pod_menu_items_link_type_check;
alter table public.pod_menu_items add constraint pod_menu_items_link_type_check
  check (link_type in ('PAGE', 'COLLECTION', 'PRODUCT', 'ACTION', 'EXTERNAL'));

create table if not exists public.pod_collections (
  id text primary key,
  handle text unique not null,
  name text not null,
  description text not null default '',
  status text not null default 'DRAFT' check (status in ('PUBLISHED', 'DRAFT', 'ARCHIVED')),
  hero_image text,
  sort_mode text not null default 'MANUAL',
  seo jsonb not null default '{}'::jsonb,
  created_at timestamptz not null default now(),
  updated_at timestamptz not null default now()
);

create table if not exists public.pod_collection_products (
  collection_id text not null references public.pod_collections(id) on update cascade on delete cascade,
  product_id text not null references public.pod_products(id) on update cascade on delete cascade,
  sort_order integer not null default 0,
  featured boolean not null default false,
  primary key (collection_id, product_id)
);

create table if not exists public.pod_product_options (
  id text primary key,
  product_id text not null references public.pod_products(id) on update cascade on delete cascade,
  name text not null,
  sort_order integer not null default 0,
  unique (product_id, name)
);

create table if not exists public.pod_product_option_values (
  id text primary key,
  option_id text not null references public.pod_product_options(id) on update cascade on delete cascade,
  label text not null,
  slug text not null,
  swatch text,
  image text,
  sort_order integer not null default 0,
  unique (option_id, slug)
);

create table if not exists public.pod_product_variants (
  id text primary key,
  product_id text not null references public.pod_products(id) on update cascade on delete cascade,
  sku text unique not null,
  option_values jsonb not null default '{}'::jsonb,
  price numeric(10,2) not null default 0,
  compare_at numeric(10,2),
  inventory integer not null default 0,
  weight_grams integer,
  barcode text,
  image text,
  status text not null default 'ACTIVE' check (status in ('ACTIVE', 'DRAFT', 'ARCHIVED')),
  created_at timestamptz not null default now(),
  updated_at timestamptz not null default now()
);

create table if not exists public.pod_media_assets (
  id text primary key,
  url text not null,
  filename text not null,
  media_type text not null default 'IMAGE' check (media_type in ('IMAGE', 'VIDEO')),
  alt_text text not null default '',
  metadata jsonb not null default '{}'::jsonb,
  created_at timestamptz not null default now()
);

create table if not exists public.pod_audit_logs (
  id bigint generated by default as identity primary key,
  actor_id uuid references auth.users(id) on delete set null,
  entity_type text not null,
  entity_id text not null,
  action text not null,
  snapshot jsonb not null default '{}'::jsonb,
  created_at timestamptz not null default now()
);

drop trigger if exists themes_touch_updated_at on public.pod_themes;
create trigger themes_touch_updated_at before update on public.pod_themes
for each row execute function public.pod_touch_updated_at();
drop trigger if exists pages_touch_updated_at on public.pod_pages;
create trigger pages_touch_updated_at before update on public.pod_pages
for each row execute function public.pod_touch_updated_at();
drop trigger if exists menus_touch_updated_at on public.pod_menus;
create trigger menus_touch_updated_at before update on public.pod_menus
for each row execute function public.pod_touch_updated_at();
drop trigger if exists menu_items_touch_updated_at on public.pod_menu_items;
create trigger menu_items_touch_updated_at before update on public.pod_menu_items
for each row execute function public.pod_touch_updated_at();
drop trigger if exists collections_touch_updated_at on public.pod_collections;
create trigger collections_touch_updated_at before update on public.pod_collections
for each row execute function public.pod_touch_updated_at();
drop trigger if exists product_variants_touch_updated_at on public.pod_product_variants;
create trigger product_variants_touch_updated_at before update on public.pod_product_variants
for each row execute function public.pod_touch_updated_at();

alter table public.pod_themes enable row level security;
alter table public.pod_theme_versions enable row level security;
alter table public.pod_pages enable row level security;
alter table public.pod_menus enable row level security;
alter table public.pod_menu_items enable row level security;
alter table public.pod_collections enable row level security;
alter table public.pod_collection_products enable row level security;
alter table public.pod_product_options enable row level security;
alter table public.pod_product_option_values enable row level security;
alter table public.pod_product_variants enable row level security;
alter table public.pod_media_assets enable row level security;
alter table public.pod_audit_logs enable row level security;

drop policy if exists "public can read published themes" on public.pod_themes;
drop policy if exists "public can read published pages" on public.pod_pages;
drop policy if exists "public can read published menus" on public.pod_menus;
drop policy if exists "public can read visible menu items" on public.pod_menu_items;
drop policy if exists "public can read published collections" on public.pod_collections;
drop policy if exists "public can read collection products" on public.pod_collection_products;
drop policy if exists "public can read product options" on public.pod_product_options;
drop policy if exists "public can read product option values" on public.pod_product_option_values;
drop policy if exists "public can read active variants" on public.pod_product_variants;
drop policy if exists "public can read media" on public.pod_media_assets;
drop policy if exists "admins can manage themes" on public.pod_themes;
drop policy if exists "admins can manage theme versions" on public.pod_theme_versions;
drop policy if exists "admins can manage pages" on public.pod_pages;
drop policy if exists "admins can manage menus" on public.pod_menus;
drop policy if exists "admins can manage menu items" on public.pod_menu_items;
drop policy if exists "admins can manage collections" on public.pod_collections;
drop policy if exists "admins can manage collection products" on public.pod_collection_products;
drop policy if exists "admins can manage product options" on public.pod_product_options;
drop policy if exists "admins can manage product option values" on public.pod_product_option_values;
drop policy if exists "admins can manage product variants" on public.pod_product_variants;
drop policy if exists "admins can manage media" on public.pod_media_assets;
drop policy if exists "admins can read audit logs" on public.pod_audit_logs;

create policy "public can read published themes" on public.pod_themes for select using (status = 'PUBLISHED');
create policy "public can read published pages" on public.pod_pages for select using (status = 'PUBLISHED');
create policy "public can read published menus" on public.pod_menus for select using (status = 'PUBLISHED');
create policy "public can read visible menu items" on public.pod_menu_items for select using (visible = true);
create policy "public can read published collections" on public.pod_collections for select using (status = 'PUBLISHED');
create policy "public can read collection products" on public.pod_collection_products for select using (true);
create policy "public can read product options" on public.pod_product_options for select using (true);
create policy "public can read product option values" on public.pod_product_option_values for select using (true);
create policy "public can read active variants" on public.pod_product_variants for select using (status = 'ACTIVE');
create policy "public can read media" on public.pod_media_assets for select using (true);

create policy "admins can manage themes" on public.pod_themes for all using ((auth.jwt() -> 'app_metadata' ->> 'role') = 'admin') with check ((auth.jwt() -> 'app_metadata' ->> 'role') = 'admin');
create policy "admins can manage theme versions" on public.pod_theme_versions for all using ((auth.jwt() -> 'app_metadata' ->> 'role') = 'admin') with check ((auth.jwt() -> 'app_metadata' ->> 'role') = 'admin');
create policy "admins can manage pages" on public.pod_pages for all using ((auth.jwt() -> 'app_metadata' ->> 'role') = 'admin') with check ((auth.jwt() -> 'app_metadata' ->> 'role') = 'admin');
create policy "admins can manage menus" on public.pod_menus for all using ((auth.jwt() -> 'app_metadata' ->> 'role') = 'admin') with check ((auth.jwt() -> 'app_metadata' ->> 'role') = 'admin');
create policy "admins can manage menu items" on public.pod_menu_items for all using ((auth.jwt() -> 'app_metadata' ->> 'role') = 'admin') with check ((auth.jwt() -> 'app_metadata' ->> 'role') = 'admin');
create policy "admins can manage collections" on public.pod_collections for all using ((auth.jwt() -> 'app_metadata' ->> 'role') = 'admin') with check ((auth.jwt() -> 'app_metadata' ->> 'role') = 'admin');
create policy "admins can manage collection products" on public.pod_collection_products for all using ((auth.jwt() -> 'app_metadata' ->> 'role') = 'admin') with check ((auth.jwt() -> 'app_metadata' ->> 'role') = 'admin');
create policy "admins can manage product options" on public.pod_product_options for all using ((auth.jwt() -> 'app_metadata' ->> 'role') = 'admin') with check ((auth.jwt() -> 'app_metadata' ->> 'role') = 'admin');
create policy "admins can manage product option values" on public.pod_product_option_values for all using ((auth.jwt() -> 'app_metadata' ->> 'role') = 'admin') with check ((auth.jwt() -> 'app_metadata' ->> 'role') = 'admin');
create policy "admins can manage product variants" on public.pod_product_variants for all using ((auth.jwt() -> 'app_metadata' ->> 'role') = 'admin') with check ((auth.jwt() -> 'app_metadata' ->> 'role') = 'admin');
create policy "admins can manage media" on public.pod_media_assets for all using ((auth.jwt() -> 'app_metadata' ->> 'role') = 'admin') with check ((auth.jwt() -> 'app_metadata' ->> 'role') = 'admin');
create policy "admins can read audit logs" on public.pod_audit_logs for select using ((auth.jwt() -> 'app_metadata' ->> 'role') = 'admin');

insert into public.pod_themes (id, name, status, version, tokens, definition)
values (
  'extra-time-v1',
  'EXTRA TIME / STORE KIT',
  'PUBLISHED',
  'v1.3',
  '{"ink":"#0A0A0A","chalk":"#F4F3EE","acid":"#F8F04A","signal":"#D72C2C","maxWidth":"1440px","radius":"0px"}'::jsonb,
  '{"navigation":{"main":"main","footer":"footer"},"pageTypes":["home","collection","product","custom","vault"]}'::jsonb
)
on conflict (id) do nothing;

insert into public.pod_pages (id, theme_id, name, path, status, layout)
values
  ('home', 'extra-time-v1', 'Home', '/', 'PUBLISHED', '["announcement","header","hero","rail","manifesto","custom-cta","footer"]'::jsonb),
  ('collection', 'extra-time-v1', 'Collection', '/collection', 'PUBLISHED', '["header","collection-hero","filters","product-grid","footer"]'::jsonb),
  ('product', 'extra-time-v1', 'Product detail', '/product/:handle', 'PUBLISHED', '["header","gallery","product-info","variations","personalization","story","related","footer"]'::jsonb),
  ('custom', 'extra-time-v1', 'Custom Lab', '/custom', 'PUBLISHED', '["header","listing-reference","custom-fields","note","ai-handoff","footer"]'::jsonb),
  ('vault', 'extra-time-v1', 'The Vault', '/vault', 'DRAFT', '["header","archive-index","story","footer"]'::jsonb)
on conflict (id) do nothing;

insert into public.pod_menus (id, name, location, status)
values
  ('main', 'Main navigation', 'HEADER', 'PUBLISHED'),
  ('footer', 'Footer navigation', 'FOOTER', 'PUBLISHED'),
  ('fixed-footer', 'Fixed footer menu', 'FIXED_FOOTER_MOBILE', 'PUBLISHED')
on conflict (id) do nothing;

insert into public.pod_collections (id, handle, name, description, status, hero_image, sort_mode)
values
  ('drop-01', 'the-90-drop', 'THE 90+ DROP', 'The first collection for the minutes nobody forgets.', 'PUBLISHED', '/assets/hero-tunnel.webp', 'MANUAL'),
  ('custom-jerseys', 'custom-jerseys', 'CUSTOM JERSEYS', 'A fixed point of view. A small personal layer.', 'PUBLISHED', '/assets/jersey-white.webp', 'FEATURED'),
  ('archive', 'archive', 'THE ARCHIVE', 'Pieces with a previous life.', 'DRAFT', '/assets/jersey-oxblood.webp', 'NEWEST')
on conflict (id) do nothing;

insert into public.pod_menu_items (id, menu_id, label, target, link_type, sort_order)
values
  ('main-shop', 'main', 'Shop', '/collection', 'COLLECTION', 0),
  ('main-moments', 'main', 'Moments', '/moments', 'PAGE', 1),
  ('main-players', 'main', 'Players', '/players', 'PAGE', 2),
  ('main-vault', 'main', 'The Vault', '/vault', 'PAGE', 3),
  ('footer-shipping', 'footer', 'Shipping', '/shipping', 'PAGE', 0),
  ('footer-returns', 'footer', 'Returns', '/returns', 'PAGE', 1),
  ('footer-journal', 'footer', 'Journal', '/journal', 'EXTERNAL', 2),
  ('fixed-home', 'fixed-footer', 'Home', '/', 'PAGE', 0),
  ('fixed-shop', 'fixed-footer', 'Shop', '/shop', 'COLLECTION', 1),
  ('fixed-custom', 'fixed-footer', 'Custom', '/custom', 'PAGE', 2),
  ('fixed-bag', 'fixed-footer', 'Bag', '#bag', 'ACTION', 3)
on conflict (id) do nothing;

insert into public.pod_menu_items (id, menu_id, parent_id, label, target, link_type, sort_order)
values
  ('main-shop-all', 'main', 'main-shop', 'All products', '/collection', 'PAGE', 0),
  ('main-shop-jerseys', 'main', 'main-shop', 'Jerseys', '/collection?type=jerseys', 'COLLECTION', 1),
  ('main-shop-custom', 'main', 'main-shop', 'Custom Lab', '/custom', 'PAGE', 2)
on conflict (id) do nothing;

insert into public.pod_collection_products (collection_id, product_id, sort_order, featured)
values
  ('drop-01', 'after-90', 0, true),
  ('drop-01', 'home-end', 1, false),
  ('drop-01', 'under-lights', 2, false),
  ('custom-jerseys', 'touchline', 0, true),
  ('archive', 'the-whistle', 0, true),
  ('archive', 'chalk-lines', 1, false)
on conflict (collection_id, product_id) do nothing;

insert into public.pod_product_options (id, product_id, name, sort_order)
values
  ('after-90-size', 'after-90', 'Size', 0),
  ('after-90-color', 'after-90', 'Color', 1),
  ('touchline-size', 'touchline', 'Size', 0),
  ('touchline-color', 'touchline', 'Color', 1)
on conflict (id) do nothing;

insert into public.pod_product_option_values (id, option_id, label, slug, sort_order)
values
  ('after-90-size-xs', 'after-90-size', 'XS', 'xs', 0), ('after-90-size-s', 'after-90-size', 'S', 's', 1), ('after-90-size-m', 'after-90-size', 'M', 'm', 2), ('after-90-size-l', 'after-90-size', 'L', 'l', 3), ('after-90-size-xl', 'after-90-size', 'XL', 'xl', 4), ('after-90-size-xxl', 'after-90-size', 'XXL', 'xxl', 5),
  ('after-90-color-black', 'after-90-color', 'Black', 'black', 0),
  ('touchline-size-s', 'touchline-size', 'S', 's', 0), ('touchline-size-m', 'touchline-size', 'M', 'm', 1), ('touchline-size-l', 'touchline-size', 'L', 'l', 2), ('touchline-size-xl', 'touchline-size', 'XL', 'xl', 3), ('touchline-size-xxl', 'touchline-size', 'XXL', 'xxl', 4),
  ('touchline-color-white', 'touchline-color', 'White', 'white', 0), ('touchline-color-black', 'touchline-color', 'Black', 'black', 1)
on conflict (id) do nothing;

insert into public.pod_product_variants (id, product_id, sku, option_values, price, inventory, status)
values
  ('after-90-xs-black', 'after-90', 'ET-001-XS-BLK', '{"Size":"XS","Color":"Black"}'::jsonb, 89, 4, 'ACTIVE'),
  ('after-90-s-black', 'after-90', 'ET-001-S-BLK', '{"Size":"S","Color":"Black"}'::jsonb, 89, 8, 'ACTIVE'),
  ('after-90-m-black', 'after-90', 'ET-001-M-BLK', '{"Size":"M","Color":"Black"}'::jsonb, 89, 12, 'ACTIVE'),
  ('after-90-l-black', 'after-90', 'ET-001-L-BLK', '{"Size":"L","Color":"Black"}'::jsonb, 89, 7, 'ACTIVE'),
  ('after-90-xl-black', 'after-90', 'ET-001-XL-BLK', '{"Size":"XL","Color":"Black"}'::jsonb, 89, 5, 'ACTIVE'),
  ('after-90-xxl-black', 'after-90', 'ET-001-XXL-BLK', '{"Size":"XXL","Color":"Black"}'::jsonb, 89, 2, 'ACTIVE'),
  ('touchline-s-white', 'touchline', 'ET-006-S-WHT', '{"Size":"S","Color":"White"}'::jsonb, 109, 3, 'ACTIVE'),
  ('touchline-m-white', 'touchline', 'ET-006-M-WHT', '{"Size":"M","Color":"White"}'::jsonb, 109, 6, 'ACTIVE'),
  ('touchline-l-white', 'touchline', 'ET-006-L-WHT', '{"Size":"L","Color":"White"}'::jsonb, 109, 4, 'ACTIVE'),
  ('touchline-xl-white', 'touchline', 'ET-006-XL-WHT', '{"Size":"XL","Color":"White"}'::jsonb, 109, 2, 'ACTIVE'),
  ('touchline-xxl-white', 'touchline', 'ET-006-XXL-WHT', '{"Size":"XXL","Color":"White"}'::jsonb, 109, 1, 'ACTIVE')
on conflict (id) do nothing;
