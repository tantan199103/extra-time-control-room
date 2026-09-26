import { createHash } from 'node:crypto'
import { seoDescription } from '../src/lib/seo-text.js'
import {
  IMPORT_ARTWORK_LOCK,
  IMPORT_STATUS,
  cleanTag,
  inferCustomFields,
  slugify,
  stableHash,
  stableId
} from './fangear-import-lib.mjs'

export const TAASS_SOURCE_HOST = 'www.taass.com'
export const TAASS_DEFAULT_INVENTORY = 1000
export const TAASS_IMPORT_STATUS = IMPORT_STATUS

const LEAGUE_RULES = [
  [/(?:^|\b)nfl\b|american football/i, { league: 'nfl', sport: 'football' }],
  [/(?:^|\b)mlb\b|baseball/i, { league: 'mlb', sport: 'baseball' }],
  [/(?:^|\b)nba\b|basketball/i, { league: 'nba', sport: 'basketball' }],
  [/(?:^|\b)nhl\b|ice hockey|eishockey/i, { league: 'nhl', sport: 'hockey' }],
  [/(?:^|\b)ncaa\b|college sports/i, { league: 'ncaa', sport: 'college' }],
  [/(?:^|\b)mls\b/i, { league: 'mls', sport: 'soccer' }],
  // Check named wrestling promotions and racing series before the umbrella
  // rules. Otherwise AEW/F1 rows silently inherit WWE/NASCAR taxonomy.
  [/\baew\b|all elite wrestling/i, { league: 'aew', sport: 'wrestling' }],
  [/\bwwe\b|world wrestling entertainment/i, { league: 'wwe', sport: 'wrestling' }],
  [/\bformula\s*(?:one|1)\b|\bformel\s*1\b|\bf1\b/i, { league: 'formula1', sport: 'motorsports' }],
  [/\bnascar\b|national association for stock car auto racing/i, { league: 'nascar', sport: 'motorsports' }],
  [/wrestling/i, { league: 'wrestling', sport: 'wrestling' }],
  [/racing|motorsport/i, { league: 'motorsports', sport: 'motorsports' }],
  [/soccer|football|fussball|fußball/i, { league: 'soccer', sport: 'soccer' }]
]

function decodeEntity(entity, code, radix) {
  const point = Number.parseInt(code, radix)
  return Number.isInteger(point) && point >= 0 && point <= 0x10ffff ? String.fromCodePoint(point) : entity
}

