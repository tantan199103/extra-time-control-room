import { createHash } from 'node:crypto'
import { sanitizeImagePrivacyMetadata } from '../src/lib/image-privacy.js'
import { seoDescription } from '../src/lib/seo-text.js'
import {
  stableHash,
  stableId,
  slugify,
  uniqueHandle,
  minorToMoney,
  cleanTag,
  stripSourceUrls,
  sanitizePublicText,
  sanitizeSourceHtml,
  htmlToBlocks,
  publicListingHasSourceReferences,
  SOURCE_HOSTS,
  IMPORT_ARTWORK_LOCK,
  IMPORT_STATUS
} from './fangear-import-lib.mjs'

export const PRIMARY_FANATICS_HOST = 'fanatics.com'
export const FANATICS_HOSTS = SOURCE_HOSTS

const FANATICS_BRAND_RE = /\b(?:fanatics(?:\s*(?:branded|authentic|exclusive|pro\s*line))?|fansedge|nfl\s*shop|nba\s*store|mlb\s*shop|nhl\s*shop|officially?\s+licensed(?:\s+by\s+the\s+[a-z0-9]+)?|nike|adidas|jordan(?:\s*brand)?|mitchell\s*(?:&|and)\s*ness|new\s*era|under\s*armour|puma|starter|champion)\b/gi

const FANATICS_LEAGUES = new Map([
  ['nfl', { key: 'nfl', name: 'NFL', sport: 'Football', group: 'Football Jersey' }],
  ['mlb', { key: 'mlb', name: 'MLB', sport: 'Baseball', group: 'Baseball Jersey' }],
  ['nba', { key: 'nba', name: 'NBA', sport: 'Basketball', group: 'Basketball Jersey' }],
  ['nhl', { key: 'nhl', name: 'NHL', sport: 'Hockey', group: 'Hockey Jersey' }],
  ['mls', { key: 'mls', name: 'MLS', sport: 'Soccer', group: 'Soccer Jersey' }],
  ['ncaa', { key: 'ncaa', name: 'NCAA', sport: 'Collegiate', group: 'College Apparel' }],
  ['premier-league', { key: 'premier-league', name: 'Premier League', sport: 'Soccer', group: 'Soccer Jersey' }]
])

const SIZE_NORMALIZATION = new Map([
  ['sm', 'S'], ['small', 'S'], ['s', 'S'],
  ['md', 'M'], ['med', 'M'], ['medium', 'M'], ['m', 'M'],
  ['lg', 'L'], ['large', 'L'], ['l', 'L'],
  ['xl', 'XL'], ['x-large', 'XL'], ['extra large', 'XL'],
  ['2xl', '2XL'], ['xxl', '2XL'], ['2x-large', '2XL'],
  ['3xl', '3XL'], ['xxxl', '3XL'], ['3x-large', '3XL'],
  ['4xl', '4XL'], ['xxxxl', '4XL'], ['4x-large', '4XL'],
  ['5xl', '5XL'], ['xxxxxl', '5XL'], ['5x-large', '5XL']
])

const CUSTOM_FIELD_PRESETS = Object.freeze({
  name: { key: 'name', label: 'Player / custom name', type: 'text', required: false, placeholder: 'YOUR NAME', maxLength: 14, help: 'Name printed across the upper back.' },
  number: { key: 'number', label: 'Jersey number', type: 'number', required: false, placeholder: '24', maxLength: 2, help: 'Two-digit number from 00 to 99.' },
  teamCity: { key: 'teamCity', label: 'Team / city', type: 'text', required: false, placeholder: 'YOUR CITY', maxLength: 18, help: 'Team or city reference.' },
  year: { key: 'year', label: 'Year', type: 'number', required: false, placeholder: '2026', maxLength: 4, help: 'Season or milestone year.' }
})

export function cleanFanaticsTitle(rawTitle) {
  let title = String(rawTitle || '').trim()
  title = title.replace(FANATICS_BRAND_RE, ' ')
  // Remove gender/age prefix noise if followed by brand or garment
  title = title.replace(/^(?:Men's|Women's|Unisex|Youth|Adult)\s+/i, '')
  // Remove trailing "by <Brand/Seller>"
  title = title.replace(/\s+by\s+[a-z0-9\s]+$/i, '')
  title = title.replace(/\s+/g, ' ').trim()
  return sanitizePublicText(title) || 'Custom Sports Jersey'
}

