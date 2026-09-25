import test from 'node:test'
import assert from 'node:assert/strict'
import { readFile, stat } from 'node:fs/promises'
import { fileURLToPath } from 'node:url'
import sharp from 'sharp'

const root = new URL('../public/assets/shop/', import.meta.url)
const assets = [
  'shop-hero-v2.webp', 'shop-custom-banner-v2.webp', 'shop-fan-gear-banner-v2.webp', 'shop-cover-fan-gear.webp',
  ...['nfl','nba','mlb','nhl','ncaa'].map(key => `league-${key}-cover.webp`),
  ...['nfl','nba','mlb','nhl','mls','ncaa'].map(key => `sport-${key}-v2.webp`),
  ...['caps','football-jerseys','baseball-jerseys','knit-hats','fan-apparel','custom-jerseys','accessories'].map(key => `category-${key}-v2.webp`)
]

test('Shop campaign assets are real optimized WebP files', async () => {
  for (const name of assets) {
    const path = new URL(name, root)
    const info = await stat(path)
    const metadata = await sharp(fileURLToPath(path)).metadata()
    assert.ok(info.size > 1000 && info.size < 500_000, `${name} has a useful optimized size`)
    assert.equal(metadata.format, 'webp')
    assert.ok(metadata.width >= 300 && metadata.height >= 300)
  }
})

test('Shop uses a compact logo and icon directory before its live product grid', async () => {
  const source = await readFile(new URL('../src/main.jsx', import.meta.url), 'utf8')
  const css = await readFile(new URL('../src/shop-visual.css', import.meta.url), 'utf8')
  const seo = await readFile(new URL('../scripts/generate-seo-pages.mjs', import.meta.url), 'utf8')
  assert.doesNotMatch(source, /shop-hero-v2\.webp/)
  assert.doesNotMatch(seo, /image:absolute\('\/assets\/shop\/shop-hero-v2\.webp'\)/)
  assert.match(source, /SHOP_COVER\.src/)
  assert.match(source, /shop-cover__leagues/)
  assert.match(source, /taxonomy-cover__image/)
  assert.match(seo, /image:absolute\(SHOP_COVER\.src\)/)
  assert.match(seo, /leagueCover\(league\.key\)/)
  assert.match(seo, /writeCatalogPagination\('\/shop',[\s\S]*?SHOP_COVER\.src\)/)
  assert.match(source, /shop-visual__sport-grid/)
  assert.match(source, /shop-visual__product-grid/)
  assert.match(source, /shop-visual__team-grid/)
  assert.match(source, /id="all-products"/)
  assert.match(source, /shop-catalog-shell/)
  assert.match(css, /\.shop-catalog-shell\s*\{[\s\S]*?border-bottom:\s*1px solid var\(--line\)/)
  assert.match(css, /@media \(max-width: 780px\)/)
  assert.match(css, /shop-visual__product-grid/)
})

test('Shop keeps discovery, shortcuts and controls in one compact panel', async () => {
  const source = await readFile(new URL('../src/main.jsx', import.meta.url), 'utf8')
  const css = await readFile(new URL('../src/shop-visual.css', import.meta.url), 'utf8')
  assert.match(source, /shop-visual--unified/)
  assert.match(source, /shop-visual__unified-controls/)
  assert.match(source, /controls=\{filterBar\}/)
  assert.match(source, /activeFilters=\{activeFilterMarkup\}/)
  assert.match(source, /className="shop-all-filters"/)
  assert.match(css, /\.shop-catalog-shell--root[\s\S]*\.shop-layout--root/)
  assert.match(css, /\.shop-visual--unified[\s\S]*overflow-x:\s*auto/)
})

test('Shop hero exposes a direct commercial search and a compact campaign visual', async () => {
  const source = await readFile(new URL('../src/main.jsx', import.meta.url), 'utf8')
  const supabase = await readFile(new URL('../src/lib/supabase.js', import.meta.url), 'utf8')
  assert.match(source, /role="search"/)
  assert.match(source, /placeholder="Search teams, players, jerseys…"/)
  assert.match(source, /navigate\(`\/shop\?search=\$\{encodeURIComponent\(value\)\}`\)/)
  assert.match(source, /SHOP_COVER\.src/)
  assert.match(supabase, /params\.get\('search'\)/)
  assert.match(supabase, /'taxonomy->>team'/)
})

test('Shop and league covers stay panoramic on mobile', async () => {
  const shopCss = await readFile(new URL('../src/shop-visual.css', import.meta.url), 'utf8')
  const taxonomyCss = await readFile(new URL('../src/taxonomy-hubs.css', import.meta.url), 'utf8')
  assert.match(shopCss, /@media \(max-width: 780px\)[\s\S]*?\.shop-visual--unified\.shop-cover|@media \(max-width: 780px\)[\s\S]*?\.shop-visual--unified \.shop-cover/)
  assert.match(shopCss, /aspect-ratio:\s*3\.05\s*\/\s*1/)
  assert.match(shopCss, /max-height:\s*170px/)
  assert.match(taxonomyCss, /@media \(max-width: 780px\)[\s\S]*?\.taxonomy-cover[\s\S]*?aspect-ratio:\s*3\s*\/\s*1/)
  assert.match(taxonomyCss, /\.taxonomy-cover__image[\s\S]*?object-fit:\s*cover/)
})
