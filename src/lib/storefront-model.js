import { normalizeProduct } from './catalog-model.js'

const FALLBACK_SIZES = ['XS', 'S', 'M', 'L', 'XL', 'XXL']

const optionSlug = value => String(value || '').trim().toLowerCase().replace(/[^a-z0-9]+/g, '-')

export function prepareStorefrontProduct(input, persisted = true) {
  const product = normalizeProduct(input, persisted)
  const { aiMetadata: _privateAiMetadata, ai_metadata: _privateAiMetadataRow, ...publicProduct } = product
  const publicMedia = (product.media || []).map(item => {
    const { bridge: _privateBridgeMetadata, ...media } = item || {}
    return media
  })
  const variants = (product.variants || []).filter(variant => variant.status === 'ACTIVE')
  const prices = variants.map(variant => Number(variant.price)).filter(Number.isFinite)
  const comparePrices = variants.map(variant => variant.compareAt).filter(value => value != null).map(Number).filter(Number.isFinite)
  const primaryMedia = publicMedia.find(item => item.type === 'IMAGE' && item.url === product.image)
    || publicMedia.find(item => item.type === 'IMAGE')

  return {
    ...publicProduct,
    media: publicMedia,
    handle: product.handle || product.id,
    image: product.image || primaryMedia?.url || '',
    alt: primaryMedia?.alt || product.alt || `${product.title || product.name} product image`,
    meta: product.meta || [product.productGroup, product.type, product.color].filter(Boolean).join(' · '),
    price: prices.length ? Math.min(...prices) : Number(product.price || 0),
    compareAt: product.compareAt ?? (comparePrices.length ? Math.min(...comparePrices) : null),
    inventory: variants.reduce((sum, variant) => sum + Number(variant.inventory || 0), 0),
    variants,
    rating: Number(product.rating || 0),
    reviews: Number(product.reviews || 0)
  }
}

export function buildFallbackCatalog(rows = []) {
  return rows.map((row, productIndex) => {
    const color = row.color || 'Black'
    const options = [
      { id:`${row.id}-option-size`, name:'Size', values:FALLBACK_SIZES },
      { id:`${row.id}-option-colour`, name:'Colour', values:[color] }
    ]
    const variants = FALLBACK_SIZES.map((size, sizeIndex) => ({
      id:`${row.id}-${optionSlug(size)}-${optionSlug(color)}`,
      product_id:row.id,
      sku:`ET-${String(productIndex + 1).padStart(3, '0')}-${size}-${color.slice(0,3).toUpperCase()}`,
      values:{ Size:size, Colour:color },
      price:Number(row.price || 0),
      compareAt:row.compareAt ?? null,
      inventory:Math.max(1, 12 - sizeIndex),
      status:'ACTIVE'
    }))
    return prepareStorefrontProduct({
      ...row,
      handle:row.handle || row.id,
      title:row.title || row.name,
      subtitle:row.subtitle || row.story || '',
      description:row.description || row.story || '',
      status:'PUBLISHED',
      type:row.type || (row.customFields?.length ? 'PERSONALIZED' : 'READY TO SHIP'),
      product_group:row.productGroup || 'Memory jerseys',
      custom_fields:row.customFields || [],
      media:row.media?.length ? row.media : [{ id:`${row.id}-primary`, type:'IMAGE', url:row.image, alt:row.alt || '' }],
      content_blocks:row.contentBlocks || [],
      seo:row.seo || { title:`${row.name} — Extra Time`, description:row.story || '' },
      options,
      variants
    }, false)
  })
}

export function findStorefrontProduct(products, value) {
  return products.find(product => product.handle === value || product.id === value)
}

export function isSellableVariant(variant) {
  return Boolean(variant && variant.status === 'ACTIVE' && Number(variant.inventory || 0) > 0 && Number.isFinite(Number(variant.price)))
}

export function sellableVariants(product) {
  return (product?.variants || []).filter(isSellableVariant)
}

export function reconcileCart(cart = [], products = []) {
  const productMap = new Map(products.map(product => [product.id, product]))
  const items = []
  const issues = []
  for (const item of Array.isArray(cart) ? cart : []) {
    const product = productMap.get(item?.product?.id)
    if (!product) {
      issues.push({ key:item?.key || '', code:'PRODUCT_UNAVAILABLE', message:`${item?.product?.name || 'A product'} is no longer available and was removed.` })
      continue
    }
    const variant = (product.variants || []).find(row => row.id === item.variantId)
    if (!isSellableVariant(variant)) {
      issues.push({ key:item?.key || '', code:'VARIANT_UNAVAILABLE', message:`${product.name} · ${item.sku || 'variation'} is no longer available and was removed.` })
      continue
    }
    const requestedQty = Math.max(1, Math.trunc(Number(item.qty || 1)))
    const qty = Math.min(requestedQty, Number(variant.inventory))
    if (qty !== requestedQty) issues.push({ key:item?.key || '', code:'QTY_CLAMPED', message:`${product.name} quantity was reduced to ${qty} to match live stock.` })
    items.push({
      ...item,
      qty,
      sku:variant.sku,
      options:variant.values || item.options || {},
      unitPrice:Number(variant.price),
      product:{ ...item.product, id:product.id, handle:product.handle, name:product.name, alt:product.alt, image:item.customization?.aiPreviewUrl || product.image, price:product.price }
    })
  }
  return { items, issues }
}

