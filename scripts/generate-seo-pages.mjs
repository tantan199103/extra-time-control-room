import { mkdir, readFile, writeFile } from 'node:fs/promises'
import { dirname, join } from 'node:path'
import { products as fallbackProducts } from '../src/data.js'
import { buildFallbackCatalog, prepareStorefrontProduct } from '../src/lib/storefront-model.js'
import { LEAGUE_TAXONOMY, leaguePath, teamPath, normalizeTeamSlug } from '../src/lib/league-taxonomy.js'
import { SHOP_COVER, leagueCover } from '../src/lib/league-covers.js'
import { ALL_CATALOG_CATEGORY_PAGES, CATALOG_CATEGORY_PAGES, productMatchesCatalogCategory } from '../src/lib/catalog-taxonomy.js'
import { CATALOG_PAGE_SIZE, catalogPagePath, pageCount } from '../src/lib/catalog-pagination.js'
import { cleanSeoText, seoDescription } from '../src/lib/seo-text.js'
import { productSeoMetadata, productStructuredData, relatedProducts, safeJson } from '../src/lib/product-seo.js'
import { TRUST_PAGES } from '../src/lib/trust-pages.js'
import { productBootstrap, renderProductContent, renderSitemap } from './seo-render.mjs'

const PUBLIC_ORIGIN = new URL(process.env.SITE_URL || process.env.VITE_SITE_URL || 'https://www.jersevo.com').origin
const DIST = join(process.cwd(), 'dist')
const sitemapEntries = []
let featuredCustomProduct = null

