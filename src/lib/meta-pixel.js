/**
 * Meta / Facebook Pixel Tracking & Catalog Synchronization Helper
 * Conforms to Meta Business standard e-commerce events and Dynamic Product Ads (DPA) requirements.
 */

const STORAGE_KEY = 'jersevo_fb_pixel_id'
export const DEFAULT_PIXEL_ID = '1684842090311448'

export function getMetaPixelId() {
  if (typeof window === 'undefined') return ''
  return (
    window.__EXTRA_TIME_PIXEL_ID__ ||
    localStorage.getItem(STORAGE_KEY) ||
    (typeof import.meta !== 'undefined' && import.meta.env?.VITE_FACEBOOK_PIXEL_ID) ||
    DEFAULT_PIXEL_ID ||
    ''
  ).trim()
}

export function setMetaPixelId(pixelId) {
  if (typeof window === 'undefined') return
  const cleanId = String(pixelId || '').trim()
  if (cleanId) {
    localStorage.setItem(STORAGE_KEY, cleanId)
    window.__EXTRA_TIME_PIXEL_ID__ = cleanId
    initMetaPixel(cleanId)
  } else {
    localStorage.removeItem(STORAGE_KEY)
    delete window.__EXTRA_TIME_PIXEL_ID__
  }
}

/**
 * Initializes Meta Pixel snippet asynchronously and safely.
 */
export function initMetaPixel(customPixelId, advancedMatching = {}) {
  if (typeof window === 'undefined') return false

  const pixelId = (customPixelId || getMetaPixelId()).trim()

  if (window.fbq) {
    if (pixelId && !window.__EXTRA_TIME_PIXEL_INITIALIZED_IDS__?.has(pixelId)) {
      window.fbq('init', pixelId, advancedMatching)
      window.__EXTRA_TIME_PIXEL_INITIALIZED_IDS__ = window.__EXTRA_TIME_PIXEL_INITIALIZED_IDS__ || new Set()
      window.__EXTRA_TIME_PIXEL_INITIALIZED_IDS__.add(pixelId)
    }
    return true
  }

  // Official Meta Pixel loader
  /* eslint-disable */
  !(function(f, b, e, v, n, t, s) {
    if (f.fbq) return
    n = f.fbq = function() {
      n.callMethod ? n.callMethod.apply(n, arguments) : n.queue.push(arguments)
    }
    if (!f._fbq) f._fbq = n
    n.push = n
    n.loaded = !0
    n.version = '2.0'
    n.queue = []
    t = b.createElement(e)
    t.async = !0
    t.src = v
    s = b.getElementsByTagName(e)[0]
    if (s && s.parentNode) s.parentNode.insertBefore(t, s)
  })(window, document, 'script', 'https://connect.facebook.net/en_US/fbevents.js')
  /* eslint-enable */

  window.__EXTRA_TIME_PIXEL_INITIALIZED_IDS__ = new Set()
  if (pixelId) {
    window.fbq('init', pixelId, advancedMatching)
    window.__EXTRA_TIME_PIXEL_INITIALIZED_IDS__.add(pixelId)
  }

  return true
}

/**
 * Dispatches an event to Meta Pixel, or logs to console when no active Pixel ID exists.
 */
export function emitFbEvent(eventName, params = {}, isCustom = false) {
  const pixelId = getMetaPixelId()
  const hasFbq = typeof window !== 'undefined' && typeof window.fbq === 'function'

  if (hasFbq && pixelId) {
    try {
      window.fbq(isCustom ? 'trackCustom' : 'track', eventName, params)
    } catch (err) {
      console.warn('[Meta Pixel Warning] Failed to emit event:', eventName, err)
    }
  } else if (typeof window !== 'undefined' && (window.location.hostname === 'localhost' || !pixelId)) {
    // Helpful developer / test-mode diagnostic
    console.debug(`[Meta Pixel ${isCustom ? 'Custom' : 'Standard'} Event]`, eventName, params)
  }

  return { eventName, params, isCustom, pixelId }
}

/**
 * Standard Events
 */

let isInitialPageView = true

