import { mkdir, readFile, readdir, unlink, writeFile } from 'node:fs/promises'
import { dirname, join } from 'node:path'
import { products as fallbackProducts } from '../src/data.js'
import { buildFallbackCatalog, prepareStorefrontProduct } from '../src/lib/storefront-model.js'
import { hasCustom3DDesigner, isCustom3DOnlyProduct } from '../src/lib/custom-3d.js'
import { ALL_LEAGUE_TAXONOMY, leaguePath, teamPath, normalizeTeamSlug } from '../src/lib/league-taxonomy.js'
import { SHOP_COVER, leagueCover } from '../src/lib/league-covers.js'
import { ALL_CATALOG_CATEGORY_PAGES, CATALOG_CATEGORY_PAGES, normalizeAccessoryTaxonomy, productMatchesCatalogCategory } from '../src/lib/catalog-taxonomy.js'
import { CATALOG_PAGE_SIZE, catalogPagePath, pageCount } from '../src/lib/catalog-pagination.js'
import { validateCatalogTaxonomy } from '../src/lib/taxonomy-validator.js'
import { productMatchesTeamProductType, teamProductTypeCounts, teamProductTypeForProduct, teamProductTypePath } from '../src/lib/team-product-pages.js'
import { resolveCollectionArtwork } from '../src/lib/collection-artwork.js'
import { cleanSeoText, seoDescription } from '../src/lib/seo-text.js'
import { productSeoMetadata, productStructuredData, relatedProducts, safeJson } from '../src/lib/product-seo.js'
import { TRUST_PAGES } from '../src/lib/trust-pages.js'
import { catalogPageOverrideFor, normalizeCatalogPageOverrides } from '../src/lib/catalog-page-overrides.js'
import { renderProductContent, renderSitemap, renderSitemapIndex } from './seo-render.mjs'
import { fetchPublishedProductRows, fetchSeoRows } from './seo-catalog-snapshot.mjs'

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

const PRODUCT_SELECT = 'status,id,handle,title,subtitle,description,price,compare_at,image,seo,seo_status,inventory,sku,taxonomy,tags,content_blocks,pod_product_options(name,sort_order,pod_product_option_values(label,sort_order)),product_group,custom_fields,media,pod_product_variants(id,price,compare_at,inventory,reserved_inventory,status,sku,option_values,image,barcode),updated_at'
const LEGACY_PRODUCT_SELECT = PRODUCT_SELECT.replace(',seo_status', '')
let productSnapshotPromise = null

async function loadProductSnapshot() {
  if (productSnapshotPromise) return productSnapshotPromise
  const base = process.env.SUPABASE_URL || process.env.VITE_SUPABASE_URL
  const key = process.env.SUPABASE_SERVICE_ROLE_KEY || process.env.VITE_SUPABASE_ANON_KEY
  if (base && key) {
    productSnapshotPromise = (async () => {
      const startedAt = Date.now()
      let lastReported = -1000
      const hydrate = select => fetchPublishedProductRows({
        base,
        key,
        select,
        detailPageSize:200,
        indexPageSize:1000,
        concurrency:4,
        onProgress:({ loaded,total,completedChunks,totalChunks }) => {
          if (loaded !== 0 && loaded !== total && loaded - lastReported < 1000) return
          lastReported = loaded
          console.log(`[seo] Catalogue snapshot ${loaded.toLocaleString('en-US')}/${total.toLocaleString('en-US')} products · ${completedChunks}/${totalChunks} detail ranges`)
        }
      })
      try {
        let rows
        try {
          rows = await hydrate(PRODUCT_SELECT)
        } catch (error) {
          if (!/42703|column[^]*seo_status[^]*does not exist/i.test(String(error?.message || error))) throw error
          console.warn('[seo] seo_status column is unavailable; using the structured SEO status stored in each listing.')
          rows = await hydrate(LEGACY_PRODUCT_SELECT)
        }
        const normalized = rows.map(normalizeProduct).sort(storefrontOrder)
        const indexable = normalized.filter(product => String(product.seoStatus || product.seo?.status || '').toUpperCase() === 'INDEXABLE')
        const blocked = normalized.filter(product => String(product.seoStatus || product.seo?.status || '').toUpperCase() !== 'INDEXABLE')
        const indexableIds = new Set(indexable.map(product => String(product.id)))
        const merchantRows = rows.filter(row => indexableIds.has(String(row.id)))
        console.log(`[seo] Catalogue snapshot complete: ${indexable.length.toLocaleString('en-US')} indexable, ${blocked.length.toLocaleString('en-US')} noindex · ${((Date.now() - startedAt) / 1000).toFixed(1)}s`)
        return { indexable, blocked, merchantRows, source:'supabase' }
      } catch (error) {
        // A configured production database that is temporarily unavailable is
        // not permission to publish the bundled demo catalogue. Fail the
        // build instead of silently replacing every product page with a shell.
        throw new Error(`Live catalogue unavailable while generating SEO pages: ${error.message}`)
      }
    })()
    return productSnapshotPromise
  }
  if (process.env.VERCEL) throw new Error('Production SEO build requires the live Supabase catalogue; demo catalogue is not publishable.')
  const indexable = buildFallbackCatalog(fallbackProducts).map(normalizeProduct)
  productSnapshotPromise = Promise.resolve({ indexable, blocked:[], merchantRows:[], source:'fallback' })
  return productSnapshotPromise
}

async function loadProducts() {
  return (await loadProductSnapshot()).indexable
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
  return (await loadProductSnapshot()).blocked
}

