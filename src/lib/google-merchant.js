const DEFAULT_ORIGIN = 'https://www.jersevo.com'
// Extra Time is the customer-facing product brand; Jersevo remains the legal
// organization name used in checkout and policy markup.
const DEFAULT_BRAND = 'Extra Time'
const DEFAULT_GOOGLE_CATEGORY = 'Apparel & Accessories > Clothing > Shirts & Tops'
const DEFAULT_PRODUCT_TYPE = 'Apparel & Accessories > Fan Apparel > Sports Jerseys'

const COLOR_NAMES = [
  'black', 'white', 'navy blue', 'navy', 'royal blue', 'blue', 'sky blue',
  'green', 'yellow', 'gold', 'orange', 'red', 'burgundy', 'maroon', 'purple',
  'pink', 'grey', 'gray', 'silver', 'brown', 'beige', 'cream', 'teal'
]

const FORBIDDEN_SOURCE_PATTERN = /fangearsport|fangear-reference|apikey\.fun|apikey\.fan|openai|gpt-image|source[_ -]?url|source[_ -]?site/i
const UNVERIFIED_AFFILIATION_PATTERN = /\b(?:officially\s+licensed|official\s+(?:nfl|nba|mlb|mls)|authentic\s+(?:nfl|nba|mlb|mls))\b/i

function plainText(value, maxLength = Infinity) {
  return String(value ?? '')
    .replace(/<script[\s\S]*?<\/script>/gi, ' ')
    .replace(/<style[\s\S]*?<\/style>/gi, ' ')
    .replace(/<[^>]+>/g, ' ')
    .replace(/[\u0000-\u0008\u000B\u000C\u000E-\u001F\u007F]/g, '')
    .replace(/\s+/g, ' ')
    .trim()
    .slice(0, maxLength)
}

function object(value) {
  return value && typeof value === 'object' && !Array.isArray(value) ? value : {}
}

function array(value) {
  return Array.isArray(value) ? value : []
}

function unique(values) {
  return [...new Set(values.filter(Boolean))]
}

function positiveMoney(value) {
  const number = Number(value)
  return Number.isFinite(number) && number > 0 ? number : null
}

function httpUrl(value, origin = DEFAULT_ORIGIN) {
  try {
    const url = new URL(String(value || ''), origin)
    return ['http:', 'https:'].includes(url.protocol) ? url.toString() : ''
  } catch {
    return ''
  }
}

function optionValue(variant, names) {
  const values = object(variant?.option_values || variant?.values)
  const keys = new Set(names.map(name => name.toLowerCase()))
  const entry = Object.entries(values).find(([name]) => keys.has(String(name).toLowerCase()))
  return plainText(entry?.[1], 100)
}

function merchantOverrides(product, variant) {
  const productOverrides = object(product?.gmc || product?.seo?.gmc || product?.taxonomy?.gmc)
  const variantOverrides = object(variant?.gmc)
  return { ...productOverrides, ...variantOverrides }
}

function inferredColor(product, variant, overrides) {
  const explicit = plainText(
    overrides.color || optionValue(variant, ['color', 'colour']) || product?.color || product?.taxonomy?.colorFamily,
    100
  )
  if (explicit) return { value: explicit, inferred: false }
  const source = plainText(`${product?.title || ''} ${product?.subtitle || ''}`).toLowerCase()
  const match = COLOR_NAMES.find(color => new RegExp(`\\b${color.replace(/\s+/g, '\\s+')}\\b`, 'i').test(source))
  if (match) return { value: match.replace(/\b\w/g, letter => letter.toUpperCase()), inferred: true }
  return { value: 'Multicolor', inferred: true }
}