export function inferFanaticsLeague(haystackText) {
  const normalized = String(haystackText || '').toLowerCase()
  for (const [key, league] of FANATICS_LEAGUES.entries()) {
    const pattern = new RegExp(`\\b(?:${league.key}|${league.name}|${league.sport})\\b`, 'i')
    if (pattern.test(normalized)) return league
  }
  return null
}

export function inferFanaticsCustomFields(product = {}) {
  const text = [product.name, product.title, product.shortDescription, product.description].filter(Boolean).join(' ').toLowerCase()
  const hasCustomization = /\b(?:custom(?:ized|ised|izer)?|personaliz(?:ed|ation)|any\s*name\s*any\s*number|add\s*(?:your\s*)?name|custom\s*jersey)\b/i.test(text)
  if (!hasCustomization) return []
  return [
    { ...CUSTOM_FIELD_PRESETS.name, id: 'field-name' },
    { ...CUSTOM_FIELD_PRESETS.number, id: 'field-number' },
    { ...CUSTOM_FIELD_PRESETS.teamCity, id: 'field-teamCity' }
  ]
}

export function normalizeFanaticsSize(value) {
  const raw = String(value || '').trim()
  const clean = raw.toLowerCase().replace(/^(?:men's|women's|size|adult)\s*/i, '').trim()
  return SIZE_NORMALIZATION.get(clean) || raw.toUpperCase()
}

export function cleanFanaticsMediaUrl(rawUrl) {
  if (!rawUrl) return ''
  try {
    const parsed = new URL(rawUrl)
    // If it's a Fanatics CDN URL (e.g. fanatics.frgimages.com or images.footballfanatics.com),
    // strip downscaling parameters to retrieve high-resolution assets (w=1200)
    if (/frgimages\.com|footballfanatics\.com/i.test(parsed.hostname)) {
      if (parsed.searchParams.has('w')) parsed.searchParams.set('w', '1200')
      if (parsed.searchParams.has('q')) parsed.searchParams.set('q', '92')
    }
    return parsed.toString()
  } catch {
    return String(rawUrl).trim()
  }
}

export function parseFanaticsJsonLd(jsonLd) {
  if (!jsonLd || typeof jsonLd !== 'object') return null
  const offers = jsonLd.offers || {}
  const rawImages = Array.isArray(jsonLd.images)
    ? jsonLd.images
    : (Array.isArray(jsonLd.image) ? jsonLd.image : jsonLd.image ? [jsonLd.image] : [])
  const images = rawImages.map(img => (typeof img === 'string' ? img : img.url || img.contentUrl)).filter(Boolean)
  const priceNumeric = offers.price ? Number(offers.price) : null
  const currency = offers.priceCurrency || 'USD'
  const inStock = String(offers.availability || '').includes('InStock')

  return {
    id: jsonLd.sku || jsonLd.productID || jsonLd.mpn || '',
    name: jsonLd.name || '',
    description: jsonLd.description || '',
    brand: jsonLd.brand?.name || 'Fanatics',
    sku: jsonLd.sku || '',
    price: priceNumeric,
    currency,
    inStock,
    images
  }
}