export function sortCollectionProducts(products = [], collection = null, override = '') {
  if (!collection) return [...products]
  const links = Array.isArray(collection.productLinks) ? collection.productLinks : (collection.products || []).map((productId, index) => ({ productId, sortOrder:index, featured:index === 0 }))
  const linkMap = new Map(links.map(link => [link.productId, link]))
  const rows = products.filter(product => linkMap.has(product.id))
  const mode = String(override || collection.sort || 'MANUAL').toUpperCase().replace(/\s+/g, '_')
  return [...rows].sort((a,b) => {
    const aLink = linkMap.get(a.id) || {}
    const bLink = linkMap.get(b.id) || {}
    if (mode === 'FEATURED' || mode === 'FEATURED_FIRST') return Number(Boolean(bLink.featured)) - Number(Boolean(aLink.featured)) || Number(aLink.sortOrder || 0) - Number(bLink.sortOrder || 0)
    if (mode === 'NEWEST') return String(b.updatedAt || '').localeCompare(String(a.updatedAt || ''))
    if (mode === 'LOW_STOCK') return Number(a.inventory || 0) - Number(b.inventory || 0)
    // Best-selling requires order analytics. Keep the explicit merchandising
    // order until that aggregate exists instead of pretending recency is sales.
    return Number(aLink.sortOrder || 0) - Number(bLink.sortOrder || 0)
  })
}

export function normalizeMenuLocation(value) {
  const normalized=String(value || '').trim().toUpperCase().replace(/\s*\/\s*/g, '_').replace(/[^A-Z0-9]+/g, '_').replace(/^_|_$/g, '')
  if(normalized === 'HEADER' || normalized.startsWith('HEADER_'))return 'HEADER'
  if(normalized === 'FOOTER')return 'FOOTER'
  if(normalized.includes('FIXED_FOOTER') || normalized === 'FIXEDFOOTERMOBILE')return 'FIXED_FOOTER_MOBILE'
  if(normalized.includes('MOBILE_DRAWER'))return 'MOBILE_DRAWER'
  return normalized
}

export function menuAtLocation(menus = [], location) {
  const wanted = normalizeMenuLocation(location)
  return menus.find(menu => normalizeMenuLocation(menu.location) === wanted)
}

export const STOREFRONT_STATIC_ROUTES = new Set(['/', '/shop', '/collection', '/custom', '/studio', '/membership', '/account/membership', '/vault', '/privacy', '/terms', '/accessibility', '/shipping', '/returns', '/journal', '/moments', '/players'])

export function menuTargetProblem(target, type = 'PAGE') {
  const value = String(target || '').trim()
  if (!value) return 'Enter a destination.'
  if (String(type).toUpperCase() === 'EXTERNAL') {
    return /^https:\/\//i.test(value) ? '' : 'External links must use HTTPS.'
  }
  if (value === '#bag' || value.startsWith('/#') || value.startsWith('/product/') || value.startsWith('/collection/')) return ''
  const path = value.split(/[?#]/)[0]
  return STOREFRONT_STATIC_ROUTES.has(path) ? '' : 'This route is not published by the storefront.'
}

export function storefrontOptionValues(product, optionName) {
  const option = (product.options || []).find(item => item.name.toLowerCase() === String(optionName).toLowerCase())
  if (option?.values?.length) return option.values
  return [...new Set((product.variants || []).map(variant => Object.entries(variant.values || {}).find(([key]) => key.toLowerCase() === String(optionName).toLowerCase())?.[1]).filter(Boolean))]
}

export function optionNameLike(product, patterns) {
  const lowered = patterns.map(value => value.toLowerCase())
  return (product.options || []).find(option => lowered.includes(option.name.toLowerCase()))?.name || null
}

export function resolveVariant(product, selections = {}) {
  const active = (product.variants || []).filter(variant => variant.status === 'ACTIVE')
  return active.find(variant => Object.entries(variant.values || {}).every(([name, value]) => !selections[name] || selections[name] === value)) || null
}

export function availableOptionValue(product, optionName, value, selections = {}) {
  return (product.variants || []).some(variant => variant.status === 'ACTIVE' && Number(variant.inventory || 0) > 0 && Object.entries(variant.values || {}).every(([name, variantValue]) => {
    if (name === optionName) return variantValue === value
    return !selections[name] || selections[name] === variantValue
  }))
}

export function initialSelections(product, saved = {}) {
  const selections = {}
  for (const option of product.options || []) {
    if (saved[option.name] && option.values.includes(saved[option.name])) selections[option.name] = saved[option.name]
  }
  return selections
}

export function cartLineKey(item) {
  return [item.product.id, item.variantId || '', JSON.stringify(item.options || {}), item.customization?.requestId || ''].join('|')
}
