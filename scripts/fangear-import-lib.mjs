import { createHash } from 'node:crypto'

export const SOURCE_HOST = 'fangearsport.com'
export const IMPORT_ARTWORK_LOCK = 70
export const IMPORT_STATUS = 'DRAFT'

const LEAGUES = new Map([
  ['nfl', { key: 'nfl', name: 'NFL', sport: 'Football' }],
  ['mlb', { key: 'mlb', name: 'MLB', sport: 'Baseball' }],
  ['nba', { key: 'nba', name: 'NBA', sport: 'Basketball' }],
  ['mls', { key: 'mls', name: 'MLS', sport: 'Soccer' }]
])

const PRODUCT_GROUP_SLUGS = new Set([
  'football-jersey', 'baseball-jersey', 'soccer-jersey', 'basketball-jersey', 'hoodies', 'apparel'
])

const FIELD_PRESETS = Object.freeze({
  name: { key: 'name', label: 'Name', type: 'text', required: false, placeholder: 'YOUR NAME', maxLength: 14, help: 'Name printed on the garment.' },
  number: { key: 'number', label: 'Number', type: 'number', required: false, placeholder: '24', maxLength: 2, help: 'Player number from 00 to 99.' },
  teamCity: { key: 'teamCity', label: 'Team / city', type: 'text', required: false, placeholder: 'YOUR CITY', maxLength: 18, help: 'Team, city or place tied to the story.' },
  year: { key: 'year', label: 'Year', type: 'number', required: false, placeholder: '2026', maxLength: 4, help: 'A four-digit season or memory.' },
  color: { key: 'color', label: 'Colour note', type: 'text', required: false, placeholder: 'BLACK / PURPLE', maxLength: 20, help: 'A colour request when this design permits it.' },
  photo: { key: 'photo', label: 'Photo', type: 'photo', required: false, placeholder: '', maxLength: null, help: 'Optional customer reference photo.' }
})