async function loadCollections() {
  const base = process.env.SUPABASE_URL || process.env.VITE_SUPABASE_URL
  const key = process.env.SUPABASE_SERVICE_ROLE_KEY || process.env.VITE_SUPABASE_ANON_KEY
  if (!base || !key) return []
  try {
    const query = `${base.replace(/\/$/, '')}/rest/v1/pod_collections?select=id,handle,name,description,hero_image,seo,updated_at,pod_collection_products(product_id,sort_order)&status=eq.PUBLISHED&order=id.asc`
    const rows = await fetchSeoRows(query, key, { pageSize:200, label:'collections' })
    return (Array.isArray(rows) ? rows : []).map(row => {
      const artwork = resolveCollectionArtwork({ ...row, hero:row.hero_image })
      return {
        handle:text(row.handle || row.id),
        title:text(row.seo?.title || row.name, 'Extra Time collection'),
        description:text(row.seo?.description || row.description, 'Explore the latest Extra Time football jersey collection.'),
        image:absolute(artwork.src || row.hero_image || '/assets/hero-tunnel.webp'),
        productIds:(row.pod_collection_products || []).sort((a,b) => Number(a.sort_order || 0) - Number(b.sort_order || 0)).map(link => link.product_id),
        updatedAt:row.updated_at || '',
        seoStatus:String(row.seo?.status || '').toUpperCase()
      }
    }).filter(row => row.handle)
  } catch (error) {
    console.warn(`[seo] Live collections unavailable; product pages will still be generated. ${error.message}`)
    return []
  }
}