export function trackPageView(path = '') {
  if (typeof window !== 'undefined' && isInitialPageView) {
    isInitialPageView = false
    return { eventName: 'PageView', params: path ? { page_path: path } : {}, isInitial: true, pixelId: getMetaPixelId() }
  }
  return emitFbEvent('PageView', path ? { page_path: path } : {})
}

export function trackViewContent(product, variant = null) {
  if (!product) return null
  const price = Number(variant?.price ?? product?.price ?? 0)
  const contentIds = [product.id, variant?.sku, variant?.id, product.handle].filter(Boolean)
  const category = product.taxonomy?.league || product.taxonomy?.team || product.productGroup || 'Jerseys'

  return emitFbEvent('ViewContent', {
    content_name: product.title || product.name || 'Personalized Jersey',
    content_ids: contentIds,
    content_type: 'product',
    value: price,
    currency: 'USD',
    content_category: category
  })
}

export function trackAddToCart(line) {
  if (!line || !line.product) return null
  const unitPrice = Number(line.unitPrice ?? line.product.price ?? 0)
  const qty = Number(line.qty || 1)
  const contentIds = [line.product.id, line.sku, line.variantId, line.product.handle].filter(Boolean)

  return emitFbEvent('AddToCart', {
    content_name: line.product.name || 'Personalized Jersey',
    content_ids: contentIds,
    content_type: 'product',
    value: Math.round(unitPrice * qty * 100) / 100,
    currency: 'USD'
  })
}

export function trackCustomizeProduct(product, customization = {}) {
  if (!product) return null
  const price = Number(product.price || 0)

  return emitFbEvent('CustomizeProduct', {
    content_name: product.title || product.name || 'Custom Jersey',
    content_category: 'Personalized Jersey',
    content_ids: [product.id, product.handle].filter(Boolean),
    value: price,
    currency: 'USD',
    custom_name: customization.name || '',
    custom_number: customization.number || ''
  })
}

export function trackInitiateCheckout(cart = [], totalValue = 0) {
  if (!Array.isArray(cart) || !cart.length) return null
  const contentIds = cart.map(item => item?.product?.id).filter(Boolean)
  const contents = cart.map(item => ({
    id: item?.product?.id || item?.sku,
    quantity: Number(item?.qty || 1),
    item_price: Number(item?.unitPrice || item?.product?.price || 0)
  }))
  const numItems = cart.reduce((sum, item) => sum + Number(item?.qty || 1), 0)

  return emitFbEvent('InitiateCheckout', {
    content_ids: contentIds,
    contents,
    num_items: numItems,
    value: Number(totalValue || 0),
    currency: 'USD'
  })
}

export function trackAddPaymentInfo() {
  return emitFbEvent('AddPaymentInfo', {
    currency: 'USD'
  })
}

export function trackPurchase(order = {}) {
  const value = Number(order.value || order.total || 0)
  const orderId = String(order.order_id || order.orderNumber || order.publicId || '')
  const rawContents = Array.isArray(order.contents) ? order.contents : Array.isArray(order.items) ? order.items : []
  const contentIds = rawContents.map(i => i.id || i.product?.id || i.sku).filter(Boolean)
  const contents = rawContents.map(i => ({
    id: i.id || i.product?.id || i.sku,
    quantity: Number(i.quantity || i.qty || 1),
    item_price: Number(i.item_price || i.unitPrice || i.price || 0)
  }))

  return emitFbEvent('Purchase', {
    content_ids: contentIds.length ? contentIds : (order.content_ids || []),
    contents: contents.length ? contents : undefined,
    value,
    currency: 'USD',
    num_items: Number(order.num_items || rawContents.length || 1),
    order_id: orderId
  })
}

export function trackSearch(query = '') {
  const clean = String(query || '').trim()
  if (!clean) return null
  return emitFbEvent('Search', {
    search_string: clean,
    content_category: 'Jersey Search'
  })
}

export function trackLead(email = '') {
  return emitFbEvent('Lead', {
    content_name: 'Newsletter Subscription',
    currency: 'USD',
    value: 0
  })
}
