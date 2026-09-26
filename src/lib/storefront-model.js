import { normalizeProduct } from './catalog-model.js'

import { normalizeCatalogTaxonomy } from './league-taxonomy.js'
import { resolveCollectionArtwork } from './collection-artwork.js'

const FALLBACK_SIZES = ['XS', 'S', 'M', 'L', 'XL', 'XXL']

const optionSlug = value => String(value || '').trim().toLowerCase().replace(/[^a-z0-9]+/g, '-')

export function isHeadwearProduct(product = {}) {
  const group = String(product.productGroup || product.product_group || '').trim()
  if (/^(?:caps?|hats?|knit hats?|beanies?|headwear|visors?)$/i.test(group)) return true
  const category = String(product.taxonomy?.category || '').trim()
  const title = String(product.title || product.name || '').trim()
  return category === 'Accessories' && /\b(?:cap|hat|beanie|snapback|headwear|visor)\b/i.test(title)
}

export function prepareStorefrontProduct(input, persisted = true) {
  const product = normalizeProduct(input, persisted)
  const { aiMetadata: _privateAiMetadata, ai_metadata: _privateAiMetadataRow, ...publicProduct } = product
  const publicMedia = (product.media || []).map(item => {
    const { bridge: _privateBridgeMetadata, ...media } = item || {}
    return media
  })
  const variants = (product.variants || []).filter(variant => variant.status === 'ACTIVE').map(variant => ({
    ...variant,
    // Reserved units are not sellable even though the raw Supabase inventory
    // column still contains them. Keep the public model aligned with checkout.
    inventory: Math.max(0, Number(variant.inventory || 0) - Number(variant.reserved_inventory || 0))
  }))
  const prices = variants.map(variant => Number(variant.price)).filter(Number.isFinite)
  const comparePrices = variants.map(variant => variant.compareAt).filter(value => value != null).map(Number).filter(Number.isFinite)
  const primaryMedia = publicMedia.find(item => item.type === 'IMAGE' && item.url === product.image)
    || publicMedia.find(item => item.type === 'IMAGE')

  const normalizedTaxonomy = normalizeCatalogTaxonomy({ ...publicProduct, taxonomy:publicProduct.taxonomy, productGroup:publicProduct.productGroup })
  const normalizedGroup = normalizedTaxonomy.productGroup || publicProduct.productGroup
  return {
    ...publicProduct,
    productGroup: normalizedGroup,
    taxonomy: normalizedTaxonomy,
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

// Menu media is deliberately resolved at runtime instead of storing a copied
// product/collection image on the menu row. That keeps a navigation thumbnail
// in sync when the linked listing changes its hero image. Admin overrides are
// still persisted as imageMode/imageUrl/imageAlt and win over this resolver.
export const MENU_IMAGE_MODES = new Set(['AUTO', 'CUSTOM', 'NONE'])

const MENU_PAGE_IMAGE_FALLBACKS = {
  '/': '/assets/hero-tunnel.webp',
  '/shop': '/assets/hero-tunnel.webp',
  '/collection': '/assets/hero-tunnel.webp',
  '/custom': '/assets/jersey-white.webp',
  '/studio': '/assets/jersey-white.webp',
  '/membership': '/assets/jersey-white.webp',
  '/vault': '/assets/jersey-oxblood.webp',
  '/moments': '/assets/editorial-player.webp',
  '/players': '/assets/editorial-player.webp',
  '/shipping': '/assets/hero-tunnel.webp',
  '/returns': '/assets/hero-tunnel.webp',
  '/warranty': '/assets/jersey-black.webp',
  '/journal': '/assets/editorial-player.webp'
}

const menuPath = target => {
  const value = String(target || '').trim()
  if (!value || value === '#bag') return ''
  try {
    return new URL(value, 'https://extra-time.local').pathname || '/'
  } catch {
    return value.split(/[?#]/)[0] || '/'
  }
}

const menuQuery = target => {
  try { return new URL(String(target || ''), 'https://extra-time.local').searchParams } catch { return new URLSearchParams() }
}

const rowImage = row => row?.image || row?.hero || row?.hero_image || row?.representativeImage || row?.representative_image || row?.cover || row?.cover_image || row?.seo?.image || row?.seo?.ogImage || (row?.media || []).find(item => item?.type === 'IMAGE' && item?.url)?.url || ''

const rowAlt = row => row?.alt || row?.image_alt || row?.representativeAlt || row?.representative_alt || row?.seo?.title || row?.title || row?.name || ''

const normalizeMenuImageFields = item => {
  const settings = item?.settings && typeof item.settings === 'object' ? item.settings : {}
  const rawMode = item?.imageMode ?? item?.image_mode ?? settings.imageMode ?? settings.image_mode ?? 'AUTO'
  const imageMode = MENU_IMAGE_MODES.has(String(rawMode).toUpperCase()) ? String(rawMode).toUpperCase() : 'AUTO'
  return {
    imageMode,
    imageUrl: String(item?.imageUrl ?? item?.image_url ?? settings.imageUrl ?? settings.image_url ?? '').trim(),
    imageAlt: String(item?.imageAlt ?? item?.image_alt ?? settings.imageAlt ?? settings.image_alt ?? '').trim()
  }
}

/**
 * Convert a flat Supabase menu item result into a deterministic tree. The
 * same function is used by Admin and storefront so nesting/order cannot drift
 * between the two experiences.
 */
export function buildMenuTree(rows = []) {
  const flat = Array.isArray(rows) ? rows : []
  const hasParentColumns = flat.some(row => row && (row.parent_id != null || row.parentId != null))
  if (!hasParentColumns) {
    const normalize = (item, index = 0) => ({
      ...item,
      type: String(item?.type || item?.link_type || 'PAGE').toUpperCase(),
      target: item?.target || '/',
      sortOrder: Number(item?.sortOrder ?? item?.sort_order ?? index),
      ...normalizeMenuImageFields(item),
      children: (item?.children || []).map(normalize)
    })
    return flat.map(normalize)
  }
  const byParent = new Map()
  flat.forEach((row, index) => {
    const parent = row?.parent_id ?? row?.parentId ?? null
    const list = byParent.get(parent) || []
    list.push({ row, index })
    byParent.set(parent, list)
  })
  const visit = (parentId, ancestry = []) => (byParent.get(parentId) || [])
    .sort((a, b) => Number(a.row.sort_order ?? a.row.sortOrder ?? a.index) - Number(b.row.sort_order ?? b.row.sortOrder ?? b.index))
    .map(({ row, index }) => {
      const id = String(row?.id || `menu-item-${index}`)
      if (ancestry.includes(id)) return null
      return {
        ...row,
        id,
        type: String(row?.type || row?.link_type || 'PAGE').toUpperCase(),
        target: row?.target || '/',
        sortOrder: Number(row?.sortOrder ?? row?.sort_order ?? index),
        ...normalizeMenuImageFields(row),
        children: visit(id, [...ancestry, id])
      }
    }).filter(Boolean)
  return visit(null)
}

const flattenMenuItems = (items, output = []) => {
  ;(items || []).forEach(item => {
    output.push(item)
    flattenMenuItems(item.children, output)
  })
  return output
}

export function menuImageProblem(item = {}) {
  const { imageMode, imageUrl } = normalizeMenuImageFields(item)
  if (imageMode !== 'CUSTOM') return ''
  if (!imageUrl) return 'Add an image URL or switch to Auto.'
  if (!/^https:\/\//i.test(imageUrl) && !/^\//.test(imageUrl)) return 'Use an HTTPS URL or a local /assets path.'
  return ''
}

/**
 * Attach representativeImage metadata to every menu item. `context` is kept
 * optional so the same resolver works with the local preview catalogue.
 */
export function resolveMenuImages(menus = [], context = {}) {
  const products = Array.isArray(context.products) ? context.products : []
  const collections = Array.isArray(context.collections) ? context.collections : []
  const pages = Array.isArray(context.pages) ? context.pages : []
  const pageFallbacks = { ...MENU_PAGE_IMAGE_FALLBACKS, ...(context.pageFallbacks || {}) }
  const productForTarget = (target, type) => {
    const path = menuPath(target)
    const handle = path.startsWith('/product/') ? decodeURIComponent(path.split('/')[2] || '') : String(target || '').replace(/^product:/i, '')
    if (String(type).toUpperCase() !== 'PRODUCT' && !handle) return null
    return products.find(row => row.handle === handle || row.id === handle) || (String(type).toUpperCase() === 'PRODUCT' ? products[0] : null)
  }
  const collectionForTarget = (target, type) => {
    const path = menuPath(target)
    const query = menuQuery(target)
    const collectionPath = path.startsWith('/collection/') || path.startsWith('/collections/')
    const handle = collectionPath ? decodeURIComponent(path.split('/')[2] || '') : query.get('collection') || String(target || '').replace(/^collection:/i, '')
    const explicit = collectionPath || query.has('collection') || /^collection:/i.test(String(target || ''))
    if (path === '/shop' || path === '/collection') return collections[0] || null
    if (String(type).toUpperCase() === 'COLLECTION' || explicit) return collections.find(row => row.handle === handle || row.id === handle) || (handle ? { handle, name:handle } : null)
    return null
  }
  const explicitCollectionTarget = (target, type) => {
    const path = menuPath(target)
    const query = menuQuery(target)
    return String(type).toUpperCase() === 'COLLECTION' || path.startsWith('/collection/') || path.startsWith('/collections/') || query.has('collection') || /^collection:/i.test(String(target || ''))
  }
  const pageForTarget = target => {
    const path = menuPath(target)
    return pages.find(page => page.path === path || (page.path?.includes(':') && path.startsWith(page.path.split('/:')[0] + '/'))) || null
  }
  const resolveItem = item => {
    const fields = normalizeMenuImageFields(item)
    let image = ''
    let alt = fields.imageAlt || item?.label || 'Navigation image'
    let source = fields.imageMode
    let representativeIcon = ''
    if (fields.imageMode === 'CUSTOM') {
      image = fields.imageUrl
      source = image ? 'CUSTOM' : 'MISSING'
    } else if (fields.imageMode === 'AUTO') {
      const type = String(item?.type || item?.link_type || 'PAGE').toUpperCase()
      const product = productForTarget(item?.target, type)
      const collection = collectionForTarget(item?.target, type)
      const page = pageForTarget(item?.target)
      const isCollectionTarget = explicitCollectionTarget(item?.target, type)
      if (product) {
        image = rowImage(product)
        alt = fields.imageAlt || rowAlt(product) || item?.label || alt
        source = image ? 'PRODUCT' : 'MISSING'
      } else if (collection) {
        const artwork = resolveCollectionArtwork(collection, products)
        image = artwork.src
        representativeIcon = artwork.icon || ''
        alt = fields.imageAlt || artwork.alt || rowAlt(collection) || item?.label || alt
        source = artwork.source || (image ? 'COLLECTION' : 'MISSING')
      } else if (page) {
        image = rowImage(page)
        alt = fields.imageAlt || rowAlt(page) || item?.label || alt
        source = image ? 'PAGE' : 'MISSING'
      }
      // A missing collection cover is an actionable catalogue state. Do not
      // disguise it with a product image or a generic hero from another page.
      if (!image && !isCollectionTarget) {
        const path = menuPath(item?.target)
        image = pageFallbacks[path] || pageFallbacks['/'] || ''
        source = image ? 'FALLBACK' : 'MISSING'
      }
    } else {
      source = 'NONE'
    }
    return {
      ...item,
      ...fields,
      representativeImage: image || null,
      representativeAlt: alt,
      representativeSource: source,
      representativeIcon,
      children: (item?.children || []).map(resolveItem)
    }
  }
  return (Array.isArray(menus) ? menus : []).map(menu => ({ ...menu, items: (menu.items || []).map(resolveItem) }))
}

export function flattenMenuTree(items = []) {
  return flattenMenuItems(items)
}

export const STOREFRONT_STATIC_ROUTES = new Set(['/', '/shop', '/collection', '/about', '/custom', '/studio', '/membership', '/account/membership', '/checkout', '/track-order', '/vault', '/privacy', '/terms', '/accessibility', '/shipping', '/returns', '/warranty', '/journal', '/moments', '/players'])

export function menuTargetProblem(target, type = 'PAGE') {
  const value = String(target || '').trim()
  if (!value) return 'Enter a destination.'
  if (String(type).toUpperCase() === 'EXTERNAL') {
    return /^https:\/\//i.test(value) ? '' : 'External links must use HTTPS.'
  }
  if (value === '#bag' || value.startsWith('/#') || value.startsWith('/product/') || value.startsWith('/collection/') || value.startsWith('/collections/') || value.startsWith('/league/') || value.startsWith('/team/')) return ''
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