export function normalizeFanaticsProduct(source, { usedHandles = new Set(), usedSkus = new Set(), defaultTeam = '', defaultLeague = '' } = {}) {
  const parsed = source['@type'] === 'Product' ? parseFanaticsJsonLd(source) : source
  const rawId = String(parsed.id || parsed.sku || parsed.productId || stableHash(parsed.name || parsed.title, 12))
  const productId = stableId('listing', `fanatics-product:${rawId}`)
  
  const rawTitle = parsed.name || parsed.title || 'Game Day Jersey'
  const title = cleanFanaticsTitle(rawTitle)
  const handle = uniqueHandle(slugify(title), usedHandles)

  const rawDescription = parsed.description || parsed.shortDescription || `${title} premium athletic performance jersey.`
  const cleanDescriptionText = sanitizePublicText(rawDescription)
  const blocks = htmlToBlocks(rawDescription, title)
  const description = blocks.find(block => block.type === 'paragraph')?.content || cleanDescriptionText || title

  const price = typeof parsed.price === 'number' && Number.isFinite(parsed.price)
    ? Number(parsed.price.toFixed(2))
    : minorToMoney(parsed.prices?.price ?? 7999, 2) ?? 79.99

  const regularPrice = typeof parsed.regularPrice === 'number' && Number.isFinite(parsed.regularPrice)
    ? Number(parsed.regularPrice.toFixed(2))
    : minorToMoney(parsed.prices?.regular_price, 2)
  const compareAt = regularPrice != null && regularPrice > price ? regularPrice : null

  const leagueInfo = inferFanaticsLeague(`${title} ${rawDescription} ${defaultLeague}`)
  const leagueKey = leagueInfo?.key || slugify(defaultLeague || '')
  const team = slugify(parsed.team || defaultTeam || '')
  const productGroup = leagueInfo?.group || 'Football Jersey'

  const customFields = inferFanaticsCustomFields(parsed)

  // Normalize sizes/options
  const rawSizes = Array.isArray(parsed.sizes) && parsed.sizes.length
    ? parsed.sizes
    : (parsed.attributes?.find(attr => /size/i.test(attr.name))?.terms || ['S', 'M', 'L', 'XL', '2XL'])
  const sizeValues = [...new Set(rawSizes.map(item => normalizeFanaticsSize(typeof item === 'string' ? item : item.name || item.slug || '')))].filter(Boolean)

  const options = sizeValues.length ? [{ name: 'Size', values: sizeValues }] : []

  const variants = (sizeValues.length ? sizeValues : ['One Size']).map((sizeValue, index) => {
    const combination = sizeValues.length ? { Size: sizeValue } : {}
    const sku = `ET-FAN-${stableHash(`${productId}:${sizeValue}:${index}`, 10).toUpperCase()}`
    usedSkus.add(sku)
    return {
      id: stableId('variant', `${productId}:${sizeValue}:${index}`),
      sku,
      values: combination,
      price,
      compareAt,
      cost: null,
      inventory: parsed.inStock !== false ? 10 : 0,
      weightGrams: 350,
      barcode: '',
      status: 'DRAFT',
      image: null
    }
  })

  // Normalize media descriptors
  const rawMedia = Array.isArray(parsed.images) ? parsed.images : parsed.image ? [parsed.image] : []
  const media = rawMedia.map((item, index) => {
    const rawUrl = typeof item === 'string' ? item : item.src || item.url || ''
    const cleanedUrl = cleanFanaticsMediaUrl(rawUrl)
    return {
      id: stableId('media', `${productId}:${cleanedUrl || index}`),
      type: 'IMAGE',
      sourceUrl: cleanedUrl,
      filename: `${slugify(title).slice(0, 50)}-${index + 1}.webp`,
      alt: `${title} view ${index + 1}`,
      createdAt: null
    }
  }).filter(item => item.sourceUrl).slice(0, 15)

  const tags = [...new Set([
    'jersey',
    leagueKey,
    team,
    customFields.length ? 'customizable' : '',
    ...((parsed.tags || []).map(t => cleanTag(typeof t === 'string' ? t : t.name || '')))
  ])].filter(Boolean)

  const listing = {
    id: productId,
    handle,
    title,
    subtitle: description.slice(0, 120),
    description,
    price,
    compareAt,
    status: IMPORT_STATUS,
    badge: null,
    type: customFields.length ? 'PERSONALIZED' : 'READY TO SHIP',
    image: '',
    color: '',
    sku: `ET-FAN-${stableHash(productId, 10).toUpperCase()}`,
    artworkLock: IMPORT_ARTWORK_LOCK,
    personalization: customFields.map(field => field.label),
    media: [],
    contentBlocks: blocks,
    tags,
    productGroup,
    taxonomy: {
      ...(leagueKey ? { league: leagueKey, sport: leagueInfo?.sport?.toLowerCase() || 'football' } : {}),
      ...(team ? { team } : {}),
      productGroup
    },
    customFields,
    seo: {
      title: `${title} | Jersevo`.slice(0, 60),
      description: seoDescription(description, '', 160)
    },
    aiMetadata: {
      importedFrom: 'CATALOG_ANONYMIZED',
      sanitizedAt: new Date().toISOString()
    },
    inventory: variants.reduce((sum, v) => sum + v.inventory, 0),
    options,
    variants
  }

  return {
    sourceId: rawId,
    listing,
    media,
    sourceUrl: '',
    sourceSku: String(parsed.sku || rawId)
  }
}

