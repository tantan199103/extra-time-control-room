import { mkdir, readFile, writeFile } from 'node:fs/promises'
import { dirname, join } from 'node:path'
import { products as fallbackProducts } from '../src/data.js'
import { buildFallbackCatalog } from '../src/lib/storefront-model.js'
import { LEAGUE_TAXONOMY, leaguePath, teamPath, normalizeTeamSlug } from '../src/lib/league-taxonomy.js'

const PUBLIC_ORIGIN = new URL(process.env.SITE_URL || process.env.VITE_SITE_URL || 'https://www.jersevo.com').origin
const DIST = join(process.cwd(), 'dist')

const escapeHtml = value => String(value ?? '').replace(/[&<>"']/g, character => ({ '&':'&amp;', '<':'&lt;', '>':'&gt;', '"':'&quot;', "'":'&#39;' }[character]))
const stripMarkup = value => String(value ?? '').replace(/<[^>]+>/g, ' ').replace(/\s+/g, ' ').trim()
const text = (value, fallback = '') => stripMarkup(value) || fallback
const absolute = value => {
  try { return new URL(String(value || ''), PUBLIC_ORIGIN).toString() } catch { return `${PUBLIC_ORIGIN}/assets/hero-tunnel.webp` }
}
const slug = value => encodeURIComponent(String(value || '').trim())

function normalizeProduct(row) {
  const title = text(row.title || row.name, 'Extra Time football jersey')
  const description = text(row.seo?.description || row.description || row.subtitle || row.story, `A designer-led ${title} football jersey from Extra Time.`)
  const image = absolute(row.image || row.media?.find?.(item => item.type === 'IMAGE')?.url || '/assets/hero-tunnel.webp')
  const variants = Array.isArray(row.pod_product_variants) ? row.pod_product_variants : Array.isArray(row.variants) ? row.variants : []
  const prices = variants.map(item => Number(item.price)).filter(Number.isFinite).filter(value => value > 0)
  const price = Number(row.price) > 0 ? Number(row.price) : (prices.length ? Math.min(...prices) : 0)
  const inventory = Number.isFinite(Number(row.inventory)) ? Number(row.inventory) : variants.reduce((total, item) => total + Number(item.inventory || 0), 0)
  const handle = text(row.handle || row.id, title.toLowerCase().replace(/[^a-z0-9]+/g, '-'))
  return { handle, title, description, image, price, inventory, sku:text(row.sku || variants[0]?.sku), updatedAt:row.updated_at || row.updatedAt || '', taxonomy:row.taxonomy || {}, seoStatus:String(row.seo_status || row.seo?.status || '').toUpperCase() }
}

async function fetchRows(path, key, query = '') {
  const response = await fetch(`${path}${query}`, {
    headers: { apikey:key, Authorization:`Bearer ${key}`, Accept:'application/json' },
    signal:AbortSignal.timeout(8000)
  })
  if (!response.ok) throw new Error(`Supabase SEO query failed (${response.status}).`)
  return response.json()
}

async function loadProducts() {
  const base = process.env.SUPABASE_URL || process.env.VITE_SUPABASE_URL
  const key = process.env.SUPABASE_SERVICE_ROLE_KEY || process.env.VITE_SUPABASE_ANON_KEY
  if (base && key) {
    try {
      const query = `${base.replace(/\/$/, '')}/rest/v1/pod_products?select=handle,title,subtitle,description,price,image,seo,seo_status,inventory,sku,taxonomy,media,pod_product_variants(price,inventory,status,sku),updated_at&status=eq.PUBLISHED&seo_status=eq.INDEXABLE&order=updated_at.desc&limit=5000`
      const rows = await fetchRows(query, key)
      if (Array.isArray(rows)) return rows.map(normalizeProduct)
    } catch (error) {
      // Older deployments may not have the gate column yet. In that case only
      // rows carrying the explicit structured status can be generated.
      try {
        const legacyQuery = `${base.replace(/\/$/, '')}/rest/v1/pod_products?select=handle,title,subtitle,description,price,image,seo,inventory,sku,taxonomy,media,pod_product_variants(price,inventory,status,sku),updated_at&status=eq.PUBLISHED&order=updated_at.desc&limit=5000`
        const legacyRows = await fetchRows(legacyQuery, key)
        return (Array.isArray(legacyRows) ? legacyRows : []).filter(row => String(row.seo?.status || '').toUpperCase() === 'INDEXABLE').map(normalizeProduct)
      } catch (legacyError) {
        // A configured production database that is temporarily unavailable is
        // not permission to publish the bundled demo catalogue. Return an
        // empty set so the build keeps only the homepage/static trust pages;
        // fallback products are reserved for local builds without Supabase.
        console.warn(`[seo] Live catalogue unavailable; skipping product pages. ${legacyError.message}`)
        return []
      }
    }
  }
  return buildFallbackCatalog(fallbackProducts).map(normalizeProduct)
}

async function loadCollections() {
  const base = process.env.SUPABASE_URL || process.env.VITE_SUPABASE_URL
  const key = process.env.SUPABASE_SERVICE_ROLE_KEY || process.env.VITE_SUPABASE_ANON_KEY
  if (!base || !key) return []
  try {
    const query = `${base.replace(/\/$/, '')}/rest/v1/pod_collections?select=handle,name,description,hero_image,seo,updated_at&status=eq.PUBLISHED&order=updated_at.desc&limit=1000`
    const rows = await fetchRows(query, key)
    return (Array.isArray(rows) ? rows : []).map(row => ({
      handle:text(row.handle || row.id),
      title:text(row.seo?.title || row.name, 'Extra Time collection'),
      description:text(row.seo?.description || row.description, 'Explore the latest Extra Time football jersey collection.'),
      image:absolute(row.hero_image || '/assets/hero-tunnel.webp'),
      updatedAt:row.updated_at || ''
    })).filter(row => row.handle && String((rows.find(item => item.handle === row.handle)?.seo || {}).status || '').toUpperCase() === 'INDEXABLE')
  } catch (error) {
    console.warn(`[seo] Live collections unavailable; product pages will still be generated. ${error.message}`)
    return []
  }
}

function productSchema(product) {
  const canonical = `${PUBLIC_ORIGIN}/product/${slug(product.handle)}`
  const schema = {
    '@context':'https://schema.org',
    '@type':'Product',
    '@id':`${canonical}#product`,
    name:product.title,
    description:product.description,
    image:[product.image],
    url:canonical,
    brand:{ '@type':'Brand', name:'Extra Time' },
    category:'Apparel & Accessories > Clothing > Jerseys',
    offers:{
      '@type':'Offer',
      url:canonical,
      priceCurrency:'USD',
      price:product.price.toFixed(2),
      availability:`https://schema.org/${product.inventory > 0 ? 'InStock' : 'OutOfStock'}`,
      itemCondition:'https://schema.org/NewCondition',
      seller:{ '@type':'Organization', name:'Jersevo', alternateName:'Extra Time', url:`${PUBLIC_ORIGIN}/`, email:'support@jersevo.com', address:{ '@type':'PostalAddress', addressRegion:'TX', addressCountry:'US' } }
    }
  }
  if (product.sku) schema.sku = product.sku
  return schema
}

function breadcrumbSchema(items) {
  return {
    '@context':'https://schema.org',
    '@type':'BreadcrumbList',
    itemListElement:items.map((item, index) => ({ '@type':'ListItem', position:index + 1, name:item.name, item:item.url }))
  }
}

function upsertMeta(html, attribute, name, content) {
  const escaped = escapeHtml(content)
  const pattern = new RegExp(`<meta\\s+${attribute}=["']${name}["'][^>]*>`, 'i')
  const tag = `<meta ${attribute}="${name}" content="${escaped}" />`
  return pattern.test(html) ? html.replace(pattern, tag) : html.replace('</head>', `    ${tag}\n  </head>`)
}

function pageHtml(shell, { path, title, description, image, noindex = false, fallback, schema }) {
  const canonical = `${PUBLIC_ORIGIN}${path === '/' ? '/' : path}`
  let html = shell
    .replace(/<html[^>]*>/i, '<html lang="en-US">')
    .replace(/<title>[\s\S]*?<\/title>/i, `<title>${escapeHtml(title)}</title>`)
    .replace(/<link\s+rel=["']canonical["'][^>]*>/i, `<link rel="canonical" href="${escapeHtml(canonical)}" />`)
  html = upsertMeta(html, 'name', 'description', description.slice(0, 180))
  html = upsertMeta(html, 'name', 'robots', noindex ? 'noindex,nofollow' : 'index,follow,max-image-preview:large,max-snippet:-1,max-video-preview:-1')
  html = upsertMeta(html, 'name', 'googlebot', noindex ? 'noindex,nofollow' : 'index,follow')
  html = upsertMeta(html, 'property', 'og:title', title)
  html = upsertMeta(html, 'property', 'og:description', description.slice(0, 200))
  html = upsertMeta(html, 'property', 'og:url', canonical)
  html = upsertMeta(html, 'property', 'og:image', image)
  html = upsertMeta(html, 'property', 'og:image:alt', title)
  html = upsertMeta(html, 'property', 'og:type', path.startsWith('/product/') ? 'product' : 'website')
  html = upsertMeta(html, 'name', 'twitter:title', title)
  html = upsertMeta(html, 'name', 'twitter:description', description.slice(0, 200))
  html = upsertMeta(html, 'name', 'twitter:image', image)
  html = html.replace(/<link\s+rel=["']alternate["'][^>]*hreflang=["'](?:en-US|x-default)["'][^>]*>\s*/gi, '')
  const structured = schema ? `    <script type="application/ld+json" id="route-structured-data">${JSON.stringify(schema)}</script>\n` : ''
  html = html.replace('</head>', `    <link rel="alternate" hreflang="en-US" href="${escapeHtml(canonical)}" />\n    <link rel="alternate" hreflang="x-default" href="${escapeHtml(canonical)}" />\n${structured}  </head>`)
  if (fallback) html = html.replace('<div id="root"></div>', `<div id="root">${fallback}</div>`)
  return html
}

async function writePage(path, html) {
  const target = join(DIST, path === '/' ? 'index.html' : path.replace(/^\//, '').replace(/\/$/, ''), 'index.html')
  await mkdir(dirname(target), { recursive:true })
  await writeFile(target, html)
}

const shell = await readFile(join(DIST, 'index.html'), 'utf8')
const products = await loadProducts()
const collections = await loadCollections()

const home = pageHtml(shell, {
  path:'/',
  title:'Extra Time — Football memories, made wearable',
  description:'Extra Time makes designer-led football jerseys and personalized match-day pieces for supporters in the United States.',
  image:absolute('/assets/hero-tunnel.webp'),
  fallback:`<main class="seo-fallback"><h1>Football memories, made wearable.</h1><p>Designer-led jerseys and considered personalization for the moments supporters never forget.</p><nav aria-label="Shop by league">${LEAGUE_TAXONOMY.map(league => `<a href="${leaguePath(league)}">${escapeHtml(league.name)} custom fan gear</a>`).join(' · ')}</nav></main>`
})
await writeFile(join(DIST, 'index.html'), home)

for (const product of products) {
  const path = `/product/${slug(product.handle)}`
  const html = pageHtml(shell, {
    path,
    title:`${product.title} — Extra Time`,
    description:product.description,
    image:product.image,
    fallback:`<main class="seo-fallback"><h1>${escapeHtml(product.title)}</h1><p>${escapeHtml(product.description)}</p><img src="${escapeHtml(product.image)}" alt="${escapeHtml(product.title)} football jersey" /></main>`,
    schema:[productSchema(product), breadcrumbSchema([{ name:'Home', url:`${PUBLIC_ORIGIN}/` }, { name:'Shop', url:`${PUBLIC_ORIGIN}/shop` }, { name:product.title, url:`${PUBLIC_ORIGIN}${path}` }])]
  })
  await writePage(path, html)
}

const itemList = products.map((product, index) => ({ '@type':'ListItem', position:index + 1, url:`${PUBLIC_ORIGIN}/product/${slug(product.handle)}`, name:product.title, image:product.image }))
await writePage('/shop', pageHtml(shell, {
  path:'/shop',
  title:'Shop the drop — Extra Time',
  description:'Shop Extra Time designer-led football jerseys, personalized match-day pieces and the latest US collection.',
  image:absolute('/assets/jersey-black.webp'),
  fallback:`<main class="seo-fallback"><h1>Shop the drop</h1><p>Designer-led football jerseys and personalized pieces.</p><ul>${products.map(product => `<li><a href="/product/${slug(product.handle)}">${escapeHtml(product.title)}</a></li>`).join('')}</ul></main>`,
  schema:{ '@context':'https://schema.org', '@type':'ItemList', itemListElement:itemList }
}))

for (const collection of collections) {
  const path = `/collection/${slug(collection.handle)}`
  await writePage(path, pageHtml(shell, {
    path,
    title:`${collection.title} — Extra Time`,
    description:collection.description,
    image:collection.image,
    fallback:`<main class="seo-fallback"><h1>${escapeHtml(collection.title)}</h1><p>${escapeHtml(collection.description)}</p></main>`,
    schema:{ '@context':'https://schema.org', '@type':'CollectionPage', name:collection.title, description:collection.description, url:`${PUBLIC_ORIGIN}${path}`, image:collection.image }
  }))
}

// Taxonomy pages are generated from the same source used by the runtime mega
// menu, but only become indexable when the live catalogue has enough distinct
// products behind the route. Empty/near-empty pages remain reachable in the
// app and carry noindex metadata.
const taxonomyCounts = new Map()
for (const product of products) {
  const league = String(product.taxonomy?.league || '').toLowerCase()
  if (!league) continue
  taxonomyCounts.set(`league:${league}`, (taxonomyCounts.get(`league:${league}`) || 0) + 1)
  const team = normalizeTeamSlug(league, product.taxonomy?.team || '')
  if (team) taxonomyCounts.set(`team:${league}/${team}`, (taxonomyCounts.get(`team:${league}/${team}`) || 0) + 1)
}
const TAXONOMY_MIN_PRODUCTS = 6
for (const league of LEAGUE_TAXONOMY) {
  const path = leaguePath(league)
  const leagueIndexable = (taxonomyCounts.get(`league:${league.key}`) || 0) >= TAXONOMY_MIN_PRODUCTS
  await writePage(path, pageHtml(shell, {
    path,
    title:`${league.name} custom fan gear — Extra Time`,
    description:league.description,
    image:absolute('/assets/editorial-player.webp'),
    noindex:!leagueIndexable,
    fallback:`<main class="seo-fallback"><h1>${escapeHtml(league.name)} custom fan gear</h1><p>${escapeHtml(league.description)}</p><ul>${league.teams.slice(0, 12).map(team => `<li><a href="${teamPath(league.key, team)}">${escapeHtml(team.name)}</a></li>`).join('')}</ul></main>`,
    schema:{ '@context':'https://schema.org', '@type':'CollectionPage', name:`${league.name} custom fan gear`, description:league.description, url:`${PUBLIC_ORIGIN}${path}`, isPartOf:{ '@type':'WebSite', url:`${PUBLIC_ORIGIN}/` } }
  }))
  for (const team of league.teams) {
    const teamPage = teamPath(league.key, team)
    const teamIndexable = (taxonomyCounts.get(`team:${league.key}/${team.slug}`) || 0) >= TAXONOMY_MIN_PRODUCTS
    await writePage(teamPage, pageHtml(shell, {
      path:teamPage,
      title:`${team.name} custom fan gear — Extra Time`,
      description:`Shop ${team.name} custom fan gear and personalized jerseys with tracked US delivery.`,
      image:absolute('/assets/editorial-player.webp'),
      noindex:!teamIndexable,
      fallback:`<main class="seo-fallback"><h1>${escapeHtml(team.name)} custom fan gear</h1><p>Shop ${escapeHtml(team.name)} custom fan gear and personalized jerseys with tracked US delivery.</p><p><a href="${path}">Browse all ${escapeHtml(league.name)} collections</a></p></main>`,
      schema:{ '@context':'https://schema.org', '@type':'CollectionPage', name:`${team.name} custom fan gear`, description:`Shop ${team.name} custom fan gear and personalized jerseys with tracked US delivery.`, url:`${PUBLIC_ORIGIN}${teamPage}`, isPartOf:{ '@type':'CollectionPage', url:`${PUBLIC_ORIGIN}${path}` } }
    }))
  }
}

const staticPages = [
  ['/about', 'About the studio — Extra Time', 'Meet Extra Time, an independent fan-apparel studio making small-batch football jerseys and considered personalization.', '/assets/hero-tunnel.webp'],
  ['/membership', '90+ Club membership — Extra Time', 'Join 90+ Club for eligible member pricing, shipping benefits and early access to selected Extra Time drops.'],
  ['/vault', 'The Vault — Extra Time', 'Explore the archive of Extra Time football jersey stories and past drops.'],
  ['/privacy', 'Privacy and customer data — Extra Time', 'Extra Time uses customer details to prepare, charge and deliver orders while keeping references private to the relevant request.'],
  ['/terms', 'Store terms — Extra Time', 'Review Extra Time product, payment, personalization and production terms before placing an order.'],
  ['/accessibility', 'Accessibility — Extra Time', 'Extra Time is built for keyboard, touch and assistive technology, with clear headings, labels and visible focus.'],
  ['/shipping', 'Shipping and delivery — Extra Time', 'Tracked delivery, live checkout quotes and clear hand-offs for Extra Time orders in the US and supported destinations.'],
  ['/returns', 'Returns and personalized-order policy — Extra Time', 'Review the 30-day standard return window, defect review and rules for personalized pieces before ordering.'],
  ['/warranty', 'Warranty and defect review — Extra Time', 'Learn how Extra Time reviews manufacturing defects, fulfilment errors, transit damage and personalized-order issues.','/assets/jersey-black.webp'],
  ['/journal', 'The Journal — Extra Time', 'Explore the references, rituals and late-match details behind Extra Time football jersey drops.']
]
for (const [path, title, description, pageImage = '/assets/hero-tunnel.webp'] of staticPages) {
  const pageHeading = title.replace(' — Extra Time', '')
  const publicContact = `<section><h2>Jersevo</h2><p>Jersevo operates the Extra Time storefront from Texas, United States. For order, privacy or policy questions, email <a href="mailto:support@jersevo.com">support@jersevo.com</a>.</p></section>`
  await writePage(path, pageHtml(shell, {
    path, title, description, image:absolute(pageImage),
    fallback:`<main class="seo-fallback"><h1>${escapeHtml(pageHeading)}</h1><p>${escapeHtml(description)}</p>${publicContact}</main>`,
    schema:{ '@context':'https://schema.org', '@type':'WebPage', name:title, description, url:`${PUBLIC_ORIGIN}${path}`, inLanguage:'en-US', publisher:{ '@type':'Organization', name:'Jersevo', alternateName:'Extra Time', email:'support@jersevo.com', address:{ '@type':'PostalAddress', addressRegion:'TX', addressCountry:'US' } } }
  }))
}

for (const path of ['/custom', '/studio', '/account', '/account/membership', '/admin']) {
  await writePage(path, pageHtml(shell, {
    path, title:'Extra Time', description:'Extra Time account and studio tools.', image:absolute('/assets/hero-tunnel.webp'), noindex:true,
    fallback:'<main class="seo-fallback"><h1>Extra Time</h1></main>', schema:{ '@context':'https://schema.org', '@type':'WebPage', name:'Extra Time', url:`${PUBLIC_ORIGIN}${path}` }
  }))
}

console.log(`[seo] Generated ${products.length} product pages, ${collections.length} collection pages and ${staticPages.length} static pages.`)