const escapeHtml = value => String(value ?? '').replace(/[&<>"']/g, character => ({ '&':'&amp;', '<':'&lt;', '>':'&gt;', '"':'&quot;', "'":'&#39;' }[character]))
const stripMarkup = value => String(value ?? '').replace(/<[^>]+>/g, ' ').replace(/\s+/g, ' ').trim()
const text = (value, fallback = '') => stripMarkup(value) || fallback
const absolute = value => {
  try { return new URL(String(value || ''), PUBLIC_ORIGIN).toString() } catch { return `${PUBLIC_ORIGIN}/assets/hero-tunnel.webp` }
}
const slug = value => encodeURIComponent(String(value || '').trim())

function normalizeProduct(row) {
  const product = prepareStorefrontProduct(row)
  const metadata = productSeoMetadata(product, PUBLIC_ORIGIN)
  return { ...product, images:[...new Set([product.image,...product.media.filter(m=>m.type==='IMAGE').map(m=>m.url)].filter(Boolean))], brand:product.taxonomy?.brand || product.seo?.gmc?.brand || 'Jersevo', metadata }
}

const storefrontOrder = (a,b) => String(b.updatedAt || '').localeCompare(String(a.updatedAt || '')) || String(a.id || '').localeCompare(String(b.id || ''))

async function fetchRows(path, key) {
  const rows = []
  // Supabase/PostgREST allows a bounded page of up to 1,000 rows.  The
  // previous 50-row page made a production build walk the catalogue through
  // hundreds of network round-trips (and left Vercel in "Building" for many
  // minutes).  Keep the request comfortably below the server limit while
  // still making the SEO build resilient to large catalogues.
  const pageSize = 500
  let cursor = ''
  for (;;) {
    const url = new URL(path)
    url.searchParams.set('limit', String(pageSize))
    if (cursor) url.searchParams.set('id', `gt.${cursor}`)
    let page
    let lastError
    for (let attempt = 0; attempt < 4; attempt += 1) {
      try {
        const response = await fetch(url, {
          headers: { apikey:key, Authorization:`Bearer ${key}`, Accept:'application/json' },
          signal:AbortSignal.timeout(30000)
        })
        if (!response.ok) {
          const detail = (await response.text()).slice(0, 180)
          const error = new Error(`Supabase SEO query failed (${response.status}) after id ${cursor || '(start)'}: ${detail}`)
          if (response.status !== 429 && response.status < 500) throw error
          lastError = error
          await new Promise(resolvePromise => setTimeout(resolvePromise, Math.min(8000, 1000 * (attempt + 1))))
          continue
        }
        page = await response.json()
        break
      } catch (error) {
        lastError = error
        if (attempt === 3 || !/abort|fetch|network|429|5\d\d/i.test(String(error?.message || error))) throw error
        await new Promise(resolvePromise => setTimeout(resolvePromise, Math.min(8000, 1000 * (attempt + 1))))
      }
    }
    if (!page) throw lastError || new Error(`Supabase SEO query failed after id ${cursor || '(start)'}.`)
    if (!Array.isArray(page)) throw new Error('Supabase SEO query did not return an array.')
    rows.push(...page)
    if (page.length < pageSize) return rows
    const nextCursor = String(page.at(-1)?.id || '')
    if (!nextCursor || nextCursor === cursor) throw new Error('Supabase SEO pagination did not advance.')
    cursor = nextCursor
  }
}

async function loadProducts() {
  const base = process.env.SUPABASE_URL || process.env.VITE_SUPABASE_URL
  const key = process.env.SUPABASE_SERVICE_ROLE_KEY || process.env.VITE_SUPABASE_ANON_KEY
  if (base && key) {
    try {
      const query = `${base.replace(/\/$/, '')}/rest/v1/pod_products?select=status,id,handle,title,subtitle,description,price,compare_at,image,seo,seo_status,inventory,sku,taxonomy,content_blocks,pod_product_options(name,sort_order,pod_product_option_values(label,sort_order)),product_group,custom_fields,media,pod_product_variants(id,price,compare_at,inventory,reserved_inventory,status,sku,option_values,image,barcode),updated_at&status=eq.PUBLISHED&seo_status=eq.INDEXABLE&order=id.asc`
      const rows = await fetchRows(query, key)
      if (Array.isArray(rows)) return rows.map(normalizeProduct).sort(storefrontOrder)
    } catch (error) {
      if (!/42703|column[^]*seo_status[^]*does not exist/i.test(String(error?.message || error))) throw error
      // Older deployments may not have the gate column yet. In that case only
      // rows carrying the explicit structured status can be generated.
      try {
        const legacyQuery = `${base.replace(/\/$/, '')}/rest/v1/pod_products?select=status,id,handle,title,subtitle,description,price,compare_at,image,seo,inventory,sku,taxonomy,content_blocks,pod_product_options(name,sort_order,pod_product_option_values(label,sort_order)),product_group,custom_fields,media,pod_product_variants(id,price,compare_at,inventory,reserved_inventory,status,sku,option_values,image,barcode),updated_at&status=eq.PUBLISHED&order=id.asc`
        const legacyRows = await fetchRows(legacyQuery, key)
        return (Array.isArray(legacyRows) ? legacyRows : []).filter(row => String(row.seo?.status || '').toUpperCase() === 'INDEXABLE').map(normalizeProduct).sort(storefrontOrder)
      } catch (legacyError) {
        // A configured production database that is temporarily unavailable is
        // not permission to publish the bundled demo catalogue. Fail the
        // build instead of silently replacing every product page with a shell.
        throw new Error(`Live catalogue unavailable while generating SEO pages: ${legacyError.message}`)
      }
    }
  }
  if (process.env.VERCEL) throw new Error('Production SEO build requires the live Supabase catalogue; demo catalogue is not publishable.')
  return buildFallbackCatalog(fallbackProducts).map(normalizeProduct)
}

function relatedProductLinks(product, products) {
  const league = String(product.taxonomy?.league || '').toLowerCase()
  const team = normalizeTeamSlug(league, product.taxonomy?.team || '')
  const related = products.filter(candidate => candidate.handle !== product.handle && (
    league && String(candidate.taxonomy?.league || '').toLowerCase() === league ||
    team && normalizeTeamSlug(league, candidate.taxonomy?.team || '') === team
  )).slice(0, 8)
  return related.map(candidate => `<li><a href="/product/${slug(candidate.handle)}">${escapeHtml(candidate.title)}</a></li>`).join('')
}

// Published rows that fail the SEO gate still need a deterministic HTML
// response with `noindex`. Without this companion query, a direct request to
// an old published-but-blocked handle would fall through to the SPA shell,
// whose homepage metadata says `index,follow` before the client can resolve
// the route. These rows are never included in the shop ItemList or sitemap.
async function loadBlockedProducts() {
  const base = process.env.SUPABASE_URL || process.env.VITE_SUPABASE_URL
  const key = process.env.SUPABASE_SERVICE_ROLE_KEY || process.env.VITE_SUPABASE_ANON_KEY
  if (!base || !key) return []
  try {
    const query = `${base.replace(/\/$/, '')}/rest/v1/pod_products?select=status,id,handle,title,subtitle,description,price,compare_at,image,seo,seo_status,inventory,sku,taxonomy,content_blocks,pod_product_options(name,sort_order,pod_product_option_values(label,sort_order)),media,pod_product_variants(id,price,compare_at,inventory,reserved_inventory,status,sku,option_values,image,barcode),updated_at&status=eq.PUBLISHED&seo_status=neq.INDEXABLE&order=id.asc`
    const rows = await fetchRows(query, key)
    return (Array.isArray(rows) ? rows : []).map(normalizeProduct)
  } catch (error) {
    if (/42703|column[^]*seo_status[^]*does not exist/i.test(String(error?.message || error))) return []
    throw error
  }
}

async function loadCollections() {
  const base = process.env.SUPABASE_URL || process.env.VITE_SUPABASE_URL
  const key = process.env.SUPABASE_SERVICE_ROLE_KEY || process.env.VITE_SUPABASE_ANON_KEY
  if (!base || !key) return []
  try {
    const query = `${base.replace(/\/$/, '')}/rest/v1/pod_collections?select=id,handle,name,description,hero_image,seo,updated_at,pod_collection_products(product_id,sort_order)&status=eq.PUBLISHED&order=id.asc`
    const rows = await fetchRows(query, key)
    return (Array.isArray(rows) ? rows : []).map(row => ({
      handle:text(row.handle || row.id),
      title:text(row.seo?.title || row.name, 'Extra Time collection'),
      description:text(row.seo?.description || row.description, 'Explore the latest Extra Time football jersey collection.'),
      image:absolute(row.hero_image || '/assets/hero-tunnel.webp'),
      productIds:(row.pod_collection_products || []).sort((a,b) => Number(a.sort_order || 0) - Number(b.sort_order || 0)).map(link => link.product_id),
      updatedAt:row.updated_at || ''
    })).filter(row => row.handle && String((rows.find(item => item.handle === row.handle)?.seo || {}).status || '').toUpperCase() === 'INDEXABLE')
  } catch (error) {
    console.warn(`[seo] Live collections unavailable; product pages will still be generated. ${error.message}`)
    return []
  }
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

function pageHtml(shell, { path, title, description, image, noindex = false, fallback, schema, bootstrap = '' }) {
  const canonical = `${PUBLIC_ORIGIN}${path === '/' ? '/' : path}`
  let html = shell
    .replace(/<html[^>]*>/i, '<html lang="en-US">')
    .replace(/<title>[\s\S]*?<\/title>/i, `<title>${escapeHtml(title)}</title>`)
    .replace(/<link\s+rel=["']canonical["'][^>]*>/i, `<link rel="canonical" href="${escapeHtml(canonical)}" />`)
    .replace(/<link\s+rel=["']preload["'][^>]*id=["']route-lcp-image["'][^>]*>/i, `<link rel="preload" as="image" href="${escapeHtml(image)}" fetchpriority="high" id="route-lcp-image" />`)
  const metaDescription = path.startsWith('/product/') ? cleanSeoText(description) : seoDescription(description, '', 160)
  html = upsertMeta(html, 'name', 'description', metaDescription)
  html = upsertMeta(html, 'name', 'robots', noindex ? 'noindex,nofollow' : 'index,follow,max-image-preview:large,max-snippet:-1,max-video-preview:-1')
  html = upsertMeta(html, 'name', 'googlebot', noindex ? 'noindex,nofollow' : 'index,follow')
  html = upsertMeta(html, 'property', 'og:title', title)
  html = upsertMeta(html, 'property', 'og:description', metaDescription)
  html = upsertMeta(html, 'property', 'og:url', canonical)
  html = upsertMeta(html, 'property', 'og:image', image)
  html = upsertMeta(html, 'property', 'og:image:alt', title)
  html = upsertMeta(html, 'property', 'og:type', path.startsWith('/product/') ? 'product' : 'website')
  html = upsertMeta(html, 'name', 'twitter:title', title)
  html = upsertMeta(html, 'name', 'twitter:description', metaDescription)
  html = upsertMeta(html, 'name', 'twitter:image', image)
  html = html.replace(/<link\s+rel=["']alternate["'][^>]*hreflang=["'](?:en-US|x-default)["'][^>]*>\s*/gi, '')
  const structured = schema ? `    <script type="application/ld+json" id="route-structured-data">${safeJson(schema)}</script>\n` : ''
  html = html.replace('</head>', `    <link rel="alternate" hreflang="en-US" href="${escapeHtml(canonical)}" />\n    <link rel="alternate" hreflang="x-default" href="${escapeHtml(canonical)}" />\n${structured}  </head>`)
  if (featuredCustomProduct && !html.includes('id="jersevo-custom-product"')) html = html.replace('</head>', `    <script type="application/json" id="jersevo-custom-product">${safeJson({ id:featuredCustomProduct.id, handle:featuredCustomProduct.handle, image:featuredCustomProduct.image })}</script>\n  </head>`)
  if (fallback) {
    const marked = `<!-- SEO_FALLBACK_START -->${fallback}<!-- SEO_FALLBACK_END -->`
    html = html.includes('<!-- SEO_FALLBACK_START -->')
      ? html.replace(/<!-- SEO_FALLBACK_START -->[\s\S]*?<!-- SEO_FALLBACK_END -->/, marked)
      : html.replace('<div id="root"></div>', `<div id="root">${marked}</div>`)
  }
  if (bootstrap) html = html.replace('</head>', `${bootstrap}</head>`)
  return html
}

async function writePage(path, html) {
  const target = join(DIST, path === '/' ? 'index.html' : path.replace(/^\//, '').replace(/\/$/, ''), 'index.html')
  await mkdir(dirname(target), { recursive:true })
  await writeFile(target, html)
  if (/<meta name="robots" content="noindex/i.test(html)) return null
  const entry = { path }
  sitemapEntries.push(entry)
  return entry
}

// A live catalogue can contain thousands of products.  Writing every PDP
// serially turns a perfectly healthy build into a 10–15 minute deployment and
// makes a fresh release look like the catalogue is unavailable.  Keep the
// output deterministic per page, but let a bounded batch use the build
// machine's filesystem concurrently.
async function writePagesInBatches(items, writer, batchSize = 32) {
  for (let offset = 0; offset < items.length; offset += batchSize) {
    await Promise.all(items.slice(offset, offset + batchSize).map(writer))
  }
}

async function writeCatalogPagination(basePath, rows, title, description, image) {
  const totalPages = pageCount(rows.length)
  for (let page = 2; page <= totalPages; page += 1) {
    const path = catalogPagePath(basePath, page)
    const pageProducts = rows.slice((page - 1) * CATALOG_PAGE_SIZE, page * CATALOG_PAGE_SIZE)
    const prev = catalogPagePath(basePath, page - 1)
    const next = page < totalPages ? catalogPagePath(basePath, page + 1) : ''
    const links = `<nav aria-label="Catalogue pages"><a href="${prev}">Previous page</a>${next ? ` · <a href="${next}">Next page</a>` : ''}</nav>`
    const fallback = `<main class="seo-fallback"><h1>${escapeHtml(title)} · Page ${page}</h1><p>${escapeHtml(description)}</p><ul>${pageProducts.map(product => `<li><a href="/product/${slug(product.handle)}">${escapeHtml(product.title)}</a></li>`).join('')}</ul>${links}</main>`
    await writePage(path, pageHtml(shell, {
      path,
      title:`${title} · Page ${page} — Jersevo`,
      description,
      image,
      fallback,
      schema:[
        { '@context':'https://schema.org', '@type':'CollectionPage', name:title, url:`${PUBLIC_ORIGIN}${path}`, description, isPartOf:{ '@type':'WebSite', url:`${PUBLIC_ORIGIN}/` } },
        { '@context':'https://schema.org', '@type':'ItemList', itemListElement:pageProducts.map((product,index) => ({ '@type':'ListItem', position:(page - 1) * CATALOG_PAGE_SIZE + index + 1, url:`${PUBLIC_ORIGIN}/product/${slug(product.handle)}`, name:product.title })) },
        breadcrumbSchema([{name:'Home',url:`${PUBLIC_ORIGIN}/`},{name:'Shop',url:`${PUBLIC_ORIGIN}/shop`},{name:`${title} page ${page}`,url:`${PUBLIC_ORIGIN}${path}`}])
      ]
    }))
  }
}

const shell = await readFile(join(DIST, 'index.html'), 'utf8')
const products = await loadProducts()
featuredCustomProduct = products.find(product => product.customFields?.length && product.inventory > 0 && /jersey/i.test(product.title || ''))
  || products.find(product => product.customFields?.length && product.inventory > 0)
const blockedProducts = await loadBlockedProducts()
const collections = await loadCollections()
const TAXONOMY_MIN_PRODUCTS = 6
const navigationRows = new Map()
for (const product of products) {
  // Navigation only needs aggregate counts.  Keeping one row per source
  // brand made this file grow to ~470 KB for the current catalogue.  Fold
  // brands into an array on the aggregate row so the menu keeps its brand
  // filter without repeating the same league/team/product tuple.
  const row = { taxonomy:{league:product.taxonomy?.league || '',team:product.taxonomy?.team || '',category:product.taxonomy?.category || ''},productGroup:product.productGroup,type:product.type,customFields:product.customFields?.length ? [{key:'name'}] : [], ...(product.taxonomy?.brand ? { brands:[product.taxonomy.brand] } : {}) }
  const key = JSON.stringify({ ...row, brands:[] })
  const previous = navigationRows.get(key)
  const brands = [...new Set([...(previous?.brands || []), ...(row.brands || [])])]
  navigationRows.set(key, { ...row, ...(brands.length ? { brands } : {}), count:(previous?.count || 0) + 1 })
}
await writeFile(join(DIST,'catalog-navigation.json'),JSON.stringify([...navigationRows.values()]))

const home = pageHtml(shell, {
  path:'/',
  title:'Custom Jerseys & Personalized Fan Gear | Jersevo',
  description:'Design custom jerseys and personalized fan gear with your name, number and approved listing options. Browse football, baseball, basketball and soccer-inspired styles at Jersevo.',
  image:absolute('/assets/hero-tunnel.webp'),
  fallback:`<main class="seo-fallback"><h1>Your name. Your number. Your jersey.</h1><p>Jersevo makes designer-led custom jerseys and personalized fan gear. Choose a design, add your name and number, and preview your piece before checkout.</p><p><a href="/shop">Shop personalized jerseys</a> · <a href="${featuredCustomProduct ? `/product/${slug(featuredCustomProduct.handle)}?custom=1` : '/shop'}">Create your jersey</a> · <a href="/about">Meet the studio</a></p><nav aria-label="Shop by league">${LEAGUE_TAXONOMY.map(league => `<a href="${leaguePath(league)}">${escapeHtml(league.name)} custom fan gear</a>`).join(' · ')}</nav><nav aria-label="Shop by category">${CATALOG_CATEGORY_PAGES.map(category => `<a href="/category/${category.handle}">${escapeHtml(category.label)}</a>`).join(' · ')}</nav></main>`
})
await writeFile(join(DIST, 'index.html'), home)
sitemapEntries.push({path:'/'})

await writePagesInBatches(products, async product => {
  const path = `/product/${slug(product.handle)}`
  const metadata = productSeoMetadata(product,PUBLIC_ORIGIN)
  const related = relatedProducts(product,products)
  const html = pageHtml(shell, {
    path,
    title:metadata.title,
    description:metadata.description,
    image:product.image,
    fallback:renderProductContent(product,related),
    schema:productStructuredData(product,PUBLIC_ORIGIN),
    bootstrap:productBootstrap(product,related)
  })
  const entry = await writePage(path, html)
  if (entry) {
    entry.lastmod = product.updatedAt
    entry.images = product.images
  }
})

await writePagesInBatches(blockedProducts, async product => {
  const path = `/product/${slug(product.handle)}`
  await writePage(path, pageHtml(shell, {
    path,
    title:`${product.title} — Extra Time`,
    description:'This product page is not currently available for organic search.',
    image:product.image,
    noindex:true,
    fallback:renderProductContent(product),
    bootstrap:productBootstrap(product)
  }))
})

const itemList = products.slice(0,CATALOG_PAGE_SIZE).map((product, index) => ({ '@type':'ListItem', position:index + 1, url:`${PUBLIC_ORIGIN}/product/${slug(product.handle)}`, name:product.title, image:product.image }))
await writePage('/shop', pageHtml(shell, {
  path:'/shop',
  title:'Shop fan gear by sport, team and product | Jersevo',
  description:'Start with a sport, find your team or choose the product you want. Browse live jerseys, headwear and fan gear at Jersevo.',
  image:absolute(SHOP_COVER.src),
  fallback:`<main class="seo-fallback"><h1>Find your route to the gear</h1><p>Shop by sport, team or product type. The full published catalog follows.</p><nav aria-label="Shop by sport">${LEAGUE_TAXONOMY.map(league => `<a href="${leaguePath(league)}">${escapeHtml(league.name)}</a>`).join(' · ')}</nav><nav aria-label="Find a team"><a href="/teams">Browse teams</a> · <a href="/sports">Explore sports</a></nav><nav aria-label="Shop by category">${CATALOG_CATEGORY_PAGES.map(category => `<a href="/category/${category.handle}">${escapeHtml(category.label)}</a>`).join(' · ')}</nav><h2>All products</h2><ul>${products.slice(0,CATALOG_PAGE_SIZE).map(product => `<li><a href="/product/${slug(product.handle)}">${escapeHtml(product.title)}</a></li>`).join('')}</ul>${products.length > CATALOG_PAGE_SIZE ? '<a href="/shop/page/2">Next page</a>' : ''}</main>`,
  schema:[{ '@context':'https://schema.org', '@type':'ItemList', itemListElement:itemList },breadcrumbSchema([{name:'Home',url:`${PUBLIC_ORIGIN}/`},{name:'Shop',url:`${PUBLIC_ORIGIN}/shop`}])]
}))
await writeCatalogPagination('/shop', products, 'All fan gear', 'Shop published Jersevo fan gear across leagues, teams and product categories.', absolute(SHOP_COVER.src))

const leagueCountsForIndex = new Map()
const teamCountsForIndex = new Map()
for (const product of products) {
  const league = String(product.taxonomy?.league || '').toLowerCase()
  if (!league) continue
  leagueCountsForIndex.set(league,(leagueCountsForIndex.get(league) || 0) + 1)
  const team = normalizeTeamSlug(league,product.taxonomy?.team || '')
  if (team) teamCountsForIndex.set(`${league}/${team}`,(teamCountsForIndex.get(`${league}/${team}`) || 0) + 1)
}
const availableLeagues = LEAGUE_TAXONOMY.filter(league => leagueCountsForIndex.get(league.key) > 0)
await writePage('/sports', pageHtml(shell, {
  path:'/sports', title:'Shop sports and leagues | Jersevo',
  description:'Explore football, baseball, basketball, hockey, soccer and college fan gear by league and team.',
  image:absolute('/assets/hero-tunnel.webp'),
  fallback:`<main class="seo-fallback"><h1>Choose a sport</h1><p>Follow your league into the teams and gear that matter to you.</p>${[...new Set(availableLeagues.map(league => league.sport))].map(sport => `<section><h2>${escapeHtml(sport)}</h2><ul>${availableLeagues.filter(league => league.sport === sport).map(league => `<li><a href="${leaguePath(league)}">${escapeHtml(league.name)}</a></li>`).join('')}</ul></section>`).join('')}</main>`,
  schema:[{ '@context':'https://schema.org', '@type':'CollectionPage', name:'Sports and leagues at Jersevo', url:`${PUBLIC_ORIGIN}/sports` },breadcrumbSchema([{name:'Home',url:`${PUBLIC_ORIGIN}/`},{name:'Sports',url:`${PUBLIC_ORIGIN}/sports`}])]
}))
await writePage('/teams', pageHtml(shell, {
  path:'/teams', title:'Find your team | Jersevo',
  description:'Find your team across the NFL, MLB, NBA, NHL, MLS and college sports, then browse current fan gear.',
  image:absolute('/assets/hero-tunnel.webp'),
  fallback:`<main class="seo-fallback"><h1>Find your team</h1><p>Browse teams with published fan gear by league.</p>${availableLeagues.map(league => `<section><h2><a href="${leaguePath(league)}">${escapeHtml(league.name)}</a></h2><ul>${league.teams.filter(team => (teamCountsForIndex.get(`${league.key}/${team.slug}`) || 0) >= TAXONOMY_MIN_PRODUCTS).map(team => `<li><a href="${teamPath(league.key,team)}">${escapeHtml(team.name)}</a></li>`).join('')}</ul></section>`).join('')}</main>`,
  schema:[{ '@context':'https://schema.org', '@type':'CollectionPage', name:'Find your team at Jersevo', url:`${PUBLIC_ORIGIN}/teams` },breadcrumbSchema([{name:'Home',url:`${PUBLIC_ORIGIN}/`},{name:'Teams',url:`${PUBLIC_ORIGIN}/teams`}])]
}))
await writePage('/collections', pageHtml(shell, {
  path:'/collections', title:'Shop collections | Jersevo',
  description:'Explore currently published Jersevo collections and shop fan gear by sport, team and product type.',
  image:absolute('/assets/hero-tunnel.webp'), noindex:collections.length === 0,
  fallback:`<main class="seo-fallback"><h1>Explore collections</h1>${collections.length ? `<ul>${collections.map(collection => `<li><a href="/collection/${slug(collection.handle)}">${escapeHtml(collection.title)}</a></li>`).join('')}</ul>` : '<p>Editorial collections are being prepared. Browse the live catalog by sport, team or product type.</p><a href="/shop">Browse all gear</a>'}</main>`,
  schema:{ '@context':'https://schema.org', '@type':'CollectionPage', name:'Jersevo collections', url:`${PUBLIC_ORIGIN}/collections` }
}))

for (const collection of collections) {
  const path = `/collection/${slug(collection.handle)}`
  const byId = new Map(products.map(product => [product.id,product]))
  const collectionProducts = collection.productIds.map(id => byId.get(id)).filter(Boolean)
  const indexable = collectionProducts.length >= TAXONOMY_MIN_PRODUCTS
  await writePage(path, pageHtml(shell, {
    path,
    title:`${collection.title} — Extra Time`,
    description:collection.description,
    image:collection.image,
    noindex:!indexable,
    fallback:`<main class="seo-fallback"><h1>${escapeHtml(collection.title)}</h1><p>${escapeHtml(collection.description)}</p><ul>${collectionProducts.slice(0,CATALOG_PAGE_SIZE).map(product => `<li><a href="/product/${slug(product.handle)}">${escapeHtml(product.title)}</a></li>`).join('')}</ul>${collectionProducts.length > CATALOG_PAGE_SIZE ? `<a href="${path}/page/2">Next page</a>` : ''}</main>`,
    schema:[{ '@context':'https://schema.org', '@type':'CollectionPage', name:collection.title, description:collection.description, url:`${PUBLIC_ORIGIN}${path}`, image:collection.image },breadcrumbSchema([{name:'Home',url:`${PUBLIC_ORIGIN}/`},{name:'Shop',url:`${PUBLIC_ORIGIN}/shop`},{name:collection.title,url:`${PUBLIC_ORIGIN}${path}`}])]
  }))
  if (indexable) await writeCatalogPagination(path, collectionProducts, collection.title, collection.description, collection.image)
}

const categoryCounts = new Map(ALL_CATALOG_CATEGORY_PAGES.map(category => [category.handle, products.filter(product => productMatchesCatalogCategory(product, category)).length]))
for (const category of ALL_CATALOG_CATEGORY_PAGES) {
  const path = `/category/${category.handle}`
  const count = categoryCounts.get(category.handle) || 0
  const indexable = count >= TAXONOMY_MIN_PRODUCTS
  const categoryProducts = products.filter(product => productMatchesCatalogCategory(product, category))
  await writePage(path, pageHtml(shell, {
    path,
    title:`${category.label} — Jersevo`,
    description:category.description,
    image:absolute('/assets/jersey-black.webp'),
    noindex:!indexable,
    fallback:`<main class="seo-fallback"><h1>${escapeHtml(category.label)}</h1><p>${escapeHtml(category.description)}</p><ul>${categoryProducts.slice(0,CATALOG_PAGE_SIZE).map(product => `<li><a href="/product/${slug(product.handle)}">${escapeHtml(product.title)}</a></li>`).join('')}</ul>${categoryProducts.length > CATALOG_PAGE_SIZE ? `<a href="${path}/page/2">Next page</a>` : ''}</main>`,
    schema:[{ '@context':'https://schema.org', '@type':'CollectionPage', name:category.label, description:category.description, url:`${PUBLIC_ORIGIN}${path}`, numberOfItems:count, isPartOf:{ '@type':'WebSite', url:`${PUBLIC_ORIGIN}/` } },breadcrumbSchema([{name:'Home',url:`${PUBLIC_ORIGIN}/`},{name:'Shop',url:`${PUBLIC_ORIGIN}/shop`},{name:category.label,url:`${PUBLIC_ORIGIN}${path}`}])]
  }))
  if (indexable) await writeCatalogPagination(path, categoryProducts, category.label, category.description, absolute('/assets/jersey-black.webp'))
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
for (const league of LEAGUE_TAXONOMY) {
  const path = leaguePath(league)
  const leagueIndexable = (taxonomyCounts.get(`league:${league.key}`) || 0) >= TAXONOMY_MIN_PRODUCTS
  const leagueProducts = products.filter(product => String(product.taxonomy?.league || '').toLowerCase() === league.key)
  const leagueGroups = [...new Map(leagueProducts.reduce((map, product) => {
    const group = String(product.productGroup || '').trim()
    if (group) map.set(group, (map.get(group) || 0) + 1)
    return map
  }, new Map())).entries()].sort((a,b) => b[1] - a[1]).slice(0,8)
  const availableLeagueTeams = league.teams.filter(team => (taxonomyCounts.get(`team:${league.key}/${team.slug}`) || 0) > 0)
  await writePage(path, pageHtml(shell, {
    path,
    title:`${league.name} fan gear — Jersevo`,
    description:league.description,
    image:absolute(leagueCover(league.key)?.src || leagueProducts[0]?.image || league.media?.src || '/assets/editorial-player.webp'),
    noindex:!leagueIndexable,
    fallback:`<main class="seo-fallback"><h1>${escapeHtml(league.name)} fan gear</h1><p>${escapeHtml(league.description)}</p><section><h2>Find your ${escapeHtml(league.name)} team</h2><ul>${availableLeagueTeams.slice(0,16).map(team => `<li><a href="${teamPath(league.key,team)}">${escapeHtml(team.name)}</a> (${taxonomyCounts.get(`team:${league.key}/${team.slug}`) || 0})</li>`).join('')}</ul></section><section><h2>Shop ${escapeHtml(league.name)} by product</h2><ul>${leagueGroups.map(([group,count]) => `<li>${escapeHtml(group)} (${count})</li>`).join('')}</ul></section><section><h2>Current ${escapeHtml(league.name)} gear</h2><ul>${leagueProducts.slice(0,CATALOG_PAGE_SIZE).map(product => `<li><a href="/product/${slug(product.handle)}">${escapeHtml(product.title)}</a></li>`).join('')}</ul>${leagueProducts.length > CATALOG_PAGE_SIZE ? `<a href="${path}/page/2">Next page</a>` : ''}</section></main>`,
    schema:[{ '@context':'https://schema.org', '@type':'CollectionPage', name:`${league.name} fan gear`, description:league.description, url:`${PUBLIC_ORIGIN}${path}`, numberOfItems:leagueProducts.length, isPartOf:{ '@type':'WebSite', url:`${PUBLIC_ORIGIN}/` } },breadcrumbSchema([{name:'Home',url:`${PUBLIC_ORIGIN}/`},{name:'Shop',url:`${PUBLIC_ORIGIN}/shop`},{name:league.name,url:`${PUBLIC_ORIGIN}${path}`}])]
  }))
  if (leagueIndexable) await writeCatalogPagination(path, leagueProducts, `${league.name} fan gear`, league.description, absolute(leagueCover(league.key)?.src || '/assets/editorial-player.webp'))
  for (const team of league.teams) {
    const teamPage = teamPath(league.key, team)
    const teamIndexable = (taxonomyCounts.get(`team:${league.key}/${team.slug}`) || 0) >= TAXONOMY_MIN_PRODUCTS
    const teamProducts = leagueProducts.filter(product => normalizeTeamSlug(league.key, product.taxonomy?.team || '') === team.slug)
    const teamGroups = [...teamProducts.reduce((map, product) => {
      const group = String(product.productGroup || '').trim()
      if (group) map.set(group, (map.get(group) || 0) + 1)
      return map
    }, new Map()).entries()].sort((a,b) => b[1] - a[1]).slice(0,8)
    await writePage(teamPage, pageHtml(shell, {
      path:teamPage,
      title:`${team.name} fan gear — Jersevo`,
      description:`Shop ${team.name} fan gear, including available jerseys, caps and apparel, with tracked US delivery.`,
      image:absolute(teamProducts[0]?.image || team.media?.src || '/assets/editorial-player.webp'),
      noindex:!teamIndexable,
      fallback:`<main class="seo-fallback"><h1>${escapeHtml(team.name)} fan gear</h1><p>Browse ${escapeHtml(team.name)} fan gear by product type. Prices, available options and photos are shown on each current listing.</p><p><a href="${path}">Explore all ${escapeHtml(league.name)} teams</a></p><section><h2>Shop ${escapeHtml(team.name)} by product</h2><ul>${teamGroups.map(([group,count]) => `<li>${escapeHtml(group)} (${count})</li>`).join('')}</ul></section><section><h2>Current ${escapeHtml(team.name)} gear</h2><ul>${teamProducts.slice(0,CATALOG_PAGE_SIZE).map(product => `<li><a href="/product/${slug(product.handle)}">${escapeHtml(product.title)}</a></li>`).join('')}</ul>${teamProducts.length > CATALOG_PAGE_SIZE ? `<a href="${teamPage}/page/2">Next page</a>` : ''}</section></main>`,
      schema:[{ '@context':'https://schema.org', '@type':'CollectionPage', name:`${team.name} fan gear`, description:`Browse current ${team.name} fan gear by product type and review photos, prices and available options on each listing.`, url:`${PUBLIC_ORIGIN}${teamPage}`, numberOfItems:teamProducts.length, isPartOf:{ '@type':'CollectionPage', url:`${PUBLIC_ORIGIN}${path}` } },breadcrumbSchema([{name:'Home',url:`${PUBLIC_ORIGIN}/`},{name:'Shop',url:`${PUBLIC_ORIGIN}/shop`},{name:league.name,url:`${PUBLIC_ORIGIN}${path}`},{name:team.name,url:`${PUBLIC_ORIGIN}${teamPage}`}])]
    }))
    if (teamIndexable) await writeCatalogPagination(teamPage, teamProducts, `${team.name} fan gear`, `Shop ${team.name} fan gear, including available jerseys, caps and apparel, with tracked US delivery.`, absolute('/assets/editorial-player.webp'))
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
  const policy = TRUST_PAGES[path.slice(1)]
  const policyBody = policy ? (policy.sections || []).map(section => `<section><h2>${escapeHtml(section.heading)}</h2><p>${escapeHtml(section.body)}</p><ul>${section.list.map(item=>`<li>${escapeHtml(item)}</li>`).join('')}</ul></section>`).join('') : ''
  const policyFaq = policy ? `<section><h2>Common questions</h2>${policy.faqs.map(([q,a])=>`<h3>${escapeHtml(q)}</h3><p>${escapeHtml(a)}</p>`).join('')}</section>` : ''
  const publicContact = `<section><h2>Jersevo</h2><p>Jersevo operates the Extra Time storefront from Texas, United States. For order, privacy or policy questions, email <a href="mailto:support@jersevo.com">support@jersevo.com</a>.</p></section>`
  await writePage(path, pageHtml(shell, {
    path, title, description, image:absolute(pageImage), noindex:['/vault','/journal'].includes(path),
    fallback:`<main class="seo-fallback"><h1>${escapeHtml(pageHeading)}</h1><p>${escapeHtml(policy?.intro || description)}</p>${policyBody}${policyFaq}${publicContact}<nav><a href="/shipping">Shipping</a> · <a href="/returns">Returns</a> · <a href="/warranty">Warranty</a> · <a href="/shop">Shop</a></nav></main>`,
    schema:{ '@context':'https://schema.org', '@type':'WebPage', name:title, description, url:`${PUBLIC_ORIGIN}${path}`, inLanguage:'en-US', publisher:{ '@type':'Organization', name:'Jersevo', alternateName:'Extra Time', email:'support@jersevo.com', address:{ '@type':'PostalAddress', addressRegion:'TX', addressCountry:'US' } } }
  }))
}

for (const path of ['/custom', '/studio', '/account', '/account/membership', '/admin', '/checkout', '/track-order']) {
  await writePage(path, pageHtml(shell, {
    path, title:'Extra Time', description:'Extra Time account and studio tools.', image:absolute('/assets/hero-tunnel.webp'), noindex:true,
    fallback:'<main class="seo-fallback"><h1>Extra Time</h1></main>', schema:{ '@context':'https://schema.org', '@type':'WebPage', name:'Extra Time', url:`${PUBLIC_ORIGIN}${path}` }
  }))
}

console.log(`[seo] Generated ${products.length} indexable product pages, ${blockedProducts.length} blocked product pages, ${collections.length} collection pages and ${staticPages.length} static pages.`)
await writeFile(join(DIST,'sitemap.xml'),renderSitemap(sitemapEntries,PUBLIC_ORIGIN))
await writeFile(join(DIST,'404.html'),pageHtml(shell,{path:'/404',title:'Page not found | Jersevo',description:'This page is not available.',image:absolute('/assets/hero-tunnel.webp'),noindex:true,fallback:'<main class="seo-fallback"><h1>Page not found</h1><p>This URL is not available.</p><a href="/shop">Browse the shop</a></main>'}))
await writeFile(join(DIST,'seo-build-manifest.json'),JSON.stringify({generatedAt:new Date().toISOString(),indexable:sitemapEntries.length,products:products.length,blocked:blockedProducts.length}))