function inferredGender(product, overrides) {
  const explicit = plainText(overrides.gender || product?.taxonomy?.gender || product?.taxonomy?.audience, 30).toLowerCase()
  if (['male', 'female', 'unisex'].includes(explicit)) return { value: explicit, inferred: false }
  const source = plainText(`${product?.title || ''} ${product?.subtitle || ''} ${array(product?.tags).join(' ')}`).toLowerCase()
  if (/\b(?:women|womens|women's|ladies|female)\b/.test(source)) return { value: 'female', inferred: true }
  if (/\b(?:men|mens|men's|male)\b/.test(source)) return { value: 'male', inferred: true }
  return { value: 'unisex', inferred: true }
}

function inferredAgeGroup(product, overrides) {
  const explicit = plainText(overrides.age_group || overrides.ageGroup || product?.taxonomy?.ageGroup, 30).toLowerCase()
  if (['newborn', 'infant', 'toddler', 'kids', 'adult'].includes(explicit)) return { value: explicit, inferred: false }
  const source = plainText(`${product?.title || ''} ${product?.subtitle || ''} ${array(product?.tags).join(' ')}`).toLowerCase()
  if (/\b(?:newborn|new born)\b/.test(source)) return { value: 'newborn', inferred: true }
  if (/\b(?:baby|infant)\b/.test(source)) return { value: 'infant', inferred: true }
  if (/\b(?:toddler)\b/.test(source)) return { value: 'toddler', inferred: true }
  if (/\b(?:kid|kids|child|children|youth|junior)\b/.test(source)) return { value: 'kids', inferred: true }
  return { value: 'adult', inferred: true }
}

function normalizedGtin(value) {
  const digits = String(value || '').replace(/[\s-]/g, '')
  if (![8, 12, 13, 14].includes(digits.length) || !/^\d+$/.test(digits)) return ''
  const body = digits.slice(0, -1)
  const expected = Number(digits.at(-1))
  let sum = 0
  for (let index = body.length - 1, position = 0; index >= 0; index -= 1, position += 1) {
    sum += Number(body[index]) * (position % 2 === 0 ? 3 : 1)
  }
  return (10 - (sum % 10)) % 10 === expected ? digits : ''
}

function merchantId(value, fallback) {
  const clean = plainText(value || fallback, 80).toLowerCase().replace(/[^a-z0-9._:-]+/g, '-')
  return clean.replace(/^-+|-+$/g, '').slice(0, 50)
}

function productType(product, overrides) {
  if (plainText(overrides.product_type || overrides.productType, 750)) return plainText(overrides.product_type || overrides.productType, 750)
  const taxonomy = object(product?.taxonomy)
  const league = plainText(taxonomy.league, 80).toUpperCase()
  const team = plainText(taxonomy.team, 120).replace(/-/g, ' ').replace(/\b\w/g, letter => letter.toUpperCase())
  const group = plainText(product?.product_group || product?.productGroup || taxonomy.productGroup, 120)
  return unique([DEFAULT_PRODUCT_TYPE, league, team, group]).join(' > ').slice(0, 750)
}

function merchantTitle(product, size, color) {
  // Google recommends keeping titles under 70 characters even though the
  // transport format accepts a longer value. Truncate only after adding the
  // distinguishing variant values so the offer remains unambiguous.
  const title = plainText(product?.title || product?.name, 70)
  const suffixes = []
  if (color && color !== 'Multicolor' && !new RegExp(`\\b${color.replace(/[.*+?^${}()|[\]\\]/g, '\\$&')}\\b`, 'i').test(title)) suffixes.push(color)
  if (size && !new RegExp(`(?:^|[\\s/-])${size.replace(/[.*+?^${}()|[\]\\]/g, '\\$&')}(?:$|[\\s/-])`, 'i').test(title)) suffixes.push(size)
  if (!suffixes.length) return title
  const suffix = ` - ${suffixes.join(' - ')}`
  return `${title.slice(0, Math.max(1, 70 - suffix.length)).trim()}${suffix}`
}

function mediaUrls(product, primary, origin) {
  return unique(array(product?.media)
    .filter(item => String(item?.type || 'IMAGE').toUpperCase() === 'IMAGE')
    .map(item => httpUrl(item?.url, origin))
    .filter(url => url && url !== primary))
    .slice(0, 10)
}

function customLabels(product, availability) {
  const taxonomy = object(product?.taxonomy)
  const custom = object(product?.seo?.gmc?.custom_labels || product?.gmc?.custom_labels)
  const labels = [
    custom[0] || custom.custom_label_0 || taxonomy.league,
    custom[1] || custom.custom_label_1 || taxonomy.team,
    custom[2] || custom.custom_label_2 || product?.product_group || product?.productGroup || taxonomy.productGroup,
    custom[3] || custom.custom_label_3 || (array(product?.custom_fields || product?.customFields).length ? 'customizable' : 'standard'),
    custom[4] || custom.custom_label_4 || (availability === 'in stock' ? 'in-stock' : 'out-of-stock')
  ]
  return Object.fromEntries(labels.map((value, index) => [`custom_label_${index}`, plainText(value, 100)]).filter(([, value]) => value))
}

export function normalizeGoogleMerchantItem(product, variant, config = {}) {
  const origin = new URL(config.origin || DEFAULT_ORIGIN).origin
  const overrides = merchantOverrides(product, variant)
  const size = plainText(overrides.size || optionValue(variant, ['size']), 100)
  const color = inferredColor(product, variant, overrides)
  const gender = inferredGender(product, overrides)
  const ageGroup = inferredAgeGroup(product, overrides)
  const handle = plainText(product?.handle || product?.id, 300)
  const canonicalLink = handle ? `${origin}/product/${encodeURIComponent(handle)}` : ''
  const variantId = merchantId(overrides.id || variant?.id || variant?.sku, `${product?.id || handle}-${size || 'default'}`)
  const link = canonicalLink && variant?.id ? `${canonicalLink}?variant=${encodeURIComponent(variant.id)}` : canonicalLink
  const primaryImage = httpUrl(overrides.image_link || variant?.image || product?.image || array(product?.media).find(item => String(item?.type || '').toUpperCase() === 'IMAGE')?.url, origin)
  const sellingPrice = positiveMoney(variant?.price ?? product?.price)
  const compareAt = positiveMoney(variant?.compare_at ?? variant?.compareAt ?? product?.compare_at ?? product?.compareAt)
  const isSale = sellingPrice && compareAt && compareAt > sellingPrice
  const availability = Number(variant?.inventory ?? product?.inventory ?? 0) > 0 ? 'in stock' : 'out of stock'
  const description = plainText(product?.description || product?.seo?.description || product?.subtitle || product?.story, 5000)
  const title = merchantTitle(product, size, color.value)
  const brand = plainText(overrides.brand || product?.brand || config.brand || DEFAULT_BRAND, 70)
  const rawGtin = overrides.gtin || variant?.gtin || variant?.barcode || product?.gtin
  const gtin = normalizedGtin(rawGtin)
  const explicitIdentifier = String(overrides.identifier_exists ?? overrides.identifierExists ?? '').toLowerCase()
  const confirmedMpn = plainText(overrides.mpn || variant?.mpn || product?.mpn, 70)
  // An internal SKU is not automatically a manufacturer part number. Custom
  // goods without an assigned GTIN/MPN must be sent with identifier_exists=no;
  // an admin can opt into a confirmed MPN in the listing's GMC overrides.
  const identifierExists = explicitIdentifier === 'no' || explicitIdentifier === 'false'
    ? 'no'
    : (gtin || confirmedMpn || explicitIdentifier === 'yes' || explicitIdentifier === 'true' ? 'yes' : 'no')
  const mpn = identifierExists === 'yes' ? confirmedMpn : ''
  const customizable = array(product?.custom_fields || product?.customFields).length > 0 || /personalized|custom/i.test(`${product?.type || ''} ${title}`)
  const warnings = []
  const blockReasons = []

  if (!variantId) blockReasons.push('MISSING_ID')
  if (!title) blockReasons.push('MISSING_TITLE')
  if (!description) blockReasons.push('MISSING_DESCRIPTION')
  if (!canonicalLink || !link) blockReasons.push('MISSING_LINK')
  if (!primaryImage) blockReasons.push('MISSING_IMAGE')
  if (!sellingPrice) blockReasons.push('INVALID_PRICE')
  if (!size) blockReasons.push('MISSING_SIZE')
  if (!color.value) blockReasons.push('MISSING_COLOR')
  if (!['male', 'female', 'unisex'].includes(gender.value)) blockReasons.push('INVALID_GENDER')
  if (!['newborn', 'infant', 'toddler', 'kids', 'adult'].includes(ageGroup.value)) blockReasons.push('INVALID_AGE_GROUP')
  if (FORBIDDEN_SOURCE_PATTERN.test(`${title} ${description} ${primaryImage}`)) blockReasons.push('SOURCE_METADATA_PRESENT')
  if (UNVERIFIED_AFFILIATION_PATTERN.test(`${title} ${description}`)) blockReasons.push('UNVERIFIED_AFFILIATION_CLAIM')
  if (rawGtin && !gtin) warnings.push('INVALID_GTIN_OMITTED')
  if (color.inferred) warnings.push(color.value === 'Multicolor' ? 'COLOR_DEFAULTED_TO_MULTICOLOR' : 'COLOR_INFERRED_FROM_TITLE')
  if (gender.inferred) warnings.push('GENDER_INFERRED')
  if (ageGroup.inferred) warnings.push('AGE_GROUP_INFERRED')
  if (!brand) blockReasons.push('MISSING_BRAND')
  if (explicitIdentifier === 'yes' || explicitIdentifier === 'true') {
    if (!gtin && !confirmedMpn) blockReasons.push('MISSING_PRODUCT_IDENTIFIER')
  }
  if (!array(product?.media).some(item => String(item?.type || '').toUpperCase() === 'IMAGE')) warnings.push('NO_ADDITIONAL_PRODUCT_IMAGES')

  const item = {
    id: variantId,
    title,
    description,
    link,
    canonical_link: canonicalLink,
    image_link: primaryImage,
    additional_image_link: mediaUrls(product, primaryImage, origin),
    availability,
    price: `${(isSale ? compareAt : sellingPrice || 0).toFixed(2)} USD`,
    ...(isSale ? { sale_price:`${sellingPrice.toFixed(2)} USD` } : {}),
    brand,
    ...(gtin && identifierExists === 'yes' ? { gtin } : {}),
    ...(mpn ? { mpn } : {}),
    identifier_exists: identifierExists,
    condition: 'new',
    google_product_category: plainText(overrides.google_product_category || overrides.googleProductCategory || config.googleProductCategory || DEFAULT_GOOGLE_CATEGORY, 750),
    product_type: productType(product, overrides),
    item_group_id: merchantId(overrides.item_group_id || overrides.itemGroupId || product?.id || handle, handle),
    color: color.value,
    size,
    gender: gender.value,
    age_group: ageGroup.value,
    size_system: plainText(overrides.size_system || overrides.sizeSystem || 'US', 10),
    is_bundle: customizable ? 'yes' : 'no',
    ...(positiveMoney(variant?.weight_grams ?? variant?.weightGrams) ? { shipping_weight:`${Number(variant.weight_grams ?? variant.weightGrams)} g` } : {}),
    ...customLabels(product, availability)
  }

  return {
    item,
    eligible:blockReasons.length === 0,
    blockReasons:unique(blockReasons),
    warnings:unique(warnings),
    source:{ productId:plainText(product?.id || handle, 100), variantId:plainText(variant?.id || '', 100) }
  }
}

export function buildGoogleMerchantCatalogue(products = [], config = {}) {
  const items = []
  const rejected = []
  const warnings = []
  let candidateProducts = 0
  let candidateVariants = 0

  for (const product of array(products)) {
    const status = String(product?.status || '').toUpperCase()
    const seoStatus = String(product?.seo_status || product?.seoStatus || product?.seo?.status || '').toUpperCase()
    if (status !== 'PUBLISHED' || seoStatus !== 'INDEXABLE') {
      rejected.push({ productId:product?.id || product?.handle || '', variantId:'', reasons:[status !== 'PUBLISHED' ? 'PRODUCT_NOT_PUBLISHED' : 'SEO_NOT_INDEXABLE'] })
      continue
    }
    candidateProducts += 1
    const variants = array(product?.pod_product_variants || product?.variants).filter(variant => String(variant?.status || '').toUpperCase() === 'ACTIVE')
    if (!variants.length) {
      rejected.push({ productId:product?.id || product?.handle || '', variantId:'', reasons:['NO_ACTIVE_VARIANTS'] })
      continue
    }
    // Keep an entirely sold-out listing out of the primary source. Individual
    // sold-out size rows are retained when another size is purchasable so
    // Google can understand the full item group.
    if (!variants.some(variant => Number(variant?.inventory || 0) > 0)) {
      rejected.push({ productId:product?.id || product?.handle || '', variantId:'', reasons:['NO_IN_STOCK_VARIANTS'] })
      continue
    }
    for (const variant of variants) {
      candidateVariants += 1
      const normalized = normalizeGoogleMerchantItem(product, variant, config)
      if (normalized.eligible) items.push(normalized.item)
      else rejected.push({ productId:normalized.source.productId, variantId:normalized.source.variantId, reasons:normalized.blockReasons })
      if (normalized.warnings.length) warnings.push({ productId:normalized.source.productId, variantId:normalized.source.variantId, warnings:normalized.warnings })
    }
  }

  const seen = new Set()
  const duplicateIds = new Set()
  for (const item of items) {
    if (seen.has(item.id)) duplicateIds.add(item.id)
    seen.add(item.id)
  }
  const accepted = duplicateIds.size ? items.filter(item => {
    if (!duplicateIds.has(item.id)) return true
    rejected.push({ productId:item.item_group_id, variantId:item.id, reasons:['DUPLICATE_ITEM_ID'] })
    return false
  }) : items

  const reasonCounts = rejected.flatMap(row => row.reasons).reduce((counts, reason) => ({ ...counts, [reason]:(counts[reason] || 0) + 1 }), {})
  const warningCounts = warnings.flatMap(row => row.warnings).reduce((counts, warning) => ({ ...counts, [warning]:(counts[warning] || 0) + 1 }), {})
  return {
    items:accepted,
    report:{
      generatedAt:new Date().toISOString(),
      candidateProducts,
      candidateVariants,
      acceptedItems:accepted.length,
      rejectedItems:rejected.length,
      reasonCounts,
      warningCounts,
      rejected,
      warnings
    }
  }
}

export function googleMerchantReadiness(product, config = {}) {
  const variants = array(product?.pod_product_variants || product?.variants).filter(variant => String(variant?.status || '').toUpperCase() === 'ACTIVE')
  const rows = variants.map(variant => normalizeGoogleMerchantItem(product, variant, config))
  return {
    ready:rows.length > 0 && rows.every(row => row.eligible),
    activeVariants:rows.length,
    readyVariants:rows.filter(row => row.eligible).length,
    blockers:unique(rows.flatMap(row => row.blockReasons)),
    warnings:unique(rows.flatMap(row => row.warnings))
  }
}

function xml(value) {
  return String(value ?? '').replace(/[<>&'"]/g, character => ({ '<':'&lt;', '>':'&gt;', '&':'&amp;', "'":'&apos;', '"':'&quot;' })[character])
}

function xmlTag(name, value) {
  return value === '' || value == null ? '' : `<g:${name}>${xml(value)}</g:${name}>`
}

export function renderGoogleMerchantXml(catalogue, config = {}) {
  const origin = new URL(config.origin || DEFAULT_ORIGIN).origin
  const title = plainText(config.title || 'Extra Time product feed', 150)
  const description = plainText(config.description || 'Published Extra Time products available for purchase in the United States.', 500)
  const items = array(catalogue?.items || catalogue)
  const body = items.map(item => {
    const repeatedImages = array(item.additional_image_link).map(value => xmlTag('additional_image_link', value)).join('')
    const fields = Object.entries(item)
      .filter(([name]) => name !== 'additional_image_link')
      .map(([name, value]) => xmlTag(name, value))
      .join('')
    return `<item>${fields}${repeatedImages}</item>`
  }).join('')
  return `<?xml version="1.0" encoding="UTF-8"?>\n<rss version="2.0" xmlns:g="http://base.google.com/ns/1.0"><channel><title>${xml(title)}</title><link>${xml(origin)}</link><description>${xml(description)}</description>${body}</channel></rss>`
}

function tsvCell(value) {
  return String(value ?? '').replace(/[\t\r\n]+/g, ' ').trim()
}

export function renderGoogleMerchantTsv(catalogue) {
  const items = array(catalogue?.items || catalogue)
  const headers = [
    'id', 'title', 'description', 'link', 'canonical_link', 'image_link', 'additional_image_link',
    'availability', 'price', 'sale_price', 'brand', 'gtin', 'mpn', 'identifier_exists', 'condition',
    'google_product_category', 'product_type', 'item_group_id', 'color', 'size', 'gender', 'age_group',
    'size_system', 'is_bundle', 'shipping_weight', 'custom_label_0', 'custom_label_1', 'custom_label_2',
    'custom_label_3', 'custom_label_4'
  ]
  return [headers.join('\t'), ...items.map(item => headers.map(header => tsvCell(header === 'additional_image_link' ? array(item[header]).join(',') : item[header])).join('\t'))].join('\n')
}

export const GOOGLE_MERCHANT_DEFAULTS = Object.freeze({
  origin:DEFAULT_ORIGIN,
  brand:DEFAULT_BRAND,
  googleProductCategory:DEFAULT_GOOGLE_CATEGORY,
  productType:DEFAULT_PRODUCT_TYPE
})