// Media Pipeline: Download, strip EXIF/metadata, upload to Supabase 'product-media'
function mediaTypeFromResponse(response, sourceUrl) {
  const supplied = String(response.headers?.get?.('content-type') || '').split(';')[0].toLowerCase()
  if (/^image\/(?:jpeg|png|webp|avif)$/.test(supplied)) return supplied
  try {
    const extension = String(new URL(sourceUrl).pathname.split('.').pop() || '').toLowerCase()
    return ({ jpg: 'image/jpeg', jpeg: 'image/jpeg', png: 'image/png', webp: 'image/webp', avif: 'image/avif' })[extension] || 'image/jpeg'
  } catch {
    return 'image/jpeg'
  }
}

function extensionForMime(mime) {
  return ({ 'image/jpeg': 'jpg', 'image/png': 'png', 'image/webp': 'webp', 'image/avif': 'avif' })[mime] || 'webp'
}

export async function downloadCleanImage(sourceUrl, { timeoutMs = 30000, fetchFn = fetch } = {}) {
  const controller = new AbortController()
  const timeout = setTimeout(() => controller.abort(), timeoutMs)
  try {
    const response = await fetchFn(sourceUrl, {
      signal: controller.signal,
      headers: {
        accept: 'image/avif,image/webp,image/png,image/jpeg',
        'user-agent': 'Mozilla/5.0 (Windows NT 10.0; Win64; x64) AppleWebKit/537.36 (KHTML, like Gecko) Chrome/120.0.0.0 Safari/537.36'
      }
    })
    if (!response.ok) throw new Error(`Failed to fetch image: status ${response.status}`)
    const mime = mediaTypeFromResponse(response, sourceUrl)
    const arrayBuffer = await response.arrayBuffer()
    const rawBlob = new Blob([arrayBuffer], { type: mime })
    // Strip EXIF, XMP, IPTC and tracking metadata
    const cleanBlob = await sanitizeImagePrivacyMetadata(rawBlob)
    return { blob: cleanBlob, mime }
  } finally {
    clearTimeout(timeout)
  }
}

export async function uploadImageToSupabase(supabaseClient, sourceUrl, storagePathOrPrefix, { timeoutMs = 30000, fetchFn = fetch } = {}) {
  const { blob, mime } = await downloadCleanImage(sourceUrl, { timeoutMs, fetchFn })
  const ext = extensionForMime(mime)
  const storagePath = storagePathOrPrefix.includes('.') ? storagePathOrPrefix : `${storagePathOrPrefix}.${ext}`
  const { error } = await supabaseClient.storage
    .from('product-media')
    .upload(storagePath, blob, { contentType: mime, cacheControl: '31536000', upsert: false })

  if (error && !/already exists|duplicate|conflict|409/i.test(error.message || '')) {
    throw new Error(`Supabase storage upload error: ${error.message}`)
  }

  const { data } = supabaseClient.storage.from('product-media').getPublicUrl(storagePath)
  if (!data?.publicUrl) throw new Error('Supabase storage did not return a public URL')
  return { url: data.publicUrl, mime, storagePath }
}

export async function hydrateListingMedia(supabaseClient, item, { mediaLimit = 12, fetchFn = fetch, timeoutMs = 30000, errors = [] } = {}) {
  if (!item?.media?.length) return item
  const uploadedMedia = []

  for (const mediaItem of item.media.slice(0, mediaLimit)) {
    try {
      const storagePrefix = `${item.listing.id}/import/${mediaItem.id}`
      const result = await uploadImageToSupabase(supabaseClient, mediaItem.sourceUrl, storagePrefix, { timeoutMs, fetchFn })
      uploadedMedia.push({
        id: mediaItem.id,
        type: 'IMAGE',
        url: result.url,
        filename: mediaItem.filename,
        alt: mediaItem.alt,
        createdAt: new Date().toISOString()
      })
    } catch (err) {
      errors.push({
        kind: 'fanatics-media-upload',
        sourceUrl: mediaItem.sourceUrl,
        error: err instanceof Error ? err.message : String(err)
      })
    }
  }

  const primaryImage = uploadedMedia[0]?.url || ''
  const updatedListing = {
    ...item.listing,
    image: primaryImage,
    media: uploadedMedia
  }

  return {
    ...item,
    listing: updatedListing,
    media: uploadedMedia
  }
}