export function decodeTaassHtml(value) {
  return String(value || '')
    .replace(/&nbsp;|&#x20;/gi, ' ')
    .replace(/&amp;/gi, '&')
    .replace(/&quot;/gi, '"')
    .replace(/&#0*39;|&apos;/gi, "'")
    .replace(/&lt;/gi, '<')
    .replace(/&gt;/gi, '>')
    .replace(/&#x([0-9a-f]+);/gi, (entity, code) => decodeEntity(entity, code, 16))
    .replace(/&#([0-9]+);/g, (entity, code) => decodeEntity(entity, code, 10))
}

function plainText(value) {
  return decodeTaassHtml(value)
    .replace(/<!--[^]*?-->/g, ' ')
    .replace(/<script[^]*?<\/script>/gi, ' ')
    .replace(/<style[^]*?<\/style>/gi, ' ')
    .replace(/<[^>]+>/g, ' ')
    .replace(/\s+/g, ' ')
    .trim()
}

export function sanitizeTaassPublicText(value) {
  return plainText(String(value || '')
    .replace(/https?:\/\/[^\s"'<>]+/gi, ' ')
    .replace(/www\.[^\s"'<>]+/gi, ' ')
    .replace(/\bTAASS(?:\.com)?\b/gi, ' ')
    .replace(/\b(?:shop|order|buy)\s+(?:now\s+)?at\s+TAASS\.com\b/gi, ' ')
    .replace(/\b(?:our|the)\s+TAASS\.com\s+(?:live\s+)?breaks?\b/gi, 'live breaks'))
}

const TITLE_BRAND_ALIASES = Object.freeze({
  'forever collectibles': ['FOCO'],
  'lobster & lemonade': ['L&L'],
  'mitchell & ness': ['Mitchell and Ness']
})
const LEAGUE_NAMES = new Set(['nfl', 'nba', 'mlb', 'nhl', 'mls', 'ncaa', 'wwe', 'aew', 'wrestling', 'nascar', 'formula1', 'motorsports'])
const escapeRegExp = value => String(value).replace(/[.*+?^${}()|[\]\\]/g, '\\$&')

// Remove only the product's verified manufacturer brand, not arbitrary team,
// league, player or model words. The brand remains in taxonomy/GMC metadata.
export function stripTaassBrandFromTitle(value, brand) {
  const original = sanitizeTaassPublicText(value)
  const manufacturer = sanitizeTaassPublicText(brand)
  if (!original || !manufacturer || LEAGUE_NAMES.has(manufacturer.toLowerCase())) return original
  const phrases = [manufacturer, ...(TITLE_BRAND_ALIASES[manufacturer.toLowerCase()] || [])]
    .sort((a, b) => b.length - a.length)
  let result = original
  for (const phrase of phrases) {
    const pattern = new RegExp(`(?<![\\p{L}\\p{N}])${escapeRegExp(phrase)}(?![\\p{L}\\p{N}])`, 'giu')
    result = result.replace(pattern, (match, offset, whole) => {
      const before = whole.slice(Math.max(0, offset - 20), offset)
      if (manufacturer.toLowerCase() === 'jordan' && /\bMichael\s+$/i.test(before)) return match
      if (manufacturer.toLowerCase() === 'wilson' && /\bRussell\s+$/i.test(before)) return match
      return ' '
    })
  }
  result = result.replace(/\(\s*\)|\[\s*\]/g, ' ')
    .replace(/\s+([,.;:!?\)\]])/g, '$1')
    .replace(/([\(\[])\s+/g, '$1')
    .replace(/^[\s\-–—|/,:;]+|[\s\-–—|/,:;]+$/g, '')
    .replace(/\s+/g, ' ').trim()
  return result || original
}

function jsonLdNodes(value) {
  if (!value) return []
  if (Array.isArray(value)) return value.flatMap(jsonLdNodes)
  if (typeof value !== 'object') return []
  return [value, ...jsonLdNodes(value['@graph'])]
}

export function extractTaassJsonLd(html) {
  const nodes = []
  const matcher = /<script\b[^>]*type=["']application\/ld\+json["'][^>]*>([^]*?)<\/script>/gi
  let match
  while ((match = matcher.exec(String(html || '')))) {
    try {
      nodes.push(...jsonLdNodes(JSON.parse(decodeTaassHtml(match[1]).trim())))
    } catch {
      // Ignore unrelated or malformed structured-data blocks. A product page
      // is accepted only when a valid Product/ProductGroup block is present.
    }
  }
  return nodes
}

function valueArray(value) {
  return Array.isArray(value) ? value : value == null ? [] : [value]
}

function firstOffer(value) {
  return valueArray(value).find(offer => offer && typeof offer === 'object') || {}
}

function imageUrls(...values) {
  return [...new Set(values.flatMap(valueArray).map(image => {
    if (typeof image === 'string') return image
    return image?.url || image?.contentUrl || ''
  }).filter(url => /^https:\/\//i.test(String(url))))]
}

function attr(tag, name) {
  const match = String(tag || '').match(new RegExp(`\\b${name}=["']([^"']*)["']`, 'i'))
  return match ? decodeTaassHtml(match[1]) : ''
}

function selectedConfiguratorValues(html) {
  const selected = {}
  const fieldsets = String(html || '').match(/<fieldset\b[^>]*product-detail-configurator-group[^>]*>[^]*?<\/fieldset>/gi) || []
  for (const fieldset of fieldsets) {
    const legend = fieldset.match(/<legend\b[^>]*>([^]*?)<\/legend>/i)?.[1] || ''
    const name = plainText(legend)
      .replace(/^Select\s+/i, '')
      .replace(/\s*Size Chart\s*/gi, ' ')
      .replace(/\s+/g, ' ')
      .trim()
    if (!name) continue
    const input = (fieldset.match(/<input\b[^>]*type=["']radio["'][^>]*checked(?:=["'][^"']*["'])?[^>]*>/gi) || [])[0]
      || (fieldset.match(/<input\b[^>]*checked(?:=["'][^"']*["'])?[^>]*type=["']radio["'][^>]*>/gi) || [])[0]
    if (!input) continue
    const inputId = attr(input, 'id')
    if (!inputId) continue
    const escaped = inputId.replace(/[.*+?^${}()|[\]\\]/g, '\\$&')
    const label = fieldset.match(new RegExp(`<label\\b[^>]*for=["']${escaped}["'][^>]*>([^]*?)<\\/label>`, 'i'))?.[1] || ''
    const value = plainText(label)
      .replace(/\b(?:In Stock|Out of Stock|Ships?\s+\d+\s+days?|Available|Unavailable)\b[^]*$/i, '')
      .trim()
    if (value) selected[name] = value
  }
  return selected
}

export function extractTaassProperties(html) {
  const properties = {}
  const matcher = /<tr\b[^>]*class=["'][^"']*properties-row[^"']*["'][^>]*>[^]*?<th\b[^>]*class=["'][^"']*properties-label[^"']*["'][^>]*>([^]*?)<\/th>[^]*?<td\b[^>]*class=["'][^"']*properties-value[^"']*["'][^>]*>([^]*?)<\/td>[^]*?<\/tr>/gi
  let match
  while ((match = matcher.exec(String(html || '')))) {
    const key = plainText(match[1]).replace(/:\s*$/, '').trim()
    const value = plainText(match[2])
    if (key && value) properties[key] = value
  }
  return properties
}

function extractAlternate(html, language) {
  const links = String(html || '').match(/<link\b[^>]*rel=["']alternate["'][^>]*>/gi) || []
  const match = links.find(link => attr(link, 'hreflang').toLowerCase() === String(language || '').toLowerCase())
  return match ? attr(match, 'href') : ''
}

function breadcrumbNames(nodes) {
  const breadcrumb = nodes.find(node => node?.['@type'] === 'BreadcrumbList')
  return valueArray(breadcrumb?.itemListElement).map(item => sanitizeTaassPublicText(item?.name)).filter(Boolean)
}

function sourceFamilyFromUrl(url) {
  const match = String(url || '').match(/\/(\d{6})(?:-[a-z0-9]+)?\/?(?:[?#].*)?$/i)
  return match?.[1] || ''
}

function gramsFromWeight(weight) {
  const value = Number(weight?.value)
  if (!Number.isFinite(value) || value < 0) return null
  const unit = String(weight?.unitText || weight?.unitCode || '').toLowerCase()
  if (unit === 'kg' || unit === 'kgr' || unit === 'kgm') return Math.round(value * 1000)
  if (unit === 'lb' || unit === 'lbs') return Math.round(value * 453.59237)
  return Math.round(value)
}

function schemaToken(value) {
  return String(value || '').split(/[\/#]/).filter(Boolean).at(-1) || ''
}

function regularPriceFromHtml(html) {
  const scopes = String(html || '').match(/<[^>]+class=["'][^"']*(?:list-price-price|product-detail-list-price)[^"']*["'][^>]*>[^]*?<\/[^>]+>/gi) || []
  for (const scope of scopes) {
    const value = plainText(scope).match(/(?:€|EUR\s*)?([0-9]+(?:[.,][0-9]{1,2})?)/i)?.[1]
    if (value) return Number(value.replace(',', '.'))
  }
  return null
}

function deliveryDays(offer, html) {
  const handling = Number(offer?.shippingDetails?.deliveryTime?.handlingTime?.maxValue)
  if (Number.isFinite(handling) && handling >= 0) return Math.trunc(handling)
  const match = plainText(html).match(/Ships?\s+(\d+)\s+days?/i)
  return match ? Number(match[1]) : null
}

function productBadge(html) {
  const matches = String(html || '').match(/<[^>]+class=["'][^"']*(?:product-badge|badge)[^"']*["'][^>]*>([^]*?)<\/[^>]+>/gi) || []
  const values = matches.map(plainText).filter(value => /^(?:new|hot|sale|neu)$/i.test(value))
  return values[0] ? values[0].replace(/^neu$/i, 'New') : null
}

export function parseTaassProductHtml(html, sourceUrl = '') {
  const nodes = extractTaassJsonLd(html)
  const group = nodes.find(node => node?.['@type'] === 'ProductGroup') || null
  const product = group
    ? valueArray(group.hasVariant).find(node => node?.['@type'] === 'Product')
    : nodes.find(node => node?.['@type'] === 'Product')
  if (!product) throw new Error('TAASS page does not contain Product or ProductGroup structured data.')
  const offer = firstOffer(product.offers || group?.offers)
  const price = Number(offer.price)
  const properties = extractTaassProperties(html)
  const brand = sanitizeTaassPublicText(product.brand?.name || group?.brand?.name || '')
  const images = imageUrls(product.image, group?.image)
  const canonical = attr((String(html || '').match(/<link\b[^>]*rel=["']canonical["'][^>]*>/i) || [])[0], 'href') || sourceUrl
  const availability = String(offer.availability || '')
  const regularPrice = regularPriceFromHtml(html)
  return {
    sourceUrl: canonical || sourceUrl,
    alternateEnUrl: extractAlternate(html, 'en'),
    alternateDeUrl: extractAlternate(html, 'de'),
    familyCode: sourceFamilyFromUrl(canonical || sourceUrl),
    groupId: String(group?.productGroupID || ''),
    productId: String(product.productID || ''),
    sku: String(product.sku || properties['Product number'] || properties.Produktnummer || ''),
    name: sanitizeTaassPublicText(group?.name || product.name || ''),
    description: String(group?.description || product.description || ''),
    brand,
    price: Number.isFinite(price) ? price : 0,
    regularPrice: Number.isFinite(regularPrice) && regularPrice > price ? regularPrice : null,
    currency: String(offer.priceCurrency || 'EUR').toUpperCase(),
    availability,
    inStock: /InStock/i.test(availability) || /\bIn Stock\b/i.test(plainText(html)),
    leadTimeDays: deliveryDays(offer, html),
    gtin: String(product.gtin14 || product.gtin13 || product.gtin12 || product.gtin8 || ''),
    mpn: String(product.mpn || ''),
    releaseDate: String(product.releaseDate || ''),
    weightGrams: gramsFromWeight(product.weight),
    images,
    properties,
    selectedOptions: selectedConfiguratorValues(html),
    breadcrumbs: breadcrumbNames(nodes),
    badge: productBadge(html)
  }
}

export function parseTaassSitemap(xml) {
  const rows = []
  const matcher = /<url>[^]*?<loc>([^]*?)<\/loc>(?:[^]*?<lastmod>([^]*?)<\/lastmod>)?[^]*?<\/url>/gi
  let match
  while ((match = matcher.exec(String(xml || '')))) {
    const url = decodeTaassHtml(match[1]).trim()
    const familyCode = sourceFamilyFromUrl(url)
    if (!familyCode) continue
    rows.push({ url, familyCode, lastmod: plainText(match[2] || '') })
  }
  return rows
}

export function groupTaassSitemapRows(rows = []) {
  const groups = new Map()
  for (const row of rows) {
    if (!row?.familyCode || !row?.url) continue
    const group = groups.get(row.familyCode) || { familyCode: row.familyCode, urls: [], lastmod: row.lastmod || '' }
    if (!group.urls.includes(row.url)) group.urls.push(row.url)
    groups.set(row.familyCode, group)
  }
  return [...groups.values()]
}

export function mergeTaassProductPages(pages = [], fallbackFamilyCode = '') {
  const valid = pages.filter(Boolean)
  if (!valid.length) throw new Error('No parsed TAASS product pages were supplied.')
  const first = valid[0]
  const variants = []
  const seen = new Set()
  for (const page of valid) {
    const key = page.productId || page.sku || page.sourceUrl
    if (!key || seen.has(key)) continue
    seen.add(key)
    variants.push(page)
  }
  return {
    familyCode: first.familyCode || fallbackFamilyCode,
    groupId: valid.find(page => page.groupId)?.groupId || '',
    name: first.name,
    description: valid.find(page => page.description)?.description || '',
    brand: valid.find(page => page.brand)?.brand || '',
    properties: Object.assign({}, ...valid.map(page => page.properties || {})),
    breadcrumbs: [...new Set(valid.flatMap(page => page.breadcrumbs || []))],
    images: [...new Set(valid.flatMap(page => page.images || []))],
    badge: valid.find(page => page.badge)?.badge || null,
    variants,
    sourceUrl: first.sourceUrl
  }
}

function taxonomyFromGroup(group) {
  const properties = group.properties || {}
  const sportValue = properties.Sport || properties.Sportart || ''
  const haystack = [sportValue, group.name, ...group.breadcrumbs].join(' ')
  const league = LEAGUE_RULES.find(([pattern]) => pattern.test(haystack))?.[1] || null
  const category = properties['Product category'] || properties.Produktkategorie || group.breadcrumbs.at(-1) || 'Fan Gear'
  const team = properties.Team || properties.Mannschaft || ''
  const color = properties.Color || properties.Farbe || ''
  const material = properties.Material || ''
  const targetGroup = properties['Target group'] || properties.Zielgruppe || ''
  const year = properties.Year || properties.Jahr || ''
  return {
    productGroup: sanitizeTaassPublicText(category) || 'Fan Gear',
    color: sanitizeTaassPublicText(color),
    taxonomy: {
      ...(league || {}),
      ...(team ? { team: slugify(team) } : {}),
      ...(group.brand ? { brand: group.brand } : {}),
      ...(material ? { material: sanitizeTaassPublicText(material) } : {}),
      ...(targetGroup ? { audience: sanitizeTaassPublicText(targetGroup).toLowerCase() } : {}),
      ...(year ? { year: sanitizeTaassPublicText(year) } : {}),
      productGroup: sanitizeTaassPublicText(category) || 'Fan Gear'
    }
  }
}

function contentBlocks(value, title) {
  const raw = decodeTaassHtml(String(value || ''))
    .replace(/<script[^]*?<\/script>/gi, '')
    .replace(/<style[^]*?<\/style>/gi, '')
    .replace(/<(h[2-4]|p|blockquote|li)\b[^>]*>/gi, '\n<$1>')
    .replace(/<\/(h[2-4]|p|blockquote|li)>/gi, '</$1>\n')
  const blocks = []
  const semantic = /<(h[2-4]|p|blockquote|li)>([^]*?)<\/\1>/gi
  let match
  while ((match = semantic.exec(raw))) {
    const content = sanitizeTaassPublicText(match[2]).replace(/^[-*•]+\s*/, '')
    if (!content || blocks.at(-1)?.content === content) continue
    const tag = match[1].toLowerCase()
    blocks.push({
      id: stableId('block', `${title}:${blocks.length}:${content}`, 16),
      type: tag.startsWith('h') ? 'heading' : tag === 'blockquote' ? 'quote' : 'paragraph',
      content: tag === 'li' ? `• ${content}` : content,
      mediaId: ''
    })
  }
  if (!blocks.length) {
    const plain = sanitizeTaassPublicText(raw)
    plain.split(/(?<=[.!?])\s+/).map(value => value.trim()).filter(Boolean).slice(0, 40).forEach((content, index) => {
      blocks.push({ id: stableId('block', `${title}:${index}:${content}`, 16), type: 'paragraph', content, mediaId: '' })
    })
  }
  return blocks.slice(0, 100)
}

function stableSku(seed, usedSkus) {
  const base = `ET-${stableHash(seed, 12).toUpperCase()}`
  let sku = base
  let suffix = 2
  while (usedSkus.has(sku)) sku = `${base}-${suffix++}`
  usedSkus.add(sku)
  return sku
}

function money(value) {
  const numeric = Number(value)
  if (!Number.isFinite(numeric) || numeric < 0) return 0
  return Number(numeric.toFixed(2))
}

function normalizedInventory(value) {
  const numeric = Number(value)
  return Number.isFinite(numeric) ? Math.min(1_000_000_000, Math.max(0, Math.trunc(numeric))) : TAASS_DEFAULT_INVENTORY
}

export function normalizeTaassProduct(group, {
  usedHandles = new Set(),
  usedSkus = new Set(),
  defaultInventory = TAASS_DEFAULT_INVENTORY
} = {}) {
  const sourceId = String(group.groupId || group.familyCode || group.variants?.[0]?.productId || group.variants?.[0]?.sku || stableHash(group.name, 20))
  const productId = stableId('listing', `taass-product:${sourceId}`)
  const sourceTitle = sanitizeTaassPublicText(group.name) || 'Imported fan product'
  const title = stripTaassBrandFromTitle(sourceTitle, group.brand)
  // Existing URLs are based on the original source title. Keep them stable
  // even when the customer-facing product title is brand-free.
  const handleBase = `${slugify(sourceTitle).slice(0, 100)}-${slugify(group.familyCode || stableHash(sourceId, 8))}`
  const handle = usedHandles.has(handleBase) ? `${handleBase}-${stableHash(sourceId, 6)}` : handleBase
  usedHandles.add(handle)
  const blocks = contentBlocks(group.description, title)
  const description = blocks.find(block => block.type === 'paragraph')?.content || sanitizeTaassPublicText(group.description) || title
  const category = taxonomyFromGroup(group)
  const sourceVariants = Array.isArray(group.variants) && group.variants.length ? group.variants : [{}]
  let optionNames = [...new Set(sourceVariants.flatMap(variant => Object.keys(variant.selectedOptions || {})))].slice(0, 3)
  const optionRows = sourceVariants.map(variant => Object.fromEntries(optionNames.map(name => [name, String(variant.selectedOptions?.[name] || '').trim()])))
  const combinations = optionRows.map(values => JSON.stringify(optionNames.map(name => values[name])))
  const incomplete = optionRows.some(values => optionNames.some(name => !values[name]))
  const duplicated = new Set(combinations).size !== combinations.length
  const needsSynthetic = sourceVariants.length > 1 && (!optionNames.length || incomplete || duplicated)
  if (needsSynthetic && optionNames.length < 3) optionNames.push('Variant')
  else if (needsSynthetic) optionNames[optionNames.length - 1] = 'Variant'
  const inventory = normalizedInventory(defaultInventory)
  const variants = sourceVariants.map((variant, index) => {
    const externalVariantId = String(variant.productId || variant.sku || `${sourceId}:${index}`)
    const values = {}
    for (const name of optionNames) {
      values[name] = name === 'Variant'
        ? sanitizeTaassPublicText(variant.sku || `Variant ${index + 1}`)
        : sanitizeTaassPublicText(variant.selectedOptions?.[name] || 'Default')
    }
    const price = money(variant.price)
    const compareAt = variant.regularPrice != null && Number(variant.regularPrice) > Number(variant.price)
      ? money(variant.regularPrice)
      : null
    return {
      id: stableId('variant', `taass-variant:${externalVariantId}`),
      sku: stableSku(`taass-variant-sku:${externalVariantId}`, usedSkus),
      values,
      price,
      compareAt,
      cost: null,
      inventory,
      weightGrams: variant.weightGrams == null ? null : Math.max(0, Math.trunc(Number(variant.weightGrams) || 0)),
      barcode: String(variant.gtin || ''),
      status: 'ACTIVE',
      image: null,
      _source: {
        sourceSku: String(variant.sku || ''),
        sourceCurrency: String(variant.currency || 'EUR'),
        sourcePrice: Number(variant.price || 0),
        sourceProductId: String(variant.productId || ''),
        sourceMpn: String(variant.mpn || ''),
        sourceAvailability: schemaToken(variant.availability),
        leadTimeDays: variant.leadTimeDays == null ? null : Number(variant.leadTimeDays)
      }
    }
  })
  const options = optionNames.map(name => ({
    name,
    values: [...new Set(variants.map(variant => variant.values[name]).filter(Boolean))]
  })).filter(option => option.values.length)
  const media = [...new Set(group.images || [])].slice(0, 100).map((sourceUrl, index) => ({
    id: stableId('media', `taass-media:${sourceId}:${sourceUrl}`, 20),
    type: 'IMAGE',
    sourceUrl,
    filename: `${slugify(title).slice(0, 55)}-${index + 1}.webp`,
    alt: `${title} view ${index + 1}`,
    createdAt: null
  }))
  const customFields = inferCustomFields({ name: title, short_description: description, description: sanitizeTaassPublicText(group.description) })
  const tags = [...new Set([
    cleanTag(category.taxonomy.league),
    cleanTag(category.taxonomy.sport),
    cleanTag(category.taxonomy.team),
    cleanTag(category.productGroup),
    cleanTag(group.brand),
    ...group.breadcrumbs.map(cleanTag),
    customFields.length ? 'customizable' : ''
  ].filter(Boolean))].slice(0, 50)
  const prices = variants.map(variant => variant.price).filter(value => Number.isFinite(value))
  const comparePrices = variants.map(variant => variant.compareAt).filter(value => Number.isFinite(value))
  const sourceMeta = sourceVariants.map((variant, index) => ({
    index,
    sku: String(variant.sku || ''),
    currency: String(variant.currency || 'EUR'),
    price: Number(variant.price || 0),
    availability: schemaToken(variant.availability),
    leadTimeDays: variant.leadTimeDays == null ? null : Number(variant.leadTimeDays),
    mpn: String(variant.mpn || ''),
    releaseDate: String(variant.releaseDate || '')
  }))
  const fingerprint = createHash('sha256').update(JSON.stringify({ title, description, category, variants: sourceMeta, images: group.images })).digest('hex')
  const listing = {
    id: productId,
    handle,
    title,
    subtitle: description.slice(0, 180),
    description,
    price: prices.length ? Math.min(...prices) : 0,
    compareAt: comparePrices.length ? Math.min(...comparePrices) : null,
    status: TAASS_IMPORT_STATUS,
    badge: group.badge,
    type: customFields.length ? 'PERSONALIZED' : 'READY TO SHIP',
    image: '',
    color: category.color,
    sku: stableSku(`taass-parent-sku:${sourceId}`, usedSkus),
    artworkLock: IMPORT_ARTWORK_LOCK,
    personalization: customFields.map(field => field.label),
    media: [],
    contentBlocks: blocks,
    tags,
    productGroup: category.productGroup,
    taxonomy: category.taxonomy,
    customFields,
    seo: {
      title: title.slice(0, 60),
      description: seoDescription(description, '', 160),
      gmc: {
        ...(group.brand ? { brand: group.brand } : {}),
        ...(sourceVariants[0]?.mpn ? { mpn: sourceVariants[0].mpn } : {})
      }
    },
    aiMetadata: {
      importedFrom: 'CATALOG_SANITIZED',
      importFingerprint: fingerprint,
      sourcePricing: sourceMeta.map(({ currency, price }) => ({ currency, price })),
      priceMultiplier: 1
    },
    inventory: variants.reduce((sum, variant) => sum + variant.inventory, 0),
    options,
    variants
  }
  return {
    sourceId,
    sourceSku: String(group.familyCode || sourceVariants[0]?.sku || ''),
    sourceUrl: group.sourceUrl || '',
    sourceCategories: [...new Set([...group.breadcrumbs, category.productGroup].filter(Boolean))],
    listing,
    media,
    sourceVariants: sourceMeta
  }
}

export function prepareTaassJerseyListing(item) {
  const listing = item.listing
  const unsupportedCurrency = (item.sourceVariants || [])
    .find(variant => String(variant.currency || '').toUpperCase() !== 'EUR')
  if (unsupportedCurrency) throw new Error(`TAASS jersey ${item.sourceSku || item.sourceId} has ${unsupportedCurrency.currency || 'unknown'} pricing; expected EUR for 1:1 USD conversion.`)
  const variants = (listing.variants || []).map(variant => ({
    ...variant,
    // TAASS exposes EUR numeric prices; the jersey sync intentionally applies
    // the agreed 1 EUR → 1 USD storefront conversion.
    price: Number(variant.price || 0),
    compareAt: variant.compareAt == null ? null : Number(variant.compareAt),
    inventory: TAASS_DEFAULT_INVENTORY,
    status: 'ACTIVE'
  }))
  const prices = variants.map(variant => variant.price).filter(value => Number.isFinite(value))
  const compareAt = variants.map(variant => variant.compareAt).filter(value => Number.isFinite(value) && value > 0)
  return {
    ...item,
    listing: {
      ...listing,
      status: 'DRAFT',
      price: prices.length ? Math.min(...prices) : 0,
      compareAt: compareAt.length ? Math.min(...compareAt) : null,
      inventory: variants.reduce((sum, variant) => sum + Number(variant.inventory || 0), 0),
      variants,
      seoStatus: 'BLOCKED',
      seoBlockReasons: ['DRAFT_REVIEW_REQUIRED'],
      aiMetadata: {
        ...listing.aiMetadata,
        priceMultiplier: 1,
        pricingMode: 'EUR_TO_USD_1_TO_1',
        inventoryPolicy: '1000_PER_VARIANT',
        catalogReview: {
          status: 'PENDING',
          note: 'Verify supply and image/content rights before publication.'
        }
      }
    }
  }
}

export function publicTaassListingHasSourceReferences(listing) {
  const serialized = JSON.stringify(listing || {})
  return /(?:https?:\/\/)?(?:www\.)?taass\.com\b|\/media\/[a-f0-9]{2}\//i.test(serialized)
}

export function taassImportReport({ items = [], errors = [], sitemap = {} } = {}) {
  return {
    generatedAt: new Date().toISOString(),
    source: TAASS_SOURCE_HOST,
    sitemap,
    products: items.length,
    variants: items.reduce((sum, item) => sum + (item.listing?.variants?.length || 0), 0),
    sourceImages: items.reduce((sum, item) => sum + (item.media?.length || 0), 0),
    importedImages: items.reduce((sum, item) => sum + (item.listing?.media?.length || 0), 0),
    defaultInventory: items[0]?.listing?.variants?.[0]?.inventory ?? TAASS_DEFAULT_INVENTORY,
    withSourceMedia: items.filter(item => item.media?.length).length,
    statusCounts: items.reduce((counts, item) => ({ ...counts, [item.listing?.status || 'INVALID']: (counts[item.listing?.status || 'INVALID'] || 0) + 1 }), {},),
    errors,
    items: items.map(item => ({
      sourceId: item.sourceId,
      sourceSku: item.sourceSku,
      id: item.listing?.id,
      handle: item.listing?.handle,
      title: item.listing?.title,
      variants: item.listing?.variants?.length || 0,
      inventoryPerVariant: item.listing?.variants?.[0]?.inventory || 0,
      inventoryTotal: item.listing?.variants?.reduce((sum, variant) => sum + Number(variant.inventory || 0), 0) || 0,
      price: item.listing?.price,
      compareAt: item.listing?.compareAt,
      options: item.listing?.options || [],
      variantPreview: (item.listing?.variants || []).map(variant => ({
        values: variant.values,
        price: variant.price,
        compareAt: variant.compareAt,
        inventory: variant.inventory,
        status: variant.status
      })),
      media: item.listing?.media?.length || 0,
      sourceMedia: item.media?.length || 0,
      importedMedia: item.listing?.media?.length || 0,
      productGroup: item.listing?.productGroup,
      taxonomy: item.listing?.taxonomy
    }))
  }
}
