import { createHash } from 'node:crypto'
import { stableHash, stableId, slugify, uniqueHandle } from './fangear-import-lib.mjs'
import { seoDescription } from '../src/lib/seo-text.js'
import { normalizeAccessoryTaxonomy } from '../src/lib/catalog-taxonomy.js'
import { ALL_LEAGUE_TAXONOMY, findLeague, findTeam, normalizeTeamSlug, taxonomySlug } from '../src/lib/league-taxonomy.js'

/**
 * Public-site importer contract for Topperzstore.
 *
 * Topperzstore is a Shopware storefront rather than a public product API. The
 * product sitemap and Product JSON-LD are the stable, crawlable interface, so
 * this module deliberately parses only those public representations. Source
 * URLs are retained on the importer item for audit/media retrieval, never on
 * the public listing sent to Supabase.
 */
export const TOPPERZ_SOURCE_HOST = 'www.topperzstore.com'
export const TOPPERZ_SITEMAP_URL = 'https://www.topperzstore.com/sitemap.xml'
export const TOPPERZ_DEFAULT_STOCK = 1000
export const TOPPERZ_IMPORT_STATUS = 'DRAFT'
export const TOPPERZ_IMPORT_VERSION = 'topperzstore-v1'

const HTML_ENTITIES = value => String(value || '')
  .replace(/&nbsp;/gi, ' ')
  .replace(/&amp;/gi, '&')
  .replace(/&quot;/gi, '"')
  .replace(/&#0*39;|&apos;/gi, "'")
  .replace(/&lt;/gi, '<')
  .replace(/&gt;/gi, '>')
  .replace(/&#x([0-9a-f]+);/gi, (entity, code) => {
    const point = Number.parseInt(code, 16)
    return Number.isInteger(point) && point >= 0 && point <= 0x10ffff ? String.fromCodePoint(point) : entity
  })
  .replace(/&#([0-9]+);/g, (entity, code) => {
    const point = Number.parseInt(code, 10)
    return Number.isInteger(point) && point >= 0 && point <= 0x10ffff ? String.fromCodePoint(point) : entity
  })

function plainText(value) {
  return HTML_ENTITIES(value)
    .replace(/<script[\s\S]*?<\/script>/gi, ' ')
    .replace(/<style[\s\S]*?<\/style>/gi, ' ')
    .replace(/<[^>]+>/g, ' ')
    .replace(/\s+/g, ' ')
    .trim()
}

function attr(tag, name) {
  const match = String(tag || '').match(new RegExp(`\\b${name}=["']([^"']*)["']`, 'i'))
  return match ? HTML_ENTITIES(match[1]) : ''
}