async function loadCatalogPageOverrides() {
  const base = process.env.SUPABASE_URL || process.env.VITE_SUPABASE_URL
  const key = process.env.SUPABASE_SERVICE_ROLE_KEY || process.env.VITE_SUPABASE_ANON_KEY
  if (!base || !key) return {}
  try {
    const url = `${base.replace(/\/$/, '')}/rest/v1/pod_themes?select=definition&status=eq.PUBLISHED&order=updated_at.desc&limit=1`
    const response = await fetch(url, { headers:{ apikey:key, Authorization:`Bearer ${key}`, Accept:'application/json' }, signal:AbortSignal.timeout(30000) })
    if (!response.ok) throw new Error(`theme query returned ${response.status}`)
    const rows = await response.json()
    return normalizeCatalogPageOverrides(rows?.[0]?.definition?.content?.catalogPages)
  } catch (error) {
    console.warn(`[seo] Catalog page overrides unavailable; generated defaults will be used. ${error.message}`)
    return {}
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

function pageHtml(shell, { path, title, description, image, noindex = false, noindexRobots = 'noindex,nofollow', fallback, schema, bootstrap = '' }) {
  const canonical = `${PUBLIC_ORIGIN}${path === '/' ? '/' : path}`
  let html = shell
    .replace(/<html[^>]*>/i, '<html lang="en-US">')
    .replace(/<title>[\s\S]*?<\/title>/i, `<title>${escapeHtml(title)}</title>`)
    .replace(/<link\s+rel=["']canonical["'][^>]*>/i, `<link rel="canonical" href="${escapeHtml(canonical)}" />`)
    .replace(/<link\s+rel=["']preload["'][^>]*id=["']route-lcp-image["'][^>]*>/i, `<link rel="preload" as="image" href="${escapeHtml(image)}" fetchpriority="high" id="route-lcp-image" />`)
  const metaDescription = path.startsWith('/product/') ? cleanSeoText(description) : seoDescription(description, '', 160)
  html = upsertMeta(html, 'name', 'description', metaDescription)
  html = upsertMeta(html, 'name', 'robots', noindex ? noindexRobots : 'index,follow,max-image-preview:large,max-snippet:-1,max-video-preview:-1')
  html = upsertMeta(html, 'name', 'googlebot', noindex ? noindexRobots : 'index,follow')
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
  if (featuredCustomProduct && !html.includes('id="jersevo-custom-product"')) html = html.replace('</head>', `    <script type="application/json" id="jersevo-custom-product">${safeJson({ id:featuredCustomProduct.id, handle:featuredCustomProduct.handle, image:featuredCustomProduct.image, custom3d:true })}</script>\n  </head>`)
  if (fallback) {
    const marked = `<!-- SEO_FALLBACK_START -->${fallback}<!-- SEO_FALLBACK_END -->`
    html = html.includes('<!-- SEO_FALLBACK_START -->')
      ? html.replace(/<!-- SEO_FALLBACK_START -->[\s\S]*?<!-- SEO_FALLBACK_END -->/, marked)
      : html.replace('<div id="root"></div>', `<div id="root">${marked}</div>`)
  }
  if (bootstrap) html = html.replace('</head>', `${bootstrap}</head>`)
  return html
}

// Product pages share a small set of parent directories (for example every
// PDP lives under `dist/product`).  Calling mkdir recursively for every one
// of the 30k rows makes Vercel spend most of the build in filesystem metadata
// work. Cache the in-flight promise per directory so concurrent page batches
// only perform one mkdir operation per unique parent.
const preparedDirectories = new Map()
async function ensurePageDirectory(directory) {
  if (!preparedDirectories.has(directory)) preparedDirectories.set(directory, mkdir(directory, { recursive:true }))
  await preparedDirectories.get(directory)
}

async function writePage(path, html) {
  const target = join(DIST, path === '/' ? 'index.html' : path.replace(/^\//, '').replace(/\/$/, ''), 'index.html')
  await ensurePageDirectory(dirname(target))
  // A large parallel PDP batch can briefly race a recursive mkdir on hosted
  // filesystems. Re-create only the exact target directory and retry once so
  // an unrelated ENOENT cannot abort an otherwise valid deployment.
  try {
    await writeFile(target, html)
  } catch (error) {
    if (error?.code !== 'ENOENT') throw error
    await mkdir(dirname(target), { recursive:true })
    await writeFile(target, html)
  }
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
async function writePagesInBatches(items, writer, batchSize = 32, label = 'pages') {
  const startedAt = Date.now()
  let lastReported = 0
  if (items.length) console.log(`[seo] Writing ${items.length.toLocaleString('en-US')} ${label}…`)
  for (let offset = 0; offset < items.length; offset += batchSize) {
    await Promise.all(items.slice(offset, offset + batchSize).map(writer))
    const completed = Math.min(items.length, offset + batchSize)
    if (completed === items.length || completed - lastReported >= 1024) {
      lastReported = completed
      console.log(`[seo] Wrote ${completed.toLocaleString('en-US')}/${items.length.toLocaleString('en-US')} ${label} · ${((Date.now() - startedAt) / 1000).toFixed(1)}s`)
    }
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
// Keep taxonomy-invalid rows reachable for a deterministic noindex PDP, but
// never let them contribute to navigation counts, collection pages, schema or
// the sitemap. This prevents stale imported metadata from becoming an
// accidental organic landing page.
const productSnapshot = await loadProductSnapshot()
const loadedProducts = productSnapshot.indexable
const merchantSnapshotPath = String(process.env.MERCHANT_SOURCE_SNAPSHOT || '').trim()
if (merchantSnapshotPath && productSnapshot.source === 'supabase') {
  await mkdir(dirname(merchantSnapshotPath), { recursive:true })
  await writeFile(merchantSnapshotPath, JSON.stringify(productSnapshot.merchantRows))
  console.log(`[seo] Merchant source snapshot staged: ${productSnapshot.merchantRows.length.toLocaleString('en-US')} products.`)
}
const taxonomyBlockedProducts = loadedProducts.filter(product => !validateCatalogTaxonomy(product).valid)
const validatedProducts = loadedProducts.filter(product => validateCatalogTaxonomy(product).valid)
// 3D garment families are navigated from the noindex Custom Lab, not from
// the ordinary Shop/league/category SEO graph. Keep one private collection
// for the Custom page metadata, while every public catalogue/sitemap loop
// receives only conventional storefront products.
const customProducts = validatedProducts.filter(product => isCustom3DOnlyProduct(product)).slice(0, 12)
const products = validatedProducts.filter(product => !isCustom3DOnlyProduct(product))
const teamProductsByKey = new Map()
for (const product of products) {
  const league = String(product.taxonomy?.league || '').toLowerCase()
  const team = normalizeTeamSlug(league, product.taxonomy?.team || '')
  if (!league || !team) continue
  const key = `${league}/${team}`
  const bucket = teamProductsByKey.get(key)
  if (bucket) bucket.push(product)
  else teamProductsByKey.set(key,[product])
}
const teamProductTypeRouteSet = new Set()
for (const [key, rows] of teamProductsByKey) {
  const [league,team] = key.split('/')
  for (const type of teamProductTypeCounts(rows,{league,team})) teamProductTypeRouteSet.add(type.path)
}
featuredCustomProduct = customProducts.find(product => product.inventory > 0 && /jersey/i.test(product.title || ''))
  || customProducts.find(product => product.inventory > 0)
const blockedProducts = [...(await loadBlockedProducts()), ...taxonomyBlockedProducts]
const collections = await loadCollections()
const catalogPageOverrides = await loadCatalogPageOverrides()
const pageOverride = path => catalogPageOverrideFor(catalogPageOverrides, path)
const TAXONOMY_MIN_PRODUCTS = 6
const rowCollectionIsIndexable = collection => !['BLOCKED', 'NOINDEX'].includes(String(collection?.seoStatus || '').toUpperCase())
const navigationRows = new Map()
for (const product of products) {
  // Navigation only needs aggregate counts.  Keeping one row per source
  // brand made this file grow to ~470 KB for the current catalogue.  Fold
  // brands into an array on the aggregate row so the menu keeps its brand
  // filter without repeating the same league/team/product tuple.
  // Keep the deploy-time navigation index compact, but preserve the
  // deterministic accessory signals used by the Admin tree.  A compact row
  // cannot infer "bags" or "scarves" from a title after aggregation, so
  // dropping these fields makes the Admin under-count accessory pages even
  // though the same products are correctly present in the public sitemap.
  const taxonomy = normalizeAccessoryTaxonomy(product.taxonomy ? { ...product, taxonomy:product.taxonomy } : product)
  const designer = isCustom3DOnlyProduct(product) && product.designerConfig
    ? { provider:product.designerConfig.provider, productId:product.designerConfig.productId, manifest:product.designerConfig.manifest }
    : null
  const row = { taxonomy:{league:taxonomy.league || '',team:taxonomy.team || '',category:taxonomy.category || '',...(taxonomy.accessoryCategory ? { accessoryCategory:taxonomy.accessoryCategory } : {}),...(taxonomy.accessoryType ? { accessoryType:taxonomy.accessoryType } : {})},productGroup:product.productGroup,type:product.type,customFields:product.customFields?.length ? [{key:'name'}] : [], ...(designer ? { designerConfig:designer } : {}), ...(product.taxonomy?.brand ? { brands:[product.taxonomy.brand] } : {}) }
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
  fallback:`<main class="seo-fallback"><h1>Your name. Your number. Your jersey.</h1><p>Jersevo makes designer-led custom jerseys and personalized fan gear. Choose a design, add your name and number, and preview your piece before checkout.</p><p><a href="/shop">Shop personalized jerseys</a> · <a href="${featuredCustomProduct?.designerConfig?.productId ? `/custom/design?provider=${featuredCustomProduct.designerConfig.provider}&product=${featuredCustomProduct.designerConfig.productId}` : '/custom/design'}">Create your jersey</a> · <a href="/about">Meet the studio</a></p><nav aria-label="Shop by league">${ALL_LEAGUE_TAXONOMY.map(league => `<a href="${leaguePath(league)}">${escapeHtml(league.name)} custom fan gear</a>`).join(' · ')}</nav><nav aria-label="Shop by category">${CATALOG_CATEGORY_PAGES.map(category => `<a href="/category/${category.handle}">${escapeHtml(category.label)}</a>`).join(' · ')}</nav></main>`
})
await writeFile(join(DIST, 'index.html'), home)
sitemapEntries.push({path:'/'})

await writePagesInBatches(products, async product => {
  const path = `/product/${slug(product.handle)}`
  const metadata = productSeoMetadata(product,PUBLIC_ORIGIN)
  const related = relatedProducts(product,products)
  const type = teamProductTypeForProduct(product)
  const typePath = type ? teamProductTypePath(product.taxonomy?.league,product.taxonomy?.team,type) : ''
  const breadcrumbOptions = { includeTeamProductType:Boolean(typePath && teamProductTypeRouteSet.has(typePath)) }
  // The fallback already contains the crawlable product copy, media, prices
  // and related links. The client fetches the authoritative product row from
  // the server on a direct PDP request, so embedding a second 30 KB JSON
  // payload in every static page only makes the SEO build and deployment
  // needlessly large.
  const html = pageHtml(shell, {
    path,
    title:metadata.title,
    description:metadata.description,
    image:product.image,
    fallback:renderProductContent(product,related,breadcrumbOptions),
    schema:productStructuredData(product,PUBLIC_ORIGIN,breadcrumbOptions)
  })
  const entry = await writePage(path, html)
  if (entry) {
    entry.lastmod = product.updatedAt
    entry.images = product.images
  }
}, 128, 'indexable PDPs')

await writePagesInBatches(blockedProducts, async product => {
  const path = `/product/${slug(product.handle)}`
  await writePage(path, pageHtml(shell, {
    path,
    title:`${product.title} — Extra Time`,
    description:'This product page is not currently available for organic search.',
    image:product.image,
    noindex:true,
    fallback:renderProductContent(product)
  }))
}, 128, 'noindex PDPs')

const itemList = products.slice(0,CATALOG_PAGE_SIZE).map((product, index) => ({ '@type':'ListItem', position:index + 1, url:`${PUBLIC_ORIGIN}/product/${slug(product.handle)}`, name:product.title, image:product.image }))
await writePage('/shop', pageHtml(shell, {
  path:'/shop',
  title:'Shop fan gear by sport, team and product | Jersevo',
  description:'Start with a sport, find your team or choose the product you want. Browse live jerseys, headwear and fan gear at Jersevo.',
  image:absolute(SHOP_COVER.src),
  fallback:`<main class="seo-fallback"><h1>Find your route to the gear</h1><p>Shop by sport, team or product type. The full published catalog follows.</p><nav aria-label="Shop by sport">${ALL_LEAGUE_TAXONOMY.map(league => `<a href="${leaguePath(league)}">${escapeHtml(league.name)}</a>`).join(' · ')}</nav><nav aria-label="Find a team"><a href="/teams">Browse teams</a> · <a href="/sports">Explore sports</a></nav><nav aria-label="Shop by category">${CATALOG_CATEGORY_PAGES.map(category => `<a href="/category/${category.handle}">${escapeHtml(category.label)}</a>`).join(' · ')}</nav><h2>All products</h2><ul>${products.slice(0,CATALOG_PAGE_SIZE).map(product => `<li><a href="/product/${slug(product.handle)}">${escapeHtml(product.title)}</a></li>`).join('')}</ul>${products.length > CATALOG_PAGE_SIZE ? '<a href="/shop/page/2">Next page</a>' : ''}</main>`,
  schema:[{ '@context':'https://schema.org', '@type':'ItemList', itemListElement:itemList },breadcrumbSchema([{name:'Home',url:`${PUBLIC_ORIGIN}/`},{name:'Shop',url:`${PUBLIC_ORIGIN}/shop`}])]
}))
await writeCatalogPagination('/shop', products, 'All fan gear', 'Shop published Jersevo fan gear across leagues, teams and product categories.', absolute(SHOP_COVER.src))

const customFallbackProducts = customProducts.map(product => `<li><a href="/custom/design?provider=${encodeURIComponent(product.designerConfig?.provider || 'owayo')}&product=${encodeURIComponent(product.designerConfig?.productId || '')}">${escapeHtml(product.title)}</a><span>3D designer garment</span></li>`).join('')
await writePage('/custom', pageHtml(shell, {
  path:'/custom',
  title:'Custom jerseys and personalized fan gear | Jersevo',
  description:'Choose a designer-led jersey, add your name or number, and send the important details through a reviewed personalization flow.',
  image:absolute(SHOP_COVER.src),
  // The Custom Studio is in controlled preview while the provider catalogue
  // and production hand-off are being validated. Keep it reachable from the
  // storefront, but do not publish it to organic search yet.
  noindex:true,
  noindexRobots:'noindex,follow',
  fallback:`<main class="seo-fallback"><nav aria-label="Breadcrumb"><a href="/shop">Shop</a> / <strong>Custom</strong></nav><h1>Design it. Wear it.</h1><p>Choose a performance cut, start from a proven template, then set your colors, name, number and logo in the 3D studio.</p><p><a href="/custom/design">Open the 3D kit builder</a></p><h2>How custom ordering works</h2><ol><li>Choose a production-ready garment cut.</li><li>Start from a verified template and add your team identity.</li><li>Complete the roster and review the hand-off before print.</li></ol><h2>Live custom jerseys</h2><ul>${customFallbackProducts || '<li><a href="/category/custom-jerseys">Browse custom jerseys</a></li>'}</ul><p><a href="/category/custom-jerseys">View all custom jerseys</a> · <a href="/shipping">Read delivery details</a></p></main>`,
  schema:[
    { '@context':'https://schema.org', '@type':'CollectionPage', name:'Custom jerseys and personalized fan gear', description:'Choose a designer-led jersey and add approved personal details.', url:`${PUBLIC_ORIGIN}/custom`, isPartOf:{ '@type':'WebSite', url:`${PUBLIC_ORIGIN}/`, name:'Jersevo' } },
    { '@context':'https://schema.org', '@type':'HowTo', name:'How to order a personalized jersey', step:[{ '@type':'HowToStep', name:'Choose a jersey' },{ '@type':'HowToStep', name:'Add your details' },{ '@type':'HowToStep', name:'Review before print' }] },
    breadcrumbSchema([{name:'Home',url:`${PUBLIC_ORIGIN}/`},{name:'Shop',url:`${PUBLIC_ORIGIN}/shop`},{name:'Custom',url:`${PUBLIC_ORIGIN}/custom`}])
  ]
}))

await writePage('/custom/design', pageHtml(shell, {
  path:'/custom/design',
  title:'3D custom jersey designer | Jersevo',
  description:'Design a custom cycling jersey in 3D, change colors, add names, numbers and a team logo, then organize every player in one roster.',
  image:absolute(SHOP_COVER.src),
  noindex:true,
  noindexRobots:'noindex,follow',
  fallback:`<main class="seo-fallback"><nav aria-label="Breadcrumb"><a href="/custom">Custom</a> / <strong>3D kit builder</strong></nav><h1>Build your custom jersey in 3D</h1><p>Choose a garment design, set the team colors, add shared text and a logo, then organize player names, numbers and sizes in one roster.</p><h2>Included design tools</h2><ul><li>Interactive 3D garment rotation and zoom</li><li>Design and color controls</li><li>Name, number and team text placement</li><li>Team logo upload and placement</li><li>Draft saving, undo and redo</li><li>Multi-player roster handoff</li></ul><p><a href="/custom">Read about custom ordering</a> · <a href="/category/custom-jerseys">Browse live custom jerseys</a></p></main>`,
  schema:[
    { '@context':'https://schema.org', '@type':'WebApplication', name:'Jersevo 3D Kit Builder', applicationCategory:'DesignApplication', operatingSystem:'Web browser', description:'Interactive custom jersey designer with colors, text, logos and team roster tools.', url:`${PUBLIC_ORIGIN}/custom/design`, isPartOf:{ '@type':'WebSite', url:`${PUBLIC_ORIGIN}/`, name:'Jersevo' } },
    breadcrumbSchema([{name:'Home',url:`${PUBLIC_ORIGIN}/`},{name:'Custom',url:`${PUBLIC_ORIGIN}/custom`},{name:'3D kit builder',url:`${PUBLIC_ORIGIN}/custom/design`}])
  ]
}))

await writePage('/custom/quick', pageHtml(shell, {
  path:'/custom/quick',
  title:'Quick AI artwork studio | Jersevo',
  description:'Create a print-ready artwork from a prompt, a pet photo or a reference image, then choose the garment and print surface that fits.',
  image:absolute(SHOP_COVER.src),
  noindex:true,
  noindexRobots:'noindex,follow',
  fallback:`<main class="seo-fallback"><nav aria-label="Breadcrumb"><a href="/custom">Custom</a> / <strong>Quick AI</strong></nav><h1>Create artwork before you choose a product</h1><p>Start with a prompt or a photo, explore mascot, pet and sports poster directions, then polish the artwork inside a safe print area.</p><ol><li>Describe an idea or upload a reference.</li><li>Choose a style and select a variant.</li><li>Polish the artwork and select a product surface.</li><li>Run preflight before ordering.</li></ol><p><a href="/custom">Choose another Custom route</a> · <a href="/custom/design">Open the 3D designer</a></p></main>`,
  schema:[
    { '@context':'https://schema.org', '@type':'WebApplication', name:'Jersevo Quick AI Artwork Studio', applicationCategory:'DesignApplication', operatingSystem:'Web browser', description:'Prompt- and image-led artwork creation with print preflight.', url:`${PUBLIC_ORIGIN}/custom/quick`, isPartOf:{ '@type':'WebSite', url:`${PUBLIC_ORIGIN}/`, name:'Jersevo' } },
    breadcrumbSchema([{name:'Home',url:`${PUBLIC_ORIGIN}/`},{name:'Custom',url:`${PUBLIC_ORIGIN}/custom`},{name:'Quick AI',url:`${PUBLIC_ORIGIN}/custom/quick`}])
  ]
}))

const leagueCountsForIndex = new Map()
const teamCountsForIndex = new Map()
for (const product of products) {
  const league = String(product.taxonomy?.league || '').toLowerCase()
  if (!league) continue
  leagueCountsForIndex.set(league,(leagueCountsForIndex.get(league) || 0) + 1)
  const team = normalizeTeamSlug(league,product.taxonomy?.team || '')
  if (team) teamCountsForIndex.set(`${league}/${team}`,(teamCountsForIndex.get(`${league}/${team}`) || 0) + 1)
}
const availableLeagues = ALL_LEAGUE_TAXONOMY.filter(league => leagueCountsForIndex.get(league.key) > 0 && !pageOverride(leaguePath(league))?.hidden)
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
    const indexable = collectionProducts.length >= TAXONOMY_MIN_PRODUCTS && rowCollectionIsIndexable(collection)
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
  const override = pageOverride(path)
  if (override?.hidden) continue
  const count = categoryCounts.get(category.handle) || 0
  // Custom landing pages are staged separately from the normal taxonomy
  // release. They remain directly reachable but must stay out of the sitemap
  // and organic index until the designer catalogue is publicly approved.
  const indexable = category.handle !== 'custom-jerseys' && count >= TAXONOMY_MIN_PRODUCTS
  const categoryProducts = products.filter(product => productMatchesCatalogCategory(product, category))
  const categoryTitle = override?.title || category.label
  const categoryDescription = override?.description || category.description
  const categoryImage = absolute(override?.hero || '/assets/jersey-black.webp')
  await writePage(path, pageHtml(shell, {
    path,
    title:override?.seoTitle || `${categoryTitle} — Jersevo`,
    description:override?.seoDescription || categoryDescription,
    image:categoryImage,
    noindex:!indexable,
    ...(category.handle === 'custom-jerseys' ? { noindexRobots:'noindex,follow' } : {}),
    fallback:`<main class="seo-fallback"><h1>${escapeHtml(categoryTitle)}</h1><p>${escapeHtml(categoryDescription)}</p><ul>${categoryProducts.slice(0,CATALOG_PAGE_SIZE).map(product => `<li><a href="/product/${slug(product.handle)}">${escapeHtml(product.title)}</a></li>`).join('')}</ul>${categoryProducts.length > CATALOG_PAGE_SIZE ? `<a href="${path}/page/2">Next page</a>` : ''}</main>`,
    schema:[{ '@context':'https://schema.org', '@type':'CollectionPage', name:categoryTitle, description:categoryDescription, url:`${PUBLIC_ORIGIN}${path}`, image:categoryImage, numberOfItems:count, isPartOf:{ '@type':'WebSite', url:`${PUBLIC_ORIGIN}/` } },breadcrumbSchema([{name:'Home',url:`${PUBLIC_ORIGIN}/`},{name:'Shop',url:`${PUBLIC_ORIGIN}/shop`},{name:categoryTitle,url:`${PUBLIC_ORIGIN}${path}`}])]
  }))
  if (indexable) await writeCatalogPagination(path, categoryProducts, categoryTitle, categoryDescription, categoryImage)
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
for (const league of ALL_LEAGUE_TAXONOMY) {
  const path = leaguePath(league)
  const override = pageOverride(path)
  if (override?.hidden) continue
  const leagueIndexable = (taxonomyCounts.get(`league:${league.key}`) || 0) >= TAXONOMY_MIN_PRODUCTS
  const leagueProducts = products.filter(product => String(product.taxonomy?.league || '').toLowerCase() === league.key)
  const leagueTitle = override?.title || `${league.name} fan gear`
  const leagueDescription = override?.description || league.description
  const leagueImage = absolute(override?.hero || leagueCover(league.key)?.src || leagueProducts[0]?.image || league.media?.src || '/assets/editorial-player.webp')
  const leagueGroups = [...new Map(leagueProducts.reduce((map, product) => {
    const group = String(product.productGroup || '').trim()
    if (group) map.set(group, (map.get(group) || 0) + 1)
    return map
  }, new Map())).entries()].sort((a,b) => b[1] - a[1]).slice(0,8)
  const availableLeagueTeams = league.teams.filter(team => (taxonomyCounts.get(`team:${league.key}/${team.slug}`) || 0) > 0 && !pageOverride(teamPath(league.key, team))?.hidden)
  await writePage(path, pageHtml(shell, {
    path,
    title:override?.seoTitle || `${leagueTitle} — Jersevo`,
    description:override?.seoDescription || leagueDescription,
    image:leagueImage,
    noindex:!leagueIndexable,
    fallback:`<main class="seo-fallback"><h1>${escapeHtml(leagueTitle)}</h1><p>${escapeHtml(leagueDescription)}</p><section><h2>Find your ${escapeHtml(league.name)} team</h2><ul>${availableLeagueTeams.slice(0,16).map(team => `<li><a href="${teamPath(league.key,team)}">${escapeHtml(team.name)}</a> (${taxonomyCounts.get(`team:${league.key}/${team.slug}`) || 0})</li>`).join('')}</ul></section><section><h2>Shop ${escapeHtml(league.name)} by product</h2><ul>${leagueGroups.map(([group,count]) => `<li>${escapeHtml(group)} (${count})</li>`).join('')}</ul></section><section><h2>Current ${escapeHtml(league.name)} gear</h2><ul>${leagueProducts.slice(0,CATALOG_PAGE_SIZE).map(product => `<li><a href="/product/${slug(product.handle)}">${escapeHtml(product.title)}</a></li>`).join('')}</ul>${leagueProducts.length > CATALOG_PAGE_SIZE ? `<a href="${path}/page/2">Next page</a>` : ''}</section></main>`,
    schema:[{ '@context':'https://schema.org', '@type':'CollectionPage', name:leagueTitle, description:leagueDescription, url:`${PUBLIC_ORIGIN}${path}`, image:leagueImage, numberOfItems:leagueProducts.length, isPartOf:{ '@type':'WebSite', url:`${PUBLIC_ORIGIN}/` } },breadcrumbSchema([{name:'Home',url:`${PUBLIC_ORIGIN}/`},{name:'Shop',url:`${PUBLIC_ORIGIN}/shop`},{name:leagueTitle,url:`${PUBLIC_ORIGIN}${path}`}])]
  }))
  if (leagueIndexable) await writeCatalogPagination(path, leagueProducts, leagueTitle, leagueDescription, leagueImage)
  for (const team of league.teams) {
    const teamPage = teamPath(league.key, team)
    const teamOverride = pageOverride(teamPage)
    if (teamOverride?.hidden) continue
    const teamIndexable = (taxonomyCounts.get(`team:${league.key}/${team.slug}`) || 0) >= TAXONOMY_MIN_PRODUCTS
    const teamProducts = leagueProducts.filter(product => normalizeTeamSlug(league.key, product.taxonomy?.team || '') === team.slug)
    const teamTypePages = teamProductTypeCounts(teamProducts, { league:league.key, team:team.slug })
      .filter(type => !pageOverride(type.path)?.hidden)
    const teamTitle = teamOverride?.title || `${team.name} fan gear`
    const teamDescription = teamOverride?.description || `Shop ${team.name} fan gear, including available jerseys, caps and apparel, with tracked US delivery.`
    const teamImage = absolute(teamOverride?.hero || teamProducts[0]?.image || team.media?.src || '/assets/editorial-player.webp')
    const teamGroups = [...teamProducts.reduce((map, product) => {
      const group = String(product.productGroup || '').trim()
      if (group) map.set(group, (map.get(group) || 0) + 1)
      return map
    }, new Map()).entries()].sort((a,b) => b[1] - a[1]).slice(0,8)
    await writePage(teamPage, pageHtml(shell, {
      path:teamPage,
      title:teamOverride?.seoTitle || `${teamTitle} — Jersevo`,
      description:teamOverride?.seoDescription || teamDescription,
      image:teamImage,
      noindex:!teamIndexable,
      fallback:`<main class="seo-fallback"><h1>${escapeHtml(teamTitle)}</h1><p>${escapeHtml(teamDescription)}</p><p><a href="${leaguePath(league)}">Back to ${escapeHtml(league.name)}</a></p><section><h2>Shop ${escapeHtml(team.name)} by product</h2><ul>${teamTypePages.map(type => `<li><a href="${type.path}">${escapeHtml(type.label)}</a> (${type.count})</li>`).join('')}${teamTypePages.length ? '' : teamGroups.map(([group,count]) => `<li>${escapeHtml(group)} (${count})</li>`).join('')}</ul></section><section><h2>Current ${escapeHtml(team.name)} gear</h2><ul>${teamProducts.slice(0,CATALOG_PAGE_SIZE).map(product => `<li><a href="/product/${slug(product.handle)}">${escapeHtml(product.title)}</a></li>`).join('')}</ul>${teamProducts.length > CATALOG_PAGE_SIZE ? `<a href="${teamPage}/page/2">Next page</a>` : ''}</section></main>`,
      schema:[{ '@context':'https://schema.org', '@type':'CollectionPage', name:teamTitle, description:teamDescription, url:`${PUBLIC_ORIGIN}${teamPage}`, image:teamImage, numberOfItems:teamProducts.length, isPartOf:{ '@type':'CollectionPage', url:`${PUBLIC_ORIGIN}${path}` } },breadcrumbSchema([{name:'Home',url:`${PUBLIC_ORIGIN}/`},{name:'Shop',url:`${PUBLIC_ORIGIN}/shop`},{name:league.name,url:`${PUBLIC_ORIGIN}${path}`},{name:teamTitle,url:`${PUBLIC_ORIGIN}${teamPage}`}])]
    }))
    if (teamIndexable) await writeCatalogPagination(teamPage, teamProducts, teamTitle, teamDescription, teamImage)
    for (const type of teamTypePages) {
      const typePath = teamProductTypePath(league.key, team, type)
      const typeOverride = pageOverride(typePath)
      if (typeOverride?.hidden) continue
      const typeProducts = teamProducts.filter(product => productMatchesTeamProductType(product, type))
      const typeTitle = typeOverride?.title || `${team.name} ${type.label}`
      const typeDescription = typeOverride?.description || `${type.description} Shop current ${team.name} ${type.label.toLowerCase()} with available options, photos and tracked US delivery.`
      const typeImage = absolute(typeOverride?.hero || typeProducts[0]?.image || teamProducts[0]?.image || team.media?.src || '/assets/editorial-player.webp')
      const siblingLinks = teamTypePages.map(sibling => `<li><a href="${sibling.path}">${escapeHtml(sibling.label)}</a> (${sibling.count})</li>`).join('')
      await writePage(typePath, pageHtml(shell, {
        path:typePath,
        title:typeOverride?.seoTitle || `${typeTitle} — Jersevo`,
        description:typeOverride?.seoDescription || typeDescription,
        image:typeImage,
        fallback:`<main class="seo-fallback"><nav aria-label="Breadcrumb"><a href="/">Home</a> / <a href="/shop">Shop</a> / <a href="${leaguePath(league)}">${escapeHtml(league.name)}</a> / <a href="${teamPage}">${escapeHtml(team.name)}</a> / <strong>${escapeHtml(type.label)}</strong></nav><h1>${escapeHtml(typeTitle)}</h1><p>${escapeHtml(typeDescription)}</p><nav aria-label="${escapeHtml(team.name)} product types"><ul>${siblingLinks}</ul></nav><ul>${typeProducts.slice(0,CATALOG_PAGE_SIZE).map(product => `<li><a href="/product/${slug(product.handle)}">${escapeHtml(product.title)}</a></li>`).join('')}</ul>${typeProducts.length > CATALOG_PAGE_SIZE ? `<a href="${typePath}/page/2">Next page</a>` : ''}</main>`,
        schema:[{ '@context':'https://schema.org', '@type':'CollectionPage', name:typeTitle, description:typeDescription, url:`${PUBLIC_ORIGIN}${typePath}`, image:typeImage, numberOfItems:typeProducts.length, isPartOf:{ '@type':'CollectionPage', url:`${PUBLIC_ORIGIN}${teamPage}` } },breadcrumbSchema([{name:'Home',url:`${PUBLIC_ORIGIN}/`},{name:'Shop',url:`${PUBLIC_ORIGIN}/shop`},{name:league.name,url:`${PUBLIC_ORIGIN}${leaguePath(league)}`},{name:team.name,url:`${PUBLIC_ORIGIN}${teamPage}`},{name:typeTitle,url:`${PUBLIC_ORIGIN}${typePath}`}])]
      }))
      await writeCatalogPagination(typePath, typeProducts, typeTitle, typeDescription, typeImage)
    }
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

for (const path of ['/studio', '/account', '/account/membership', '/admin', '/checkout', '/track-order']) {
  await writePage(path, pageHtml(shell, {
    path, title:'Extra Time', description:'Extra Time account and studio tools.', image:absolute('/assets/hero-tunnel.webp'), noindex:true,
    fallback:'<main class="seo-fallback"><h1>Extra Time</h1></main>', schema:{ '@context':'https://schema.org', '@type':'WebPage', name:'Extra Time', url:`${PUBLIC_ORIGIN}${path}` }
  }))
}

const paginationEntries = sitemapEntries.filter(entry => /\/page\/\d+$/.test(entry.path))
const baseEntries = sitemapEntries.filter(entry => !/\/page\/\d+$/.test(entry.path))
const routeCounts = {
  products:baseEntries.filter(entry => entry.path.startsWith('/product/')).length,
  leagues:baseEntries.filter(entry => /^\/league\/[^/]+$/.test(entry.path)).length,
  teams:baseEntries.filter(entry => /^\/team\/[^/]+\/[^/]+$/.test(entry.path)).length,
  teamProductTypes:baseEntries.filter(entry => /^\/team\/[^/]+\/[^/]+\/[^/]+$/.test(entry.path)).length,
  categories:baseEntries.filter(entry => /^\/category\/[^/]+$/.test(entry.path)).length,
  editorialCollections:baseEntries.filter(entry => /^\/collection\/[^/]+$/.test(entry.path)).length,
  pagination:paginationEntries.length,
  otherPages:baseEntries.filter(entry => !/^\/(?:product|league|team|category|collection)\//.test(entry.path)).length
}
routeCounts.catalogLandingPages = routeCounts.leagues + routeCounts.teams + routeCounts.teamProductTypes + routeCounts.categories + routeCounts.editorialCollections

console.log(`[seo] Indexable URLs: ${sitemapEntries.length.toLocaleString()} total (${routeCounts.pagination.toLocaleString()} pagination pages).`)
console.log(`[seo] Products: ${routeCounts.products.toLocaleString()} indexable; ${blockedProducts.length.toLocaleString()} blocked/noindex.`)
console.log(`[seo] Catalog landing pages: ${routeCounts.catalogLandingPages.toLocaleString()} — ${routeCounts.leagues} leagues, ${routeCounts.teams} teams, ${routeCounts.teamProductTypes} team product types, ${routeCounts.categories} categories, ${routeCounts.editorialCollections} editorial collections.`)
console.log(`[seo] Editorial collection rows: ${collections.length.toLocaleString()} published in Supabase; ${routeCounts.editorialCollections.toLocaleString()} currently indexable.`)
const sitemapGroups = {
  pages:sitemapEntries.filter(entry => !/^\/(?:product|league|team|category|collection)\//.test(entry.path)),
  leagues:sitemapEntries.filter(entry => entry.path.startsWith('/league/')),
  teams:sitemapEntries.filter(entry => entry.path.startsWith('/team/')),
  categories:sitemapEntries.filter(entry => /^\/(?:category|collection)\//.test(entry.path)),
  products:sitemapEntries.filter(entry => entry.path.startsWith('/product/'))
}
const allGroupedEntries = Object.values(sitemapGroups).flat()
const uniqueSitemapPaths = new Set(sitemapEntries.map(entry => entry.path))
if (uniqueSitemapPaths.size !== sitemapEntries.length) throw new Error(`[seo] Duplicate canonical path detected (${sitemapEntries.length - uniqueSitemapPaths.size} duplicate entries).`)
if (allGroupedEntries.length !== sitemapEntries.length || new Set(allGroupedEntries.map(entry => entry.path)).size !== sitemapEntries.length) {
  throw new Error('[seo] Sitemap grouping must include every indexable URL exactly once.')
}
const sitemapFiles = []
const latestLastmod = entries => entries.map(entry => entry.lastmod).filter(value => Number.isFinite(Date.parse(value))).sort().at(-1) || new Date().toISOString()
// Vite empties dist for a normal build, but the generator is also run directly
// during audits. Remove only files owned by this generator so a smaller or
// differently chunked rerun cannot leave an obsolete sitemap discoverable.
const generatedSitemapPattern = /^sitemap-(?:pages|leagues|teams|categories|products)(?:-\d+)?\.xml$/
const staleSitemaps = (await readdir(DIST)).filter(filename => generatedSitemapPattern.test(filename))
await Promise.all(staleSitemaps.map(filename => unlink(join(DIST,filename))))
for (const [name,entries] of Object.entries(sitemapGroups)) {
  if (!entries.length) continue
  const chunkSize = name === 'products' ? 10000 : 45000
  for (let offset = 0; offset < entries.length; offset += chunkSize) {
    const chunk = entries.slice(offset,offset + chunkSize)
    const suffix = entries.length > chunkSize ? `-${Math.floor(offset / chunkSize) + 1}` : ''
    const filename = `sitemap-${name}${suffix}.xml`
    await writeFile(join(DIST,filename),renderSitemap(chunk,PUBLIC_ORIGIN))
    sitemapFiles.push({ path:`/${filename}`, lastmod:latestLastmod(chunk), urls:chunk.length, group:name })
  }
}
await writeFile(join(DIST,'sitemap.xml'),renderSitemapIndex(sitemapFiles,PUBLIC_ORIGIN))
await writeFile(join(DIST,'404.html'),pageHtml(shell,{path:'/404',title:'Page not found | Jersevo',description:'This page is not available.',image:absolute('/assets/hero-tunnel.webp'),noindex:true,fallback:'<main class="seo-fallback"><h1>Page not found</h1><p>This URL is not available.</p><a href="/shop">Browse the shop</a></main>'}))
await writeFile(join(DIST,'seo-build-manifest.json'),JSON.stringify({
  generatedAt:new Date().toISOString(),
  indexable:sitemapEntries.length,
  indexableUrls:sitemapEntries.length,
  products:routeCounts.products,
  blocked:blockedProducts.length,
  productPages:{ indexable:routeCounts.products, blocked:blockedProducts.length },
  catalogPages:{
    totalLandingPages:routeCounts.catalogLandingPages,
    leagues:routeCounts.leagues,
    teams:routeCounts.teams,
    teamProductTypes:routeCounts.teamProductTypes,
    categories:routeCounts.categories,
    editorialCollections:routeCounts.editorialCollections,
    pagination:routeCounts.pagination
  },
  editorialCollectionRows:{ published:collections.length, indexable:routeCounts.editorialCollections },
  otherPages:routeCounts.otherPages,
  sitemaps:sitemapFiles.map(file => file.path),
  sitemapFiles
},null,2))