const htmlEntity = value => String(value || '')
  .replace(/&nbsp;/gi, ' ')
  .replace(/&amp;/gi, '&')
  .replace(/&quot;/gi, '"')
  .replace(/&#0*39;|&apos;/gi, "'")
  .replace(/&lt;/gi, '<')
  .replace(/&gt;/gi, '>')

export function stableHash(value, length = 20) {
  return createHash('sha256').update(String(value || '')).digest('hex').slice(0, length)
}

export function stableId(prefix, value, length = 20) {
  return `${prefix}-${stableHash(value, length)}`
}

export function slugify(value, fallback = 'listing') {
  const slug = String(value || '').normalize('NFD').replace(/[\u0300-\u036f]/g, '').toLowerCase()
    .replace(/&/g, ' and ').replace(/[^a-z0-9]+/g, '-').replace(/^-+|-+$/g, '')
  return slug || fallback
}

export function uniqueHandle(value, used = new Set()) {
  const base = slugify(value)
  let handle = base
  let suffix = 2
  while (used.has(handle)) handle = `${base}-${suffix++}`
  used.add(handle)
  return handle
}

export function minorToMoney(value, minorUnit = 2) {
  if (value === '' || value == null) return null
  const numeric = Number(value)
  if (!Number.isFinite(numeric)) return null
  const unit = minorUnit === '' || minorUnit == null ? 2 : Number(minorUnit)
  return Number((numeric / (10 ** (Number.isFinite(unit) ? unit : 2))).toFixed(2))
}

export function cleanTag(value) {
  const tag = slugify(value, '')
  if (!tag || /fangear|fangearsport|fgs|gpt|openai|prompt|ai-image/.test(tag)) return ''
  return tag
}

export function stripSourceUrls(value) {
  return String(value || '')
    .replace(/https?:\/\/[^\s"'<>]+/gi, '')
    .replace(/www\.[^\s"'<>]+/gi, '')
    .replace(new RegExp(`(?:https?:\\/\\/)?(?:[^\\s"'<>]*\\.)?${SOURCE_HOST.replace('.', '\\.')}(?:[^\\s"'<>]*)`, 'gi'), '')
}

export function sanitizePublicText(value) {
  return htmlEntity(stripSourceUrls(value))
    .replace(/<!--[\s\S]*?-->/g, ' ')
    .replace(/<script[\s\S]*?<\/script>/gi, ' ')
    .replace(/<style[\s\S]*?<\/style>/gi, ' ')
    .replace(/<[^>]+>/g, ' ')
    .replace(/\b(?:gtx-trans|google translate|translate widget)\b/gi, ' ')
    .replace(/\b(?:fangear(?:sport)?|fgs\s*pro)\b/gi, ' ')
    .replace(/\s+/g, ' ')
    .trim()
}

export function sanitizeSourceHtml(value) {
  let html = String(value || '')
    .replace(/<!--[\s\S]*?-->/g, '')
    .replace(/<script[\s\S]*?<\/script>/gi, '')
    .replace(/<style[\s\S]*?<\/style>/gi, '')
    .replace(/<iframe[\s\S]*?<\/iframe>/gi, '')
    .replace(/\s(?:class|id|style|title|role|aria-[\w-]+|data-[\w-]+|href|src|srcset|width|height|target|rel)\s*=\s*(?:"[^"]*"|'[^']*'|[^\s>]+)/gi, '')
    .replace(/<a\b[^>]*>/gi, '')
    .replace(/<\/a>/gi, '')
    .replace(/\s+>/g, '>')
  html = stripSourceUrls(html)
  html = html.replace(/\b(?:fangear(?:sport)?|fgs\s*pro|gtx-trans|google translate)\b/gi, '')
  return html
}

function blockText(value) {
  return sanitizePublicText(value).replace(/^[-*•]+\s*/, '').trim()
}

export function htmlToBlocks(value, productName = '') {
  const html = sanitizeSourceHtml(value)
  const blocks = []
  const matcher = /<(h[2-4]|p|blockquote|li)\b[^>]*>([\s\S]*?)<\/\1>/gi
  let match
  while ((match = matcher.exec(html))) {
    const content = blockText(match[2])
    if (!content) continue
    const type = match[1].toLowerCase().startsWith('h') ? 'heading' : match[1].toLowerCase() === 'blockquote' ? 'quote' : 'paragraph'
    if (blocks.at(-1)?.content === content) continue
    blocks.push({ id: stableId('block', `${productName}:${blocks.length}:${content}`, 16), type, content: type === 'paragraph' && match[1].toLowerCase() === 'li' ? `• ${content}` : content, mediaId: '' })
  }
  if (!blocks.length) {
    const plain = sanitizePublicText(value)
    if (plain) {
      plain.split(/(?<=[.!?])\s+/).map(item => item.trim()).filter(Boolean).slice(0, 12)
        .forEach((content, index) => blocks.push({ id: stableId('block', `${productName}:${index}:${content}`, 16), type: 'paragraph', content, mediaId: '' }))
    }
  }
  return blocks.slice(0, 100)
}

export function sourceCategoryIndex(categories = []) {
  return new Map((Array.isArray(categories) ? categories : []).map(category => [Number(category.id), category]))
}

export function categoryLineage(category, byId) {
  const lineage = []
  const seen = new Set()
  let current = category
  while (current && !seen.has(Number(current.id))) {
    seen.add(Number(current.id))
    lineage.unshift(current)
    current = byId.get(Number(current.parent))
  }
  return lineage
}

export function mapSourceCategories(categories = [], productCategories = []) {
  const byId = sourceCategoryIndex(categories)
  const rows = Array.isArray(productCategories) ? productCategories : []
  // Product payloads contain compact category rows without `parent`; always
  // resolve them to the full taxonomy row before walking the parent chain.
  const lineages = rows.map(row => categoryLineage(byId.get(Number(row.id)) || row, byId))
  const leagueEntry = lineages.flat().find(row => LEAGUES.has(String(row.slug || '').toLowerCase()))
  const league = leagueEntry ? LEAGUES.get(String(leagueEntry.slug).toLowerCase()) : null
  const teamEntry = lineages
    .filter(lineage => league && lineage.some(row => String(row.slug).toLowerCase() === league.key))
    .map(lineage => lineage.find(row => row.parent === leagueEntry?.id && String(row.slug).toLowerCase() !== league.key))
    .find(Boolean)
  const groupEntry = lineages.flat().reverse().find(row => PRODUCT_GROUP_SLUGS.has(String(row.slug || '').toLowerCase()))
  const categoryTags = rows.map(row => cleanTag(row.name)).filter(Boolean)
  const taxonomy = {
    ...(league ? { league: league.key, sport: league.sport.toLowerCase() } : {}),
    ...(teamEntry ? { team: slugify(teamEntry.slug || teamEntry.name) } : {}),
    ...(groupEntry ? { productGroup: groupEntry.name } : {})
  }
  return {
    league: league?.key || '',
    team: teamEntry ? slugify(teamEntry.slug || teamEntry.name) : '',
    sport: league?.sport || '',
    productGroup: groupEntry?.name || 'Apparel',
    taxonomy,
    categoryTags: [...new Set(categoryTags)]
  }
}

function hasAny(text, patterns) { return patterns.some(pattern => pattern.test(text)) }

export function inferCustomFields(product = {}) {
  const haystack = sanitizePublicText([product.name, product.short_description, product.description].filter(Boolean).join(' ')).toLowerCase()
  const keys = []
  if (hasAny(haystack, [/add\s+(?:your\s+)?name\b/i, /name\s+and\s+number/i, /personaliz/i, /custom(?:ize|ised|ized)/i])) keys.push('name')
  if (hasAny(haystack, [/name\s+and\s+number/i, /add\s+(?:your\s+)?number\b/i, /personaliz/i])) keys.push('number')
  if (hasAny(haystack, [/team\s*\/\s*city/i, /team\s+or\s+city/i, /custom.*city/i])) keys.push('teamCity')
  if (hasAny(haystack, [/custom.*\byear\b/i, /\byear\b.*custom/i])) keys.push('year')
  if (hasAny(haystack, [/custom.*colou?r/i, /colou?r.*custom/i])) keys.push('color')
  if (hasAny(haystack, [/upload.*photo/i, /photo.*upload/i])) keys.push('photo')
  return [...new Set(keys)].map(key => ({ ...FIELD_PRESETS[key], id: `field-${key}` }))
}

function displayAttributeValue(attribute, rawValue) {
  const value = String(rawValue || '')
  const term = (attribute?.terms || []).find(item => String(item.slug).toLowerCase() === value.toLowerCase() || String(item.name).toLowerCase() === value.toLowerCase())
  return term?.name || (value ? value.toUpperCase() : '')
}

function normalizeOptionName(value) {
  return String(value || '').trim().replace(/\s+/g, ' ').replace(/^./, character => character.toUpperCase())
}

function variantPrice(source, fallback) {
  const prices = source?.prices || {}
  return {
    price: minorToMoney(prices.price ?? fallback.price, prices.currency_minor_unit ?? fallback.minorUnit),
    compareAt: minorToMoney(prices.regular_price ?? fallback.regularPrice, prices.currency_minor_unit ?? fallback.minorUnit)
  }
}

function generatedSku(productId, variantId, values, used) {
  const base = `ET-${stableHash(`${productId}:${variantId}:${JSON.stringify(values)}`, 12).toUpperCase()}`
  let sku = base
  let suffix = 2
  while (used.has(sku)) sku = `${base}-${suffix++}`
  used.add(sku)
  return sku
}

export function normalizeSourceProduct(product, { categories = [], variationDetails = new Map(), usedHandles = new Set(), usedSkus = new Set() } = {}) {
  const sourceId = Number(product.id)
  const productId = stableId('listing', `fangear-product:${sourceId}`)
  const handle = uniqueHandle(product.slug || product.name, usedHandles)
  const prices = product.prices || {}
  const minorUnit = Number(prices.currency_minor_unit ?? 2)
  const price = minorToMoney(prices.price, minorUnit) ?? 0
  const regularPrice = minorToMoney(prices.regular_price, minorUnit)
  const compareAt = regularPrice != null && regularPrice > price ? regularPrice : null
  const category = mapSourceCategories(categories, product.categories)
  const customFields = inferCustomFields(product)
  const title = sanitizePublicText(product.name) || 'Imported listing'
  const subtitle = sanitizePublicText(product.short_description) || title
  const blocks = htmlToBlocks(product.description || product.short_description, title)
  const description = blocks.find(block => block.type === 'paragraph')?.content || sanitizePublicText(product.short_description) || title
  const sourceTags = (product.tags || []).map(item => cleanTag(item.name || item.slug)).filter(Boolean)
  const tags = [...new Set([...sourceTags, ...category.categoryTags, category.league, category.team, customFields.length ? 'customizable' : ''])].filter(Boolean)
  const attributes = (product.attributes || []).filter(attribute => attribute?.name && attribute?.terms?.length)
  const options = attributes.map(attribute => ({
    name: normalizeOptionName(attribute.name),
    values: [...new Set(attribute.terms.map(term => String(term.name || term.slug || '').trim()).filter(Boolean))]
  })).filter(option => option.values.length).slice(0, 3)
  const optionAttributes = new Map(attributes.map(attribute => [normalizeOptionName(attribute.name), attribute]))
  const sourceVariations = Array.isArray(product.variations) && product.variations.length ? product.variations : [{ id: `${sourceId}-base`, attributes: [] }]
  const variants = sourceVariations.map((variation, index) => {
    const values = {}
    for (const item of variation.attributes || []) {
      const name = normalizeOptionName(item.name)
      const attribute = optionAttributes.get(name)
      const value = displayAttributeValue(attribute, item.value)
      if (name && value && options.some(option => option.name === name && option.values.includes(value))) values[name] = value
    }
    const detail = variationDetails.get(Number(variation.id)) || null
    const variantMoney = variantPrice(detail, { price: prices.price, regularPrice: prices.regular_price, minorUnit })
    const variantPriceValue = variantMoney.price ?? price
    const variantCompareAt = variantMoney.compareAt != null && variantMoney.compareAt > variantPriceValue ? variantMoney.compareAt : null
    const inventory = detail ? (detail.is_in_stock ? Math.max(1, Number(detail.low_stock_remaining || 1)) : 0) : (product.is_in_stock ? 1 : 0)
    return {
      id: stableId('variant', `${sourceId}:${variation.id || index}`),
      sku: generatedSku(productId, variation.id || index, values, usedSkus),
      values,
      price: variantPriceValue,
      compareAt: variantCompareAt,
      cost: null,
      inventory: Number.isFinite(inventory) ? Math.max(0, Math.trunc(inventory)) : 0,
      weightGrams: null,
      barcode: '',
      status: 'DRAFT',
      image: null
    }
  })
  const primarySourceImage = product.images?.[0]
  const media = (product.images || []).map((image, index) => ({
    id: stableId('media', `${sourceId}:${image.id || image.src || index}`),
    type: 'IMAGE',
    sourceUrl: image.src || image.url || '',
    filename: `${slugify(title).slice(0, 55)}-${index + 1}.webp`,
    alt: sanitizePublicText(image.alt || title),
    createdAt: null
  })).filter(item => item.sourceUrl).slice(0, 20)
  const listing = {
    id: productId,
    handle,
    title,
    subtitle,
    description,
    price,
    compareAt,
    status: IMPORT_STATUS,
    badge: null,
    type: customFields.length ? 'PERSONALIZED' : 'READY TO SHIP',
    image: '',
    color: '',
    sku: generatedSku(productId, 'parent', {}, usedSkus),
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
      description: description.slice(0, 180)
    },
    aiMetadata: {},
    inventory: variants.reduce((sum, variant) => sum + variant.inventory, 0),
    options,
    variants
  }
  return { sourceId, listing, media, sourceUrl: '', category, sourceSku: String(product.sku || '') }
}

export function publicListingHasSourceReferences(listing) {
  const serialized = JSON.stringify(listing || {})
  return new RegExp(`(?:${SOURCE_HOST.replace('.', '\\.')})|(?:www\\.)|(?:gpt[-_ ]?image|openai)|(?:\\bprompt\\b)`, 'i').test(serialized)
}

export function buildCollectionPlan(categories = [], products = []) {
  const productByCategory = new Map()
  const usedHandles = new Set()
  for (const product of products) {
    for (const category of product.categories || []) {
      const list = productByCategory.get(Number(category.id)) || []
      list.push(product)
      productByCategory.set(Number(category.id), list)
    }
  }
  return (categories || []).filter(category => Number(category.count || 0) > 0).map(category => {
    const mapped = mapSourceCategories(categories, [category])
    const name = sanitizePublicText(category.name) || 'Catalogue'
    const collectionProducts = [...new Set((productByCategory.get(Number(category.id)) || []).map(product => stableId('listing', `fangear-product:${product.id}`)))]
    return {
      sourceId: Number(category.id),
      id: stableId('collection', `fangear-category:${category.id}`),
      handle: uniqueHandle(category.slug || name, usedHandles),
      name,
      description: sanitizePublicText(category.description || `${name} fan gear and customizable apparel.`),
      status: 'DRAFT',
      heroImageSourceUrl: category.image?.src || '',
      heroImageAlt: sanitizePublicText(category.image?.alt || name),
      sortMode: 'MANUAL',
      seo: { title: name.slice(0, 60), description: sanitizePublicText(category.description || name).slice(0, 180) },
      products: collectionProducts,
      taxonomy: mapped.taxonomy
    }
  })
}

export function importReport({ products = [], collections = [], errors = [], variationDetailsFetched = 0 } = {}) {
  const counts = products.reduce((result, item) => {
    result[item.listing?.status || 'INVALID'] = (result[item.listing?.status || 'INVALID'] || 0) + 1
    return result
  }, {})
  return {
    generatedAt: new Date().toISOString(),
    source: SOURCE_HOST,
    products: products.length,
    collections: collections.length,
    variationDetailsFetched,
    statusCounts: counts,
    personalized: products.filter(item => item.listing?.customFields?.length).length,
    withMedia: products.filter(item => item.media?.length).length,
    errors,
    items: products.map(item => ({ sourceId: item.sourceId, id: item.listing?.id, handle: item.listing?.handle, title: item.listing?.title, categories: item.category, sourceSku: item.sourceSku }))
  }
}
