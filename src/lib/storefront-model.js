import { normalizeProduct } from './catalog-model.js'

const FALLBACK_SIZES = ['XS', 'S', 'M', 'L', 'XL', 'XXL']

const optionSlug = value => String(value || '').trim().toLowerCase().replace(/[^a-z0-9]+/g, '-')

export function prepareStorefrontProduct(input, persisted = true) {
  const product = normalizeProduct(input, persisted)
  const variants = (product.variants || []).filter(variant => variant.status === 'ACTIVE')
  const prices = variants.map(variant => Number(variant.price)).filter(Number.isFinite)
  const comparePrices = variants.map(variant => variant.compareAt).filter(value => value != null).map(Number).filter(Number.isFinite)
  const primaryMedia = product.media.find(item => item.type === 'IMAGE' && item.url === product.image)
    || product.media.find(item => item.type === 'IMAGE')

  return {
    ...product,
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