function jsonLdNodes(html) {
  const nodes = []
  const scripts = String(html || '').match(/<script\b[^>]*type=["']application\/ld\+json["'][^>]*>[\s\S]*?<\/script>/gi) || []
  for (const script of scripts) {
    const body = script.replace(/^.*?>/s, '').replace(/<\/script>\s*$/i, '').trim()
    if (!body) continue
    try {
      const value = JSON.parse(HTML_ENTITIES(body))
      if (Array.isArray(value)) nodes.push(...value)
      else if (value && typeof value === 'object') nodes.push(value)
    } catch {
      // A malformed analytics/schema block must not abort the product page.
    }
  }
  return nodes
}

function firstOffer(value) {
  if (Array.isArray(value)) return value.find(item => item && typeof item === 'object') || {}
  return value && typeof value === 'object' ? value : {}
}

function imageUrls(...values) {
  return [...new Set(values.flatMap(value => Array.isArray(value) ? value : value == null ? [] : [value]).map(item => {
    if (typeof item === 'string') return item
    return item?.url || item?.contentUrl || ''
  }).map(value => HTML_ENTITIES(value).trim()).filter(value => /^https:\/\//i.test(value)))]
}

function sourceImageUrls(html, sku = '') {
  const urls = []
  const matcher = /<(?:img|source)\b[^>]*(?:src|data-src|srcset)=["']([^"']+)["'][^>]*>/gi
  let match
  while ((match = matcher.exec(String(html || '')))) {
    const raw = HTML_ENTITIES(match[1]).split(',')[0].trim().split(/\s+/)[0]
    if (!/^https:\/\//i.test(raw) || !/\/media\//i.test(raw)) continue
    if (sku && raw.toLowerCase().includes(String(sku).toLowerCase())) urls.push(raw)
  }
  return [...new Set(urls)]
}

function extractProperties(html) {
  const text = String(html || '')
  const start = text.search(/<div\b[^>]*class=["'][^"']*product-detail-properties[^"']*["'][^>]*>/i)
  if (start < 0) return {}
  const end = text.indexOf('</div>', start)
  const scope = end > start ? text.slice(start, Math.min(text.length, end + 16_000)) : text.slice(start, start + 16_000)
  const properties = {}
  const matcher = /<span\b[^>]*>\s*([^:<]+?)\s*:\s*<\/span>\s*([^<]*?)(?=\s*<br\b|\s*<\/div>|\s*<\/span>)/gi
  let match
  while ((match = matcher.exec(scope))) {
    const key = plainText(match[1]).replace(/\s+/g, ' ').trim()
    const value = plainText(match[2])
    if (key && value) properties[key] = value
  }
  return properties
}

function configuratorOptions(html) {
  const options = []
  const fieldsets = String(html || '').match(/<fieldset\b[^>]*product-detail-configurator-group[^>]*>[\s\S]*?<\/fieldset>/gi) || []
  for (const fieldset of fieldsets) {
    const legend = plainText(fieldset.match(/<legend\b[^>]*>([\s\S]*?)<\/legend>/i)?.[1] || '')
      .replace(/^select\s+/i, '').replace(/\s+size\s+chart\s*$/i, '').trim()
    if (!legend) continue
    const values = []
    const inputs = fieldset.match(/<input\b[^>]*>/gi) || []
    for (const input of inputs) {
      const id = attr(input, 'id')
      const title = attr(input, 'title')
      const escaped = id.replace(/[.*+?^${}()|[\]\\]/g, '\\$&')
      const label = id
        ? fieldset.match(new RegExp(`<label\\b[^>]*for=["']${escaped}["'][^>]*>([\\s\\S]*?)<\\/label>`, 'i'))?.[1]
        : ''
      const value = plainText(label || attr(input, 'value') || title)
        .replace(/\b(?:available|in stock|out of stock|unavailable|sold out)\b[\s\S]*$/i, '')
        .trim()
      if (value && !values.includes(value)) values.push(value)
    }
    if (values.length) options.push({ name: legend.replace(/\s+/g, ' '), values: values.slice(0, 80) })
  }
  return options.slice(0, 3)
}

function breadcrumbs(nodes) {
  const node = nodes.find(item => item?.['@type'] === 'BreadcrumbList')
  const rows = Array.isArray(node?.itemListElement) ? node.itemListElement : []
  return rows.map(item => plainText(item?.name || '')).filter(Boolean)
}

function productUuid(html) {
  const match = String(html || '').match(/name=["']lineItems\[([a-f0-9]{32})\]\[id\]["'][^>]*value=["']([a-f0-9]{32})["']/i)
  return match?.[2] || match?.[1] || ''
}

function canonicalUrl(html, fallback) {
  const link = (String(html || '').match(/<link\b[^>]*rel=["']canonical["'][^>]*>/i) || [])[0]
  return attr(link, 'href') || fallback
}

function productNumber(html) {
  const match = String(html || '').match(/product-detail-ordernumber-label[\s\S]{0,500}?product-detail-ordernumber["'][^>]*>\s*([^<]+)/i)
  return plainText(match?.[1] || '')
}

function sourceAvailability(offer, html) {
  const value = String(offer?.availability || '')
  if (/SoldOut|OutOfStock/i.test(value)) return false
  if (/InStock|LimitedAvailability/i.test(value)) return true
  return /\bavailable\b|\bin stock\b/i.test(plainText(html)) && !/sold\s*out|out\s*of\s*stock/i.test(plainText(html))
}

export function sanitizeTopperzPublicText(value) {
  return plainText(value)
    .replace(/https?:\/\/[^\s"'<>]+/gi, ' ')
    .replace(/(?:www\.)?topperzstore(?:\.com|\.de)?\b/gi, ' ')
    .replace(/\btopperzstore\b/gi, ' ')
    .replace(/\btokenz\b/gi, ' ')
    .replace(/\b(?:free\s+shipping|30[- ]day\s+return(?:s)?|satisfaction\s+guarantee|buy\s+\d+\s+get\s+\d+\s+free)\b/gi, ' ')
    .replace(/\s+/g, ' ')
    .trim()
}

export function parseTopperzProductHtml(html, sourceUrl = '') {
  const nodes = jsonLdNodes(html)
  const product = nodes.find(node => node?.['@type'] === 'Product')
  if (!product) throw new Error('Topperzstore page does not contain Product JSON-LD.')
  const offer = firstOffer(product.offers)
  const canonical = canonicalUrl(html, sourceUrl)
  const sku = sanitizeTopperzPublicText(product.sku || product.mpn || productNumber(html))
  const properties = extractProperties(html)
  const images = imageUrls(product.image)
  const extraImages = sourceImageUrls(html, sku)
  const price = Number(offer.price ?? (String(html).match(/product:price:amount["'][^>]*content=["']([^"']+)/i)?.[1] || 0))
  const currency = String(offer.priceCurrency || String(html).match(/product:price:currency["'][^>]*content=["']([^"']+)/i)?.[1] || 'USD').toUpperCase()
  const description = sanitizeTopperzPublicText(product.description || '')
  const name = sanitizeTopperzPublicText(product.name || '')
  const brand = sanitizeTopperzPublicText(product.brand?.name || '')
  return {
    sourceUrl: canonical,
    sourceId: productUuid(html) || String(product['@id'] || sku || stableHash(canonical, 20)),
    productId: String(productUuid(html) || ''),
    sku,
    mpn: sanitizeTopperzPublicText(product.mpn || ''),
    gtin: sanitizeTopperzPublicText(product.gtin14 || product.gtin13 || product.gtin12 || product.gtin8 || ''),
    name,
    description,
    brand,
    price: Number.isFinite(price) && price >= 0 ? Number(price.toFixed(2)) : 0,
    currency,
    availability: String(offer.availability || ''),
    inStock: sourceAvailability(offer, html),
    properties,
    options: configuratorOptions(html),
    breadcrumbs: breadcrumbs(nodes),
    images: [...new Set([...images, ...extraImages])].slice(0, 20),
    badge: /\bnew\b/i.test(plainText(html).slice(0, 60_000)) ? 'New' : null,
    lastmod: ''
  }
}

export function parseTopperzSitemap(xml) {
  const rows = []
  const matcher = /<url>[^]*?<loc>([^]*?)<\/loc>(?:[^]*?<lastmod>([^]*?)<\/lastmod>)?[^]*?<\/url>/gi
  let match
  while ((match = matcher.exec(String(xml || '')))) {
    const url = HTML_ENTITIES(match[1]).trim()
    if (!/^https:\/\/(?:www\.)?topperzstore\.com\//i.test(url)) continue
    rows.push({ url, lastmod: plainText(match[2] || '') })
  }
  return rows
}

export function parseTopperzSitemapIndex(xml) {
  const rows = []
  const matcher = /<sitemap>[^]*?<loc>([^]*?)<\/loc>[^]*?<\/sitemap>/gi
  let match
  while ((match = matcher.exec(String(xml || '')))) {
    const url = HTML_ENTITIES(match[1]).trim()
    // Shopware publishes category, landing-page and home sitemaps beside the
    // product shards. Only the two `product-*` documents contain importable
    // product URLs; crawling the other documents would turn category pages
    // into false product errors.
    // Match both Shopware's usual `/sitemap-product-1.xml.gz` form and a
    // bare `/product-1.xml.gz` fixture.  Keep the check anchored to the
    // pathname so a query string cannot turn a category sitemap into a
    // product shard.
    if (/^https:\/\/(?:www\.)?topperzstore\.com\/[^?#]*\bproduct-\d+\.xml(?:\.gz)?(?:[?#].*)?$/i.test(url)) rows.push(url)
  }
  return [...new Set(rows)]
}

function textFromProperties(parsed) {
  return Object.entries(parsed.properties || {}).map(([key, value]) => `${key}: ${value}`).join(' ')
}

const LEAGUE_ALIASES = [
  ['nfl', /\bnfl\b|football/i], ['nba', /\bnba\b|basketball/i], ['mlb', /\bmlb\b|baseball/i],
  ['nhl', /\bnhl\b|hockey/i], ['mls', /\bmls\b|soccer/i], ['ncaa', /\bncaa\b|college/i],
  ['epl', /\bepl\b|premier league/i], ['laliga', /la\s+liga/i], ['bundesliga', /bundesliga/i],
  ['ligue1', /ligue\s*1/i], ['seriea', /serie\s*a/i]
]

function findLeagueKey(text, explicit = '') {
  const direct = findLeague(explicit)
  if (direct) return direct.key
  return LEAGUE_ALIASES.find(([, pattern]) => pattern.test(text))?.[0] || ''
}

function inferTeam(leagueKey, explicit, text) {
  if (explicit) {
    const team = findTeam(leagueKey, explicit)
    if (team) return team.slug
  }
  const league = findLeague(leagueKey)
  if (!league) return ''
  const haystack = ` ${taxonomySlug(text).replace(/-/g, ' ')} `
  return league.teams
    .filter(team => haystack.includes(` ${taxonomySlug(team.name).replace(/-/g, ' ')} `))
    .sort((a, b) => b.name.length - a.name.length)[0]?.slug || ''
}

function inferProductGroup(parsed) {
  const properties = parsed.properties || {}
  const rawCategory = `${properties['Product category'] || properties.Category || ''} ${parsed.breadcrumbs.join(' ')}`
  const text = `${parsed.name} ${parsed.description} ${rawCategory}`.toLowerCase()
  if (/\b(?:knit|beanie|skully|pom[- ]?pom|winter hat)\b/.test(text)) return 'Knit Hats'
  if (/\b(?:cap|caps|hat|hats|fitted|snapback|9forty|9fifty|59fifty|a[- ]?frame|trucker|visor)\b/.test(text)) return 'Caps'
  if (/\b(?:sock|socks)\b/.test(text)) return 'Socks & Small Apparel'
  if (/\b(?:hoodie|t[- ]?shirt|shirt|tee|sweatshirt|jacket|apparel|clothing)\b/.test(text)) return 'Fan Apparel'
  if (/\b(?:voucher|gift card|cleaner|spray|protector|brush|accessor(?:y|ies)|bundle)\b/.test(text)) return 'Accessories'
  return 'Accessories'
}

export function inferTopperzTaxonomy(parsed) {
  const properties = parsed.properties || {}
  const haystack = [parsed.name, parsed.description, parsed.brand, ...parsed.breadcrumbs, textFromProperties(parsed)].filter(Boolean).join(' ')
  const league = findLeagueKey(haystack, properties.League || properties.Liga || '')
  const team = inferTeam(league, properties.Team || properties.Mannschaft || '', haystack)
  const productGroup = inferProductGroup(parsed)
  const category = productGroup === 'Fan Apparel' ? 'Fan Apparel' : productGroup === 'Socks & Small Apparel' ? 'Accessories' : productGroup
  const sport = findLeague(league)?.sport?.toLowerCase() || ''
  const taxonomy = normalizeAccessoryTaxonomy({
    productGroup,
    taxonomy: {
      category,
      productGroup,
      ...(league ? { league } : {}),
      ...(sport ? { sport } : {}),
      ...(team ? { team: normalizeTeamSlug(league, team) } : {}),
      ...(parsed.brand ? { brand: parsed.brand } : {}),
      ...(properties.Color ? { colorFamily: sanitizeTopperzPublicText(properties.Color) } : {}),
      ...(properties.Material ? { material: sanitizeTopperzPublicText(properties.Material) } : {})
    }
  })
  return { productGroup, category, league, team, sport, taxonomy }
}

function blockList(description, title) {
  const text = sanitizeTopperzPublicText(description)
  const pieces = text.split(/(?<=[.!?])\s+/).map(value => value.trim()).filter(Boolean).slice(0, 20)
  return pieces.map((content, index) => ({ id: stableId('block', `topperz:${title}:${index}:${content}`, 16), type: index === 0 ? 'paragraph' : 'paragraph', content, mediaId: '' }))
}

function money(value) {
  const numeric = Number(value)
  return Number.isFinite(numeric) && numeric >= 0 ? Number(numeric.toFixed(2)) : 0
}

function normalizedOptions(parsed) {
  const options = Array.isArray(parsed.options) ? parsed.options : []
  return options.map(option => ({
    name: String(option.name || '').replace(/\s+/g, ' ').trim().replace(/^./, value => value.toUpperCase()),
    values: [...new Set((option.values || []).map(value => sanitizeTopperzPublicText(value)).filter(Boolean))]
  })).filter(option => option.name && option.values.length).slice(0, 3)
}

function combinations(options) {
  return options.reduce((rows, option) => rows.flatMap(row => option.values.map(value => ({ ...row, [option.name]: value }))), [{}])
}

function cleanBrandTitle(name, brand) {
  // Keep manufacturer/team names that are part of the product identity. Only
  // remove the retailer's own marker, which must never become Jersevo copy.
  return sanitizeTopperzPublicText(name).replace(new RegExp(`\\b${String(brand || '').replace(/[.*+?^${}()|[\]\\]/g, '\\$&')}\\s*store\\b`, 'ig'), '').replace(/\s+/g, ' ').trim()
}

export function normalizeTopperzProduct(parsed, {
  usedHandles = new Set(),
  usedSkus = new Set(),
  defaultStock = TOPPERZ_DEFAULT_STOCK,
  activate = false
} = {}) {
  const sourceIdentity = String(parsed.sourceId || parsed.sku || parsed.sourceUrl || stableHash(parsed.name, 20))
  const listingId = stableId('listing', `topperz-product:${sourceIdentity}`)
  const sourceTitle = cleanBrandTitle(parsed.name || 'Imported fan product', parsed.brand)
  const baseHandle = `${slugify(sourceTitle).slice(0, 92)}-tz-${stableHash(sourceIdentity, 6)}`
  const handle = uniqueHandle(baseHandle, usedHandles)
  const category = inferTopperzTaxonomy(parsed)
  const title = sourceTitle || 'Imported fan product'
  const propertiesText = textFromProperties(parsed)
  const blocks = blockList(parsed.description || `${title}. ${propertiesText}`, title)
  const description = sanitizeTopperzPublicText([blocks[0]?.content || parsed.description || title, propertiesText].filter(Boolean).join(' ')).slice(0, 2600)
  const options = normalizedOptions(parsed)
  const rows = combinations(options)
  const variantRows = rows.length ? rows : [{}]
  const variants = variantRows.map((values, index) => {
    const external = `${sourceIdentity}:${JSON.stringify(values)}:${index}`
    const baseSku = parsed.sku ? `${parsed.sku}${Object.values(values).length ? '-' + Object.values(values).join('-') : ''}` : `ET-TZ-${stableHash(external, 10).toUpperCase()}`
    let sku = slugify(baseSku).toUpperCase().replace(/[^A-Z0-9-]/g, '').slice(0, 54) || `ET-TZ-${stableHash(external, 10).toUpperCase()}`
    let suffix = 2
    while (usedSkus.has(sku)) sku = `${sku.slice(0, Math.max(1, 58 - String(suffix).length - 1))}-${suffix++}`
    usedSkus.add(sku)
    return {
      id: stableId('variant', `topperz-variant:${external}`),
      sku,
      values,
      price: money(parsed.price),
      compareAt: null,
      cost: null,
      inventory: Math.max(0, Math.trunc(Number(defaultStock) || TOPPERZ_DEFAULT_STOCK)),
      weightGrams: null,
      barcode: parsed.gtin || '',
      status: 'ACTIVE',
      image: null
    }
  })
  const primaryPrice = variants.map(row => row.price).filter(value => value > 0)
  const tags = [...new Set([
    category.productGroup.toLowerCase().replace(/\s+/g, '-'),
    category.category.toLowerCase().replace(/\s+/g, '-'),
    category.league,
    category.team,
    category.sport,
    parsed.brand ? slugify(parsed.brand) : '',
    'sports-fan-gear'
  ].filter(Boolean))].slice(0, 50)
  const fingerprint = createHash('sha256').update(JSON.stringify({ title, description, category, variants, images: parsed.images })).digest('hex')
  const hasSellable = variants.some(row => row.status === 'ACTIVE' && row.price > 0 && row.inventory > 0)
  const listingStatus = activate && hasSellable && parsed.images.length ? 'PUBLISHED' : TOPPERZ_IMPORT_STATUS
  const seoStatus = listingStatus === 'PUBLISHED' ? 'INDEXABLE' : 'BLOCKED'
  const listing = {
    id: listingId,
    handle,
    title,
    subtitle: `${category.productGroup}${category.team ? ` · ${category.team.replace(/-/g, ' ')}` : ''}`.slice(0, 180),
    description,
    price: primaryPrice.length ? Math.min(...primaryPrice) : 0,
    compareAt: null,
    status: listingStatus,
    badge: parsed.badge,
    type: 'READY TO SHIP',
    image: '',
    color: parsed.properties?.Color || parsed.properties?.Colour || '',
    sku: `ET-TZ-${stableHash(`parent:${sourceIdentity}`, 10).toUpperCase()}`,
    artworkLock: 100,
    personalization: [],
    media: [],
    contentBlocks: blocks,
    tags,
    productGroup: category.productGroup,
    taxonomy: category.taxonomy,
    customFields: [],
    seo: {
      title: `${title} | Jersevo`.slice(0, 60),
      description: seoDescription(`${title} ${category.productGroup.toLowerCase()} for ${category.team ? category.team.replace(/-/g, ' ') + ' fans' : 'sports fans'}. Shop product details, available options and delivery information from Jersevo.`, '', 160),
      gmc: { ...(parsed.brand ? { brand: parsed.brand } : {}), ...(parsed.mpn ? { mpn: parsed.mpn } : {}) }
    },
    seoStatus,
    seoQualityScore: listingStatus === 'PUBLISHED' ? 100 : 0,
    seoBlockReasons: listingStatus === 'PUBLISHED' ? [] : ['SOURCE_IMPORT_REVIEW'],
    aiMetadata: {
      importedFrom: 'CATALOG_SANITIZED',
      importSource: TOPPERZ_SOURCE_HOST,
      importVersion: TOPPERZ_IMPORT_VERSION,
      importFingerprint: fingerprint,
      sourceProductId: parsed.productId || parsed.sourceId,
      sourceSku: parsed.sku,
      sourceCurrency: parsed.currency,
      sourcePrice: parsed.price,
      sourceAvailability: parsed.availability,
      rightsReviewRequired: true
    },
    inventory: variants.reduce((sum, row) => sum + row.inventory, 0),
    options,
    variants
  }
  const media = parsed.images.map((sourceUrl, index) => ({
    id: stableId('media', `topperz-media:${sourceIdentity}:${sourceUrl}`, 20),
    type: 'IMAGE',
    sourceUrl,
    filename: `${slugify(title).slice(0, 50)}-${index + 1}.avif`,
    alt: `${title} ${index === 0 ? 'front' : `view ${index + 1}`}`,
    role: index === 0 ? 'front' : 'detail',
    createdAt: null
  }))
  return {
    sourceId: parsed.sourceId,
    sourceSku: parsed.sku,
    sourceUrl: parsed.sourceUrl,
    sourceCategories: [...new Set([...parsed.breadcrumbs, category.productGroup].filter(Boolean))],
    listing,
    media,
    sourceAvailable: parsed.inStock,
    sourceTitle: parsed.name
  }
}

export function publicTopperzListingHasSourceReferences(listing) {
  const publicShape = { ...(listing || {}), aiMetadata: undefined, ai_metadata: undefined }
  // Public listings must retain their Jersevo/Supabase media URLs.  Only
  // source-store provenance is forbidden here; plain `https://` cannot be a
  // blocker because every successfully mirrored product image is an HTTPS
  // URL too.
  return /(?:topperzstore\.com|topperzstore\.de|www\.topperzstore|\btokenz\b)/i.test(JSON.stringify(publicShape))
}

export function topperzImportReport({ items = [], errors = [], sitemap = {} } = {}) {
  const groups = items.reduce((result, item) => {
    const key = item.listing?.productGroup || 'INVALID'
    result[key] = (result[key] || 0) + 1
    return result
  }, {})
  const leagues = items.reduce((result, item) => {
    const key = item.listing?.taxonomy?.league || 'unassigned'
    result[key] = (result[key] || 0) + 1
    return result
  }, {})
  return {
    generatedAt: new Date().toISOString(),
    source: TOPPERZ_SOURCE_HOST,
    sitemap,
    products: items.length,
    variants: items.reduce((sum, item) => sum + (item.listing?.variants?.length || 0), 0),
    sourceImages: items.reduce((sum, item) => sum + (item.media?.length || 0), 0),
    statusCounts: items.reduce((result, item) => { const key = item.listing?.status || 'INVALID'; result[key] = (result[key] || 0) + 1; return result }, {}),
    groups,
    leagues,
    errors,
    items: items.map(item => ({ sourceId: item.sourceId, sourceSku: item.sourceSku, id: item.listing?.id, handle: item.listing?.handle, title: item.listing?.title, productGroup: item.listing?.productGroup, taxonomy: item.listing?.taxonomy, options: item.listing?.options, inventory: item.listing?.inventory, sourceImages: item.media?.length || 0 }))
  }
}
